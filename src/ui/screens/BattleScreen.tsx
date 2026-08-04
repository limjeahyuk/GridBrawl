import { useEffect, useMemo, useRef, useState } from 'react'
import { getChar } from '../../data/roster'
import { buildFighterSvg } from '../../art/art'
import {
  attackClipFor,
  clipOrFallback,
  clipUrl,
  impactDelayOf,
  placeSprite,
  preloadSheet,
  sheetFor,
  type ClipName,
  type SheetDef,
} from '../../art/sprites'
import { CardBattle, planAffordable, type BattleOpts } from '../../battle/engine'
import type { BattleScene } from '../../game/run'
import type { BossCinematic } from '../../game/bosses'
import { deckFor } from '../../battle/cards'
import { CardFace, cardAccent, moveIcon } from '../CardFace'
import { PortraitSvg } from '../PortraitSvg'
import { isMuted, playSfx, setMuted, unlockAudio } from '../sfx'
import {
  COLLAPSE_START_TURN,
  collapseDamageAt,
  collapseEscalatesNext,
  GRID_COLS,
  GRID_ROWS,
  MOVE_DELTA,
  inBounds,
  isCollapsedCell,
  MIRROR_DIR,
  type ActionResult,
  type Cell,
  type CardDef,
  type MoveDir,
  type Step,
  type StatusEffect,
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
  /** 지금 내는 공격 카드의 fx 종류. 준비 동작~타격 내내 유지돼야 한다 —
   *  중간에 바뀌면 CSS animation-name이 갈려 모션이 처음부터 다시 뛴다. */
  actFx: [string | null, string | null]
  damage: [number, number]
  heal: [number, number]
  stunned: [boolean, boolean] // 이 턴을 통째로 버리는 기절
  /** 지금 걸려 있는 지속효과(독·화상·빙결 + 강화 버프) — 파이터 발밑 칩으로 표시 */
  status: [StatusEffect[], StatusEffect[]]
  fx: [Fx | null, Fx | null]
  say: [string, string]
  /** step sequence — keys the floating -N/+N so the animation restarts every step */
  seq: number
}

const cellX = (col: number) => ((col + 0.5) / GRID_COLS) * 100
const cellY = (row: number) => ((row + 0.5) / GRID_ROWS) * 100
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Board cells an attack covers, from the attacker's cell and facing (+1 / -1). */
function attackCells(from: Cell, card: CardDef, facing: number, foe?: Cell): Cell[] {
  if (card.kind !== 'attack') return []
  const cells = (card.range ?? [])
    .map((o) => ({ col: from.col + facing * o.df, row: from.row - o.du }))
    .filter(inBounds)
  // 밀착: 상대가 내 셀에 겹쳐 서 있으면 이 카드로 때릴 수 있는지(pointBlank)에 따라
  // 내 셀도 타격 범위로 보여 준다 — 엔진 판정과 같은 규칙.
  if (foe && foe.col === from.col && foe.row === from.row && card.pointBlank !== false)
    cells.push({ col: from.col, row: from.row })
  return cells
}

/**
 * 화면에서 어느 쪽을 보고 설 것인가 — **상대가 있는 쪽**이다.
 *
 * 반환값은 `.fighter--left` / `.fighter--right` 클래스와 같은 뜻이라 이름이
 * 헷갈리기 쉬운데, `left` = "왼쪽에 서서 오른쪽을 본다"(`--flip: 1`)이고
 * `right` = 그 반대다. 대시로 상대를 지나치면 좌우가 뒤바뀌므로 자리(진영)가
 * 아니라 **매 프레임 열 위치를 비교해** 정한다.
 *
 * 같은 열이면(겹침·수직 정렬) 직전 방향을 유지한다 — 겹칠 때마다 홱홱 도는 것을
 * 막으려는 것으로, `fallback`에는 그 파이터의 진영을 넣는다.
 */
export function faceToward(myCol: number, foeCol: number, fallback: 'left' | 'right'): 'left' | 'right' {
  if (myCol === foeCol) return fallback
  return myCol < foeCol ? 'left' : 'right'
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
  collapse: '피해!',
  revive: '🔥',
  status: '피해!',
  buff: '강화!',
  frozen: '얼어붙음',
}
const PHASE_TEXT: Record<Step['phase'], string> = {
  move: '이동',
  defense: '수비',
  attack: '공격',
  collapse: '붕괴',
  revive: '부활',
  stun: '기절',
  trigger: '유물',
  status: '상태이상',
}
/** 파이터 발밑 상태 칩 — 지금 뭐가 걸려 있는지 숫자를 안 읽어도 보이게. */
const STATUS_CHIP: Record<string, string> = {
  poison: '☠',
  burn: '🔥',
  frozen: '❄',
  atkUp: '🔺',
  defUp: '🔷',
  freeCast: '🌀',
}

const isAtk = (r: ActionResult) => r === 'hit' || r === 'blocked' || r === 'whiff'
const STEP_MS: Record<Step['phase'], number> = {
  move: 540, defense: 560, attack: 900, collapse: 700, revive: 1100,
  stun: 900, // 기절은 한 턴을 통째로 날리므로 충분히 보여준다
  trigger: 700,
  status: 620, // 독·화상 틱 — 여러 개가 잇달아 뜰 수 있어 짧게
}
/** 필살기(시그니처) 컷인이 화면을 채우는 시간 — 끝나면 실제 타격이 이어진다. */
const CUTIN_MS = 1750

/**
 * 공격 모션이 **실제로 상대에게 닿는** 시점(ms). SVG 아트에서는 `ui.css`의
 * atk-melee/atk-cast/atk-rush/atk-quake 키프레임이 파고드는 순간을 눈대중으로
 * 맞춘 값이다. ⚠ 키프레임 타이밍을 바꾸면 여기도 같이 맞춰야 한다.
 * 스프라이트 시트를 쓰는 캐릭터는 이 표 대신 클립의 `impactFrame`에서 정확한
 * 값이 나온다(`impactDelayOf`) — 추정이 아니라 실제 프레임 번호다.
 */
const IMPACT_MS: Record<string, number> = {
  punch: 265, slash: 265, rush: 250, quake: 345,
  bolt: 330, orb: 330, flame: 330, shield: 265,
}
const impactDelay = (sheet: SheetDef | undefined, fx?: string) =>
  impactDelayOf(sheet, fx) ?? IMPACT_MS[fx ?? 'punch'] ?? 265

/** 타격 순간 화면을 멈춰 무게를 주는 시간(hitstop). 피해량에 비례. */
const hitstopFor = (dmg: number, ko: boolean) =>
  ko ? 420 : Math.round(Math.min(150, 45 + dmg * 3.2))
/** 피해량 → 흔들림 세기(1 약 · 2 강 · 3 결정타). */
const shakeLevel = (dmg: number, ko: boolean): 1 | 2 | 3 =>
  ko ? 3 : dmg >= 26 ? 2 : 1
/** 사거리 밖에서 날아오는 계열 — 준비 동작 소리가 다르다(차지 vs 바람가르기). */
const RANGED_FX = new Set(['bolt', 'orb', 'flame'])

// 손패에는 공격·수비만 둔다 — 이동은 판의 칸을 눌러서 한다(2026-08-03).
// 탭을 오가는 조작이 특히 "이동 후 공격"에서 번거로웠다.

function baseView(b: CardBattle): View {
  const s = b.state
  return {
    pos: [{ ...s.pos[0] }, { ...s.pos[1] }],
    hp: [s.hp[0], s.hp[1]],
    energy: [s.energy[0], s.energy[1]],
    shield: [s.shield[0], s.shield[1]],
    acting: [false, false],
    actFx: [null, null],
    damage: [0, 0],
    heal: [0, 0],
    stunned: [false, false],
    status: [s.status[0].map((e) => ({ ...e })), s.status[1].map((e) => ({ ...e }))],
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
  const actFx: [string | null, string | null] = [null, null]
  if (acting[a]) actFx[a] = step.card.fx ?? 'punch'
  const damage: [number, number] = [0, 0]
  // 상대에게 준 피해 — 공격뿐 아니라 유물 트리거(뇌운의 고리 등)도 -N을 띄운다.
  if (step.damage > 0) damage[d] = step.damage
  if (step.recoil > 0) damage[a] = step.recoil // 반동·독안개: 자기 자신에게 -N 표시
  const heal: [number, number] = [0, 0]
  if (step.heal > 0) heal[a] = step.heal
  const stunned: [boolean, boolean] = [false, false]
  if (step.card.id === 'stun') stunned[a] = true // 이 턴을 통째로 버리는 기절
  const fx: [Fx | null, Fx | null] = [null, null]
  if (step.card.kind === 'attack' && step.result !== 'nofuel')
    fx[a] = { kind: step.card.fx ?? 'punch', result: step.result }
  else if (step.card.id === 'trigger')
    fx[a] = { kind: 'trigger', result: 'trigger' } // 유물 트리거 발동 팝
  const say: [string, string] = ['', '']
  say[a] = `${step.card.name} ${RESULT_TEXT[step.result] ?? ''}`.trim()
  if (step.drain > 0) say[a] += ` ⚡+${step.drain}`
  return {
    pos: [{ ...s.pos[0] }, { ...s.pos[1] }],
    hp: [s.hp[0], s.hp[1]],
    energy: [s.energy[0], s.energy[1]],
    shield: [s.shield[0], s.shield[1]],
    acting,
    actFx,
    status: [s.status[0].map((e) => ({ ...e })), s.status[1].map((e) => ({ ...e }))],
    damage,
    heal,
    stunned,
    fx,
    say,
    seq,
  }
}

/** 공격이 아닌 스텝(이동·수비·기력·힐·안개·기절·유물)의 효과음. 공격은 준비
 *  동작과 타격이 나뉘어 있어 `submitPlan`에서 따로 울린다. */
function stepSfx(step: Step): void {
  if (step.result === 'nofuel') return playSfx('nofuel')
  if (step.card.id === 'stun') return playSfx('stun')
  if (step.card.id === 'trigger' || step.phase === 'revive') return playSfx('trigger')
  if (step.phase === 'collapse') return playSfx('collapse')
  switch (step.card.kind) {
    case 'move':
      return playSfx((step.card.steps ?? 1) >= 2 ? 'dash' : 'move')
    case 'guard':
      return playSfx('guard')
    case 'energy':
      return playSfx('energy')
    case 'heal':
      return playSfx('heal')
    case 'buff':
      return playSfx('guard')
  }
}

export function BattleScreen({
  p0CharId,
  p1CharId,
  localSide,
  deck,
  battleOpts,
  telegraph,
  scene = 'hall',
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
  /** 로그라이크용 — 유물 merge 패시브·몬스터 스탯 override(엔진 BattleOpts). */
  battleOpts?: BattleOpts
  /** 보스 예고 — 선택 화면에 상대(side 1)의 이번 턴 행동을 미리 알린다. */
  telegraph?: (turn: number, oppHpFrac: number) => string | null
  /** 전장 배경. 로그라이크는 층마다 바뀌고(`sceneFor`), 봇전·멀티는 기본 고성. */
  scene?: BattleScene
  getOpponentPlan: OpponentPlanner
  /** 턴 제한(초). 주면 카운트다운이 돌고 0에서 자동 제출한다 — 상대를 무한정
   *  기다리지 않도록 온라인 대전에서만 사용(싱글·튜토리얼은 미지정). */
  turnSeconds?: number
  /** 전투 종료 콜백 — 로컬 승패 + 로컬 남은 체력(로그라이크 HP 인계용). */
  onEnd: (localWon: boolean, selfHpLeft: number) => void
  onQuit: () => void
}) {
  const battleRef = useRef<CardBattle | null>(null)
  if (!battleRef.current) battleRef.current = new CardBattle(p0CharId, p1CharId, battleOpts)
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
  // 스프라이트 시트가 있는 캐릭터는 픽셀 애니메이션으로, 없으면 기존 SVG로 그린다
  // (마이그레이션 도중에도 전투가 깨지지 않게 한 폴백).
  const sheets = useMemo(
    () => [sheetFor(c0.spriteId ?? c0.id), sheetFor(c1.spriteId ?? c1.id)] as const,
    [c0, c1],
  )
  // 첫 공격에서 PNG를 받느라 한 프레임 비는 걸 막는다
  useEffect(() => {
    for (const s of sheets) if (s) void preloadSheet(s)
  }, [sheets])
  // 이동 미리보기 잔상 — 본체와 같은 몸·같은 방향으로 서야 한다
  const ghostSheet = sheets[localSide]
  // 필살기 컷인에 쓰는 대형 초상 (선택 화면과 같은 아트)

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
  // where the hovered attack sits in the plan: a slot index, or null = "from hand"
  // (would land in the next empty slot). Drives the move-aware range preview.
  const [hoverSlot, setHoverSlot] = useState<number | null>(null)
  const [hitFlash, setHitFlash] = useState<{ seq: number; target: 0 | 1 } | null>(null)
  // cells the currently-resolving attack covers, with which fighter is attacking
  const [resolveHit, setResolveHit] = useState<{ cells: Cell[]; actor: 0 | 1 } | null>(null)
  // 필살기 컷인(시그니처 카드 발동 순간 화면을 덮는 연출)
  const [cutIn, setCutIn] = useState<{ seq: number; actor: 0 | 1; card: CardDef } | null>(null)
  // 타격 순간 화면 정지(hitstop) — 켜져 있는 동안 모든 애니메이션이 멈춘다
  const [hitstop, setHitstop] = useState(false)
  // 피격 지점에서 터지는 불꽃 파편
  const [sparks, setSparks] = useState<{
    seq: number
    cell: Cell
    n: number
    color: string
    big: boolean
  } | null>(null)
  // KO 순간 화면을 덮는 백색 섬광
  const [koFlash, setKoFlash] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)

  /**
   * 카메라 펀치 — 타격이 꽂힐 때 판을 흔들고 살짝 밀어 넣는다.
   * CSS 클래스가 아니라 Web Animations로 돌린다: 연타가 400ms 안에 겹쳐도
   * 매번 처음부터 다시 재생된다(클래스 토글은 같은 클래스가 유지되면 안 뛴다).
   */
  const punch = (level: 1 | 2 | 3) => {
    const el = gridRef.current
    if (!el) return
    const amp = level === 3 ? 17 : level === 2 ? 10 : 5
    const zoom = level === 3 ? 1.04 : level === 2 ? 1.018 : 1.007
    const at = (x: number, y: number, s: number, offset: number) => ({
      transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s})`,
      offset,
    })
    el.animate(
      [
        at(0, 0, 1, 0),
        at(-amp, amp * 0.6, zoom, 0.14),
        at(amp * 0.85, -amp * 0.7, zoom, 0.32),
        at(-amp * 0.6, -amp * 0.35, 1, 0.5),
        at(amp * 0.45, amp * 0.45, 1, 0.7),
        at(-amp * 0.18, amp * 0.12, 1, 0.86),
        at(0, 0, 1, 1),
      ],
      { duration: level === 3 ? 640 : 400, easing: 'ease-out' },
    )
  }

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
    playSfx('ui')
    // 배치 후엔 호버 미리보기를 놓는다 — 대신 `planPreview`가 이어받아 고른
    // 카드 기준 예시가 계속 남는다(터치 기기는 mouseleave가 없어 방금 놓은
    // 카드가 호버로 남으면 같은 이동이 두 번 반영돼 보인다).
    setHoveredCard(null)
    setHoverSlot(null)
  }
  const clearSlot = (i: number) => {
    if (phase !== 'select' || !slots[i]) return
    const next = slots.slice()
    next[i] = null
    setSlots(next)
    playSfx('uiBack')
    setHoveredCard(null)
    setHoverSlot(null)
  }
  const reset = () => {
    setSlots([null, null, null])
    playSfx('uiBack')
  }

  // 실효 패시브(유물 merge 반영) — 유물로 매턴 기력이 붙으면 기력 예산에 반영
  const passiveEnergy = battle.passive[localSide].turnEnergy ?? 0
  // 무아지경(freeCast)이 걸려 있으면 이번 턴 모든 카드가 공짜다 — 엔진과 같은 규칙
  const freeCastOn = !!battle.statusOf(localSide, 'freeCast')
  const filled = slots.every((c): c is CardDef => c !== null)
  const affordable =
    filled &&
    planAffordable(
      slots as CardDef[],
      battle.state.energy[localSide],
      local.maxEnergy,
      passiveEnergy,
      freeCastOn,
    )

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
      freeCastOn,
    )
  }

  // 지금까지 고른 카드만으로 그리는 **상시 미리보기**. 슬롯을 순서대로 훑으며
  // 이동은 위치를 옮기고, 공격은 그 시점 위치에서의 타격 셀을 모은다. 카드를
  // 놓아도 예시가 유지되고, 슬롯이 모두 비어야 사라진다.
  // ⚠ 카드를 고르는 동안에만 그린다 — 실행을 누르면 슬롯은 그대로지만(해소가
  //   끝나야 비운다) 예시는 즉시 사라져야 실제 진행과 겹치지 않는다.
  const planPreview = useMemo(() => {
    const cur = view.pos[localSide]
    const none = { ghost: null as Cell | null, cells: [] as Cell[] }
    if (phase !== 'select') return none
    const facing = battle.facing(localSide)
    let at = { ...cur }
    // 공격 범위는 **누적하지 않는다** — 여러 장을 고르면 빨간 칸이 뒤섞여 헷갈리므로
    // 가장 마지막에 고른 공격의 범위만 남긴다(위치는 앞선 이동까지 반영된 값).
    let cells: Cell[] = []
    for (const c of slots) {
      if (!c) continue
      if (c.kind === 'move') at = applyMovePreview(at, c)
      else if (c.kind === 'attack') cells = attackCells(at, c, facing, view.pos[1 - localSide])
    }
    const moved = at.col !== cur.col || at.row !== cur.row
    return { ghost: moved ? at : null, cells }
  }, [slots, view, localSide, battle, phase])

  // Preview the hovered card's effect on my position. `from` = where I stand
  // when this card resolves (start cell shifted by every move card *before* it
  // in the plan, so it tracks queued dashes). `ghost` = where I'll actually be
  // standing for it — after this move for a move card, or `from` for an attack —
  // or null when it doesn't change my cell.
  const preview = useMemo(() => {
    const cur = view.pos[localSide]
    // 위치와 무관한 카드(가드·원기·힐)를 올려보거나 아무것도 안 올려봤으면
    // 고른 카드 기준 미리보기를 그대로 유지한다 — 예시는 깜빡이지 않는다.
    const spatial = hoveredCard?.kind === 'move' || hoveredCard?.kind === 'attack'
    if (!hoveredCard || !spatial) return { from: cur, ghost: planPreview.ghost }
    const nextEmpty = slots.indexOf(null)
    const upto = hoverSlot ?? (nextEmpty === -1 ? slots.length : nextEmpty)
    let from = { ...cur }
    for (let j = 0; j < upto; j++) {
      const c = slots[j]
      if (c?.kind === 'move') from = applyMovePreview(from, c)
    }
    let ghost: Cell | null =
      hoveredCard.kind === 'move' ? applyMovePreview(from, hoveredCard) : from
    if (ghost && ghost.col === cur.col && ghost.row === cur.row) ghost = null
    return { from, ghost }
  }, [hoveredCard, hoverSlot, slots, view, localSide, planPreview])

  /**
   * **칸을 눌러 이동한다**(2026-08-03). 이동 카드를 탭에서 고르는 대신, 지금
   * 갈 수 있는 칸을 노란색으로 밝혀 두고 그걸 누르면 해당 이동 카드가 슬롯에
   * 담긴다 — "이동 탭 → 카드 → 공격 탭 → 카드"를 오가던 걸 없앤다.
   *
   * 출발점은 **고른 카드까지 반영된 위치**(`planPreview.ghost`)다. 그래야 두
   * 번 연속으로 눌러 두 칸을 갈 수 있다.
   * 같은 칸에 닿는 카드가 둘이면 **적은 걸음 수**를 고른다(대시보다 한 칸짜리를
   * 먼저 — 대시는 쿨이 있어 아껴 두는 게 보통 이득이다).
   */
  const moveTargets = useMemo(() => {
    const out = new Map<string, CardDef>()
    if (phase !== 'select' || slots.every((x) => x !== null)) return out
    const from = planPreview.ghost ?? view.pos[localSide]
    for (const c of hand) {
      if (c.kind !== 'move' || !selectable(c) || !canAfford(c)) continue
      const to = applyMovePreview(from, c)
      if (to.col === from.col && to.row === from.row) continue // 벽에 막혀 제자리
      const key = `${to.col},${to.row}`
      const prev = out.get(key)
      if (!prev || (c.steps ?? 1) < (prev.steps ?? 1)) out.set(key, c)
    }
    return out
  }, [hand, slots, planPreview, view, localSide, phase, battle.state.cooldowns])

  // 강조할 타격 셀 — 공격 카드를 올려보는 중이면 그 카드의 사거리, 아니면 고른
  // 플랜의 공격들이 덮는 셀(그대로 남아 있는 예시).
  const targetCells = useMemo(
    () =>
      hoveredCard?.kind === 'attack'
        ? attackCells(preview.from, hoveredCard, battle.facing(localSide), view.pos[1 - localSide])
        : planPreview.cells,
    [hoveredCard, preview, battle, localSide, planPreview],
  )

  // 잔상이 **도착 지점에서** 상대를 보는 방향. 본체와 같은 규칙을 쓰되 기준 셀만
  // 이동 후 위치라, 상대를 지나쳐 가는 이동이면 본체와 반대쪽을 보게 된다.
  const ghostFace = faceToward(
    dcol(preview.ghost?.col ?? view.pos[localSide].col),
    dcol(view.pos[1 - localSide].col),
    'left',
  )
  const ghostPlace = ghostSheet ? placeSprite(ghostSheet, ghostFace) : null

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
    // ⚠ resolveTurn은 battle.state를 **턴 종료 상태로** 밀어 버린다. 첫 공격의
    //   준비 동작에 쓸 턴 시작 화면은 그 전에 떠 둬야 한다.
    const turnStart = baseView(battle)
    const steps = battle.resolveTurn(planA, planB)

    /** 이 스텝의 피해로 정말 쓰러졌는가 — 뒤에 부활 스텝이 오면 KO가 아니다. */
    const koAt = (si: number, target: 0 | 1) =>
      steps[si].snapshot.hp[target] <= 0 &&
      !steps.slice(si + 1).some((s) => s.phase === 'revive' && s.actor === target)

    /**
     * 피해가 꽂히는 순간 한 묶음 — 섬광·불꽃·카메라 펀치·소리, 그리고 화면 정지.
     * 되돌려주는 값은 정지에 쓴 시간(ms)이라 남은 대기에서 빼면 템포가 유지된다.
     */
    const impact = async (
      step: Step,
      target: 0 | 1,
      dmg: number,
      ko: boolean,
      opts: { blocked?: boolean; sound?: boolean } = {},
    ): Promise<number> => {
      setHitFlash((prev) => ({ seq: (prev?.seq ?? 0) + 1, target }))
      setSparks((prev) => ({
        seq: (prev?.seq ?? 0) + 1,
        cell: step.snapshot.pos[target],
        n: opts.blocked ? 7 : Math.min(18, 7 + Math.round(dmg / 2.2)),
        color: opts.blocked ? '#9fc2ff' : dmg >= 26 ? '#fff1a8' : '#ffd9d9',
        big: dmg >= 26 || ko,
      }))
      if (opts.blocked) {
        playSfx('block')
        punch(1)
        return 0
      }
      punch(shakeLevel(dmg, ko))
      if (ko) {
        playSfx('ko')
        setKoFlash((n) => n + 1)
      } else if (opts.sound !== false) {
        playSfx('hit', dmg / 18)
      }
      // 잠깐 얼어붙는 순간이 "묵직함"을 만든다 — 피해가 클수록 길다
      const ms = hitstopFor(dmg, ko)
      setHitstop(true)
      await wait(ms)
      setHitstop(false)
      return ms
    }

    // 이전 스텝까지 화면에 남아 있는 상태. 공격의 **준비 동작** 구간에 그대로
    // 쓴다 — 몸이 파고드는 동안엔 아직 피해도 HP 감소도 보이면 안 된다.
    let shown: View = turnStart

    for (const [si, step] of steps.entries()) {
      if (cancelled.current) return

      // 필살기: 타격을 보여주기 전에 컷인으로 "이게 필살기다"를 못 박는다.
      // 기력 부족으로 불발된 카드는 연출하지 않는다.
      if (step.card.signature && step.card.kind === 'attack' && step.result !== 'nofuel') {
        setCutIn({ seq: si + 1, actor: step.actor as 0 | 1, card: step.card })
        playSfx('cutin')
        await wait(CUTIN_MS)
        setCutIn(null)
        if (cancelled.current) return
      }

      setPhaseTag(PHASE_TEXT[step.phase])
      const full = stepToView(step, si + 1)
      const actor = step.actor as 0 | 1
      const foe = (1 - actor) as 0 | 1

      if (step.card.kind === 'attack' && step.result !== 'nofuel') {
        setResolveHit({
          cells: attackCells(
            step.snapshot.pos[actor],
            step.card,
            battle.facing(actor),
            step.snapshot.pos[foe],
          ),
          actor,
        })
        // ① 준비 동작 — 카드 이름만 뜨고 판은 아직 그대로다
        setView({
          ...shown,
          acting: full.acting,
          actFx: full.actFx, // 준비→타격 내내 같은 모션이어야 한다
          say: full.say,
          fx: [null, null],
          damage: [0, 0],
          heal: [0, 0],
          stunned: [false, false],
          seq: si + 1,
        })
        playSfx(RANGED_FX.has(step.card.fx ?? '') ? 'cast' : 'swing')
        const lead = impactDelay(sheets[actor], step.card.fx)
        await wait(lead)
        if (cancelled.current) return

        // ② 타격 — 여기서 비로소 피해·HP·불꽃이 한꺼번에 터진다
        setView(full)
        let held = 0
        if (step.result === 'whiff') playSfx('whiff')
        else held = await impact(step, foe, step.damage, koAt(si, foe), {
          blocked: step.result === 'blocked',
        })
        if (cancelled.current) return
        await wait(Math.max(150, STEP_MS.attack - lead - held))
      } else {
        setResolveHit(null)
        setView(full)
        stepSfx(step)
        // 공격이 아닌데 피해가 났다 — 유물 트리거(상대에게) 또는 붕괴·반동(자신에게).
        // 붕괴는 stepSfx가 이미 굉음을 내므로 타격음은 겹쳐 울리지 않는다.
        let held = 0
        if (step.damage > 0) held = await impact(step, foe, step.damage, koAt(si, foe))
        else if (step.recoil > 0)
          held = await impact(step, actor, step.recoil, koAt(si, actor), {
            sound: step.phase !== 'collapse',
          })
        if (cancelled.current) return
        await wait(Math.max(160, STEP_MS[step.phase] - held))
      }
      if (cancelled.current) return
      shown = full
    }
    setCutIn(null)

    setView(baseView(battle))
    setResolveHit(null)
    setSparks(null)
    setPhaseTag('')

    if (battle.state.over) {
      const localWon = battle.state.winner === localSide
      setBanner(battle.state.winner === null ? 'DRAW' : localWon ? 'K.O.' : 'DEFEAT')
      if (battle.state.winner !== null) playSfx(localWon ? 'win' : 'lose')
      setPhase('over')
      await wait(1300)
      if (cancelled.current) return
      onEnd(localWon, battle.state.hp[localSide]) // 남은 체력 인계(로그라이크 HP 캐리)
      return
    }

    setSlots([null, null, null])
    setTick((t) => t + 1) // refresh cooldown display
    submittingRef.current = false
    setPhase('select')
  }

  const confirm = () => {
    if (!filled || !affordable) return
    playSfx('confirm')
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
      freeCastOn,
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

  return (
    <div className={`screen battle ${hitstop ? 'is-hitstop' : ''}`}>
      <div className="grid-bg" />

      <BattleHud
        c0={c0}
        c1={c1}
        maxHp={battle.maxHp}
        localSide={localSide}
        view={view}
        turn={battle.state.turn}
        remain={remain}
        onQuit={onQuit}
      />

      <div className="board">
        <div className={`boardfloor boardfloor--${scene}`} />
        <div className="gridboard" ref={gridRef}>
          {Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => {
            const row = Math.floor(i / GRID_COLS)
            // visual column -> canonical column (mirrored when we hold side 1)
            const ccol = dcol(i % GRID_COLS)
            const hovered = targetCells.some((c) => c.col === ccol && c.row === row)
            const live = resolveHit?.cells.some((c) => c.col === ccol && c.row === row)
            // 전장 붕괴: 무너진 열은 갈라진 붉은 바닥, 다음 턴에 무너질 열은 예고.
            // ⚠ **`cell--fog`는 이동 강조와 겹칠 수 있다**(무너진 칸에도 들어갈 수
            //   있으므로). 그래서 배타적인 `cls` 삼항에 넣지 않고 **따로 붙인다** —
            //   예전엔 이동 강조가 붕괴 표시를 통째로 덮어써서, 갈 수 있는 칸은 전부
            //   멀쩡해 보였고 "이동하면 안개에 안 들어간다"로 읽혔다.
            const cell = { col: ccol, row }
            const turn = battle.state.turn
            const hazard = isCollapsedCell(cell, turn)
              ? ' cell--fog'
              : isCollapsedCell(cell, turn + 1)
                ? ' cell--fog-next'
                : ''
            const cls =
              (hovered || (live && resolveHit?.actor === localSide)
                ? ' cell--target'
                : live
                  ? ' cell--target cell--target-foe'
                  : '') + hazard
            // 이동 가능한 칸이면 눌러서 그 자리로 간다(노란 강조 + 커서)
            const mv = moveTargets.get(`${ccol},${row}`)
            if (mv) {
              const warn = hazard ? ` — ${collapseDamageAt(turn + 1)} 피해` : ''
              return (
                <button
                  key={i}
                  className={`cell cell--move${cls}`}
                  onClick={() => addCard(mv)}
                  title={`이동: ${mv.name}${warn}`}
                  aria-label={`이동: ${mv.name}${warn}`}
                />
              )
            }
            return <span className={`cell${cls}`} key={i} />
          })}
          {preview.ghost && (
            // 잔상도 본체와 **같은 몸**이어야 한다 — 스프라이트 캐릭터인데 잔상만
            // SVG로 그리면 딴 사람이 서 있고 바닥선까지 어긋난다.
            <div
              className={`fighter fighter--${ghostFace} fighter--seat-left fighter--ghost${
                ghostSheet ? ' fighter--sprite' : ''
              }`}
              style={{
                left: `${cellX(dcol(preview.ghost.col))}%`,
                top: `${cellY(preview.ghost.row)}%`,
                ['--accent' as string]: local.accent,
                // 잔상도 **도착 지점에서** 상대를 바라본다 — 상대를 지나쳐 가는
                // 이동이면 본체와 반대쪽을 보게 되고, 그게 실제 결과와 맞다.
                ...(ghostPlace
                  ? {
                      ['--anchorpx' as string]: ghostPlace.anchorPx,
                      ['--footpx' as string]: ghostPlace.footPx,
                      ['--artflip' as string]: ghostPlace.artFlip,
                    }
                  : null),
              }}
            >
              {ghostSheet ? (
                <div className="fighter__art">
                  <SpriteClip sheet={ghostSheet} clip="idle" seq={0} />
                </div>
              ) : (
                <div
                  className="fighter__art"
                  dangerouslySetInnerHTML={{ __html: svgs[localSide] }}
                />
              )}
            </div>
          )}
          <FighterSprite
            svg={svgs[0]}
            sheet={sheets[0]}
            side={localSide === 0 ? 'left' : 'right'}
            accent={c0.accent}
            v={view}
            idx={0}
            flip={flip}
            isLocal={localSide === 0}
          />
          <FighterSprite
            svg={svgs[1]}
            sheet={sheets[1]}
            side={localSide === 1 ? 'left' : 'right'}
            accent={c1.accent}
            v={view}
            idx={1}
            flip={flip}
            isLocal={localSide === 1}
          />
          {sparks && (
            <div
              key={`sp-${sparks.seq}`}
              className={`sparks ${sparks.big ? 'sparks--big' : ''}`}
              style={{
                left: `${cellX(dcol(sparks.cell.col))}%`,
                top: `${cellY(sparks.cell.row)}%`,
                ['--spark' as string]: sparks.color,
              }}
            >
              {Array.from({ length: sparks.n }, (_, i) => (
                // 방향·거리·속도는 인덱스에서 뽑는다 — 난수 없이도 흩어져 보이고,
                // 같은 입력이면 같은 그림이라 리렌더에도 튀지 않는다.
                <span
                  key={i}
                  className="spark"
                  style={{
                    ['--a' as string]: `${(360 / sparks.n) * i + ((i * 37) % 26) - 13}deg`,
                    ['--d' as string]: `${34 + ((i * 53) % 48)}px`,
                    ['--t' as string]: `${0.34 + ((i * 29) % 20) / 100}s`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {koFlash > 0 && <div key={`ko-${koFlash}`} className="board__koflash" />}
        {hitFlash && (
          <div
            key={hitFlash.seq}
            className={`board__hitflash board__hitflash--${hitFlash.target === localSide ? 'left' : 'right'}`}
          />
        )}
        {banner && <div className="board__banner">{banner}</div>}
        {phaseTag && !banner && <div className="board__turnflash">{phaseTag}</div>}
        {phase === 'select' &&
          telegraph &&
          (() => {
            const opp = (1 - localSide) as 0 | 1
            const msg = telegraph(battle.state.turn, battle.state.hp[opp] / battle.maxHp[opp])
            return msg ? <div className="board__telegraph">{msg}</div> : null
          })()}
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
                  <CardFace card={faceCard(c)} accent={cardAccent(c, local.accent)} compact />
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

          {/* 탭 없음 — 이동은 판을 눌러서 한다(`moveTargets`). 손패에는 공격·수비만
              남으므로 탭을 오갈 이유가 사라졌다. */}
          <div className="cards__row">
            {/* 이동 칩 — 판을 눌러도 되지만, **쿨타임과 남은 이동 수단이 한눈에**
                보여야 계획을 세울 수 있다. 화살표만 남긴 최소 형태. */}
            <div className="cards__moves">
              {hand.filter((c) => c.kind === 'move').map((c) => {
                const cd = cdLeft(c.id)
                const usable = selectable(c) && canAfford(c)
                const f = faceCard(c)
                return (
                  <button
                    key={c.id}
                    className={`movechip ${usable ? '' : 'is-dim'}`}
                    onClick={() => addCard(c)}
                    disabled={!usable}
                    title={f.name}
                    aria-label={f.name}
                  >
                    <span className="movechip__arrow">{moveIcon(f.dir, f.steps ?? 1)}</span>
                    {cd > 0 && <span className="movechip__cd">{cd}</span>}
                  </button>
                )
              })}
            </div>
            <div className="cards__hand">
            {hand.filter((c) => c.kind !== 'move').map((c) => {
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
                  <CardFace card={faceCard(c)} accent={cardAccent(c, local.accent)} compact />
                  {onCd && <span className="handcard__cd">{cdLeft(c.id)}</span>}
                  {inSlots.length > 0 && (
                    <span className="handcard__slot-badge">{inSlots.join(' ')}</span>
                  )}
                </button>
              )
            })}
            </div>
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
          {/* 시트가 있으면 픽셀 초상, 없으면 절차 SVG로 폴백(`PortraitSvg`가 판단). */}
          <PortraitSvg char={battle.chars[cutIn.actor]} className="cutin__art" />
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

/** 지금 이 파이터가 재생해야 할 스프라이트 클립. 우선순위는 "가장 극적인 것"順. */
function clipOf(v: View, idx: number, moving: boolean): ClipName {
  if (v.hp[idx] <= 0) return 'death'
  if (v.damage[idx] > 0) return 'hurt'
  if (v.acting[idx]) return attackClipFor(v.actFx[idx] ?? 'punch')
  if (v.shield[idx] > 0) return 'block'
  if (moving) return 'run'
  return 'idle'
}

function FighterSprite({
  svg,
  sheet,
  side,
  accent,
  v,
  idx,
  flip,
  isLocal,
}: {
  svg: string
  /** 있으면 픽셀 스프라이트로, 없으면 `svg`(절차 아트)로 그린다. */
  sheet?: SheetDef
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
  // 셀이 바뀌는 동안엔 달리는 클립을 재생한다(위치 전환은 CSS transition이 맡는다)
  const prevCell = useRef(v.pos[idx])
  const [moving, setMoving] = useState(false)
  useEffect(() => {
    const p = prevCell.current
    const now = v.pos[idx]
    prevCell.current = now
    if (p.col === now.col && p.row === now.row) return
    setMoving(true)
    const id = setTimeout(() => setMoving(false), 500) // .fighter의 이동 transition과 같은 길이
    return () => clearTimeout(id)
  }, [v.pos, idx])

  // 바라보는 방향은 자리가 아니라 **상대와의 열 관계**로 정한다(대시로 지나치면
  // 뒤바뀐다). 화면 좌표로 비교해야 멀티에서 좌우 반전(`flip`)까지 맞는다.
  const dispCol = (c: Cell) => (flip ? GRID_COLS - 1 - c.col : c.col)
  const face = faceToward(dispCol(v.pos[idx]), dispCol(v.pos[1 - idx]), side)

  // ⚠ 진영(`side`)과 방향(`face`)은 다른 값이다.
  //   · `fighter--${face}`  — `--flip`(좌우 반전)과 타격 이펙트가 나가는 쪽
  //   · `fighter--seat-*`   — 숨쉬기 위상. 둘이 같은 박자로 숨쉬지 않게 하는 값이라
  //                           방향이 아니라 자리를 따라야 한다(마주 보면 방향이 같아진다)
  //   · `fighter--stacked-*` — 겹쳤을 때 좌우로 비켜 세우는 오프셋. 서로 반대여야
  //                           둘 다 보이므로 역시 자리 기준이다
  const place = sheet ? placeSprite(sheet, face) : null
  const cls = [
    'fighter',
    `fighter--${face}`,
    `fighter--seat-${side}`,
    stacked ? `fighter--stacked-${side}` : '',
    isLocal ? 'fighter--me' : '',
    sheet ? 'fighter--sprite' : '',
    // 공격 모션은 카드의 fx 종류별로 다르다(베기·사격·돌진·내려찍기…)
    v.acting[idx] ? `is-attacking is-atk-${v.actFx[idx] ?? 'punch'}` : '',
    v.damage[idx] > 0 ? 'is-hit' : '',
    v.shield[idx] > 0 ? 'is-guard' : '',
    v.stunned[idx] ? 'is-stunned' : '',
  ].join(' ')
  return (
    <div
      className={cls}
      style={{
        left: `${cellX(flip ? GRID_COLS - 1 - v.pos[idx].col : v.pos[idx].col)}%`,
        top: `${cellY(v.pos[idx].row)}%`,
        ['--accent' as string]: accent,
        // 캐릭터를 프레임 한가운데가 아니라 **몸통 기준점**으로 세운다
        // (프레임 폭은 공격 검기까지 담느라 한쪽으로 늘어나 있다).
        // `--artflip`은 시트 원본이 보는 방향을 바로잡는 값이다(진영 반전
        // `--flip`과는 별개 — 자세한 이유는 battlefx.css의 `.sprite`).
        ...(sheet
          ? {
              ['--anchorpx' as string]: place!.anchorPx,
              ['--footpx' as string]: place!.footPx,
              ['--artflip' as string]: place!.artFlip,
            }
          : null),
      }}
    >
      {v.damage[idx] > 0 && (
        // 숫자 크기가 피해량을 따라간다 — 10과 40이 같은 크기로 뜨면 무게가 안 산다
        <div
          key={`dmg-${v.seq}`}
          className={`fighter__dmg ${v.damage[idx] >= 26 ? 'fighter__dmg--big' : ''}`}
          style={{ fontSize: `${Math.round(Math.min(66, 28 + v.damage[idx] * 0.9))}px` }}
        >
          -{v.damage[idx]}
        </div>
      )}
      {v.heal[idx] > 0 && (
        <div key={`heal-${v.seq}`} className="fighter__heal">
          +{v.heal[idx]}
        </div>
      )}
      {v.say[idx] && <div className="fighter__say">{v.say[idx]}</div>}
      {v.stunned[idx] && <div className="fighter__stun">💫 기절</div>}
      {v.status[idx].length > 0 && (
        <div className="fighter__status">
          {v.status[idx].map((e) => (
            <span key={e.kind} className={`stchip stchip--${e.kind}`}>
              {STATUS_CHIP[e.kind]}
              {e.power > 0 ? e.power : ''}
              <b>{e.turns}</b>
            </span>
          ))}
        </div>
      )}
      {v.shield[idx] > 0 && <div className="fighter__shield" />}
      {fx && <div className={`fx fx--${fx.kind} fx--${fx.result}`} />}
      {isLocal && <div className="fighter__me">나</div>}
      {sheet ? (
        <div className="fighter__art">
          <SpriteClip sheet={sheet} clip={clipOf(v, idx, moving)} seq={v.seq} />
        </div>
      ) : (
        <div className="fighter__art" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </div>
  )
}

/**
 * 스프라이트 한 클립을 재생한다. 재생은 전부 CSS `steps()`가 맡고 JS는 프레임을
 * 세지 않는다 — 덕분에 히트스톱(`animation-play-state: paused`)이 스프라이트
 * 프레임까지 그대로 얼린다.
 *
 * `key`로 remount해 클립을 처음부터 다시 돌린다. animation-name이 계속
 * `sprite-play`라 클래스만 바꿔서는 재시작되지 않기 때문(이미지는 캐시돼 있어
 * remount 비용은 사실상 0).
 */
function SpriteClip({ sheet, clip, seq }: { sheet: SheetDef; clip: ClipName; seq: number }) {
  // 없는 동작은 대기로 떨어진다 — 팩마다 들어 있는 클립이 다르다
  const [actual, def] = clipOrFallback(sheet, clip)
  const w = sheet.frameW * sheet.scale
  const h = sheet.frameH * sheet.scale
  return (
    <div
      key={`${actual}-${seq}`}
      className="sprite"
      style={{
        width: `${w}px`,
        height: `${h}px`,
        backgroundImage: `url(${clipUrl(sheet, actual)})`,
        backgroundSize: `${w * def.frames}px ${h}px`,
        // 애니메이션이 끝나면 이 base 값이 드러난다 = 마지막 프레임에서 정지.
        // (fill:forwards는 프레임 범위를 한 칸 넘어가 빈 칸을 보여 준다.)
        backgroundPositionX: def.loop ? '0px' : `${-(def.frames - 1) * w}px`,
        animationTimingFunction: `steps(${def.frames})`,
        animationDuration: `${def.frames * def.frameMs}ms`,
        animationIterationCount: def.loop ? 'infinite' : 1,
        ['--strip' as string]: `${-def.frames * w}px`,
      }}
    />
  )
}

function BattleHud({
  c0,
  c1,
  maxHp,
  localSide,
  view,
  turn,
  remain,
  onQuit,
}: {
  c0: ReturnType<typeof getChar>
  c1: ReturnType<typeof getChar>
  /** 실효 최대 체력(유물·몬스터 반영) — HP 바 기준. */
  maxHp: [number, number]
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
      <BhudSide char={chars[li]} maxHp={maxHp[li]} hp={view.hp[li]} energy={view.energy[li]} side="left" isLocal />
      <div className="bhud__turn">
        <div className="bhud__turnno">TURN {turn}</div>
        {remain !== null && (
          <div className={`bhud__timer ${remain <= 5 ? 'bhud__timer--urgent' : ''}`}>
            ⏱ {remain}s
          </div>
        )}
        {collapseEscalatesNext(turn) && (
          <div className="bhud__fog bhud__fog--warn">
            {turn < COLLAPSE_START_TURN ? '⚠ 다음 턴부터 전장이 무너진다!' : '⚠ 다음 턴 붕괴 확대!'}
          </div>
        )}
        {turn >= COLLAPSE_START_TURN && (
          <div className="bhud__fog">🪨 무너진 칸 턴당 -{collapseDamageAt(turn)}</div>
        )}
        <div className="bhud__buttons">
          <SfxToggle />
          <button className="btn btn--ghost bhud__quit" onClick={onQuit}>
            ESC · 종료
          </button>
        </div>
      </div>
      <BhudSide char={chars[oi]} maxHp={maxHp[oi]} hp={view.hp[oi]} energy={view.energy[oi]} side="right" />
    </div>
  )
}

/** 효과음 음소거 토글 — 설정은 localStorage에 남는다(`sfx.ts`). */
function SfxToggle() {
  const [off, setOff] = useState(isMuted)
  return (
    <button
      className="btn btn--ghost bhud__sfx"
      title={off ? '효과음 켜기' : '효과음 끄기'}
      onClick={() => {
        const next = !off
        setMuted(next)
        setOff(next)
        if (!next) {
          unlockAudio()
          playSfx('ui')
        }
      }}
    >
      {off ? '🔇' : '🔊'}
    </button>
  )
}

function BhudSide({
  char,
  maxHp,
  hp,
  energy,
  side,
  isLocal,
}: {
  char: ReturnType<typeof getChar>
  maxHp: number
  hp: number
  energy: number
  side: 'left' | 'right'
  isLocal?: boolean
}) {
  const hpPct = Math.max(0, (hp / maxHp) * 100)
  const ePct = Math.max(0, (energy / char.maxEnergy) * 100)
  const hpLow = hpPct <= 30

  // 잔상 바(lag bar) — 방금 깎인 만큼이 흰 띠로 남았다가 뒤늦게 따라온다.
  // 격투 게임 체력바의 기본기: "얼마나 맞았는지"가 한눈에 보인다.
  const [lag, setLag] = useState(hp)
  const lagRef = useRef(hp)
  const prevHp = useRef(hp)
  const [shock, setShock] = useState(false)
  useEffect(() => {
    const dropped = hp < prevHp.current
    prevHp.current = hp
    if (!dropped) {
      // 회복은 즉시 따라붙는다 — 잔상은 피해를 보여 주기 위한 장치다
      lagRef.current = hp
      setLag(hp)
      return
    }
    setShock(true)
    const catchUp = setTimeout(() => {
      lagRef.current = hp
      setLag(hp)
    }, 340)
    const calm = setTimeout(() => setShock(false), 320)
    return () => {
      clearTimeout(catchUp)
      clearTimeout(calm)
    }
  }, [hp])
  const lagPct = Math.max(0, (Math.max(lag, hp) / maxHp) * 100)

  return (
    <div
      className={`bhud__side bhud__side--${side} ${shock ? 'is-shock' : ''}`}
      style={{ ['--accent' as string]: char.accent }}
    >
      <div className="bhud__name">
        {char.name}
        {isLocal && <span className="bhud__you">나</span>}
      </div>
      {/* ⚠ 채움 막대만 클립한다. 숫자를 overflow:hidden 안에 두면 기울어진(skewX)
          모서리에 글자가 잘린다 — 예전에 그래서 "HP 205 / 205"의 위아래가 깎였다. */}
      <div className="bhud__hp">
        <div className="bhud__barclip">
          <div
            className={`bhud__hplag bhud__hpfill--${side}`}
            style={{ width: `${lagPct}%` }}
          />
          <div
            className={`bhud__hpfill bhud__hpfill--${side} ${hpLow ? 'bhud__hpfill--low' : ''}`}
            style={{ width: `${hpPct}%` }}
          />
          <div className={`bhud__hpshock ${shock ? 'is-on' : ''}`} />
        </div>
        <span className="bhud__hpnum">
          HP {Math.ceil(hp)} / {maxHp}
        </span>
      </div>
      <div className="bhud__energy">
        <div className="bhud__barclip">
          <div className={`bhud__energyfill bhud__energyfill--${side}`} style={{ width: `${ePct}%` }} />
        </div>
        <span className="bhud__energynum">
          ⚡ {Math.floor(energy)} / {char.maxEnergy}
        </span>
      </div>
    </div>
  )
}
