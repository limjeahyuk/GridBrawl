// ---------------------------------------------------------------------------
// 덱 저장소 — 계정별 클라우드 동기화.
//
//   구글 로그인 → Firebase RTDB `decks/<uid>` 가 원본(source of truth).
//                 localStorage(`gb-decks:<uid>`)는 오프라인 캐시로만 쓴다.
//   게스트/미설정 → localStorage(`gb-decks`) 로컬 전용.
//
// RTDB는 net/firebase.ts와 마찬가지로 REST로만 접근하고(SDK 의존 없음), 계정
// 경로 권한은 Auth ID 토큰(`?auth=`)으로 얻는다. 규칙은 database.rules.json.
// ---------------------------------------------------------------------------
import { getIdToken, subscribeAuth, type AuthUser } from '../net/auth'
import {
  deleteDeck as deleteLocal,
  loadDecks as loadLocal,
  saveDeck as saveLocal,
  writeDecks,
  type Deck,
} from './decks'

const DB = import.meta.env.VITE_FIREBASE_DB_URL?.replace(/\/$/, '')

let user: AuthUser | null = null
subscribeAuth((u) => {
  user = u
})

/** 지금 사용자가 클라우드에 저장할 수 있는가(로그인 계정 + DB 설정됨). */
export const cloudEnabled = (): boolean => !!DB && !!user && !user.guest
/** 현재 저장 스코프: 로그인 계정이면 uid, 아니면 null(로컬 전용). */
const scope = (): string | null => (user && !user.guest ? user.uid : null)

async function cloudUrl(path: string): Promise<string> {
  const token = await getIdToken()
  return `${DB}/${path}.json${token ? `?auth=${encodeURIComponent(token)}` : ''}`
}

async function cloudList(uid: string): Promise<Deck[]> {
  const res = await fetch(await cloudUrl(`decks/${uid}`))
  if (!res.ok) throw new Error(`덱 동기화 오류 (${res.status})`)
  const obj = (await res.json()) as Record<string, Deck> | null
  return obj ? Object.values(obj).filter((d) => d && typeof d.id === 'string') : []
}

async function cloudPut(uid: string, deck: Deck): Promise<void> {
  const res = await fetch(await cloudUrl(`decks/${uid}/${deck.id}`), {
    method: 'PUT',
    body: JSON.stringify(deck),
  })
  if (!res.ok) throw new Error(`덱 저장 오류 (${res.status})`)
}

async function cloudDelete(uid: string, id: string): Promise<void> {
  const res = await fetch(await cloudUrl(`decks/${uid}/${id}`), { method: 'DELETE' })
  if (!res.ok) throw new Error(`덱 삭제 오류 (${res.status})`)
}

// --- 오프라인 보류 큐 -------------------------------------------------------
// 비행기 모드·지하철에서 덱을 고쳐도 로컬 저장은 성공한다. 클라우드 반영만
// 실패할 뿐이라 그걸 삼켜 버리면 다음 접속 때 클라우드가 로컬을 되돌린다
// (listDecks가 캐시를 덮어쓰므로). 실패한 반영을 기억해 뒀다가 먼저 올린다.
const pendingKey = (uid: string) => `gb-decks-pending:${uid}`

interface Pending {
  put: string[] // 올려야 할 덱 id
  del: string[] // 지워야 할 덱 id
}

function readPending(uid: string): Pending {
  try {
    const raw = localStorage.getItem(pendingKey(uid))
    const p = raw ? (JSON.parse(raw) as Partial<Pending>) : null
    return { put: p?.put ?? [], del: p?.del ?? [] }
  } catch {
    return { put: [], del: [] }
  }
}

function writePending(uid: string, p: Pending): void {
  try {
    if (!p.put.length && !p.del.length) localStorage.removeItem(pendingKey(uid))
    else localStorage.setItem(pendingKey(uid), JSON.stringify(p))
  } catch {
    /* 저장소가 꽉 찼어도 게임은 계속돼야 한다 */
  }
}

/** 같은 덱의 저장·삭제는 마지막 것만 남는다(뒤에 온 쪽이 이긴다). */
function markPending(uid: string, kind: 'put' | 'del', id: string): void {
  const p = readPending(uid)
  const other = kind === 'put' ? 'del' : 'put'
  p[other] = p[other].filter((x) => x !== id)
  if (!p[kind].includes(id)) p[kind].push(id)
  writePending(uid, p)
}

/** 밀린 반영을 올린다. 하나라도 실패하면 남은 것은 큐에 그대로 두고 멈춘다. */
async function flushPending(uid: string): Promise<void> {
  const p = readPending(uid)
  if (!p.put.length && !p.del.length) return
  const local = loadLocal(uid)
  try {
    for (const id of [...p.del]) {
      await cloudDelete(uid, id)
      p.del = p.del.filter((x) => x !== id)
    }
    for (const id of [...p.put]) {
      const deck = local.find((d) => d.id === id)
      if (deck) await cloudPut(uid, deck)
      p.put = p.put.filter((x) => x !== id) // 로컬에도 없으면 올릴 게 없다 — 큐에서 뺀다
    }
  } finally {
    writePending(uid, p)
  }
}

/** 로그인 후 최초 1회: 이 기기에 있던 (게스트 시절) 덱을 계정으로 올려준다. */
const migratedKey = (uid: string) => `gb-decks-migrated:${uid}`

async function migrateLocalOnce(uid: string, cloud: Deck[]): Promise<Deck[]> {
  if (localStorage.getItem(migratedKey(uid))) return cloud
  const local = loadLocal(null) // 게스트/로컬 전용 슬롯
  const missing = local.filter((l) => !cloud.some((c) => c.id === l.id))
  for (const d of missing) await cloudPut(uid, d)
  localStorage.setItem(migratedKey(uid), '1')
  return [...cloud, ...missing]
}

/** 덱 목록. 로그인 상태면 클라우드에서 읽고 로컬에 캐시, 실패하면 캐시로 폴백. */
export async function listDecks(): Promise<Deck[]> {
  const uid = scope()
  if (!uid || !DB) return loadLocal(uid)
  try {
    await flushPending(uid) // ⚠ 읽기 전에 — 순서를 바꾸면 오프라인 편집이 되돌아간다
    let decks = await cloudList(uid)
    decks = await migrateLocalOnce(uid, decks)
    writeDecks(decks, uid) // 오프라인 대비 캐시
    return decks
  } catch {
    return loadLocal(uid) // 네트워크 오류 — 캐시된 덱으로 계속 플레이
  }
}

/** 덱 저장(추가/수정). 로컬은 항상 갱신하고, 로그인 상태면 클라우드에도 올린다.
 *  ⚠ 클라우드 실패로 던지지 않는다 — 로컬 저장은 이미 끝났고, 오프라인에서
 *  덱 편집이 막히면 안 된다. 반영은 보류 큐에 남겨 다음 접속 때 올린다. */
export async function putDeck(deck: Deck): Promise<Deck[]> {
  const uid = scope()
  const decks = saveLocal(deck, uid)
  if (uid && DB) {
    try {
      await cloudPut(uid, deck)
    } catch {
      markPending(uid, 'put', deck.id)
    }
  }
  return decks
}

export async function removeDeck(id: string): Promise<Deck[]> {
  const uid = scope()
  const decks = deleteLocal(id, uid)
  if (uid && DB) {
    try {
      await cloudDelete(uid, id)
    } catch {
      markPending(uid, 'del', id)
    }
  }
  return decks
}
