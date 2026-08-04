import { getChar, type CharacterDef, type Passive } from '../data/roster'
import { ENERGY_REGEN } from './cards'
import {
  FOG_DAMAGE,
  FOG_START_TURN,
  GRID_COLS,
  LOW_HP_FRAC,
  MOVE_DELTA,
  START_CELLS,
  STATUS_POWER_CAP,
  STATUS_TURNS,
  inBounds,
  isDot,
  isFogCell,
  type BattleSnapshot,
  type Cell,
  type CardDef,
  type StatusEffect,
  type StatusKind,
  type Step,
} from './types'

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

// 독안개·부활 스텝(연출·로그)용 가짜 카드 — 덱에는 존재하지 않음.
const FOG_CARD: CardDef = { id: 'fog', name: '독안개', kind: 'guard', desc: '가장자리를 덮는 독안개.' }
const REVIVE_CARD: CardDef = { id: 'revive', name: '잿불 부활', kind: 'guard', desc: '쓰러진 자리에서 불씨로 되살아난다.' }
const STUN_CARD: CardDef = { id: 'stun', name: '기절', kind: 'guard', desc: '기절해서 이 턴에 아무것도 못 한다.' }
const TRIGGER_CARD: CardDef = { id: 'trigger', name: '유물 발동', kind: 'guard', desc: '누적 기력이 유물을 깨웠다.' }
const STATUS_CARD: Record<'poison' | 'burn', CardDef> = {
  poison: { id: 'st-poison', name: '중독', kind: 'guard', desc: '독이 몸을 갉는다.' },
  burn: { id: 'st-burn', name: '화상', kind: 'guard', desc: '불길이 살을 태운다.' },
}
const FROZEN_CARD: CardDef = { id: 'st-frozen', name: '빙결', kind: 'guard', desc: '얼어붙어 움직일 수 없다.' }
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
  /** 걸려 있는 지속 상태이상(독·화상·빙결). 종류당 최대 1개로 합쳐 둔다. */
  status: [StatusEffect[], StatusEffect[]]
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
      status: [[], []],
      turn: 1,
      over: false,
      winner: null,
    }
  }

  /** 이 진영에 걸린 상태이상 하나(없으면 undefined). */
  statusOf(p: number, kind: StatusKind): StatusEffect | undefined {
    return this.state.status[p].find((e) => e.kind === kind)
  }

  /** 지속 상태이상이 하나라도 걸려 있는가 — `bonusVsAfflicted` 판정용. */
  afflicted(p: number): boolean {
    return this.state.status[p].length > 0
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
      // 깊은 복사 — 스냅샷은 연출용 과거 기록이라 이후 턴에 같이 변하면 안 된다
      status: [s.status[0].map((e) => ({ ...e })), s.status[1].map((e) => ({ ...e }))],
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
   * 공격 카드에 딸린 이동(`dashForward`). **facing 기준 상대 이동**이라
   * (+ 전진 / − 후퇴) 멀티에서 좌우 미러링이 필요 없다 — 절대 방향 이동 카드와
   * 달리 `faceCard`가 손댈 게 없다. 벽에 막히면 갈 수 있는 만큼만 간다.
   */
  private applyDash(p: number, forward: number) {
    const s = this.state
    const step = this.facing(p) * Math.sign(forward)
    let cur = cloneCell(s.pos[p])
    for (let k = 0; k < Math.abs(forward); k++) {
      const next: Cell = { col: cur.col + step, row: cur.row }
      if (!inBounds(next)) break
      cur = next
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

    /**
     * 상태이상을 건다. 같은 종류는 **한 칸으로 합친다** — 항목이 늘어나면 스냅샷도
     * UI도 무한정 자라고, "몇 개 걸렸나"가 아니라 "얼마나 아픈가"가 읽혀야 한다.
     * 위력은 합산(`STATUS_POWER_CAP` 상한), 지속은 더 긴 쪽으로 갱신.
     */
    const applyStatus = (p: number, kind: StatusKind, power: number, turns: number) => {
      if (turns <= 0) return
      const cur = s.status[p].find((e) => e.kind === kind)
      if (cur) {
        cur.turns = Math.max(cur.turns, turns)
        cur.power = Math.min(STATUS_POWER_CAP, cur.power + power)
        cur.since = s.turn // 다시 걸면 유예도 다시 — 계속 얼려 두면 계속 못 움직인다
      } else {
        s.status[p].push({ kind, turns, power: Math.min(STATUS_POWER_CAP, power), since: s.turn })
      }
    }

    /** 지금 걸려 있는 버프의 위력(없으면 0). */
    const buffPower = (p: number, kind: StatusKind): number => this.statusOf(p, kind)?.power ?? 0

    /**
     * 이 카드가 실제로 낼 기력. `freeCast` 버프가 걸려 있으면 **공짜**다.
     * ⚠ 엔진과 `planAffordable`(UI 선택 가능 판정)·AI 예산이 같은 규칙을 봐야 한다 —
     * 한쪽만 고치면 "낼 수 있다고 표시되는데 불발"이 난다.
     */
    const costOf = (p: number, c: CardDef): number =>
      this.statusOf(p, 'freeCast') ? 0 : baseCostOf(c)

    /** 유물 `statusPowerPct`를 **거는 순간** 한 번 반영한다(틱마다 다시 계산하지 않는다). */
    const scaledPower = (p: number, power: number): number => {
      const pct = this.passive[p].statusPowerPct ?? 0
      return pct > 0 ? Math.round(power * (1 + pct / 100)) : power
    }

    // resolve one move/guard/energy card in place
    const resolvePrep = (p: number, c: CardDef) => {
      if (c.kind === 'move') {
        // 빙결: 이동만 막는다. 카드는 그대로 소모되고 쿨다운도 돈다 — 기절(카드를
        // 통째로 못 냄)과 구별되는 지점이다.
        if (this.statusOf(p, 'frozen')) {
          emit(p, c, 'frozen')
          return
        }
        this.applyMove(p, c)
        emit(p, c, 'move')
      } else if (c.kind === 'guard') {
        const cost = costOf(p, c)
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
        const cost = costOf(p, c)
        if (s.energy[p] >= cost) {
          spend(p, cost)
          const before = s.hp[p]
          s.hp[p] = Math.min(this.maxHp[p], before + (c.healHp ?? 0))
          emit(p, c, 'heal', 0, s.hp[p] - before)
        } else {
          emit(p, c, 'nofuel')
        }
      } else if (c.kind === 'buff') {
        // 자기 강화. 수비 티어(prio 1)라 **같은 슬롯의 공격보다 먼저** 걸린다 —
        // 1번 슬롯에 버프, 2·3번에 공격을 넣으면 그 턴부터 바로 효과를 본다.
        const cost = costOf(p, c)
        if (s.energy[p] >= cost) {
          spend(p, cost)
          applyStatus(p, c.buff ?? 'atkUp', c.buffPower ?? 0, c.buffTurns ?? 1)
          emit(p, c, 'buff')
        } else {
          emit(p, c, 'nofuel')
        }
      }
    }

    // spend energy and measure one attack against the current board. Energy /
    // shield / drain effects apply immediately; HP · push are returned for the
    // caller to apply (deferred in a simultaneous trade).
    const computeAttack = (p: number, c: CardDef) => {
      const zero = {
        p,
        card: c,
        dmg: 0,
        heal: 0,
        drain: 0,
        recoil: 0,
        push: 0,
        pull: 0,
        stun: 0,
        poison: 0,
        burn: 0,
        freeze: 0,
      }
      const cost = costOf(p, c)
      if (s.energy[p] < cost) return { ...zero, result: 'nofuel' as Step['result'] }
      spend(p, cost)
      // 기력 지불 성공 시 무조건 발동: 보호막 전개(selfShield) / 반동(recoil) / 각성(empower)
      if (c.selfShield) s.shield[p] += c.selfShield
      if (c.empower) s.empowered[p] += c.empower
      // 쏘면서 움직이는 카드 — **사거리를 재기 전에** 옮긴다. 공격 페이즈라 상대가
      // 이미 이동을 끝낸 뒤이고, 빙결에도 막히지 않는다(이동 카드가 아니라 공격의
      // 일부다). 벽에 막히면 갈 수 있는 만큼만 간다.
      if (c.dashForward) this.applyDash(p, c.dashForward)
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
      // bonusVsAfflicted: 이미 상태이상에 걸린 상대를 때리면 추가 피해(상태이상 시너지).
      // 이 공격이 새로 거는 상태이상은 아직 안 걸린 것으로 본다 — 자기 자신을 조건으로
      // 삼으면 카드 한 장이 스스로 보너스를 켜 버린다.
      const synergy = this.afflicted(d) ? (atkPas.bonusVsAfflicted ?? 0) : 0
      const flat =
        (c.damage ?? 0) +
        (atkPas.attackBonus ?? 0) +
        s.empowered[p] +
        synergy +
        buffPower(p, 'atkUp') // 공격 강화 버프(N턴 한정) — empowered(영구 누적)와 별개
      const low = s.hp[p] <= this.maxHp[p] * LOW_HP_FRAC ? (atkPas.lowHpBonusPct ?? 0) : 0
      const raw = low > 0 ? Math.round(flat * (1 + low / 100)) : flat
      // EMBER (shieldBreak): a connecting hit wipes the defender's shield first.
      if (atkPas.shieldBreak) s.shield[d] = 0
      // pierce: 보호막을 소모시키지 않고 그대로 통과한다(유물 alwaysPierce도 같은 효과).
      const absorbed = c.pierce || atkPas.alwaysPierce ? 0 : Math.min(s.shield[d], raw)
      s.shield[d] -= absorbed
      // 방어 감소: 유물·패시브의 상시 damageReduction + 방어 버프(N턴 한정).
      const dmg = Math.max(
        0,
        raw - absorbed - (defPas.damageReduction ?? 0) - buffPower(d, 'defUp'),
      )
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
      // 상태이상: 기절과 같은 규칙 — **피해가 실제로 들어갔을 때만** 걸린다.
      // 가드에 완전히 막힌 타격으로는 독도 화상도 빙결도 묻지 않는다.
      // 위력 보정(statusPowerPct)은 여기서 한 번 계산해 확정한다.
      const poison = dmg > 0 ? scaledPower(p, (c.poison ?? 0) + (atkPas.poisonOnHit ?? 0)) : 0
      const burn = dmg > 0 ? scaledPower(p, (c.burn ?? 0) + (atkPas.burnOnHit ?? 0)) : 0
      const freeze = dmg > 0 ? (c.freeze ?? 0) : 0
      const result = (dmg > 0 ? 'hit' : 'blocked') as Step['result']
      return {
        ...zero,
        result,
        dmg,
        heal,
        drain,
        recoil,
        push: c.push ?? 0,
        pull: c.pull ?? 0,
        stun,
        poison,
        burn,
        freeze,
      }
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
      // 상태이상 부여도 여기서 — 동시 트레이드에서 양쪽이 같은 판을 보고 계산한 뒤
      // 함께 적용돼야 선후가 안 생긴다.
      if (r.poison) applyStatus(d, 'poison', r.poison, STATUS_TURNS.poison)
      if (r.burn) applyStatus(d, 'burn', r.burn, STATUS_TURNS.burn)
      if (r.freeze) applyStatus(d, 'frozen', 0, r.freeze)
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

    /** KO 정산 — 부활을 먼저 시도하고, 그래도 쓰러졌으면 승부를 끝낸다. */
    const settleKo = (): boolean => {
      if (s.hp[0] > 0 && s.hp[1] > 0) return false
      tryRevive(0)
      tryRevive(1)
      if (s.hp[0] > 0 && s.hp[1] > 0) return false
      s.over = true
      s.winner = koWinner()
      return true
    }

    /**
     * 지속 상태이상 정산 — 턴 종료. 독안개와 같은 규칙(보호막 무시 고정 피해).
     * 이 턴에 새로 걸린 것도 함께 틱한다: "맞자마자 타들어간다"가 읽히고, 기절처럼
     * 한 턴 미루면 지속 2턴짜리 화상이 사실상 1턴이 돼 카드가 죽는다.
     * 정산 뒤 남은 턴을 1 깎고 0이 된 것은 제거한다. 순서는 p0 → p1 고정(랜덤 없음).
     */
    const tickStatuses = () => {
      for (let p = 0; p < 2; p++) {
        for (const e of s.status[p]) {
          if (!isDot(e.kind) || e.power <= 0) continue
          const dealt = Math.min(s.hp[p], e.power)
          s.hp[p] -= dealt
          steps.push({
            phase: 'status',
            actor: p,
            card: STATUS_CARD[e.kind as 'poison' | 'burn'],
            result: 'status',
            damage: 0,
            heal: 0,
            drain: 0,
            // 자기 몸에 뜨는 피해라 독안개와 같이 recoil로 싣는다(UI가 -N을 본인에게)
            recoil: dealt,
            snapshot: this.snapshot(),
          })
        }
        // 지속피해는 방금 갉았으니, 버프는 이 턴 공격에 이미 얹혔으니(수비 티어라
        // 같은 슬롯의 공격보다 먼저 걸린다) 둘 다 이 턴을 소모한 것으로 친다.
        // **빙결만** 예외 — 걸린 턴엔 온전히 한 턴을 막지 못한다(`StatusEffect.since`).
        s.status[p] = s.status[p]
          .map((e) => (e.kind !== 'frozen' || e.since < s.turn ? { ...e, turns: e.turns - 1 } : e))
          .filter((e) => e.turns > 0)
      }
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
        // 사거리·실드·상태이상은 **같은 판에서** 잰다(트레이드의 핵심 — 먼저 맞았다고
        // 사거리가 바뀌면 안 된다). 2026-08-04에 바꾼 건 **적용 순서**뿐이다.
        const banked = here.map((e) => computeAttack(e.p, e.card))
        // 이 공격이 상대를 쓰러뜨리는가 — 적용 **전** 판 기준으로 미리 본다.
        const lethal = banked.map((r) => s.hp[1 - r.p] - r.dmg <= 0)
        const mutual = lethal[0] && lethal[1]
        /**
         * 쓰러뜨리는 쪽을 먼저 적용하고, **이미 쓰러진 쪽은 그 턴에 못 때린다**
         * (2026-08-04 신고: "적을 죽였는데 그 적이 때려서 피해를 입는다").
         * 전엔 둘을 통째로 동시 적용해서, 체력 0이 된 상대의 공격이 그대로 들어왔다.
         *
         * ⚠ **서로를 쓰러뜨리는 진짜 동시 KO만 예외**로 둘 다 적용한다. 그래야
         *   동시 KO 타이브레이크·무승부(`koWinner`)가 그대로 살아 있고, 둘 중
         *   누구를 먼저 놓느냐로 승자가 갈리는 비대칭(호스트 유리)이 안 생긴다.
         */
        const order = mutual ? [0, 1] : lethal[1] ? [1, 0] : [0, 1]
        for (const i of order) {
          const e = banked[i]
          if (!mutual && s.hp[e.p] <= 0) continue
          applyOutcome(e)
          emit(e.p, e.card, e.result, e.dmg, e.heal, e.drain, e.recoil)
        }
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

      if (settleKo()) break
    }

    // 지속 상태이상(독·화상) — 독안개보다 **먼저** 갉는다. 독안개는 무한전을 끊는
    // 최후의 장치라 마지막에 두는 게 읽기 좋다.
    if (!s.over) {
      tickStatuses()
      settleKo()
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
      settleKo()
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
/**
 * 카드가 요구하는 기력(버프·할인 미반영 원가). 종류마다 비용 필드 이름이 달라
 * 여기 한 곳에 모은다 — 엔진·`planAffordable`·AI가 **같은 값**을 봐야 한다.
 */
export function baseCostOf(c: CardDef): number {
  switch (c.kind) {
    case 'attack':
      return c.energyCost ?? 0
    case 'guard':
      return c.guardCost ?? 0
    case 'heal':
      return c.healCost ?? 0
    case 'buff':
      return c.buffCost ?? 0
    default:
      return 0
  }
}

export function planAffordable(
  plan: CardDef[],
  startEnergy: number,
  maxEnergy: number,
  extraRegen = 0,
  /** 이번 턴 시작 시점에 `freeCast` 버프가 남아 있는가(플랜 전체가 공짜가 된다). */
  freeCast = false,
): boolean {
  let e = Math.min(maxEnergy, startEnergy + ENERGY_REGEN + extraRegen)
  // 플랜 안에서 버프 카드로 freeCast를 켜면 **그 뒤 카드부터** 공짜다.
  let free = freeCast
  for (const c of plan) {
    if (c.kind === 'energy') {
      e = Math.min(maxEnergy, e + (c.gain ?? 0))
      continue
    }
    const cost = free ? 0 : baseCostOf(c)
    if (e < cost) return false
    e -= cost
    if (c.kind === 'buff' && c.buff === 'freeCast') free = true
  }
  return true
}
