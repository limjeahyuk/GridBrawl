// ---------------------------------------------------------------------------
// 로그라이크 런 — 노드 사다리(전투/엘리트/보스/이벤트/상점) 진행 + 덱/유물/골드
// 성장. 전투는 엔진(battle/engine.ts)이, 여기선 그 위의 **메타 상태**를 순수
// 함수로 다룬다(랜덤 Math.random — 싱글 전용이라 락스텝 무관). 설계는
// docs/ROGUELIKE.md. UI 흐름 연결은 App.tsx(Phase 1b).
//
// 유물 획득 경로(2026-07-24 개편): **엘리트·보스 전투 보상 확정** + **이벤트(대가를
// 치르고)** + **상점(골드로 구매)**. 일반 전투 보상엔 유물이 없다.
// ---------------------------------------------------------------------------
import { getChar } from '../data/roster'
import { mergeRelics, RELIC_BY_ID, REWARD_RELICS, signatureRelicId, type Rarity } from './relics'
import { getMonster, monstersOfTier, type MonsterDef } from './monsters'

// --- 노드 사다리 템플릿 -----------------------------------------------------
export type NodeType = 'combat' | 'elite' | 'boss' | 'event' | 'shop'
export interface RunNode {
  type: NodeType
  monsterId?: string // combat/elite/boss
}
/** 층 구성(전투 위주에 이벤트·상점을 섞고, 엘리트 뒤 보스). */
const NODE_TEMPLATE: NodeType[] = [
  'combat', 'combat', 'event', 'combat', 'shop', 'elite',
  'combat', 'event', 'combat', 'shop', 'elite', 'boss',
]
export const LADDER_FLOORS = NODE_TEMPLATE.length

// --- 튜닝 상수 --------------------------------------------------------------
export const DECK_CAP = 20
/** 승리 보상으로 보여주는 선택지 수(5장 중 1택). */
const REWARD_OPTIONS = 5
/** 일반 전투 보상 5장 중 유물이 섞일 확률(엘리트·보스는 확정). */
const RELIC_IN_REWARD = 0.03
/** 층별 몬스터 스케일 — 보스로 갈수록 확실히 벽이 되게 0.07/층. */
const HP_SCALE_PER_FLOOR = 0.07
export const SKIP_HEAL = 22
const GOLD_BASE = 15
const GOLD_PER_FLOOR = 4
const GOLD_ELITE_BONUS = 40
const GOLD_BOSS_BONUS = 80
/** 상점 가격(유물 희귀도별 + 서비스). */
const PRICE: Record<Rarity, number> = { common: 60, rare: 90, epic: 130 }
const PRICE_CARD = 35
const PRICE_HEAL = 25
const PRICE_HEAL_AMOUNT = 35
const PRICE_REMOVE = 40

/** 시작 덱(고정) — 이동4 + 공용 공격3 + 수비2. 여기에 직업 카드 1장을 더한다. */
const STARTING_DECK = [
  'm-up', 'm-down', 'm-left', 'm-right',
  'c-strike', 'c-shot', 'c-jab',
  'c-brace', 'c-energy',
]

export type RunStatus = 'fighting' | 'reward' | 'event' | 'shop' | 'won' | 'lost'

export interface RunState {
  charId: string
  relicIds: string[]
  deck: string[]
  hp: number
  maxHp: number
  gold: number
  floor: number // 1-based
  ladder: RunNode[]
  status: RunStatus
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const shuffle = <T>(arr: T[]): T[] => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// --- 사다리 구성 ------------------------------------------------------------
/** 일반 전투 몬스터 티어(층이 오를수록). */
function combatTier(floor: number): number {
  if (floor <= 3) return 1
  if (floor <= 7) return 2
  return 3
}
/** 엘리트 후보 — tier4의 엘리트(보스 제외) + 강한 tier3. */
function elitePool(): MonsterDef[] {
  const tier4 = monstersOfTier(4).filter((m) => m.id !== 'overlord')
  return [...tier4, ...monstersOfTier(3).filter((m) => ['golem', 'witch'].includes(m.id))]
}

function buildLadder(): RunNode[] {
  return NODE_TEMPLATE.map((type, i) => {
    const floor = i + 1
    if (type === 'combat') {
      const poolT = monstersOfTier(combatTier(floor))
      return { type, monsterId: (poolT.length ? pick(poolT) : pick(monstersOfTier(1))).id }
    }
    if (type === 'elite') return { type, monsterId: pick(elitePool()).id }
    if (type === 'boss') return { type, monsterId: 'overlord' }
    return { type } // event / shop
  })
}

// --- 파생값 -----------------------------------------------------------------
export function computeMaxHp(charId: string, relicIds: string[]): number {
  const base = getChar(charId).maxHp
  return Math.max(1, base + (mergeRelics(relicIds).maxHpBonus ?? 0))
}
export function currentNode(run: RunState): RunNode {
  return run.ladder[run.floor - 1]
}
export function isEliteFloor(run: RunState): boolean {
  const t = currentNode(run).type
  return t === 'elite' || t === 'boss'
}
/** 현재 층의 몬스터(층 스케일 반영). combat/elite/boss 노드에서만 유효. */
export function currentEnemy(run: RunState): MonsterDef {
  const node = currentNode(run)
  const base = getMonster(node.monsterId ?? 'grunt')
  const scale = 1 + HP_SCALE_PER_FLOOR * (run.floor - 1)
  return { ...base, maxHp: Math.round(base.maxHp * scale) }
}
function statusForNode(node: RunNode): RunStatus {
  if (node.type === 'event') return 'event'
  if (node.type === 'shop') return 'shop'
  return 'fighting'
}

// --- 런 시작 ----------------------------------------------------------------
export function startRun(charId: string, classCardId: string): RunState {
  const relicIds = [signatureRelicId(charId)].filter(Boolean)
  const maxHp = computeMaxHp(charId, relicIds)
  return {
    charId,
    relicIds,
    deck: [...STARTING_DECK, classCardId],
    hp: maxHp,
    maxHp,
    gold: 0,
    floor: 1,
    ladder: buildLadder(),
    status: 'fighting',
  }
}

// --- 전투 결과 --------------------------------------------------------------
function goldForWin(run: RunState): number {
  const node = currentNode(run)
  let g = GOLD_BASE + GOLD_PER_FLOOR * run.floor
  if (node.type === 'elite') g += GOLD_ELITE_BONUS
  if (node.type === 'boss') g += GOLD_BOSS_BONUS
  return g
}
/** 승리 — 남은 체력 인계 + 골드 획득 → 보상 단계(보스면 클리어). */
export function afterWin(run: RunState, hpLeft: number): RunState {
  const hp = clamp(Math.round(hpLeft), 0, run.maxHp)
  const gold = run.gold + goldForWin(run)
  if (currentNode(run).type === 'boss') return { ...run, hp, gold, status: 'won' }
  return { ...run, hp, gold, status: 'reward' }
}
export function afterLoss(run: RunState): RunState {
  return { ...run, hp: 0, status: 'lost' }
}

// --- 유물·카드·골드 뮤테이터(순수) -----------------------------------------
function availableRelics(run: RunState): string[] {
  return REWARD_RELICS.map((r) => r.id).filter((id) => !run.relicIds.includes(id))
}
/** 유물 장착(최대체력 증가분만큼 현재 체력도 함께 오른다). */
export function grantRelic(run: RunState, relicId: string): RunState {
  if (!relicId || run.relicIds.includes(relicId)) return run
  const relicIds = [...run.relicIds, relicId]
  const maxHp = computeMaxHp(run.charId, relicIds)
  const delta = maxHp - run.maxHp
  const hp = Math.min(run.hp + Math.max(0, delta), maxHp)
  return { ...run, relicIds, maxHp, hp: clamp(hp, 1, maxHp) }
}
/** 무작위(미보유) 유물 하나를 준다. 다 가졌으면 소량 회복으로 대체. */
export function grantRandomRelic(run: RunState): { run: RunState; relicId?: string } {
  const pool = availableRelics(run)
  if (!pool.length) return { run: { ...run, hp: Math.min(run.maxHp, run.hp + 20) } }
  const relicId = pick(pool)
  return { run: grantRelic(run, relicId), relicId }
}
/** 카드 획득. 덱이 꽉 찼는데 removeId가 없으면 needsReplace로 UI에 교체를 넘긴다. */
export function grantCard(
  run: RunState,
  cardId: string,
  removeId?: string,
): { run: RunState; needsReplace?: boolean } {
  if (run.deck.length >= DECK_CAP && !removeId) return { run, needsReplace: true }
  let deck = run.deck
  if (removeId) {
    const i = deck.indexOf(removeId)
    deck = i >= 0 ? [...deck.slice(0, i), ...deck.slice(i + 1)] : deck
  }
  return { run: { ...run, deck: [...deck, cardId] } }
}
export function removeCard(run: RunState, cardId: string): RunState {
  const i = run.deck.indexOf(cardId)
  if (i < 0) return run
  return { ...run, deck: [...run.deck.slice(0, i), ...run.deck.slice(i + 1)] }
}
export function healHp(run: RunState, amount: number): RunState {
  return { ...run, hp: Math.min(run.maxHp, run.hp + amount) }
}
export function loseHp(run: RunState, amount: number): RunState {
  return { ...run, hp: Math.max(1, run.hp - amount) } // 이벤트로는 죽지 않는다(최소 1)
}

// --- 승리 보상 (카드 3 + 엘리트/보스면 유물) --------------------------------
export type Reward =
  | { kind: 'card'; cardId: string }
  | { kind: 'relic'; relicId: string }

function cardRewardPool(charId: string): string[] {
  const commonPool = ['m-right2', 'm-left2', 'm-ur', 'm-ul', 'm-dr', 'm-dl', 'c-guard', 'c-repair']
  const classCards = getChar(charId).cards.map((c) => c.id)
  return [...commonPool, ...classCards]
}
/**
 * 승리 보상 후보 — **5장 중 1택**. 기본은 카드 5장이고, 5장 안에 유물이
 * 섞일 수 있다: 엘리트·보스는 **확정**, 일반 전투는 아주 낮은 확률(RELIC_IN_REWARD).
 * 유물이 들어가면 카드 한 자리를 유물로 바꾸고 순서를 섞는다(항상 특정 위치 X).
 */
export function rollRewards(run: RunState): Reward[] {
  const out: Reward[] = shuffle(cardRewardPool(run.charId))
    .slice(0, REWARD_OPTIONS)
    .map((cardId) => ({ kind: 'card', cardId }))
  const wantRelic = isEliteFloor(run) || Math.random() < RELIC_IN_REWARD
  if (wantRelic) {
    const relics = availableRelics(run)
    if (relics.length) out[out.length - 1] = { kind: 'relic', relicId: pick(relics) }
  }
  return shuffle(out)
}

// --- 이벤트 (대가를 치르고 보상) --------------------------------------------
export type EventEffect =
  | { type: 'heal'; amount: number }
  | { type: 'loseHp'; amount: number }
  | { type: 'gainGold'; amount: number }
  | { type: 'loseHpGainRelic'; hp: number } // 피 흘리고 유물
  | { type: 'removeCardGainRelic' } // 카드 버리고 유물(카드 선택 필요)
  | { type: 'loseHpGainGold'; hp: number; gold: number }
  | { type: 'payGoldHeal'; gold: number; heal: number }
  | { type: 'nothing' }

export interface EventOption {
  label: string
  effect: EventEffect
}
export interface RunEvent {
  id: string
  name: string
  desc: string
  icon: string
  options: EventOption[]
}

const skip: EventOption = { label: '그냥 지나간다', effect: { type: 'nothing' } }

export const EVENTS: RunEvent[] = [
  {
    id: 'cursed-altar', name: '저주받은 제단', icon: '🩸',
    desc: '검붉은 제단이 피를 원한다. 바치면 힘을 준다는데…',
    options: [{ label: '피를 바친다 (HP -25 → 유물)', effect: { type: 'loseHpGainRelic', hp: 25 } }, skip],
  },
  {
    id: 'forge', name: '버려진 대장간', icon: '⚒',
    desc: '녹슨 화로가 아직 뜨겁다. 카드 하나를 녹여 유물로 벼릴 수 있다.',
    options: [{ label: '카드를 녹인다 (카드 1장 제거 → 유물)', effect: { type: 'removeCardGainRelic' } }, skip],
  },
  {
    id: 'spring', name: '치유의 샘', icon: '⛲',
    desc: '맑은 샘물이 상처를 씻어준다.',
    options: [{ label: '쉬어간다 (HP +45)', effect: { type: 'heal', amount: 45 } }, skip],
  },
  {
    id: 'gambler', name: '떠돌이 도박꾼', icon: '🎲',
    desc: '“피 조금이면 한몫 챙겨가지.”',
    options: [{ label: '건다 (HP -15 → 골드 +60)', effect: { type: 'loseHpGainGold', hp: 15, gold: 60 } }, skip],
  },
  {
    id: 'ancient-shrine', name: '고대 사당', icon: '⛩',
    desc: '오래된 사당이 대가를 요구한다. 골드로 축복을 살 수 있다.',
    options: [{ label: '기도한다 (골드 -50 → HP +50)', effect: { type: 'payGoldHeal', gold: 50, heal: 50 } }, skip],
  },
  {
    id: 'treasure', name: '수상한 상자', icon: '🎁',
    desc: '함정일지 보물일지 모를 상자가 놓여 있다.',
    options: [{ label: '연다 (HP -10 → 유물)', effect: { type: 'loseHpGainRelic', hp: 10 } }, skip],
  },
  {
    id: 'coin-pile', name: '흩어진 동전', icon: '🪙',
    desc: '누군가 흘리고 간 동전 무더기.',
    options: [{ label: '줍는다 (골드 +40)', effect: { type: 'gainGold', amount: 40 } }, skip],
  },
  {
    id: 'blood-pact', name: '피의 서약', icon: '🗡',
    desc: '벽에 새겨진 서약. 생명을 담보로 재물을 준다.',
    options: [{ label: '서약한다 (HP -20 → 골드 +80)', effect: { type: 'loseHpGainGold', hp: 20, gold: 80 } }, skip],
  },
]

/** 현재 층의 이벤트(id 고정 없이 랜덤). */
export function rollEvent(): RunEvent {
  return pick(EVENTS)
}

/**
 * 이벤트 선택지 적용. removeCardGainRelic는 removeCardId가 없으면 needsCardPick.
 * 반환의 gainedRelicId로 UI가 "무엇을 얻었는지" 안내한다.
 */
export function resolveEventEffect(
  run: RunState,
  effect: EventEffect,
  removeCardId?: string,
): { run: RunState; needsCardPick?: boolean; gainedRelicId?: string } {
  switch (effect.type) {
    case 'heal':
      return { run: healHp(run, effect.amount) }
    case 'loseHp':
      return { run: loseHp(run, effect.amount) }
    case 'gainGold':
      return { run: { ...run, gold: run.gold + effect.amount } }
    case 'loseHpGainRelic': {
      const r = grantRandomRelic(loseHp(run, effect.hp))
      return { run: r.run, gainedRelicId: r.relicId }
    }
    case 'removeCardGainRelic': {
      if (!removeCardId) return { run, needsCardPick: true }
      const r = grantRandomRelic(removeCard(run, removeCardId))
      return { run: r.run, gainedRelicId: r.relicId }
    }
    case 'loseHpGainGold':
      return { run: { ...loseHp(run, effect.hp), gold: run.gold + effect.gold } }
    case 'payGoldHeal':
      if (run.gold < effect.gold) return { run } // 골드 부족 — 변화 없음
      return { run: { ...healHp(run, effect.heal), gold: run.gold - effect.gold } }
    case 'nothing':
    default:
      return { run }
  }
}

// --- 상점 -------------------------------------------------------------------
export type ShopItem =
  | { id: string; kind: 'card'; cardId: string; price: number }
  | { id: string; kind: 'relic'; relicId: string; price: number }
  | { id: string; kind: 'heal'; price: number; amount: number }
  | { id: string; kind: 'removeCard'; price: number }

/** 상점 진열 — 카드 3 + 유물 2 + 회복 1 + 카드 제거 서비스 1. */
export function rollShop(run: RunState): ShopItem[] {
  const items: ShopItem[] = []
  shuffle(cardRewardPool(run.charId)).slice(0, 3).forEach((cardId, i) =>
    items.push({ id: `card-${i}`, kind: 'card', cardId, price: PRICE_CARD }),
  )
  shuffle(availableRelics(run)).slice(0, 2).forEach((relicId, i) =>
    items.push({ id: `relic-${i}`, kind: 'relic', relicId, price: PRICE[RELIC_BY_ID[relicId]?.rarity ?? 'common'] }),
  )
  items.push({ id: 'heal', kind: 'heal', price: PRICE_HEAL, amount: PRICE_HEAL_AMOUNT })
  items.push({ id: 'remove', kind: 'removeCard', price: PRICE_REMOVE })
  return items
}

/**
 * 상점 구매. 골드가 모자라면 ok:false. removeCard/카드획득(덱꽉참)은 카드 선택이
 * 필요할 수 있어 needsCardPick으로 넘긴다.
 */
export function buyShopItem(
  run: RunState,
  item: ShopItem,
  cardId?: string,
): { run: RunState; ok: boolean; needsCardPick?: boolean } {
  if (run.gold < item.price) return { run, ok: false }
  const paid = { ...run, gold: run.gold - item.price }
  switch (item.kind) {
    case 'card': {
      const res = grantCard(paid, item.cardId, cardId)
      if (res.needsReplace) return { run, ok: false, needsCardPick: true } // 결제 전으로 되돌림
      return { run: res.run, ok: true }
    }
    case 'relic':
      return { run: grantRelic(paid, item.relicId), ok: true }
    case 'heal':
      return { run: healHp(paid, item.amount), ok: true }
    case 'removeCard':
      if (!cardId) return { run, ok: false, needsCardPick: true } // 결제 전 — 카드 먼저 고른다
      return { run: removeCard(paid, cardId), ok: true }
    default:
      return { run, ok: false }
  }
}

// --- 진행 -------------------------------------------------------------------
/** 다음 층으로. 새 노드 타입에 맞춰 status를 정한다(전투/이벤트/상점). */
export function advanceFloor(run: RunState): RunState {
  const floor = run.floor + 1
  if (floor > LADDER_FLOORS) return { ...run, status: 'won' }
  return { ...run, floor, status: statusForNode(run.ladder[floor - 1]) }
}
/** 보상을 포기하고 회복 후 진행. */
export function skipRewardForHeal(run: RunState): RunState {
  return advanceFloor(healHp(run, SKIP_HEAL))
}
