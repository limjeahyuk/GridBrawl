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
  type Rarity,
  type Relic,
  type RunMods,
} from './relics'
import { getMonster, monstersOfTier, type MonsterDef, type TerrainId } from './monsters'
import { bossScene } from './bosses'
import { resolveRunCard, runCardsFor } from './runcards'
import { addUpgrade, upgradeBlock, upgradedCard, valueFieldOf, type CardUpgrade } from './upgrades'
import { GRID_COLS, GRID_ROWS, ROCK_HP, type CardDef, type Difficulty, type Hazard, type HazardKind, type Obstacle, type Offset } from '../battle/types'

// --- 런 난이도 4단계 (2026-08-11) -------------------------------------------
/**
 * **축은 하나뿐이다 — 봇이 나를 얼마나 읽는가.**
 *
 * 층 스케일(`HP_SCALE_PER_FLOOR`·`atkScaleAt`)이나 몬스터 스탯을 단계마다 따로
 * 두는 길도 있었지만 그러면 **밸런스 면이 네 개**가 되어(직업 밴드 × 4) 손볼 때마다
 * 스윕을 네 번 돌려야 한다. 2026-08-10 개편에서 "조준의 정확도가 곧 난이도"라는 걸
 * 실측으로 확인했으니(⑦-0-bis), 그 손잡이 하나만 돌린다 — 몬스터도 판도 그대로이고
 * **상대가 내 다음 수를 얼마나 아는가**만 달라진다.
 *
 *   초급   등급 −1 · 카드 0장       — 다가온다는 것만 어렴풋이 안다
 *   중급   고유 등급 · **첫 1장**    — 첫 수는 정확히 읽고 나머지는 어림한다
 *   고급   등급 +1 · **3장 전부**    — 자리를 통째로 정확히 짚는다(막지는 않는다)
 *   최고급 등급 +1 · 3장 + **대응**  — 거기에 더해 제일 아픈 한 장을 막거나 피한다
 *
 * ⚠ **계단은 `plan` 쪽에 있다.** easy/normal/hard의 cfg 차이(공격성·가드 성향·
 *   `CLOSE_IN`)만으로는 클리어율이 40.3 / 38.7 / 37.5%로 거의 안 갈렸다 — 실측이다.
 *   판을 가르는 건 **조준이 맞느냐**와 **대응하느냐** 둘뿐이라, 난이도를 그 둘로 놨다.
 *   `aiShift`는 그 위에 얹는 잔맛이다.
 *
 * ⚠ **상한(cap)이 아니라 상대 이동이다.** 처음엔 "이 등급을 넘지 못하게 누른다"로
 *   짰는데 그러면 **단계가 단조롭지 않았다** — 고급에서 실제로 등급이 바뀌는 몬스터가
 *   몇 안 돼(대부분 이미 고유값이 상한 아래) 중급 37.1% vs 고급 38.7%로 뒤집혔다.
 *   상대 이동이면 모든 몬스터가 단계마다 한 칸씩 올라가므로 **사다리 전체가** 달라지고,
 *   동시에 `MonsterDef.aiLevel`이 정한 몬스터 간 서열도 그대로 남는다(슬라임은 어느
 *   단계에서도 가디언보다 둔하다).
 */
export type RunDifficulty = 'novice' | 'adept' | 'expert' | 'master'

export interface RunDifficultyDef {
  id: RunDifficulty
  name: string
  /** 선택 화면 한 줄 설명 — "무엇이 달라지는가"를 그대로 적는다. */
  desc: string
  /** 몬스터 고유 `aiLevel`을 몇 칸 올리는가(−1·0·+1). 양 끝에서 잘린다. */
  aiShift: number
  /**
   * 내가 확정한 3장 중 **앞에서 몇 장이 보이는가**(0~3). 0이면 계획을 아예 안 넘긴다
   * (`CLOSE_IN` 어림으로만 조준). 안 보이는 슬롯부터는 봇도 어림으로 이어 간다.
   */
  readSlots: number
  /**
   * 읽은 계획으로 **막거나 피하는가**. false면 조준에만 쓴다 — 들어오는 걸 알고도
   * 안 피하고, 가드도 예전처럼 확률로 든다(그래서 헛가드로 슬롯을 버린다).
   */
  reacts: boolean
}

/** ⚠ **순서가 곧 해금 순서다** — `nextDifficulty`·`isDifficultyUnlocked`가 이 배열을 본다. */
export const RUN_DIFFICULTIES: readonly RunDifficultyDef[] = [
  {
    id: 'novice',
    name: '초급',
    desc: '적이 내 움직임을 거의 못 읽는다. 규칙과 카드를 익히는 단계.',
    aiShift: -1,
    readSlots: 0,
    reacts: false,
  },
  {
    id: 'adept',
    name: '중급',
    desc: '적이 내 첫 카드를 읽는다. 라운드 초반의 헛손질이 사라진다.',
    aiShift: 0,
    readSlots: 1,
    reacts: false,
  },
  {
    id: 'expert',
    name: '고급',
    desc: '적이 내 3장을 전부 보고 자리를 짚는다. 헛치는 일이 거의 없어진다.',
    aiShift: +1,
    readSlots: 3,
    reacts: false,
  },
  {
    id: 'master',
    name: '최고급',
    desc: '고급에 더해, 제일 아픈 한 장을 막거나 피한다. 미끼를 던져야 통한다.',
    aiShift: +1,
    readSlots: 3,
    reacts: true,
  },
] as const

export const DEFAULT_DIFFICULTY: RunDifficulty = 'novice'

export const difficultyDef = (id: RunDifficulty): RunDifficultyDef =>
  RUN_DIFFICULTIES.find((d) => d.id === id) ?? RUN_DIFFICULTIES[0]

/** 이 단계를 깨면 열리는 다음 단계. 마지막이면 null. */
export const nextDifficulty = (id: RunDifficulty): RunDifficulty | null => {
  const i = RUN_DIFFICULTIES.findIndex((d) => d.id === id)
  return i >= 0 && i + 1 < RUN_DIFFICULTIES.length ? RUN_DIFFICULTIES[i + 1].id : null
}

/**
 * 이 단계를 지금 고를 수 있는가 — **첫 단계는 늘 열려 있고**, 그 뒤로는 바로 앞
 * 단계를 클리어해야 열린다. `cleared`는 클리어한 단계 id 묶음.
 *
 * ⚠ 앞 단계 하나만 본다(전부가 아니라) — 최고급을 깬 사람이 초급 기록을 지웠다고
 *   최고급이 잠기면 안 되고, 반대로 건너뛰기도 안 된다.
 */
export function isDifficultyUnlocked(id: RunDifficulty, cleared: ReadonlySet<RunDifficulty>): boolean {
  const i = RUN_DIFFICULTIES.findIndex((d) => d.id === id)
  if (i <= 0) return true
  return cleared.has(RUN_DIFFICULTIES[i - 1].id)
}

/**
 * 몬스터 고유 등급을 난이도만큼 옮긴다. 양 끝에서 잘리므로 초급의 슬라임(이미 `easy`)은
 * 그대로고, 고급의 가디언(이미 `hard`)도 그대로다 — 올릴 여지가 없는 쪽은 그 자리에
 * 머물고, **서열은 어느 단계에서나 보존된다**.
 */
const AI_ORDER: Difficulty[] = ['easy', 'normal', 'hard']
export function shiftedAiLevel(level: Difficulty, shift: number): Difficulty {
  const i = AI_ORDER.indexOf(level)
  return AI_ORDER[clamp(i + shift, 0, AI_ORDER.length - 1)]
}

// --- 노드 사다리 템플릿 -----------------------------------------------------
/**
 * 지도 칸 종류. 2026-11-09 상점·휴식 칸을 **여관(`inn`)·대장간(`smith`)**으로 바꿨다
 * (`docs/redesign/INN_SMITH.md`) — 상점은 여관 안으로 들어갔고 강화는 대장간이 맡는다.
 * 모닥불(`rest`)은 이제 지도 칸이 아니라 **? 칸의 정체 하나**로만 남는다(`QuestionFate`).
 */
export type NodeType = 'combat' | 'elite' | 'boss' | 'event' | 'inn' | 'smith' | 'treasure'
export interface RunNode {
  type: NodeType
  monsterId?: string // combat/elite/boss
  /** 가로 줄(0 ~ `MAP_COLS - 1`). 화면에서 어느 열에 그릴지 — 간선은 옆 줄까지만(|Δlane| ≤ 1) 난다. */
  lane: number
  /** 다음 층에서 **이 칸에서 갈 수 있는** 노드들의 인덱스. 마지막 층은 빈 배열. */
  next: number[]
}
/**
 * **지도 두 장(막)** — 1막 초원 · 2막 던전, 막마다 20층이고 20층은 보스(2026-11-12 사용자 지정).
 * 1막 보스를 잡으면 2막 지도로 넘어가고, 2막 보스를 잡으면 런 클리어.
 * `RunState.floor`는 **그 막 안의 층**(1~20)이고 `act`가 막이다. 몬스터 세기 · 골드 · 유물 등급은
 * 두 막을 이은 깊이(`runDepth` — 옛 15층 곡선에 맞춘 1~15)로 잰다.
 */
export const LADDER_FLOORS = 20
export const ACTS = 2
export const TOTAL_FLOORS = LADDER_FLOORS * ACTS
/** 지도 가로 줄 수. */
export const MAP_COLS = 5
/** 옛 곡선의 끝 깊이 — 몬스터 체력·공격 · 골드 · 유물 등급 가중은 1~15 위에서 튜닝됐다. */
export const MAX_DEPTH = 15
/** 두 막을 이은 층 번호(1 ~ 40). */
export const globalFloor = (run: Pick<RunState, 'act' | 'floor'>): number => (run.act - 1) * LADDER_FLOORS + run.floor
/** 막 · 층 → 깊이(1 ~ 15). 40층을 옛 15층 곡선에 펴서 얹는다 — 세기 곡선은 그대로, 걸음만 촘촘해진다. */
export const depthAt = (act: number, floor: number): number =>
  1 + (((act - 1) * LADDER_FLOORS + floor - 1) * (MAX_DEPTH - 1)) / (TOTAL_FLOORS - 1)
export const runDepth = (run: Pick<RunState, 'act' | 'floor'>): number => depthAt(run.act, run.floor)

// --- 덱 룰 ------------------------------------------------------------------
/**
 * **덱 = 손패**다. 이 게임엔 셔플·드로우가 없고 `BattleScreen`의 손패는 덱 전체다
 * (`hand = deck`). 그래서 **카드는 많을수록 무조건 유리하고, 덱을 얇게 하는 전략은
 * 존재하지 않는다** — 다른 로그라이크의 "덱 압축"을 여기로 들여오면 안 된다.
 *
 * 여기서 카드 룰 세 줄이 따라 나온다(2026-08-05 확정):
 *   ① **덱 상한 20장**(유물로 +2~4). 카드가 많을수록 유리하므로 상한이 곧 유일한
 *      선택 압박이다 — 꽉 찬 뒤의 보상은 "받을까"가 아니라 "무엇과 바꿀까"가 된다.
 *   ② **줄이는 길은 교체뿐**. 꽉 찬 상태로 카드를 얻으면 1장을 버린다(`grantCard`).
 *      골드로 카드를 없애는 서비스는 **없앴다** — 얇게 만들 이득이 0이라 사는 순간
 *      손해인 함정 칸이었다(상점 `removeCard` 서비스, 2026-08-05 삭제).
 *      대가를 치르고 **더 강한 것으로 바꾸는** 거래는 남아 있다(이벤트 카드→유물).
 *   ③ **이동 4방향은 잠긴다**(`LOCKED_CARD_IDS`). 아래 참고.
 */
/**
 * **덱 상한은 종류별이다**(2026-11-10 사용자 지정 — "공격 카드는 5장 정도면 충분 · 수비·힐·기력도
 * 합쳐서 5장 · 화면에 스크롤이 없게"). 손패가 **공격 한 장 / 이동·보조 한 장** 두 쪽으로 넘겨 보는데,
 * 한 쪽에 5장이 넘으면 화면에 안 들어간다. 이동은 묶음 한 장으로 접히므로 상한이 없다.
 * ⚠ 옛 "덱 20장" 상한·덱 상한 유물(`deckCapBonus`)은 없앴다 — 쪽마다 들어갈 자리가 정해져 있다.
 */
export const ATTACK_CAP = 5
export const SUPPORT_CAP = 5
/** 카드가 덱의 어느 칸을 쓰는가 — 공격 / 보조(수비·회복·기력·강화) / 이동. */
export type DeckSlot = 'attack' | 'support' | 'move'
export const slotOfCard = (c: Pick<CardDef, 'kind'>): DeckSlot =>
  c.kind === 'move' ? 'move' : c.kind === 'attack' ? 'attack' : 'support'
export const DECK_SLOT_LABEL: Record<DeckSlot, string> = { attack: '공격', support: '보조', move: '이동' }
/**
 * 어떤 경로로도 덱에서 뺄 수 없는 카드 — **직교 이동 4장**.
 *
 * 이동은 카드를 고르는 게 아니라 **판의 칸을 눌러서** 한다(2026-08-03). 그 노란 칸은
 * `BattleScreen`의 `moveTargets`가 **덱에 있는 이동 카드**를 훑어 만들기 때문에,
 * `m-up` 한 장이 빠지면 위로 가는 칸이 영영 안 밝혀지고 손패엔 이동 칩도 없어서
 * **왜 못 가는지 보이지도 않는다**. 넷이 다 있어야 어느 칸에든 닿을 수 있다.
 *
 * ⚠ 잠그는 건 이 **넷뿐**이다. 나중에 주운 대시·대각 이동(`m-right2`·`m-ur` 등)은
 * `kind: 'move'`지만 잠기지 않는다 — 덱이 꽉 찼을 때 더 좋은 카드와 바꿀 길을
 * 막아 버리기 때문이다. 그러니 **`kind`로 판정하지 말고 이 목록으로 판정한다.**
 */
export const LOCKED_CARD_IDS: readonly string[] = ['m-up', 'm-down', 'm-left', 'm-right']
export const isLockedCard = (cardId: string): boolean => LOCKED_CARD_IDS.includes(cardId)

// --- 튜닝 상수 --------------------------------------------------------------
/** 승리 보상으로 보여주는 선택지 수(5장 중 1택). */
const REWARD_OPTIONS = 5 // 2026-11 리디자인: 일반 5장 · 엘리트는 카드 4 + 유물 1
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
  return Math.round(0.03 * d + 0.004 * d * d)
}
/** 엘리트 보정 — 엘리트 노드는 같은 몬스터라도 더 두껍고 더 아프다. */
const ELITE_HP_MULT = 1.2
const ELITE_ATK_BONUS = 1
/**
 * 보스 보정 — 보스는 **두꺼워지는 대신 아파진다**. 마지막 층에서 층 스케일을 그대로
 * 먹으면 체력 400에 육박해 15턴 독안개 소모전이 됐고(시뮬), 그 싸움은 유물로 지속력을
 * 쌓은 플레이어가 그냥 이긴다(승률 79%). 체력 스케일은 깎고 화력을 얹어 짧고 무섭게.
 */
const BOSS_HP_SCALE_FACTOR = 0.4
const GOLD_BASE = 15
const GOLD_PER_FLOOR = 4
const GOLD_ELITE_BONUS = 40
/** 보스 골드 = 엘리트와 비슷하게(2026-11-12 사용자 지정 — 예전 80). */
const GOLD_BOSS_BONUS = 40
/** 가격은 2026-11-12에 올렸다(사용자 — 2막 × 20층이라 런당 골드가 2배 넘게 늘었다. 받는 골드는 그대로, 쓰는 곳을 비싸게). 카드 35 → 60. */
const PRICE_CARD = 60
/** 고블린 상점 물약의 정가(여관 상점엔 물약이 없다 — 회복은 여관 휴식이 맡는다). */
const PRICE_HEAL = 50

/**
 * 시작 덱 — **공용 기본 카드 9장뿐**(이동4 + 약공3 + 버티기 + 원기). 2026-07-31에
 * 직업 카드 1장 선택을 없앴다: 런에선 큰 카드가 항상 유리해서 "시그니처로 시작"이
 * 정답이 되고 나머지 선택이 함정이었으며, 그 시작이 1~6층을 무료로 만들었다.
 * 이제 직업 카드·강한 런 카드는 **보상으로 번다** — 기획서 ③의 원래 의도다.
 */
const STARTING_COMMON = [
  'm-up', 'm-down', 'm-left', 'm-right',
  'c-brace', 'c-energy',
]

/**
 * 시작 덱 9장 = 공용 6장(이동4 + 버티기 + 원기) + **그 직업의 기본기 3장**.
 * 2026-08-04까지는 세 직업 모두 공용 약공(`c-strike`/`c-shot`/`c-jab`)으로 출발해
 * 1~5층이 어느 직업이든 똑같은 싸움이었다. 총합 화력은 그대로 두고 **때리는 모양**만
 * 갈랐다(전사=밀착·강타 / 궁수=긴 사거리 / 마법사=광역) — 수치 근거는 `roster.ts`의
 * `basics` 주석. 강한 직업 카드는 여전히 보상으로 번다.
 */
export function startingDeck(charId: string): string[] {
  return [...STARTING_COMMON, ...getChar(charId).basics.map((c) => c.id)]
}

/**
 * `choosing` = 이번 층의 갈래를 아직 안 골랐다(2026-08-04 분기 지도).
 * 나머지는 고른 노드에 따라 정해진다(`statusForNode`).
 */
export type RunStatus = 'choosing' | 'fighting' | 'reward' | 'event' | 'inn' | 'smith' | 'treasure' | 'won' | 'lost'

export interface RunState {
  charId: string
  /** 이 런의 난이도(2026-08-11). 전투마다 `runbattle.ts`가 읽어 봇의 눈을 조인다. */
  difficulty: RunDifficulty
  relicIds: string[]
  deck: string[]
  /**
   * 카드 강화 기록(2026-11 룰렛) — 카드 id → 더한 수치·칸·횟수(`upgrades.ts`).
   * 덱(id 목록)과 따로 둬서 `deckCap`·교체·제거 로직이 그대로다.
   */
  upgrades: Record<string, CardUpgrade>
  /**
   * 칸이 아니라 **이벤트가 연 전투**(항아리 뱀 · 고블린 습격). 있으면 `currentEnemy`가
   * 칸의 몬스터 대신 이걸 쓰고, 보상 화면이 `kind`로 보상을 고른다. 층을 넘기면 지운다.
   */
  special?: SpecialFight
  /** 이벤트로 깎인 최대 체력 합(유물로 다시 계산해도 남게). */
  maxHpLoss?: number
  /** 이번 런에서 고블린 상점에 쓴 골드 — 단계(가난·중간·부자)를 정한다. 덮쳐서 이기면 0. */
  goblinSpent?: number
  /** 이번 런에 이미 만난 ? 이벤트 id — 다 보기 전에는 다시 안 나온다(2026-11-12 사용자 지정). */
  seenEvents?: string[]
  hp: number
  maxHp: number
  gold: number
  /** 몇 막인가(1 = 초원 · 2 = 던전). */
  act: number
  /** 그 막 안의 층(1 ~ `LADDER_FLOORS`). */
  floor: number
  /**
   * 층별 노드와 그 사이의 간선(2026-08-05). `map[floor-1]`이 그 층에 놓인 칸들이고,
   * 각 칸의 `next`가 다음 층에서 갈 수 있는 칸이다. **고를 수 있는 건 직전 칸에서
   * 이어진 칸뿐**이라(`currentOptions`), 선택지 수가 층마다 1~3개로 달라진다.
   * 생성 규칙과 불변식은 `buildMap` 주석 참고.
   */
  map: RunNode[][]
  /**
   * 층마다 고른 **노드 인덱스**(그 층 `map[floor-1]` 안에서의 위치). ⚠ 선택지 목록
   * 안에서의 순번이 아니다 — 선택지는 직전 칸에 따라 달라지므로 노드로 기억해야
   * 지나온 길을 그대로 되짚을 수 있다. 없으면 아직 안 골랐다.
   */
  picked: number[]
  status: RunStatus
}

export interface SpecialFight {
  /** jar = 항아리 뱀 · ambush = ? 칸의 매복 전투 · goblin = 고블린 습격 · spirit = 초록 정령의 늑대. */
  kind: 'jar' | 'ambush' | 'goblin' | 'spirit'
  monsterId: string
  /** 엘리트 보정(체력 ×·공격 +)으로 나온다. */
  elite?: boolean
  /** 고블린 습격 — 덮친 고블린의 단계와 그때 진열(이기면 여기서 전리품을 고른다). */
  goblinTier?: GoblinTier
  goblinStock?: GoblinItem[]
  /** 플레이어가 중독 N겹으로 시작(항아리). */
  startPoison?: number
  /** 이겨서 받은 덤 유물(보상 화면 안내용). */
  wonRelicId?: string
  /** 가난한 고블린을 이겨 무작위로 받은 진열품. */
  wonItemId?: string
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
/** 일반 전투 몬스터 티어 — 깊이(`runDepth`, 1~15) 기준. 1막 앞쪽 t1 · 1막 나머지 t2 · 2막 t3(+ 깊은 곳 t4). */
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

/** 그 층의 일반 전투 몬스터 하나(티어 풀에서 뽑는다). `exclude`와는 다른 몬스터로. */
function combatMonster(floor: number, exclude?: string): string {
  const poolT = combatPool(floor)
  const pool = poolT.length ? poolT : monstersOfTier(1)
  const distinct = pool.filter((m) => m.id !== exclude)
  return pick(distinct.length ? distinct : pool).id
}

/**
 * 칸 종류 가중치(1 · 20층과 보물 칸을 뺀 나머지 층) — 2026-11-12 사용자 지정 지도.
 * 엘리트는 6층부터, 대장간은 3층부터, 여관은 5층부터. 보스 앞 여관 층은 없다(사용자 — "그 전에 알아서 체력을 챙겨야 한다").
 */
const NODE_WEIGHTS: [NodeType, number][] = [['combat', 50], ['event', 22], ['elite', 10], ['inn', 10], ['smith', 8]]
const allowedAt = (t: NodeType, floor: number): boolean =>
  t === 'elite' ? floor >= 6 : t === 'inn' ? floor >= 5 : t === 'smith' ? floor >= 3 : true
/** 이어서 같은 걸 두 번 밟지 않게 하는 종류 — 엘리트 · 여관 · 대장간은 부모 칸과 겹치면 다시 뽑는다. */
const NO_REPEAT: NodeType[] = ['elite', 'inn', 'smith']
/** 지도를 그리는 길 수. 길이 겹치는 곳이 칸이 되고, 길이 안 지나간 곳은 비어 있다. */
const MAP_PATHS = 6
/** 보물 칸이 놓일 수 있는 층(지도 하나에 딱 하나). */
const TREASURE_FLOORS: [number, number] = [8, 12]
/** 막별 보스 — 1막은 수호기사 · 화염군주 중 하나, 2막은 오버로드. */
const ACT_BOSSES: string[][] = [['warden', 'pyrelord'], ['overlord']]

/**
 * 지도 한 장(막 하나) — **길 그리기 방식**(2026-11-12 사용자 지정: "어느 칸에서든 다음 층 가운데로
 * 갈 수 없어도 괜찮다. 못 가는 곳이 있어야 시작점을 잘 고른다").
 *
 * 1) 길 `MAP_PATHS`개를 1층 무작위 줄에서 출발시켜 19층까지 한 층씩 옆 줄(−1 · 0 · +1)로 올린다.
 *    처음 두 길은 출발 줄이 다르다. 이미 난 간선과 **엇갈리는**(X자) 걸음은 피한다.
 * 2) 길이 지나간 자리가 칸, 걸음이 간선이다. 그래서 **한 칸에서 못 가는 칸이 생긴다**.
 * 3) 20층은 보스 하나 — 19층 칸이 전부 보스로 이어진다.
 * 4) 종류: 1층 = 전투, 보물 = 8 ~ 12층의 칸 하나, 나머지는 `NODE_WEIGHTS`(19층도 — 보스 앞 여관 층은 없다).
 */
function buildMap(act: number): RunNode[][] {
  const F = LADDER_FLOORS
  const W = MAP_COLS
  // edge[f][c] = f층 c줄에서 f+1층으로 가는 줄들 (f는 0부터)
  const edge: Set<number>[][] = Array.from({ length: F }, () => Array.from({ length: W }, () => new Set<number>()))
  const used: boolean[][] = Array.from({ length: F }, () => new Array<boolean>(W).fill(false))
  let first = -1
  for (let p = 0; p < MAP_PATHS; p++) {
    let c = Math.floor(Math.random() * W)
    if (p === 1) while (c === first) c = Math.floor(Math.random() * W)
    if (p === 0) first = c
    used[0][c] = true
    for (let f = 0; f < F - 2; f++) {
      // 엇갈림 = 옆 줄에서 이쪽으로 오는 간선이 이미 있다(c → n 과 n → c).
      const cand = [c - 1, c, c + 1].filter((n) => n >= 0 && n < W && !(n !== c && edge[f][n].has(c)))
      const n = cand.length ? pick(cand) : c
      edge[f][c].add(n)
      used[f + 1][n] = true
      c = n
    }
  }
  const floors: RunNode[][] = []
  const indexOf: number[][] = []
  for (let f = 0; f < F - 1; f++) {
    const cols = used[f].map((u, c) => (u ? c : -1)).filter((c) => c >= 0)
    indexOf[f] = new Array<number>(W).fill(-1)
    cols.forEach((c, i) => (indexOf[f][c] = i))
    floors[f] = cols.map((c) => ({ type: 'combat' as NodeType, lane: c, next: [] }))
  }
  floors[F - 1] = [{ type: 'boss', monsterId: pick(ACT_BOSSES[Math.min(act, ACT_BOSSES.length) - 1]), lane: Math.floor(W / 2), next: [] }]
  for (let f = 0; f < F - 1; f++)
    floors[f].forEach((n) => {
      n.next = f === F - 2 ? [0] : [...edge[f][n.lane]].sort((a, b) => a - b).map((c) => indexOf[f + 1][c])
    })

  // 종류 — 아래층부터 정해야 부모 칸 종류를 볼 수 있다.
  const tFloor = TREASURE_FLOORS[0] + Math.floor(Math.random() * (TREASURE_FLOORS[1] - TREASURE_FLOORS[0] + 1))
  const tIdx = Math.floor(Math.random() * floors[tFloor - 1].length)
  for (let f = 0; f < F - 1; f++) {
    const floor = f + 1
    const depth = depthAt(act, floor)
    floors[f].forEach((n, i) => {
      let type: NodeType
      if (floor === 1) type = 'combat'
      else if (floor === tFloor && i === tIdx) type = 'treasure'
      else {
        const parents = floors[f - 1].filter((p) => p.next.includes(i)).map((p) => p.type)
        const pool = NODE_WEIGHTS.filter(([t]) => allowedAt(t, floor) && !(NO_REPEAT.includes(t) && parents.includes(t)))
        let r = Math.random() * pool.reduce((a, [, w]) => a + w, 0)
        type = 'combat'
        for (const [t, w] of pool) if ((r -= w) < 0) { type = t; break }
      }
      n.type = type
      if (type === 'combat') {
        const sib = floors[f][i - 1]?.monsterId
        n.monsterId = combatMonster(depth, sib)
      } else if (type === 'elite') n.monsterId = pick(elitePool(depth)).id
    })
  }
  return floors
}

// --- 전장 배경 --------------------------------------------------------------
/**
 * 전투 배경 장면. CSS `.boardfloor--<id>`와 **이름이 짝**이다(`battlefx.css`).
 * 규칙이 아니라 연출이라 엔진·시뮬은 이 값을 모른다 — 밸런스에 영향 없음.
 */
export type BattleScene = 'grassland' | 'dungeon' | 'lava' | 'abyss' | 'sanctum'
/**
 * 층에 맞는 배경. 2026-11 리디자인으로 지역이 둘이 됐다 — **초원(1~7층) → 던전(8층~)**.
 *
 * ⚠ **스크립트 보스는 층 규칙을 이긴다**(2026-08-05). 셋이 다 용암을 쓰던 걸
 * 보스마다 전용 무대로 갈랐다 — 오버로드=심연(`abyss`) · 수호기사=성소(`sanctum`) ·
 * 화염군주=용암(`lava`). 무대를 정하는 건 **노드 종류가 아니라 몬스터 id**다:
 * 수호기사·화염군주는 `boss` 칸이 아니라 **엘리트 칸**으로 나오므로 종류로 판정하면
 * 둘은 영영 자기 무대를 못 본다. 배경이 곧 "지금 보스다"라는 신호가 되게 한다.
 */
/** 막 → 지역. 1막 초원 · 2막 던전(지도가 늘면 여기에 더한다). */
export const regionOf = (run: Pick<RunState, 'act'>): 'grassland' | 'dungeon' => (run.act <= 1 ? 'grassland' : 'dungeon')
export const regionName = (run: Pick<RunState, 'act'>): string => (regionOf(run) === 'grassland' ? '초원' : '던전')
/** 화면 머리의 자리 표시 — "1막 초원 · 7층". */
export const placeLabel = (run: Pick<RunState, 'act' | 'floor'>): string => `${run.act}막 ${regionName(run)} · ${run.floor}층`

export function sceneFor(run: RunState): BattleScene {
  const node = currentNode(run)
  if (node.monsterId) {
    const boss = bossScene(node.monsterId)
    if (boss) return boss
  }
  return regionOf(run)
}

// --- 지형(바위) -------------------------------------------------------------
/**
 * 판에 미리 서 있는 바위(`BattleOpts.obstacles`). 규칙은 `types.ts`의 지형 절
 * (못 들어간다 · 사격선을 끊는다 · 부술 수 있다).
 *
 * **누가 데려오는가 (2026-08-07 사용자 결정으로 뒤집힘)** — 2026-08-05에는 지형이
 * **무대**에 붙어 있었다. 1층 묘지부터 비석 둘이 서 있었고, 그래서 첫 전투부터
 * 판이 막혀 있었다. 사용자 신고: *"바위가 처음부터 나오는 건 좀 별로 — 중간 보스나
 * 골렘 같은 몇몇 애들한테 나오도록."* 지형이 **분위기**가 아니라 **그 적의 능력**이
 * 되면, 판이 막힌 것 자체가 "이번 상대는 다르다"는 신호가 된다. 그래서 이제:
 *   ⓐ 몬스터가 `MonsterDef.terrain`을 가졌으면 그 배치 (골렘 · 가디언 · 화염군주)
 *   ⓑ 보스 전용 무대면 **빈 판** — 심연은 "도망칠 수 없다"가 정체성이라 엄폐물이
 *      컨셉과 부딪히고, 성소의 바위는 수호기사가 직접 세우는 것이라 미리 깔면
 *      「석벽 소환」이 무슨 일을 한 건지 안 보인다
 *   ⓒ 그 밖의 **엘리트 칸**이면 무너진 무대(`ELITE_TERRAIN`) — 첫 엘리트가 7층이라
 *      바위를 처음 보는 것도 그때다
 *   ⓓ 일반 전투는 **빈 판**
 *
 * 배치 원칙 셋 — 이걸 어기면 재미가 아니라 짜증이 된다:
 *   ① **열을 완전히 막지 않는다.** 어느 열에도 최소 두 칸은 뚫려 있어야 한다.
 *      한 열이 통째로 막히면 접근 자체가 불가능해지는 개전이 나온다.
 *   ② **끝열(0·5)에 두지 않는다.** 양쪽 시작 자리이고, 6턴에 가장 먼저 무너지는
 *      열이라 바위를 세워 봐야 금방 사라진다.
 *   ③ **대부분의 전투는 빈 판이다.** 전부 지형이 있으면 지형이 배경이 돼 버린다 —
 *      빈 판이 기본이어야 "이 전투는 다르다"가 읽힌다.
 * ⚠ **여기서 나오는 바위는 런 전용이다.** PvP·봇전은 `terrainFor`를 안 부른다.
 *   다만 2026-08-07부터 **카드가 세우는 바위**(`raiseRocks`)는 PvP에도 있다 —
 *   그래서 `RULES_VERSION`이 6으로 올랐다(`types.ts`).
 * ⚠ 여기 손대면 `npm run sim:run -- --sweep`으로 밴드를 다시 잰다 — 바위는 접근
 *   경로와 사격선을 동시에 바꾸므로 직업마다 다르게 얹힌다.
 */
const rock = (col: number, row: number, hp = ROCK_HP): Obstacle => ({
  cell: { col, row },
  hp,
  maxHp: hp,
})

/** 이름 붙은 바위 배치. `npm run check`가 위 원칙 ①②를 이 표에서 직접 검사한다. */
export const TERRAIN: Record<TerrainId, readonly Obstacle[]> = {
  // 무너진 잔해 둘. 대각으로 어긋나게 둬서 어느 줄도 막지 않는다 — 엘리트 칸의
  // 기본 배치이자 골렘이 데려오는 것.
  rubble: [rock(2, 0, 34), rock(3, 3, 34)],
  // 무너진 기둥이 같은 열에 둘. col 3이 아래 두 줄로만 지나가는 **좁은 문**이 된다.
  // 가디언(거북이)과 짝이라 제일 단단하다.
  pillars: [rock(3, 0, 62), rock(3, 1, 62)],
  // 굳은 용암 덩이 하나. 가운데를 가로막아 직선 접근을 꺾는다.
  lavaslab: [rock(3, 1)],
}

/** 몬스터가 자기 지형을 안 가진 엘리트 칸의 기본 배치. */
const ELITE_TERRAIN: TerrainId = 'rubble'

/**
 * 함정 배치(2026-11 리디자인 · 시안 `Hazards`). **일반 전투(? 매복 포함)의 일부에만** 깔린다 —
 * 엘리트는 바위, 보스·고블린은 빈 판이라 지형 면을 겹치지 않는다. 종류는 지역이 고른다:
 * 초원 = 가시덩굴 · 불길 / 던전 = 가시덫 · 빙판 · 불길. 끝열(시작 자리)은 비운다.
 */
const HAZARD_CHANCE = 0.4
const REGION_HAZARDS: Record<'grassland' | 'dungeon', HazardKind[]> = {
  grassland: ['bramble', 'fire'],
  dungeon: ['spikes', 'ice', 'fire'],
}
export function hazardsFor(run: RunState, rng: () => number = Math.random): Hazard[] {
  const sp = run.special
  const combat = sp ? sp.kind === 'ambush' : currentNode(run).type === 'combat'
  if (!combat || rng() >= HAZARD_CHANCE) return []
  const kinds = REGION_HAZARDS[regionOf(run)]
  const cells: { col: number; row: number }[] = []
  for (let col = 1; col < GRID_COLS - 1; col++) for (let row = 0; row < GRID_ROWS; row++) cells.push({ col, row })
  const n = 2 + Math.floor(rng() * 2)
  const out: Hazard[] = []
  for (let i = 0; i < n && cells.length; i++) {
    const cell = cells.splice(Math.floor(rng() * cells.length), 1)[0]
    const kind = kinds[Math.floor(rng() * kinds.length)]
    out.push({ kind, cell, ...(kind === 'spikes' ? { phase: Math.floor(rng() * 3) } : null) })
  }
  return out
}

export function terrainFor(run: RunState): readonly Obstacle[] {
  const node = currentNode(run)
  const own = node.monsterId ? getMonster(node.monsterId).terrain : undefined
  if (own) return TERRAIN[own]
  // 보스 전용 무대는 비워 둔다(ⓑ) — 엘리트 칸으로 나오는 보스가 있으므로 아래
  // 엘리트 규칙보다 **먼저** 걸러야 한다.
  if (node.monsterId && bossScene(node.monsterId)) return []
  return node.type === 'elite' ? TERRAIN[ELITE_TERRAIN] : []
}

// --- 파생값 -----------------------------------------------------------------
export function computeMaxHp(charId: string, relicIds: string[]): number {
  const base = getChar(charId).maxHp
  // 직업 패시브(런)의 최대 체력 보정이 여기서 같이 들어간다(`mergeRelics`의 charId).
  return Math.max(1, base + (mergeRelics(relicIds, charId).maxHpBonus ?? 0))
}
/**
 * 이번 층에서 고를 수 있는 칸의 **노드 인덱스**. 1층은 전부 열려 있고, 그 뒤로는
 * 직전 층에서 고른 칸의 `next`만 열린다 — 그래서 갈래가 1~3개로 달라진다.
 */
export function currentOptionIndices(run: RunState): number[] {
  const floor = run.map[run.floor - 1] ?? []
  if (run.floor <= 1) return floor.map((_, i) => i)
  const prevNodes = run.map[run.floor - 2] ?? []
  const prev = prevNodes[run.picked[run.floor - 2] ?? 0]
  const next = (prev?.next ?? []).filter((i) => i >= 0 && i < floor.length)
  // 저장본이 깨졌거나 경로가 끊겼으면 그 층 전체를 열어 준다 — 런이 막히는 것보다 낫다.
  return next.length ? next : floor.map((_, i) => i)
}
/** 이번 층에서 고를 수 있는 칸들. */
export function currentOptions(run: RunState): RunNode[] {
  const floor = run.map[run.floor - 1] ?? []
  return currentOptionIndices(run).map((i) => floor[i])
}
/**
 * "매 층 가운데 줄"을 따라가는 선택지의 순번. 분기 이전 선형 사다리와 같은 경로라
 * 밸런스 기준선을 재는 데 쓴다(`sim:run --path=template`). 가운데 칸은 항상 이어져
 * 있으므로 늘 존재한다(`buildMap` 참고).
 */
export function templateOptionIndex(run: RunState): number {
  const opts = currentOptions(run)
  // 길 그리기 지도(2026-11-12)엔 고정 뼈대가 없다 — 가운데 줄에 가장 가까운 칸을 고른다.
  const mid = (MAP_COLS - 1) / 2
  let at = 0
  opts.forEach((n, i) => {
    if (Math.abs(n.lane - mid) < Math.abs(opts[at].lane - mid)) at = i
  })
  return at
}
/** 이번 층에서 이미 골랐는가. `status === 'choosing'`과 짝이다. */
export function hasPicked(run: RunState): boolean {
  return run.picked[run.floor - 1] !== undefined
}
/**
 * 이번 층에서 **고른** 칸. ⚠ 고르기 전(`status === 'choosing'`)에 부르면 안 된다 —
 * 전투/보상 로직은 전부 고른 뒤에 도는 자리라 그때만 유효하다. 아직 안 골랐으면
 * 0번으로 떨어뜨린다(옛 선형 사다리와 같은 칸이라 최소한 엉뚱하지는 않다).
 */
export function currentNode(run: RunState): RunNode {
  const floor = run.map[run.floor - 1] ?? []
  return floor[run.picked[run.floor - 1] ?? currentOptionIndices(run)[0] ?? 0]
}
/**
 * 갈래를 골라 그 칸으로 확정한다 — 지도 화면의 유일한 진입 경로.
 * `index`는 **선택지 목록 안에서의 순번**이고, 저장되는 건 노드 인덱스다.
 */
export function chooseBranch(run: RunState, index: number): RunState {
  const idxs = currentOptionIndices(run)
  const at = clamp(index, 0, Math.max(0, idxs.length - 1))
  const node = run.map[run.floor - 1][idxs[at]]
  const picked = run.picked.slice()
  picked[run.floor - 1] = idxs[at]
  return { ...run, picked, status: statusForNode(node) }
}
/**
 * 엘리트·보스의 붕괴 지연(라운드). 일반 전투는 6라운드부터 무너지고 엘리트·보스는 10라운드부터 —
 * 체력이 많아 6라운드면 아직 판이 한창이라 "너무 빠르다"는 신고(2026-11-10).
 */
export const ELITE_COLLAPSE_DELAY = 4
/** 이 전투가 엘리트·보스인가 — 지도 칸, 또는 이벤트가 연 엘리트 전투(초록 정령의 늑대). */
export function isEliteFight(run: RunState): boolean {
  return run.special ? !!run.special.elite : isEliteFloor(run)
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
  if (run.special)
    return enemyForNode(run, { type: run.special.elite ? 'elite' : 'combat', monsterId: run.special.monsterId, lane: 1, next: [] })
  return enemyForNode(run, currentNode(run))
}
/**
 * 임의의 칸에 대한 스케일 적용 몬스터. 지도에서 **고르기 전에** 각 갈래의 적을
 * 미리 보여 주려면 필요하다 — 뭘 상대하는지 모르면 고르는 게 도박이 된다.
 */
export function enemyForNode(run: RunState, node: RunNode): MonsterDef {
  const base = getMonster(node.monsterId ?? 'grunt')
  const elite = node.type === 'elite' && base.tier < 4
  const boss = node.type === 'boss'
  const d = runDepth(run)
  const depth = (d - 1) * (boss ? BOSS_HP_SCALE_FACTOR : 1)
  const hpScale = (1 + HP_SCALE_PER_FLOOR * depth) * (elite ? ELITE_HP_MULT : 1)
  const atk = atkScaleAt(d) + (elite ? ELITE_ATK_BONUS : 0)
  return {
    ...base,
    maxHp: Math.round(base.maxHp * hpScale),
    passive: { ...base.passive, attackBonus: (base.passive.attackBonus ?? 0) + atk },
  }
}
function statusForNode(node: RunNode): RunStatus {
  if (node.type === 'event') return 'event'
  if (node.type === 'inn') return 'inn'
  if (node.type === 'smith') return 'smith'
  if (node.type === 'treasure') return 'treasure'
  return 'fighting'
}

// --- 런 시작 ----------------------------------------------------------------
export function startRun(charId: string, difficulty: RunDifficulty = DEFAULT_DIFFICULTY): RunState {
  // 유물 없이 시작한다 — 직업 패시브는 유물이 아니다(`relics.ts`의 `classPassive`).
  const relicIds: string[] = []
  const maxHp = computeMaxHp(charId, relicIds)
  return {
    charId,
    difficulty,
    relicIds,
    deck: startingDeck(charId),
    upgrades: {},
    hp: maxHp,
    maxHp,
    gold: 0,
    act: 1,
    floor: 1,
    map: buildMap(1),
    picked: [],
    // 1층부터 고른다 — 어느 칸으로 들어갈지가 런의 첫 결정이다.
    status: 'choosing',
  }
}

// --- 유물의 전투 밖 효과 ----------------------------------------------------
/** 장착 유물의 메타 효과 묶음(상점 할인·골드·보상 칸·진열 칸·회복량). */
export function runMods(run: RunState): RunMods {
  return mergeRunMods(run.relicIds)
}
/** 그 칸의 상한 — 이동은 묶음으로 접혀서 끝이 없다. */
export function deckCap(slot: DeckSlot): number {
  return slot === 'attack' ? ATTACK_CAP : slot === 'support' ? SUPPORT_CAP : Infinity
}
/** 카드 id → 덱 칸(모르는 id는 보조로 — 공격 칸을 잘못 막지 않게). */
export function slotOfId(run: RunState, cardId: string): DeckSlot {
  const c = resolveRunCard(run.charId, cardId)
  return c ? slotOfCard(c) : 'support'
}
/** 덱에서 그 칸을 쓰는 카드 수. */
export function slotCount(run: RunState, slot: DeckSlot): number {
  return run.deck.filter((id) => slotOfId(run, id) === slot).length
}
/** 이 카드를 받으려면 한 장을 버려야 하는가(그 칸이 꽉 찼다). */
export function needsReplaceFor(run: RunState, cardId: string): boolean {
  if (run.deck.includes(cardId)) return false
  const slot = slotOfId(run, cardId)
  return slotCount(run, slot) >= deckCap(slot)
}
/** 이 카드와 바꿀 수 있는 덱 카드 — **같은 칸**에서만(공격을 받으려 수비를 버려 봐야 자리가 안 난다). */
export function replaceCandidates(run: RunState, cardId: string): string[] {
  const slot = slotOfId(run, cardId)
  return run.deck.filter((id) => !isLockedCard(id) && slotOfId(run, id) === slot)
}

// --- 전투 결과 --------------------------------------------------------------
/**
 * 이 전투로 받는 골드. 랜덤이 없어 **보상 화면이 같은 값을 다시 계산해** "+N"으로
 * 보여 줄 수 있다(`afterWin`이 이미 더해 둔 몫이라 화면에만 쓰인다).
 */
export function goldForWin(run: RunState): number {
  const node = currentNode(run)
  let g = GOLD_BASE + GOLD_PER_FLOOR * runDepth(run)
  if (node.type === 'elite') g += GOLD_ELITE_BONUS
  if (node.type === 'boss') g += GOLD_BOSS_BONUS
  if (run.special) g = GOLD_BASE + GOLD_PER_FLOOR * runDepth(run) + (run.special.elite ? GOLD_ELITE_BONUS : 0)
  const bonus = runMods(run).goldBonusPct ?? 0
  return Math.round(g * (1 + bonus / 100))
}
/**
 * 전투에서 이기면 체력 10 회복(2026-11-09 사용자 지정 — 보상 건너뛰기 회복을 없앤 뒤
 * 클리어율이 20% 아래(17.4%)로 내려가면 넣기로 정해 둔 값). 남은 체력에 더한다.
 */
export const WIN_HEAL = 10
/** 승리 — 남은 체력 + `WIN_HEAL` 인계 + 골드 획득 → 보상 단계(보스면 클리어). */
export function afterWin(run: RunState, hpLeft: number): RunState {
  const hp = clamp(Math.round(hpLeft) + WIN_HEAL, 0, run.maxHp)
  const gold = run.gold + goldForWin(run)
  // 마지막 막의 보스만 런 클리어 — 1막 보스는 보상(희귀 · 영웅 유물 고르기)을 받고 2막으로 간다.
  if (!run.special && currentNode(run).type === 'boss' && run.act >= ACTS) return { ...run, hp, gold, status: 'won' }
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
export function rollRelicId(run: RunState): string | undefined {
  return pickWeightedRelic(availableRelicDefs(run), runDepth(run))?.id
}
/** 유물 장착(최대체력 증가분만큼 현재 체력도 함께 오른다). */
export function grantRelic(run: RunState, relicId: string): RunState {
  if (!relicId || run.relicIds.includes(relicId)) return run
  const relicIds = [...run.relicIds, relicId]
  const maxHp = Math.max(1, computeMaxHp(run.charId, relicIds) - (run.maxHpLoss ?? 0))
  const delta = maxHp - run.maxHp
  const hp = Math.min(run.hp + Math.max(0, delta), maxHp)
  return { ...run, relicIds, maxHp, hp: clamp(hp, 1, maxHp) }
}
/**
 * 등급 확률로 유물 하나(2026-11-12 사용자 지정 보상표). 그 등급에 남은 게 없으면 다른 등급에서.
 *   일반 전투 = 일반 · 엘리트 = 희귀(영웅 아주 낮게) · 보스 = 영웅(전설 낮게) · 보물 = 일반 · 희귀(영웅 아주 낮게)
 */
export type RarityOdds = [Rarity, number][]
export const COMBAT_RELIC_ODDS: RarityOdds = [['common', 1]]
export const ELITE_RELIC_ODDS: RarityOdds = [['rare', 0.94], ['epic', 0.06]]
export const BOSS_RELIC_ODDS: RarityOdds = [['epic', 0.88], ['legend', 0.12]] // 영웅, 낮은 확률로 전설(2026-11-12 사용자)
export const TREASURE_RELIC_ODDS: RarityOdds = [['common', 0.55], ['rare', 0.4], ['epic', 0.05]]
export const BOSS_RELIC_OPTIONS = 3
export function rollRelicOf(run: RunState, odds: RarityOdds, exclude: string[] = []): string | undefined {
  const avail = availableRelicDefs(run).filter((r) => !exclude.includes(r.id))
  let r = Math.random() * odds.reduce((a, [, w]) => a + w, 0)
  let rarity = odds[odds.length - 1][0]
  for (const [k, w] of odds) if ((r -= w) < 0) { rarity = k; break }
  const same = avail.filter((x) => x.rarity === rarity)
  if (same.length) return pick(same).id
  const near = avail.filter((x) => odds.some(([k]) => k === x.rarity))
  return (near.length ? pick(near) : pickWeightedRelic(avail, runDepth(run)))?.id
}
/** 무작위(미보유) 유물 하나를 준다. 다 가졌으면 소량 회복으로 대체. */
export function grantRandomRelic(run: RunState): { run: RunState; relicId?: string } {
  const relicId = rollRelicId(run)
  if (!relicId) return { run: { ...run, hp: Math.min(run.maxHp, run.hp + 20) } }
  return { run: grantRelic(run, relicId), relicId }
}
/** 유물을 잃는다(이벤트 거래·쇠 두들기기). 최대 체력이 줄면 현재 체력도 그 안으로. */
export function loseRelic(run: RunState, relicId: string): RunState {
  if (!run.relicIds.includes(relicId)) return run
  const relicIds = run.relicIds.filter((id) => id !== relicId)
  const maxHp = Math.max(1, computeMaxHp(run.charId, relicIds) - (run.maxHpLoss ?? 0))
  return { ...run, relicIds, maxHp, hp: clamp(run.hp, 1, maxHp) }
}
/**
 * 최대 체력을 깎는다(수술실). 유물 합산과 별개라 `maxHpLoss`로 따로 기억해 둔다 —
 * 안 그러면 다음 유물을 얻을 때 `computeMaxHp`가 다시 계산하며 되돌려 버린다.
 */
export function loseMaxHp(run: RunState, n: number): RunState {
  const maxHpLoss = (run.maxHpLoss ?? 0) + n
  const maxHp = Math.max(1, run.maxHp - n)
  return { ...run, maxHpLoss, maxHp, hp: clamp(run.hp, 1, maxHp) }
}

// --- 카드 강화 (2026-11 룰렛) ----------------------------------------------
/** 그 카드가 강화된 횟수(꽝은 안 센다). */
export function cardLevel(run: RunState, cardId: string): number {
  return run.upgrades[cardId]?.times ?? 0
}
/** 덱에 실제로 들어가는 카드 정의 — 강화가 반영된 사본(없으면 원본 그대로). */
export function runCard(run: RunState, cardId: string): CardDef | undefined {
  const base = resolveRunCard(run.charId, cardId)
  return base && upgradedCard(base, run.upgrades[cardId])
}
/** 강화 못 하는 이유(이동 카드 · 최대 3/3 …). 할 수 있으면 null. */
export function upgradeBlockOf(run: RunState, cardId: string): string | null {
  const base = resolveRunCard(run.charId, cardId)
  return base ? upgradeBlock(base, run.upgrades[cardId]) : '알 수 없는 카드'
}
export const canUpgradeCard = (run: RunState, cardId: string): boolean => !upgradeBlockOf(run, cardId)
/** 덱에서 강화할 수 있는 카드들. */
export function upgradableDeckCards(run: RunState): string[] {
  return run.deck.filter((id) => canUpgradeCard(run, id))
}
/** 룰렛 결과 적용 — 0 · 마이너스도 강화 1번(★)으로 센다. 수치는 카드 값이 0 아래로 안 내려간다. */
export function upgradeCard(
  run: RunState,
  cardId: string,
  gain: { value?: number; cells?: Offset[]; removed?: Offset[] },
): RunState {
  if (!canUpgradeCard(run, cardId)) return run
  const base = resolveRunCard(run.charId, cardId)!
  const f = valueFieldOf(base)
  const up = addUpgrade(run.upgrades[cardId], gain, f ? -(base[f] ?? 0) : 0)
  return { ...run, upgrades: { ...run.upgrades, [cardId]: up } }
}

/**
 * 카드 획득. 덱이 꽉 찼는데 removeId가 없으면 needsReplace로 UI에 교체를 넘긴다.
 *
 * 이미 가진 카드는 **아무 일도 없다**(2026-11 — 중복 강화 폐지). 같은 id를 두 장
 * 넣어 봐야 쿨타임·"한 라운드 한 번"이 id로 걸려 쓸모가 없어서, 보상·상점 풀이
 * 가진 카드를 아예 안 내놓는다(`cardRewardPool`).
 *
 * ⚠ 잠긴 카드(이동 4방향)를 버리려 하면 **안 고른 것과 같이** 취급한다 — 그냥
 * 무시하면 상한을 넘겨 담게 된다.
 */
export function grantCard(
  run: RunState,
  cardId: string,
  removeId?: string,
): { run: RunState; needsReplace?: boolean } {
  if (run.deck.includes(cardId)) return { run }
  // 버릴 카드는 **같은 칸**이어야 한다 — 다른 칸을 버려 봐야 이 칸에 자리가 안 난다(잠긴 카드도 같은 취급).
  if (removeId && !replaceCandidates(run, cardId).includes(removeId)) removeId = undefined
  if (needsReplaceFor(run, cardId) && !removeId) return { run, needsReplace: true }
  // 자리가 있으면 버리지 않는다(교체 화면을 거치지 않은 호출이 실수로 카드를 날리지 않게).
  if (!needsReplaceFor(run, cardId)) removeId = undefined
  let deck = run.deck
  if (removeId) {
    const i = deck.indexOf(removeId)
    deck = i >= 0 ? [...deck.slice(0, i), ...deck.slice(i + 1)] : deck
  }
  return { run: { ...run, deck: [...deck, cardId] } }
}
/**
 * 카드 제거(이벤트 "녹이기" 등). 잠긴 카드는 어떤 경로로도 빠지지 않는다.
 *
 * **강화 단계도 같이 지운다** — 안 그러면 나중에 같은 카드를 다시 주웠을 때 이미
 * 강화된 채로 들어와, 카드 제거가 조용한 이득이 된다.
 */
export function removeCard(run: RunState, cardId: string): RunState {
  if (isLockedCard(cardId)) return run
  const i = run.deck.indexOf(cardId)
  if (i < 0) return run
  const upgrades = { ...run.upgrades }
  delete upgrades[cardId]
  return { ...run, deck: [...run.deck.slice(0, i), ...run.deck.slice(i + 1)], upgrades }
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
  | { kind: 'heal'; amount: number } // 고블린 전리품의 물약

/** 그 캐릭터의 미보유 직업(고유) 카드 — 시작 덱에서 빠졌으므로 런에서 번다. */
function missingClassCards(run: RunState): string[] {
  return getChar(run.charId)
    .cards.map((c) => c.id)
    .filter((id) => !run.deck.includes(id))
}
/** 보상·상점에 나올 수 있는 카드 전체 풀(공용 확장 + 직업 + 런 전용) — **가진 카드는 뺀다**. */
/** 공용 보상 카드(이동 · 기본 수비 · 회복) — 엘리트 보상의 "좋은 카드"에선 뺀다. */
const COMMON_REWARD_IDS = ['m-right2', 'm-left2', 'm-ur', 'm-ul', 'm-dr', 'm-dl', 'c-guard', 'c-repair']
export function cardRewardPool(run: RunState): string[] {
  const commonPool = COMMON_REWARD_IDS
  const classCards = getChar(run.charId).cards.map((c) => c.id)
  // 런 카드는 공용 + 자기 직업 것만(2026-11-10 — 마법사 카드가 전사에게 나오던 문제).
  const all = [...commonPool, ...classCards, ...runCardsFor(run.charId).map((c) => c.id)]
  return all.filter((id) => !run.deck.includes(id))
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
  const node = run.special ? null : currentNode(run)
  // 보스(1막) — 영웅 유물(낮은 확률로 전설) 중 하나를 고른다(2026-11-12 사용자 지정). 카드는 없다.
  if (node?.type === 'boss') {
    const out: Reward[] = []
    for (let i = 0; i < BOSS_RELIC_OPTIONS; i++) {
      const relicId = rollRelicOf(run, BOSS_RELIC_ODDS, out.flatMap((r) => (r.kind === 'relic' ? [r.relicId] : [])))
      if (relicId) out.push({ kind: 'relic', relicId })
    }
    if (out.length) return out
  }
  const elite = node?.type === 'elite'
  const slots = REWARD_OPTIONS + (runMods(run).rewardOptions ?? 0)
  // 엘리트는 "좋은 카드" — 이동 · 기본 수비 · 회복 같은 공용 칸을 뺀 직업 · 런 카드에서만.
  const pool = elite ? cardRewardPool(run).filter((id) => !COMMON_REWARD_IDS.includes(id)) : cardRewardPool(run)
  const cards = shuffle(pool).slice(0, slots)
  const out: Reward[] = cards.map((cardId) => ({ kind: 'card', cardId }))

  // ⚠ 유물 칸을 **직업 카드 보장보다 먼저** 확정한다. 순서를 뒤집으면(2026-08-01
  // 이전) 보장해 둔 직업 카드가 마지막 칸에 있을 때 유물이 그 칸을 덮어써서
  // 보장이 조용히 깨진다 — 20,000회 중 40여 회(0.2%)가 그랬다.
  // 엘리트 = 희귀 유물(아주 낮은 확률로 영웅) 확정 · 일반 전투 = 아주 낮은 확률로 일반 유물(2026-11-12).
  const chance = RELIC_IN_REWARD + (runMods(run).relicChanceBonus ?? 0)
  if (elite || Math.random() < chance) {
    const relicId = rollRelicOf(run, elite ? ELITE_RELIC_ODDS : COMBAT_RELIC_ODDS)
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

// --- 이벤트 — `game/events.ts`(2026-11 리디자인 8종) -------------------------

// --- 상점 -------------------------------------------------------------------
export type ShopItem =
  | { id: string; kind: 'card'; cardId: string; price: number }
  | { id: string; kind: 'relic'; relicId: string; price: number }

/**
 * 여관 안 상점 진열 — **카드 3 + 유물 2**(2026-11-09 `INN_SMITH.md`).
 * 회복 물약·강화 칸은 뺐다: 회복은 여관 휴식이, 강화는 대장간이 맡는다.
 * ⚠ **"카드 1장 제거"(40골드)는 2026-08-05에 뺐다.** 덱이 곧 손패라 카드를 줄여서
 * 얻는 이득이 0이고(위 "덱 룰"), 꽉 찬 뒤 자리를 비우는 일은 카드를 살 때의 교체가
 * 공짜로 해 준다 — 즉 **어떤 상황에서도 사면 손해인 칸**이었다. 되살리지 말 것.
 * ⚠ 유물은 2026-07-30에 2 → 1칸으로 줄였던 적이 있다(상점 2곳에서 유물 4개를 사들이면
 * 후반이 무력화됐다). 시안대로 2칸으로 되돌렸으니 후반이 다시 쉬워지면 여기부터 본다.
 */
export const SHOP_RELIC_SLOTS = 2
export function rollShop(run: RunState): ShopItem[] {
  const items: ShopItem[] = []
  // 유물 할인(상인의 인증패 등)은 **모든 상점 가격**에 적용된다.
  const price = (n: number) => shopPrice(run, n)
  // 카드 칸은 기본 3 + 유물 보정(행상 마차 등). 진열이 넓어지면 원하는 카드를
  // 만날 확률이 올라간다 — 골드를 "가능성"으로 바꾸는 경제형 유물의 자리.
  const cardSlots = 3 + (runMods(run).shopExtraItems ?? 0)
  shuffle(cardRewardPool(run)).slice(0, cardSlots).forEach((cardId, i) =>
    items.push({ id: `card-${i}`, kind: 'card', cardId, price: price(PRICE_CARD) }),
  )
  const seen: string[] = []
  for (let i = 0; i < SHOP_RELIC_SLOTS; i++) {
    // 희귀도 가중 — legend는 드물고 아주 비싸다. 같은 유물 두 칸은 다시 뽑는다.
    let relicId = rollRelicId(run)
    for (let t = 0; t < 6 && relicId && seen.includes(relicId); t++) relicId = rollRelicId(run)
    if (!relicId || seen.includes(relicId)) continue
    seen.push(relicId)
    items.push({
      id: `relic-${i}`,
      kind: 'relic',
      relicId,
      price: price(RELIC_PRICE[RELIC_BY_ID[relicId]?.rarity ?? 'common']),
    })
  }
  return items
}
/** 유물 할인(상인의 인증패 등)을 얹은 값 — 여관 상점·휴식·대장간이 같이 쓴다. */
function shopPrice(run: RunState, n: number): number {
  const off = 1 - (runMods(run).shopDiscountPct ?? 0) / 100
  return Math.max(1, Math.round(n * off))
}

/**
 * 상점 구매. 골드가 모자라면 ok:false. 덱이 꽉 찬 상태의 카드 구매는 **버릴 카드**
 * 선택이 필요하므로 needsCardPick으로 넘긴다(그때까지 결제하지 않는다).
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
  }
}

// --- 여관 · 대장간(2026-11-09 · `docs/redesign/INN_SMITH.md`) --------------
/**
 * 여관 — 휴식(80G · 최대 체력 50%) / 상점(다녀와도 방문이 안 끝난다) / 나가기(20%).
 * **휴식과 나가기는 둘 중 하나만** — 어느 쪽이든 그걸로 방문이 끝난다(사용자 지정).
 * 회복량은 `min(최대 − 현재, round(최대 × %))`. 시안은 20% / 5%였는데 모닥불 칸(무료 30%)과
 * 상점 물약이 빠진 만큼 회복이 모자라 50% / 20%로 올렸다(2026-11-09 사용자 지정).
 */
export const INN_REST_PRICE = 80 // 2026-11-12 50 → 80
export const INN_REST_PCT = 0.5
export const INN_LEAVE_PCT = 0.2
const healOf = (run: RunState, pct: number) => Math.max(0, Math.min(run.maxHp - run.hp, Math.round(run.maxHp * pct)))
export const innRestPrice = (run: RunState): number => shopPrice(run, INN_REST_PRICE)
export const innRestAmount = (run: RunState): number => healOf(run, INN_REST_PCT)
export const innLeaveAmount = (run: RunState): number => healOf(run, INN_LEAVE_PCT)
/** 여관에서 쉰다 — 골드가 모자라면 null. 층은 넘기지 않는다(화면이 대사를 보여 준 뒤 넘긴다). */
export function innRest(run: RunState): RunState | null {
  const price = innRestPrice(run)
  if (run.gold < price) return null
  return healHp({ ...run, gold: run.gold - price }, innRestAmount(run))
}
/** 그냥 나간다 — 최대 체력의 20%. 층은 넘기지 않는다. */
export const innLeave = (run: RunState): RunState => healHp(run, innLeaveAmount(run))

/**
 * 대장간(지도 칸 `smith` · ? 칸) — 2026-11-12 사용자 지정. 선택지 셋, 강화는 한 번 들를 때 **한 장 · 한 번**:
 * - **강화 맡기기** 80G — 맡긴 강화 룰렛(`ROULETTES.paid`, 반드시 오른다)
 * - **직접 강화** 무료 — 직접 강화 룰렛(`ROULETTES.free`, 0 · 마이너스도 나온다)
 * - **나가기** — 아무것도 없이 다음 층(옛 "쉬어 가기" 10% 회복은 없앴다)
 * ⚠ ? 이벤트 「낡은 대장간」(`events.ts`의 `forge`)과는 다른 곳이다 — 그쪽은 확률로 나오고
 *   무료로 맡긴 강화 룰렛을 돌리거나 유물(차가운 쇠)을 준다.
 * 룰렛을 돌리면 결과와 상관없이 돈은 안 돌아온다 — 결제는 여기서, 강화는 UI가 이어서.
 * 돌리기 전에 그만두면 화면이 결제 전 런으로 돌려준다.
 */
export const SMITH_PRICE = 80 // 2026-11-12 50 → 80
export const smithPrice = (run: RunState): number => shopPrice(run, SMITH_PRICE)
export function paySmith(run: RunState): RunState | null {
  const price = smithPrice(run)
  if (run.gold < price || !upgradableDeckCards(run).length) return null
  return { ...run, gold: run.gold - price }
}

// --- 진행 -------------------------------------------------------------------
/**
 * 다음 층으로. 분기 도입 뒤로는 **칸을 정하지 않고 `choosing`으로 넘긴다** — 다음
 * 칸은 지도 화면에서 플레이어가 고른다(`chooseBranch`).
 */
export function advanceFloor(run: RunState): RunState {
  const floor = run.floor + 1
  if (floor <= LADDER_FLOORS) return { ...run, floor, special: undefined, status: 'choosing' }
  // 보스 층을 넘겼다 — 다음 막의 새 지도로(2026-11-12). 마지막 막이면 클리어.
  if (run.act >= ACTS) return { ...run, special: undefined, status: 'won' }
  const act = run.act + 1
  return { ...run, act, floor: 1, map: buildMap(act), picked: [], special: undefined, status: 'choosing' }
}
// --- ? 칸 정체 · 고블린 장사꾼(2026-11 리디자인 · `docs/redesign/GOBLIN_MERCHANT.md`) ---
/** ? 칸의 매복 전투 — 그 층의 일반 몬스터. */
export function ambushFight(run: RunState): SpecialFight {
  return { kind: 'ambush', monsterId: combatMonster(runDepth(run)) }
}

export type GoblinTier = 'poor' | 'mid' | 'rich'
/**
 * 단계 문턱 — 2026-11-12 가격 상향(카드 35 → 60 · 유물 ×1.7)에 맞춰 80 / 200 → 140 / 350. 옛 문턱이면
 * 카드 두세 장에 부자가 돼 "키워서 턴다"가 공짜였다(사용자 — 가난 > 중간 > 부자도 새 가격에 맞출 것).
 */
export const GOBLIN_TIER_AT = { mid: 140, rich: 350 } as const
export const goblinTier = (spent: number): GoblinTier =>
  spent >= GOBLIN_TIER_AT.rich ? 'rich' : spent >= GOBLIN_TIER_AT.mid ? 'mid' : 'poor'
export type GoblinItem =
  | { id: string; kind: 'card'; cardId: string; base: number; mul: number; price: number }
  | { id: string; kind: 'relic'; relicId: string; base: number; mul: number; price: number }
  | { id: string; kind: 'heal'; amount: number; base: number; mul: number; price: number }
/** 값은 단계와 상관없이 **물건마다** 정가 ×0.8~1.5(소수 첫째 자리) — 떠날 때까지 유지. */
const goblinPrice = (base: number, rng: () => number) => {
  const mul = Math.round((0.8 + rng() * 0.7) * 10) / 10
  return { base, mul, price: Math.round(base * mul) }
}
const GOBLIN_STOCK: Record<GoblinTier, { cards: number; relics: number; rarities: Rarity[]; heal: number }> = {
  // 물약 값이 30 → 50으로 올라 회복량도 15 / 25 / 40 → 20 / 35 / 55(2026-11-12).
  poor: { cards: 2, relics: 0, rarities: [], heal: 20 },
  mid: { cards: 2, relics: 1, rarities: ['common', 'rare'], heal: 35 },
  rich: { cards: 2, relics: 2, rarities: ['rare', 'epic', 'legend'], heal: 55 },
}
/** 단계마다 다른 건 **무엇을 파느냐**다. */
export function rollGoblinShop(run: RunState, tier: GoblinTier, rng: () => number = Math.random): GoblinItem[] {
  const cfg = GOBLIN_STOCK[tier]
  const out: GoblinItem[] = []
  shuffle(cardRewardPool(run)).slice(0, cfg.cards).forEach((cardId, i) =>
    out.push({ id: `g-card-${i}`, kind: 'card', cardId, ...goblinPrice(PRICE_CARD, rng) }),
  )
  let pool = availableRelicDefs(run).filter((r) => cfg.rarities.includes(r.rarity))
  for (let i = 0; i < cfg.relics; i++) {
    const r = pickWeightedRelic(pool, tier === 'rich' ? MAX_DEPTH : runDepth(run)) // 부자 = 전설 확률
    if (!r) break
    pool = pool.filter((x) => x.id !== r.id)
    out.push({ id: `g-relic-${i}`, kind: 'relic', relicId: r.id, ...goblinPrice(RELIC_PRICE[r.rarity], rng) })
  }
  out.push({ id: 'g-heal', kind: 'heal', amount: cfg.heal, ...goblinPrice(PRICE_HEAL, rng) })
  return out
}
/** 물건 하나를 그 런에 준다(값은 안 받는다 — 구매·전리품 공용). */
export function grantGoblinItem(run: RunState, item: GoblinItem, removeId?: string): { run: RunState; needsReplace?: boolean } {
  if (item.kind === 'card') return grantCard(run, item.cardId, removeId)
  if (item.kind === 'relic') return { run: grantRelic(run, item.relicId) }
  return { run: healHp(run, item.amount) }
}
/** 고블린 상점 구매 — 쓴 돈이 `goblinSpent`에 쌓인다. */
export function buyGoblinItem(
  run: RunState,
  item: GoblinItem,
  removeId?: string,
): { run: RunState; ok: boolean; needsCardPick?: boolean } {
  if (run.gold < item.price) return { run, ok: false }
  const res = grantGoblinItem(run, item, removeId)
  if (res.needsReplace) return { run, ok: false, needsCardPick: true }
  return { run: { ...res.run, gold: res.run.gold - item.price, goblinSpent: (run.goblinSpent ?? 0) + item.price }, ok: true }
}
/** 진열품 이름(카드 이름 · 유물 이름 · 물약). */
export function goblinItemName(run: RunState, item: GoblinItem): string {
  if (item.kind === 'card') return runCard(run, item.cardId)?.name ?? item.cardId
  if (item.kind === 'relic') return RELIC_BY_ID[item.relicId]?.name ?? item.relicId
  return `물약 HP +${item.amount}`
}
/** 덮칠 고블린. */
export const goblinMonsterId = (tier: GoblinTier): string => `goblin-${tier}`
/** 덮쳐서 이긴 전리품 — 골드 + (가난: 진열품 무작위 / 중간·부자: 진열품 고르기 · 부자는 유물 확정). */
export const GOBLIN_LOOT: Record<GoblinTier, { gold: number; pick: boolean; relic: boolean }> = {
  // 문턱이 올라간 만큼(쓴 돈 140 / 350) 덮쳐서 얻는 골드도 20 / 55 / 140 → 35 / 95 / 240(2026-11-12).
  poor: { gold: 35, pick: false, relic: false },
  mid: { gold: 95, pick: true, relic: false },
  rich: { gold: 240, pick: true, relic: true },
}

// --- 보물(2026-11 리디자인) ----------------------------------------------------
/** 보물 칸 — 유물 상자 하나. */
export function openTreasure(run: RunState): { run: RunState; relicId?: string } {
  // 지도 하나에 딱 하나 · 고르기 없이 하나(2026-11-12 사용자 지정).
  // 받을 유물이 없으면(다 가졌을 때뿐 — 사실상 안 생긴다) 빈 상자 = 아무것도 안 준다(2026-11-13 사용자 지정).
  const relicId = rollRelicOf(run, TREASURE_RELIC_ODDS)
  if (!relicId) return { run }
  return { run: grantRelic(run, relicId), relicId }
}
/**
 * 보상을 건너뛰고 진행 — **회복은 없다**(2026-11-09 사용자 지정). 예전엔 체력 18을 줬는데,
 * 회복은 여관(50% / 20%)·대장간(10%)이 맡는다. 덱이 꽉 차 받고 싶은 카드가 없을 때 쓰는 버튼이다.
 */
export function skipReward(run: RunState): RunState {
  return advanceFloor(run)
}
