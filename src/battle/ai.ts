import type { CharacterDef } from '../data/roster'
import { deckFor } from './cards'
import { baseCostOf, type BattleState } from './engine'
import {
  GRID_COLS,
  MOVE_DELTA,
  canStand,
  facingBetween,
  isCollapsedCell,
  isFullyCollapsed,
  shadowRock,
  type Cell,
  type CardDef,
  type Difficulty,
  type MoveDir,
  type Obstacle,
} from './types'

interface AICfg {
  aggression: number // chance to attack when a hit is available
  guardChance: number
  energyFloor: number // recharge when below this
  panicGuard: number // 체력이 위험할 때 공격 대신 가드를 드는 확률
}

const DIFF: Record<Difficulty, AICfg> = {
  easy: { aggression: 0.55, guardChance: 0.1, energyFloor: 9, panicGuard: 0.15 },
  normal: { aggression: 0.8, guardChance: 0.2, energyFloor: 12, panicGuard: 0.4 },
  hard: { aggression: 0.94, guardChance: 0.3, energyFloor: 15, panicGuard: 0.65 },
}

/**
 * 몬스터 **성격**(2026-08-05). 같은 `decideAI`를 쓰던 20종이 전부 "멀면 붙고 닿으면
 * 때린다"는 한 가지 행동만 해서 매 전투가 똑같이 흘렀다. 아키타입이 난이도 cfg를
 * 밀고(공격성·가드 성향), `keepGap`으로 접근/후퇴를 가른다.
 *   rusher     돌격 — 공격성↑ 가드↓, 무조건 파고든다(잡졸·암살자·버서커)
 *   kiter      카이팅 — 붙으면 물러나 같은 줄에서 원거리로 쏜다(석궁·감시안·마녀)
 *   turtle     거북이 — 가드를 자주 들고 상대가 오길 기다린다(기사·골렘·가디언)
 *   skirmisher 교란 — 줄을 옮겨 다니며 견제(박쥐·팬텀)
 *   balanced   기본 — 조정 없음(슬라임·오우거 등)
 * ⚠ 이 값들은 **런 밸런스를 움직인다** — 바꾸면 `sim:run --sweep`로 밴드 재확인.
 * ⚠ 보스는 `bosses.ts`의 스크립트가 우선이고, 스크립트가 null을 줄 때만 성격이 쓰인다.
 */
export type Archetype = 'rusher' | 'kiter' | 'turtle' | 'skirmisher' | 'balanced'
interface ArchMod {
  aggression: number
  guardChance: number
  panicGuard: number
  energyFloor: number
  /** >0이면 카이팅 — 상대와의 가로 간격이 이 값보다 좁아지면 물러난다. */
  keepGap: number
  /**
   * **걸음걸이**(2026-08-05) — 접근 경로의 모양. 같은 거리에서도 성격마다 다른
   * 길로 와야 "다른 몬스터와 싸운다"가 읽힌다(`approachCards`).
   *   diag  대각선으로 곧장 파고든다(돌격·기본)
   *   lane  줄부터 갈아타고 옆에서 들어온다(교란)
   *   hold  줄을 안 쫓고 가로로만 좁힌다(거북이)
   */
  gait: 'diag' | 'lane' | 'hold'
}
const ARCH: Record<Archetype, ArchMod> = {
  rusher: { aggression: +0.06, guardChance: -0.12, panicGuard: -0.25, energyFloor: -3, keepGap: 0, gait: 'diag' },
  kiter: { aggression: -0.02, guardChance: +0.05, panicGuard: +0.05, energyFloor: +2, keepGap: 2, gait: 'diag' },
  turtle: { aggression: -0.12, guardChance: +0.3, panicGuard: +0.25, energyFloor: +4, keepGap: 0, gait: 'hold' },
  skirmisher: { aggression: 0, guardChance: +0.05, panicGuard: 0, energyFloor: 0, keepGap: 1, gait: 'lane' },
  balanced: { aggression: 0, guardChance: 0, panicGuard: 0, energyFloor: 0, keepGap: 0, gait: 'diag' },
}

/**
 * 전투 1회 동안 고정되는 AI 성향(2026-08-05). `runbattle.ts`가 전투 시작 때 한 번
 * 굴려 만들고 매 턴 `decideAI`에 그대로 넘긴다. `archetype`은 몬스터 정체성(종류마다
 * 다름), `moodAgg`는 **그 판의 기분**(같은 몬스터라도 판마다 살짝 다르게) — 대략
 * -0.12..+0.12의 공격성 가감. 시뮬은 시드 RNG라 재현되고, 멀티는 몬스터가 없어 무관.
 */
export interface AIProfile {
  archetype: Archetype
  moodAgg: number
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/** 이 체력 이하면 "한 방에 죽을 수 있는 위기"로 보고 가드를 고려한다. */
const PANIC_HP = 45

/**
 * **상대 예측**(2026-08-10) — 신고: *"컴퓨터는 유저가 처음 그 자리에서 움직이지 않을
 * 것을 예상해서 그냥 거기까지 와서 공격을 한다. 그런데 유저 또한 몬스터한테 다가가기
 * 위해 움직이므로 초반에 무조건 안 맞는다."*
 *
 * 원인은 `decideAI`가 세 슬롯을 통째로 **라운드 시작 시점의 상대 자리** 하나로 계획한
 * 것이다. 자기 이동은 슬롯마다 `pos`에 반영하면서 상대는 상수로 뒀으니, 서로 마주
 * 걸어오는 개전 라운드에서는 **반드시** 빗나가는 구조였다.
 *
 * 이제 슬롯마다 "그때 상대가 서 있을 자리"를 다시 잡는다. 얼마나 잘 잡는가가 곧
 * **난이도**다:
 *   easy   0,1,1 — 상대가 다가온다는 것만 어렴풋이 안다(첫 자리만 보진 않는다)
 *   normal 1,1,2
 *   hard   1,2,3 — 계획을 못 읽을 때의 상한. 읽으면 아래 `oppPlan`이 이긴다.
 * 숫자는 **그 슬롯까지 상대가 나에게 좁혀 올 칸 수**이고, 실제 거리−1로 잘린다
 * (상대 자리를 지나치거나 겹치는 예측은 하지 않는다 — 근접 판정은 지금도 잘 맞아서
 * 굳이 흔들 이유가 없다).
 */
const CLOSE_IN: Record<Difficulty, readonly [number, number, number]> = {
  easy: [0, 1, 1],
  normal: [1, 1, 2],
  hard: [1, 2, 3],
}

/**
 * **카드 대응**(2026-08-10, hard 전용) — 사용자 결정: *"유저는 3장의 카드로 진행하는데
 * 봇은 사실 유저의 행동을 보고 행동할 수 있다. 그런 식으로 난이도를 올려도 될 듯하다."*
 *
 * `BattleScreen`은 플레이어가 3장을 확정한 **뒤에** `getOpponentPlan(localPlan, …)`을
 * 부르므로, 봇은 원리상 상대 계획을 다 볼 수 있다. 그 정보를 줄지는 **호출부가**
 * 정한다(`AIForesight`) — 런 난이도가 고급 이상일 때만 `runbattle.ts`가 넘긴다.
 * 주면 세 가지가 달라진다:
 *   ⓐ 자리를 **정확히** 안다 — 예측이 아니라 상대 이동 카드를 그대로 굴린다
 *   ⓑ 아픈 게 들어오는 슬롯에 **피하거나 막는다**(이동은 prio 0이라 같은 슬롯 공격보다
 *      먼저 해소된다 — 그 슬롯에서 피하는 것이 실제로 성립한다)
 *   ⓒ **아무것도 안 들어오면 가드를 들지 않는다** — 슬롯을 통째로 공격에 쓴다
 *
 * ⓐ는 `react: false`로도 켜지고(고급 = **조준만**), ⓑⓒ는 `react: true`가 있어야
 * 켜진다(최고급). 둘을 나눈 이유는 실측이다 — easy/normal/hard의 cfg 차이(공격성·
 * 가드 성향·`CLOSE_IN`)만으로는 클리어율이 40.3 / 38.7 / 37.5%로 거의 안 갈렸다.
 * **판을 가르는 건 조준의 정확도와 대응 두 가지뿐**이라, 난이도의 계단을 그 둘로 놨다.
 *
 * ⚠ 이건 규칙이 아니라 **AI의 판단**이다. `resolveRound` 출력에 닿지 않으므로
 *   `RULES_VERSION`과 무관하고, 온라인 멀티는 계획이 네트워크로 오므로 영향이 없다.
 */
export interface AIForesight {
  /**
   * 상대가 이번 라운드에 낼 3장(확정된 계획). **앞에서부터 `undefined`가 아닌
   * 만큼만** 보인다 — 호출부가 뒤를 잘라 넘기면 "첫 장만 읽는" 부분 정보가 된다
   * (중급). 안 보이는 슬롯부터는 "계속 다가온다"는 어림으로 이어 간다.
   */
  plan: readonly (CardDef | undefined)[]
  /**
   * 계획을 보고 **막거나 피하는가**. false면 조준에만 쓴다(고급) — 자리는 정확히
   * 알지만 들어오는 걸 알고도 안 피하고, 가드도 예전처럼 확률로 든다.
   */
  react: boolean
}
/**
 * 이 피해 이상이면 "막거나 피할 값어치가 있다"고 본다(÷2 스케일 — 기본기 5~7·강한
 * 스킬 ~30). 즉 **진짜 한 방에만** 반응하고 잔공격은 그냥 맞아 준다.
 *
 * ⚠ **최고급 난이도의 유일한 조절 손잡이다.** `reacts`가 있는 단계에서만 쓰이므로
 *   이 값을 움직여도 초급·중급·고급은 1%p도 안 흔들린다 — 그래서 최고급만 따로
 *   맞출 수 있다(실측: 10 → 클리어율 7.2% · 16 → 8.1% · **24 → 15.9%**).
 *   16 아래로 내리면 중급 카드까지 전부 막혀 "뭘 내도 안 통한다"가 되고, 실제로
 *   클리어율이 8% 밑으로 주저앉는다.
 */
const THREAT_DAMAGE = 24
/** 막을 수도 피할 수도 있을 때 피하는 쪽을 고를 확률. 늘 같은 답이면 다시 뻔해진다. */
const EVADE_CHANCE = 0.5

const chebyshev = (a: Cell, b: Cell): number =>
  Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row))

/**
 * Does `card` from `self` (at `pos`, given `facing`) cover the opponent cell?
 * `rocks`가 있으면 **사격선이 끊기는지**까지 본다 — 엔진 `connectsNow`와 같은 규칙이라
 * AI가 "닿는다"고 판단한 공격이 엔진에서 헛치는 일이 없다. 관통은 바위를 무시한다.
 */
function hits(
  pos: Cell,
  facing: number,
  card: CardDef,
  opp: Cell,
  rocks: readonly Obstacle[] = [],
  pierces = false,
): boolean {
  // 밀착(같은 셀)은 range가 아니라 카드의 pointBlank로 판정 — 엔진과 같은 규칙
  const overlapping = pos.col === opp.col && pos.row === opp.row
  if (overlapping) return card.pointBlank !== false
  const covered = (card.range ?? []).some(
    (o) => pos.col + facing * o.df === opp.col && pos.row - o.du === opp.row,
  )
  if (!covered) return false
  if (pierces || !rocks.length) return true
  return !shadowRock(rocks, pos, opp)
}

/**
 * Build a 3-card plan for the CPU fighter `self`. `availableCards`가 주어지면
 * 그 덱(고정+고른 카드)에서만 계획한다 — 봇전 프리셋 덱. 없으면 캐릭터 전체
 * 카드(공용+고유)로 계획(구 흐름·튜토리얼 호환).
 */
export function decideAI(
  state: BattleState,
  self: number,
  char: CharacterDef,
  difficulty: Difficulty,
  availableCards?: CardDef[],
  profile?: AIProfile,
  foresight?: AIForesight,
): CardDef[] {
  // 난이도 cfg에 성격·기분을 얹은 **실효 cfg**. profile이 없으면(봇전·튜토리얼)
  // balanced + 기분 0이라 기존 동작과 동일하다.
  const base = DIFF[difficulty]
  const a = ARCH[profile?.archetype ?? 'balanced']
  const mood = profile?.moodAgg ?? 0
  const cfg: AICfg = {
    aggression: clamp01(base.aggression + a.aggression + mood),
    guardChance: clamp01(base.guardChance + a.guardChance - mood * 0.4),
    panicGuard: clamp01(base.panicGuard + a.panicGuard - mood * 0.3),
    energyFloor: Math.max(0, base.energyFloor + a.energyFloor),
  }
  const keepGap = a.keepGap
  const gait = a.gait
  /** 라운드 **시작 시점의** 상대 자리. 예측의 출발점일 뿐 조준점이 아니다. */
  const oppStart = state.pos[1 - self]
  // 계획을 읽는가 — **호출부가 정한다**(런 난이도). 예전엔 여기서 `difficulty === 'hard'`로
  // 걸렀는데, 난이도 4단계가 생기면서 "누가 읽는가"는 몬스터 등급이 아니라 단계의
  // 문제가 됐다. 안 넘기면 아래 `CLOSE_IN` 어림으로 떨어진다(= 예전 그대로).
  const read = foresight?.plan
  /** 읽은 계획으로 **막거나 피하는가**(최고급). false면 조준에만 쓴다(고급). */
  const reacts = !!foresight?.react
  // 지형 — 런에서만 채워진다. 빈 배열이면 아래 판정이 전부 예전 그대로다.
  const rocks = state.obstacles
  /** 이 공격이 바위를 무시하는가 — 엔진 `piercesRock`과 같은 규칙. */
  const pierces = (c: CardDef) => !!c.pierce || !!char.passive.alwaysPierce
  // ⚠ 방향은 **지금 서 있는 자리**에서 상대를 보고 정한다(2026-08-05, 엔진과 같은
  //   규칙). 좌석 고정이던 시절엔 AI가 상대를 지나친 뒤에도 반대쪽을 겨눠서,
  //   "닿는다"고 판단한 공격이 엔진에서 헛쳤다. `pos`·`foe`는 슬롯마다 갱신되므로
  //   상수가 아니라 함수여야 한다.
  const facingAt = (from: Cell, foe: Cell) => facingBetween(from, foe, self)

  // local, mutable view of self for planning across the 3 slots
  const pos: Cell = { col: state.pos[self].col, row: state.pos[self].row }
  let energy = state.energy[self]
  const locked = new Set<string>() // cards spent this turn that can't repeat (cd >= 1)
  const cdLeft = (id: string) => state.cooldowns[self][id] ?? 0
  const usable = (c: CardDef) => cdLeft(c.id) === 0 && !locked.has(c.id)

  // 사용 가능한 카드 풀 — 덱이 주어지면 그것만, 아니면 캐릭터 전체 카드
  const pool = availableCards ?? deckFor(char)
  const attacks = pool.filter((c) => c.kind === 'attack')
  // 겹친 상대를 때릴 수 있는 카드가 덱에 하나라도 있는가 — 밀착을 노릴지 피할지 결정
  const canPointBlank = attacks.some((c) => c.pointBlank !== false)
  // 이동/지원 카드는 풀에서 뽑는다(덱에 없으면 undefined → 스킵)
  const moveCard = (dir: MoveDir, steps: number): CardDef | undefined =>
    pool.find((c) => c.kind === 'move' && c.dir === dir && (c.steps ?? 1) === steps)
  const GUARD = pool
    .filter((c) => c.kind === 'guard')
    .sort((a, b) => (b.block ?? 0) - (a.block ?? 0))[0]
  const ENERGY = pool.find((c) => c.kind === 'energy')
  const HEAL = pool.find((c) => c.kind === 'heal')
  // 버프는 **한 판에 오래 남는 카드**라 싼 것부터 깔고 시작하는 게 이득이다.
  const BUFFS = pool
    .filter((c) => c.kind === 'buff')
    .sort((a, b) => (a.buffCost ?? 0) - (b.buffCost ?? 0))
  const cheapest = attacks.length ? Math.min(...attacks.map((a) => a.energyCost ?? 0)) : 0
  const plan: CardDef[] = []

  const take = (c: CardDef) => {
    plan.push(c)
    // 쿨타임 카드 + 모든 공격 카드는 한 턴에 한 번만 (같은 공격 반복 금지 룰)
    if ((c.cooldown ?? 0) >= 1 || c.kind === 'attack') locked.add(c.id)
    if (c.kind === 'energy') energy = Math.min(char.maxEnergy, energy + (c.gain ?? 0))
    else if (c.kind === 'move') applyMove(c)
    else energy -= baseCostOf(c) // 공격·가드·힐·버프는 비용 필드만 다르고 같은 처리
  }

  // 이동 카드가 도착할 셀 — 엔진 applyMove와 동일 규칙(벽·**바위**에서 멈춤, 겹침 허용)
  function landingOf(c: CardDef): Cell {
    const steps = c.steps ?? 1
    const [dc, dr] = MOVE_DELTA[c.dir ?? 'right']
    let cur: Cell = { col: pos.col, row: pos.row }
    for (let k = 0; k < steps; k++) {
      const next: Cell = { col: cur.col + dc, row: cur.row + dr }
      if (!canStand(rocks, next)) break
      cur = next
    }
    return cur
  }

  /** 이 이동이 실제로 자리를 옮기는가 — 바위·벽에 막혀 제자리면 슬롯만 버린다. */
  function goesSomewhere(c: CardDef): boolean {
    const land = landingOf(c)
    return land.col !== pos.col || land.row !== pos.row
  }

  function applyMove(c: CardDef) {
    const cur = landingOf(c)
    pos.col = cur.col
    pos.row = cur.row
  }

  // --- 상대 예측 -------------------------------------------------------------
  /**
   * 상대 진행 커서. `read`면 상대 계획을 슬롯마다 한 장씩 실제로 굴리고, 아니면
   * `CLOSE_IN`으로 어림한다. 어느 쪽이든 **슬롯마다 다시 잡는다** — 라운드 시작
   * 자리를 세 슬롯 내내 조준하던 것이 이 개편 전의 모습이다.
   */
  const foeCur: Cell = { col: oppStart.col, row: oppStart.row }

  /** `from`에서 `to` 쪽으로 최대 `steps`칸(대각 허용). 벽·바위에 막히면 거기까지. */
  function stepToward(from: Cell, to: Cell, steps: number): Cell {
    const cur: Cell = { col: from.col, row: from.row }
    for (let k = 0; k < steps; k++) {
      if (cur.col === to.col && cur.row === to.row) break
      const next: Cell = {
        col: cur.col + Math.sign(to.col - cur.col),
        row: cur.row + Math.sign(to.row - cur.row),
      }
      if (!canStand(rocks, next)) break
      cur.col = next.col
      cur.row = next.row
    }
    return cur
  }

  /**
   * 이 슬롯에 상대가 서 있을 자리. **슬롯 시작마다 정확히 한 번** 부른다(커서를 밀기
   * 때문에 두 번 부르면 두 슬롯을 진행한다).
   *
   * ⚠ `read`에서 이동공격(`dashForward`)은 그 슬롯에 **먼저** 반영한다. 엔진은 같은
   *   슬롯 공격을 p0부터 계산하므로 AI가 side 1일 때(= 게임에서 늘 그렇다) 정확하고,
   *   side 0이면 한 슬롯 이른 근사가 된다 — 시뮬·PvP 봇전 쪽 이야기라 그대로 둔다.
   */
  function advanceFoe(slot: number): Cell {
    if (read) {
      const c = read[slot]
      // 계획이 끊긴 지점(부분 정보) — 여기서부터는 "한 칸씩 계속 다가온다"고 본다.
      // 가만히 서 있다고 보면 어림보다도 나쁜 조준이 된다.
      if (!c) {
        if (chebyshev(foeCur, pos) > 1) {
          const t = stepToward(foeCur, pos, 1)
          foeCur.col = t.col
          foeCur.row = t.row
        }
        return { col: foeCur.col, row: foeCur.row }
      }
      if (c.kind === 'move') {
        const [dc, dr] = MOVE_DELTA[c.dir ?? 'right']
        for (let k = 0; k < (c.steps ?? 1); k++) {
          const next: Cell = { col: foeCur.col + dc, row: foeCur.row + dr }
          if (!canStand(rocks, next)) break
          foeCur.col = next.col
          foeCur.row = next.row
        }
      } else if (c.kind === 'attack' && c.dashForward) {
        const step = facingBetween(foeCur, pos, 1 - self) * Math.sign(c.dashForward)
        for (let k = 0; k < Math.abs(c.dashForward); k++) {
          const next: Cell = { col: foeCur.col + step, row: foeCur.row }
          if (!canStand(rocks, next)) break
          foeCur.col = next.col
        }
      }
      return { col: foeCur.col, row: foeCur.row }
    }
    // 못 읽을 때 — "나에게 다가온다"고만 본다. 실제 거리−1로 잘라 **겹치거나 지나치는
    // 예측은 하지 않는다**(근접 판정은 지금도 맞으니 흔들 이유가 없다).
    const steps = Math.min(CLOSE_IN[difficulty][slot], chebyshev(oppStart, pos) - 1)
    return steps > 0 ? stepToward(oppStart, pos, steps) : { col: oppStart.col, row: oppStart.row }
  }

  /** 이 슬롯에 나를 때릴 상대 카드(읽을 수 있을 때만). 없으면 undefined. */
  function incomingAt(slot: number, foe: Cell, at: Cell): CardDef | undefined {
    const c = read?.[slot]
    if (!c || c.kind !== 'attack') return undefined
    return hits(foe, facingBetween(foe, at, 1 - self), c, at, rocks, !!c.pierce) ? c : undefined
  }

  /** 이 슬롯 이후로 상대 계획에 공격이 남아 있는가 — 가드를 들 이유가 있는지의 기준. */
  const attacksAhead = (slot: number): boolean =>
    !read || !reacts || read.slice(slot).some((c) => c?.kind === 'attack')

  /**
   * `inc`의 사거리 밖으로 나가는 이동 — 상대와 **가까운 순서**로. 이동은 prio 0이라
   * 같은 슬롯의 공격보다 먼저 해소되므로 이 슬롯 안에서 실제로 피해진다.
   * 무너질 칸으로 피하지는 않는다(피하려다 붕괴에 맞으면 손해다).
   */
  function evadeCards(foe: Cell, inc: CardDef): CardDef[] {
    return pool
      .filter((c) => {
        if (c.kind !== 'move' || !goesSomewhere(c)) return false
        const land = landingOf(c)
        if (isCollapsedCell(land, state.round)) return false
        return !hits(foe, facingBetween(foe, land, 1 - self), inc, land, rocks, !!inc.pierce)
      })
      .sort((x, y) => chebyshev(landingOf(x), foe) - chebyshev(landingOf(y), foe))
  }

  /**
   * 접근 이동 — 상대에게 붙거나 줄을 맞추려는 희망 목록(앞에 있는 것부터 시도).
   *
   * ⚠ 2026-08-05 신고: "몬스터들이 그냥 직선으로만 오기 때문에 엄청 루즈하다."
   *   원인은 여기가 **상하좌우 네 방향만 골랐다**는 것이다. 대각 이동 카드 4장은
   *   진작 공용 풀에 있었는데(`m-ur`/`m-ul`/`m-dr`/`m-dl`) `moveCard`를
   *   `'right'|'left'|'up'|'down'`으로만 불러서 한 번도 쓰이지 않았다. 그래서
   *   가로·세로가 둘 다 어긋나면 **슬롯 두 장을 써서 ㄱ자로** 돌아왔고,
   *   20종이 전부 같은 계단 모양으로 걸어왔다.
   *
   * 두 가지를 넣었다:
   *   ⓐ 두 축이 모두 어긋나면 **대각선 한 장으로 둘 다 좁힌다**(슬롯 하나 절약).
   *   ⓑ 순서를 **성격(archetype)이 고른다** — 같은 거리라도 돌격형은 파고들고,
   *      교란형은 줄부터 옮기고, 거북이는 줄을 안 쫓는다. 걸어오는 모양이 달라야
   *      "다른 몬스터와 싸운다"가 읽힌다.
   */
  function approachCards(opp: Cell): CardDef[] {
    const dcol = opp.col - pos.col
    const drow = opp.row - pos.row
    const wishes: (CardDef | undefined)[] = []
    const hdir: MoveDir = dcol >= 0 ? 'right' : 'left'
    const vdir: MoveDir = drow >= 0 ? 'down' : 'up'
    const diag = `${vdir}-${hdir}` as MoveDir // 'down-right' 등 — MoveDir와 이름이 같다
    const offAxis = dcol !== 0 && drow !== 0
    // 겹친 상태: 밀착으로 때릴 카드가 하나도 없을 때만 한 칸 빠져 공격 위치를
    // 회복한다. 대부분의 카드는 겹친 상대를 그대로 때리므로 굳이 자리를 뜨지 않는다.
    if (dcol === 0 && drow === 0 && !canPointBlank) {
      const back: MoveDir = facingAt(pos, opp) > 0 ? 'left' : 'right'
      wishes.push(moveCard(back, 1), moveCard('up', 1), moveCard('down', 1))
    }
    if (gait === 'lane') {
      // 교란형 — 줄부터 갈아탄다. 옆에서 들어오는 그림이 나온다.
      if (drow !== 0) wishes.push(moveCard(vdir, 1))
      if (offAxis) wishes.push(moveCard(diag, 1))
      if (Math.abs(dcol) >= 2) wishes.push(moveCard(hdir, 2))
      if (dcol !== 0) wishes.push(moveCard(hdir, 1))
    } else if (gait === 'hold') {
      // 거북이 — 줄을 쫓지 않고 가로로만 좁힌다. 상대가 오게 두는 쪽이다.
      if (Math.abs(dcol) >= 2) wishes.push(moveCard(hdir, 2))
      if (dcol !== 0) wishes.push(moveCard(hdir, 1))
      if (drow !== 0) wishes.push(moveCard(vdir, 1))
    } else {
      // 돌격형·기본 — 대각선으로 파고드는 게 언제나 가장 빠르다.
      if (offAxis) wishes.push(moveCard(diag, 1))
      if (Math.abs(dcol) >= 2) wishes.push(moveCard(hdir, 2))
      if (Math.abs(dcol) >= 3) {
        if (dcol !== 0) wishes.push(moveCard(hdir, 1))
        if (drow !== 0) wishes.push(moveCard(vdir, 1))
      } else {
        if (drow !== 0) wishes.push(moveCard(vdir, 1))
        if (dcol !== 0) wishes.push(moveCard(hdir, 1))
      }
    }
    // 덱에 없어 undefined인 이동은 제외. 상대 셀에 올라서는 이동은 밀착 공격
    // 수단이 있을 때만 허용한다 — 없으면 올라타 봤자 공격이 전부 빗나간다.
    return wishes.filter((w): w is CardDef => {
      if (!w) return false
      // 바위·벽에 막혀 제자리인 이동은 버린다 — 안 그러면 바위 앞에서 매 슬롯
      // "오른쪽으로 간다"를 골라 놓고 한 발짝도 못 가는 채로 턴을 통째로 날린다.
      if (!goesSomewhere(w)) return false
      if (canPointBlank) return true
      const land = landingOf(w)
      return !(land.col === opp.col && land.row === opp.row)
    })
  }

  // 카이팅(kiter) 전용 이동 — 붙이는 대신 거리를 유지한다. 같은 줄로 정렬해
  // 원거리 공격이 닿게 하되(줄 맞춤 우선), 가로 간격이 keepGap보다 좁아지면 물러난다.
  // 공격은 슬롯 2에서 이미 처리되므로, 여기 오는 건 "이번 슬롯엔 때릴 게 없다"일 때다.
  function kiteCards(opp: Cell): CardDef[] {
    const dcol = opp.col - pos.col
    const drow = opp.row - pos.row
    const vdir: MoveDir = drow >= 0 ? 'down' : 'up'
    const away: MoveDir = dcol >= 0 ? 'left' : 'right' // 상대 반대쪽으로
    const wishes: (CardDef | undefined)[] = []
    if (drow !== 0) wishes.push(moveCard(vdir, 1)) // 같은 줄로 — 원거리 명중선 확보
    if (Math.abs(dcol) < keepGap) wishes.push(moveCard(away, 2), moveCard(away, 1))
    // 벽에 몰려 더 못 물러나면 approachCards로 떨어져 최소한 줄이라도 맞춘다.
    const out = wishes.filter((w): w is CardDef => !!w && goesSomewhere(w))
    return out.length ? out : approachCards(opp)
  }

  /** 이 라운드에 이미 보호막을 세웠는가 — 세웠으면 또 들 이유가 없다(라운드 끝까지 남는다). */
  let guarded = false

  /**
   * 대응할 슬롯 — **라운드에 하나뿐**이다(상대 계획에서 제일 아픈 한 장).
   *
   * ⚠ 세 장을 다 막아 내면 플레이어가 큰 카드를 영영 못 꽂아, 이번엔 반대 방향으로
   *   뻔해진다("뭘 내도 막힌다"). 하나만 막으면 **미끼가 성립한다** — 싼 공격을
   *   앞에 두고 진짜를 뒤에 두는 식의 수읽기가 플레이어 쪽에 생긴다.
   */
  let reactSlot = -1
  if (read && reacts) {
    let worst = -1
    for (let k = 0; k < 3; k++) {
      const c = read[k]
      if (c?.kind !== 'attack') continue
      const d = c.damage ?? 0
      if (d > worst) {
        worst = d
        reactSlot = k
      }
    }
  }

  for (let slot = 0; slot < 3; slot++) {
    // 이 슬롯의 조준점. ⚠ 슬롯당 딱 한 번 — 커서를 밀기 때문이다.
    const foe = advanceFoe(slot)
    // 이 슬롯에 나에게 들어올 공격(hard가 계획을 읽었을 때만).
    const inc = incomingAt(slot, foe, pos)

    // 0) 위기 회피 — 체력이 위험하면 첫 슬롯에 가드를 우선 (가드는 턴 전체 지속).
    //    ⚠ 계획을 읽는 AI는 **공격이 남아 있을 때만** 든다 — 아무것도 안 오는 라운드에
    //    가드를 드는 건 슬롯 하나를 그냥 버리는 것이고, 그게 "뻔하다"의 절반이었다.
    if (
      slot === 0 &&
      state.hp[self] <= PANIC_HP &&
      attacksAhead(slot) &&
      Math.random() < cfg.panicGuard &&
      GUARD &&
      usable(GUARD) &&
      energy >= (GUARD.guardCost ?? 0)
    ) {
      take(GUARD)
      guarded = true
      continue
    }

    // 0-bis) **카드 대응**(hard 전용) — 이 슬롯에 아픈 게 들어오면 피하거나 막는다.
    //   잔공격(THREAT_DAMAGE 미만)에는 반응하지 않는다. 봉인기(기절·빙결·속박)는
    //   피해와 무관하게 라운드를 통째로 날리므로 값과 상관없이 반응한다.
    if (reacts && inc && slot === reactSlot && !guarded) {
      const worth =
        (inc.damage ?? 0) >= THREAT_DAMAGE || !!inc.stun || !!inc.freeze || !!inc.bind
      if (worth) {
        const evade = evadeCards(foe, inc).find(usable)
        const canBlock = GUARD && usable(GUARD) && energy >= (GUARD.guardCost ?? 0)
        // 둘 다 되면 반반 — 늘 같은 답이면 대응 자체가 다시 뻔한 패턴이 된다.
        const prefersEvade = evade && (!canBlock || Math.random() < EVADE_CHANCE)
        if (prefersEvade) {
          take(evade)
          continue
        }
        if (canBlock) {
          take(GUARD)
          guarded = true
          continue
        }
      }
    }

    // 1) 붕괴 이탈 — 지금 또는 다음 턴에 발밑이 무너지면 공격보다 탈출이 먼저
    //    (무너진 칸에 서서 트레이드하다 둘 다 죽는 사고 방지). 중앙 열 쪽으로 이동.
    // ⚠ **판 전체가 무너진 뒤에는 도망치지 않는다**(2026-08-05). 그전엔 갈 곳이
    //    없는데도 매 슬롯 중앙으로 걷기만 해서, 마지막 단계부터 AI가 아예 공격을
    //    멈췄다 — 무한전을 끊으라고 넣은 장치가 오히려 판을 늘리고 있었다.
    if (
      !isFullyCollapsed(state.round + 1) &&
      (isCollapsedCell(pos, state.round) || isCollapsedCell(pos, state.round + 1))
    ) {
      const toCenter: MoveDir = pos.col <= (GRID_COLS - 1) / 2 ? 'right' : 'left'
      const esc = [moveCard(toCenter, 2), moveCard(toCenter, 1)].filter(
        (c): c is CardDef => !!c,
      )
      // 실제로 **안전한 칸에 내리는** 이동만 고른다 — 한 칸 옮겨 봐야 여전히
      // 무너진 칸이면 슬롯만 버리는 셈이다(2026-08-05).
      const m =
        esc.find(
          (c) => usable(c) && goesSomewhere(c) && !isCollapsedCell(landingOf(c), state.round + 1),
        ) ?? esc.find((c) => usable(c) && goesSomewhere(c))
      if (m) {
        take(m)
        continue
      }
    }

    // 2) attack if one connects right now and we roll aggressive
    const ready = attacks
      .filter(
        (a) =>
          usable(a) &&
          energy >= (a.energyCost ?? 0) &&
          hits(pos, facingAt(pos, foe), a, foe, rocks, pierces(a)),
      )
      .sort((x, y) => (y.damage ?? 0) - (x.damage ?? 0))
    if (ready.length > 0 && Math.random() < cfg.aggression) {
      take(ready[0])
      continue
    }

    // 2.5) 회복 — 체력이 낮은데 이번 슬롯에 때릴 게 없으면 기력을 체력으로 바꾼다.
    //      한 방은 남겨두려고 (힐 비용 + 최저가 공격)만큼 기력이 있을 때만 쓴다.
    //      (로그라이크는 체력이 층 사이에 이어져 회복 가치가 크다 — c-repair·주술사)
    if (
      HEAL &&
      usable(HEAL) &&
      state.hp[self] <= char.maxHp * 0.55 &&
      energy >= (HEAL.healCost ?? 0) + cheapest
    ) {
      take(HEAL)
      continue
    }

    // 3) recharge when starved and the energy card is up
    //    ⚠ 이 판단은 ④ 접근보다 **먼저** 온다 — 기력이 `energyFloor`(hard 30) 바로
    //    아래면 접근 대신 원기 회복에 슬롯을 쓴다. 그래서 "턴당 기력"이 그 문턱에
    //    걸치는지에 따라 캐릭터 강도가 계단처럼 튄다(런 시뮬에서 기력 8 vs 10이
    //    클리어율 20%p 차). ③④를 맞바꿔 없애 봤지만 1:1 밸런스가 무너져(승률 46%→67%,
    //    평균 5.8→6.1턴) 되돌렸다 — 이 순서가 캐릭터 간 기력 격차를 눌러주고 있다.
    //    ⇒ **런 밸런스를 `turnEnergy`로 조정하지 말 것**(문턱 인공물). 회복·보호막·
    //      피해감소 같은 연속적인 훅으로 조정한다. 근본 해결은 AI 회피·자원 판단 개선.
    if (ENERGY && energy < Math.max(cfg.energyFloor, cheapest) && usable(ENERGY)) {
      take(ENERGY)
      continue
    }

    // 4) close in / line up with the opponent (카이터는 거리를 유지·회복한다)
    // ⚠ **접근은 예측이 아니라 실제 자리를 쫓는다**(계획을 못 읽을 때). 예측으로
    //   걸으면 "어차피 나에게 온다"며 다가가길 멈추는데, 그 예측이 틀리면 슬롯을
    //   통째로 버린다 — 사거리 1칸인 전사가 이 손해를 제일 크게 본다. 조준은 빗나가야
    //   한 슬롯이지만 접근을 안 하면 라운드 전체가 날아간다. 읽었을 때(`read`)는
    //   `foe`가 어림이 아니라 정확한 값이므로 그대로 쫓는다.
    const chase = read ? foe : oppStart
    const wish = (keepGap > 0 ? kiteCards(chase) : approachCards(chase)).find(usable)
    if (wish) {
      take(wish)
      continue
    }

    // 5) occasional guard — 계획을 읽었다면 남은 공격이 있을 때만(위 0번과 같은 이유).
    if (
      GUARD &&
      !guarded &&
      attacksAhead(slot) &&
      Math.random() < cfg.guardChance &&
      energy >= (GUARD.guardCost ?? 0) &&
      usable(GUARD)
    ) {
      take(GUARD)
      continue
    }

    // 5-bis) 이번 턴에 딱히 할 게 없으면 버프를 깐다. 버프는 여러 턴을 가므로
    // "지금 때릴 수 없는 턴"에 거는 게 가장 이득이다(때릴 수 있으면 위에서 이미
    // 공격을 골랐다). 같은 버프가 이미 걸려 있으면 덧씌우지 않는다.
    const buff = BUFFS.find(
      (b) => usable(b) && energy >= (b.buffCost ?? 0) && !state.status[self].some((e) => e.kind === b.buff),
    )
    if (buff) {
      take(buff)
      continue
    }

    // 6) fallbacks: any affordable attack (cheapest), else any free move, else idle
    const cheap = attacks
      .filter((a) => usable(a) && energy >= (a.energyCost ?? 0))
      .sort((x, y) => (x.energyCost ?? 0) - (y.energyCost ?? 0))[0]
    if (cheap) {
      take(cheap)
      continue
    }
    const moves = pool.filter((c) => c.kind === 'move')
    const anyMove = moves.find((c) => usable(c) && goesSomewhere(c)) ?? moves.find(usable)
    if (anyMove) {
      take(anyMove)
      continue
    }
    if (ENERGY && usable(ENERGY)) take(ENERGY)
    else take(attacks.find(usable) ?? attacks[0]) // last resort (will fizzle on no fuel)
  }

  return plan
}
