import { getChar, type CharacterDef } from '../data/roster'
import { ENERGY_REGEN } from './cards'
import {
  FOG_DAMAGE,
  FOG_START_TURN,
  GRID_COLS,
  MOVE_DELTA,
  START_CELLS,
  inBounds,
  isFogCell,
  type BattleSnapshot,
  type Cell,
  type CardDef,
  type Step,
} from './types'

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

// 독안개·부활 스텝(연출·로그)용 가짜 카드 — 덱에는 존재하지 않음.
const FOG_CARD: CardDef = { id: 'fog', name: '독안개', kind: 'guard', desc: '가장자리를 덮는 독안개.' }
const REVIVE_CARD: CardDef = { id: 'revive', name: '잿불 부활', kind: 'guard', desc: '쓰러진 자리에서 불씨로 되살아난다.' }
const cloneCell = (c: Cell): Cell => ({ col: c.col, row: c.row })
const sameCell = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row

export interface BattleState {
  pos: [Cell, Cell]
  hp: [number, number]
  energy: [number, number]
  shield: [number, number]
  /** Per-fighter card cooldowns remaining, keyed by card id. */
  cooldowns: [Record<string, number>, Record<string, number>]
  /** 부활 패시브를 이미 소모했는가 (전투당 1회). */
  revived: [boolean, boolean]
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
      revived: [false, false],
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
    const [dc, dr] = MOVE_DELTA[card.dir ?? 'right']
    const steps = card.steps ?? 1
    let cur = cloneCell(s.pos[p])
    for (let k = 0; k < steps; k++) {
      const next: Cell = { col: cur.col + dc, row: cur.row + dr }
      if (!inBounds(next)) break // 벽에서 멈춤
      cur = next // 상대 셀 통과·정지 모두 가능(겹침 허용)
    }
    s.pos[p] = cur
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

    // 동시 KO 타이브레이크용: 이 턴이 시작될 때의 체력 비율을 기억해 둔다.
    const startHpRatio: [number, number] = [
      s.hp[0] / this.chars[0].maxHp,
      s.hp[1] / this.chars[1].maxHp,
    ]
    // 동시 KO 시 승자: 턴 시작 시점에 체력 비율이 높았던 쪽(같으면 무승부).
    // 랜덤 없음 — 멀티 락스텝 안전.
    const koWinner = (): number | null => {
      if (s.hp[0] <= 0 && s.hp[1] <= 0)
        return startHpRatio[0] > startHpRatio[1] ? 0 : startHpRatio[1] > startHpRatio[0] ? 1 : null
      return s.hp[0] <= 0 ? 1 : 0
    }

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
      } else if (c.kind === 'heal') {
        // 기력을 체력으로 — 실제 회복량만 heal로 실어 초록 +N을 띄운다
        const cost = c.healCost ?? 0
        if (s.energy[p] >= cost) {
          s.energy[p] -= cost
          const before = s.hp[p]
          s.hp[p] = Math.min(this.chars[p].maxHp, before + (c.healHp ?? 0))
          emit(p, c, 'heal', 0, s.hp[p] - before)
        } else {
          emit(p, c, 'nofuel')
        }
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
      // 밀착(같은 셀): 어떤 카드의 range도 자기 셀을 덮지 않으므로 여기서 따로
      // 판정한다. 대부분의 카드는 겹친 상대를 그대로 때리고, `pointBlank: false`인
      // "바로 옆이 사각"짜리 원거리 카드만 빗나간다.
      const connects =
        (sameCell(s.pos[p], s.pos[d]) && c.pointBlank !== false) ||
        this.targetsOf(p, c).some((cell) => sameCell(cell, s.pos[d]))
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
      // 회복: 카드 흡혈(leech) + CIPHER 패시브(lifesteal 고정치), 피해가 들어갔을 때만.
      let heal = 0
      if (dmg > 0) {
        heal += c.leech ?? 0
        heal += atkPas.lifesteal ?? 0
      }
      const result = (dmg > 0 ? 'hit' : 'blocked') as Step['result']
      return { ...zero, result, dmg, heal, drain, recoil, push: c.push ?? 0 }
    }

    // 넉백: 공격자가 바라보는 방향으로 상대를 밀어낸다(벽에서만 멈춤, 겹침 허용).
    const applyPush = (attacker: number, n: number) => {
      const d = 1 - attacker
      const f = this.facing(attacker)
      for (let k = 0; k < n; k++) {
        const next: Cell = { col: s.pos[d].col + f, row: s.pos[d].row }
        if (next.col < 0 || next.col >= GRID_COLS) break
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

    // 부활(EMBER 잿불 부활 등): KO 직후, 아직 안 썼다면 한 번 되살아난다.
    const tryRevive = (p: number) => {
      const amount = this.chars[p].passive.revive ?? 0
      if (s.hp[p] > 0 || amount <= 0 || s.revived[p]) return
      s.revived[p] = true
      s.hp[p] = Math.min(this.chars[p].maxHp, amount)
      steps.push({
        phase: 'revive',
        actor: p,
        card: REVIVE_CARD,
        result: 'revive',
        damage: 0,
        heal: amount,
        drain: 0,
        recoil: 0,
        snapshot: this.snapshot(),
      })
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
        tryRevive(0)
        tryRevive(1)
      }
      if (s.hp[0] <= 0 || s.hp[1] <= 0) {
        s.over = true
        s.winner = koWinner()
        break
      }
    }

    // 독안개: FOG_START_TURN부터 턴 종료 시 독안개 위에 서 있으면 피해.
    // (자기 피해이므로 Step.recoil로 전달 — UI가 본인 몸에 -N을 띄운다)
    if (!s.over && s.turn >= FOG_START_TURN) {
      for (let p = 0; p < 2; p++) {
        if (!isFogCell(s.pos[p], s.turn)) continue
        s.hp[p] = Math.max(0, s.hp[p] - FOG_DAMAGE)
        steps.push({
          phase: 'fog',
          actor: p,
          card: FOG_CARD,
          result: 'fog',
          damage: 0,
          heal: 0,
          drain: 0,
          recoil: FOG_DAMAGE,
          snapshot: this.snapshot(),
        })
      }
      if (s.hp[0] <= 0 || s.hp[1] <= 0) {
        tryRevive(0)
        tryRevive(1)
      }
      if (s.hp[0] <= 0 || s.hp[1] <= 0) {
        s.over = true
        s.winner = koWinner()
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
    } else if (c.kind === 'heal') {
      const cost = c.healCost ?? 0
      if (e < cost) return false
      e -= cost
    }
  }
  return true
}
