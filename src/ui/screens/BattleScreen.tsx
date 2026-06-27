import { useEffect, useMemo, useRef, useState } from 'react'
import { getChar } from '../../data/roster'
import { buildFighterSvg } from '../../art/art'
import { CardBattle, planAffordable } from '../../battle/engine'
import { deckFor, ENERGY_REGEN } from '../../battle/cards'
import {
  GRID_COLS,
  GRID_ROWS,
  type ActionResult,
  type Cell,
  type CardDef,
  type MoveDir,
  type Step,
} from '../../battle/types'

/** Produce the opponent's 3-card plan for a turn (local AI, or a remote peer in
 *  multiplayer). Returns null if the opponent is gone (e.g. peer disconnected). */
export type OpponentPlanner = (
  localPlan: CardDef[],
  battle: CardBattle,
) => Promise<CardDef[] | null>

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

const MOVE_DELTA: Record<string, [number, number]> = {
  right: [1, 0],
  left: [-1, 0],
  up: [0, -1],
  down: [0, 1],
}

/** Board cells an attack covers, from the attacker's cell and facing (+1 / -1). */
function attackCells(from: Cell, card: CardDef, facing: number): Cell[] {
  if (card.kind !== 'attack') return []
  return (card.range ?? [])
    .map((o) => ({ col: from.col + facing * o.df, row: from.row - o.du }))
    .filter((c) => c.col >= 0 && c.col < GRID_COLS && c.row >= 0 && c.row < GRID_ROWS)
}

/** Where a move card lands, mirroring the engine's wall/opponent stops. Used to
 *  preview an attack's reach *after* earlier move cards in the plan resolve. */
function applyMovePreview(from: Cell, other: Cell, card: CardDef): Cell {
  const [dc, dr] = MOVE_DELTA[card.dir ?? 'right']
  let cur = { ...from }
  for (let k = 0; k < (card.steps ?? 1); k++) {
    const next = { col: cur.col + dc, row: cur.row + dr }
    if (next.col < 0 || next.col >= GRID_COLS || next.row < 0 || next.row >= GRID_ROWS) break
    if (next.col === other.col && next.row === other.row) break
    cur = next
  }
  return cur
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
  p0CharId,
  p1CharId,
  localSide,
  getOpponentPlan,
  onEnd,
  onQuit,
}: {
  /** Canonical fighters: index 0 is shown on the left, 1 on the right. In
   *  multiplayer this is host vs guest, identical on both peers. */
  p0CharId: string
  p1CharId: string
  /** Which side this client controls (0 in single-player). */
  localSide: 0 | 1
  getOpponentPlan: OpponentPlanner
  onEnd: (localWon: boolean) => void
  onQuit: () => void
}) {
  const battleRef = useRef<CardBattle | null>(null)
  if (!battleRef.current) battleRef.current = new CardBattle(p0CharId, p1CharId)
  const battle = battleRef.current

  // canonical (left/right) fighters for rendering + the local one for controls
  const c0 = battle.chars[0]
  const c1 = battle.chars[1]
  const local = battle.chars[localSide]
  const deck = useMemo(() => deckFor(local), [local])

  // Render from THIS client's perspective: the local fighter always sits on the
  // left facing right, the opponent on the right. The engine stays canonical
  // (host = side 0); we only mirror the *display* when we control side 1, so
  // forward is always "right" on screen — no per-seat card flipping needed.
  const flip = localSide === 1
  const dcol = (col: number) => (flip ? GRID_COLS - 1 - col : col)
  // Move cards are absolute (col +/-); when mirrored, relabel left<->right so a
  // card's arrow/name matches the direction the sprite actually goes on screen.
  const faceCard = (c: CardDef): CardDef => {
    if (!flip || c.kind !== 'move' || (c.dir !== 'left' && c.dir !== 'right')) return c
    const dir: MoveDir = c.dir === 'left' ? 'right' : 'left'
    const steps = c.steps ?? 1
    const word = dir === 'right' ? '오른쪽' : '왼쪽'
    const sym = dir === 'right' ? (steps >= 2 ? '>>' : '>') : steps >= 2 ? '<<' : '<'
    const name = steps >= 2 ? `${word} 대시` : word
    const desc = steps >= 2 ? `${word}으로 두 칸 이동. (${sym})` : `${word}으로 한 칸 이동. (${sym})`
    return { ...c, dir, name, desc }
  }
  const svgs = useMemo(() => [buildFighterSvg(c0), buildFighterSvg(c1)] as const, [c0, c1])

  const [view, setView] = useState<View>(() => baseView(battle))
  const [slots, setSlots] = useState<(CardDef | null)[]>([null, null, null])
  const [phase, setPhase] = useState<'select' | 'resolving' | 'over'>('select')
  const [waitingRemote, setWaitingRemote] = useState(false)
  const [phaseTag, setPhaseTag] = useState<string>('')
  const [banner, setBanner] = useState<string | null>(null)
  const cancelled = useRef(false)
  // bump to re-read cooldowns after a turn resolves
  const [, setTick] = useState(0)
  const [hoveredCard, setHoveredCard] = useState<CardDef | null>(null)
  // where the hovered attack sits in the plan: a slot index, or null = "from hand"
  // (would land in the next empty slot). Drives the move-aware range preview.
  const [hoverSlot, setHoverSlot] = useState<number | null>(null)
  const [hitFlash, setHitFlash] = useState<{ seq: number; target: 0 | 1 } | null>(null)
  // cells the currently-resolving attack covers, with which fighter is attacking
  const [resolveHit, setResolveHit] = useState<{ cells: Cell[]; actor: 0 | 1 } | null>(null)

  // ---- plan building -----------------------------------------------------
  const cdLeft = (id: string) => battle.state.cooldowns[localSide][id] ?? 0
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

  const passiveEnergy = local.passive.turnEnergy ?? 0
  const filled = slots.every((c): c is CardDef => c !== null)
  const affordable =
    filled &&
    planAffordable(slots as CardDef[], battle.state.energy[localSide], local.maxEnergy, passiveEnergy)

  // rough energy budget to dim unaffordable attack cards while picking
  const energyBudget = Math.min(
    local.maxEnergy,
    battle.state.energy[localSide] +
      ENERGY_REGEN +
      passiveEnergy +
      slots.reduce((e, c) => e + (c?.kind === 'energy' ? (c.gain ?? 0) : 0), 0),
  )

  // Preview the hovered card's effect on my position. `from` = where I stand
  // when this card resolves (start cell shifted by every move card *before* it
  // in the plan, so it tracks queued dashes). `ghost` = where I'll actually be
  // standing for it — after this move for a move card, or `from` for an attack —
  // or null when it doesn't change my cell.
  const preview = useMemo(() => {
    const cur = view.pos[localSide]
    if (!hoveredCard) return { from: cur, ghost: null as Cell | null }
    const opp = view.pos[1 - localSide]
    const nextEmpty = slots.indexOf(null)
    const upto = hoverSlot ?? (nextEmpty === -1 ? slots.length : nextEmpty)
    let from = { ...cur }
    for (let j = 0; j < upto; j++) {
      const c = slots[j]
      if (c?.kind === 'move') from = applyMovePreview(from, opp, c)
    }
    let ghost: Cell | null =
      hoveredCard.kind === 'move'
        ? applyMovePreview(from, opp, hoveredCard)
        : hoveredCard.kind === 'attack'
          ? from
          : null
    if (ghost && ghost.col === cur.col && ghost.row === cur.row) ghost = null
    return { from, ghost }
  }, [hoveredCard, hoverSlot, slots, view, localSide])

  // cells the hovered attack card would hit, from my position at that point
  const targetCells = useMemo(
    () =>
      hoveredCard?.kind === 'attack'
        ? attackCells(preview.from, hoveredCard, battle.facing(localSide))
        : [],
    [hoveredCard, preview, battle, localSide],
  )

  // which slot numbers (1-based) contain this card id
  const slotNosFor = (id: string): number[] =>
    slots.map((s, i) => (s?.id === id ? i + 1 : null)).filter((n): n is number => n !== null)

  // ---- resolve a turn ----------------------------------------------------
  const confirm = async () => {
    if (!filled || !affordable || phase !== 'select') return
    const localPlan = slots as CardDef[]
    setPhase('resolving')
    setHoveredCard(null)

    // get the opponent's plan (instant for AI, awaits the peer in multiplayer)
    setWaitingRemote(true)
    const oppPlan = await getOpponentPlan(localPlan, battle)
    setWaitingRemote(false)
    if (cancelled.current) return
    if (!oppPlan) {
      // peer disconnected while we waited
      setBanner('상대 연결 끊김')
      setPhase('over')
      await wait(1600)
      if (cancelled.current) return
      onQuit()
      return
    }

    // host is side 0, guest side 1 — feed plans in canonical order
    const planA = localSide === 0 ? localPlan : oppPlan
    const planB = localSide === 0 ? oppPlan : localPlan
    const steps = battle.resolveTurn(planA, planB)

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
      const localWon = battle.state.winner === localSide
      setBanner(battle.state.winner === null ? 'DRAW' : localWon ? 'K.O.' : 'DEFEAT')
      setPhase('over')
      await wait(1300)
      if (cancelled.current) return
      onEnd(localWon)
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

      <BattleHud c0={c0} c1={c1} localSide={localSide} view={view} turn={battle.state.turn} onQuit={onQuit} />

      <div className="board">
        <div className="gridboard">
          {Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => {
            const row = Math.floor(i / GRID_COLS)
            // visual column -> canonical column (mirrored when we hold side 1)
            const ccol = dcol(i % GRID_COLS)
            const hovered = targetCells.some((c) => c.col === ccol && c.row === row)
            const live = resolveHit?.cells.some((c) => c.col === ccol && c.row === row)
            const cls =
              hovered || (live && resolveHit?.actor === localSide)
                ? ' cell--target'
                : live
                  ? ' cell--target cell--target-foe'
                  : ''
            return <span className={`cell${cls}`} key={i} />
          })}
          {preview.ghost && (
            <div
              className="fighter fighter--left fighter--ghost"
              style={{
                left: `${cellX(dcol(preview.ghost.col))}%`,
                top: `${cellY(preview.ghost.row)}%`,
                ['--accent' as string]: local.accent,
              }}
            >
              <div className="fighter__art" dangerouslySetInnerHTML={{ __html: svgs[localSide] }} />
            </div>
          )}
          <FighterSprite
            svg={svgs[0]}
            side={localSide === 0 ? 'left' : 'right'}
            accent={c0.accent}
            v={view}
            idx={0}
            flip={flip}
            isLocal={localSide === 0}
          />
          <FighterSprite
            svg={svgs[1]}
            side={localSide === 1 ? 'left' : 'right'}
            accent={c1.accent}
            v={view}
            idx={1}
            flip={flip}
            isLocal={localSide === 1}
          />
        </div>

        {hitFlash && (
          <div
            key={hitFlash.seq}
            className={`board__hitflash board__hitflash--${hitFlash.target === localSide ? 'left' : 'right'}`}
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
                onMouseEnter={() => {
                  setHoveredCard(c && (c.kind === 'attack' || c.kind === 'move') ? c : null)
                  setHoverSlot(i)
                }}
                onMouseLeave={() => setHoveredCard(null)}
                style={c ? { ['--accent' as string]: cardAccent(c, local.accent) } : undefined}
              >
                <span className="slot__no">{i + 1}</span>
                {c ? (
                  <CardFace card={faceCard(c)} accent={cardAccent(c, local.accent)} />
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
                  onMouseEnter={() => {
                    setHoveredCard(c)
                    setHoverSlot(null)
                  }}
                  onMouseLeave={() => setHoveredCard(null)}
                  disabled={locked}
                  style={{ ['--accent' as string]: cardAccent(c, local.accent) }}
                >
                  <CardFace card={faceCard(c)} accent={cardAccent(c, local.accent)} />
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
            {waitingRemote
              ? '상대의 카드를 기다리는 중…'
              : [
                  view.say[0] && `${c0.name}: ${view.say[0]}`,
                  view.say[1] && `${c1.name}: ${view.say[1]}`,
                ]
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

/** Compact range chart, like the reference 3x3: center = attacker. The local
 *  fighter always faces right on screen (see BattleScreen perspective flip), so
 *  "forward" is always to the right here. */
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
  flip,
  isLocal,
}: {
  svg: string
  side: 'left' | 'right'
  accent: string
  v: View
  idx: number
  flip: boolean
  isLocal?: boolean
}) {
  const cls = [
    'fighter',
    `fighter--${side}`,
    isLocal ? 'fighter--me' : '',
    v.acting[idx] ? 'is-attacking' : '',
    v.damage[idx] > 0 ? 'is-hit' : '',
    v.shield[idx] > 0 ? 'is-guard' : '',
  ].join(' ')
  const fx = v.fx[idx]
  return (
    <div
      className={cls}
      style={{
        left: `${cellX(flip ? GRID_COLS - 1 - v.pos[idx].col : v.pos[idx].col)}%`,
        top: `${cellY(v.pos[idx].row)}%`,
        ['--accent' as string]: accent,
      }}
    >
      {v.damage[idx] > 0 && <div className="fighter__dmg">-{v.damage[idx]}</div>}
      {v.heal[idx] > 0 && <div className="fighter__heal">+{v.heal[idx]}</div>}
      {v.say[idx] && <div className="fighter__say">{v.say[idx]}</div>}
      {v.shield[idx] > 0 && <div className="fighter__shield" />}
      {fx && <div className={`fx fx--${fx.kind} fx--${fx.result}`} />}
      {isLocal && <div className="fighter__me">나</div>}
      <div className="fighter__art" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  )
}

function BattleHud({
  c0,
  c1,
  localSide,
  view,
  turn,
  onQuit,
}: {
  c0: ReturnType<typeof getChar>
  c1: ReturnType<typeof getChar>
  localSide: 0 | 1
  view: View
  turn: number
  onQuit: () => void
}) {
  // mirror the HUD to match the board: this client's fighter on the left
  const li = localSide
  const oi = (1 - localSide) as 0 | 1
  const chars = [c0, c1] as const
  return (
    <div className="bhud">
      <BhudSide char={chars[li]} hp={view.hp[li]} energy={view.energy[li]} side="left" isLocal />
      <div className="bhud__turn">
        <div className="bhud__turnno">TURN {turn}</div>
        <button className="btn btn--ghost bhud__quit" onClick={onQuit}>
          ESC · 종료
        </button>
      </div>
      <BhudSide char={chars[oi]} hp={view.hp[oi]} energy={view.energy[oi]} side="right" />
    </div>
  )
}

function BhudSide({
  char,
  hp,
  energy,
  side,
  isLocal,
}: {
  char: ReturnType<typeof getChar>
  hp: number
  energy: number
  side: 'left' | 'right'
  isLocal?: boolean
}) {
  const hpPct = Math.max(0, (hp / char.maxHp) * 100)
  const ePct = Math.max(0, (energy / char.maxEnergy) * 100)
  return (
    <div className={`bhud__side bhud__side--${side}`} style={{ ['--accent' as string]: char.accent }}>
      <div className="bhud__name">
        {char.name}
        {isLocal && <span className="bhud__you">나</span>}
      </div>
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
