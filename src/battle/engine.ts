import { getChar, type CharacterDef } from '../data/roster'
import { ENERGY_REGEN } from './cards'
import {
  GRID_COLS,
  GRID_ROWS,
  START_CELLS,
  type BattleSnapshot,
  type Cell,
  type CardDef,
  type MoveDir,
  type Step,
} from './types'

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const cloneCell = (c: Cell): Cell => ({ col: c.col, row: c.row })
const sameCell = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row

const DELTA: Record<MoveDir, [number, number]> = {
  right: [1, 0],
  left: [-1, 0],
  up: [0, -1],
  down: [0, 1],
}

export interface BattleState {
  pos: [Cell, Cell]
  hp: [number, number]
  energy: [number, number]
  shield: [number, number]
  /** Per-fighter card cooldowns remaining, keyed by card id. */
  cooldowns: [Record<string, number>, Record<string, number>]
  turn: number
  over: boolean
  winner: number | null
}

/** Turn-based 2D card battle. Index 0 (player) faces +col, index 1 faces -col. */
export class CardBattle {
  chars: [CharacterDef, CharacterDef]
  state: BattleState

  constructor(playerCharId: string, oppCharId: string) {
    this.chars = [getChar(playerCharId), getChar(oppCharId)]
    this.state = {
      pos: [cloneCell(START_CELLS[0]), cloneCell(START_CELLS[1])],
      hp: [this.chars[0].maxHp, this.chars[1].maxHp],
      energy: [this.chars[0].startEnergy, this.chars[1].startEnergy],
      shield: [0, 0],
      cooldowns: [{}, {}],
      turn: 1,
      over: false,
      winner: null,
    }
  }

  /** + for player (faces right), - for opponent (faces left). */
  facing(p: number): number {
    return p === 0 ? 1 : -1
  }

  cooldownOf(p: number, id: string): number {
    return this.state.cooldowns[p][id] ?? 0
  }

  snapshot(): BattleSnapshot {
    const s = this.state
    return {
      pos: [cloneCell(s.pos[0]), cloneCell(s.pos[1])],
      hp: [s.hp[0], s.hp[1]],
      energy: [s.energy[0], s.energy[1]],
      shield: [s.shield[0], s.shield[1]],
    }
  }

  /** Cells this attack covers right now, mapped from the attacker's facing. */
  targetsOf(p: number, card: CardDef): Cell[] {
    const f = this.facing(p)
    const from = this.state.pos[p]
    return (card.range ?? []).map((o) => ({ col: from.col + f * o.df, row: from.row - o.du }))
  }

  private applyMove(p: number, card: CardDef) {
    const s = this.state
    const [dc, dr] = DELTA[card.dir ?? 'right']
    const steps = card.steps ?? 1
    const other = s.pos[1 - p]
    for (let k = 0; k < steps; k++) {
      const next: Cell = { col: s.pos[p].col + dc, row: s.pos[p].row + dr }
      // stop at walls or the opponent's cell
      if (next.col < 0 || next.col >= GRID_COLS || next.row < 0 || next.row >= GRID_ROWS) break
      if (sameCell(next, other)) break
      s.pos[p] = next
    }
  }

  /**
   * Resolve a full turn. Cards play in the SELECTED slot order (1→2→3). Within
   * a single slot, the two fighters' cards resolve by type priority — move,
   * then defense (guard/energy), then attack — so moving/guarding sets up
   * against an attack landing in that same slot. Two attacks in one slot trade
   * simultaneously. Mutates state; returns ordered steps for animation.
   */
  resolveTurn(planA: CardDef[], planB: CardDef[]): Step[] {
    const s = this.state
    const plans: [CardDef[], CardDef[]] = [planA, planB]
    const steps: Step[] = []

    // start of turn: clear last turn's guard, apply passive energy regen, then
    // each fighter's character passive (bonus energy / standing shield).
    s.shield = [0, 0]
    for (let p = 0; p < 2; p++) {
      const ch = this.chars[p]
      const bonus = ENERGY_REGEN + (ch.passive.turnEnergy ?? 0)
      s.energy[p] = clamp(s.energy[p] + bonus, 0, ch.maxEnergy)
      s.shield[p] += ch.passive.turnShield ?? 0
    }

    const emit = (actor: number, card: CardDef, result: Step['result'], damage = 0, heal = 0) => {
      const phase: Step['phase'] =
        card.kind === 'move' ? 'move' : card.kind === 'attack' ? 'attack' : 'defense'
      steps.push({ phase, actor, card, result, damage, heal, snapshot: this.snapshot() })
    }

    // resolve one move/guard/energy card in place
    const resolvePrep = (p: number, c: CardDef) => {
      if (c.kind === 'move') {
        this.applyMove(p, c)
        emit(p, c, 'move')
      } else if (c.kind === 'guard') {
        const cost = c.guardCost ?? 0
        if (s.energy[p] >= cost) {
          s.energy[p] -= cost
          s.shield[p] += c.block ?? 0
          emit(p, c, 'guard')
        } else {
          emit(p, c, 'nofuel')
        }
      } else if (c.kind === 'energy') {
        s.energy[p] = clamp(s.energy[p] + (c.gain ?? 0), 0, this.chars[p].maxEnergy)
        emit(p, c, 'energy')
      }
    }

    // spend energy and measure one attack against the current board (no HP yet)
    const computeAttack = (p: number, c: CardDef) => {
      const cost = c.energyCost ?? 0
      if (s.energy[p] < cost)
        return { p, card: c, result: 'nofuel' as Step['result'], dmg: 0, heal: 0 }
      s.energy[p] -= cost
      const d = 1 - p
      const connects = this.targetsOf(p, c).some((cell) => sameCell(cell, s.pos[d]))
      if (!connects) return { p, card: c, result: 'whiff' as Step['result'], dmg: 0, heal: 0 }
      const atkPas = this.chars[p].passive
      const defPas = this.chars[d].passive
      const raw = c.damage ?? 0
      // EMBER (shieldBreak): a connecting hit wipes the defender's shield first.
      if (atkPas.shieldBreak) s.shield[d] = 0
      const absorbed = Math.min(s.shield[d], raw)
      s.shield[d] -= absorbed
      // TITAN (damageReduction): flat reduction on the damage that gets through.
      const dmg = Math.max(0, raw - absorbed - (defPas.damageReduction ?? 0))
      // CIPHER (lifestealDiv): heal a fraction of the damage actually dealt.
      const heal = dmg > 0 && atkPas.lifestealDiv ? Math.floor(dmg / atkPas.lifestealDiv) : 0
      return { p, card: c, result: (dmg > 0 ? 'hit' : 'blocked') as Step['result'], dmg, heal }
    }

    const prio = (c: CardDef) => (c.kind === 'move' ? 0 : c.kind === 'attack' ? 2 : 1)

    for (let slot = 0; slot < 3; slot++) {
      // cards present this slot, ordered move < defense < attack (p0 first on a tie)
      const here = ([0, 1] as const)
        .map((p) => ({ p: p as number, card: plans[p][slot] }))
        .filter((e): e is { p: number; card: CardDef } => !!e.card)
        .sort((x, y) => prio(x.card) - prio(y.card))

      const bothAttack =
        here.length === 2 && here[0].card.kind === 'attack' && here[1].card.kind === 'attack'

      if (bothAttack) {
        // simultaneous trade: measure both vs the same board, then apply together
        const banked = here.map((e) => computeAttack(e.p, e.card))
        for (const e of banked) {
          s.hp[1 - e.p] = Math.max(0, s.hp[1 - e.p] - e.dmg)
          if (e.heal) s.hp[e.p] = Math.min(this.chars[e.p].maxHp, s.hp[e.p] + e.heal)
        }
        for (const e of banked) emit(e.p, e.card, e.result, e.dmg, e.heal)
      } else {
        for (const e of here) {
          if (e.card.kind === 'attack') {
            const r = computeAttack(e.p, e.card)
            s.hp[1 - r.p] = Math.max(0, s.hp[1 - r.p] - r.dmg)
            if (r.heal) s.hp[r.p] = Math.min(this.chars[r.p].maxHp, s.hp[r.p] + r.heal)
            emit(r.p, r.card, r.result, r.dmg, r.heal)
          } else {
            resolvePrep(e.p, e.card)
          }
        }
      }

      if (s.hp[0] <= 0 || s.hp[1] <= 0) {
        s.over = true
        s.winner = s.hp[0] <= 0 && s.hp[1] <= 0 ? null : s.hp[0] <= 0 ? 1 : 0
        break
      }
    }

    // end of turn: advance cooldowns, then lock cards used this turn
    for (let p = 0; p < 2; p++) {
      const cds = s.cooldowns[p]
      for (const id of Object.keys(cds)) cds[id] = Math.max(0, cds[id] - 1)
      for (const c of plans[p]) {
        if ((c?.cooldown ?? 0) >= 1) cds[c.id] = c.cooldown as number
      }
    }

    if (!s.over) s.turn += 1
    return steps
  }
}

/**
 * Can this 3-card plan be paid for? Cards resolve in the SELECTED slot order,
 * so energy gains / guard costs / attack costs apply in that order (after the
 * start-of-turn passive regen). Returns false if any card can't be afforded.
 */
export function planAffordable(
  plan: CardDef[],
  startEnergy: number,
  maxEnergy: number,
  extraRegen = 0,
): boolean {
  let e = Math.min(maxEnergy, startEnergy + ENERGY_REGEN + extraRegen)
  for (const c of plan) {
    if (c.kind === 'energy') {
      e = Math.min(maxEnergy, e + (c.gain ?? 0))
    } else if (c.kind === 'guard') {
      const cost = c.guardCost ?? 0
      if (e < cost) return false
      e -= cost
    } else if (c.kind === 'attack') {
      const cost = c.energyCost ?? 0
      if (e < cost) return false
      e -= cost
    }
  }
  return true
}
