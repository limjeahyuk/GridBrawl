// ---------------------------------------------------------------------------
// WebRTC peer plumbing. The data channel is always direct P2P; only the tiny
// SDP handshake needs a rendezvous. Two signaling layers sit on top of these
// primitives:
//   • net/firebase.ts — short room codes (default), exchanges SDP via a DB.
//   • the copy-paste API below (createHost / joinAsGuest) — serverless
//     fallback, exchanges the full SDP as a base64 "invite code".
// A public STUN server is used so it works across most NATs; strictly symmetric
// NATs would need a TURN relay (a later upgrade).
// ---------------------------------------------------------------------------
import type { NetMessage, NetTransport } from './protocol'

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

/** Resolve once ICE gathering finishes, so the emitted SDP is self-contained
 *  (non-trickle: all candidates are embedded in the description). */
function gatherIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check)
      clearTimeout(timer)
      resolve()
    }
    const check = () => {
      if (pc.iceGatheringState === 'complete') done()
    }
    pc.addEventListener('icegatheringstatechange', check)
    // Host candidates alone work on LAN; don't hang forever if STUN stalls.
    const timer = setTimeout(done, 4000)
  })
}

/** Wrap an open data channel as a NetTransport. */
function wrap(pc: RTCPeerConnection, channel: RTCDataChannel): NetTransport {
  const msgCbs = new Set<(m: NetMessage) => void>()
  const closeCbs = new Set<() => void>()
  const pending: NetMessage[] = [] // messages received before anyone subscribed

  channel.onmessage = (e) => {
    let msg: NetMessage
    try {
      msg = JSON.parse(e.data)
    } catch {
      return
    }
    if (msgCbs.size === 0) pending.push(msg)
    else msgCbs.forEach((cb) => cb(msg))
  }

  let closed = false
  const fireClose = () => {
    if (closed) return
    closed = true
    closeCbs.forEach((cb) => cb())
  }
  channel.onclose = fireClose
  pc.addEventListener('connectionstatechange', () => {
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) fireClose()
  })

  return {
    send: (m) => {
      if (channel.readyState === 'open') channel.send(JSON.stringify(m))
    },
    onMessage: (cb) => {
      msgCbs.add(cb)
      if (pending.length) pending.splice(0).forEach((m) => cb(m))
      return () => msgCbs.delete(cb)
    },
    onClose: (cb) => {
      closeCbs.add(cb)
      return () => closeCbs.delete(cb)
    },
    isOpen: () => channel.readyState === 'open',
    close: () => {
      try {
        channel.close()
      } catch {
        /* ignore */
      }
      try {
        pc.close()
      } catch {
        /* ignore */
      }
    },
  }
}

const onceOpen = (pc: RTCPeerConnection, ch: RTCDataChannel): Promise<NetTransport> =>
  new Promise((resolve) => {
    if (ch.readyState === 'open') resolve(wrap(pc, ch))
    else ch.onopen = () => resolve(wrap(pc, ch))
  })

const plainSdp = (d: RTCSessionDescription | null): RTCSessionDescriptionInit => {
  if (!d) throw new Error('연결 정보를 생성하지 못했습니다.')
  return { type: d.type, sdp: d.sdp }
}

// --- low-level primitives (work with plain SDP objects, JSON-serializable) ---

export interface PeerSide {
  pc: RTCPeerConnection
  /** This side's local description, ready to hand to the other peer. */
  localSdp: RTCSessionDescriptionInit
  /** Resolves to the transport once the data channel opens. */
  ready: Promise<NetTransport>
}

/** Host side: create the data channel + offer, gather ICE. */
export async function createOffer(): Promise<PeerSide> {
  const pc = new RTCPeerConnection(RTC_CONFIG)
  const channel = pc.createDataChannel('grid', { ordered: true })
  const ready = onceOpen(pc, channel)
  await pc.setLocalDescription(await pc.createOffer())
  await gatherIce(pc)
  return { pc, localSdp: plainSdp(pc.localDescription), ready }
}

/** Guest side: take the host's offer, produce an answer, gather ICE. */
export async function createAnswer(remoteOffer: RTCSessionDescriptionInit): Promise<PeerSide> {
  const pc = new RTCPeerConnection(RTC_CONFIG)
  const ready = new Promise<NetTransport>((resolve) => {
    pc.ondatachannel = (e) => resolve(onceOpen(pc, e.channel))
  })
  await pc.setRemoteDescription(remoteOffer)
  await pc.setLocalDescription(await pc.createAnswer())
  await gatherIce(pc)
  return { pc, localSdp: plainSdp(pc.localDescription), ready }
}

/** Host side: apply the guest's answer to finish the handshake. */
export async function acceptAnswer(
  pc: RTCPeerConnection,
  remoteAnswer: RTCSessionDescriptionInit,
): Promise<void> {
  await pc.setRemoteDescription(remoteAnswer)
}

// --- serverless copy-paste API (base64 "invite code") -----------------------

const encode = (d: RTCSessionDescriptionInit): string => btoa(JSON.stringify(d))
const decode = (code: string): RTCSessionDescriptionInit => {
  const o = JSON.parse(atob(code.trim()))
  if (!o || (o.type !== 'offer' && o.type !== 'answer') || typeof o.sdp !== 'string')
    throw new Error('형식이 올바르지 않은 코드입니다.')
  return o
}

export interface HostHandshake {
  invite: string
  connect(reply: string): Promise<NetTransport>
  cancel(): void
}

export async function createHost(): Promise<HostHandshake> {
  const { pc, localSdp, ready } = await createOffer()
  return {
    invite: encode(localSdp),
    connect: async (reply) => {
      await acceptAnswer(pc, decode(reply))
      return ready
    },
    cancel: () => {
      try {
        pc.close()
      } catch {
        /* ignore */
      }
    },
  }
}

export interface GuestHandshake {
  reply: string
  connected: Promise<NetTransport>
  cancel(): void
}

export async function joinAsGuest(invite: string): Promise<GuestHandshake> {
  const { pc, localSdp, ready } = await createAnswer(decode(invite))
  return {
    reply: encode(localSdp),
    connected: ready,
    cancel: () => {
      try {
        pc.close()
      } catch {
        /* ignore */
      }
    },
  }
}
