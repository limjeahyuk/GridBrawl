import { getChar, type CharacterDef } from '../data/roster'
import { GUARD_BLOCK } from './cards'
import {
  LANE,
  START_POS,
  type ActorAction,
  type Beat,
  type BattleSnapshot,
  type CardDef,
  type Stance,
} from './types'

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

export interface BattleState {
  pos: [number, number]
  stance: [Stance, Stance]
  hp: [number, number]
  energy: [number, number]
  turn: number
  over: boolean
  winner: number | null
}

/** Turn-based card battle. Two fighters; index 0 faces +1, index 1 faces -1. */
export class CardBattle {
  chars: [CharacterDef, CharacterDef]
  state: BattleState

  constructor(playerCharId: string, oppCharId: string) {
    this.chars = [getChar(playerCharId), getChar(oppCharId)]
    this.state = {
      pos: [START_POS[0], START_POS[1]],
      stance: ['stand', 'stand'],
      hp: [this.chars[0].maxHp, this.chars[1].maxHp],
      energy: [this.chars[0].startEnergy, this.chars[1].startEnergy],
      turn: 1,
      over: false,
      winner: null,
    }
  }

  snapshot(): BattleSnapshot {
    const s = this.state
    return {
      pos: [s.pos[0], s.pos[1]],
      stance: [s.stance[0], s.stance[1]],
      hp: [s.hp[0], s.hp[1]],
      energy: [s.energy[0], s.energy[1]],
      guard: [false, false],
    }
  }

  private facing(p: number): number {
    return p === 0 ? 1 : -1
  }

  private applyMove(p: number, dir: CardDef['dir']) {
    const s = this.state
    if (dir === 'up') {
      s.stance[p] = 'jump'
      return
    }
    if (dir === 'down') {
      s.stance[p] = 'crouch'
      return
    }
    const delta = dir === 'forward' ? this.facing(p) : -this.facing(p)
    let np = clamp(s.pos[p] + delta, 0, LANE - 1)
    // keep ordering pos[0] < pos[1] with a one-cell minimum gap
    if (p === 0) np = Math.min(np, s.pos[1] - 1)
    else np = Math.max(np, s.pos[0] + 1)
    s.pos[p] = np
  }

  /** Resolve a full turn (3 beats) from both ordered plans. Mutates state. */
  resolveTurn(planA: CardDef[], planB: CardDef[]): Beat[] {
    const s = this.state
    const plans: [CardDef[], CardDef[]] = [planA, planB]
    const beats: Beat[] = []

    for (let i = 0; i < 3; i++) {
      // each beat starts standing; guard is per-beat
      s.stance = ['stand', 'stand']
      const guard: [boolean, boolean] = [false, false]
      const actions: [ActorAction | null, ActorAction | null] = [null, null]

      // --- phase 1: fast cards (move / guard / energy), p0 then p1 ---
      for (let p = 0; p < 2; p++) {
        const c = plans[p][i]
        if (!c) continue
        if (c.kind === 'move') {
          this.applyMove(p, c.dir)
          actions[p] = {
            card: c,
            result: c.dir === 'up' ? 'jump' : c.dir === 'down' ? 'crouch' : 'move',
            damageDealt: 0,
          }
        } else if (c.kind === 'guard') {
          guard[p] = true
          actions[p] = { card: c, result: 'guard', damageDealt: 0 }
        } else if (c.kind === 'energy') {
          s.energy[p] = clamp(s.energy[p] + (c.gain ?? 0), 0, this.chars[p].maxEnergy)
          actions[p] = { card: c, result: 'energy', damageDealt: 0 }
        }
      }

      // --- phase 2: attacks, using post-movement positions/stances ---
      for (let p = 0; p < 2; p++) {
        const c = plans[p][i]
        if (!c || c.kind !== 'attack') continue
        const d = 1 - p
        const cost = c.energyCost ?? 0
        if (s.energy[p] < cost) {
          actions[p] = { card: c, result: 'nofuel', damageDealt: 0 }
          continue
        }
        s.energy[p] -= cost
        const dist = Math.abs(s.pos[0] - s.pos[1])
        const reaches = dist <= (c.reach ?? 1)
        const stanceHit = (c.hits ?? ['stand']).includes(s.stance[d])
        if (reaches && stanceHit) {
          let dmg = c.damage ?? 0
          if (guard[d]) dmg = Math.max(0, dmg - GUARD_BLOCK)
          s.hp[d] = Math.max(0, s.hp[d] - dmg)
          actions[p] = { card: c, result: dmg > 0 ? 'hit' : 'blocked', damageDealt: dmg }
        } else {
          actions[p] = { card: c, result: 'whiff', damageDealt: 0 }
        }
      }

      const snap = this.snapshot()
      snap.guard = guard
      beats.push({
        index: i,
        actions: [
          actions[0] ?? { card: plans[0][i], result: 'whiff', damageDealt: 0 },
          actions[1] ?? { card: plans[1][i], result: 'whiff', damageDealt: 0 },
        ],
        snapshot: snap,
      })

      if (s.hp[0] <= 0 || s.hp[1] <= 0) {
        s.over = true
        s.winner = s.hp[0] <= 0 && s.hp[1] <= 0 ? null : s.hp[0] <= 0 ? 1 : 0
        break
      }
    }

    // between turns everyone is standing again
    s.stance = ['stand', 'stand']
    if (!s.over) s.turn += 1
    return beats
  }
}

/** Can this ordered plan be paid for, given the running energy budget? */
export function planAffordable(plan: CardDef[], startEnergy: number, maxEnergy: number): boolean {
  let e = startEnergy
  for (const c of plan) {
    if (c.kind === 'energy') e = Math.min(maxEnergy, e + (c.gain ?? 0))
    else if (c.kind === 'attack') {
      const cost = c.energyCost ?? 0
      if (e < cost) return false
      e -= cost
    }
  }
  return true
}
