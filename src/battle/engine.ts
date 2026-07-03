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

    const emit = (
      actor: number,
      card: CardDef,
      result: Step['result'],
      damage = 0,
      heal = 0,
      drain = 0,
      recoil = 0,
    ) => {
      const phase: Step['phase'] =
        card.kind === 'move' ? 'move' : card.kind === 'attack' ? 'attack' : 'defense'
      steps.push({ phase, actor, card, result, damage, heal, drain, recoil, snapshot: this.snapshot() })
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

    // spend energy and measure one attack against the current board. Energy /
    // shield / drain effects apply immediately; HP · push are returned for the
    // caller to apply (deferred in a simultaneous trade).
    const computeAttack = (p: number, c: CardDef) => {
      const zero = { p, card: c, dmg: 0, heal: 0, drain: 0, recoil: 0, push: 0 }
      const cost = c.energyCost ?? 0
      if (s.energy[p] < cost) return { ...zero, result: 'nofuel' as Step['result'] }
      s.energy[p] -= cost
      // 기력 지불 성공 시 무조건 발동: 보호막 전개(selfShield) / 반동(recoil)
      if (c.selfShield) s.shield[p] += c.selfShield
      const recoil = c.recoil ?? 0
      const d = 1 - p
      const connects = this.targetsOf(p, c).some((cell) => sameCell(cell, s.pos[d]))
      if (!connects) return { ...zero, recoil, result: 'whiff' as Step['result'] }
      const atkPas = this.chars[p].passive
      const defPas = this.chars[d].passive
      const raw = c.damage ?? 0
      // EMBER (shieldBreak): a connecting hit wipes the defender's shield first.
      if (atkPas.shieldBreak) s.shield[d] = 0
      // pierce: 보호막을 소모시키지 않고 그대로 통과한다.
      const absorbed = c.pierce ? 0 : Math.min(s.shield[d], raw)
      s.shield[d] -= absorbed
      // TITAN (damageReduction): flat reduction on the damage that gets through.
      const dmg = Math.max(0, raw - absorbed - (defPas.damageReduction ?? 0))
      // drain: 적중하면(가드로 막혀도) 상대 기력을 빼앗아 흡수.
      let drain = 0
      if (c.drain) {
        drain = Math.min(s.energy[d], c.drain)
        s.energy[d] -= drain
        s.energy[p] = clamp(s.energy[p] + drain, 0, this.chars[p].maxEnergy)
      }
      // 회복: 카드 흡혈(leech) + CIPHER 패시브(lifestealDiv), 피해가 들어갔을 때만.
      let heal = 0
      if (dmg > 0) {
        heal += c.leech ?? 0
        if (atkPas.lifestealDiv) heal += Math.floor(dmg / atkPas.lifestealDiv)
      }
      const result = (dmg > 0 ? 'hit' : 'blocked') as Step['result']
      return { ...zero, result, dmg, heal, drain, recoil, push: c.push ?? 0 }
    }

    // 넉백: 공격자가 바라보는 방향으로 상대를 밀어낸다(벽·공격자 셀에서 멈춤).
    const applyPush = (attacker: number, n: number) => {
      const d = 1 - attacker
      const f = this.facing(attacker)
      for (let k = 0; k < n; k++) {
        const next: Cell = { col: s.pos[d].col + f, row: s.pos[d].row }
        if (next.col < 0 || next.col >= GRID_COLS) break
        if (sameCell(next, s.pos[attacker])) break
        s.pos[d] = next
      }
    }

    // apply a measured attack's HP / board consequences
    const applyOutcome = (r: ReturnType<typeof computeAttack>) => {
      s.hp[1 - r.p] = Math.max(0, s.hp[1 - r.p] - r.dmg)
      if (r.recoil) s.hp[r.p] = Math.max(0, s.hp[r.p] - r.recoil)
      if (r.heal) s.hp[r.p] = Math.min(this.chars[r.p].maxHp, s.hp[r.p] + r.heal)
      if (r.push) applyPush(r.p, r.push)
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
        for (const e of banked) applyOutcome(e)
        for (const e of banked) emit(e.p, e.card, e.result, e.dmg, e.heal, e.drain, e.recoil)
      } else {
        for (const e of here) {
          if (e.card.kind === 'attack') {
            const r = computeAttack(e.p, e.card)
            applyOutcome(r)
            emit(r.p, r.card, r.result, r.dmg, r.heal, r.drain, r.recoil)
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
