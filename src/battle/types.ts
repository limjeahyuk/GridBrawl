// ---------------------------------------------------------------------------
// Card-battle domain types. Turn-based on a 2D grid: each turn both fighters
// pick 3 cards, which resolve in the SELECTED slot order (1→2→3); within one
// slot the two sides' cards order by type priority — move, then defense
// (guard/energy), then attack (see engine `resolveTurn`). Cards carry a
// cooldown (turns locked after use). See docs/GAME_DESIGN.md for the design.
// ---------------------------------------------------------------------------

/** 룰셋 버전 — 온라인 대전의 락스텝 호환성 표식.
 *
 *  두 피어는 서버 없이 각자 `resolveTurn`을 돌려 같은 결과를 낸다(랜덤 없음).
 *  그 전제는 **양쪽이 같은 룰 코드를 돌린다**는 것이라, 한쪽만 갱신되면 조용히
 *  결과가 갈린다(크래시가 아니라 desync — 재현이 거의 불가능하다). 그래서 매칭
 *  전에 이 값을 교환해 다르면 아예 붙이지 않는다. (`net/protocol.ts`의 `hello`,
 *  `net/matchmaking.ts`의 대기표 필터.)
 *
 *  ⚠ 아래를 바꾸면 **반드시 올린다** — 웹은 배포 즉시 갱신되지만 앱은 스토어·OTA를
 *  거쳐 늦게 따라오므로, 버전이 겹치는 기간이 실제로 존재한다:
 *    - `types.ts`의 룰 상수(격자·전장 붕괴·상태이상 지속)
 *    - `engine.ts`의 턴 해소 규칙
 *    - `cards.ts`·`roster.ts`의 카드 수치·사거리·능력 (id 추가·삭제 포함)
 *  연출·UI·밸런스 시뮬처럼 `resolveTurn`의 출력에 닿지 않는 변경은 올리지 않아도 된다.
 */
// 2 (2026-08-05): ① `facing`이 좌석 고정 → **상대 위치 기준**(넉백·사거리 방향이
//     상대를 지나친 뒤에도 맞는다) ② 같은 슬롯 트레이드에서 **밀려난 쪽의 공격을
//     새 자리에서 재판정**한다. 둘 다 `resolveTurn` 출력이 바뀐다.
// 3 (2026-08-05): 격자 세로 3행 → **4행**(`GRID_ROWS`). 이동·사거리·전장 붕괴가
//     닿는 좌표 공간이 바뀌므로 두 피어가 같은 판을 돌려야 한다.
// 4 (2026-08-05): 전투 수치 전체 ÷2 리스케일(피해·체력·보호막·기력·붕괴·바위·상수).
//     resolveTurn 출력의 모든 값이 절반이 되므로 구버전과 붙으면 desync.
export const RULES_VERSION = 4

export type Difficulty = 'easy' | 'normal' | 'hard'

export type CardKind = 'move' | 'attack' | 'guard' | 'energy' | 'heal' | 'buff'

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

/**
 * 지속 효과. 앞의 셋은 상대에게 거는 **디버프**, 뒤의 셋은 자신에게 거는
 * **버프**다(2026-08-01). 같은 목록·같은 정산 자리를 쓰므로 지속·중첩·스냅샷
 * 규칙이 하나로 유지되고, 랜덤이 없어 멀티 락스텝도 그대로 안전하다.
 */
export type StatusKind = 'poison' | 'burn' | 'frozen' | 'atkUp' | 'defUp' | 'freeCast'

/** 버프 종류만 추린 것 — 카드가 거는 대상. */
export type BuffKind = 'atkUp' | 'defUp' | 'freeCast'
export const isBuff = (k: StatusKind): boolean =>
  k === 'atkUp' || k === 'defUp' || k === 'freeCast'

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
export const STATUS_POWER_CAP = 15

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
   * `false`는 "바로 옆이 사각"인 원거리 카드 전용(돌팔매·독니 화살·꿰뚫는 화살 등).
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
  /**
   * 적중하면 상대 보호막을 **남김없이** 없앤다(피해 계산 전). 유물 `shieldBreak`의
   * 카드판 — 보호막을 매 턴 쌓는 상대를 한 장으로 뚫는 자리다.
   */
  shatter?: boolean
  /** 기력 지불 성공 시 이번 **전투 내내** 내 공격 피해 +N(중첩). */
  empower?: number
  /**
   * 공격 **직전에** 내 facing 기준으로 N칸 이동한다(+ 전진 / − 후퇴).
   * 절대 방향이 아니라 **상대 방향**이라 멀티에서 미러링이 필요 없다(`faceCard` 무관).
   * 공격 페이즈에 해소되므로 **상대가 이동을 마친 뒤에** 움직인다 — 궁수가 붙은
   * 상대에게서 물러나며 쏘는(카이팅) 수단이다. 벽에 막히면 갈 수 있는 만큼만 간다.
   */
  dashForward?: number
  /**
   * 기력 지불 성공 시 판에 **바위를 세운다**(런 전용 — 지금은 수호기사 보스만).
   * 파이터가 선 칸·이미 바위가 있는 칸·무너진 칸은 건너뛴다.
   */
  raiseRocks?: RockPlan

  // buff — 자신에게 N턴짜리 지속 효과를 건다
  buff?: BuffKind
  /** atkUp = 피해 +N, defUp = 받는 피해 −N, freeCast는 쓰지 않는다(0). */
  buffPower?: number
  buffTurns?: number
  buffCost?: number // 소모 기력

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
export const GRID_ROWS = 4

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

// ---------------------------------------------------------------------------
// 지형 — 바위 (2026-08-05)
//
// 판이 6×3짜리 빈 격자뿐이라 어느 전투나 "가로로 붙었다 떨어졌다"만 반복됐다.
// 바위는 그 판에 **막힌 칸**을 만들어 접근 경로와 사격선을 동시에 끊는다.
//
// 규칙은 셋뿐이다 — 늘리지 않는다:
//   ① **못 들어간다.** 이동·이동공격(dashForward)·넉백·끌어당김이 바위 앞에서
//      멈춘다. 벽과 같은 자리에서 처리되므로 새 분기가 거의 안 생긴다.
//   ② **사격선을 끊는다.** 공격자와 목표가 **같은 줄이나 같은 열**일 때, 그 사이에
//      낀 바위가 그 칸을 가린다. 대각으로 어긋난 칸은 안 가린다 — 그래서 **줄을
//      옮기는 것**이 언제나 우회로로 남고, "거리를 사는" 궁수가 갇히지 않는다.
//   ③ **부술 수 있다.** 체력이 있어서 때리면 깨진다(`ROCK_HP`). 공격이 덮은 칸에
//      선 바위, 그리고 그 공격을 **가로막은** 바위가 피해를 받는다 — 어떤 카드든
//      결국 길을 뚫을 수 있다.
// 예외는 **관통**(`pierce` · 유물 `alwaysPierce`)이다. 관통 공격은 바위를 무시하고
// 그 뒤를 그대로 때린다(바위도 안 깎는다) — 궁수·마법사의 답이 되는 자리다.
//
// ⚠ **런(싱글) 전용이다.** 바위는 오직 `BattleOpts.obstacles`로만 들어오고 PvP·봇전은
//   빈 배열이라 아래 규칙이 전부 no-op이 된다 — 그래서 `RULES_VERSION`을 올리지
//   않는다(보스 전용 카드와 같은 근거). 바위가 PvP 판에 놓이는 날에는 반드시 올린다.
// ---------------------------------------------------------------------------

/** 판 위에 선 바위 한 덩이. `hp`가 0이 되면 부서져 목록에서 빠진다. */
export interface Obstacle {
  cell: Cell
  hp: number
  maxHp: number
}

/** 바위 기본 체력. 카드 한 장으로는 못 깨고 두세 대를 들여야 하는 값. */
export const ROCK_HP = 25

/** 이 칸에 선 바위(없으면 undefined). */
export const rockAt = (rocks: readonly Obstacle[], c: Cell): Obstacle | undefined =>
  rocks.find((r) => r.hp > 0 && r.cell.col === c.col && r.cell.row === c.row)

/** 이 칸에 들어갈 수 있는가 — 격자 안이고 바위가 없어야 한다. */
export const canStand = (rocks: readonly Obstacle[], c: Cell): boolean =>
  inBounds(c) && !rockAt(rocks, c)

/**
 * `from`에서 `to`를 노릴 때 **사이를 가로막고 선** 바위(가장 가까운 것). 없으면
 * undefined.
 *
 * 같은 줄(행)이나 같은 열일 때만 가린다 — 대각으로 어긋난 칸은 뚫린 것으로 본다.
 * 6×3 격자에서 임의의 선분을 긋는 규칙(Bresenham 등)은 판정이 눈에 안 읽히고,
 * "가로·세로로 곧게 이어질 때만 막힌다"는 그림만 보고도 바로 알 수 있다.
 * `to` 칸 자체에 선 바위는 여기서 세지 않는다(그건 목표를 가리는 게 아니라 **그게
 * 목표**다 — 호출부가 `rockAt`으로 따로 본다).
 */
export function shadowRock(
  rocks: readonly Obstacle[],
  from: Cell,
  to: Cell,
): Obstacle | undefined {
  if (!rocks.length) return undefined
  if (from.row === to.row) {
    const step = to.col > from.col ? 1 : to.col < from.col ? -1 : 0
    if (step === 0) return undefined
    for (let col = from.col + step; col !== to.col; col += step) {
      const r = rockAt(rocks, { col, row: from.row })
      if (r) return r
    }
    return undefined
  }
  if (from.col === to.col) {
    const step = to.row > from.row ? 1 : -1
    for (let row = from.row + step; row !== to.row; row += step) {
      const r = rockAt(rocks, { col: from.col, row })
      if (r) return r
    }
    return undefined
  }
  return undefined // 대각으로 어긋난 칸 — 바위가 가리지 않는다
}

/** 카드가 판에 세우는 바위. 지금은 보스 카드(수호기사)만 쓴다. */
export interface RockPlan {
  /** 세울 바위의 체력. */
  hp: number
  /**
   * 어디에 세우는가.
   *   flankFoe  상대의 좌우 두 칸 — **가둔다**(줄을 바꿔야 빠져나온다)
   *   flankSelf 내 좌우 두 칸 — 나에게 붙는 길을 막는다
   */
  where: 'flankFoe' | 'flankSelf'
}

// ---------------------------------------------------------------------------
// 전장 붕괴 (2026-08-05, 옛 "독안개") — 무한전 억제 장치.
//
// **왜 안개가 아니라 붕괴인가**: 예전엔 보라색 독안개가 가장자리를 덮었는데, 판이
// 6×3뿐이라 "안개가 낀다"보다 **"설 자리가 줄어든다"**가 실제로 일어나는 일이었다.
// 그래서 연출을 바닥이 무너지는 쪽으로 바꿨다 — 이름·색·경고가 전부 그쪽이다.
//
// ⚠ **무너진 칸에도 들어갈 수 있다(소프트 위험지대).** 벽으로 막지 않는 이유:
//   ① 판이 6×3이고 마지막 단계는 **전 칸**이 무너진다 — 막으면 설 자리가 0이 된다.
//   ② 넉백·끌어당김·돌진이 상시로 위치를 옮긴다. 막힌 칸이 생기면 "밀렸는데 갈 곳이
//      없다"를 엔진 곳곳에서 따로 처리해야 하고, 그게 곧 룰 분기 = 락스텝 위험이다.
//   ③ 궁수의 정체성이 "거리를 사는 것"이다. 강제로 좁히면 붙어야만 하는 판이 되어
//      3직업 약점 설계가 무너진다. **체력을 내고 거리를 사는** 선택으로 남긴다.
// 대신 단계가 오를수록 **더 아프게** 해서 소모전이 실제로 끝나게 한다.
export const COLLAPSE_START_TURN = 6
export const COLLAPSE_STEP_TURNS = 3
/** 단계별 턴당 피해(실드 무시). 단계가 오를수록 버티는 값이 커진다. */
export const COLLAPSE_DAMAGE: readonly number[] = [5, 8, 12]

/** 마지막 단계 = 모든 열이 무너지는 단계. 6열이면 stage 2에서 col 0~5 전부. */
export const COLLAPSE_MAX_STAGE = Math.ceil(GRID_COLS / 2) - 1

/** 해당 턴의 붕괴 단계. 시작 전 -1, 시작 턴 0, 이후 COLLAPSE_STEP_TURNS마다 +1(cap). */
export const collapseStageAt = (turn: number): number =>
  turn < COLLAPSE_START_TURN
    ? -1
    : Math.min(
        COLLAPSE_MAX_STAGE,
        Math.floor((turn - COLLAPSE_START_TURN) / COLLAPSE_STEP_TURNS),
      )

/** 해당 턴에 이 셀이 무너져 있는가 — 양 끝 열부터 안쪽으로 무너진다. */
export const isCollapsedCell = (c: Cell, turn: number): boolean => {
  const stage = collapseStageAt(turn)
  return stage >= 0 && (c.col <= stage || c.col >= GRID_COLS - 1 - stage)
}

/** 그 턴에 무너진 칸에 서 있으면 받는 피해. 단계 밖이면 0. */
export const collapseDamageAt = (turn: number): number => {
  const stage = collapseStageAt(turn)
  if (stage < 0) return 0
  return COLLAPSE_DAMAGE[Math.min(stage, COLLAPSE_DAMAGE.length - 1)]
}

/** 판 전체가 무너졌는가 — 이때는 도망칠 칸이 없다(AI가 이걸 봐야 한다). */
export const isFullyCollapsed = (turn: number): boolean =>
  collapseStageAt(turn) >= COLLAPSE_MAX_STAGE

/** 다음 턴에 붕괴가 시작되거나 한 단계 더 번지는가(경고용). */
export const collapseEscalatesNext = (turn: number): boolean =>
  collapseStageAt(turn + 1) > collapseStageAt(turn)
/**
 * 파이터가 바라보는 쪽(+1 오른쪽 / −1 왼쪽) — **상대 위치로만 정한다**(2026-08-05).
 *
 * 엔진·AI·UI가 **같은 답을 내야 하는** 규칙이라 여기 한 곳에 둔다. 예전엔 각자
 * `p === 0 ? 1 : -1`을 손으로 적어 좌석에 못 박혀 있었고, 대시·넉백으로 상대를
 * 지나치면 셋 다 반대쪽을 향했다(그런데 스프라이트만 `faceToward`로 제대로
 * 돌아서서, 보이는 방향과 판정이 어긋났다).
 *
 * 같은 열이면 겨룰 기준이 없으므로 `seat`으로 떨어진다(p0=오른쪽). 순수 함수라
 * 랜덤이 없고, 같은 판을 보는 두 피어는 같은 값을 낸다 — 멀티 락스텝 안전.
 *
 * ⚠ **좌석 폴백은 임시 처리가 아니라 확정된 룰이다**(2026-08-05 사용자 결정).
 * 겹친 칸에서 플레이어(p0)가 밀면 **상대는 오른쪽으로** 간다. 실제 런에서
 * **넉백의 82%가 겹친 상태에서 일어나므로**(1500런 실측) 이 한 줄이 곧 체감 규칙이다.
 * "멀어지는 쪽이 정의되지 않았으니 대충 좌석으로 뒀다"고 읽고 고치지 말 것 —
 * `npm run check`의 "넉백 3원칙"이 세 경우를 그대로 지킨다.
 */
export function facingBetween(me: Cell, foe: Cell, seat: number): number {
  if (foe.col === me.col) return seat === 0 ? 1 : -1
  return foe.col > me.col ? 1 : -1
}

/** PvP·봇전 기본 시작 위치 — 양 끝, 위에서 둘째 줄(row 1)에서 마주 본다. 4행이라
 *  정확한 중앙은 없지만, 락스텝은 고정값만 있으면 되고 런은 여기를 안 쓴다(랜덤). */
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
  /** 이 시점에 판에 서 있는 바위. 깨지는 순간이 스텝별로 보여야 하므로 스냅샷에 싣는다. */
  obstacles: Obstacle[]
}

export type ActionResult =
  | 'move'
  | 'guard'
  | 'energy'
  | 'heal' // 기력을 써서 체력을 회복(상처 봉합 계열)
  | 'buff' // 자신에게 N턴 강화를 걸었다(공격력·방어력·기력 면제)
  | 'hit'
  | 'blocked' // connected but fully absorbed by the opponent's guard
  | 'whiff' // out of range
  | 'nofuel' // could not pay the energy cost
  | 'collapse' // 무너진 칸에 서 있어 턴 종료에 피해를 입었다(실드 무시)
  | 'revive' // came back from a KO via a revive passive (once per battle)
  | 'stun' // 기절해 이 턴 카드를 못 냈다 / 유물 트리거로 상대를 기절시켰다
  | 'trigger' // 누적 기력 트리거 발동(회복·보호막·피해)
  | 'status' // 독·화상이 턴 종료에 갉았다(보호막 무시)
  | 'frozen' // 빙결이라 이동 카드가 무효가 됐다
  | 'rock' // 바위를 세웠다 / 바위가 부서졌다

export type Phase =
  | 'move'
  | 'defense'
  | 'attack'
  | 'collapse'
  | 'revive'
  | 'stun'
  | 'trigger'
  | 'status'
  | 'rock'

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
