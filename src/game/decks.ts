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
// **손으로 고른다.** 카드 확장(2026-08-01) 전에는 직업 카드가 4~5장이라 "전부 + 공용
// 필러"로 자동 생성했지만, 이제 직업마다 8~9장이라 7칸에 다 못 들어간다. 자동으로
// 앞에서 자르면 뒤에 붙인 버프·기동 카드가 통째로 빠져 프리셋이 예전 덱과 똑같아진다.
//
// 각 덱은 **그 직업의 기본 전략 한 갈래**를 보여 주도록 짰다(빌드는 유물이 완성한다):
//   전사   붙어서 버티고 갚는다 — 돌진으로 거리 지우고 방벽 + 기절
//   궁수   거리를 지킨다 — 물러서며 쏘고, 붙으면 올가미로 떼어낸다
//   마법사 판을 덮는다 — 광역 + 화상/빙결, 장막으로 버티며 큰 주문
// ⚠ 여기 없는 카드도 덱 빌더·런 보상에는 전부 나온다. 프리셋은 "시작점"일 뿐이다.
export const PRESET_DECKS: Record<string, string[]> = {
  warrior: ['war-cleave', 'war-bash', 'war-quake', 'war-wall', 'war-charge', 'war-cry', 'c-guard'],
  archer: ['arc-shot', 'arc-venom', 'arc-pin', 'arc-kite', 'arc-snare', 'arc-focus', 'm-left2'],
  mage: ['mag-spark', 'mag-frost', 'mag-flame', 'mag-hex', 'mag-ward', 'mag-blink', 'c-guard'],
}

// 프리셋이 실제 카드·덱 상한과 맞는지 개발 중에 바로 터뜨린다(오타·id 변경 방지).
for (const [id, ids] of Object.entries(PRESET_DECKS)) {
  const pool = poolFor(id).map((c) => c.id)
  const bad = ids.filter((c) => !pool.includes(c))
  if (bad.length) throw new Error(`PRESET_DECKS[${id}]에 없는 카드: ${bad.join(', ')}`)
  if (ids.length !== DECK_SIZE)
    throw new Error(`PRESET_DECKS[${id}]는 ${DECK_SIZE}장이어야 한다 (현재 ${ids.length})`)
}

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
