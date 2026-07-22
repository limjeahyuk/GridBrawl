import { useEffect, useMemo, useRef, useState } from 'react'
import { getChar } from '../../data/roster'
import { buildFighterSvg, buildPortraitSvg } from '../../art/art'
import { CardBattle, planAffordable } from '../../battle/engine'
import { deckFor } from '../../battle/cards'
import { CardFace, cardAccent } from '../CardFace'
import {
  FOG_DAMAGE,
  FOG_START_TURN,
  fogEscalatesNext,
  GRID_COLS,
  GRID_ROWS,
  MOVE_DELTA,
  inBounds,
  isFogCell,
  MIRROR_DIR,
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
  /** step sequence — keys the floating -N/+N so the animation restarts every step */
  seq: number
}

const cellX = (col: number) => ((col + 0.5) / GRID_COLS) * 100
const cellY = (row: number) => ((row + 0.5) / GRID_ROWS) * 100
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Board cells an attack covers, from the attacker's cell and facing (+1 / -1). */
function attackCells(from: Cell, card: CardDef, facing: number): Cell[] {
  if (card.kind !== 'attack') return []
  return (card.range ?? [])
    .map((o) => ({ col: from.col + facing * o.df, row: from.row - o.du }))
    .filter(inBounds)
}

/** Where a move card lands, mirroring the engine's rule: walls stop you, the
 *  opponent's cell can be passed through or landed on (겹침 허용). Used to
 *  preview an attack's reach *after* earlier move cards in the plan resolve. */
function applyMovePreview(from: Cell, card: CardDef): Cell {
  const [dc, dr] = MOVE_DELTA[card.dir ?? 'right']
  let cur = { ...from }
  for (let k = 0; k < (card.steps ?? 1); k++) {
    const next = { col: cur.col + dc, row: cur.row + dr }
    if (!inBounds(next)) break
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
  heal: '회복!',
  move: '이동',
  fog: '피해!',
  revive: '🔥',
}
const PHASE_TEXT: Record<Step['phase'], string> = {
  move: '이동',
  defense: '수비',
  attack: '공격',
  fog: '독안개',
  revive: '부활',
}
const isAtk = (r: ActionResult) => r === 'hit' || r === 'blocked' || r === 'whiff'
const STEP_MS: Record<Step['phase'], number> = { move: 540, defense: 560, attack: 900, fog: 700, revive: 1100 }
/** 필살기(시그니처) 컷인이 화면을 채우는 시간 — 끝나면 실제 타격이 이어진다. */
const CUTIN_MS = 1750
/** 이 피해 이상이면 화면을 흔든다(강타 연출). */
const SHAKE_DAMAGE = 22

// 손패 탭 — 종류별로 나눠 카드를 크게 보여준다 (가드+원기 = 수비)
type HandTab = 'move' | 'attack' | 'defense'
const HAND_TABS: { id: HandTab; label: string }[] = [
  { id: 'move', label: '이동' },
  { id: 'attack', label: '공격' },
  { id: 'defense', label: '수비' },
]
const tabOf = (c: CardDef): HandTab =>
  c.kind === 'move' ? 'move' : c.kind === 'attack' ? 'attack' : 'defense'

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
    seq: 0,
  }
}

function stepToView(step: Step, seq: number): View {
  const s = step.snapshot
  const a = step.actor
  const d = 1 - a
  const acting: [boolean, boolean] = [false, false]
  acting[a] = isAtk(step.result)
  const damage: [number, number] = [0, 0]
  if (isAtk(step.result) && step.damage > 0) damage[d] = step.damage
  if (step.recoil > 0) damage[a] = step.recoil // 반동: 자기 자신에게 -N 표시
  const heal: [number, number] = [0, 0]
  if (step.heal > 0) heal[a] = step.heal
  const fx: [Fx | null, Fx | null] = [null, null]
  if (step.card.kind === 'attack' && step.result !== 'nofuel')
    fx[a] = { kind: step.card.fx ?? 'punch', result: step.result }
  const say: [string, string] = ['', '']
  say[a] = `${step.card.name} ${RESULT_TEXT[step.result] ?? ''}`.trim()
  if (step.drain > 0) say[a] += ` ⚡+${step.drain}`
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
    seq,
  }
}

export function BattleScreen({
  p0CharId,
  p1CharId,
  localSide,
  deck,
  getOpponentPlan,
  turnSeconds,
  onEnd,
  onQuit,
}: {
  /** Canonical fighters: index 0 is shown on the left, 1 on the right. In
   *  multiplayer this is host vs guest, identical on both peers. */
  p0CharId: string
  p1CharId: string
  /** Which side this client controls (0 in single-player). */
  localSide: 0 | 1
  /** 로컬 플레이어의 손패(고정 7 + 고른 카드). 미지정 시 캐릭터 전체 카드
   *  (`deckFor`) — 튜토리얼·구 흐름 호환. */
  deck?: CardDef[]
  getOpponentPlan: OpponentPlanner
  /** 턴 제한(초). 주면 카운트다운이 돌고 0에서 자동 제출한다 — 상대를 무한정
   *  기다리지 않도록 온라인 대전에서만 사용(싱글·튜토리얼은 미지정). */
  turnSeconds?: number
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
  const hand = useMemo(() => deck ?? deckFor(local), [deck, local])

  // Render from THIS client's perspective: the local fighter always sits on the
  // left facing right, the opponent on the right. The engine stays canonical
  // (host = side 0); we only mirror the *display* when we control side 1, so
  // forward is always "right" on screen — no per-seat card flipping needed.
  const flip = localSide === 1
  const dcol = (col: number) => (flip ? GRID_COLS - 1 - col : col)
  // Move cards are absolute (col +/-); when mirrored, relabel left<->right so a
  // card's arrow/name matches the direction the sprite actually goes on screen.
  const faceCard = (c: CardDef): CardDef => {
    if (!flip || c.kind !== 'move' || !c.dir) return c
    const dir = MIRROR_DIR[c.dir]
    if (dir === c.dir) return c // 위/아래는 반전해도 그대로
    const steps = c.steps ?? 1
    // 대각선은 이름·설명에 방향 화살표를 그대로 쓰므로 라벨만 짝으로 바꾼다
    if (c.dir.includes('-')) {
      const arrows: Partial<Record<MoveDir, string>> = {
        'up-right': '↗',
        'up-left': '↖',
        'down-right': '↘',
        'down-left': '↙',
      }
      const arrow = arrows[dir] ?? ''
      const word = dir.startsWith('up') ? '위' : '아래'
      const side = dir.endsWith('right') ? '오른쪽' : '왼쪽'
      return {
        ...c,
        dir,
        name: `${arrow} 대각 이동`,
        desc: `${side} ${word}로 한 칸 이동. (${arrow})`,
      }
    }
    const word = dir === 'right' ? '오른쪽' : '왼쪽'
    const sym = dir === 'right' ? (steps >= 2 ? '>>' : '>') : steps >= 2 ? '<<' : '<'
    const name = steps >= 2 ? `${word} 대시` : word
    const desc = steps >= 2 ? `${word}으로 두 칸 이동. (${sym})` : `${word}으로 한 칸 이동. (${sym})`
    return { ...c, dir, name, desc }
  }
  const svgs = useMemo(() => [buildFighterSvg(c0), buildFighterSvg(c1)] as const, [c0, c1])
  // 필살기 컷인에 쓰는 대형 초상 (선택 화면과 같은 아트)
  const portraits = useMemo(() => [buildPortraitSvg(c0), buildPortraitSvg(c1)] as const, [c0, c1])

  const [view, setView] = useState<View>(() => baseView(battle))
  const [slots, setSlots] = useState<(CardDef | null)[]>([null, null, null])
  const [phase, setPhase] = useState<'select' | 'resolving' | 'over'>('select')
  const [waitingRemote, setWaitingRemote] = useState(false)
  const [phaseTag, setPhaseTag] = useState<string>('')
  const [banner, setBanner] = useState<string | null>(null)
  /** 턴 제한 남은 초(온라인 전용, 미사용 시 null) */
  const [remain, setRemain] = useState<number | null>(null)
  const submittingRef = useRef(false)
  const cancelled = useRef(false)
  // bump to re-read cooldowns after a turn resolves
  const [, setTick] = useState(0)
  const [hoveredCard, setHoveredCard] = useState<CardDef | null>(null)
  const [handTab, setHandTab] = useState<HandTab>('move')
  // where the hovered attack sits in the plan: a slot index, or null = "from hand"
  // (would land in the next empty slot). Drives the move-aware range preview.
  const [hoverSlot, setHoverSlot] = useState<number | null>(null)
  const [hitFlash, setHitFlash] = useState<{ seq: number; target: 0 | 1 } | null>(null)
  // cells the currently-resolving attack covers, with which fighter is attacking
  const [resolveHit, setResolveHit] = useState<{ cells: Cell[]; actor: 0 | 1 } | null>(null)
  // 필살기 컷인(시그니처 카드 발동 순간 화면을 덮는 연출)
  const [cutIn, setCutIn] = useState<{ seq: number; actor: 0 | 1; card: CardDef } | null>(null)
  // 강타 시 보드 흔들림
  const [shake, setShake] = useState<number>(0)

  // ---- plan building -----------------------------------------------------
  const cdLeft = (id: string) => battle.state.cooldowns[localSide][id] ?? 0
  // 한 턴에 같은 카드를 두 번 못 넣는 경우: 쿨타임 카드(다음 턴 잠기므로)와
  // 모든 공격 카드(같은 공격 반복 금지 — 3공격은 서로 다른 카드로만 가능).
  const placedNoRepeat = (c: CardDef) =>
    ((c.cooldown ?? 0) >= 1 || c.kind === 'attack') && slots.some((s) => s?.id === c.id)
  const selectable = (c: CardDef) => cdLeft(c.id) === 0 && !placedNoRepeat(c)

  const addCard = (c: CardDef) => {
    if (phase !== 'select' || !selectable(c) || !canAfford(c)) return
    const i = slots.indexOf(null)
    if (i === -1) return
    const next = slots.slice()
    next[i] = c
    setSlots(next)
    // 배치 직후엔 미리보기(고스트·사거리)를 항상 지운다. 특히 터치 기기는
    // mouseleave가 없어 프리뷰가 남으므로, 방금 놓은 카드 기준으로 유령이
    // 붙어버리는 것을 막는다.
    setHoveredCard(null)
    setHoverSlot(null)
  }
  const clearSlot = (i: number) => {
    if (phase !== 'select') return
    const next = slots.slice()
    next[i] = null
    setSlots(next)
    setHoveredCard(null)
    setHoverSlot(null)
  }
  const reset = () => setSlots([null, null, null])

  const passiveEnergy = local.passive.turnEnergy ?? 0
  const filled = slots.every((c): c is CardDef => c !== null)
  const affordable =
    filled &&
    planAffordable(slots as CardDef[], battle.state.energy[localSide], local.maxEnergy, passiveEnergy)

  // 이 카드를 다음 빈 슬롯에 넣어도 플랜 전체를 지불할 수 있는가.
  // 기력은 슬롯 순서대로 오가므로(원기 회복이 중간에 채워줄 수도) 엔진과 같은
  // `planAffordable`로 정확히 검사한다. 못 내는 카드는 아예 선택 불가(disabled).
  const canAfford = (c: CardDef): boolean => {
    const i = slots.indexOf(null)
    if (i === -1) return true // 슬롯이 가득 — 어차피 추가되지 않는다
    const next = slots.slice()
    next[i] = c
    return planAffordable(
      next.filter((x): x is CardDef => !!x),
      battle.state.energy[localSide],
      local.maxEnergy,
      passiveEnergy,
    )
  }

  // Preview the hovered card's effect on my position. `from` = where I stand
  // when this card resolves (start cell shifted by every move card *before* it
  // in the plan, so it tracks queued dashes). `ghost` = where I'll actually be
  // standing for it — after this move for a move card, or `from` for an attack —
  // or null when it doesn't change my cell.
  const preview = useMemo(() => {
    const cur = view.pos[localSide]
    if (!hoveredCard) return { from: cur, ghost: null as Cell | null }
    const nextEmpty = slots.indexOf(null)
    const upto = hoverSlot ?? (nextEmpty === -1 ? slots.length : nextEmpty)
    let from = { ...cur }
    for (let j = 0; j < upto; j++) {
      const c = slots[j]
      if (c?.kind === 'move') from = applyMovePreview(from, c)
    }
    let ghost: Cell | null =
      hoveredCard.kind === 'move'
        ? applyMovePreview(from, hoveredCard)
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
  const submitPlan = async (localPlan: CardDef[]) => {
    // 수동 제출과 타이머 자동 제출이 겹쳐 두 번 보내지 않도록 ref로 잠근다
    if (phase !== 'select' || submittingRef.current) return
    submittingRef.current = true
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

    for (const [si, step] of steps.entries()) {
      if (cancelled.current) return

      // 필살기: 타격을 보여주기 전에 컷인으로 "이게 필살기다"를 못 박는다.
      // 기력 부족으로 불발된 카드는 연출하지 않는다.
      if (step.card.signature && step.card.kind === 'attack' && step.result !== 'nofuel') {
        setCutIn({ seq: si + 1, actor: step.actor as 0 | 1, card: step.card })
        await wait(CUTIN_MS)
        setCutIn(null)
        if (cancelled.current) return
      }

      setPhaseTag(PHASE_TEXT[step.phase])
      setView(stepToView(step, si + 1))
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
        // 묵직한 한 방이면 화면이 흔들린다
        if (step.damage >= SHAKE_DAMAGE) setShake((n) => n + 1)
      }
      await wait(STEP_MS[step.phase])
      if (cancelled.current) return
    }
    setCutIn(null)

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
    submittingRef.current = false
    setPhase('select')
  }

  const confirm = () => {
    if (!filled || !affordable) return
    void submitPlan(slots as CardDef[])
  }

  // 시간 초과 자동 제출 — 항상 유효한 플랜을 만들어 낸다.
  // ① 지금 플랜이 완성·지불 가능하면 그대로 ② 아니면 빈 슬롯을 원기 회복으로
  // 메우고 ③ 그래도 기력이 모자라면 원기 회복 3장(언제나 유효).
  const autoSubmitRef = useRef<() => void>(() => {})
  autoSubmitRef.current = () => {
    if (phase !== 'select' || submittingRef.current) return
    if (filled && affordable) {
      void submitPlan(slots as CardDef[])
      return
    }
    const energyCard = hand.find((c) => c.kind === 'energy')
    if (!energyCard) return
    const padded = slots.map((s) => s ?? energyCard) as CardDef[]
    const ok = planAffordable(
      padded,
      battle.state.energy[localSide],
      local.maxEnergy,
      passiveEnergy,
    )
    void submitPlan(ok ? padded : [energyCard, energyCard, energyCard])
  }

  // 턴 카운트다운(온라인 전용). 0이 되면 자동 제출해 상대 대기가 끝난다.
  useEffect(() => {
    if (!turnSeconds || phase !== 'select') {
      setRemain(null)
      return
    }
    const end = Date.now() + turnSeconds * 1000
    setRemain(turnSeconds)
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      setRemain(left)
      if (left <= 0) {
        clearInterval(id)
        autoSubmitRef.current()
      }
    }, 200)
    return () => clearInterval(id)
  }, [phase, turnSeconds])

  useEffect(() => {
    cancelled.current = false
    return () => {
      cancelled.current = true
    }
  }, [])

  // 흔들림은 잠깐이면 된다 — 클래스를 뗐다 붙여야 다음 강타에서 다시 재생된다
  useEffect(() => {
    if (!shake) return
    const id = setTimeout(() => setShake(0), 420)
    return () => clearTimeout(id)
  }, [shake])

  return (
    <div className="screen battle">
      <div className="grid-bg" />

      <BattleHud
        c0={c0}
        c1={c1}
        localSide={localSide}
        view={view}
        turn={battle.state.turn}
        remain={remain}
        onQuit={onQuit}
      />

      <div className={`board ${shake ? 'is-shaking' : ''}`}>
        <div className="gridboard">
          {Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => {
            const row = Math.floor(i / GRID_COLS)
            // visual column -> canonical column (mirrored when we hold side 1)
            const ccol = dcol(i % GRID_COLS)
            const hovered = targetCells.some((c) => c.col === ccol && c.row === row)
            const live = resolveHit?.cells.some((c) => c.col === ccol && c.row === row)
            // 독안개: 발동 턴부터 덮인 열을 보라색으로 물들인다(열 기준 점진 확대)
            const fog = isFogCell({ col: ccol, row }, battle.state.turn)
            const cls =
              hovered || (live && resolveHit?.actor === localSide)
                ? ' cell--target'
                : live
                  ? ' cell--target cell--target-foe'
                  : fog
                    ? ' cell--fog'
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
                onPointerEnter={(e) => {
                  if (e.pointerType !== 'mouse') return
                  setHoveredCard(c && (c.kind === 'attack' || c.kind === 'move') ? c : null)
                  setHoverSlot(i)
                }}
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse') return
                  setHoveredCard(c && (c.kind === 'attack' || c.kind === 'move') ? c : null)
                  setHoverSlot(i)
                }}
                onPointerLeave={() => setHoveredCard(null)}
                onPointerUp={(e) => {
                  if (e.pointerType !== 'mouse') setHoveredCard(null)
                }}
                onPointerCancel={() => setHoveredCard(null)}
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

          <div className="cards__tabs">
            {HAND_TABS.map((t) => {
              const picked = slots.filter((s) => s && tabOf(s) === t.id).length
              return (
                <button
                  key={t.id}
                  className={`cards__tab ${handTab === t.id ? 'is-active' : ''}`}
                  onClick={() => setHandTab(t.id)}
                >
                  {t.label}
                  {picked > 0 && <span className="cards__tab-count">{picked}</span>}
                </button>
              )
            })}
          </div>

          <div className="cards__hand">
            {hand.filter((c) => tabOf(c) === handTab).map((c) => {
              const onCd = cdLeft(c.id) > 0
              const locked = onCd || placedNoRepeat(c)
              // 기력이 모자라 이번 플랜에 넣을 수 없는 카드도 선택 불가로 잠근다
              const poor = !locked && !canAfford(c)
              const unusable = locked || poor
              const inSlots = slotNosFor(c.id)
              return (
                <button
                  key={c.id}
                  className={`handcard handcard--${c.kind} ${unusable ? 'is-dim' : ''} ${
                    unusable ? 'is-locked' : ''
                  }`}
                  onClick={() => addCard(c)}
                  onPointerEnter={(e) => {
                    // 마우스: 올려두면 미리보기(hover). 못 쓰는 카드는 예측 없음.
                    if (unusable || e.pointerType !== 'mouse') return
                    setHoveredCard(c)
                    setHoverSlot(null)
                  }}
                  onPointerDown={(e) => {
                    // 터치/펜: 누르는 동안만 미리보기(떼면 배치되며 지워짐).
                    if (unusable || e.pointerType === 'mouse') return
                    setHoveredCard(c)
                    setHoverSlot(null)
                  }}
                  onPointerLeave={() => setHoveredCard(null)}
                  onPointerUp={(e) => {
                    if (e.pointerType !== 'mouse') setHoveredCard(null)
                  }}
                  onPointerCancel={() => setHoveredCard(null)}
                  disabled={unusable}
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

      {cutIn && (
        <div
          key={`cutin-${cutIn.seq}`}
          className={`cutin ${cutIn.actor === localSide ? 'cutin--me' : 'cutin--foe'}`}
          style={{
            ['--accent' as string]: battle.chars[cutIn.actor].accent,
            ['--accent2' as string]: battle.chars[cutIn.actor].accent2,
          }}
        >
          <div className="cutin__streaks">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="cutin__streak" style={{ ['--i' as string]: i }} />
            ))}
          </div>
          <div
            className="cutin__art"
            dangerouslySetInnerHTML={{ __html: portraits[cutIn.actor] }}
          />
          <div className="cutin__label">
            <div className="cutin__who">
              {battle.chars[cutIn.actor].name} · 필살기
            </div>
            <div className="cutin__name">{cutIn.card.name}</div>
          </div>
          <div className="cutin__flash" />
        </div>
      )}

      <div className="scanlines" />
    </div>
  )
}

// ---------------------------------------------------------------------------

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
  // 두 파이터가 같은 셀에 겹치면 화면상 좌우로 살짝 비켜 둘 다 보이게 한다
  const stacked =
    v.pos[0].col === v.pos[1].col && v.pos[0].row === v.pos[1].row
  const fx = v.fx[idx]
  const cls = [
    'fighter',
    `fighter--${side}`,
    stacked ? `fighter--stacked-${side}` : '',
    isLocal ? 'fighter--me' : '',
    // 공격 모션은 카드의 fx 종류별로 다르다(베기·사격·돌진·내려찍기…)
    v.acting[idx] ? `is-attacking is-atk-${fx?.kind ?? 'punch'}` : '',
    v.damage[idx] > 0 ? 'is-hit' : '',
    v.shield[idx] > 0 ? 'is-guard' : '',
  ].join(' ')
  return (
    <div
      className={cls}
      style={{
        left: `${cellX(flip ? GRID_COLS - 1 - v.pos[idx].col : v.pos[idx].col)}%`,
        top: `${cellY(v.pos[idx].row)}%`,
        ['--accent' as string]: accent,
      }}
    >
      {v.damage[idx] > 0 && (
        <div key={`dmg-${v.seq}`} className="fighter__dmg">
          -{v.damage[idx]}
        </div>
      )}
      {v.heal[idx] > 0 && (
        <div key={`heal-${v.seq}`} className="fighter__heal">
          +{v.heal[idx]}
        </div>
      )}
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
  remain,
  onQuit,
}: {
  c0: ReturnType<typeof getChar>
  c1: ReturnType<typeof getChar>
  localSide: 0 | 1
  view: View
  turn: number
  remain: number | null
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
        {remain !== null && (
          <div className={`bhud__timer ${remain <= 5 ? 'bhud__timer--urgent' : ''}`}>
            ⏱ {remain}s
          </div>
        )}
        {fogEscalatesNext(turn) && (
          <div className="bhud__fog bhud__fog--warn">
            {turn < FOG_START_TURN ? '⚠ 다음 턴부터 독안개!' : '⚠ 다음 턴 독안개 확대!'}
          </div>
        )}
        {turn >= FOG_START_TURN && (
          <div className="bhud__fog">☠ 독안개 위 턴당 -{FOG_DAMAGE}</div>
        )}
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
  const hpLow = hpPct <= 30
  return (
    <div className={`bhud__side bhud__side--${side}`} style={{ ['--accent' as string]: char.accent }}>
      <div className="bhud__name">
        {char.name}
        {isLocal && <span className="bhud__you">나</span>}
      </div>
      <div className="bhud__hp">
        <div
          className={`bhud__hpfill bhud__hpfill--${side} ${hpLow ? 'bhud__hpfill--low' : ''}`}
          style={{ width: `${hpPct}%` }}
        />
        <span className="bhud__hpnum">
          HP {Math.ceil(hp)} / {char.maxHp}
        </span>
      </div>
      <div className="bhud__energy">
        <div className={`bhud__energyfill bhud__energyfill--${side}`} style={{ width: `${ePct}%` }} />
        <span className="bhud__energynum">
          ⚡ {Math.floor(energy)} / {char.maxEnergy}
        </span>
      </div>
    </div>
  )
}
