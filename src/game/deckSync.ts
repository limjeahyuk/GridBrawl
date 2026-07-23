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
    let decks = await cloudList(uid)
    decks = await migrateLocalOnce(uid, decks)
    writeDecks(decks, uid) // 오프라인 대비 캐시
    return decks
  } catch {
    return loadLocal(uid) // 네트워크 오류 — 캐시된 덱으로 계속 플레이
  }
}

/** 덱 저장(추가/수정). 로컬은 항상 갱신하고, 로그인 상태면 클라우드에도 올린다. */
export async function putDeck(deck: Deck): Promise<Deck[]> {
  const uid = scope()
  const decks = saveLocal(deck, uid)
  if (uid && DB) await cloudPut(uid, deck)
  return decks
}

export async function removeDeck(id: string): Promise<Deck[]> {
  const uid = scope()
  const decks = deleteLocal(id, uid)
  if (uid && DB) await cloudDelete(uid, id)
  return decks
}
