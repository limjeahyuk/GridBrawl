import type { CharacterDef } from '../data/roster'
import { COMMON_CARDS } from './cards'
import type { BattleState } from './engine'
import { LANE, type CardDef, type Difficulty } from './types'

const card = (id: string) => COMMON_CARDS.find((c) => c.id === id)!
const FORWARD = card('c-forward')
const BACK = card('c-back')
const JUMP = card('c-up')
const CROUCH = card('c-down')
const GUARD = card('c-guard')
const ENERGY = card('c-energy')

interface AICfg {
  aggression: number
  guardChance: number
  evadeChance: number
}

const DIFF: Record<Difficulty, AICfg> = {
  easy: { aggression: 0.6, guardChance: 0.1, evadeChance: 0.06 },
  normal: { aggression: 0.8, guardChance: 0.2, evadeChance: 0.12 },
  hard: { aggression: 0.92, guardChance: 0.28, evadeChance: 0.18 },
}

/** Build a 3-card plan for the CPU fighter `self` from the current state. */
export function decideAI(
  state: BattleState,
  self: number,
  char: CharacterDef,
  difficulty: Difficulty,
): CardDef[] {
  const cfg = DIFF[difficulty]
  const opp = 1 - self
  let pos = state.pos[self]
  const oppPos = state.pos[opp]
  let energy = state.energy[self]

  const cheapest = Math.min(...char.attacks.map((a) => a.energyCost ?? 0))
  const plan: CardDef[] = []

  const toward = () => Math.sign(oppPos - pos) || 1
  const approach = () => {
    let np = pos + toward()
    np = Math.max(0, Math.min(LANE - 1, np))
    if (np === oppPos) np = pos // don't overlap
    pos = np
  }

  for (let slot = 0; slot < 3; slot++) {
    const dist = Math.abs(pos - oppPos)
    const r = Math.random()

    // occasional evasive mix-up (assume a hit might be coming)
    if (slot > 0 && r < cfg.evadeChance) {
      plan.push(Math.random() < 0.5 ? JUMP : CROUCH)
      continue
    }
    // occasional guard
    if (slot > 0 && r < cfg.evadeChance + cfg.guardChance) {
      plan.push(GUARD)
      continue
    }

    // affordable attacks that connect at the current distance (assume opp stands)
    const inRange = char.attacks
      .filter((a) => energy >= (a.energyCost ?? 0) && dist <= (a.reach ?? 1) && (a.hits ?? []).includes('stand'))
      .sort((x, y) => (y.damage ?? 0) - (x.damage ?? 0))

    if (inRange.length > 0 && Math.random() < cfg.aggression) {
      const a = inRange[0]
      plan.push(a)
      energy -= a.energyCost ?? 0
      continue
    }

    // would an approach this slot set up a hit next slot?
    const afterDist = Math.max(1, dist - 1)
    const setupReachable = char.attacks.some(
      (a) => energy >= (a.energyCost ?? 0) && afterDist <= (a.reach ?? 1),
    )

    if (energy < cheapest) {
      // can't afford anything: recharge, or close distance if already near
      plan.push(dist > 2 ? FORWARD : ENERGY)
      if (plan[slot] === FORWARD) approach()
      else energy = Math.min(char.maxEnergy, energy + (ENERGY.gain ?? 0))
      continue
    }

    if (dist > 1 && setupReachable) {
      plan.push(FORWARD)
      approach()
      continue
    }

    // in range but didn't roll aggression — poke with cheapest, else reposition
    const cheap = char.attacks
      .filter((a) => energy >= (a.energyCost ?? 0) && dist <= (a.reach ?? 1))
      .sort((x, y) => (x.energyCost ?? 0) - (y.energyCost ?? 0))[0]
    if (cheap) {
      plan.push(cheap)
      energy -= cheap.energyCost ?? 0
    } else if (dist > 1) {
      plan.push(FORWARD)
      approach()
    } else {
      plan.push(Math.random() < 0.5 ? BACK : GUARD)
      if (plan[slot] === BACK) pos = Math.max(0, Math.min(LANE - 1, pos - toward()))
    }
  }

  return plan
}
