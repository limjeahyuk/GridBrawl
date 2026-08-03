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
import {
  mergeRelics,
  mergeRunMods,
  pickWeightedRelic,
  RELIC_BY_ID,
  RELIC_PRICE,
  REWARD_RELICS,
  signatureRelicId,
  type Relic,
  type RunMods,
} from './relics'
import { getMonster, monstersOfTier, type MonsterDef } from './monsters'
import { RUN_CARDS } from './runcards'

// --- 노드 사다리 템플릿 -----------------------------------------------------
export type NodeType = 'combat' | 'elite' | 'boss' | 'event' | 'shop'
export interface RunNode {
  type: NodeType
  monsterId?: string // combat/elite/boss
}
/**
 * 층 구성(전투 위주에 이벤트·상점을 섞고, 엘리트 뒤 보스). 15층 = 전투 7 + 엘리트 2
 * + 보스 1 + 이벤트 3 + 상점 2. **12층에서 늘렸다(2026-07-30)**: 예전 구성은 전투가
 * 8판뿐이라 tier3 몬스터가 9층 한 칸에서만 나왔다(시뮬에서 팬텀·뱀파이어 조우 60회 vs
 * 잡졸 600회). 층을 늘려 각 티어에 제 몫의 자리를 준다.
 * 첫 엘리트(7층) **앞에 상점(5층)**을 둔 것도 시뮬 결과다 — 엘리트가 5층이던 배치에선
 * 체력 50%·유물 1개로 벽을 만나 그 층이 보스보다 어려웠다(통과 66% vs 보스 79%).
 */
const NODE_TEMPLATE: NodeType[] = [
  'combat', 'combat', 'event', 'combat', 'shop', 'combat', 'elite',
  'event', 'combat', 'elite', 'shop',
  'combat', 'combat', 'event', 'boss',
]
export const LADDER_FLOORS = NODE_TEMPLATE.length

// --- 튜닝 상수 --------------------------------------------------------------
export const DECK_CAP = 20
/** 승리 보상으로 보여주는 선택지 수(5장 중 1택). */
const REWARD_OPTIONS = 6
/** 일반 전투 보상 5장 중 유물이 섞일 확률(엘리트·보스는 확정). */
const RELIC_IN_REWARD = 0.03
/** 층별 몬스터 체력 스케일 — 보스로 갈수록 확실히 벽이 되게 0.07/층. */
const HP_SCALE_PER_FLOOR = 0.03
/**
 * 층별 몬스터 **공격력** 스케일(2026-07-30). 체력만 올리면 후반 몬스터가 "두껍지만
 * 안 아픈" 샌드백이 되어, 유물을 쌓은 플레이어에게 뒤쪽 층이 앞쪽보다 쉬워졌다
 * (시뮬 `npm run sim:run`: 12·13층 통과율 99%, 플레이어가 오히려 체력을 벌었다).
 *
 * **선형이 아니라 가속 곡선**인 이유: 플레이어의 방어는 유물로 *합산*된다(피해감소 +
 * 매 턴 보호막). 층당 고정 +N으로는 앞쪽 층이 아파지기 전에 뒤쪽 층을 뚫지 못한다.
 * 1차+2차항으로 초반은 완만하게, 후반은 방어 스택을 넘어서게 올린다.
 *   4층 +1 · 7층 +3 · 10층 +7 · 13층 +11 · 15층 +14
 */
const atkScaleAt = (floor: number): number => {
  const d = floor - 1
  return Math.round(0.06 * d + 0.008 * d * d)
}
/** 엘리트 보정 — 엘리트 노드는 같은 몬스터라도 더 두껍고 더 아프다. */
const ELITE_HP_MULT = 1.2
const ELITE_ATK_BONUS = 2
/**
 * 보스 보정 — 보스는 **두꺼워지는 대신 아파진다**. 마지막 층에서 층 스케일을 그대로
 * 먹으면 체력 400에 육박해 15턴 독안개 소모전이 됐고(시뮬), 그 싸움은 유물로 지속력을
 * 쌓은 플레이어가 그냥 이긴다(승률 79%). 체력 스케일은 깎고 화력을 얹어 짧고 무섭게.
 */
const BOSS_HP_SCALE_FACTOR = 0.4
/** 보상을 포기하고 받는 회복량. 22 → 32(2026-07-30): 15층 사다리에선 누적 소모가
 *  훨씬 커서(7층 진입 체력 49%) 22는 "카드를 포기할 이유"가 못 됐다. */
export const SKIP_HEAL = 36
const GOLD_BASE = 15
const GOLD_PER_FLOOR = 4
const GOLD_ELITE_BONUS = 40
const GOLD_BOSS_BONUS = 80
const PRICE_CARD = 35
const PRICE_HEAL = 30
const PRICE_HEAL_AMOUNT = 50 // 35 → 50: 상점 회복이 층 사이 회복의 주 수단이 되게
const PRICE_REMOVE = 40

/**
 * 시작 덱 — **공용 기본 카드 9장뿐**(이동4 + 약공3 + 브레이스 + 원기). 2026-07-31에
 * 직업 카드 1장 선택을 없앴다: 런에선 큰 카드가 항상 유리해서 "시그니처로 시작"이
 * 정답이 되고 나머지 선택이 함정이었으며, 그 시작이 1~6층을 무료로 만들었다.
 * 이제 직업 카드·강한 런 카드는 **보상으로 번다** — 기획서 ③의 원래 의도다.
 */
const STARTING_COMMON = [
  'm-up', 'm-down', 'm-left', 'm-right',
  'c-brace', 'c-energy',
]

/**
 * 시작 덱 9장 = 공용 6장(이동4 + 브레이스 + 원기) + **그 직업의 기본기 3장**.
 * 2026-08-04까지는 세 직업 모두 공용 약공(`c-strike`/`c-shot`/`c-jab`)으로 출발해
 * 1~5층이 어느 직업이든 똑같은 싸움이었다. 총합 화력은 그대로 두고 **때리는 모양**만
 * 갈랐다(전사=밀착·강타 / 궁수=긴 사거리 / 마법사=광역) — 수치 근거는 `roster.ts`의
 * `basics` 주석. 강한 직업 카드는 여전히 보상으로 번다.
 */
export function startingDeck(charId: string): string[] {
  return [...STARTING_COMMON, ...getChar(charId).basics.map((c) => c.id)]
}

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
/** 일반 전투 몬스터 티어(층이 오를수록). 15층 구성 기준 t1: 1·2층, t2: 4·7층, t3: 9층 이후. */
function combatTier(floor: number): number {
  if (floor <= 3) return 1
  if (floor <= 8) return 2
  return 3
}
/**
 * 일반 전투 후보. **12층부터는 tier4(수호기사·화염군주)도 잡몹으로 섞인다**
 * (2026-07-30): 보스 직전 두 층이 통과율 99%인 공짜 층이었다 — 유물을 다 쌓은
 * 플레이어에게 tier3는 더 이상 위협이 아니다. 엘리트 보정 없이 나오므로 엘리트보다는
 * 약하고, 보스 앞 마지막 압박이 된다.
 */
const DEEP_COMBAT_FLOOR = 12
function combatPool(floor: number): MonsterDef[] {
  const tier = monstersOfTier(combatTier(floor))
  if (floor < DEEP_COMBAT_FLOOR) return tier
  return [...tier, ...monstersOfTier(4).filter((m) => m.id !== 'overlord')]
}
/**
 * 엘리트 후보 — **깊이에 따라 다른 풀**. 중반 엘리트(6층)에 스크립트 tier4가
 * 나오면 그 층이 보스보다 어려운 벽이 됐다(시뮬: 6층 통과 53% vs 보스 61%).
 * 그래서 중반은 단단한 tier3 브루저에 엘리트 보정을 얹고, 깊은 층에만 tier4를 낸다.
 */
const MID_ELITE_IDS = ['golem', 'ogre', 'knight']
/** 깊은 층 엘리트 — 스크립트 tier4 + 가디언(벽). 가디언은 피해감소·보호막이
 *  엘리트 보정과 겹쳐 중반엔 뚫을 수 없는 벽이 됐다(시뮬 승률 49%) → 후반으로. */
const DEEP_ELITE_IDS = ['guardian']
const DEEP_ELITE_FLOOR = 9
function elitePool(floor: number): MonsterDef[] {
  if (floor < DEEP_ELITE_FLOOR) return MID_ELITE_IDS.map(getMonster)
  return [...monstersOfTier(4).filter((m) => m.id !== 'overlord'), ...DEEP_ELITE_IDS.map(getMonster)]
}

function buildLadder(): RunNode[] {
  return NODE_TEMPLATE.map((type, i) => {
    const floor = i + 1
    if (type === 'combat') {
      const poolT = combatPool(floor)
      return { type, monsterId: (poolT.length ? pick(poolT) : pick(monstersOfTier(1))).id }
    }
    if (type === 'elite') return { type, monsterId: pick(elitePool(floor)).id }
    if (type === 'boss') return { type, monsterId: 'overlord' }
    return { type } // event / shop
  })
}

// --- 전장 배경 --------------------------------------------------------------
/**
 * 전투 배경 장면. CSS `.boardfloor--<id>`와 **이름이 짝**이다(`battlefx.css`).
 * 규칙이 아니라 연출이라 엔진·시뮬은 이 값을 모른다 — 밸런스에 영향 없음.
 */
export type BattleScene = 'hall' | 'corridor' | 'cemetery' | 'lava'
/**
 * 층에 맞는 배경. **바깥 → 성 안 → 지하 → 용암** 순으로 내려간다: 사다리를
 * 오르는 게 아니라 파고드는 느낌이라야 15층이 길게 느껴지지 않는다.
 * 보스는 층과 무관하게 용암 — 유일한 붉은 장면이라 그 자체가 "끝" 신호다.
 */
export function sceneFor(run: RunState): BattleScene {
  if (currentNode(run).type === 'boss') return 'lava'
  if (run.floor <= 5) return 'cemetery'
  if (run.floor <= 10) return 'hall'
  return 'corridor'
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
/**
 * 현재 층의 몬스터(층 스케일 + 엘리트 보정 반영). combat/elite/boss 노드에서만 유효.
 * 공격력 보정은 패시브 훅 `attackBonus`로 얹으므로 엔진·UI가 따로 알 필요가 없다.
 * tier4(수호기사·화염군주)는 이미 엘리트 스탯이라 엘리트 보정을 중복 적용하지 않는다.
 */
export function currentEnemy(run: RunState): MonsterDef {
  const node = currentNode(run)
  const base = getMonster(node.monsterId ?? 'grunt')
  const elite = node.type === 'elite' && base.tier < 4
  const boss = node.type === 'boss'
  const depth = (run.floor - 1) * (boss ? BOSS_HP_SCALE_FACTOR : 1)
  const hpScale = (1 + HP_SCALE_PER_FLOOR * depth) * (elite ? ELITE_HP_MULT : 1)
  const atk = atkScaleAt(run.floor) + (elite ? ELITE_ATK_BONUS : 0)
  return {
    ...base,
    maxHp: Math.round(base.maxHp * hpScale),
    passive: { ...base.passive, attackBonus: (base.passive.attackBonus ?? 0) + atk },
  }
}
function statusForNode(node: RunNode): RunStatus {
  if (node.type === 'event') return 'event'
  if (node.type === 'shop') return 'shop'
  return 'fighting'
}

// --- 런 시작 ----------------------------------------------------------------
export function startRun(charId: string): RunState {
  const relicIds = [signatureRelicId(charId)].filter(Boolean)
  const maxHp = computeMaxHp(charId, relicIds)
  const ladder = buildLadder()
  return {
    charId,
    relicIds,
    deck: startingDeck(charId),
    hp: maxHp,
    maxHp,
    gold: 0,
    floor: 1,
    ladder,
    status: statusForNode(ladder[0]), // 1층이 전투가 아닌 템플릿으로 바뀌어도 안전하게
  }
}

// --- 유물의 전투 밖 효과 ----------------------------------------------------
/** 장착 유물의 메타 효과 묶음(상점 할인·골드·보상 칸·회복량·덱 상한). */
export function runMods(run: RunState): RunMods {
  return mergeRunMods(run.relicIds)
}
/** 유물 보정이 들어간 덱 상한. */
export function deckCap(run: RunState): number {
  return DECK_CAP + (runMods(run).deckCapBonus ?? 0)
}

// --- 전투 결과 --------------------------------------------------------------
function goldForWin(run: RunState): number {
  const node = currentNode(run)
  let g = GOLD_BASE + GOLD_PER_FLOOR * run.floor
  if (node.type === 'elite') g += GOLD_ELITE_BONUS
  if (node.type === 'boss') g += GOLD_BOSS_BONUS
  const bonus = runMods(run).goldBonusPct ?? 0
  return Math.round(g * (1 + bonus / 100))
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
function availableRelicDefs(run: RunState): Relic[] {
  return REWARD_RELICS.filter((r) => !run.relicIds.includes(r.id))
}
function availableRelics(run: RunState): string[] {
  return availableRelicDefs(run).map((r) => r.id)
}
/**
 * 미보유 유물 하나를 **희귀도 가중**으로 고른다. 가중치는 층에 따라 좋아진다 —
 * 판을 부수는 조합은 깊이 살아남은 대가로 얻는다(relics.ts `rarityWeightAt`).
 */
function rollRelicId(run: RunState): string | undefined {
  return pickWeightedRelic(availableRelicDefs(run), run.floor)?.id
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
  const relicId = rollRelicId(run)
  if (!relicId) return { run: { ...run, hp: Math.min(run.maxHp, run.hp + 20) } }
  return { run: grantRelic(run, relicId), relicId }
}
/** 카드 획득. 덱이 꽉 찼는데 removeId가 없으면 needsReplace로 UI에 교체를 넘긴다. */
export function grantCard(
  run: RunState,
  cardId: string,
  removeId?: string,
): { run: RunState; needsReplace?: boolean } {
  if (run.deck.length >= deckCap(run) && !removeId) return { run, needsReplace: true }
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
/** 회복 — 유물의 `healBonusPct`(치유 향유 등)가 여기 전부에 적용된다. */
export function healHp(run: RunState, amount: number): RunState {
  const boost = 1 + (runMods(run).healBonusPct ?? 0) / 100
  return { ...run, hp: Math.min(run.maxHp, run.hp + Math.round(amount * boost)) }
}
export function loseHp(run: RunState, amount: number): RunState {
  return { ...run, hp: Math.max(1, run.hp - amount) } // 이벤트로는 죽지 않는다(최소 1)
}

// --- 승리 보상 (카드 3 + 엘리트/보스면 유물) --------------------------------
export type Reward =
  | { kind: 'card'; cardId: string }
  | { kind: 'relic'; relicId: string }

/** 그 캐릭터의 미보유 직업(고유) 카드 — 시작 덱에서 빠졌으므로 런에서 번다. */
function missingClassCards(run: RunState): string[] {
  return getChar(run.charId)
    .cards.map((c) => c.id)
    .filter((id) => !run.deck.includes(id))
}
/** 보상·상점에 나올 수 있는 카드 전체 풀(공용 확장 + 직업 + 런 전용). */
function cardRewardPool(run: RunState): string[] {
  const commonPool = ['m-right2', 'm-left2', 'm-ur', 'm-ul', 'm-dr', 'm-dl', 'c-guard', 'c-repair']
  const classCards = getChar(run.charId).cards.map((c) => c.id)
  return [...commonPool, ...classCards, ...RUN_CARDS.map((c) => c.id)]
}
/**
 * 승리 보상 후보 — **5장 중 1택**(유물 `rewardOptions`로 칸이 늘 수 있다). 기본은
 * 카드지만 유물이 섞일 수 있다: 엘리트·보스는 **확정**, 일반 전투는 낮은 확률
 * (`RELIC_IN_REWARD` + 유물 보정). 유물은 **희귀도 가중**으로 뽑는다.
 *
 * 직업 카드를 아직 못 얻었으면 **한 칸은 직업 카드로 보장**한다(2026-07-31) — 시작
 * 덱에서 직업 카드를 뺀 뒤로는 그걸 못 주우면 런이 성립하지 않기 때문이다.
 */
export function rollRewards(run: RunState): Reward[] {
  const slots = REWARD_OPTIONS + (runMods(run).rewardOptions ?? 0)
  const cards = shuffle(cardRewardPool(run)).slice(0, slots)
  const out: Reward[] = cards.map((cardId) => ({ kind: 'card', cardId }))

  // ⚠ 유물 칸을 **직업 카드 보장보다 먼저** 확정한다. 순서를 뒤집으면(2026-08-01
  // 이전) 보장해 둔 직업 카드가 마지막 칸에 있을 때 유물이 그 칸을 덮어써서
  // 보장이 조용히 깨진다 — 20,000회 중 40여 회(0.2%)가 그랬다.
  const chance = RELIC_IN_REWARD + (runMods(run).relicChanceBonus ?? 0)
  if (isEliteFloor(run) || Math.random() < chance) {
    const relicId = rollRelicId(run)
    if (relicId) out[out.length - 1] = { kind: 'relic', relicId }
  }

  // 직업 카드를 아직 못 얻었으면 **남은 카드 칸 하나**를 직업 카드로 바꾼다.
  const missing = missingClassCards(run)
  if (missing.length && !out.some((r) => r.kind === 'card' && missing.includes(r.cardId))) {
    const slot = out.findIndex((r) => r.kind === 'card')
    if (slot >= 0) out[slot] = { kind: 'card', cardId: pick(missing) }
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
    options: [{ label: '쉬어간다 (HP +55)', effect: { type: 'heal', amount: 55 } }, skip],
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

/**
 * 상점 진열 — 카드 3 + 유물 1 + 회복 1 + 카드 제거 서비스 1.
 * 유물은 2 → **1칸**(2026-07-30): 상점 2곳에서 유물 4개를 사들이면 후반이 무력화됐다
 * (시뮬: 보스 도달 시 유물 6개, 12·13층 통과율 99%). 유물은 엘리트·이벤트가 주 경로.
 */
export function rollShop(run: RunState): ShopItem[] {
  const items: ShopItem[] = []
  // 유물 할인(상인의 인증패 등)은 **모든 상점 가격**에 적용된다.
  const off = 1 - (runMods(run).shopDiscountPct ?? 0) / 100
  const price = (n: number) => Math.max(1, Math.round(n * off))
  shuffle(cardRewardPool(run)).slice(0, 3).forEach((cardId, i) =>
    items.push({ id: `card-${i}`, kind: 'card', cardId, price: price(PRICE_CARD) }),
  )
  const relicId = rollRelicId(run) // 희귀도 가중 — legend는 드물고 아주 비싸다
  if (relicId)
    items.push({
      id: 'relic-0',
      kind: 'relic',
      relicId,
      price: price(RELIC_PRICE[RELIC_BY_ID[relicId]?.rarity ?? 'common']),
    })
  // 회복 2칸(2026-07-30) — 시뮬에서 보스 도달 시 골드 300이 남았다(살 게 없었다).
  // 골드를 체력으로 바꾸는 창구를 넓혀 남는 골드가 생존으로 이어지게.
  items.push({ id: 'heal', kind: 'heal', price: price(PRICE_HEAL), amount: PRICE_HEAL_AMOUNT })
  items.push({ id: 'heal-2', kind: 'heal', price: price(PRICE_HEAL), amount: PRICE_HEAL_AMOUNT })
  items.push({ id: 'remove', kind: 'removeCard', price: price(PRICE_REMOVE) })
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
