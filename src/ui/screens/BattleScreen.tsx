import { useEffect, useMemo, useRef, useState } from 'react'
import { getChar } from '../../data/roster'
import { buildFighterSvg } from '../../art/art'
import { CardBattle, planAffordable } from '../../battle/engine'
import { decideAI } from '../../battle/ai'
import { deckFor } from '../../battle/cards'
import {
  LANE,
  type ActionResult,
  type Beat,
  type CardDef,
  type Difficulty,
  type Stance,
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
  pos: [number, number]
  stance: [Stance, Stance]
  hp: [number, number]
  energy: [number, number]
  guard: [boolean, boolean]
  attacking: [boolean, boolean]
  damage: [number, number]
  fx: [Fx | null, Fx | null]
  label: [string, string]
}

const X0 = 15
const X1 = 85
const xPct = (pos: number) => X0 + (pos / (LANE - 1)) * (X1 - X0)
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const RESULT_TEXT: Partial<Record<ActionResult, string>> = {
  hit: '명중!',
  blocked: '가드됨',
  whiff: '빗나감',
  nofuel: '기력부족',
  guard: '가드',
  energy: '원기 +',
  jump: '점프',
  crouch: '앉기',
}

function baseView(b: CardBattle): View {
  const s = b.state
  return {
    pos: [s.pos[0], s.pos[1]],
    stance: ['stand', 'stand'],
    hp: [s.hp[0], s.hp[1]],
    energy: [s.energy[0], s.energy[1]],
    guard: [false, false],
    attacking: [false, false],
    damage: [0, 0],
    fx: [null, null],
    label: ['', ''],
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
  const [banner, setBanner] = useState<string | null>(null)
  const cancelled = useRef(false)

  // ---- plan building -----------------------------------------------------
  const addCard = (c: CardDef) => {
    if (phase !== 'select') return
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

  const filled = slots.every((c): c is CardDef => c !== null)
  const affordable =
    filled && planAffordable(slots as CardDef[], battle.state.energy[0], player.maxEnergy)

  // running energy preview to dim unaffordable deck cards
  const energyNow = battle.state.energy[0]

  // ---- resolve a turn ----------------------------------------------------
  const confirm = async () => {
    if (!filled || !affordable || phase !== 'select') return
    const playerPlan = slots as CardDef[]
    const aiPlan = decideAI(battle.state, 1, enemy, opponent.difficulty)
    const prevHp: [number, number] = [battle.state.hp[0], battle.state.hp[1]]
    const beats = battle.resolveTurn(playerPlan, aiPlan)
    setPhase('resolving')

    let last: [number, number] = prevHp
    for (const beat of beats) {
      if (cancelled.current) return
      setView(beatToView(beat, last))
      last = [beat.snapshot.hp[0], beat.snapshot.hp[1]]
      await wait(980)
      if (cancelled.current) return
    }

    // settle to neutral
    setView(baseView(battle))

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
    setPhase('select')
  }

  // stop the beat animation loop if we unmount mid-resolve
  useEffect(() => {
    cancelled.current = false
    return () => {
      cancelled.current = true
    }
  }, [])

  const dist = Math.abs(view.pos[0] - view.pos[1])

  return (
    <div className="screen battle">
      <div className="grid-bg" />

      <BattleHud
        player={player}
        enemy={enemy}
        view={view}
        turn={battle.state.turn}
        onQuit={onQuit}
      />

      <div className="board">
        <div className="board__dist">거리 {dist}</div>
        <div className="board__lane">
          {Array.from({ length: LANE }, (_, i) => (
            <span className="board__tick" key={i} style={{ left: `${xPct(i)}%` }} />
          ))}
        </div>
        <FighterSprite svg={svgs[0]} side="left" accent={player.accent} v={view} idx={0} />
        <FighterSprite svg={svgs[1]} side="right" accent={enemy.accent} v={view} idx={1} />

        {banner && <div className="board__banner">{banner}</div>}
        {phase === 'resolving' && !banner && <div className="board__turnflash">RESOLVE</div>}
      </div>

      {phase === 'select' ? (
        <div className="cards">
          <div className="cards__slots">
            {slots.map((c, i) => (
              <button
                key={i}
                className={`slot ${c ? 'slot--filled' : ''}`}
                onClick={() => clearSlot(i)}
                style={c ? ({ ['--accent' as string]: cardAccent(c, player.accent) }) : undefined}
              >
                <span className="slot__no">{i + 1}</span>
                {c ? <CardFace card={c} accent={cardAccent(c, player.accent)} /> : <span className="slot__empty">카드</span>}
              </button>
            ))}
            <div className="cards__actions">
              <button className="btn btn--ghost cards__reset" onClick={reset} disabled={slots.every((s) => !s)}>
                초기화
              </button>
              <button className={`btn cards__confirm ${affordable ? '' : 'is-disabled'}`} onClick={confirm} disabled={!affordable}>
                {filled && !affordable ? '기력 부족' : '실행 ▶'}
              </button>
            </div>
          </div>

          <div className="cards__hand">
            {deck.map((c) => {
              const dim = c.kind === 'attack' && (c.energyCost ?? 0) > energyNow
              return (
                <button
                  key={c.id}
                  className={`handcard ${dim ? 'is-dim' : ''}`}
                  onClick={() => addCard(c)}
                  style={{ ['--accent' as string]: cardAccent(c, player.accent) }}
                >
                  <CardFace card={c} accent={cardAccent(c, player.accent)} />
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="cards cards--resolving">
          <div className="cards__status">{view.label[0] || ' '}</div>
        </div>
      )}

      <div className="scanlines" />
    </div>
  )
}

// ---------------------------------------------------------------------------

function beatToView(beat: Beat, prevHp: [number, number]): View {
  const s = beat.snapshot
  const a0 = beat.actions[0]
  const a1 = beat.actions[1]
  const isAtk = (r: ActionResult) => r === 'hit' || r === 'blocked' || r === 'whiff'
  const label = (a: typeof a0) => `${a.card?.name ?? ''} ${RESULT_TEXT[a.result] ?? ''}`.trim()
  return {
    pos: [s.pos[0], s.pos[1]],
    stance: [s.stance[0], s.stance[1]],
    hp: [s.hp[0], s.hp[1]],
    energy: [s.energy[0], s.energy[1]],
    guard: [s.guard[0], s.guard[1]],
    attacking: [isAtk(a0.result), isAtk(a1.result)],
    damage: [Math.max(0, prevHp[0] - s.hp[0]), Math.max(0, prevHp[1] - s.hp[1])],
    fx: [
      a0.card?.kind === 'attack' && a0.result !== 'nofuel' ? { kind: a0.card.fx ?? 'punch', result: a0.result } : null,
      a1.card?.kind === 'attack' && a1.result !== 'nofuel' ? { kind: a1.card.fx ?? 'punch', result: a1.result } : null,
    ],
    label: [label(a0), label(a1)],
  }
}

function cardAccent(c: CardDef, fallback: string): string {
  if (c.kind === 'attack') return c.accent ?? fallback
  if (c.kind === 'guard') return '#9fc2ff'
  if (c.kind === 'energy') return '#ffe14d'
  return '#8493bd'
}

function CardFace({ card, accent }: { card: CardDef; accent: string }) {
  const icon =
    card.kind === 'attack'
      ? '⚔️'
      : card.kind === 'guard'
        ? '🛡'
        : card.kind === 'energy'
          ? '⚡'
          : card.dir === 'forward'
            ? '▶'
            : card.dir === 'back'
              ? '◀'
              : card.dir === 'up'
                ? '▲'
                : '▼'
  return (
    <div className={`cardface cardface--${card.kind}`} style={{ ['--accent' as string]: accent }}>
      <div className="cardface__top">
        <span className="cardface__icon">{icon}</span>
        {card.signature && <span className="cardface__sig">SP</span>}
      </div>
      <div className="cardface__name">{card.name}</div>
      {card.kind === 'attack' && (
        <div className="cardface__meta">
          <span>⚔️{card.damage}</span>
          <span>↔{card.reach}</span>
          <span>⚡{card.energyCost}</span>
        </div>
      )}
      {card.kind === 'guard' && <div className="cardface__meta"><span>피해 −{card.block}</span></div>}
      {card.kind === 'energy' && <div className="cardface__meta"><span>기력 +{card.gain}</span></div>}
      {card.kind === 'move' && <div className="cardface__meta"><span>{card.desc}</span></div>}
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
    `is-${v.stance[idx]}`,
    v.attacking[idx] ? 'is-attacking' : '',
    v.damage[idx] > 0 ? 'is-hit' : '',
    v.guard[idx] ? 'is-guard' : '',
  ].join(' ')
  const fx = v.fx[idx]
  return (
    <div className={cls} style={{ left: `${xPct(v.pos[idx])}%`, ['--accent' as string]: accent }}>
      {v.damage[idx] > 0 && <div className="fighter__dmg">-{v.damage[idx]}</div>}
      {v.label[idx] && <div className="fighter__say">{v.label[idx]}</div>}
      {v.guard[idx] && <div className="fighter__shield" />}
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
