// ---------------------------------------------------------------------------
// Card-battle domain types. 2D 격자 위의 카드 전투.
//
// ⚠ **용어(2026-08-07 사용자 확정) — 이 파일 전체가 이 정의를 따른다**
//
//   턴(turn)    양쪽이 카드를 **한 장씩** 내는 것. 코드에서는 `slot` — 한 라운드에
//               0·1·2 세 번 돈다. 엔진에 `turn`이라는 이름의 값은 이제 없다.
//   라운드(round) 카드 **3장을 고르고 그 3장을 다 쓰는 것** = 3턴. `BattleState.round`가
//               세는 값이고 `CardBattle.resolveRound`가 한 번에 처리하는 단위다.
//
//   그래서 "3라운드 지속"은 **카드 9장**이 지나갈 동안이고, "이번 라운드 기절"은
//   남은 슬롯을 통째로 못 낸다는 뜻이다. 예전 코드·문서의 "N턴"은 거의 전부 지금
//   말로는 **라운드**였다 — 새로 글을 쓸 때 헷갈리지 말 것.
//
//   ⚠ **아직 `turn`이라 불리는 것 둘**: 패시브 훅 `turnEnergy`/`turnShield`(유물
//   158종이 참조하는 이름이라 안 건드렸다 — 실제로는 **라운드마다**다)와 온라인
//   프로토콜의 `msg.turn`(전선 위 필드 — 역시 라운드 번호다).
//
// 한 라운드는 고른 슬롯 순서대로(1→2→3) 해소되고, 한 슬롯 안에서는 양측 카드가
// 종류 우선순위(이동 → 수비 → 공격)로 정렬된다(engine `resolveRound`). 카드의
// `cooldown`은 **라운드** 단위로 돈다. 설계 전문은 docs/GAME_DESIGN.md.
// ---------------------------------------------------------------------------

/** 룰셋 버전 — 온라인 대전의 락스텝 호환성 표식.
 *
 *  두 피어는 서버 없이 각자 `resolveRound`을 돌려 같은 결과를 낸다(랜덤 없음).
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
 *  연출·UI·밸런스 시뮬처럼 `resolveRound`의 출력에 닿지 않는 변경은 올리지 않아도 된다.
 */
// 2 (2026-08-05): ① `facing`이 좌석 고정 → **상대 위치 기준**(넉백·사거리 방향이
//     상대를 지나친 뒤에도 맞는다) ② 같은 슬롯 트레이드에서 **밀려난 쪽의 공격을
//     새 자리에서 재판정**한다. 둘 다 `resolveRound` 출력이 바뀐다.
// 3 (2026-08-05): 격자 세로 3행 → **4행**(`GRID_ROWS`). 이동·사거리·전장 붕괴가
//     닿는 좌표 공간이 바뀌므로 두 피어가 같은 판을 돌려야 한다.
// 4 (2026-08-05): 전투 수치 전체 ÷2 리스케일(피해·체력·보호막·기력·붕괴·바위·상수).
//     resolveRound 출력의 모든 값이 절반이 되므로 구버전과 붙으면 desync.
// 5 (2026-08-07): **상태이상 전면 재정의**(사용자 확정 규칙). 넉백이 막히면 못 밀린
//     칸당 피해+기절 · 기절/빙결/속박이 **그 라운드 한정**(다음 라운드로 안 넘어감)
//     · 중독은 **이동 1칸당** 피해(보호막 관통) · 화상은 **피격 1회당** 추가 피해
//     (보호막 관통) · 빙결은 맞으면 깨지고 그 타격에 추가 피해 · 독안개 타일 추가.
//     `resolveRound` 출력이 통째로 달라진다.
export const RULES_VERSION = 5

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
// 상태이상 (2026-08-07 전면 재정의 — 사용자 확정 규칙)
//
// 전엔 독·화상이 **똑같은 지속피해**였고 빙결은 이동만 막았다. 종류는 여섯인데
// 실제로 하는 일이 셋뿐이라 어느 것에 걸렸는지가 판에서 안 읽혔다. 이제 **각각이
// 다른 자리를 때린다** — 무엇에 걸렸느냐가 곧 "이번 라운드에 뭘 하면 안 되는가"다.
//
//   중독 poison  **행동하면** 아프다   이동 1칸/공격 1장당 3(중첩당) · 관통 · N라운드
//   화상 burn    **맞으면** 더 아프다  피격 1회당 +5(중첩당) · 보호막 관통 · N라운드
//   빙결 frozen  **이 라운드 정지**    맞으면 깨진다(그 타격에 +5)
//   기절 stunned **이 라운드 정지**    깨지지 않는다 — 순수 봉인
//   속박 bind    **이 라운드 이동 불가** 공격·수비는 그대로 나간다
//
// ⚠ **셋(빙결·기절·속박)은 기본적으로 그 라운드 안에서만 산다.** 슬롯 1에서 걸리면
//   슬롯 2·3을 막고, 슬롯 3에서 걸리면 아무것도 못 막고 사라진다(그래서 마지막 슬롯에
//   기절기를 넣을 이유가 없다 — 사용자 확정).
//
// ⚠ **예외는 런 전용 전설 유물뿐이다**(2026-08-07 2차). `stunRoundBonus` 계열 훅이
//   있으면 봉인이 **다음 라운드까지** 이어진다. 그래서 두 가지 안전장치가 있다:
//     ① **이미 걸려 있는 봉인은 다시 걸리지 않는다**(`applyStatus`의 재부여 가드).
//        그래서 "기절 → 다음 라운드도 기절 → 그 라운드에 또 맞아도 갱신 안 됨 →
//        그다음 라운드엔 반드시 일어난다"가 성립한다. 유물 하나로 영구 봉인이 안 된다.
//     ② 훅은 **유물에만** 있다 — `ROSTER.passive`에도 몬스터에도 없으므로 PvP·봇전에서는
//        존재하지 않는다(`npm run check`가 단정한다).
//   지속은 라운드 시작에 지우는 게 아니라 **라운드 종료에 1씩 깎아** 자연히 끝난다.
//
// ⚠ 중독·화상만 라운드를 넘어간다. 둘 다 **중첩**이 따로 산다 — `중독2`는 "2라운드
//   짜리 한 겹"이고 `중독 3개`는 "세 겹"이라 이동 1칸에 9를 맞는다. 그래서 목록을
//   합치지 않고 겹마다 한 칸씩 쓴다(합치면 서로 다른 남은 라운드를 못 적는다).
//   대신 종류당 `STATUS_STACK_CAP`겹까지만 — 무한 중첩이면 판이 터진다.
//
// 정산 자리는 전부 고정이고 랜덤이 없다 → 멀티 락스텝은 그대로 안전하다.
// ---------------------------------------------------------------------------

/**
 * 지속 효과. 앞의 다섯은 상대에게 거는 **디버프**, 뒤의 셋은 자신에게 거는 **버프**다.
 * 같은 목록·같은 정산 자리를 쓰므로 지속·중첩·스냅샷 규칙이 하나로 유지된다.
 */
export type StatusKind =
  | 'poison'
  | 'burn'
  | 'frozen'
  | 'stunned'
  | 'bind'
  | 'atkUp'
  | 'defUp'
  | 'freeCast'

/** 버프 종류만 추린 것 — 카드가 거는 대상. */
export type BuffKind = 'atkUp' | 'defUp' | 'freeCast'
export const isBuff = (k: StatusKind): boolean =>
  k === 'atkUp' || k === 'defUp' || k === 'freeCast'

/**
 * **그 라운드 안에서만 사는** 행동 제약. 라운드 시작에 통째로 지워진다.
 * ⚠ 여기에 뭔가를 더할 땐 "다음 라운드로 넘어가도 되는가"를 먼저 묻는다 — 넘어가는
 *   순간 손패 선택 화면을 잠가야 하고, 그건 다른 종류의 규칙이다.
 */
export const isRoundLock = (k: StatusKind): boolean =>
  k === 'frozen' || k === 'stunned' || k === 'bind'

/** 이 라운드에 **카드를 아예 못 내는** 상태인가(빙결·기절). 속박은 이동만 막는다. */
export const isFullLock = (k: StatusKind): boolean => k === 'frozen' || k === 'stunned'

export interface StatusEffect {
  kind: StatusKind
  /**
   * 남은 **라운드** 수(턴이 아니다 — 파일 머리의 용어 참고). 라운드 종료 정산 뒤
   * 1 감소하고 0이 되면 사라진다. 라운드 한정 제약(`isRoundLock`)은 늘 1이고,
   * 그 값과 무관하게 다음 라운드 시작에 지워진다.
   */
  rounds: number
  /**
   * 이 **한 겹**이 한 번에 주는 피해.
   *   중독  행동 1회당 — 이동 1칸 / 공격 1장 (기본 `POISON_TICK_DAMAGE`)
   *   화상  피격 1회당 (기본 `BURN_HIT_DAMAGE`)
   *   버프  atkUp = 피해 +N / defUp = 받는 피해 −N
   * 거는 쪽의 `statusPowerPct`는 **거는 순간 한 번** 여기 박아 넣는다 — 매번 다시
   * 계산하면 유물을 도중에 얻었을 때 이미 걸린 것까지 소급돼 어긋난다.
   */
  power: number
  /** 걸린 라운드 번호(연출·디버그용 기록). 규칙 판정에는 쓰지 않는다. */
  since: number
}

/**
 * 중독 한 겹이 **행동 1회당** 주는 피해. 보호막을 관통한다.
 *
 * "행동"은 **이동 1칸**과 **공격 카드 1장**이다(2026-08-07 2차 · 사용자 요청).
 * 처음엔 이동만 셌는데, 붙어서 제자리 공격만 하는 몬스터에게 중독이 **아무 일도
 * 하지 않아** 궁수 정체성이 성립하지 않았다. 수비·기력·회복·강화 같은 **지원 카드는
 * 세지 않는다** — 중독에 걸리면 "버티는 것"만 공짜로 남겨 두는 게 이 규칙의 요점이다.
 */
export const POISON_TICK_DAMAGE = 3
/** 화상 한 겹이 **피격 1회당** 얹는 추가 피해. 보호막을 관통한다. */
export const BURN_HIT_DAMAGE = 5
/** 빙결을 깨뜨린 타격에 얹히는 추가 피해(보호막 관통). */
export const FREEZE_SHATTER_BONUS = 5
/** 넉백·끌어당김이 막혀 **못 밀려난 한 칸당** 피해. 0칸도 못 밀리면 기절까지 붙는다. */
export const KNOCKBACK_BLOCK_DAMAGE = 5
/** 독안개 타일 위에서 라운드 종료에 받는 피해(보호막 무시 — 전장 붕괴와 같은 자리). */
export const FOG_DAMAGE = 10

/** 종류당 최대 중첩 수. 사용자 확정("숫자가 붙을 수 있음 최대 3"). */
export const STATUS_STACK_CAP = 3
/** 한 겹의 최대 지속 라운드. 카드가 더 큰 값을 적어도 여기서 잘린다. */
export const STATUS_MAX_ROUNDS = 3

/** 중첩이 따로 사는 종류인가(중독·화상) — 나머지는 종류당 한 칸으로 합친다. */
export const isStacking = (k: StatusKind): boolean => k === 'poison' || k === 'burn'

// ---------------------------------------------------------------------------
// 독안개 타일 (2026-08-07)
//
// 전장 붕괴와 **같은 자리·같은 규칙**이다(라운드 종료 · 보호막 무시 · 랜덤 없음).
// 다른 건 하나뿐 — 붕괴는 시간이 만들고 안개는 **카드가 깐다**. 그래서 안개는
// "여기 서 있지 마라"를 상대에게 강제하는 도구가 되고, 중독과 물린다(비키려면
// 움직여야 하는데 중독은 움직이면 아프다).
//
// ⚠ **런(싱글) 전용은 아니다** — 궁수 카드가 깔면 PvP에서도 생긴다. 그래서 이건
//   `RULES_VERSION`에 걸리는 규칙이다(바위처럼 no-op으로 빠지지 않는다).
// ---------------------------------------------------------------------------

/** 판 위의 독안개 한 칸. `rounds`가 0이 되면 걷힌다. */
export interface FogTile {
  cell: Cell
  rounds: number
}

/** 이 칸에 깔린 독안개(없으면 undefined). */
export const fogAt = (fog: readonly FogTile[], c: Cell): FogTile | undefined =>
  fog.find((f) => f.rounds > 0 && f.cell.col === c.col && f.cell.row === c.row)

export interface CardDef {
  id: string
  name: string
  kind: CardKind
  desc: string
  /** 사용 후 잠기는 **라운드** 수. 0 / undefined = 매 라운드 다시 쓸 수 있다. */
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

  /**
   * 적중 시 상대를 **이 라운드 동안** 기절시킨다(남은 슬롯의 카드를 통째로 못 냄).
   * 값은 예전 호환을 위해 숫자지만 지금은 `>0`이면 걸린다는 뜻뿐이다 — 기절은
   * 라운드를 넘어가지 않으므로 "몇 라운드"가 없다.
   */
  stun?: number
  /**
   * 적중 시 중독 **한 겹**을 건다 — 값은 그 겹이 버티는 **라운드 수**(1~
   * `STATUS_MAX_ROUNDS`, 유물 `poisonRoundBonus`만큼 늘어난다). 한 겹당 **행동 1회**
   * (이동 1칸 · 공격 1장)에 `POISON_TICK_DAMAGE`.
   * 때릴 때마다 한 겹씩 쌓이고(`STATUS_STACK_CAP`까지) **피해가 실제로 들어갔을
   * 때만** 묻는다.
   */
  poison?: number
  /** 적중 시 화상 한 겹 — 값은 지속 라운드. 한 겹당 피격 1회에 `BURN_HIT_DAMAGE`. */
  burn?: number
  /**
   * 적중 시 상대를 **이 라운드 동안** 빙결(카드를 못 냄). 기절과 달리 **맞으면
   * 깨지고**, 깨뜨린 타격에 `FREEZE_SHATTER_BONUS`가 얹힌다. 값은 `stun`과 같은
   * 이유로 `>0` 여부만 본다.
   */
  freeze?: number
  /** 적중 시 상대를 **이 라운드 동안** 속박(이동 카드만 무효 — 공격·수비는 나간다). */
  bind?: number
  /**
   * 적중 시 상대가 선 칸에 **독안개**를 깐다 — 값은 안개가 머무는 라운드 수.
   * 라운드 종료마다 그 칸에 선 쪽이 `FOG_DAMAGE`(보호막 무시). 비키게 만드는
   * 카드이고, 중독과 겹치면 "서 있어도 아프고 움직여도 아프다"가 된다.
   */
  fog?: number
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
  buffRounds?: number
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
export const COLLAPSE_START_ROUND = 6
export const COLLAPSE_STEP_ROUNDS = 3
/** 단계별 **라운드당** 피해(실드 무시). 단계가 오를수록 버티는 값이 커진다. */
export const COLLAPSE_DAMAGE: readonly number[] = [5, 8, 12]

/** 마지막 단계 = 모든 열이 무너지는 단계. 6열이면 stage 2에서 col 0~5 전부. */
export const COLLAPSE_MAX_STAGE = Math.ceil(GRID_COLS / 2) - 1

/** 해당 라운드의 붕괴 단계. 시작 전 -1, 시작 라운드 0, 이후 COLLAPSE_STEP_ROUNDS마다 +1(cap). */
export const collapseStageAt = (round: number): number =>
  round < COLLAPSE_START_ROUND
    ? -1
    : Math.min(
        COLLAPSE_MAX_STAGE,
        Math.floor((round - COLLAPSE_START_ROUND) / COLLAPSE_STEP_ROUNDS),
      )

/** 해당 라운드에 이 셀이 무너져 있는가 — 양 끝 열부터 안쪽으로 무너진다. */
export const isCollapsedCell = (c: Cell, round: number): boolean => {
  const stage = collapseStageAt(round)
  return stage >= 0 && (c.col <= stage || c.col >= GRID_COLS - 1 - stage)
}

/** 그 라운드에 무너진 칸에 서 있으면 받는 피해. 단계 밖이면 0. */
export const collapseDamageAt = (round: number): number => {
  const stage = collapseStageAt(round)
  if (stage < 0) return 0
  return COLLAPSE_DAMAGE[Math.min(stage, COLLAPSE_DAMAGE.length - 1)]
}

/** 판 전체가 무너졌는가 — 이때는 도망칠 칸이 없다(AI가 이걸 봐야 한다). */
export const isFullyCollapsed = (round: number): boolean =>
  collapseStageAt(round) >= COLLAPSE_MAX_STAGE

/** 다음 라운드에 붕괴가 시작되거나 한 단계 더 번지는가(경고용). */
export const collapseEscalatesNext = (round: number): boolean =>
  collapseStageAt(round + 1) > collapseStageAt(round)
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
  /** 현재 걸려 있는 상태이상. UI가 아이콘·남은 라운드를 그리는 근거. */
  status: [StatusEffect[], StatusEffect[]]
  /** 이 시점에 판에 서 있는 바위. 깨지는 순간이 스텝별로 보여야 하므로 스냅샷에 싣는다. */
  obstacles: Obstacle[]
  /** 이 시점에 깔려 있는 독안개. 바위와 같은 이유로 스냅샷에 싣는다. */
  fog: FogTile[]
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
  | 'stun' // 기절해 이 슬롯의 카드를 못 냈다 / 유물 트리거로 상대를 기절시켰다
  | 'trigger' // 누적 기력 트리거 발동(회복·보호막·피해)
  | 'status' // 중독이 이동을 갉았다 / 독안개를 밟았다(보호막 무시)
  | 'frozen' // 빙결이라 이 슬롯의 카드를 못 냈다
  | 'bind' // 속박이라 이동 카드가 무효가 됐다
  | 'rock' // 바위를 세웠다 / 바위가 부서졌다
  | 'fog' // 판에 독안개를 깔았다

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
