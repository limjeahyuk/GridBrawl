// ---------------------------------------------------------------------------
// Card-battle domain types. Turn-based on a 2D grid: each turn both fighters
// pick 3 cards, which resolve in the SELECTED slot order (1→2→3); within one
// slot the two sides' cards order by type priority — move, then defense
// (guard/energy), then attack (see engine `resolveTurn`). Cards carry a
// cooldown (turns locked after use). See docs/GAME_DESIGN.md for the design.
// ---------------------------------------------------------------------------

export type Difficulty = 'easy' | 'normal' | 'hard'

export type CardKind = 'move' | 'attack' | 'guard' | 'energy' | 'heal'

/** Absolute screen directions, matching the arrows on the cards.
 *  대각선 4방향(2026-07-23)은 세로+가로를 한 번에 움직인다. */
export type MoveDir =
  | 'right'
  | 'left'
  | 'up'
  | 'down'
  | 'up-right'
  | 'up-left'
  | 'down-right'
  | 'down-left'

/** A board cell. col grows rightward (0..GRID_COLS-1), row downward (0..GRID_ROWS-1). */
export interface Cell {
  col: number
  row: number
}

/**
 * One target cell of an attack, relative to the attacker AND its facing:
 *   df: cells forward — + toward the opponent, - behind.
 *   du: rows upward   — + above (smaller row), - below (larger row).
 * Mirrors the 3x3 range chart of the reference game (center = the attacker).
 */
export interface Offset {
  df: number
  du: number
}

// ---------------------------------------------------------------------------
// 지속 상태이상 (2026-08-01) — 3직업 개편의 토대.
//
// 설계 원칙 두 가지:
//   ① **독안개와 같은 자리**(턴 종료 정산·보호막 무시·랜덤 없음)에서 처리한다.
//      독안개가 이미 그 자리에서 결정론적으로 도는 걸 검증했으므로, 같은 규칙을
//      따르면 멀티 락스텝이 그대로 안전하다.
//   ② 종류를 늘리지 않는다. 독·화상은 **출처만 다른 같은 지속피해**(궁수/마법사),
//      빙결은 이동만 막는다. `stun`(카드를 통째로 못 냄)과는 별개 개념이다.
// ---------------------------------------------------------------------------

export type StatusKind = 'poison' | 'burn' | 'frozen'

export interface StatusEffect {
  kind: StatusKind
  /** 남은 턴 수. 턴 종료 정산 뒤 1 감소하고, 0이 되면 사라진다. */
  turns: number
  /** 턴당 고정 피해(poison·burn). frozen은 안 쓰므로 0. */
  power: number
  /**
   * 걸린(또는 갱신된) 턴 번호. **빙결의 지속을 세는 기준**이다.
   *
   * 지속피해와 빙결은 시간 규칙이 다르다. 독·화상은 걸린 턴에 바로 갉으므로 그
   * 턴에 지속도 같이 깎는 게 맞다. 빙결은 다르다 — 이동은 슬롯 우선순위상 공격보다
   * 먼저 해소되므로, 빙결을 건 그 턴에는 남은 슬롯의 이동만 막을 뿐 온전한 한 턴을
   * 막지 못한다. 그런데도 같이 깎으면 "1턴 빙결"이 슬롯 몇 개만 막고 사라져 카드
   * 설명과 어긋난다. 그래서 빙결은 **걸린 턴에는 지속을 깎지 않는다**(기절이 턴
   * 시작에 감소하는 것과 같은 이유).
   */
  since: number
}

/**
 * 지속피해의 기본 지속 턴. 카드마다 따로 적지 않고 여기서 고정한다 — 카드가
 * 정하는 건 "얼마나 아픈가"(power)뿐이라 밸런스 손잡이가 하나로 모인다.
 */
export const STATUS_TURNS: Record<'poison' | 'burn', number> = {
  poison: 3, // 길고 약하게 — 쌓아서 조이는 궁수 쪽
  burn: 2, // 짧고 강하게 — 순간 화력을 얹는 마법사 쪽
}

/** 같은 종류가 겹칠 때 위력 상한. 무한 중첩으로 판이 터지는 걸 막는다. */
export const STATUS_POWER_CAP = 30

/** 지속피해 종류인가(빙결 제외) — 정산 대상을 가른다. */
export const isDot = (k: StatusKind): boolean => k === 'poison' || k === 'burn'

export interface CardDef {
  id: string
  name: string
  kind: CardKind
  desc: string
  /** Turns the card is locked after being played. 0 / undefined = reusable. */
  cooldown?: number

  // move
  dir?: MoveDir
  steps?: number // cells moved per play (1 or 2)

  // attack
  range?: Offset[] // cells hit, relative to attacker (+facing)
  damage?: number
  energyCost?: number

  // attack 특수 능력 — 모두 선택적, 엔진(computeAttack)이 자동 적용
  drain?: number // 적중 시(가드돼도) 상대 기력을 최대 N 빼앗아 흡수
  leech?: number // 피해를 실제로 입히면 체력 N 회복
  pierce?: boolean // 상대 보호막을 무시하고 피해를 관통
  push?: number // 적중 시 상대를 (공격자 기준) 뒤로 N칸 밀어냄 — 벽·공격자 셀에서 멈춤
  selfShield?: number // 기력 지불 성공 시 자신에게 보호막 +N (빗나가도 적용)
  recoil?: number // 기력 지불 성공 시 자신이 체력 N 손실 (빗나가도 적용)
  /**
   * 같은 셀에 겹쳐 선 상대(밀착)에게도 맞는가. 기본 true — 어떤 카드의 `range`도
   * 자기 셀 {df:0,du:0}을 덮지 않으므로 이 값이 없으면 밀착 상태에서 명중한다.
   * `false`는 "바로 옆이 사각"인 원거리 카드 전용(펄스 샷·포크 라이트닝·이온 랜스).
   */
  pointBlank?: boolean

  /** 적중 시 상대를 N턴 기절시킨다(카드를 못 냄). 런 전용 카드에서 쓴다. */
  stun?: number
  /**
   * 적중 시 상대에게 독을 건다 — 값은 **턴당 피해**, 지속은 `STATUS_TURNS.poison`.
   * 같은 종류가 이미 걸려 있으면 위력이 합산되고(상한 `STATUS_POWER_CAP`) 지속은
   * 갱신된다. 기절과 같은 규칙으로 **피해가 실제로 들어갔을 때만** 걸린다.
   */
  poison?: number
  /** 적중 시 화상 — 값은 턴당 피해, 지속은 `STATUS_TURNS.burn`. */
  burn?: number
  /** 적중 시 상대를 N턴 빙결(이동 카드가 무효가 된다 — 카드는 소모됨). */
  freeze?: number
  /** 적중 시 상대를 (공격자 쪽으로) N칸 끌어당긴다. push의 반대. */
  pull?: number
  /** 기력 지불 성공 시 이번 **전투 내내** 내 공격 피해 +N(중첩). */
  empower?: number

  // guard
  block?: number // damage absorbed this turn
  guardCost?: number // energy spent to raise the guard

  // energy
  gain?: number

  // heal — 기력을 써서 체력을 회복하는 지원 카드
  healHp?: number // 회복량(최대 체력 cap)
  healCost?: number // 소모 기력

  // visuals / flavour
  accent?: string
  signature?: boolean
  fx?: 'slash' | 'bolt' | 'orb' | 'quake' | 'flame' | 'shield' | 'rush' | 'punch'
}

export const GRID_COLS = 6
export const GRID_ROWS = 3

/** col/row delta for each move direction (row grows downward). */
export const MOVE_DELTA: Record<MoveDir, readonly [number, number]> = {
  right: [1, 0],
  left: [-1, 0],
  up: [0, -1],
  down: [0, 1],
  'up-right': [1, -1],
  'up-left': [-1, -1],
  'down-right': [1, 1],
  'down-left': [-1, 1],
}

/** 화면 좌우 반전(멀티에서 side1을 잡을 때) 시 짝이 되는 방향. */
export const MIRROR_DIR: Record<MoveDir, MoveDir> = {
  right: 'left',
  left: 'right',
  up: 'up',
  down: 'down',
  'up-right': 'up-left',
  'up-left': 'up-right',
  'down-right': 'down-left',
  'down-left': 'down-right',
}

export const inBounds = (c: Cell): boolean =>
  c.col >= 0 && c.col < GRID_COLS && c.row >= 0 && c.row < GRID_ROWS

// 독안개 — 무한전 억제 장치. FOG_START_TURN에 양 끝 열(col 0·5)부터 시작해,
// FOG_STEP_TURNS 턴마다 한 열씩 안쪽으로 조여들어(0·5 → 0·1·4·5 → 전부) 결국
// 판 전체를 덮는다. 턴 종료 시 독안개 위에 있으면 FOG_DAMAGE(실드 무시) 피해.
export const FOG_START_TURN = 6
export const FOG_STEP_TURNS = 3
export const FOG_DAMAGE = 10

// 마지막 단계 = 모든 열이 덮이는 단계. 6열이면 stage 2에서 col 0~5 전부.
const FOG_MAX_STAGE = Math.ceil(GRID_COLS / 2) - 1

/** 해당 턴의 독안개 단계. 시작 전 -1, 시작 턴 0, 이후 FOG_STEP_TURNS마다 +1(최대 cap). */
export const fogStageAt = (turn: number): number =>
  turn < FOG_START_TURN
    ? -1
    : Math.min(FOG_MAX_STAGE, Math.floor((turn - FOG_START_TURN) / FOG_STEP_TURNS))

/** 해당 턴에 이 셀이 독안개에 덮이는가 — 양 끝 열부터 안쪽으로 조여든다. */
export const isFogCell = (c: Cell, turn: number): boolean => {
  const stage = fogStageAt(turn)
  return stage >= 0 && (c.col <= stage || c.col >= GRID_COLS - 1 - stage)
}

/** 다음 턴에 독안개가 시작되거나 한 단계 더 조여드는가(경고용). */
export const fogEscalatesNext = (turn: number): boolean =>
  fogStageAt(turn + 1) > fogStageAt(turn)
/** Both fighters start on the middle row at opposite ends, facing each other. */
export const START_CELLS: readonly [Cell, Cell] = [
  { col: 0, row: 1 },
  { col: GRID_COLS - 1, row: 1 },
]

export interface BattleSnapshot {
  pos: [Cell, Cell]
  hp: [number, number]
  energy: [number, number]
  shield: [number, number] // remaining guard absorption for the current turn
  /** 현재 걸려 있는 지속 상태이상. UI가 아이콘·남은 턴을 그리는 근거. */
  status: [StatusEffect[], StatusEffect[]]
}

export type ActionResult =
  | 'move'
  | 'guard'
  | 'energy'
  | 'heal' // 기력을 써서 체력을 회복(리페어 계열)
  | 'hit'
  | 'blocked' // connected but fully absorbed by the opponent's guard
  | 'whiff' // out of range
  | 'nofuel' // could not pay the energy cost
  | 'fog' // took poison-fog damage at the edge of the grid (end of turn)
  | 'revive' // came back from a KO via a revive passive (once per battle)
  | 'stun' // 기절해 이 턴 카드를 못 냈다 / 유물 트리거로 상대를 기절시켰다
  | 'trigger' // 누적 기력 트리거 발동(회복·보호막·피해)
  | 'status' // 독·화상이 턴 종료에 갉았다(보호막 무시)
  | 'frozen' // 빙결이라 이동 카드가 무효가 됐다

export type Phase =
  | 'move'
  | 'defense'
  | 'attack'
  | 'fog'
  | 'revive'
  | 'stun'
  | 'trigger'
  | 'status'

/** 체력이 이 비율 이하면 "저체력"으로 보고 `lowHpBonusPct`가 발동한다. */
export const LOW_HP_FRAC = 0.5

/** One resolved card action, with the post-action snapshot (for animation). */
export interface Step {
  phase: Phase
  actor: number // 0 (player) or 1 (opponent)
  card: CardDef
  result: ActionResult
  damage: number // damage dealt to the opponent by this action
  heal: number // HP the actor recovered this action (leech card / lifesteal passive)
  drain: number // energy stolen from the opponent this action
  recoil: number // HP the actor lost to their own card's recoil
  snapshot: BattleSnapshot
}
