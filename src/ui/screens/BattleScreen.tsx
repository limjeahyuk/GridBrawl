import { useEffect, useMemo, useRef, useState } from 'react'
import { getChar } from '../../data/roster'
import { buildFighterSvg } from '../../art/art'
import { CardBattle, planAffordable } from '../../battle/engine'
import { decideAI } from '../../battle/ai'
import { deckFor, ENERGY_REGEN } from '../../battle/cards'
import {
  GRID_COLS,
  GRID_ROWS,
  type ActionResult,
  type Cell,
  type CardDef,
  type Difficulty,
  type Step,
} from '../../battle/types'

export interface BattleOpponent {
  charId: string
  difficulty: Difficulty
}

interface Fx {
  kind: string
  result: ActionResult
}
interface View {
  pos: [Cell, Cell]
  hp: [number, number]
  energy: [number, number]
  shield: [number, number]
  acting: [boolean, boolean] // attack lunge
  damage: [number, number]
  heal: [number, number]
  fx: [Fx | null, Fx | null]
  say: [string, string]
}

const cellX = (col: number) => ((col + 0.5) / GRID_COLS) * 100
const cellY = (row: number) => ((row + 0.5) / GRID_ROWS) * 100
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Board cells an attack covers, from the attacker's cell and facing (+1 / -1). */
function attackCells(from: Cell, card: CardDef, facing: number): Cell[] {
  if (card.kind !== 'attack') return []
  return (card.range ?? [])
    .map((o) => ({ col: from.col + facing * o.df, row: from.row - o.du }))
    .filter((c) => c.col >= 0 && c.col < GRID_COLS && c.row >= 0 && c.row < GRID_ROWS)
}

const RESULT_TEXT: Partial<Record<ActionResult, string>> = {
  hit: '명중!',
  blocked: '가드됨',
  whiff: '빗나감',
  nofuel: '기력부족',
  guard: '가드',
  energy: '원기 +',
  move: '이동',
}
const PHASE_TEXT: Record<Step['phase'], string> = { move: '이동', defense: '수비', attack: '공격' }
const isAtk = (r: ActionResult) => r === 'hit' || r === 'blocked' || r === 'whiff'
const STEP_MS: Record<Step['phase'], number> = { move: 540, defense: 560, attack: 900 }

function baseView(b: CardBattle): View {
  const s = b.state
  return {
    pos: [{ ...s.pos[0] }, { ...s.pos[1] }],
    hp: [s.hp[0], s.hp[1]],
    energy: [s.energy[0], s.energy[1]],
    shield: [s.shield[0], s.shield[1]],
    acting: [false, false],
    damage: [0, 0],
    heal: [0, 0],
    fx: [null, null],
    say: ['', ''],
  }
}

function stepToView(step: Step): View {
  const s = step.snapshot
  const a = step.actor
  const d = 1 - a
  const acting: [boolean, boolean] = [false, false]
  acting[a] = isAtk(step.result)
  const damage: [number, number] = [0, 0]
  if (isAtk(step.result) && step.damage > 0) damage[d] = step.damage
  const heal: [number, number] = [0, 0]
  if (step.heal > 0) heal[a] = step.heal
  const fx: [Fx | null, Fx | null] = [null, null]
  if (step.card.kind === 'attack' && step.result !== 'nofuel')
    fx[a] = { kind: step.card.fx ?? 'punch', result: step.result }
  const say: [string, string] = ['', '']
  say[a] = `${step.card.name} ${RESULT_TEXT[step.result] ?? ''}`.trim()
  return {
    pos: [{ ...s.pos[0] }, { ...s.pos[1] }],
    hp: [s.hp[0], s.hp[1]],
    energy: [s.energy[0], s.energy[1]],
    shield: [s.shield[0], s.shield[1]],
    acting,
    damage,
    heal,
    fx,
    say,
  }
}

export function BattleScreen({
  playerCharId,
  opponent,
  onEnd,
  onQuit,
}: {
  playerCharId: string
  opponent: BattleOpponent
  onEnd: (playerWon: boolean) => void
  onQuit: () => void
}) {
  const battleRef = useRef<CardBattle | null>(null)
  if (!battleRef.current) battleRef.current = new CardBattle(playerCharId, opponent.charId)
  const battle = battleRef.current

  const player = battle.chars[0]
  const enemy = battle.chars[1]
  const deck = useMemo(() => deckFor(player), [player])
  const svgs = useMemo(
    () => [buildFighterSvg(player), buildFighterSvg(enemy)] as const,
    [player, enemy],
  )

  const [view, setView] = useState<View>(() => baseView(battle))
  const [slots, setSlots] = useState<(CardDef | null)[]>([null, null, null])
  const [phase, setPhase] = useState<'select' | 'resolving' | 'over'>('select')
  const [phaseTag, setPhaseTag] = useState<string>('')
  const [banner, setBanner] = useState<string | null>(null)
  const cancelled = useRef(false)
  // bump to re-read cooldowns after a turn resolves
  const [, setTick] = useState(0)
  const [hoveredCard, setHoveredCard] = useState<CardDef | null>(null)
  const [hitFlash, setHitFlash] = useState<{ seq: number; target: 0 | 1 } | null>(null)
  // cells the currently-resolving attack covers, with which fighter is attacking
  const [resolveHit, setResolveHit] = useState<{ cells: Cell[]; actor: 0 | 1 } | null>(null)

  // ---- plan building -----------------------------------------------------
  const cdLeft = (id: string) => battle.state.cooldowns[0][id] ?? 0
  const placedSameCd = (c: CardDef) =>
    (c.cooldown ?? 0) >= 1 && slots.some((s) => s?.id === c.id)
  const selectable = (c: CardDef) => cdLeft(c.id) === 0 && !placedSameCd(c)

  const addCard = (c: CardDef) => {
    if (phase !== 'select' || !selectable(c)) return
    const i = slots.indexOf(null)
    if (i === -1) return
    const next = slots.slice()
    next[i] = c
    setSlots(next)
  }
  const clearSlot = (i: number) => {
    if (phase !== 'select') return
    const next = slots.slice()
    next[i] = null
    setSlots(next)
  }
  const reset = () => setSlots([null, null, null])

  const passiveEnergy = player.passive.turnEnergy ?? 0
  const filled = slots.every((c): c is CardDef => c !== null)
  const affordable =
    filled &&
    planAffordable(slots as CardDef[], battle.state.energy[0], player.maxEnergy, passiveEnergy)

  // rough energy budget to dim unaffordable attack cards while picking
  const energyBudget = Math.min(
    player.maxEnergy,
    battle.state.energy[0] +
      ENERGY_REGEN +
      passiveEnergy +
      slots.reduce((e, c) => e + (c?.kind === 'energy' ? (c.gain ?? 0) : 0), 0),
  )

  // cells the hovered attack card would hit, based on player's current position
  const targetCells = useMemo(
    () => (hoveredCard ? attackCells(view.pos[0], hoveredCard, battle.facing(0)) : []),
    [hoveredCard, view, battle],
  )

  // which slot numbers (1-based) contain this card id
  const slotNosFor = (id: string): number[] =>
    slots.map((s, i) => (s?.id === id ? i + 1 : null)).filter((n): n is number => n !== null)

  // ---- resolve a turn ----------------------------------------------------
  const confirm = async () => {
    if (!filled || !affordable || phase !== 'select') return
    const playerPlan = slots as CardDef[]
    const aiPlan = decideAI(battle.state, 1, enemy, opponent.difficulty)
    const steps = battle.resolveTurn(playerPlan, aiPlan)
    setPhase('resolving')
    setHoveredCard(null)

    for (const step of steps) {
      if (cancelled.current) return
      setPhaseTag(PHASE_TEXT[step.phase])
      setView(stepToView(step))
      if (step.card.kind === 'attack' && step.result !== 'nofuel') {
        const actor = step.actor as 0 | 1
        const cells = attackCells(step.snapshot.pos[actor], step.card, battle.facing(actor))
        setResolveHit({ cells, actor })
      } else {
        setResolveHit(null)
      }
      if (step.result === 'hit' && step.damage > 0) {
        const target = (1 - step.actor) as 0 | 1
        setHitFlash((prev) => ({ seq: (prev?.seq ?? 0) + 1, target }))
      }
      await wait(STEP_MS[step.phase])
      if (cancelled.current) return
    }

    setView(baseView(battle))
    setResolveHit(null)
    setPhaseTag('')

    if (battle.state.over) {
      const playerWon = battle.state.winner === 0
      setBanner(playerWon ? 'K.O.' : 'DEFEAT')
      setPhase('over')
      await wait(1300)
      if (cancelled.current) return
      onEnd(playerWon)
      return
    }

    setSlots([null, null, null])
    setTick((t) => t + 1) // refresh cooldown display
    setPhase('select')
  }

  useEffect(() => {
    cancelled.current = false
    return () => {
      cancelled.current = true
    }
  }, [])

  return (
    <div className="screen battle">
      <div className="grid-bg" />

      <BattleHud player={player} enemy={enemy} view={view} turn={battle.state.turn} onQuit={onQuit} />

      <div className="board">
        <div className="gridboard">
          {Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => {
            const col = i % GRID_COLS
            const row = Math.floor(i / GRID_COLS)
            const hovered = targetCells.some((c) => c.col === col && c.row === row)
            const live = resolveHit?.cells.some((c) => c.col === col && c.row === row)
            const cls =
              hovered || (live && resolveHit?.actor === 0)
                ? ' cell--target'
                : live
                  ? ' cell--target cell--target-foe'
                  : ''
            return <span className={`cell${cls}`} key={i} />
          })}
          <FighterSprite svg={svgs[0]} side="left" accent={player.accent} v={view} idx={0} />
          <FighterSprite svg={svgs[1]} side="right" accent={enemy.accent} v={view} idx={1} />
        </div>

        {hitFlash && (
          <div
            key={hitFlash.seq}
            className={`board__hitflash board__hitflash--${hitFlash.target === 0 ? 'left' : 'right'}`}
          />
        )}
        {banner && <div className="board__banner">{banner}</div>}
        {phaseTag && !banner && <div className="board__turnflash">{phaseTag}</div>}
      </div>

      {phase === 'select' ? (
        <div className="cards">
          <div className="cards__slots">
            {slots.map((c, i) => (
              <button
                key={i}
                className={`slot ${c ? 'slot--filled' : ''}`}
                onClick={() => clearSlot(i)}
                onMouseEnter={() => setHoveredCard(c?.kind === 'attack' ? c : null)}
                onMouseLeave={() => setHoveredCard(null)}
                style={c ? { ['--accent' as string]: cardAccent(c, player.accent) } : undefined}
              >
                <span className="slot__no">{i + 1}</span>
                {c ? (
                  <CardFace card={c} accent={cardAccent(c, player.accent)} />
                ) : (
                  <span className="slot__empty">{i + 1}번째</span>
                )}
              </button>
            ))}
            <div className="cards__actions">
              <button
                className="btn btn--ghost cards__reset"
                onClick={reset}
                disabled={slots.every((s) => !s)}
              >
                초기화
              </button>
              <button
                className={`btn cards__confirm ${affordable ? '' : 'is-disabled'}`}
                onClick={confirm}
                disabled={!affordable}
              >
                {filled && !affordable ? '기력 부족' : '실행 ▶'}
              </button>
            </div>
          </div>

          <div className="cards__hand">
            {deck.map((c) => {
              const onCd = cdLeft(c.id) > 0
              const locked = onCd || placedSameCd(c)
              const dim = locked || (c.kind === 'attack' && (c.energyCost ?? 0) > energyBudget)
              const inSlots = slotNosFor(c.id)
              return (
                <button
                  key={c.id}
                  className={`handcard ${dim ? 'is-dim' : ''} ${locked ? 'is-locked' : ''}`}
                  onClick={() => addCard(c)}
                  onMouseEnter={() => setHoveredCard(c)}
                  onMouseLeave={() => setHoveredCard(null)}
                  disabled={locked}
                  style={{ ['--accent' as string]: cardAccent(c, player.accent) }}
                >
                  <CardFace card={c} accent={cardAccent(c, player.accent)} />
                  {onCd && <span className="handcard__cd">{cdLeft(c.id)}</span>}
                  {inSlots.length > 0 && (
                    <span className="handcard__slot-badge">{inSlots.join(' ')}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="cards cards--resolving">
          <div className="cards__status">
            {[view.say[0] && `${player.name}: ${view.say[0]}`, view.say[1] && `${enemy.name}: ${view.say[1]}`]
              .filter(Boolean)
              .join('     ') || ' '}
          </div>
        </div>
      )}

      <div className="scanlines" />
    </div>
  )
}

// ---------------------------------------------------------------------------

function cardAccent(c: CardDef, fallback: string): string {
  if (c.kind === 'attack') return c.accent ?? fallback
  if (c.kind === 'guard') return '#9fc2ff'
  if (c.kind === 'energy') return '#ffe14d'
  return '#8493bd'
}

function moveIcon(dir: CardDef['dir'], steps: number): string {
  const one = dir === 'right' ? '▶' : dir === 'left' ? '◀' : dir === 'up' ? '▲' : '▼'
  return steps >= 2 ? one + one : one
}

/** Compact range chart, like the reference 3x3: center = attacker. */
function RangeChart({ card }: { card: CardDef }) {
  const cols = [-1, 0, 1, 2, 3] // forward window
  const rows = [1, 0, -1] // up..down
  const hit = (df: number, du: number) =>
    (card.range ?? []).some((o) => o.df === df && o.du === du)
  return (
    <div className="rangechart">
      {rows.map((du) =>
        cols.map((df) => {
          const self = df === 0 && du === 0
          const on = hit(df, du)
          return <span key={`${df},${du}`} className={`rc ${self ? 'rc--self' : on ? 'rc--on' : ''}`} />
        }),
      )}
    </div>
  )
}

function CardFace({ card, accent }: { card: CardDef; accent: string }) {
  const icon =
    card.kind === 'attack'
      ? '⚔'
      : card.kind === 'guard'
        ? '🛡'
        : card.kind === 'energy'
          ? '⚡'
          : moveIcon(card.dir, card.steps ?? 1)
  const reach =
    card.kind === 'attack' ? Math.max(0, ...(card.range ?? []).map((o) => o.df)) : 0
  return (
    <div className={`cardface cardface--${card.kind}`} style={{ ['--accent' as string]: accent }}>
      <div className="cardface__top">
        <span className="cardface__icon">{icon}</span>
        {card.signature && <span className="cardface__sig">SP</span>}
        {(card.cooldown ?? 0) > 0 && <span className="cardface__cd">CD{card.cooldown}</span>}
      </div>
      <div className="cardface__name">{card.name}</div>
      {card.kind === 'attack' && (
        <>
          <RangeChart card={card} />
          <div className="cardface__meta">
            <span>⚔{card.damage}</span>
            <span>↦{reach}</span>
            <span>⚡{card.energyCost}</span>
          </div>
        </>
      )}
      {card.kind === 'guard' && (
        <div className="cardface__meta">
          <span>방어 {card.block}</span>
          <span>⚡{card.guardCost}</span>
        </div>
      )}
      {card.kind === 'energy' && (
        <div className="cardface__meta">
          <span>기력 +{card.gain}</span>
        </div>
      )}
      {card.kind === 'move' && <div className="cardface__meta cardface__meta--move"><span>{card.desc}</span></div>}
    </div>
  )
}

function FighterSprite({
  svg,
  side,
  accent,
  v,
  idx,
}: {
  svg: string
  side: 'left' | 'right'
  accent: string
  v: View
  idx: number
}) {
  const cls = [
    'fighter',
    `fighter--${side}`,
    v.acting[idx] ? 'is-attacking' : '',
    v.damage[idx] > 0 ? 'is-hit' : '',
    v.shield[idx] > 0 ? 'is-guard' : '',
  ].join(' ')
  const fx = v.fx[idx]
  return (
    <div
      className={cls}
      style={{
        left: `${cellX(v.pos[idx].col)}%`,
        top: `${cellY(v.pos[idx].row)}%`,
        ['--accent' as string]: accent,
      }}
    >
      {v.damage[idx] > 0 && <div className="fighter__dmg">-{v.damage[idx]}</div>}
      {v.heal[idx] > 0 && <div className="fighter__heal">+{v.heal[idx]}</div>}
      {v.say[idx] && <div className="fighter__say">{v.say[idx]}</div>}
      {v.shield[idx] > 0 && <div className="fighter__shield" />}
      {fx && <div className={`fx fx--${fx.kind} fx--${fx.result}`} />}
      <div className="fighter__art" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  )
}

function BattleHud({
  player,
  enemy,
  view,
  turn,
  onQuit,
}: {
  player: ReturnType<typeof getChar>
  enemy: ReturnType<typeof getChar>
  view: View
  turn: number
  onQuit: () => void
}) {
  return (
    <div className="bhud">
      <BhudSide char={player} hp={view.hp[0]} energy={view.energy[0]} side="left" />
      <div className="bhud__turn">
        <div className="bhud__turnno">TURN {turn}</div>
        <button className="btn btn--ghost bhud__quit" onClick={onQuit}>
          ESC · 종료
        </button>
      </div>
      <BhudSide char={enemy} hp={view.hp[1]} energy={view.energy[1]} side="right" />
    </div>
  )
}

function BhudSide({
  char,
  hp,
  energy,
  side,
}: {
  char: ReturnType<typeof getChar>
  hp: number
  energy: number
  side: 'left' | 'right'
}) {
  const hpPct = Math.max(0, (hp / char.maxHp) * 100)
  const ePct = Math.max(0, (energy / char.maxEnergy) * 100)
  return (
    <div className={`bhud__side bhud__side--${side}`} style={{ ['--accent' as string]: char.accent }}>
      <div className="bhud__name">{char.name}</div>
      <div className="bhud__hp">
        <div className={`bhud__hpfill bhud__hpfill--${side}`} style={{ width: `${hpPct}%` }} />
        <span className="bhud__hpnum">{Math.ceil(hp)}</span>
      </div>
      <div className="bhud__energy">
        <div className={`bhud__energyfill bhud__energyfill--${side}`} style={{ width: `${ePct}%` }} />
        <span className="bhud__energynum">⚡ {Math.floor(energy)}</span>
      </div>
    </div>
  )
}
