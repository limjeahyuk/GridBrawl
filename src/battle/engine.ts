import { getChar, type CharacterDef, type Passive } from '../data/roster'
import { isBuff } from './types'
import { ENERGY_REGEN } from './cards'
import {
  BURN_HIT_DAMAGE,
  COLLAPSE_START_ROUND,
  FOG_DAMAGE,
  FREEZE_SHATTER_BONUS,
  GRID_COLS,
  GRID_ROWS,
  KNOCKBACK_BLOCK_DAMAGE,
  LOW_HP_FRAC,
  MOVE_DELTA,
  POISON_TICK_DAMAGE,
  START_CELLS,
  STATUS_MAX_ROUNDS,
  STATUS_STACK_CAP,
  canStand,
  collapseDamageAt,
  facingBetween,
  fogAt,
  inBounds,
  isCollapsedCell,
  isFullLock,
  isRoundLock,
  isStacking,
  rockAt,
  shadowRock,
  type BattleSnapshot,
  type Cell,
  type CardDef,
  type DamageBit,
  type FogTile,
  type Obstacle,
  type RockPlan,
  type StatusEffect,
  type StatusKind,
  type Step,
} from './types'

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

// 붕괴·부활 스텝(연출·로그)용 가짜 카드 — 덱에는 존재하지 않음.
const COLLAPSE_CARD: CardDef = { id: 'collapse', name: '붕괴', kind: 'guard', desc: '바닥이 무너져 내린다.' }
const REVIVE_CARD: CardDef = { id: 'revive', name: '잿불 부활', kind: 'guard', desc: '쓰러진 자리에서 불씨로 되살아난다.' }
const STUN_CARD: CardDef = { id: 'stun', name: '기절', kind: 'guard', desc: '기절해서 이 턴에 아무것도 못 한다.' }
const TRIGGER_CARD: CardDef = { id: 'trigger', name: '유물 발동', kind: 'guard', desc: '누적 기력이 유물을 깨웠다.' }
const POISON_CARD: CardDef = { id: 'st-poison', name: '중독', kind: 'guard', desc: '움직이자 독이 퍼진다.' }
const FOG_CARD: CardDef = { id: 'st-fog', name: '독안개', kind: 'guard', desc: '독안개가 폐를 태운다.' }
const FOG_LAY_CARD: CardDef = { id: 'fog-lay', name: '독안개', kind: 'guard', desc: '바닥에 독안개가 깔렸다.' }
const FROZEN_CARD: CardDef = { id: 'st-frozen', name: '빙결', kind: 'guard', desc: '얼어붙어 아무것도 못 한다.' }
const BIND_CARD: CardDef = { id: 'st-bind', name: '속박', kind: 'guard', desc: '발이 묶여 움직일 수 없다.' }
const ROCK_BREAK_CARD: CardDef = { id: 'rock-break', name: '바위 파괴', kind: 'guard', desc: '가로막던 바위가 부서졌다.' }
const ROCK_RAISE_CARD: CardDef = { id: 'rock-raise', name: '석벽', kind: 'guard', desc: '바닥에서 바위가 솟았다.' }
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
  /** `stunOnHit`으로 이번 전투에 기절시킨 횟수(`stunCap` 제한). */
  stunsUsed: [number, number]
  /** `freezeOnHit`으로 이번 전투에 얼린 횟수(`freezeCap` 제한). */
  freezesUsed: [number, number]
  /**
   * **힘**(카드 `empower`) — 이 전투 내내 누적되는 공격 피해 보너스. 전투가 끝나면
   * 사라진다(다음 몬스터와는 다시 0부터 — 사용자 확정 규칙).
   */
  empowered: [number, number]
  /**
   * 걸려 있는 상태이상. 중독·화상은 **겹마다 한 칸**(최대 `STATUS_STACK_CAP`),
   * 나머지는 종류당 한 칸. 라운드 한정 제약(빙결·기절·속박)은 라운드 시작에 지워진다.
   */
  status: [StatusEffect[], StatusEffect[]]
  /** 판 위의 바위(지형). 비어 있으면 지형 규칙이 통째로 no-op — PvP·봇전이 그렇다. */
  obstacles: Obstacle[]
  /** 판에 깔린 독안개. 카드가 깔고 라운드 종료마다 그 칸에 선 쪽을 갉는다. */
  fog: FogTile[]
  /** 지금 몇 **라운드**인가(1부터). 한 라운드 = 카드 3장 = 3턴. */
  round: number
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
  /**
   * 시작 셀 override(로그라이크 **랜덤 배치**, 2026-08-05). 지정한 쪽만 이 셀에서
   * 시작한다(격자 밖이면 클램프). 런에서 몬스터를 매번 다른 줄에 세워 개전을
   * 바꾸는 용도 — 미지정이면 기본 `START_CELLS`(PvP·봇전·튜토리얼 불변).
   */
  startCells?: [Cell | undefined, Cell | undefined]
  /**
   * 지형(**런 전용**, 2026-08-05). 판에 미리 세워 둘 바위. 미지정이면 빈 판이라
   * 지형 규칙이 전부 no-op이다 — PvP·봇전·튜토리얼은 여기를 절대 채우지 않는다.
   * 시작 셀과 겹치는 바위는 생성자가 버린다(파이터가 바위 위에 설 수는 없다).
   */
  obstacles?: readonly Obstacle[]
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
    // 시작 셀 — override가 있으면 격자 안으로 클램프해 쓴다(랜덤 배치).
    const startCell = (p: number): Cell => {
      const want = opts?.startCells?.[p]
      if (!want) return cloneCell(START_CELLS[p])
      return {
        col: clamp(Math.round(want.col), 0, GRID_COLS - 1),
        row: clamp(Math.round(want.row), 0, GRID_ROWS - 1),
      }
    }
    const p0 = startCell(0)
    const p1 = startCell(1)
    // 지형 — 격자 밖·중복·**파이터가 선 칸**의 바위는 버린다. 바위 위에 서 있는
    // 상태는 이동 규칙(못 들어간다)과 모순이라 아예 만들지 않는다.
    const obstacles: Obstacle[] = []
    for (const r of opts?.obstacles ?? []) {
      const cell = { col: Math.round(r.cell.col), row: Math.round(r.cell.row) }
      if (!inBounds(cell)) continue
      if (sameCell(cell, p0) || sameCell(cell, p1)) continue
      if (rockAt(obstacles, cell)) continue
      const hp = Math.max(1, Math.round(r.hp))
      obstacles.push({ cell, hp, maxHp: Math.max(hp, Math.round(r.maxHp) || hp) })
    }
    this.state = {
      pos: [p0, p1],
      hp: [startHp(0), startHp(1)],
      energy: [
        clamp(
          this.chars[0].startEnergy + (this.passive[0].startEnergyBonus ?? 0),
          0,
          this.chars[0].maxEnergy,
        ),
        clamp(
          this.chars[1].startEnergy + (this.passive[1].startEnergyBonus ?? 0),
          0,
          this.chars[1].maxEnergy,
        ),
      ],
      shield: [0, 0],
      cooldowns: [{}, {}],
      revived: [false, false],
      energySpent: [0, 0],
      energySeen: [0, 0],
      stunsUsed: [0, 0],
      freezesUsed: [0, 0],
      empowered: [0, 0],
      status: [[], []],
      obstacles,
      fog: [],
      round: 1,
      over: false,
      winner: null,
    }
  }

  /** 이 진영에 걸린 상태이상 **첫 겹**(없으면 undefined). */
  statusOf(p: number, kind: StatusKind): StatusEffect | undefined {
    return this.state.status[p].find((e) => e.kind === kind)
  }

  /** 이 종류가 몇 겹 걸려 있는가(중독·화상은 겹마다 따로 산다). */
  stacksOf(p: number, kind: StatusKind): number {
    return this.state.status[p].reduce((n, e) => (e.kind === kind ? n + 1 : n), 0)
  }

  /** 이 종류의 겹들이 한 번에 주는 피해 총합(중독=이동 1칸당, 화상=피격 1회당). */
  statusPower(p: number, kind: StatusKind): number {
    return this.state.status[p].reduce((n, e) => (e.kind === kind ? n + e.power : n), 0)
  }

  /**
   * **디버프**가 하나라도 걸려 있는가 — `bonusVsAfflicted` 판정용.
   * ⚠ 자기 버프(atkUp 등)를 세면 안 된다. 강화 카드를 쓴 상대에게 시너지 유물이
   *   터지는 건 "상태이상 시너지"가 아니다.
   */
  afflicted(p: number): boolean {
    return this.state.status[p].some((e) => !isBuff(e.kind))
  }

  /** 이 라운드에 카드를 못 내는가(빙결·기절). 슬롯 루프가 이걸 보고 건너뛴다. */
  lockedThisRound(p: number): StatusEffect | undefined {
    return this.state.status[p].find((e) => isFullLock(e.kind))
  }

  /**
   * 이 파이터가 **지금 바라보는 쪽**. + = 오른쪽(열 증가), − = 왼쪽.
   *
   * ⚠ 2026-08-05에 **자리 기준 → 위치 기준**으로 바꿨다. 전엔 `p === 0 ? 1 : -1`로
   * 좌석에 못 박혀 있어서, 대시·넉백으로 상대를 지나친 뒤에도 계속 원래 쪽을
   * 향했다. 그 결과:
   *   - 전방 전용 공격이 **상대 반대편**을 때렸다(등 뒤를 노리는 셈)
   *   - `push`가 상대를 **내 쪽으로 끌어당겼다** — 밀어내라고 만든 능력이
   *     거꾸로 붙였고, 이게 "넉백을 하다보면 이상하게 흘러간다"의 정체다
   *   - 스프라이트는 이미 `faceToward`로 상대를 보고 돌아섰으므로(2026-08-03),
   *     **보이는 방향과 실제 판정이 반대**였다
   *
   * 같은 칸이면 겨룰 기준이 없으므로 **자리 기준으로 떨어진다**(p0=오른쪽).
   * 상태에서만 유도하는 순수 함수라 랜덤이 없고, 두 피어가 같은 판을 보면 같은
   * 값을 낸다 — 멀티 락스텝은 그대로 안전하다.
   */
  facing(p: number): number {
    return facingBetween(this.state.pos[p], this.state.pos[1 - p], p)
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
      obstacles: s.obstacles.map((r) => ({ ...r, cell: cloneCell(r.cell) })),
      fog: s.fog.map((f) => ({ ...f, cell: cloneCell(f.cell) })),
    }
  }

  /** 이 칸에 독안개가 깔려 있는가 — UI가 엔진과 같은 규칙을 보도록 여기서 판다. */
  fogAt(c: Cell): FogTile | undefined {
    return fogAt(this.state.fog, c)
  }

  /** 이 칸에 바위가 서 있는가 — UI·AI가 엔진과 같은 규칙을 보도록 여기서 판다. */
  rockAt(c: Cell): Obstacle | undefined {
    return rockAt(this.state.obstacles, c)
  }

  /**
   * 이 공격이 **바위를 무시하는가**. 카드의 `pierce`와 유물 `alwaysPierce` 둘 다
   * 관통이다 — 사격선 판정·바위 피해가 모두 이 한 곳을 본다.
   */
  piercesRock(p: number, card: CardDef): boolean {
    return !!card.pierce || !!this.passive[p].alwaysPierce
  }

  /** Cells this attack covers right now, mapped from the attacker's facing. */
  targetsOf(p: number, card: CardDef): Cell[] {
    const f = this.facing(p)
    const from = this.state.pos[p]
    return (card.range ?? []).map((o) => ({ col: from.col + f * o.df, row: from.row - o.du }))
  }

  /**
   * 이동 카드 한 장. **실제로 밟은 칸 수를 돌려준다** — 중독이 "움직인 칸마다"
   * 갉으므로 호출부가 이 값을 그대로 쓴다(대시 `<<`는 2, 대각선은 1 — 사용자 확정).
   */
  private applyMove(p: number, card: CardDef): number {
    const s = this.state
    const [dc, dr] = MOVE_DELTA[card.dir ?? 'right']
    const steps = card.steps ?? 1
    let cur = cloneCell(s.pos[p])
    let moved = 0
    for (let k = 0; k < steps; k++) {
      const next: Cell = { col: cur.col + dc, row: cur.row + dr }
      // 벽과 **바위**에서 멈춘다 — 바위는 통과도 착지도 안 된다(지형 규칙 ①).
      if (!canStand(s.obstacles, next)) break
      cur = next // 상대 셀 통과·정지 모두 가능(겹침 허용)
      moved += 1
    }
    s.pos[p] = cur
    return moved
  }

  /**
   * 공격 카드에 딸린 이동(`dashForward`). **facing 기준 상대 이동**이라
   * (+ 전진 / − 후퇴) 멀티에서 좌우 미러링이 필요 없다 — 절대 방향 이동 카드와
   * 달리 `faceCard`가 손댈 게 없다. 벽에 막히면 갈 수 있는 만큼만 간다.
   */
  private applyDash(p: number, forward: number): number {
    const s = this.state
    const step = this.facing(p) * Math.sign(forward)
    let cur = cloneCell(s.pos[p])
    let moved = 0
    for (let k = 0; k < Math.abs(forward); k++) {
      const next: Cell = { col: cur.col + step, row: cur.row }
      if (!canStand(s.obstacles, next)) break // 벽·바위에 막히면 거기까지만
      cur = next
      moved += 1
    }
    s.pos[p] = cur
    return moved
  }

  /**
   * **한 라운드**(카드 3장 = 3턴)를 통째로 해소한다. 카드는 고른 슬롯 순서대로
   * (1→2→3) 나가고, 한 슬롯 안에서는 양측 카드가 종류 우선순위(이동 → 수비 →
   * 공격)로 정렬된다 — 그래서 같은 슬롯에서 움직이거나 막으면 그 슬롯의 공격을
   * 피하거나 견딜 수 있다. 같은 슬롯의 공격 둘은 트레이드로 함께 계산한다.
   * 상태를 바꾸고, 연출용 스텝 목록을 순서대로 돌려준다.
   */
  resolveRound(planA: CardDef[], planB: CardDef[]): Step[] {
    const s = this.state
    // 복사본으로 돈다 — 봉인된 슬롯을 비워 내므로 호출부의 배열을 건드리면 안 된다.
    const plans: [CardDef[], CardDef[]] = [planA.slice(), planB.slice()]
    const steps: Step[] = []

    // 동시 KO 타이브레이크용: 이 라운드가 시작될 때의 체력 비율을 기억해 둔다.
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

    // 라운드 시작: 지난 라운드의 보호막을 지운다(보호막은 **한 라운드짜리**다 — 사용자 확정).
    //
    // ⚠ 봉인(빙결·기절·속박)은 **여기서 지우지 않는다**. 라운드 종료의 `tickStatuses`가
    //   지속을 1씩 깎아 자연히 끝나므로, 기본 1라운드짜리는 걸린 라운드의 남은 슬롯만
    //   막고 사라진다(결과는 예전에 여기서 지우던 것과 같다). 다른 점은 런 전용 전설
    //   유물로 지속이 2가 됐을 때뿐이다 — 그때는 **다음 라운드까지** 이어져야 하는데,
    //   여기서 지워 버리면 그 유물이 통째로 무효가 된다.
    s.shield = [0, 0]
    for (let p = 0; p < 2; p++) {
      const pas = this.passive[p]
      const bonus = ENERGY_REGEN + (pas.turnEnergy ?? 0)
      s.energy[p] = clamp(s.energy[p] + bonus, 0, this.chars[p].maxEnergy)
      s.shield[p] += pas.turnShield ?? 0
      if (s.round === 1 && pas.openingShield) s.shield[p] += pas.openingShield
      // 지속 회복도 `healPowerPct`로 증폭된다 — 힐 카드와 같은 손잡이를 쓴다.
      if (pas.regen) {
        const heal = Math.round(pas.regen * (1 + (pas.healPowerPct ?? 0) / 100))
        s.hp[p] = Math.min(this.maxHp[p], s.hp[p] + heal)
      }
    }

    const emit = (
      actor: number,
      card: CardDef,
      result: Step['result'],
      damage = 0,
      heal = 0,
      drain = 0,
      recoil = 0,
      /** 넉백이 벽·바위에 막혔으면 밀려나던 방향(연출용 — `Step.slam` 참고). */
      slam: -1 | 1 | 0 = 0,
      /** 피해 내역(연출용 — `Step.bits` 참고). 비어 있으면 싣지 않는다. */
      bits: DamageBit[] = [],
    ) => {
      const phase: Step['phase'] =
        card.kind === 'move' ? 'move' : card.kind === 'attack' ? 'attack' : 'defense'
      steps.push({
        phase,
        actor,
        card,
        result,
        damage,
        heal,
        drain,
        recoil,
        ...(slam ? { slam } : null),
        ...(bits.length ? { bits } : null),
        snapshot: this.snapshot(),
      })
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
            // 유물 트리거 기절도 카드가 거는 기절과 같은 규칙 — 연장 유물을 탄다.
            if (t.stun) {
              const n = 1 + (this.passive[p].stunRoundBonus ?? 0)
              applyStatus(d, 'stunned', 0, n, n)
            }
            steps.push({
              phase: t.stun ? 'stun' : 'trigger',
              actor: p,
              card: { ...TRIGGER_CARD, name: t.label ?? TRIGGER_CARD.name },
              result: t.stun ? 'stun' : 'trigger',
              damage,
              heal,
              drain: 0,
              recoil: 0,
              ...(damage > 0
                ? { bits: [{ src: 'relic' as const, on: d as 0 | 1, n: damage }] }
                : null),
              snapshot: this.snapshot(),
            })
          }
        }
        s.energySeen[p] = now
      }
    }

    /**
     * 상태이상을 건다. 종류에 따라 **쌓는 방식이 다르다**:
     *   중독·화상  한 겹씩 따로 쌓인다(`STATUS_STACK_CAP`까지). 겹마다 남은 라운드가
     *              달라서 합칠 수 없다 — `중독2`+`중독1`은 이번 라운드엔 6, 다음
     *              라운드엔 3이다. 꽉 차 있으면 **가장 짧은 겹을 갱신**한다(겹 수를
     *              늘리지 않고 지속만 새로 받는다 — 계속 때리면 계속 유지된다).
     *   그 외      종류당 한 칸. 위력은 큰 쪽, 지속은 긴 쪽으로 갱신.
     */
    const applyStatus = (
      p: number,
      kind: StatusKind,
      power: number,
      rounds: number,
      /**
       * 지속 상한. 기본은 봉인 1라운드 / 중독·화상 `STATUS_MAX_ROUNDS`이고, 런 전용
       * 전설 유물(`*RoundBonus`)이 이걸 밀어 올린다. 호출부가 이미 보너스를 더한
       * `rounds`를 넘기므로 상한도 같이 넘겨야 한다 — 안 그러면 유물이 무효가 된다.
       */
      maxRounds = isRoundLock(kind) ? 1 : STATUS_MAX_ROUNDS,
    ) => {
      if (rounds <= 0) return
      const cap = Math.min(rounds, maxRounds)
      // ⚠ **봉인 재부여 가드**(2026-08-07 2차). 이미 걸려 있는 기절·빙결·속박은
      //   **다시 걸리지 않는다**. 지속 연장 유물이 없으면 아무것도 안 바뀌지만
      //   (어차피 1라운드짜리라 갱신해도 같은 값), 유물이 붙는 순간 이 한 줄이
      //   무한 봉인을 막는 유일한 장치가 된다 — 봉인된 상대를 계속 때려도 지속이
      //   새로 채워지지 않으므로 "이번 + 다음 라운드"에서 반드시 끝난다.
      //   (빙결은 맞으면 먼저 깨지므로(`thaw`) 깨진 뒤 다시 거는 건 그대로 된다.)
      if (isRoundLock(kind) && s.status[p].some((e) => e.kind === kind)) return
      if (isStacking(kind)) {
        const mine = s.status[p].filter((e) => e.kind === kind)
        if (mine.length >= STATUS_STACK_CAP) {
          // 가장 먼저 사라질 겹을 되살린다 — 중첩 상한에 닿아도 유지가 끊기지 않게.
          const shortest = mine.reduce((a, b) => (b.rounds < a.rounds ? b : a))
          shortest.rounds = Math.max(shortest.rounds, cap)
          shortest.power = Math.max(shortest.power, power)
          shortest.since = s.round
          return
        }
        s.status[p].push({ kind, rounds: cap, power, since: s.round })
        return
      }
      const cur = s.status[p].find((e) => e.kind === kind)
      if (cur) {
        cur.rounds = Math.max(cur.rounds, cap)
        cur.power = Math.max(cur.power, power)
        cur.since = s.round
      } else {
        s.status[p].push({ kind, rounds: cap, power, since: s.round })
      }
    }

    /** 지금 걸려 있는 버프의 위력(없으면 0). */
    const buffPower = (p: number, kind: StatusKind): number => this.statusOf(p, kind)?.power ?? 0

    /**
     * **중독 정산** — 이 진영이 `times`번 **행동**했다. 겹 수 × `POISON_TICK_DAMAGE`를
     * 행동마다 물린다. 보호막을 관통하고(사용자 확정) KO도 낼 수 있다.
     *
     * 행동 = **이동 1칸** + **공격 카드 1장**(2026-08-07 2차 · 사용자 요청). 처음엔
     * 이동만 셌는데, 붙어서 제자리 공격만 하는 몬스터에게 중독이 아무 일도 하지 않아
     * 궁수 정체성이 성립하지 않았다. **수비·기력·회복·강화는 안 센다** — 중독에
     * 걸리면 "버티는 것"만 공짜로 남는다는 게 이 규칙의 요점이다.
     */
    const tickPoison = (p: number, times: number) => {
      if (times <= 0) return
      const per = this.statusPower(p, 'poison')
      if (per <= 0) return
      const dealt = Math.min(s.hp[p], per * times)
      if (dealt <= 0) return
      s.hp[p] -= dealt
      steps.push({
        phase: 'status',
        actor: p,
        card: POISON_CARD,
        result: 'status',
        damage: 0,
        heal: 0,
        drain: 0,
        recoil: dealt, // 자기 몸에 뜨는 피해 — UI가 본인에게 -N을 띄운다
        bits: [{ src: 'poison', on: p as 0 | 1, n: dealt }],
        snapshot: this.snapshot(),
      })
    }

    /** 이 칸에 독안개를 깐다(이미 있으면 지속만 길게). */
    const layFog = (cell: Cell, rounds: number) => {
      if (rounds <= 0 || !inBounds(cell)) return
      const cur = fogAt(s.fog, cell)
      if (cur) cur.rounds = Math.max(cur.rounds, rounds)
      else s.fog.push({ cell: cloneCell(cell), rounds })
    }

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
        // 속박: **이동만** 막는다(공격·수비는 그대로 나간다). 카드는 소모되고
        // 쿨다운도 돈다 — 빙결·기절(카드를 통째로 못 냄)과 구별되는 지점이다.
        // 빙결·기절은 여기까지 오지 않는다: 슬롯 루프가 앞에서 걸러 낸다.
        if (this.statusOf(p, 'bind')) {
          steps.push({
            phase: 'move',
            actor: p,
            card: BIND_CARD,
            result: 'bind',
            damage: 0,
            heal: 0,
            drain: 0,
            recoil: 0,
            snapshot: this.snapshot(),
          })
          return
        }
        // 중독은 **움직인 칸마다** 갉는다 — 이동한 뒤에 정산해야 새 자리 스냅샷과
        // 피해가 같은 순간으로 읽힌다.
        const moved = this.applyMove(p, c)
        emit(p, c, 'move')
        tickPoison(p, moved)
      } else if (c.kind === 'guard') {
        const cost = costOf(p, c)
        if (s.energy[p] >= cost) {
          spend(p, cost)
          // 수비 카드 흡수량은 유물(`guardPowerPct`)로 증폭된다. 매 턴 자동
          // 보호막(`turnShield`)에는 안 붙는다 — "가드를 낸 턴"만 보상하는 훅이다.
          const boost = 1 + (this.passive[p].guardPowerPct ?? 0) / 100
          s.shield[p] += Math.round((c.block ?? 0) * boost)
          emit(p, c, 'guard')
          // 석벽 — 가드 카드가 판에 바위를 세운다(수호기사). 가드 스텝 **뒤에** 따로
          // 실어야 "방벽을 올리자 바닥에서 바위가 솟았다"로 순서대로 읽힌다.
          if (c.raiseRocks && raiseRocks(p, c.raiseRocks).length)
            steps.push({
              phase: 'rock',
              actor: p,
              card: ROCK_RAISE_CARD,
              result: 'rock',
              damage: 0,
              heal: 0,
              drain: 0,
              recoil: 0,
              snapshot: this.snapshot(),
            })
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
          const amount = Math.round(
            (c.healHp ?? 0) * (1 + (this.passive[p].healPowerPct ?? 0) / 100),
          )
          s.hp[p] = Math.min(this.maxHp[p], before + amount)
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
          // **힘**(`empower`)은 버프 카드에서도 붙는다 — 지속이 없는 영구 누적이라
          // 상태이상 목록이 아니라 `empowered`에 쌓인다(전투가 끝나면 사라진다).
          if (c.empower) s.empowered[p] += c.empower
          if (c.buff) applyStatus(p, c.buff, c.buffPower ?? 0, c.buffRounds ?? 1)
          emit(p, c, 'buff')
        } else {
          emit(p, c, 'nofuel')
        }
      }
    }

    /**
     * 이 공격이 **지금 판에서** 상대에게 닿는가.
     *
     * 밀착(같은 셀): 어떤 카드의 range도 자기 셀을 덮지 않으므로 여기서 따로
     * 판정한다. 대부분의 카드는 겹친 상대를 그대로 때리고, `pointBlank: false`인
     * "바로 옆이 사각"짜리 원거리 카드만 빗나간다.
     *
     * 같은 슬롯 트레이드에서 **밀려난 뒤 다시 겨누는 데도** 쓴다(아래 재판정).
     */
    const connectsNow = (p: number, c: CardDef): boolean => {
      const d = 1 - p
      if (sameCell(s.pos[p], s.pos[d])) return c.pointBlank !== false
      if (!this.targetsOf(p, c).some((cell) => sameCell(cell, s.pos[d]))) return false
      // 지형 ② — 사이에 바위가 끼면 사격선이 끊긴다. 관통은 그대로 뚫는다.
      if (this.piercesRock(p, c)) return true
      return !shadowRock(s.obstacles, s.pos[p], s.pos[d])
    }

    /**
     * 이 공격이 **깎아 내는 바위들**(지형 ③). 두 가지가 대상이다:
     *   ⓐ 공격이 덮은 칸에 서 있는 바위 — 범위에 들어왔으니 그대로 맞는다
     *   ⓑ 그 칸을 **가로막은** 바위 — 날아가다 바위에 부딪힌 셈이다
     * ⓑ가 있어야 사거리가 짧은 카드로도 결국 길을 뚫을 수 있다. 관통 공격은 바위를
     * 무시하므로 아무것도 깎지 않는다(뒤를 그냥 때린다).
     */
    const rocksHitBy = (p: number, c: CardDef): Obstacle[] => {
      if (!s.obstacles.length || this.piercesRock(p, c)) return []
      const from = s.pos[p]
      const out: Obstacle[] = []
      for (const cell of this.targetsOf(p, c)) {
        if (!inBounds(cell)) continue
        const r = rockAt(s.obstacles, cell) ?? shadowRock(s.obstacles, from, cell)
        if (r && !out.includes(r)) out.push(r)
      }
      return out
    }

    /**
     * 판에 바위를 세운다(`CardDef.raiseRocks`). 파이터가 선 칸·이미 바위가 있는 칸·
     * 무너진 칸은 건너뛴다 — 무너진 칸에 세워 봐야 이 턴 끝에 같이 무너진다.
     * 세워진 칸 목록을 돌려준다(빈 배열이면 아무것도 못 세운 것).
     */
    const raiseRocks = (p: number, plan: RockPlan): Cell[] => {
      const anchor = plan.where === 'flankFoe' ? s.pos[1 - p] : s.pos[p]
      // `ahead`는 내가 바라보는 쪽으로 한 칸만 세운다(좌우 두 칸이 아니다).
      const cols =
        plan.where === 'ahead'
          ? [this.facing(p) * Math.max(1, Math.round(plan.dist ?? 1))]
          : [-1, 1]
      const made: Cell[] = []
      for (const dc of cols) {
        const cell: Cell = { col: anchor.col + dc, row: anchor.row }
        if (!inBounds(cell)) continue
        if (sameCell(cell, s.pos[0]) || sameCell(cell, s.pos[1])) continue
        if (rockAt(s.obstacles, cell)) continue
        if (isCollapsedCell(cell, s.round)) continue
        const hp = Math.max(1, Math.round(plan.hp))
        s.obstacles.push({ cell, hp, maxHp: hp })
        made.push(cell)
      }
      return made
    }

    /** 바위에 피해를 주고, 부서진 것은 판에서 치운다. 부서진 수를 돌려준다. */
    const damageRocks = (actor: number, rocks: Obstacle[], amount: number): number => {
      if (amount <= 0) return 0
      let broken = 0
      for (const r of rocks) {
        r.hp -= amount
        if (r.hp > 0) continue
        broken += 1
      }
      if (!broken) return 0
      s.obstacles = s.obstacles.filter((r) => r.hp > 0)
      steps.push({
        phase: 'rock',
        actor,
        card: ROCK_BREAK_CARD,
        result: 'rock',
        damage: 0,
        heal: 0,
        drain: 0,
        recoil: 0,
        snapshot: this.snapshot(),
      })
      return broken
    }

    // spend energy and measure one attack against the current board. Energy /
    // shield / drain effects apply immediately; HP · push are returned for the
    // caller to apply (deferred in a simultaneous trade).
    const computeAttack = (p: number, c: CardDef) => {
      const zero = {
        p,
        card: c,
        /** 최종 피해(보호막·경감을 통과한 몫 + 화상·빙결파쇄 추가피해). */
        dmg: 0,
        /**
         * **보호막·경감을 실제로 뚫은 몫.** 화상·빙결 파쇄는 보호막을 관통하므로
         * `dmg`에는 들어가지만 여기엔 안 들어간다 — 흡혈·기절·상태이상 부여는
         * "가드로 막힌 타격으론 안 걸린다"는 기존 규칙을 지켜야 하므로 이 값을 본다.
         */
        core: 0,
        /** `dmg` 안에서 **화상**이 얹은 몫(연출용 내역 — `Step.bits`). */
        burnAdd: 0,
        /** `dmg` 안에서 **빙결 파쇄**가 얹은 몫(연출용 내역 — `Step.bits`). */
        shatterAdd: 0,
        heal: 0,
        drain: 0,
        recoil: 0,
        push: 0,
        pull: 0,
        stun: 0,
        bind: 0,
        /** 중독 — 거는 겹의 지속 라운드(0이면 안 건다). */
        poison: 0,
        /** 그 겹이 이동 1칸당 주는 피해(`statusPowerPct` 반영 후). */
        poisonPow: 0,
        burn: 0,
        burnPow: 0,
        freeze: 0,
        /** 이 타격이 상대의 빙결을 깨뜨렸는가 — 깨면 그 자리에서 빙결이 사라진다. */
        thaw: false,
        /** 상대가 선 칸에 깔 독안개의 지속 라운드. */
        fog: 0,
        rocks: [] as Obstacle[],
        rockDmg: 0,
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
      // 중독 — **공격도 행동이다**(2026-08-07 2차). 기력을 낸 시점에 한 번 물린다:
      // 빗나가도 휘두른 건 휘두른 것이고, 기력이 모자라 불발(`nofuel`)이면 위에서 이미
      // 돌아갔으므로 여기 오지 않는다. 이동공격은 **거기에 더해** 움직인 칸만큼 더 문다.
      tickPoison(p, 1)
      if (c.dashForward) tickPoison(p, this.applyDash(p, c.dashForward))
      // ⚠ 공격 카드의 바위는 여기서 세우지 않는다 — `settleAttack`이 **넉백 뒤에**
      //   세운다. 지형 카드는 "밀어내고 그 자리에 바위를 세운다"가 요점이라, 여기서
      //   세우면 상대가 아직 그 칸에 서 있어서 `raiseRocks`가 건너뛰고 만다.
      //   (가드 카드의 석벽은 넉백이 없으므로 지금처럼 가드 스텝 직후에 세운다.)
      const recoil = c.recoil ?? 0
      const d = 1 - p
      const atkPas = this.passive[p]
      // 바위 피해는 **빗나가도 들어간다** — 바위가 가로막아 빗나간 것이 흔한 경우라,
      // 여기서 안 깎으면 "바위 뒤 상대를 노렸는데 아무 일도 안 일어난다"가 된다.
      // 저체력·처형 배율과 상태이상 시너지는 얹지 않는다(바위는 지형이다).
      const rocks = rocksHitBy(p, c)
      const rockDmg = rocks.length
        ? Math.max(
            0,
            (c.damage ?? 0) + (atkPas.attackBonus ?? 0) + s.empowered[p] + buffPower(p, 'atkUp'),
          )
        : 0
      if (!connectsNow(p, c))
        return { ...zero, recoil, rocks, rockDmg, result: 'whiff' as Step['result'] }
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
      // 처형(executeBonusPct, 2026-08-05): **상대가** 반피 이하면 배율. lowHpBonusPct의
      // 거울상이라 같은 자리에서 합산한다 — 둘 다 켜지면 곱이 아니라 합(폭주 방지).
      const exec =
        s.hp[d] <= this.maxHp[d] * LOW_HP_FRAC ? (atkPas.executeBonusPct ?? 0) : 0
      const pct = low + exec
      const raw = pct > 0 ? Math.round(flat * (1 + pct / 100)) : flat
      // shieldBreak: a connecting hit wipes the defender's shield first.
      if (atkPas.shieldBreak || c.shatter) s.shield[d] = 0
      // pierce: 보호막을 소모시키지 않고 그대로 통과한다(유물 alwaysPierce도 같은 효과).
      const absorbed = c.pierce || atkPas.alwaysPierce ? 0 : Math.min(s.shield[d], raw)
      s.shield[d] -= absorbed
      // 방어 감소: 유물·패시브의 상시 damageReduction + 방어 버프(N라운드 한정).
      const core = Math.max(
        0,
        raw - absorbed - (defPas.damageReduction ?? 0) - buffPower(d, 'defUp'),
      )
      // **화상** — 걸린 겹마다 이 타격에 `BURN_HIT_DAMAGE`가 얹힌다(사용자 확정).
      // 지속피해가 아니라 **증폭기**다: 화상 상태로 세 대 맞으면 세 번 다 더 아프다.
      // ⚠ 보호막·경감을 **관통한다**("보호막이 막을 수 없는 데미지") — 그래서
      //   `core`가 아니라 그 밖에서 더한다. 가드로 완전히 막아도 화상은 들어온다.
      const burnBonus = this.statusPower(d, 'burn')
      // **빙결 파쇄** — 얼어 있는 상대를 때리면 그 자리에서 녹고(움직일 수 있게 되고)
      // 그 타격에 `FREEZE_SHATTER_BONUS`가 얹힌다. 얼려 놓고 안 때리면 상대는
      // 라운드 내내 못 움직이지만, 때리는 순간 그 봉인은 끝난다 — 그게 교환이다.
      const thaw = !!this.statusOf(d, 'frozen')
      const dmg = core + burnBonus + (thaw ? FREEZE_SHATTER_BONUS : 0)
      // drain: 적중하면(가드로 막혀도) 상대 기력을 빼앗아 흡수.
      let drain = 0
      if (c.drain) {
        drain = Math.min(s.energy[d], c.drain)
        s.energy[d] -= drain
        s.energy[p] = clamp(s.energy[p] + drain, 0, this.chars[p].maxEnergy)
      }
      // 회복: 카드 흡혈(leech) + 패시브 흡혈(lifesteal 고정치), 피해가 들어갔을 때만.
      // ⚠ 기준은 `core`다 — 화상·빙결 파쇄로 얹힌 관통 피해로는 흡혈이 돌지 않는다.
      let heal = 0
      if (core > 0) {
        heal += c.leech ?? 0
        heal += atkPas.lifesteal ?? 0 // 패시브 + 송곳니류 유물
      }
      // 기절: 카드의 `stun` + 유물 `stunOnHit`(전투당 `stunCap`회). 보호막을 실제로
      // 뚫었을 때만 — 가드에 막힌 타격으로는 기절하지 않는다.
      // 값은 "몇 라운드"가 아니라 **이번 라운드 봉인**이라는 표시일 뿐이다.
      let stun = core > 0 ? (c.stun ?? 0) : 0
      const onHit = atkPas.stunOnHit ?? 0
      if (core > 0 && onHit > 0 && s.stunsUsed[p] < (atkPas.stunCap ?? 1)) {
        s.stunsUsed[p] += 1
        stun += onHit
      }
      // 상태이상 부여도 같은 규칙 — 가드에 완전히 막힌 타격으로는 아무것도 안 묻는다.
      // 카드와 유물이 둘 다 걸면 **지속이 긴 쪽**을 쓴다(겹이 두 번 붙지는 않는다 —
      // 한 대에 한 겹이 이 규칙의 골자라, 유물 하나로 두 겹이 되면 안 된다).
      // 지속은 **런 전용 전설 유물**(`*RoundBonus`)만큼 늘어난다. 유물이 없으면 0이라
      // 예전과 완전히 같다 — PvP·봇전에는 이 훅이 존재조차 하지 않는다.
      const poisonBase = core > 0 ? Math.max(c.poison ?? 0, atkPas.poisonOnHit ?? 0) : 0
      const burnBase = core > 0 ? Math.max(c.burn ?? 0, atkPas.burnOnHit ?? 0) : 0
      const poisonPlus = atkPas.poisonRoundBonus ?? 0
      const burnPlus = atkPas.burnRoundBonus ?? 0
      const poison = poisonBase > 0 ? poisonBase + poisonPlus : 0
      const burn = burnBase > 0 ? burnBase + burnPlus : 0
      // 빙결 부여 유물(freezeOnHit) — 기절과 같은 구조로 **전투당 freezeCap회**까지만.
      let freeze = core > 0 ? (c.freeze ?? 0) : 0
      const onFreeze = atkPas.freezeOnHit ?? 0
      if (core > 0 && onFreeze > 0 && s.freezesUsed[p] < (atkPas.freezeCap ?? 2)) {
        s.freezesUsed[p] += 1
        freeze += onFreeze
      }
      const result = (dmg > 0 ? 'hit' : 'blocked') as Step['result']
      return {
        ...zero,
        result,
        dmg,
        core,
        burnAdd: burnBonus,
        shatterAdd: thaw ? FREEZE_SHATTER_BONUS : 0,
        heal,
        drain,
        recoil,
        push: c.push ?? 0,
        pull: c.pull ?? 0,
        // 봉인 지속 = 1 + 유물 연장(`stunRoundBonus` 등). 1이면 이번 라운드만이고,
        // 2 이상이면 다음 라운드까지 이어진다(재부여 가드가 그 이상을 막는다).
        stun: stun > 0 ? 1 + (atkPas.stunRoundBonus ?? 0) : 0,
        bind: core > 0 && c.bind ? 1 + (atkPas.bindRoundBonus ?? 0) : 0,
        poison,
        // 겹의 위력(이동 1칸당 / 피격 1회당)은 **거는 순간** 확정한다 — 유물을
        // 나중에 얻어도 이미 걸린 겹까지 소급되지 않게.
        poisonPow: scaledPower(p, POISON_TICK_DAMAGE),
        burn,
        burnPow: scaledPower(p, BURN_HIT_DAMAGE),
        freeze: freeze > 0 ? 1 + (atkPas.freezeRoundBonus ?? 0) : 0,
        thaw,
        fog: core > 0 ? (c.fog ?? 0) : 0,
        rocks,
        rockDmg,
      }
    }

    // 넉백/끌어당김: 공격자가 바라보는 방향(pull은 반대)으로 상대를 옮긴다.
    // 벽에서만 멈추고 겹침은 허용.
    // ⚠ `facing`이 **위치 기준**이 된 뒤로(2026-08-05) 이건 언제나 "나에게서 멀어지는
    //   쪽"이다. 좌석 기준이던 시절엔 상대를 지나친 순간 넉백이 상대를 **내 쪽으로
    //   끌어당겼다** — 밀어내라고 만든 능력이 정반대로 작동했다.
    //
    // **처박기**(2026-08-07 사용자 확정 — 벽 포함 · **부분 차단도 기절**):
    // 밀려날 곳이 막혀 있으면(판 가장자리든 바위든) 넉백은 그냥 없던 일이 되는 게
    // 아니라 **벽에 부딪힌다** — 못 밀린 칸 수 × `KNOCKBACK_BLOCK_DAMAGE` 피해 + 그
    // 라운드 기절.
    //   예) 넉백3인데 바로 뒤가 판 끝 → 3칸 다 막힘 → 15 피해 + 기절
    //       넉백3인데 두 칸 밀리고 막힘 → 1칸 막힘 → **5 피해 + 기절**(사용자 예시)
    // ⚠ 2026-08-05까지는 **바위만** 처박기 대상이었고, 2026-08-07 1차에선 벽을 넣되
    //   기절을 "0칸일 때만"으로 좁혔다(구석에 몰린 상대를 매 라운드 기절시키는 좌석
    //   운을 피하려고). 사용자 예시가 **부분 차단에도 기절**을 명시해 그 안전판을
    //   걷어냈다 — 이제 벽을 등지고 싸우는 것 자체가 큰 위험이다.
    // 돌려주는 값: 실제로 밀려난 칸 수, 막혀서 못 간 칸 수, 그리고 **밀려나던 방향**
    // (`dir`, 정규 좌표 ±1). `dir`은 룰에 안 쓰이고 `Step.slam`으로 UI에만 간다 —
    // 처박힌 연출을 **어느 쪽 벽/바위에서** 터뜨릴지 정하는 값이다.
    const applyShove = (
      attacker: number,
      n: number,
      toward: boolean,
    ): { moved: number; blocked: number; dir: -1 | 1 } => {
      const d = 1 - attacker
      const f = this.facing(attacker) * (toward ? -1 : 1)
      let moved = 0
      for (let k = 0; k < n; k++) {
        const next: Cell = { col: s.pos[d].col + f, row: s.pos[d].row }
        if (next.col < 0 || next.col >= GRID_COLS) break
        if (rockAt(s.obstacles, next)) break
        s.pos[d] = next
        moved += 1
      }
      return { moved, blocked: n - moved, dir: f > 0 ? 1 : -1 }
    }

    // apply a measured attack's HP / board consequences
    const applyOutcome = (r: ReturnType<typeof computeAttack>) => {
      const d = 1 - r.p
      // ⚠ 아래 `*Dealt`는 전부 **실제로 깎인 몫**이다(체력이 모자라면 거기서 멈춘다).
      //   연출 전용 값이라 판에는 영향이 없지만, 화면의 숫자 합이 줄어든 체력과
      //   어긋나면 그게 곧 원래 신고("무슨 데미지가 들어갔는지 모르겠다")가 된다.
      const dmgDealt = Math.min(s.hp[d], r.dmg)
      s.hp[d] = Math.max(0, s.hp[d] - r.dmg)
      // thorns(유물): 피해를 실제로 입은 방어자가 공격자에게 N 반사
      const thorns = this.passive[d].thorns ?? 0
      let thornsDealt = 0
      if (r.core > 0 && thorns) {
        thornsDealt = Math.min(s.hp[r.p], thorns)
        s.hp[r.p] = Math.max(0, s.hp[r.p] - thorns)
      }
      const recoilDealt = r.recoil ? Math.min(s.hp[r.p], r.recoil) : 0
      if (r.recoil) s.hp[r.p] = Math.max(0, s.hp[r.p] - r.recoil)
      if (r.heal) s.hp[r.p] = Math.min(this.maxHp[r.p], s.hp[r.p] + r.heal)
      // 강제 이동 — 막히면 못 간 칸만큼 벽에 부딪힌다(피해 + 기절).
      // ⚠ **밀려난 칸도 중독이 센다**(2026-08-07 사용자 확정). 1차에선 "내가 낸 카드가
      //   아니다"를 이유로 뺐는데, 사용자 예시가 넉백 2칸 = 중독 6을 명시했다 — 즉
      //   중독은 **어떻게든 몸이 옮겨졌으면** 아프다. 실제 피해는 `settleAttack`이
      //   공격 스텝 뒤에 물린다(밀려나는 연출보다 먼저 숫자가 뜨면 안 읽힌다).
      let moved = 0
      let blocked = 0
      // 처박힌 방향(연출용) — 마지막으로 **막힌** 밀어내기의 방향을 쓴다.
      let slamDir: -1 | 1 | 0 = 0
      if (r.push) {
        const k = applyShove(r.p, r.push, false)
        moved += k.moved
        blocked += k.blocked
        if (k.blocked > 0) slamDir = k.dir
      }
      if (r.pull) {
        const k = applyShove(r.p, r.pull, true)
        moved += k.moved
        blocked += k.blocked
        if (k.blocked > 0) slamDir = k.dir
      }
      // **한 칸이라도 막히면 기절**한다(사용자 예시: 3칸 중 2칸만 밀려도 기절).
      const slammed = blocked > 0
      // 처박기 피해도 실제로 깎인 몫을 기억해 둔다 — `Step.damage`에는 안 실리는
      // 값이라(넉백은 `computeAttack`이 잰 `dmg` 밖에서 일어난다) 이게 없으면
      // 화면의 숫자보다 체력이 더 줄어든다.
      const slamDealt = blocked > 0 ? Math.min(s.hp[d], blocked * KNOCKBACK_BLOCK_DAMAGE) : 0
      if (blocked > 0) s.hp[d] = Math.max(0, s.hp[d] - blocked * KNOCKBACK_BLOCK_DAMAGE)
      // 라운드 한정 봉인. 지금 슬롯 이후의 카드를 막고, 라운드가 끝나면 지워진다.
      // 처박기 기절은 **연장 유물을 안 탄다** — 넉백 자체가 이미 피해+봉인 둘을 주는
      // 자리라, 여기까지 늘리면 밀어내기 카드 하나가 통째로 판을 잠근다.
      if (slammed) applyStatus(d, 'stunned', 0, 1)
      else if (r.stun) applyStatus(d, 'stunned', 0, r.stun, r.stun)
      if (r.bind) applyStatus(d, 'bind', 0, r.bind, r.bind)
      // 빙결은 **깨진 뒤에** 다시 걸릴 수 있다 — 순서가 뒤바뀌면 방금 얼린 걸
      // 같은 타격이 도로 녹인다.
      if (r.thaw) s.status[d] = s.status[d].filter((e) => e.kind !== 'frozen')
      if (r.freeze) applyStatus(d, 'frozen', 0, r.freeze, r.freeze)
      // 중독·화상 — 동시 트레이드에서 양쪽이 같은 판을 보고 계산한 뒤 함께 적용돼야
      // 선후가 안 생긴다.
      if (r.poison) applyStatus(d, 'poison', r.poisonPow, r.poison, Math.max(STATUS_MAX_ROUNDS, r.poison))
      if (r.burn) applyStatus(d, 'burn', r.burnPow, r.burn, Math.max(STATUS_MAX_ROUNDS, r.burn))
      if (r.fog) layFog(s.pos[d], r.fog)
      return { moved, slam: slamDir, dmgDealt, slamDealt, thornsDealt, recoilDealt }
    }

    /**
     * 공격 하나를 판에 반영하고 화면에 싣는다. **순서가 중요하다** — 바위가 부서지는
     * 스텝은 그 공격 스텝 **뒤에** 와야 "때렸다 → 바위가 깨졌다"로 읽힌다.
     * 부딪힌 바위는 상대에게 빗나갔어도 깎인다(지형 ③ — 대개 그 바위가 막은 것이다).
     */
    const settleAttack = (r: ReturnType<typeof computeAttack>) => {
      const { moved: shoved, slam, dmgDealt, slamDealt, thornsDealt, recoilDealt } =
        applyOutcome(r)
      // 피해 내역 — 화면이 "왜 이만큼 깎였는지"를 한 줄씩 적을 수 있게(연출 전용).
      // ⚠ 여기 적는 합은 이 스텝에서 **실제로 깎인 체력과 같아야** 한다.
      const d = (1 - r.p) as 0 | 1
      const p = r.p as 0 | 1
      const bits: DamageBit[] = []
      const bit = (src: DamageBit['src'], on: 0 | 1, n: number) => {
        if (n > 0) bits.push({ src, on, n })
      }
      // 타격 본체 = 최종 피해에서 화상·파쇄 몫을 뺀 것(= 보호막·경감을 뚫은 core).
      // ⚠ 쓰러지면서 잘린 경우(`dmgDealt < r.dmg`)에는 **앞에서부터 채운다** —
      //   비율로 나누면 정수가 안 떨어져 합이 어긋난다.
      let left = dmgDealt
      const take = (n: number) => {
        const x = Math.max(0, Math.min(left, n))
        left -= x
        return x
      }
      bit('attack', d, take(r.dmg - r.burnAdd - r.shatterAdd))
      bit('burn', d, take(r.burnAdd))
      bit('shatter', d, take(r.shatterAdd))
      bit('slam', d, slamDealt)
      bit('thorns', p, thornsDealt)
      bit('recoil', p, recoilDealt)
      emit(r.p, r.card, r.result, r.dmg, r.heal, r.drain, r.recoil, slam, bits)
      // 넉백으로 옮겨진 칸도 중독이 문다 — 공격 스텝 **뒤에** 실어야
      // "밀려났다 → 독이 퍼졌다"로 순서대로 읽힌다.
      tickPoison(1 - r.p, shoved)
      if (r.rocks.length) damageRocks(r.p, r.rocks, r.rockDmg)
      // 지형 카드가 세우는 바위 — **넉백이 끝난 뒤**다(전사 「돌기둥 세우기」·마법사
      // 「석순 소환」). 그래야 "밀어내고 그 자리를 막는다"가 실제로 성립한다: 상대가
      // 아직 그 칸이면 `raiseRocks`가 건너뛰므로, **밀어내지 못하면 못 세운다**가
      // 그대로 규칙이 된다(벽에 처박혀 기절한 대신 길은 안 막힌다).
      // ⚠ 기력이 모자라 불발(`nofuel`)이면 아무 대가도 안 치렀으므로 세우지 않는다.
      if (r.card.raiseRocks && r.result !== 'nofuel' && raiseRocks(r.p, r.card.raiseRocks).length)
        steps.push({
          phase: 'rock',
          actor: r.p,
          card: ROCK_RAISE_CARD,
          result: 'rock',
          damage: 0,
          heal: 0,
          drain: 0,
          recoil: 0,
          snapshot: this.snapshot(),
        })
      // 안개는 공격 스텝 **뒤에** 실어야 "맞았다 → 그 자리에 안개가 깔렸다"로 읽힌다.
      if (r.fog)
        steps.push({
          phase: 'rock',
          actor: r.p,
          card: FOG_LAY_CARD,
          result: 'fog',
          damage: 0,
          heal: 0,
          drain: 0,
          recoil: 0,
          snapshot: this.snapshot(),
        })
    }

    // 부활(영원의 불씨 등): KO 직후, 아직 안 썼다면 한 번 되살아난다.
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
     * 라운드 종료 정산 — 남은 지속을 1 깎고 0이 된 겹을 치운다.
     *
     * ⚠ 2026-08-07부터 **여기서 피해를 주지 않는다.** 중독은 행동할 때(`tickPoison`),
     *   화상은 맞을 때(`computeAttack`의 `burnBonus`) 이미 정산됐다 — 예전처럼
     *   라운드 종료에 또 갉으면 같은 상태이상을 두 번 받는 셈이 된다.
     *   라운드 종료에 갉는 건 이제 **독안개와 전장 붕괴**(자리 값)뿐이다.
     *
     * 라운드 한정 제약(빙결·기절·속박)은 어차피 다음 라운드 시작에 통째로 지워지므로
     * 여기서 따로 볼 게 없다. 순서는 p0 → p1 고정(랜덤 없음).
     */
    const tickStatuses = () => {
      for (let p = 0; p < 2; p++) {
        s.status[p] = s.status[p]
          .map((e) => ({ ...e, rounds: e.rounds - 1 }))
          .filter((e) => e.rounds > 0)
      }
    }

    /** 독안개 — 라운드 종료에 그 칸에 선 쪽을 갉는다(보호막 무시). 그다음 한 라운드 걷힌다. */
    const tickFog = () => {
      if (!s.fog.length) return
      for (let p = 0; p < 2; p++) {
        if (!fogAt(s.fog, s.pos[p])) continue
        const dealt = Math.min(s.hp[p], FOG_DAMAGE)
        if (dealt <= 0) continue
        s.hp[p] -= dealt
        steps.push({
          phase: 'status',
          actor: p,
          card: FOG_CARD,
          result: 'status',
          damage: 0,
          heal: 0,
          drain: 0,
          recoil: dealt, // 자기 몸에 뜨는 피해 — UI가 본인에게 -N을 띄운다
          bits: [{ src: 'fog', on: p as 0 | 1, n: dealt }],
          snapshot: this.snapshot(),
        })
      }
      s.fog = s.fog.map((f) => ({ ...f, rounds: f.rounds - 1 })).filter((f) => f.rounds > 0)
    }

    const prio = (c: CardDef) => (c.kind === 'move' ? 0 : c.kind === 'attack' ? 2 : 1)

    for (let slot = 0; slot < 3; slot++) {
      // 이 슬롯에서 나온 스텝의 시작점 — 아래에서 `Step.slot`을 통째로 찍는다.
      // 스텝을 쌓는 곳이 열 군데가 넘어서 하나하나 적으면 새 스텝을 더할 때마다
      // 빠뜨리게 된다(연출 전용 값이라 빠져도 조용히 틀린다).
      const slotFrom = steps.length
      // cards present this slot, ordered move < defense < attack (p0 first on a tie)
      // ⚠ **빙결·기절은 여기서 걸러 낸다** — 이번 라운드에 봉인된 쪽은 남은 슬롯의
      //   카드를 통째로 못 낸다(카드는 소모되지 않고 쿨다운도 안 돈다: 애초에 낸
      //   적이 없다). 봉인은 슬롯 도중에 걸리므로 **슬롯마다 다시 본다** —
      //   1번 슬롯에서 기절하면 2·3번이 막히고, 3번에서 걸리면 아무것도 안 막힌다.
      for (let p = 0; p < 2; p++) {
        const lock = plans[p][slot] ? this.lockedThisRound(p) : undefined
        if (!lock) continue
        plans[p][slot] = undefined as unknown as CardDef
        steps.push({
          phase: 'stun',
          actor: p,
          card: lock.kind === 'frozen' ? FROZEN_CARD : STUN_CARD,
          result: lock.kind === 'frozen' ? 'frozen' : 'stun',
          damage: 0,
          heal: 0,
          drain: 0,
          recoil: 0,
          snapshot: this.snapshot(),
        })
      }
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
        /**
         * **넉백 재판정**(2026-08-05 신고: "밀려났는데 밀리기 전 자리에서 때린다").
         *
         * 전엔 밀어내기가 같은 슬롯 안에서 **아무 일도 하지 않았다** — 둘 다 밀리기
         * 전 판으로 계산해 두었으니, 상대를 두 칸 밀어내도 그 상대의 주먹은 원래
         * 자리에서 그대로 들어왔다. 밀어내라고 만든 능력이 같은 슬롯에선 무의미했다.
         *
         * 이제 **한쪽만 상대를 밀어낼 때** 미는 쪽을 먼저 적용하고, 밀려난 쪽의
         * 공격은 **새 자리에서 다시 겨눈다**. 닿지 않으면 헛친다.
         *   - 피해·보호막·상태이상 수치는 여전히 **밀리기 전 같은 판**에서 잰 값이다
         *     (트레이드의 핵심 — 먼저 맞았다고 위력이 깎이면 안 된다). 바뀌는 건
         *     **닿느냐 마느냐** 하나뿐이다.
         *   - 서로를 밀어내면 **대칭이라 재판정하지 않는다**. 누구를 먼저 놓느냐로
         *     결과가 갈리면 호스트가 유리해진다.
         *   - 기력·보호막 전개·기력 흡수·이동공격은 카드를 낸 대가로 **이미 치러진**
         *     것이라 되돌리지 않는다(`computeAttack`이 즉시 적용한다).
         * KO 순서가 먼저다 — 쓰러뜨리는 쪽은 언제나 앞선다.
         */
        const shoves = banked.map((r) => (r.push ?? 0) + (r.pull ?? 0) > 0)
        // 서로 밀어내면 대칭이라 재판정하지 않는다(순서로 승부가 갈리면 안 된다).
        const crossShove = shoves[0] && shoves[1]
        const order = mutual
          ? [0, 1]
          : lethal[1]
            ? [1, 0]
            : lethal[0]
              ? [0, 1]
              : shoves[1] && !shoves[0]
                ? [1, 0]
                : [0, 1]
        /** 이 슬롯에서 밀려난 진영 — 다음 공격을 새 자리에서 다시 겨눈다. */
        const shoved = new Set<number>()
        for (const i of order) {
          const e = banked[i]
          if (!mutual && s.hp[e.p] <= 0) continue
          if (!crossShove && shoved.has(e.p) && !connectsNow(e.p, e.card)) {
            // 밀려나서 빗나갔다 — 피해·넉백·상태이상이 전부 사라지고 반동만 남는다.
            // ⚠ **바위 피해는 그대로 남긴다** — 빗나간 건 상대가 자리를 뜬 탓이고,
            //   공격이 덮은 칸(따라서 부딪힌 바위)은 공격자 자리 기준이라 그대로다.
            const miss = { ...e, result: 'whiff' as Step['result'] }
            // ⚠ `burnAdd`·`shatterAdd`는 **`dmg`의 내역**이라 같이 0으로 내린다
            //   (연출용 값 — 안 내리면 화면이 안 들어간 피해를 적는다).
            for (const k of [
              'dmg', 'heal', 'push', 'pull', 'stun', 'poison', 'burn', 'freeze',
              'burnAdd', 'shatterAdd',
            ] as const)
              miss[k] = 0
            settleAttack(miss)
            continue
          }
          settleAttack(e)
          if ((e.push ?? 0) + (e.pull ?? 0) > 0) shoved.add(1 - e.p)
        }
      } else {
        for (const e of here) {
          if (e.card.kind === 'attack') {
            settleAttack(computeAttack(e.p, e.card))
          } else {
            resolvePrep(e.p, e.card)
          }
        }
      }

      // 누적 기력 유물(기력 N마다 기절·회복 등)은 슬롯이 끝날 때 정산한다 — 공격
      // 트레이드 계산 중간에 끼어들지 않게.
      fireEnergyTriggers()

      // ⚠ `break`보다 **먼저** 찍는다 — 마지막 슬롯이 KO로 끊겨도 그 스텝들은
      //   화면에서 재생되므로 슬롯 번호가 있어야 한다.
      for (let i = slotFrom; i < steps.length; i++) steps[i].slot = slot as 0 | 1 | 2

      if (settleKo()) break
    }

    // 독안개 — 붕괴보다 **먼저** 갉는다. 붕괴는 무한전을 끊는 최후의 장치라
    // 마지막에 두는 게 읽기 좋다. 그다음 남은 지속을 한 라운드 깎는다.
    if (!s.over) {
      tickFog()
      settleKo()
    }
    tickStatuses()

    // 전장 붕괴: COLLAPSE_START_ROUND부터, 라운드 종료 시 무너진 칸에 서 있으면 피해.
    // 실드는 무시하지만 유물의 `collapseResist`만큼은 줄어든다(발판 유물).
    // (자기 피해이므로 Step.recoil로 전달 — UI가 본인 몸에 -N을 띄운다)
    if (!s.over && s.round >= COLLAPSE_START_ROUND) {
      // 무너진 칸의 **바위도 같이 무너진다**. 남겨 두면 판이 좁아지는 속도에 지형이
      // 곱해져, 마지막 단계에서 "무너진 칸에도 들어갈 수 있다"는 안전판(붕괴 설계의
      // 핵심)이 바위 때문에 사라진다 — 밀려날 곳도 도망칠 곳도 없는 판이 된다.
      s.obstacles = s.obstacles.filter((r) => !isCollapsedCell(r.cell, s.round))
      // 안개도 같은 이유로 무너진 칸에서는 사라진다(그 칸 자체가 없어진다).
      s.fog = s.fog.filter((f) => !isCollapsedCell(f.cell, s.round))
      const base = collapseDamageAt(s.round)
      for (let p = 0; p < 2; p++) {
        if (!isCollapsedCell(s.pos[p], s.round)) continue
        const dmg = Math.max(0, base - (this.passive[p].collapseResist ?? 0))
        if (dmg <= 0) continue
        const dealt = Math.min(s.hp[p], dmg)
        s.hp[p] = Math.max(0, s.hp[p] - dmg)
        steps.push({
          phase: 'collapse',
          actor: p,
          card: COLLAPSE_CARD,
          result: 'collapse',
          damage: 0,
          heal: 0,
          drain: 0,
          recoil: dmg,
          bits: [{ src: 'collapse', on: p as 0 | 1, n: dealt }],
          snapshot: this.snapshot(),
        })
      }
      settleKo()
    }

    // 라운드 종료: 쿨다운을 한 칸 돌리고, 이 라운드에 **실제로 낸** 카드를 잠근다
    // (봉인돼 못 낸 슬롯은 비어 있으므로 쿨다운도 안 돈다).
    for (let p = 0; p < 2; p++) {
      const cds = s.cooldowns[p]
      for (const id of Object.keys(cds)) cds[id] = Math.max(0, cds[id] - 1)
      for (const c of plans[p]) {
        if ((c?.cooldown ?? 0) >= 1) cds[c.id] = c.cooldown as number
      }
    }

    if (!s.over) s.round += 1
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
