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
// `cooldown`은 **라운드** 단위로 돈다. 설계 전문은 docs/rules/BATTLE.md.
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
// 6 (2026-08-07): **바위가 PvP 판에 놓인다.** 전사 `war-menhir`·마법사 `mag-menhir`가
//     판에 바위를 세우는 플레이어 카드로 들어왔다 — 그전까지 바위는 런 전용
//     (`BattleOpts.obstacles`)이라 PvP에서는 지형 규칙 전체가 no-op이었고, 그게
//     RULES_VERSION을 안 올려도 됐던 근거였다. 이제 카드 두 장이 그 전제를 깬다.
//     같은 커밋에서 `RockPlan.where`에 `'ahead'`가 생기고, 공격 카드의 바위 세우기가
//     **넉백 뒤**로 옮겨졌다(`settleAttack`) — 둘 다 `resolveRound` 출력에 닿는다.
// 7 (2026-11-10): 같은 슬롯 트레이드에서 **넉백에 처박혀 기절한 쪽은 그 슬롯 공격도
//     못 한다**(전엔 새 자리에서 닿기만 하면 그대로 나갔다). `resolveRound` 출력이 바뀐다.
// 8 (2026-11-10): 붕괴 **안전지대** — 가운데 4칸은 끝까지 안 무너진다(`isCollapseSafe`).
// 9 (2026-11-10): 마법사 직업 카드 재설계(원거리·속박·화상 — 사거리·능력 변경).
export const RULES_VERSION = 9

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
//   중독 poison  **행동하면** 아프다   이동 · 공격 카드 1장 · 밀려남 한 번에 겹 × 1 · 관통 · 겹 = N라운드
//   화상 burn    **맞으면** 더 아프다  카드 공격 피해 +10/20/30%(1/2/3겹~) · 보호막이 막는다 · 겹 = N라운드
//   빙결 frozen  **그 턴 정지**     피해를 받으면 깨진다(카드 타격이면 +5)
//   기절 stunned **그 턴 정지**     깨지지 않는다 — 순수 봉인
//   속박 bind    **그 턴 이동 불가** 공격·수비는 그대로 나간다
//
// ⚠ **이동불가 상태이상**(셋 — 2026-11-13 개편 · `docs/rules/STATUS.md` 4절)은 **턴 단위**다.
//   숫자 N = 건 턴 **다음부터 N턴**(`rounds`가 "지금 턴 뒤로 남은 턴"). 슬롯이 시작할 때마다
//   1씩 줄고 **라운드를 넘어간다**. 넘어간 기절 · 빙결 턴은 카드를 고를 때 슬롯이 잠긴다.
//   겹치기: 속박 → 기절 → 빙결 순으로만 위에 얹히고(같은 것 · 아래 것은 안 걸림), 얹혀도
//   **처음 걸린 봉인의 남은 길이**를 넘지 않는다. 빙결 중엔 아무것도 안 걸리고 그 타격은
//   빙결만 깬다. 연장 훅(`*RoundBonus` — 이름만 남은 옛 이름, 값은 턴)은 **유물에만** 있다.
//
// ⚠ 중독·화상만 라운드를 넘어간다.
//   **중독**(2026-11-12 개편 · `docs/rules/STATUS.md` 1절)은 한 칸이고 `rounds`가 곧
//   **겹 수 = 남은 라운드**다 — 걸 때마다 더하고(상한 없음), 라운드 끝마다 1 준다.
//   **화상**(2026-11-13 개편 · 2절)도 같은 한 칸 + 겹 수다. 세기만 3겹에서 멈춘다(+30%).
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
 * **이동불가 상태이상**(턴 단위 — 위 머리글). `rounds`가 남은 **턴**이고 라운드 끝 정산을
 * 타지 않는다(슬롯 시작마다 줄어든다).
 */
export const isLock = (k: StatusKind): boolean =>
  k === 'frozen' || k === 'stunned' || k === 'bind'

/** 겹치기 순위 — 높은 것만 낮은 것 위에 얹힌다(속박 < 기절 < 빙결 · 사용자 지정 2026-11-12). */
export const LOCK_RANK: Partial<Record<StatusKind, number>> = { bind: 1, stunned: 2, frozen: 3 }

/** 그 턴에 **카드를 아예 못 내는** 상태인가(빙결·기절). 속박은 이동만 막는다. */
export const isFullLock = (k: StatusKind): boolean => k === 'frozen' || k === 'stunned'

export interface StatusEffect {
  kind: StatusKind
  /**
   * 남은 **라운드** 수. 라운드 종료 정산 뒤 1 감소하고 0이 되면 사라진다.
   * ⚠ **이동불가(`isLock`)만 턴**이다 — "지금 턴 뒤로 남은 턴". 슬롯 시작마다 1씩 줄고,
   *   0인 채로 다음 슬롯이 오면 사라진다.
   */
  rounds: number
  /**
   * 이 **한 겹**이 한 번에 주는 피해.
   *   중독  쓰지 않는다 — 피해는 `rounds`(겹) × `POISON_TICK_DAMAGE`를 아플 때 계산
   *   화상  쓰지 않는다 — 세기는 맞을 때 겹(`rounds`)으로 `burnPct`
   *   버프  atkUp = 피해 +N / defUp = 받는 피해 −N
   * 거는 쪽의 `statusPowerPct`는 **거는 순간 한 번** 여기 박아 넣는다 — 매번 다시
   * 계산하면 유물을 도중에 얻었을 때 이미 걸린 것까지 소급돼 어긋난다.
   */
  power: number
  /** 걸린 라운드 번호(연출·디버그용 기록). 규칙 판정에는 쓰지 않는다. */
  since: number
}

/**
 * 중독 **한 겹**이 **행동 한 번**에 주는 피해(2026-11-12 개편 — 3 → 1). 보호막을 관통한다.
 *
 * "행동 한 번" = 이동 카드 1장(몇 칸이든 · 0칸이면 안 아픔) · 공격 카드 1장(빗나가도 ·
 * 이동공격 합쳐서) · 밀려나거나 끌려감 한 번. 수비 · 기력 · 회복 · 강화는 **세지 않는다**
 * — 중독에 걸리면 "버티는 것"만 공짜로 남겨 두는 게 이 규칙의 요점이다.
 */
export const POISON_TICK_DAMAGE = 1
/**
 * **화상**(2026-11-13 개편 · `docs/rules/STATUS.md` 2절) — 카드 공격에 맞을 때 보호막 전 피해에
 * 겹당 +10%, **3겹에서 멈춘다**(+30%). 늘어난 몫도 보호막 · 경감이 막는다.
 */
export const BURN_PCT_PER_STACK = 10
export const BURN_PCT_MAX_STACKS = 3
export const burnPct = (stacks: number): number =>
  Math.min(Math.max(0, stacks), BURN_PCT_MAX_STACKS) * BURN_PCT_PER_STACK
/** 화염 · 용암 지형이 턴 끝에 거는 화상 겹(`HAZARDS.md` 3절 — 체력에 닿았을 때만). */
export const FIRE_BURN_STACKS = 1
/** 빙결을 깨뜨린 타격에 얹히는 추가 피해(보호막 관통). */
export const FREEZE_SHATTER_BONUS = 5
/** 넉백·끌어당김이 막혀 **못 밀려난 한 칸당** 피해. 0칸도 못 밀리면 기절까지 붙는다. */
export const KNOCKBACK_BLOCK_DAMAGE = 5

/** 버프의 최대 지속 라운드(중독 · 화상은 겹 = 라운드라 상한이 없다). */
export const STATUS_MAX_ROUNDS = 3

/** 겹 수를 **더하는** 종류인가(중독 · 화상 — 한 칸의 `rounds`가 겹 수). 나머지는 종류당 한 칸. */
export const isLayered = (k: StatusKind): boolean => k === 'poison' || k === 'burn'

// ---------------------------------------------------------------------------
// 판 위의 것 — 함정 · 독안개 · 구멍 (2026-11-13 재설계 · `docs/rules/HAZARDS.md`)
//
// 함정은 **런 전용**(`BattleOpts.hazards`)이고, 독안개는 카드가 깐다. 둘 다 **턴 단위**로
// 정산한다(슬롯이 끝날 때마다 — 이동 · 수비 · 공격을 다 치른 뒤).
// 랜덤(빙판 넘어짐 · 구멍에서 나올 칸)은 전투마다 받은 시드(`BattleOpts.seed`)로 엔진 안에서
// 굴린다 — 같은 입력 → 같은 결과는 그대로다(`HAZARDS.md` 10절).
// ---------------------------------------------------------------------------

/** 판 위의 독안개 한 칸. `turns`가 0이 되면 걷힌다. */
export interface FogTile {
  cell: Cell
  /** 남은 턴 — 턴이 끝날 때마다 서 있는 쪽에 중독 1겹을 건 뒤 1 준다. */
  turns: number
  /** 카드가 깐 가운데 칸인가 — 가운데 칸만 십자로 퍼진다(퍼진 칸은 안 퍼진다). */
  origin?: boolean
}
/** 독안개 지속(턴) — 카드는 숫자 없이 그냥 깐다(`HAZARDS.md` 8절). */
export const FOG_TURNS = 5
/** 가운데 칸의 남은 턴이 이 값이 되는 순간 십자로 퍼진다(3턴 뒤 · 퍼진 칸은 2턴 뒤 다 같이 걷힌다). */
export const FOG_SPREAD_AT = 2

/**
 *   bramble  덩굴 — 들어서면(지나가다 · 밀려 가다도) **그 칸에서 멈추고** 속박 1턴. 화염 · 용암이
 *            상하좌우에 붙어 있으면 라운드 끝에 화염으로 바뀐다.
 *   fire     화염 — 턴 끝에 서 있으면 피해 10 + 화상 1겹, 지나가면 5. 보호막 · 경감이 막는다. 9턴 뒤 꺼진다.
 *   lava     용암 — 화염과 같되 지나가기는 무해 · 꺼지지 않는다(지금은 안 깐다).
 *   crack    균열 — 1~3단계. 밟거나 지나갈 때 · 위에서 턴이 끝날 때 한 단계 → 3단계 다음은 구멍.
 *   hole     구멍 — 지나가기는 괜찮고, **멈추면 빠진다**(피해 50 + 상하좌우 무작위 칸).
 *   ice      빙판 — 위에서 무엇을 하든(지나가기 · 도착 포함) 30%로 넘어진다 → 기절 1턴 · 빙판이 사라진다.
 *   danger   위험 칸 — 표시 전용(추후 카드용). 아무 일도 안 일어난다.
 */
export type HazardKind = 'bramble' | 'fire' | 'lava' | 'crack' | 'hole' | 'ice' | 'danger'
export interface Hazard {
  kind: HazardKind
  cell: Cell
  /** 화염 — 남은 턴(0이면 꺼진다). 나머지는 안 쓴다. */
  turns?: number
  /** 균열 — 단계(1~3). */
  stage?: number
}
export const FIRE_TURNS = 9
/** 화염 · 용암 칸에서 턴이 끝날 때 받는 피해(보호막 · 받는 피해 감소가 막는다). */
export const FIRE_STAND_DAMAGE = 10
/** 화염 칸을 지나갈 때 받는 피해(같은 규칙 · 화상은 없다). */
export const FIRE_PASS_DAMAGE = 5
/** 구멍에 빠졌을 때 피해(보호막 무시 · 구멍 피해 감소 유물 `collapseResist`만 깎는다). */
export const HOLE_FALL_DAMAGE = 50
/** 빙판 위에서 행동할 때 넘어질 확률. */
export const ICE_SLIP_CHANCE = 0.3
/** 균열 마지막 단계 — 여기서 한 번 더 오르면 구멍. */
export const CRACK_MAX_STAGE = 3

/**
 * **전투를 끝낼 장치**(T20 · 2026-11-13 사용자 — 임시값은 `HAZARDS.md` 8-quater).
 * 10라운드부터 5라운드마다 빈 칸 `HOLE_SPAWN_COUNT`개가 구멍이 된다 — 그 라운드 카드를 고를 때 이미 보인다.
 */
export const HOLE_SPAWN_START = 10
export const HOLE_SPAWN_EVERY = 5
export const HOLE_SPAWN_COUNT = 2
/** 이 라운드가 **시작될 때** 구멍이 새로 생기는가. */
export const holesSpawnAt = (round: number): boolean =>
  round >= HOLE_SPAWN_START && (round - HOLE_SPAWN_START) % HOLE_SPAWN_EVERY === 0

export const hazardAt = (list: readonly Hazard[], c: Cell): Hazard | undefined =>
  list.find((h) => h.cell.col === c.col && h.cell.row === c.row)

/** 이 칸에 깔린 독안개(없으면 undefined). */
export const fogAt = (fog: readonly FogTile[], c: Cell): FogTile | undefined =>
  fog.find((f) => f.turns > 0 && f.cell.col === c.col && f.cell.row === c.row)

/**
 * 시드 의사 난수(mulberry32) — 상태 한 정수를 받아 [0,1) 값과 다음 상태를 돌려준다.
 * 엔진이 `BattleState.rng`에 상태를 들고 다녀서 스냅샷 · 재현이 그대로 된다.
 */
export function nextRandom(state: number): [number, number] {
  const a = (state + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a]
}

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
   * 적중 시 중독 **N겹**을 더한다(2026-11-12 개편 — 상한 없음, 겹 = 남은 라운드).
   * 유물 `poisonOnHit` · `poisonRoundBonus`도 같은 타격에 **더해진다**. 행동 한 번에
   * 지금 겹 × `POISON_TICK_DAMAGE`. **피해가 실제로 들어갔을 때만** 묻는다.
   */
  poison?: number
  /**
   * 적중 시 화상 **N겹**을 더한다(2026-11-13 개편 — 상한 없음, 겹 = 남은 라운드). 유물 `burnOnHit` ·
   * `burnRoundBonus`도 같은 타격에 더해진다. 화상 중엔 카드 공격 피해 +10/20/30%(`burnPct`).
   */
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
   * 적중 시 상대가 선 칸에 **독안개**를 깐다(`FOG_TURNS`턴 · 3턴 뒤 십자로 퍼진다 — `HAZARDS.md` 8절).
   * 서 있으면 턴 끝마다 중독 1겹 — 비키게 만드는 카드다.
   */
  fog?: boolean
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
  /**
   * **전설 카드**(표시 전용, 2026-11-10 사용자 지정) — 이벤트로만 얻는다(보상·상점·고블린·거래 풀에 없다).
   * 엔진은 안 본다 → `RULES_VERSION` 무관. 지금은 「세계수의 가호」 한 장.
   */
  legend?: boolean
  fx?: 'slash' | 'bolt' | 'orb' | 'quake' | 'flame' | 'shield' | 'rush' | 'punch'

  /**
   * 카드 강화 표식(2026-08-08) — **표시 전용**. 로그라이크 런에서 같은 카드를 또
   * 얻으면 `game/upgrades.ts`가 수치를 올린 사본을 만들고 여기에 단계를 적는다.
   * 엔진은 이 두 필드를 보지 않고(수치 자체가 이미 올라가 있다), PvP·봇전의 원본
   * 카드에는 절대 붙지 않으므로 `RULES_VERSION`과 무관하다.
   */
  upgraded?: number
  /** 무엇이 좋아졌는지 한 줄 요약("피해 +5 · 독 +3"). CardFace가 그린다. */
  upgradeNote?: string
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
// 규칙(2026-11-13 재설계 · `docs/rules/HAZARDS.md` 1절):
//   ① **못 들어간다 · 못 지나간다.** 이동·이동공격(dashForward)·넉백·끌어당김이 바위 앞에서
//      멈춘다(넉백이 막히면 처박기).
//   ② **공격은 막지 않는다.** 바위 너머의 상대도 그대로 맞는다(옛 "사격선을 끊는다"는 없앴다 —
//      그래서 관통이 바위를 무시하는 규칙도 뜻이 없어졌다).
//   ③ **사실상 안 깨진다**(체력 `ROCK_HP` 999). 공격이 덮은 칸에 선 바위는 깎이고, 깨지면 빈 칸.
//   ④ 상태이상 면역(바위는 상태이상을 안 받는다).
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

/** 바위 체력 — 깨지 말라고 둔 값(2026-11-13 사용자 · `HAZARDS.md` 1절). */
export const ROCK_HP = 999

/** 이 칸에 선 바위(없으면 undefined). */
export const rockAt = (rocks: readonly Obstacle[], c: Cell): Obstacle | undefined =>
  rocks.find((r) => r.hp > 0 && r.cell.col === c.col && r.cell.row === c.row)

/** 이 칸에 들어갈 수 있는가 — 격자 안이고 바위가 없어야 한다. */
export const canStand = (rocks: readonly Obstacle[], c: Cell): boolean =>
  inBounds(c) && !rockAt(rocks, c)

/** 카드가 판에 세우는 바위. 보스 카드(수호기사)와 전사·마법사의 지형 카드가 쓴다. */
export interface RockPlan {
  /** 세울 바위의 체력. */
  hp: number
  /**
   * 어디에 세우는가.
   *   flankFoe  상대의 좌우 두 칸 — **가둔다**(줄을 바꿔야 빠져나온다)
   *   flankSelf 내 좌우 두 칸 — 나에게 붙는 길을 막는다
   *   ahead     내 facing 기준 `dist`칸 앞 한 칸 — **길을 낸다**(플레이어 카드)
   */
  where: 'flankFoe' | 'flankSelf' | 'ahead'
  /**
   * `where: 'ahead'`일 때 몇 칸 앞인가(기본 1). 절대 방향이 아니라 **상대 방향**이라
   * 멀티 미러링이 필요 없다(`dashForward`와 같은 근거).
   */
  dist?: number
}

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
  /** 이 시점의 함정(화염 남은 턴 · 균열 단계)과 그때의 라운드. */
  hazards: Hazard[]
  round: number
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
  | 'hazard' // 판 위의 것이 아프게 했다 — 화염 · 용암 · 구멍에 빠짐
  | 'revive' // came back from a KO via a revive passive (once per battle)
  | 'stun' // 기절해 이 슬롯의 카드를 못 냈다 / 유물 트리거로 상대를 기절시켰다
  | 'trigger' // 누적 기력 트리거 발동(회복·보호막·피해)
  | 'status' // 중독이 이동을 갉았다 / 독안개가 중독을 걸었다
  | 'frozen' // 빙결이라 이 슬롯의 카드를 못 냈다
  | 'bind' // 속박이라 이동 카드가 무효가 됐다
  | 'rock' // 바위를 세웠다 / 바위가 부서졌다 / 판 위의 것이 바뀌었다(균열 · 구멍 · 덩굴이 탐)
  | 'fog' // 판에 독안개를 깔았다

export type Phase =
  | 'move'
  | 'defense'
  | 'attack'
  | 'hazard'
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
  /**
   * 넉백·끌어당김이 **막혀 처박혔다**(격돌). 막은 것은 판 끝일 수도 바위일 수도
   * 있다. 값은 밀려나던 방향(정규 좌표 +1 = col 늘어나는 쪽 / −1 = 줄어드는 쪽)이고,
   * 부딪힌 쪽은 항상 방어자(`1 - actor`)다.
   *
   * ⚠ **이 필드 자체는 연출 좌표일 뿐 룰이 아니다.** 처박기의 피해·기절은
   *   `applyOutcome`이 `blocked` 칸 수로 이미 계산해 판에 넣는다
   *   (`KNOCKBACK_BLOCK_DAMAGE` + 라운드 기절). 여기 실리는 건 UI가 **어느 쪽에서**
   *   돌먼지를 터뜨릴지 정하는 방향뿐이라, 이 값을 빼도 판 상태는 똑같다 →
   *   `RULES_VERSION`을 올리는 근거가 되지 않는다.
   */
  slam?: -1 | 1
  /**
   * 이 스텝이 **몇 번째 슬롯**에서 나왔는가(0·1·2). 라운드 종료 정산(독안개·붕괴·
   * 상태이상 감소)에서 나온 스텝은 슬롯이 없어 `undefined`다.
   *
   * ⚠ `slam`과 같은 **연출 전용 메타데이터**다 — 판 상태에 아무 영향이 없고
   *   (`resolveRound`가 스탬프만 찍는다) 빼도 결과가 같다. UI가 "지금 몇 번째
   *   카드를 재생 중인가"를 표시하고, 슬롯이 바뀌는 순간 카드 공개 연출을
   *   끼워 넣는 데 쓴다. `RULES_VERSION`을 올리는 근거가 아니다.
   */
  slot?: 0 | 1 | 2
  /**
   * 이 스텝에서 **누구에게 어떤 이유로 몇이 들어갔는가**(피해 내역).
   *
   * 신고: *"중독이나 그런 것까지 있으니까 무슨 데미지가 들어갔는지 잘 모르겠다."*
   * 실제로 `damage` 하나로는 설명이 안 되는 자리가 셋 있었다 — ① 화상·빙결 파쇄는
   * `damage`에 **합쳐져** 들어와 구분이 안 되고 ② **처박기 피해**(넉백이 막힌 몫)와
   * ③ **가시 반사**(thorns)는 체력만 깎고 `damage`·`recoil` 어디에도 안 실려
   * **화면에 아예 안 떴다**(체력이 숫자보다 더 줄어 보였다).
   *
   * ⚠ 역시 **연출 전용**이다: 엔진은 이미 판에 반영한 값을 그대로 적어 줄 뿐이라
   *   이 배열을 지워도 판 상태가 같다. 다만 UI가 이걸 믿고 그리므로 **합계는 그
   *   스텝에서 실제로 깎인 체력과 같아야 한다**(`npm run check`가 지킨다).
   */
  bits?: DamageBit[]
  snapshot: BattleSnapshot
}

/** 피해가 들어온 이유 — 화면에 "왜 깎였는지"를 한 단어로 붙이기 위한 꼬리표. */
export type DamageSrc =
  | 'attack' // 카드의 타격 자체(보호막·경감을 통과한 몫)
  | 'burn' // 화상 — 카드 공격 피해에 곱해 늘어난 몫(보호막이 막을 수 있다)
  | 'shatter' // 빙결 파쇄 — 얼어 있는 상대를 때려 깨뜨린 몫
  | 'slam' // 처박기 — 넉백이 벽·바위에 막혀 못 간 칸의 대가
  | 'thorns' // 가시 반사 — 때린 쪽이 도로 받는다
  | 'recoil' // 카드 반동 — 자기 카드가 자기를 깎는다
  | 'poison' // 중독 — 움직이거나 때릴 때마다
  | 'fire' // 화염 · 용암 지형
  | 'hole' // 구멍에 빠짐
  | 'relic' // 유물 트리거의 고정 피해

export interface DamageBit {
  src: DamageSrc
  /** 이 피해를 **받은** 쪽(0·1). 반동·가시는 공격자 자신이 들어간다. */
  on: 0 | 1
  n: number
}
