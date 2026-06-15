import type { CharacterDef } from '../data/roster'
import { COMMON_CARDS } from './cards'
import type { BattleState } from './engine'
import { type Cell, type CardDef, type Difficulty, type MoveDir } from './types'

const common = (id: string) => COMMON_CARDS.find((c) => c.id === id)!
const GUARD = common('c-guard')
const ENERGY = common('c-energy')
const moveCard = (dir: MoveDir, steps: number) =>
  COMMON_CARDS.find((c) => c.kind === 'move' && c.dir === dir && (c.steps ?? 1) === steps)!

interface AICfg {
  aggression: number // chance to attack when a hit is available
  guardChance: number
  energyFloor: number // recharge when below this
}

const DIFF: Record<Difficulty, AICfg> = {
  easy: { aggression: 0.55, guardChance: 0.1, energyFloor: 18 },
  normal: { aggression: 0.8, guardChance: 0.2, energyFloor: 24 },
  hard: { aggression: 0.94, guardChance: 0.3, energyFloor: 30 },
}

/** Does `card` from `self` (at `pos`, given `facing`) cover the opponent cell? */
function hits(pos: Cell, facing: number, card: CardDef, opp: Cell): boolean {
  return (card.range ?? []).some(
    (o) => pos.col + facing * o.df === opp.col && pos.row - o.du === opp.row,
  )
}

/** Build a 3-card plan for the CPU fighter `self` from the current state. */
export function decideAI(
  state: BattleState,
  self: number,
  char: CharacterDef,
  difficulty: Difficulty,
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

  const cheapest = Math.min(...char.attacks.map((a) => a.energyCost ?? 0))
  const plan: CardDef[] = []

  const take = (c: CardDef) => {
    plan.push(c)
    if ((c.cooldown ?? 0) >= 1) locked.add(c.id)
    if (c.kind === 'attack') energy -= c.energyCost ?? 0
    else if (c.kind === 'guard') energy -= c.guardCost ?? 0
    else if (c.kind === 'energy') energy = Math.min(char.maxEnergy, energy + (c.gain ?? 0))
    else if (c.kind === 'move') applyMove(c)
  }

  function applyMove(c: CardDef) {
    const steps = c.steps ?? 1
    const d =
      c.dir === 'right' ? [1, 0] : c.dir === 'left' ? [-1, 0] : c.dir === 'up' ? [0, -1] : [0, 1]
    for (let k = 0; k < steps; k++) {
      const nc = pos.col + d[0]
      const nr = pos.row + d[1]
      if (nc < 0 || nc > 5 || nr < 0 || nr > 2) break
      if (nc === opp.col && nr === opp.row) break
      pos.col = nc
      pos.row = nr
    }
  }

  // ordered movement wishes to line up with / close on the opponent
  function approachCards(): CardDef[] {
    const dcol = opp.col - pos.col
    const drow = opp.row - pos.row
    const wishes: CardDef[] = []
    const hdir: MoveDir = dcol >= 0 ? 'right' : 'left'
    const vdir: MoveDir = drow >= 0 ? 'down' : 'up'
    if (Math.abs(dcol) >= 2) wishes.push(moveCard(hdir, 2))
    if (Math.abs(dcol) >= 3) {
      if (dcol !== 0) wishes.push(moveCard(hdir, 1))
      if (drow !== 0) wishes.push(moveCard(vdir, 1))
    } else {
      if (drow !== 0) wishes.push(moveCard(vdir, 1))
      if (dcol !== 0) wishes.push(moveCard(hdir, 1))
    }
    return wishes
  }

  for (let slot = 0; slot < 3; slot++) {
    // 1) attack if one connects right now and we roll aggressive
    const ready = char.attacks
      .filter((a) => energy >= (a.energyCost ?? 0) && hits(pos, facing, a, opp))
      .sort((x, y) => (y.damage ?? 0) - (x.damage ?? 0))
    if (ready.length > 0 && Math.random() < cfg.aggression) {
      take(ready[0])
      continue
    }

    // 2) recharge when starved and the energy card is up
    if (energy < Math.max(cfg.energyFloor, cheapest) && usable(ENERGY)) {
      take(ENERGY)
      continue
    }

    // 3) close in / line up with the opponent
    const wish = approachCards().find(usable)
    if (wish) {
      take(wish)
      continue
    }

    // 4) occasional guard
    if (Math.random() < cfg.guardChance && energy >= (GUARD.guardCost ?? 0) && usable(GUARD)) {
      take(GUARD)
      continue
    }

    // 5) fallbacks: any affordable attack (cheapest), else any free move, else idle
    const cheap = char.attacks
      .filter((a) => energy >= (a.energyCost ?? 0))
      .sort((x, y) => (x.energyCost ?? 0) - (y.energyCost ?? 0))[0]
    if (cheap) {
      take(cheap)
      continue
    }
    const anyMove = COMMON_CARDS.filter((c) => c.kind === 'move').find(usable)
    if (anyMove) {
      take(anyMove)
      continue
    }
    if (usable(ENERGY)) take(ENERGY)
    else take(char.attacks[0]) // last resort (will fizzle on no fuel)
  }

  return plan
}
