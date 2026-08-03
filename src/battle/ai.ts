import type { CharacterDef } from '../data/roster'
import { deckFor } from './cards'
import { baseCostOf, type BattleState } from './engine'
import {
  GRID_COLS,
  MOVE_DELTA,
  inBounds,
  isFogCell,
  type Cell,
  type CardDef,
  type Difficulty,
  type MoveDir,
} from './types'

interface AICfg {
  aggression: number // chance to attack when a hit is available
  guardChance: number
  energyFloor: number // recharge when below this
  panicGuard: number // 체력이 위험할 때 공격 대신 가드를 드는 확률
}

const DIFF: Record<Difficulty, AICfg> = {
  easy: { aggression: 0.55, guardChance: 0.1, energyFloor: 18, panicGuard: 0.15 },
  normal: { aggression: 0.8, guardChance: 0.2, energyFloor: 24, panicGuard: 0.4 },
  hard: { aggression: 0.94, guardChance: 0.3, energyFloor: 30, panicGuard: 0.65 },
}

/** 이 체력 이하면 "한 방에 죽을 수 있는 위기"로 보고 가드를 고려한다. */
const PANIC_HP = 45

/** Does `card` from `self` (at `pos`, given `facing`) cover the opponent cell? */
function hits(pos: Cell, facing: number, card: CardDef, opp: Cell): boolean {
  // 밀착(같은 셀)은 range가 아니라 카드의 pointBlank로 판정 — 엔진과 같은 규칙
  const overlapping = pos.col === opp.col && pos.row === opp.row
  if (overlapping && card.pointBlank !== false) return true
  return (card.range ?? []).some(
    (o) => pos.col + facing * o.df === opp.col && pos.row - o.du === opp.row,
  )
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
): CardDef[] {
  const cfg = DIFF[difficulty]
  const facing = self === 0 ? 1 : -1
  const opp = state.pos[1 - self]

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

  // 이동 카드가 도착할 셀 — 엔진 applyMove와 동일 규칙(벽에서 멈춤, 겹침 허용)
  function landingOf(c: CardDef): Cell {
    const steps = c.steps ?? 1
    const [dc, dr] = MOVE_DELTA[c.dir ?? 'right']
    let cur: Cell = { col: pos.col, row: pos.row }
    for (let k = 0; k < steps; k++) {
      const next: Cell = { col: cur.col + dc, row: cur.row + dr }
      if (!inBounds(next)) break
      cur = next
    }
    return cur
  }

  function applyMove(c: CardDef) {
    const cur = landingOf(c)
    pos.col = cur.col
    pos.row = cur.row
  }

  // ordered movement wishes to line up with / close on the opponent
  function approachCards(): CardDef[] {
    const dcol = opp.col - pos.col
    const drow = opp.row - pos.row
    const wishes: (CardDef | undefined)[] = []
    const hdir: MoveDir = dcol >= 0 ? 'right' : 'left'
    const vdir: MoveDir = drow >= 0 ? 'down' : 'up'
    // 겹친 상태: 밀착으로 때릴 카드가 하나도 없을 때만 한 칸 빠져 공격 위치를
    // 회복한다. 대부분의 카드는 겹친 상대를 그대로 때리므로 굳이 자리를 뜨지 않는다.
    if (dcol === 0 && drow === 0 && !canPointBlank) {
      const back: MoveDir = facing > 0 ? 'left' : 'right'
      wishes.push(moveCard(back, 1), moveCard('up', 1), moveCard('down', 1))
    }
    if (Math.abs(dcol) >= 2) wishes.push(moveCard(hdir, 2))
    if (Math.abs(dcol) >= 3) {
      if (dcol !== 0) wishes.push(moveCard(hdir, 1))
      if (drow !== 0) wishes.push(moveCard(vdir, 1))
    } else {
      if (drow !== 0) wishes.push(moveCard(vdir, 1))
      if (dcol !== 0) wishes.push(moveCard(hdir, 1))
    }
    // 덱에 없어 undefined인 이동은 제외. 상대 셀에 올라서는 이동은 밀착 공격
    // 수단이 있을 때만 허용한다 — 없으면 올라타 봤자 공격이 전부 빗나간다.
    return wishes.filter((w): w is CardDef => {
      if (!w) return false
      if (canPointBlank) return true
      const land = landingOf(w)
      return !(land.col === opp.col && land.row === opp.row)
    })
  }

  for (let slot = 0; slot < 3; slot++) {
    // 0) 위기 회피 — 체력이 위험하면 첫 슬롯에 가드를 우선 (가드는 턴 전체 지속)
    if (
      slot === 0 &&
      state.hp[self] <= PANIC_HP &&
      Math.random() < cfg.panicGuard &&
      GUARD &&
      usable(GUARD) &&
      energy >= (GUARD.guardCost ?? 0)
    ) {
      take(GUARD)
      continue
    }

    // 1) 독안개 이탈 — 지금 또는 다음 턴에 안개에 덮이면 공격보다 탈출이 먼저
    //    (안개에 서서 트레이드하다 둘 다 죽는 사고 방지). 중앙 열 쪽으로 이동.
    if (isFogCell(pos, state.turn) || isFogCell(pos, state.turn + 1)) {
      const toCenter: MoveDir = pos.col <= (GRID_COLS - 1) / 2 ? 'right' : 'left'
      const esc = [moveCard(toCenter, 2), moveCard(toCenter, 1)].filter(
        (c): c is CardDef => !!c,
      )
      const m = esc.find(usable)
      if (m) {
        take(m)
        continue
      }
    }

    // 2) attack if one connects right now and we roll aggressive
    const ready = attacks
      .filter((a) => usable(a) && energy >= (a.energyCost ?? 0) && hits(pos, facing, a, opp))
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
    //    걸치는지에 따라 캐릭터 강도가 계단처럼 튄다(런 시뮬에서 VOLT 기력 8 vs 10이
    //    클리어율 20%p 차). ③④를 맞바꿔 없애 봤지만 1:1 밸런스가 무너져(VOLT 46%→67%,
    //    평균 5.8→6.1턴) 되돌렸다 — 이 순서가 캐릭터 간 기력 격차를 눌러주고 있다.
    //    ⇒ **런 밸런스를 `turnEnergy`로 조정하지 말 것**(문턱 인공물). 회복·보호막·
    //      피해감소 같은 연속적인 훅으로 조정한다. 근본 해결은 AI 회피·자원 판단 개선.
    if (ENERGY && energy < Math.max(cfg.energyFloor, cheapest) && usable(ENERGY)) {
      take(ENERGY)
      continue
    }

    // 4) close in / line up with the opponent
    const wish = approachCards().find(usable)
    if (wish) {
      take(wish)
      continue
    }

    // 5) occasional guard
    if (
      GUARD &&
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
    const anyMove = pool.filter((c) => c.kind === 'move').find(usable)
    if (anyMove) {
      take(anyMove)
      continue
    }
    if (ENERGY && usable(ENERGY)) take(ENERGY)
    else take(attacks.find(usable) ?? attacks[0]) // last resort (will fizzle on no fuel)
  }

  return plan
}
