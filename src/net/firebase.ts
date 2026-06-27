// ---------------------------------------------------------------------------
// Short room-code signaling over Firebase Realtime Database (REST + polling —
// no SDK dependency). Firebase is used ONLY to swap the one-time WebRTC SDP so
// peers can find each other by a 6-char code; the actual game data flows P2P
// over the data channel (see net/webrtc.ts).
//
// Flow (data lives at  <db>/gridbrawl/<CODE>):
//   host  hostRoom()  → writes /offer, shows CODE, polls /answer
//   guest joinRoom(CODE) → reads /offer, writes /answer
//   host  reads /answer → connection opens, room is deleted.
//
// Setup: set VITE_FIREBASE_DB_URL (your RTDB URL) and allow read/write on the
// `gridbrawl` path. See .env.example / docs/GAME_DESIGN.md.
// ---------------------------------------------------------------------------
import { acceptAnswer, createAnswer, createOffer } from './webrtc'
import type { NetTransport } from './protocol'

const DB = import.meta.env.VITE_FIREBASE_DB_URL?.replace(/\/$/, '')

/** Is online play configured? (lobby disables it otherwise.) */
export const firebaseConfigured = (): boolean => !!DB

const ROOT = 'gridbrawl'
const refUrl = (path: string) => `${DB}/${path}.json`
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function dbGet<T>(path: string): Promise<T | null> {
  const res = await fetch(refUrl(path))
  if (!res.ok) throw new Error(`시그널링 서버 오류 (${res.status})`)
  return (await res.json()) as T | null
}
async function dbPut(path: string, data: unknown): Promise<void> {
  const res = await fetch(refUrl(path), { method: 'PUT', body: JSON.stringify(data) })
  if (!res.ok) throw new Error(`시그널링 서버 오류 (${res.status})`)
}
function dbDelete(path: string): void {
  // best-effort cleanup; ignore failures
  void fetch(refUrl(path), { method: 'DELETE' }).catch(() => {})
}

// unambiguous alphabet (no 0/O/1/I) for codes that are easy to read aloud
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const randomCode = (n = 6): string => {
  const a = new Uint32Array(n)
  crypto.getRandomValues(a)
  return Array.from(a, (x) => ALPHABET[x % ALPHABET.length]).join('')
}

export interface HostedRoom {
  code: string
  connected: Promise<NetTransport>
  cancel(): void
}

export async function hostRoom(): Promise<HostedRoom> {
  if (!DB) throw new Error('온라인 대전이 설정되지 않았습니다.')
  const { pc, localSdp, ready } = await createOffer()

  // pick a free code
  let code = randomCode()
  for (let i = 0; i < 5; i++) {
    if (!(await dbGet(`${ROOT}/${code}`))) break
    code = randomCode()
  }
  const path = `${ROOT}/${code}`
  await dbPut(`${path}/offer`, localSdp)

  let stopped = false
  const connected = (async () => {
    // poll for the guest's answer, then finish the WebRTC handshake
    while (!stopped) {
      const answer = await dbGet<RTCSessionDescriptionInit>(`${path}/answer`)
      if (answer) {
        await acceptAnswer(pc, answer)
        break
      }
      await wait(1200)
    }
    const transport = await ready
    dbDelete(path) // signaling done; the channel is P2P from here
    return transport
  })()

  return {
    code,
    connected,
    cancel: () => {
      stopped = true
      dbDelete(path)
      try {
        pc.close()
      } catch {
        /* ignore */
      }
    },
  }
}

export interface JoinedRoom {
  connected: Promise<NetTransport>
  cancel(): void
}

export async function joinRoom(rawCode: string): Promise<JoinedRoom> {
  if (!DB) throw new Error('온라인 대전이 설정되지 않았습니다.')
  const code = rawCode.trim().toUpperCase()
  const path = `${ROOT}/${code}`
  const offer = await dbGet<RTCSessionDescriptionInit>(`${path}/offer`)
  if (!offer) throw new Error('해당 코드의 방을 찾을 수 없습니다.')

  const { pc, localSdp, ready } = await createAnswer(offer)
  await dbPut(`${path}/answer`, localSdp)

  return {
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
