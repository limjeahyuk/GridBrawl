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
import { getMonster, monstersOfTier, type MonsterDef, type TerrainId } from './monsters'
import { bossScene } from './bosses'
import { RUN_CARDS, resolveRunCard } from './runcards'
import { addUpgrade, isUpgradable, upgradedCard, type CardUpgrade } from './upgrades'
import { ROCK_HP, type CardDef, type Difficulty, type Obstacle, type Offset } from '../battle/types'

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
 * 칸 종류 — 지도 범례 7종(2026-11 리디자인): 적(`combat`) · 엘리트 · 보스 · 미지(`event`, ?) ·
 * 상인(`shop`) · 휴식(`rest`) · 보물(`treasure`). id는 예전 이름을 그대로 쓴다(`event` = ? 칸).
 */
export type NodeType = 'combat' | 'elite' | 'boss' | 'event' | 'shop' | 'rest' | 'treasure'
/** ? 칸이 열렸을 때의 정체. 들어가는 순간 정해진다(`chooseBranch`). */
export type UnknownKind = 'event' | 'combat' | 'goblin' | 'rest'
export interface RunNode {
  type: NodeType
  monsterId?: string // combat/elite/boss (? 칸은 정체가 전투·고블린일 때 들어가며 채워진다)
  /** ? 칸의 정체 — 들어가기 전엔 없다. */
  reveal?: UnknownKind
  /**
   * 세로 위치(0=위, 1=가운데, 2=아래). 화면에서 어느 줄에 그릴지이자 **어디로
   * 이어지는지의 근거**다 — 간선은 세로로 한 칸 안쪽(|Δlane| ≤ 1)으로만 난다.
   */
  lane: number
  /** 다음 층에서 **이 칸에서 갈 수 있는** 노드들의 인덱스. 마지막 층은 빈 배열. */
  next: number[]
}
/** 노드 줄은 0·1·2 셋. 가운데(1)는 모든 층에 반드시 있다(아래 `buildMap` 주석). */
const CENTER_LANE = 1
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
  'treasure', 'combat', 'elite', 'shop',
  'combat', 'event', 'rest', 'boss',
]
/**
 * 지원 칸 — 전투가 아닌 칸들. **서로하고만** 바뀐다(아래 `nodesForFloor`의 ⚠).
 * 2026-11 리디자인에서 휴식·보물이 더해졌다(템플릿 8층 보물 · 14층 휴식 — 보스 앞 모닥불).
 */
const SUPPORT_TYPES: readonly NodeType[] = ['event', 'shop', 'rest', 'treasure']
const isSupport = (t: NodeType) => SUPPORT_TYPES.includes(t)
export const LADDER_FLOORS = NODE_TEMPLATE.length

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
export const DECK_CAP = 20
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
/** 승리 보상으로 보여주는 선택지 수 — 일반 5장 중 1 · 엘리트 카드 4 + 유물 1(2026-11 리디자인). */
const REWARD_OPTIONS = 5
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
/** 보상을 포기하고 받는 회복량. 22 → 32(2026-07-30): 15층 사다리에선 누적 소모가
 *  훨씬 커서(7층 진입 체력 49%) 22는 "카드를 포기할 이유"가 못 됐다. */
export const SKIP_HEAL = 18
const GOLD_BASE = 15
const GOLD_PER_FLOOR = 4
const GOLD_ELITE_BONUS = 40
const GOLD_BOSS_BONUS = 80
const PRICE_CARD = 35
const PRICE_HEAL = 30
const PRICE_HEAL_AMOUNT = 25 // ÷2 리스케일(2026-08-05): HP 절반이라 회복량도 절반

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
export type RunStatus =
  | 'choosing'
  | 'reveal' // ? 칸 정체 공개(그다음 아래 넷 중 하나로)
  | 'fighting'
  | 'reward'
  | 'event'
  | 'shop'
  | 'rest' // 모닥불 — 쉬기 또는 강화
  | 'treasure' // 보물 상자
  | 'goblin' // ? 칸의 고블린 장사꾼
  | 'won'
  | 'lost'

export interface RunState {
  charId: string
  /** 이 런의 난이도(2026-08-11). 전투마다 `runbattle.ts`가 읽어 봇의 눈을 조인다. */
  difficulty: RunDifficulty
  relicIds: string[]
  deck: string[]
  /**
   * 카드 강화 단계(2026-08-08) — 카드 id → 단계(없으면 0, 상한 `MAX_UPGRADE`).
   *
   * **덱과 따로 두는 이유**: 덱은 id 목록이고 쿨타임·"같은 공격은 한 턴에 한 번"이
   * 전부 id로 판정된다 — 즉 같은 id를 두 장 넣어도 두 번째는 아무 일도 안 한다.
   * 그래서 중복 획득을 장수가 아니라 **단계**로 받는다(`grantCard`). 덱은 여전히
   * id 목록 그대로라 `deckCap`·교체·제거 로직이 하나도 안 바뀐다.
   */
  upgrades: Record<string, CardUpgrade>
  /**
   * 이번 런에서 고블린 상점에 쓴 골드 합(2026-11). 고블린의 재산 단계가 이것 하나로
   * 정해진다(`goblinTier`). 덮쳐서 이기면 0으로 돌아간다(사용자 확정).
   */
  goblinSpent: number
  /** 이벤트(수술실 심장)로 깎인 최대 체력. 음수. 유물 보정과 따로 둔다. */
  maxHpMod: number
  /** 이번 런에서 이미 본 ? 이벤트 id — 같은 이벤트를 한 런에 두 번 안 낸다. */
  seenEvents: string[]
  /** 지금 전투가 고블린 습격이면 그 단계와 진열품(승리 보상이 여기서 나온다). */
  ambush?: { tier: GoblinTier; stock: ShopItem[] }
  /** 지금 전투가 이벤트 전투(항아리 뱀)면 이길 때 줄 유물 풀과 시작 상태. */
  eventFight?: { relicPool: string[]; poisonRounds: number }
  hp: number
  maxHp: number
  gold: number
  floor: number // 1-based
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

/** 그 층의 일반 전투 몬스터 하나(티어 풀에서 뽑는다). `exclude`와는 다른 몬스터로. */
function combatMonster(floor: number, exclude?: string): string {
  const poolT = combatPool(floor)
  const pool = poolT.length ? poolT : monstersOfTier(1)
  const distinct = pool.filter((m) => m.id !== exclude)
  return pick(distinct.length ? distinct : pool).id
}

/**
 * 한 층에 놓을 칸들(줄 배정 전). 첫 칸은 **반드시 템플릿 타입**이고 가운데 줄로 간다.
 *
 * 대안 칸은 "무엇을 포기하고 무엇을 받나"가 한 줄로 설명되는 것만 뒀다:
 *   전투  → 다른 몬스터와의 전투 (어느 적을 상대할지 고른다)
 *   엘리트 → 일반 전투 (유물 확정을 포기하고 안전을 산다)
 *   이벤트 → 상점 (도박 대신 확실한 보급)
 *   상점  → 이벤트 (골드가 없을 때 차라리 도박)
 *   보스  → 없음 (마지막 층은 고를 게 없다)
 *
 * ⚠ **지원 칸(이벤트·상점)을 전투로 바꿀 수 있게 하면 안 된다.** 처음엔 모든 대안을
 * 전투로 뒀는데, 그러면 경로를 헤맬수록 이벤트·상점이 전투로 갈려 나가 **클리어율이
 * 27% → 10%로 무너졌다**(5시드 × 900런). 상점이 층 사이 회복의 주 수단이라
 * (`PRICE_HEAL_AMOUNT`) 그게 빠지면 회복이 끊긴다. 지원 칸은 **서로하고만** 바꾼다 —
 * 그래야 15층 페이싱을 맞춰 둔 전투/지원 비율이 경로와 무관하게 유지된다.
 */
function nodesForFloor(floor: number, primary: NodeType, count: number): RunNode[] {
  const blank = (type: NodeType, monsterId?: string): RunNode => ({
    type,
    monsterId,
    lane: 0,
    next: [],
  })
  if (primary === 'boss') return [blank('boss', 'overlord')]

  const out: RunNode[] = []
  if (primary === 'combat') out.push(blank('combat', combatMonster(floor)))
  else if (primary === 'elite') out.push(blank('elite', pick(elitePool(floor)).id))
  else out.push(blank(primary))

  while (out.length < count) {
    if (isSupport(primary)) {
      // 지원 칸끼리만 — 그 층에 아직 없는 지원 칸을 무작위로 세운다.
      const free = SUPPORT_TYPES.filter((t) => !out.some((n) => n.type === t))
      out.push(blank(pick(free.length ? free : SUPPORT_TYPES.slice())))
    } else {
      // 전투·엘리트의 대안은 언제나 일반 전투다(엘리트는 이걸로 회피한다).
      // 이미 나온 몬스터는 피해서 뽑는다 — 같은 얼굴 둘을 고르는 건 선택이 아니다.
      const used = out.map((n) => n.monsterId)
      out.push(blank('combat', combatMonster(floor, used[used.length - 1])))
    }
  }
  return out
}

/**
 * 층 폭(그 층에 놓을 칸 수). **가운데 줄은 항상 있고**, 좌우로 늘어난다.
 * 1이 섞여야 길이 다시 모이는 "허리"가 생겨 지도가 사다리처럼 읽힌다.
 */
function widthForFloor(floor: number, primary: NodeType): number {
  if (primary === 'boss') return 1
  if (floor === 1) return 2 // 첫 층부터 고를 게 있어야 한다
  const r = Math.random()
  return r < 0.18 ? 1 : r < 0.68 ? 2 : 3
}

/** 폭 n짜리 층이 쓸 줄 번호 — 가운데부터 채운다(1 → 1·0 → 0·1·2). */
function lanesFor(width: number): number[] {
  if (width <= 1) return [CENTER_LANE]
  if (width === 2) return Math.random() < 0.5 ? [0, CENTER_LANE] : [CENTER_LANE, 2]
  return [0, 1, 2]
}

/**
 * 분기 **그래프**(2026-08-05). 예전엔 층마다 독립된 2택이라 "무엇을 고르든 다음 층은
 * 다시 전부 열려" 있었다 — 고른 게 뒤에 아무 영향이 없으니 지도가 아니라 팝업 두 개였다.
 * 이제 칸마다 **이어지는 칸**이 정해져 있고, 다음 층에서는 **거기서 이어진 칸만** 고를
 * 수 있다. 그래서 선택지 수가 1~3개로 달라지고, 멀리 있는 상점을 노리려면 몇 층 전부터
 * 그쪽 줄을 타야 한다 — 사용자가 요청한 "더 나은 길을 찾아간다"가 이 규칙에서 나온다.
 *
 * ⚠ **가운데 줄(CENTER_LANE)은 모든 층에 있고 거기엔 항상 템플릿 타입이 놓인다.**
 * 어느 칸에서든 |Δlane| ≤ 1로 가운데에 닿으므로, **"매 층 가운데만 밟는 경로"가 늘
 * 존재하고 그게 곧 분기 이전의 선형 사다리**다. 시뮬로 맞춰 둔 밸런스 기준선이 지도
 * 안에 경로로 남아 있는 것이라(`--path=template`), 생성 규칙을 바꿔도 이건 지킬 것.
 */
function buildMap(): RunNode[][] {
  const floors: RunNode[][] = NODE_TEMPLATE.map((type, i) => {
    const nodes = nodesForFloor(i + 1, type, widthForFloor(i + 1, type))
    const lanes = lanesFor(nodes.length)
    // 템플릿 타입(0번)이 가운데 줄에 오도록 배치한다.
    const centerAt = lanes.indexOf(CENTER_LANE)
    const order = [...nodes]
    if (centerAt > 0) {
      ;[order[0], order[centerAt]] = [order[centerAt], order[0]]
    }
    return order.map((n, j) => ({ ...n, lane: lanes[j] }))
  })

  for (let f = 0; f < floors.length - 1; f++) {
    const cur = floors[f]
    const nxt = floors[f + 1]
    cur.forEach((a) => {
      a.next = nxt.map((_, j) => j).filter((j) => Math.abs(nxt[j].lane - a.lane) <= 1)
      // 세로로 두 칸 넘게 떨어져 갈 곳이 없으면 가장 가까운 칸으로 잇는다.
      if (!a.next.length) {
        let best = 0
        nxt.forEach((b, j) => {
          if (Math.abs(b.lane - a.lane) < Math.abs(nxt[best].lane - a.lane)) best = j
        })
        a.next = [best]
      }
    })
    // 들어오는 길이 없는 칸을 남기지 않는다 — 화면에 그려 놓고 못 가는 칸은 거짓말이다.
    nxt.forEach((b, j) => {
      if (cur.some((a) => a.next.includes(j))) return
      let best = 0
      cur.forEach((a, i) => {
        if (Math.abs(a.lane - b.lane) < Math.abs(cur[best].lane - b.lane)) best = i
      })
      cur[best].next = [...cur[best].next, j].sort((x, y) => x - y)
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
export const GRASSLAND_LAST_FLOOR = 7
export const regionOf = (floor: number): 'grassland' | 'dungeon' =>
  floor <= GRASSLAND_LAST_FLOOR ? 'grassland' : 'dungeon'

export function sceneFor(run: RunState): BattleScene {
  const node = currentNode(run)
  if (node.monsterId) {
    const boss = bossScene(node.monsterId)
    if (boss) return boss
  }
  return regionOf(run.floor)
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
export function computeMaxHp(charId: string, relicIds: string[], mod = 0): number {
  const base = getChar(charId).maxHp
  return Math.max(1, base + (mergeRelics(relicIds).maxHpBonus ?? 0) + mod)
}
/** 런 상태 기준 최대 체력(유물 + 이벤트 보정). */
const maxHpOf = (run: Pick<RunState, 'charId' | 'relicIds' | 'maxHpMod'>, relicIds = run.relicIds) =>
  computeMaxHp(run.charId, relicIds, run.maxHpMod ?? 0)
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
  const at = opts.findIndex((n) => n.lane === CENTER_LANE)
  return at < 0 ? 0 : at
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
  let node = run.map[run.floor - 1][idxs[at]]
  const picked = run.picked.slice()
  picked[run.floor - 1] = idxs[at]
  let map = run.map
  // ? 칸은 **들어가는 순간** 정체가 정해진다 — 지도엔 끝까지 ?로 남아 있어야 고르는 게 도박이다.
  if (node.type === 'event' && !node.reveal) {
    const reveal = rollUnknown()
    node = { ...node, reveal, monsterId: reveal === 'combat' ? combatMonster(run.floor) : undefined }
    map = run.map.map((f, i) => (i === run.floor - 1 ? f.map((n, j) => (j === idxs[at] ? node : n)) : f))
    return { ...run, map, picked, status: 'reveal' }
  }
  return { ...run, map, picked, status: statusForNode(node) }
}

/**
 * ? 칸의 정체 비율 — **시안에서 정한 값**(기획엔 종류만 있고 비율은 없다). 이벤트가
 * 기본이고 전투·고블린 상점·휴식이 섞인다. 바꾸면 `sim:run --sweep`으로 재측정.
 */
export const UNKNOWN_WEIGHTS: Readonly<Record<UnknownKind, number>> = {
  event: 55,
  combat: 20,
  goblin: 15,
  rest: 10,
}
function rollUnknown(): UnknownKind {
  const entries = Object.entries(UNKNOWN_WEIGHTS) as [UnknownKind, number][]
  let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0)
  for (const [k, w] of entries) if ((r -= w) < 0) return k
  return 'event'
}
/** 정체 공개 화면을 넘기고 그 칸으로 들어간다. */
export function enterReveal(run: RunState): RunState {
  return { ...run, status: statusForNode(currentNode(run)) }
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
  if (node.type === 'event') {
    switch (node.reveal) {
      case 'combat': return 'fighting'
      case 'goblin': return 'goblin'
      case 'rest': return 'rest'
      default: return 'event'
    }
  }
  if (node.type === 'shop') return 'shop'
  if (node.type === 'rest') return 'rest'
  if (node.type === 'treasure') return 'treasure'
  return 'fighting'
}

// --- 런 시작 ----------------------------------------------------------------
export function startRun(charId: string, difficulty: RunDifficulty = DEFAULT_DIFFICULTY): RunState {
  const relicIds = [signatureRelicId(charId)].filter(Boolean)
  const maxHp = computeMaxHp(charId, relicIds)
  return {
    charId,
    difficulty,
    relicIds,
    deck: startingDeck(charId),
    upgrades: {},
    goblinSpent: 0,
    maxHpMod: 0,
    seenEvents: [],
    hp: maxHp,
    maxHp,
    gold: 0,
    floor: 1,
    map: buildMap(),
    picked: [],
    // 1층부터 고른다 — 어느 칸으로 들어갈지가 런의 첫 결정이다.
    status: 'choosing',
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
  if (currentNode(run).type === 'boss') return { ...run, hp, gold: run.gold + goldForWin(run), status: 'won' }
  // 고블린을 쓰러뜨렸다 — 단계별 골드 + (부자면) 유물 확정, 그리고 **재산이 0으로**.
  if (run.ambush) {
    let out: RunState = {
      ...run,
      hp,
      gold: run.gold + GOBLIN_REWARD_GOLD[run.ambush.tier],
      goblinSpent: 0,
      status: 'reward',
    }
    if (run.ambush.tier === 'rich') out = grantRandomRelic(out).run
    return out
  }
  let out: RunState = { ...run, hp, gold: run.gold + goldForWin(run), status: 'reward' }
  // 항아리 뱀 — 이기면 그 풀의 유물 하나.
  if (run.eventFight) out = grantRelicFromPool(out, run.eventFight.relicPool).run
  return out
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
  return pickWeightedRelic(availableRelicDefs(run), run.floor)?.id
}
/** 유물 장착(최대체력 증가분만큼 현재 체력도 함께 오른다). */
export function grantRelic(run: RunState, relicId: string): RunState {
  if (!relicId || run.relicIds.includes(relicId)) return run
  const relicIds = [...run.relicIds, relicId]
  const maxHp = maxHpOf(run, relicIds)
  const delta = maxHp - run.maxHp
  const hp = Math.min(run.hp + Math.max(0, delta), maxHp)
  return { ...run, relicIds, maxHp, hp: clamp(hp, 1, maxHp) }
}
/**
 * 유물을 잃는다(거래·대장장이). 최대 체력이 줄면 현재 체력도 그 안으로 깎인다.
 * ⚠ **시그니처 유물은 못 잃는다** — 직업의 출발점이라 빠지면 런의 전제가 깨진다.
 */
export function removeRelic(run: RunState, relicId: string): RunState {
  if (!run.relicIds.includes(relicId) || relicId === signatureRelicId(run.charId)) return run
  const relicIds = run.relicIds.filter((id) => id !== relicId)
  const maxHp = maxHpOf(run, relicIds)
  return { ...run, relicIds, maxHp, hp: clamp(run.hp, 1, maxHp) }
}
/** 거래에 내놓을 수 있는 유물(시그니처 제외). */
export function tradableRelics(run: RunState): string[] {
  return run.relicIds.filter((id) => id !== signatureRelicId(run.charId))
}
/** 풀(유물 id 목록)에서 미보유 하나. 풀이 비면 아무 유물이나(`grantRandomRelic`). */
export function grantRelicFromPool(run: RunState, pool: readonly string[]): { run: RunState; relicId?: string } {
  const free = pool.filter((id) => RELIC_BY_ID[id] && !run.relicIds.includes(id))
  if (!free.length) return grantRandomRelic(run)
  const relicId = pick(free)
  return { run: grantRelic(run, relicId), relicId }
}
/** 최대 체력을 깎는다(수술실). 현재 체력도 새 최대치 안으로. */
export function loseMaxHp(run: RunState, amount: number): RunState {
  const maxHpMod = (run.maxHpMod ?? 0) - amount
  const maxHp = maxHpOf({ ...run, maxHpMod })
  return { ...run, maxHpMod, maxHp, hp: clamp(run.hp, 1, maxHp) }
}
/** 무작위(미보유) 유물 하나를 준다. 다 가졌으면 소량 회복으로 대체. */
export function grantRandomRelic(run: RunState): { run: RunState; relicId?: string } {
  const relicId = rollRelicId(run)
  if (!relicId) return { run: { ...run, hp: Math.min(run.maxHp, run.hp + 20) } }
  return { run: grantRelic(run, relicId), relicId }
}
// --- 카드 강화 (2026-11 룰렛) ----------------------------------------------
/** 그 카드의 강화 기록(없으면 undefined). */
export function cardUpgrade(run: RunState, cardId: string): CardUpgrade | undefined {
  return run.upgrades[cardId]
}
/** 그 카드가 강화된 횟수(0~2). */
export function cardLevel(run: RunState, cardId: string): number {
  return run.upgrades[cardId]?.times ?? 0
}
/**
 * 덱에 실제로 들어가는 카드 정의 — **강화가 반영된 사본**. 전투·보상·상점·이벤트가
 * 전부 이걸 쓴다. 강화가 없으면 원본을 그대로 돌려주므로 객체가 늘지 않는다.
 */
export function runCard(run: RunState, cardId: string): CardDef | undefined {
  const base = resolveRunCard(run.charId, cardId)
  return base && upgradedCard(base, run.upgrades[cardId])
}
/** 이 카드를 지금 강화할 수 있는가(이동 아님 · 2번 안 씀 · 올릴 게 있음). */
export function canUpgradeCard(run: RunState, cardId: string): boolean {
  const base = resolveRunCard(run.charId, cardId)
  return !!base && isUpgradable(base, run.upgrades[cardId])
}
/** 덱에서 강화할 수 있는 카드들. */
export function upgradableDeckCards(run: RunState): string[] {
  return run.deck.filter((id) => canUpgradeCard(run, id))
}
/**
 * 룰렛 결과를 카드에 얹는다. **꽝(+0·0칸)은 횟수에 안 센다** — 기회만 사라진다.
 * `cells`는 이미 `canPickCell` 규칙대로 고른 칸이어야 한다(화면이 지킨다).
 */
export function applyCardUpgrade(
  run: RunState,
  cardId: string,
  step: { value?: number; cells?: readonly Offset[] },
): RunState {
  if (!canUpgradeCard(run, cardId)) return run
  return { ...run, upgrades: { ...run.upgrades, [cardId]: addUpgrade(run.upgrades[cardId], step) } }
}

/**
 * 카드 획득. 덱이 꽉 찼는데 removeId가 없으면 needsReplace로 UI에 교체를 넘긴다.
 *
 * ⚠ **이미 가진 카드는 아무 일도 안 한다**(2026-11). 예전엔 강화로 받았지만 그 길은
 *   없앴다(사용자 결정 — 강화는 룰렛 하나). 같은 id 두 장은 쿨타임이 id로 걸려 쓸모가
 *   없으므로 보상·상점 풀이 애초에 가진 카드를 안 낸다(`cardRewardPool`).
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
  if (removeId && isLockedCard(removeId)) removeId = undefined
  if (run.deck.length >= deckCap(run) && !removeId) return { run, needsReplace: true }
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

/** 그 캐릭터의 미보유 직업(고유) 카드 — 시작 덱에서 빠졌으므로 런에서 번다. */
function missingClassCards(run: RunState): string[] {
  return getChar(run.charId)
    .cards.map((c) => c.id)
    .filter((id) => !run.deck.includes(id))
}
/**
 * 보상·상점에 나올 수 있는 카드 전체 풀(공용 확장 + 직업 + 런 전용).
 * **이미 가진 카드는 빼고 준다** — 같은 카드 두 장은 아무 일도 안 한다(`grantCard`).
 */
const COMMON_POOL = ['m-right2', 'm-left2', 'm-ur', 'm-ul', 'm-dr', 'm-dl', 'c-guard', 'c-repair']
export function cardRewardPool(run: RunState): string[] {
  const classCards = getChar(run.charId).cards.map((c) => c.id)
  const all = [...COMMON_POOL, ...classCards, ...RUN_CARDS.map((c) => c.id)]
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
  if (run.ambush) {
    const loot = goblinLoot(run)
    if (loot.length) return loot
  }
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

// --- 상점 -------------------------------------------------------------------
/**
 * 진열품. `mul`·`base`는 **고블린 상점 전용** — 정가 대비 배율(0.8~1.5)과 정가.
 * `upgrade`는 상점의 **룰렛 강화 칸**(2026-11, 상점마다 한 번).
 */
export type ShopItem = (
  | { id: string; kind: 'card'; cardId: string; price: number }
  | { id: string; kind: 'relic'; relicId: string; price: number }
  | { id: string; kind: 'heal'; price: number; amount: number }
  | { id: string; kind: 'upgrade'; price: number }
) & { mul?: number; base?: number }

/** 상점 강화 가격(시안에서 정한 값). 할인 유물이 그대로 먹는다. */
export const PRICE_UPGRADE = 50

/**
 * 상점 진열 — 카드 3 + 유물 1 + 회복 2.
 * ⚠ **"카드 1장 제거"(40골드)는 2026-08-05에 뺐다.** 덱이 곧 손패라 카드를 줄여서
 * 얻는 이득이 0이고(위 "덱 룰"), 꽉 찬 뒤 자리를 비우는 일은 카드를 살 때의 교체가
 * 공짜로 해 준다 — 즉 **어떤 상황에서도 사면 손해인 칸**이었다. 되살리지 말 것.
 * 유물은 2 → **1칸**(2026-07-30): 상점 2곳에서 유물 4개를 사들이면 후반이 무력화됐다
 * (시뮬: 보스 도달 시 유물 6개, 12·13층 통과율 99%). 유물은 엘리트·이벤트가 주 경로.
 */
export function rollShop(run: RunState): ShopItem[] {
  const items: ShopItem[] = []
  // 유물 할인(상인의 인증패 등)은 **모든 상점 가격**에 적용된다.
  const off = 1 - (runMods(run).shopDiscountPct ?? 0) / 100
  const price = (n: number) => Math.max(1, Math.round(n * off))
  // 카드 칸은 기본 3 + 유물 보정(행상 마차 등). 진열이 넓어지면 원하는 카드를
  // 만날 확률이 올라간다 — 골드를 "가능성"으로 바꾸는 경제형 유물의 자리.
  const cardSlots = 3 + (runMods(run).shopExtraItems ?? 0)
  shuffle(cardRewardPool(run)).slice(0, cardSlots).forEach((cardId, i) =>
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
  items.push({ id: 'upgrade', kind: 'upgrade', price: price(PRICE_UPGRADE) })
  return items
}

/**
 * 상점 구매. 골드가 모자라면 ok:false. 덱이 꽉 찬 상태의 카드 구매는 **버릴 카드**
 * 선택이 필요하므로 needsCardPick으로 넘긴다(그때까지 결제하지 않는다).
 */
export function buyShopItem(
  run: RunState,
  item: ShopItem,
  cardId?: string,
): { run: RunState; ok: boolean; needsCardPick?: boolean; openUpgrade?: boolean } {
  if (run.gold < item.price) return { run, ok: false }
  const paid = { ...run, gold: run.gold - item.price }
  switch (item.kind) {
    // 강화는 **먼저 낸다** — 룰렛이 꽝이어도 돈은 안 돌아온다(기획). 강화할 카드가
    // 없으면 아예 안 판다.
    case 'upgrade':
      if (!upgradableDeckCards(run).length) return { run, ok: false }
      return { run: paid, ok: true, openUpgrade: true }
    case 'card': {
      const res = grantCard(paid, item.cardId, cardId)
      if (res.needsReplace) return { run, ok: false, needsCardPick: true } // 결제 전으로 되돌림
      return { run: res.run, ok: true }
    }
    case 'relic':
      return { run: grantRelic(paid, item.relicId), ok: true }
    case 'heal':
      return { run: healHp(paid, item.amount), ok: true }
    default:
      return { run, ok: false }
  }
}

// --- 진행 -------------------------------------------------------------------
/**
 * 다음 층으로. 분기 도입 뒤로는 **칸을 정하지 않고 `choosing`으로 넘긴다** — 다음
 * 칸은 지도 화면에서 플레이어가 고른다(`chooseBranch`).
 */
export function advanceFloor(run: RunState): RunState {
  const floor = run.floor + 1
  const clean = { ...run, ambush: undefined, eventFight: undefined }
  if (floor > LADDER_FLOORS) return { ...clean, status: 'won' }
  return { ...clean, floor, status: 'choosing' }
}

// --- 휴식(모닥불) · 보물 (2026-11) -------------------------------------------
/** 모닥불 "쉬기" — 최대 체력의 30%(시안에서 정한 값). 강화와 둘 중 하나만. */
export const REST_HEAL_PCT = 30
export const restHealAmount = (run: RunState): number => Math.round((run.maxHp * REST_HEAL_PCT) / 100)
export function restHeal(run: RunState): RunState {
  return healHp(run, restHealAmount(run))
}
/** 보물 칸 — 유물 상자 하나. 연 결과(얻은 유물)를 돌려준다. */
export function openTreasure(run: RunState): { run: RunState; relicId?: string } {
  return grantRandomRelic(run)
}

// --- 고블린 장사꾼 (2026-11 · docs/redesign/GOBLIN_MERCHANT.md) ----------------
/**
 * ? 칸이 상점으로 열리면 나오는 고블린. **쓸수록 부자가 된다** — 이번 런에서 고블린
 * 상점에 쓴 골드(`goblinSpent`)만으로 단계가 정해지고, 덮쳐서 이기면 0으로 돌아가
 * 이후 고블린은 전부 가난부터 다시 시작한다(사용자 확정). 그래서 "키워서 턴다"가
 * 선택이 된다. 숫자(문턱·보상·체력)는 **시안에서 정한 값**이다.
 */
export type GoblinTier = 'poor' | 'mid' | 'rich'
export const GOBLIN_TIER_AT = { mid: 80, rich: 200 } as const
export const goblinTier = (spent: number): GoblinTier =>
  spent >= GOBLIN_TIER_AT.rich ? 'rich' : spent >= GOBLIN_TIER_AT.mid ? 'mid' : 'poor'
export const GOBLIN_NAME: Record<GoblinTier, string> = {
  poor: '가난한 고블린',
  mid: '중간 고블린',
  rich: '부자 고블린',
}
export const GOBLIN_REWARD_GOLD: Record<GoblinTier, number> = { poor: 20, mid: 55, rich: 140 }
const GOBLIN_HEAL: Record<GoblinTier, number> = { poor: 15, mid: 25, rich: 40 }

/** 단계마다 다른 건 **무엇을 파느냐**다. 값은 물건마다 정가 × 0.8~1.5. */
export function rollGoblinShop(run: RunState, tier: GoblinTier, rng: () => number = Math.random): ShopItem[] {
  const off = 1 - (runMods(run).shopDiscountPct ?? 0) / 100
  const tag = (base: number) => {
    const mul = Math.round((0.8 + rng() * 0.7) * 10) / 10
    return { base, mul, price: Math.max(1, Math.round(base * mul * off)) }
  }
  const items: ShopItem[] = []
  // 카드 2 — 가난은 공용 보급품, 중간은 직업·런 카드, 부자는 런 카드(강한 쪽).
  const owned = (id: string) => run.deck.includes(id)
  const cardPool =
    tier === 'poor'
      ? COMMON_POOL.filter((id) => !owned(id))
      : tier === 'mid'
        ? cardRewardPool(run)
        : RUN_CARDS.map((c) => c.id).filter((id) => !owned(id))
  shuffle(cardPool.length ? cardPool : cardRewardPool(run))
    .slice(0, 2)
    .forEach((cardId, i) => items.push({ id: `g-card-${i}`, kind: 'card', cardId, ...tag(PRICE_CARD) }))
  // 유물 — 가난 0 · 중간 1(일반~희귀) · 부자 2(희귀 이상, 전설 가능)
  const relicCount = tier === 'poor' ? 0 : tier === 'mid' ? 1 : 2
  const rarities: readonly string[] = tier === 'mid' ? ['common', 'rare'] : ['rare', 'epic', 'legend']
  const taken: string[] = []
  for (let i = 0; i < relicCount; i++) {
    const pool = availableRelicDefs(run).filter((r) => rarities.includes(r.rarity) && !taken.includes(r.id))
    const r = pickWeightedRelic(pool, tier === 'rich' ? LADDER_FLOORS : run.floor)
    if (!r) continue
    taken.push(r.id)
    items.push({ id: `g-relic-${i}`, kind: 'relic', relicId: r.id, ...tag(RELIC_PRICE[r.rarity]) })
  }
  items.push({ id: 'g-heal', kind: 'heal', amount: GOBLIN_HEAL[tier], ...tag(PRICE_HEAL) })
  return items
}

/** 고블린 상점 구매 — 일반 구매와 같고, 낸 돈만큼 고블린이 부자가 된다. */
export function buyGoblinItem(
  run: RunState,
  item: ShopItem,
  cardId?: string,
): { run: RunState; ok: boolean; needsCardPick?: boolean } {
  const res = buyShopItem(run, item, cardId)
  if (!res.ok) return res
  return { ...res, run: { ...res.run, goblinSpent: (res.run.goblinSpent ?? 0) + item.price } }
}

/** 덮친다 — 그 자리에서 이 단계의 고블린과 전투. 진열품이 곧 승리 보상이다. */
export function startAmbush(run: RunState, stock: ShopItem[]): RunState {
  const tier = goblinTier(run.goblinSpent ?? 0)
  const idx = run.picked[run.floor - 1] ?? 0
  const map = run.map.map((f, i) =>
    i === run.floor - 1 ? f.map((n, j) => (j === idx ? { ...n, monsterId: `goblin-${tier}` } : n)) : f,
  )
  return { ...run, map, ambush: { tier, stock }, status: 'fighting' }
}

/**
 * 고블린 습격 승리 보상 — 가난: 진열품 1개 **무작위** · 중간·부자: 진열품 1개 **고르기**.
 * 회복 칸은 보상에서 뺀다(보상 화면은 카드·유물만 받는다). 부자의 유물 확정은 `afterWin`.
 */
function goblinLoot(run: RunState): Reward[] {
  if (!run.ambush) return []
  const loot: Reward[] = []
  for (const it of run.ambush.stock) {
    if (it.kind === 'card' && !run.deck.includes(it.cardId)) loot.push({ kind: 'card', cardId: it.cardId })
    if (it.kind === 'relic' && !run.relicIds.includes(it.relicId)) loot.push({ kind: 'relic', relicId: it.relicId })
  }
  if (run.ambush.tier === 'poor' && loot.length) return [pick(loot)]
  return loot
}

// --- 이벤트 전투(항아리 뱀) ----------------------------------------------------
/** 이벤트에서 전투로 넘어간다 — 그 칸의 적을 바꾸고, 이기면 풀에서 유물. */
export function startEventFight(run: RunState, monsterId: string, relicPool: string[], poisonRounds: number): RunState {
  const idx = run.picked[run.floor - 1] ?? 0
  const map = run.map.map((f, i) =>
    i === run.floor - 1 ? f.map((n, j) => (j === idx ? { ...n, monsterId } : n)) : f,
  )
  return { ...run, map, eventFight: { relicPool, poisonRounds }, status: 'fighting' }
}
/** 보상을 포기하고 회복 후 진행. */
export function skipRewardForHeal(run: RunState): RunState {
  return advanceFloor(healHp(run, SKIP_HEAL))
}
