// ---------------------------------------------------------------------------
// 덱 빌딩 — 전투 전에 7장을 골라 덱을 짠다. 모든 덱은 고정 카드(FIXED_CARDS) 7장 +
// 고른 풀 카드 7장 = 14장. 덱은 캐릭터에 종속(고유 카드가 캐릭터별이라). 저장은
// localStorage. 카드는 battle/cards.ts와 data/roster.ts에서 조회(중복 정의 없음).
// ---------------------------------------------------------------------------
import { COMMON_CARDS } from '../battle/cards'
import { getChar, ROSTER } from '../data/roster'
import type { CardDef } from '../battle/types'

export interface Deck {
  id: string
  name: string
  charId: string
  cardIds: string[] // 고른 풀 카드 7장 (고정 카드는 제외)
}

export const DECK_SIZE = 7

const byId = (id: string): CardDef | undefined => COMMON_CARDS.find((c) => c.id === id)

/** 모든 덱에 항상 들어가는 고정 카드 — 이동 4방향 + 기본 공격 + 기본 지원 2종. */
export const FIXED_CARDS: CardDef[] = [
  'm-up',
  'm-down',
  'm-right',
  'm-left',
  'c-strike',
  'c-brace',
  'c-energy',
]
  .map(byId)
  .filter((c): c is CardDef => !!c)

/** 공용 선택 풀(캐릭터 무관): 대시 2종 + 대각 이동 4종 + 견제 사격 + 더 좋은 방어 + 힐. */
const COMMON_POOL_IDS = [
  'm-right2',
  'm-left2',
  'm-ur',
  'm-ul',
  'm-dr',
  'm-dl',
  'c-shot',
  'c-guard',
  'c-repair',
]

/** 특정 캐릭터가 덱에 담을 수 있는 선택 풀 = 공용 풀 + 그 캐릭터 고유 카드 4장. */
export function poolFor(charId: string): CardDef[] {
  const common = COMMON_POOL_IDS.map(byId).filter((c): c is CardDef => !!c)
  return [...common, ...getChar(charId).cards]
}

/** 덱을 실제 전투 카드 목록으로 조립: 고정 7 + 고른 카드(풀에서 해석). */
export function assembleDeck(deck: Deck): CardDef[] {
  const pool = poolFor(deck.charId)
  const chosen = deck.cardIds
    .map((id) => pool.find((c) => c.id === id))
    .filter((c): c is CardDef => !!c)
  return [...FIXED_CARDS, ...chosen]
}

// --- 프리셋(봇 덱 + 저장된 덱이 없을 때의 기본 덱) --------------------------
// 직업 카드를 전부 넣고, 남는 자리를 공용 보강 카드로 채워 정확히 DECK_SIZE장을 만든다.
// ⚠ 직업마다 고유 카드 수가 다르다(전사는 전용 가드가 있어 5장, 나머지 4장) —
// 예전처럼 "고유 + 공용 3장"으로 고정하면 전사만 8장이 돼 덱 상한을 넘는다.
const PRESET_FILLERS = ['c-shot', 'c-guard', 'm-right2', 'c-repair', 'm-left2']
export const PRESET_DECKS: Record<string, string[]> = Object.fromEntries(
  ROSTER.map((c) => {
    const classIds = c.cards.map((k) => k.id).slice(0, DECK_SIZE)
    const fill = PRESET_FILLERS.filter((id) => !classIds.includes(id))
    return [c.id, [...classIds, ...fill].slice(0, DECK_SIZE)]
  }),
)

/** 캐릭터의 기본(프리셋) 덱 객체 — 봇전 상대·첫 사용자 시작용. */
export function presetDeck(charId: string): Deck {
  return {
    id: `preset-${charId}`,
    name: `${getChar(charId).name} 기본 덱`,
    charId,
    cardIds: PRESET_DECKS[charId] ?? [],
  }
}

// --- 저장 (localStorage) ----------------------------------------------------
const STORE_KEY = 'gb-decks'

/** 저장 키 — 로그인 계정은 uid로 분리해 같은 브라우저에서 계정끼리 섞이지 않게.
 *  (uid 없음 = 게스트/로컬 전용) */
const keyFor = (uid?: string | null) => (uid ? `${STORE_KEY}:${uid}` : STORE_KEY)

export function loadDecks(uid?: string | null): Deck[] {
  try {
    const raw = localStorage.getItem(keyFor(uid))
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (d): d is Deck =>
        d && typeof d.id === 'string' && typeof d.charId === 'string' && Array.isArray(d.cardIds),
    )
  } catch {
    return []
  }
}

/** 목록 전체를 로컬에 덮어쓴다(클라우드 조회 결과 캐싱용). */
export function writeDecks(decks: Deck[], uid?: string | null): void {
  try {
    localStorage.setItem(keyFor(uid), JSON.stringify(decks))
  } catch {
    /* storage unavailable — 메모리로만 동작 */
  }
}

/** 새 덱은 추가, 기존 id면 갱신(upsert). */
export function saveDeck(deck: Deck, uid?: string | null): Deck[] {
  const decks = loadDecks(uid)
  const i = decks.findIndex((d) => d.id === deck.id)
  if (i >= 0) decks[i] = deck
  else decks.push(deck)
  writeDecks(decks, uid)
  return decks
}

export function deleteDeck(id: string, uid?: string | null): Deck[] {
  const decks = loadDecks(uid).filter((d) => d.id !== id)
  writeDecks(decks, uid)
  return decks
}

export function newDeckId(): string {
  return `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
