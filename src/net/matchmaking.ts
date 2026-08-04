// ---------------------------------------------------------------------------
// 빠른 대전(랜덤 매칭). 코드 입력 없이 대기열(gridbrawl-mm)에서 상대를 찾는다.
//
// 알고리즘 (서버리스, RTDB REST만 사용):
//   1) 대기열을 스캔해 살아있는(심장박동 45초 이내) 대기표를 오래된 순으로 선점
//      시도 — 선점은 REST ETag CAS(`lock` 필드)로 원자적, 두 명이 같은 대기표를
//      잡는 일이 없다. 성공하면 게스트로 answer를 쓰고 P2P 연결.
//   2) 잡을 대기표가 없으면 내 대기표(offer)를 걸고 answer를 폴링(호스트).
//      기다리는 동안에도 주기적으로 재스캔해 "나보다 먼저 온" 대기표가 보이면
//      그쪽 게스트로 전환 — 둘이 동시에 큐를 눌러 서로 기다리는 교착을 푼다.
//      (엄격한 나이순 선점이라 서로를 동시에 잡는 역교착은 불가능.)
//   3) 연결 시도는 12초 타임아웃 — 상대가 이미 떠났으면 다음 후보로.
// 스테일 청소: 스캔 중 5분 넘은 대기표는 지워준다(best-effort).
// ---------------------------------------------------------------------------
import { RULES_VERSION } from '../battle/types'
import { acceptAnswer, createAnswer, createOffer } from './webrtc'
import type { NetTransport } from './protocol'
import { dbDelete, dbGet, dbPut, firebaseConfigured, randomCode, refUrl, wait } from './firebase'

const ROOT = 'gridbrawl-mm'
const ALIVE_MS = 45_000 // 심장박동이 이 안에 있어야 살아있는 대기표
const HEARTBEAT_MS = 20_000
const POLL_MS = 1_200 // 내 대기표의 answer 폴링 간격
const RESCAN_MS = 4_000 // 대기 중 재스캔 간격
const CONNECT_TIMEOUT_MS = 12_000
const STALE_MS = 5 * 60_000 // 이보다 오래된 대기표는 청소

interface Entry {
  offer?: RTCSessionDescriptionInit
  answer?: RTCSessionDescriptionInit
  createdAt?: number
  aliveAt?: number
  lock?: string
  /** 대기자의 룰셋 버전. 다르면 붙여 봐야 desync라 스캔에서 거른다. */
  rules?: number
}

const SV_NOW = { '.sv': 'timestamp' } // RTDB 서버 시각 (클라이언트 시계 무관)

/** ETag CAS: 값이 비어 있을 때만 원자적으로 쓴다. 경쟁에서 지면 false. */
async function casPutIfAbsent(path: string, data: unknown): Promise<boolean> {
  try {
    const url = refUrl(path)
    const res = await fetch(url, { headers: { 'X-Firebase-ETag': 'true' } })
    if (!res.ok) return false
    const etag = res.headers.get('ETag')
    if (!etag || (await res.json()) !== null) return false // 이미 선점됨
    const put = await fetch(url, {
      method: 'PUT',
      headers: { 'if-match': etag },
      body: JSON.stringify(data),
    })
    return put.ok // 412 = 경쟁 패배
  } catch {
    return false
  }
}

/** 연결 대기에 타임아웃을 건다. 타임아웃 시 null. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, wait(ms).then(() => null)])
}

export interface QuickMatchTicket {
  /** 매칭이 성사되면 전송·역할로 resolve. cancel() 하면 영원히 pending. */
  matched: Promise<{ transport: NetTransport; role: 'host' | 'guest' }>
  cancel(): void
}

export function startQuickMatch(): QuickMatchTicket {
  if (!firebaseConfigured()) throw new Error('온라인 대전이 설정되지 않았습니다.')

  let stopped = false
  const myLock = `mm-${randomCode(8)}`
  // 내 대기표(호스트) 상태
  let myId: string | null = null
  let myPc: RTCPeerConnection | null = null
  let myReady: Promise<NetTransport> | null = null
  let myCreatedAt = 0 // 나이순 비교용(서버 시각)

  const dropMine = () => {
    if (myId) dbDelete(`${ROOT}/${myId}`)
    myId = null
    try {
      myPc?.close()
    } catch {
      /* ignore */
    }
    myPc = null
    myReady = null
  }

  /** 후보 대기표를 선점해 게스트로 연결 시도. 성공 시 transport. */
  const tryClaim = async (id: string, e: Entry): Promise<NetTransport | null> => {
    if (!e.offer) return null
    if (!(await casPutIfAbsent(`${ROOT}/${id}/lock`, myLock))) return null
    const { pc, localSdp, ready } = await createAnswer(e.offer)
    try {
      await dbPut(`${ROOT}/${id}/answer`, localSdp)
      const t = await withTimeout(ready, CONNECT_TIMEOUT_MS)
      if (t) return t
    } catch {
      /* 아래에서 정리 */
    }
    try {
      pc.close()
    } catch {
      /* ignore */
    }
    return null
  }

  /** 대기열 스캔: 살아있는·잠기지 않은 대기표를 오래된 순으로. 스테일은 청소. */
  const scan = async (): Promise<[string, Entry][]> => {
    const list = (await dbGet<Record<string, Entry>>(ROOT).catch(() => null)) ?? {}
    const now = Date.now()
    const out: [string, Entry][] = []
    for (const [id, e] of Object.entries(list)) {
      if (id === myId) continue
      const alive = e?.aliveAt ?? e?.createdAt ?? 0
      if (now - alive > STALE_MS) {
        dbDelete(`${ROOT}/${id}`) // 두고 간 대기표 청소 (서버·클라 시계 오차 감안해 넉넉히)
        continue
      }
      if (e?.rules !== RULES_VERSION) continue // 룰셋이 다른 빌드 — 핸드셰이크까지 갈 것도 없다
      if (!e?.offer || e.answer || e.lock) continue
      if (now - alive > ALIVE_MS) continue // 심장박동 끊김 — 청소는 아직, 선점만 회피
      // 내 대기표가 있으면 "나보다 엄격히 먼저 온" 것만 선점 (동시 큐 교착 해소, 역교착 방지)
      if (myId) {
        const older =
          (e.createdAt ?? 0) < myCreatedAt || ((e.createdAt ?? 0) === myCreatedAt && id < myId)
        if (!older) continue
      }
      out.push([id, e])
    }
    return out.sort((a, b) => (a[1].createdAt ?? 0) - (b[1].createdAt ?? 0))
  }

  const matched = (async (): Promise<{ transport: NetTransport; role: 'host' | 'guest' }> => {
    let lastBeat = 0
    let lastScan = 0
    while (!stopped) {
      // 1) 먼저 온 대기표 선점 시도 (게스트 경로)
      if (Date.now() - lastScan >= RESCAN_MS || !myId) {
        lastScan = Date.now()
        for (const [id, e] of await scan()) {
          if (stopped) break
          const t = await tryClaim(id, e)
          if (t) {
            dropMine()
            return { transport: t, role: 'guest' }
          }
        }
      }
      if (stopped) break

      // 2) 아무도 없으면 내 대기표를 건다 (호스트 경로)
      if (!myId) {
        const off = await createOffer()
        if (stopped) {
          off.pc.close()
          break
        }
        myPc = off.pc
        myReady = off.ready
        myId = randomCode(6)
        await dbPut(`${ROOT}/${myId}`, {
          offer: off.localSdp,
          rules: RULES_VERSION,
          createdAt: SV_NOW,
          aliveAt: SV_NOW,
        })
        myCreatedAt = (await dbGet<number>(`${ROOT}/${myId}/createdAt`).catch(() => null)) ?? Date.now()
        lastBeat = Date.now()
      }

      // 3) 내 answer 폴링 + 심장박동
      const ans = await dbGet<RTCSessionDescriptionInit>(`${ROOT}/${myId}/answer`).catch(() => null)
      if (ans && myPc && myReady) {
        await acceptAnswer(myPc, ans).catch(() => {})
        const t = await withTimeout(myReady, CONNECT_TIMEOUT_MS)
        if (t) {
          if (myId) dbDelete(`${ROOT}/${myId}`)
          myId = null
          return { transport: t, role: 'host' }
        }
        dropMine() // 게스트가 오다 말았음 — 대기표 새로 걸기
        continue
      }
      if (myId && Date.now() - lastBeat >= HEARTBEAT_MS) {
        lastBeat = Date.now()
        void dbPut(`${ROOT}/${myId}/aliveAt`, SV_NOW).catch(() => {})
      }
      await wait(POLL_MS)
    }
    // 취소됨 — 호출부는 이미 관심 없음
    return new Promise<never>(() => {})
  })()

  return {
    matched,
    cancel: () => {
      stopped = true
      dropMine()
    },
  }
}
