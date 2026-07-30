import { getChar, type CharacterDef, type Passive } from '../data/roster'
import { ENERGY_REGEN } from './cards'
import {
  FOG_DAMAGE,
  FOG_START_TURN,
  GRID_COLS,
  LOW_HP_FRAC,
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
const STUN_CARD: CardDef = { id: 'stun', name: '기절', kind: 'guard', desc: '기절해서 이 턴에 아무것도 못 한다.' }
const TRIGGER_CARD: CardDef = { id: 'trigger', name: '유물 발동', kind: 'guard', desc: '누적 기력이 유물을 깨웠다.' }
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
  /** 이 전투에서 쓴 누적 기력 — 유물의 `energyTriggers` 판정용. */
  energySpent: [number, number]
  /** 트리거를 마지막으로 판정한 시점의 `energySpent`(주기 경계 통과 감지용). */
  energySeen: [number, number]
  /** 남은 기절 턴 수. >0이면 그 턴 카드를 못 낸다(턴 시작에 1 감소). */
  stunned: [number, number]
  /** `stunOnHit`으로 이번 전투에 기절시킨 횟수(`stunCap` 제한). */
  stunsUsed: [number, number]
  /** 카드 `empower`로 이 전투 내내 누적된 공격 피해 보너스. */
  empowered: [number, number]
  turn: number
  over: boolean
  winner: number | null
}

/**
 * 전투 생성 옵션(로그라이크용, 선택). 미지정이면 기존처럼 `getChar(id)`의
 * `maxHp`·`passive`를 그대로 쓴다 — PvP·튜토리얼·봇전은 변화 없음.
 */
export interface BattleOpts {
  /** getChar 대신 이 CharacterDef를 쓴다(몬스터처럼 스탯을 갈아끼울 때). */
  chars?: [CharacterDef, CharacterDef]
  /** 각 진영의 실효 패시브(장착 유물 merge 결과). 없으면 char.passive. */
  passives?: [Passive, Passive]
  /**
   * 시작 체력(로그라이크 **HP 이월**). 지정한 쪽만 이 값으로 시작하고(1..maxHp로
   * 클램프), 미지정(undefined)이면 풀피 — PvP·봇전·튜토리얼은 변화 없음.
   */
  startHp?: [number | undefined, number | undefined]
}

/** Turn-based 2D card battle. Index 0 (player) faces +col, index 1 faces -col. */
export class CardBattle {
  chars: [CharacterDef, CharacterDef]
  /** 실효 패시브 — 유물이 합쳐진 값(없으면 char.passive). */
  passive: [Passive, Passive]
  /** 실효 최대 체력 — char.maxHp + passive.maxHpBonus(최소 1). */
  maxHp: [number, number]
  state: BattleState

  constructor(playerCharId: string, oppCharId: string, opts?: BattleOpts) {
    this.chars = opts?.chars ?? [getChar(playerCharId), getChar(oppCharId)]
    this.passive = [
      opts?.passives?.[0] ?? this.chars[0].passive,
      opts?.passives?.[1] ?? this.chars[1].passive,
    ]
    this.maxHp = [
      Math.max(1, this.chars[0].maxHp + (this.passive[0].maxHpBonus ?? 0)),
      Math.max(1, this.chars[1].maxHp + (this.passive[1].maxHpBonus ?? 0)),
    ]
    // 시작 체력 — 로그라이크는 이전 층에서 남은 체력을 이어받는다(startHp).
    const startHp = (p: number): number => {
      const want = opts?.startHp?.[p]
      return want == null ? this.maxHp[p] : clamp(Math.round(want), 1, this.maxHp[p])
    }
    this.state = {
      pos: [cloneCell(START_CELLS[0]), cloneCell(START_CELLS[1])],
      hp: [startHp(0), startHp(1)],
      energy: [this.chars[0].startEnergy, this.chars[1].startEnergy],
      shield: [0, 0],
      cooldowns: [{}, {}],
      revived: [false, false],
      energySpent: [0, 0],
      energySeen: [0, 0],
      stunned: [0, 0],
      stunsUsed: [0, 0],
      empowered: [0, 0],
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
      s.hp[0] / this.maxHp[0],
      s.hp[1] / this.maxHp[1],
    ]
    // 동시 KO 시 승자: 턴 시작 시점에 체력 비율이 높았던 쪽(같으면 무승부).
    // 랜덤 없음 — 멀티 락스텝 안전.
    const koWinner = (): number | null => {
      if (s.hp[0] <= 0 && s.hp[1] <= 0)
        return startHpRatio[0] > startHpRatio[1] ? 0 : startHpRatio[1] > startHpRatio[0] ? 1 : null
      return s.hp[0] <= 0 ? 1 : 0
    }

    // start of turn: clear last turn's guard, apply passive energy regen, then
    // each fighter's effective passive (bonus energy / standing shield / HP regen).
    s.shield = [0, 0]
    for (let p = 0; p < 2; p++) {
      const pas = this.passive[p]
      const bonus = ENERGY_REGEN + (pas.turnEnergy ?? 0)
      s.energy[p] = clamp(s.energy[p] + bonus, 0, this.chars[p].maxEnergy)
      s.shield[p] += pas.turnShield ?? 0
      if (s.turn === 1 && pas.openingShield) s.shield[p] += pas.openingShield
      if (pas.regen) s.hp[p] = Math.min(this.maxHp[p], s.hp[p] + pas.regen)
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

    // 기력 소비를 한 곳으로 모은다 — 유물의 누적 기력 트리거(`energyTriggers`)가
    // "이 전투에서 쓴 총 기력"을 세기 때문에, 카드 비용은 전부 이 함수를 지나야 한다.
    const spend = (p: number, amount: number) => {
      s.energy[p] -= amount
      s.energySpent[p] += amount
    }

    /**
     * 누적 기력 트리거 판정 — 슬롯이 끝날 때마다 호출한다. `per`의 배수를 넘긴 횟수만큼
     * 발동하고(한 슬롯에 여러 번도 가능), 여러 유물의 트리거는 각자 자기 주기로 따로
     * 터진다(조합 스택 허용). 랜덤 없음 → 결정론 유지.
     */
    const fireEnergyTriggers = () => {
      for (let p = 0; p < 2; p++) {
        const list = this.passive[p].energyTriggers
        if (!list?.length) {
          s.energySeen[p] = s.energySpent[p]
          continue
        }
        const seen = s.energySeen[p]
        const now = s.energySpent[p]
        if (now === seen) continue
        const d = 1 - p
        for (const t of list) {
          if (t.per <= 0) continue
          const times = Math.floor(now / t.per) - Math.floor(seen / t.per)
          for (let k = 0; k < times; k++) {
            let heal = 0
            let damage = 0
            if (t.heal) {
              const before = s.hp[p]
              s.hp[p] = Math.min(this.maxHp[p], before + t.heal)
              heal = s.hp[p] - before
            }
            if (t.shield) s.shield[p] += t.shield
            if (t.energy) s.energy[p] = clamp(s.energy[p] + t.energy, 0, this.chars[p].maxEnergy)
            if (t.damage) {
              damage = Math.min(s.hp[d], t.damage) // 보호막 무시 고정 피해
              s.hp[d] -= damage
            }
            if (t.stun) s.stunned[d] += t.stun
            steps.push({
              phase: t.stun ? 'stun' : 'trigger',
              actor: p,
              card: { ...TRIGGER_CARD, name: t.label ?? TRIGGER_CARD.name },
              result: t.stun ? 'stun' : 'trigger',
              damage,
              heal,
              drain: 0,
              recoil: 0,
              snapshot: this.snapshot(),
            })
          }
        }
        s.energySeen[p] = now
      }
    }

    // resolve one move/guard/energy card in place
    const resolvePrep = (p: number, c: CardDef) => {
      if (c.kind === 'move') {
        this.applyMove(p, c)
        emit(p, c, 'move')
      } else if (c.kind === 'guard') {
        const cost = c.guardCost ?? 0
        if (s.energy[p] >= cost) {
          spend(p, cost)
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
          spend(p, cost)
          const before = s.hp[p]
          s.hp[p] = Math.min(this.maxHp[p], before + (c.healHp ?? 0))
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
      const zero = { p, card: c, dmg: 0, heal: 0, drain: 0, recoil: 0, push: 0, pull: 0, stun: 0 }
      const cost = c.energyCost ?? 0
      if (s.energy[p] < cost) return { ...zero, result: 'nofuel' as Step['result'] }
      spend(p, cost)
      // 기력 지불 성공 시 무조건 발동: 보호막 전개(selfShield) / 반동(recoil) / 각성(empower)
      if (c.selfShield) s.shield[p] += c.selfShield
      if (c.empower) s.empowered[p] += c.empower
      const recoil = c.recoil ?? 0
      const d = 1 - p
      // 밀착(같은 셀): 어떤 카드의 range도 자기 셀을 덮지 않으므로 여기서 따로
      // 판정한다. 대부분의 카드는 겹친 상대를 그대로 때리고, `pointBlank: false`인
      // "바로 옆이 사각"짜리 원거리 카드만 빗나간다.
      const connects =
        (sameCell(s.pos[p], s.pos[d]) && c.pointBlank !== false) ||
        this.targetsOf(p, c).some((cell) => sameCell(cell, s.pos[d]))
      if (!connects) return { ...zero, recoil, result: 'whiff' as Step['result'] }
      const atkPas = this.passive[p]
      const defPas = this.passive[d]
      // raw 피해 = 카드 + attackBonus(유물) + empowered(이 전투 누적 각성),
      // 저체력이면 lowHpBonusPct(유물, 합산)만큼 배율. 순서·반올림 고정(결정론).
      const flat = (c.damage ?? 0) + (atkPas.attackBonus ?? 0) + s.empowered[p]
      const low = s.hp[p] <= this.maxHp[p] * LOW_HP_FRAC ? (atkPas.lowHpBonusPct ?? 0) : 0
      const raw = low > 0 ? Math.round(flat * (1 + low / 100)) : flat
      // EMBER (shieldBreak): a connecting hit wipes the defender's shield first.
      if (atkPas.shieldBreak) s.shield[d] = 0
      // pierce: 보호막을 소모시키지 않고 그대로 통과한다(유물 alwaysPierce도 같은 효과).
      const absorbed = c.pierce || atkPas.alwaysPierce ? 0 : Math.min(s.shield[d], raw)
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
        heal += atkPas.lifesteal ?? 0 // CIPHER 패시브 + 송곳니류 유물
      }
      // 기절: 카드의 `stun` + 유물 `stunOnHit`(전투당 `stunCap`회). 피해가 실제로
      // 들어갔을 때만 — 가드에 막힌 타격으로는 기절하지 않는다.
      let stun = dmg > 0 ? (c.stun ?? 0) : 0
      const onHit = atkPas.stunOnHit ?? 0
      if (dmg > 0 && onHit > 0 && s.stunsUsed[p] < (atkPas.stunCap ?? 1)) {
        s.stunsUsed[p] += 1
        stun += onHit
      }
      const result = (dmg > 0 ? 'hit' : 'blocked') as Step['result']
      return { ...zero, result, dmg, heal, drain, recoil, push: c.push ?? 0, pull: c.pull ?? 0, stun }
    }

    // 넉백/끌어당김: 공격자가 바라보는 방향(pull은 반대)으로 상대를 옮긴다.
    // 벽에서만 멈추고 겹침은 허용.
    const applyShove = (attacker: number, n: number, toward: boolean) => {
      const d = 1 - attacker
      const f = this.facing(attacker) * (toward ? -1 : 1)
      for (let k = 0; k < n; k++) {
        const next: Cell = { col: s.pos[d].col + f, row: s.pos[d].row }
        if (next.col < 0 || next.col >= GRID_COLS) break
        s.pos[d] = next
      }
    }

    // apply a measured attack's HP / board consequences
    const applyOutcome = (r: ReturnType<typeof computeAttack>) => {
      const d = 1 - r.p
      s.hp[d] = Math.max(0, s.hp[d] - r.dmg)
      // thorns(유물): 피해를 실제로 입은 방어자가 공격자에게 N 반사
      const thorns = this.passive[d].thorns ?? 0
      if (r.dmg > 0 && thorns) s.hp[r.p] = Math.max(0, s.hp[r.p] - thorns)
      if (r.recoil) s.hp[r.p] = Math.max(0, s.hp[r.p] - r.recoil)
      if (r.heal) s.hp[r.p] = Math.min(this.maxHp[r.p], s.hp[r.p] + r.heal)
      if (r.push) applyShove(r.p, r.push, false)
      if (r.pull) applyShove(r.p, r.pull, true)
      // 이 턴 시작에 감소 판정이 이미 끝났으므로, 여기서 더한 값은 다음 턴부터 소모된다.
      if (r.stun) s.stunned[d] += r.stun
    }

    // 부활(EMBER 잿불 부활 등): KO 직후, 아직 안 썼다면 한 번 되살아난다.
    const tryRevive = (p: number) => {
      const amount = this.passive[p].revive ?? 0
      if (s.hp[p] > 0 || amount <= 0 || s.revived[p]) return
      s.revived[p] = true
      s.hp[p] = Math.min(this.maxHp[p], amount)
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

    // 기절 판정 — 남은 기절 턴이 있으면 이 턴 카드를 통째로 버린다(기력 회복은 받는다).
    // 감소를 여기서 하므로, 이 턴 중에 새로 걸린 기절은 다음 턴부터 소모된다.
    for (let p = 0; p < 2; p++) {
      if (s.stunned[p] <= 0) continue
      s.stunned[p] -= 1
      plans[p] = []
      steps.push({
        phase: 'stun',
        actor: p,
        card: STUN_CARD,
        result: 'stun',
        damage: 0,
        heal: 0,
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

      // 누적 기력 유물(기력 N마다 기절·회복 등)은 슬롯이 끝날 때 정산한다 — 공격
      // 트레이드 계산 중간에 끼어들지 않게.
      fireEnergyTriggers()

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
