// ---------------------------------------------------------------------------
// 카드 강화 — 룰렛 (2026-11 · 시안 docs/redesign/screens/Upgrade.dc.html · 규칙 CARD_UPGRADE.md)
//
// ① 카드 고르기(이동만 불가) → ② 수치/범위 → ③ 60칸 룰렛 → ④ (범위면) 칸 직접 고르기 → ⑤ 저장.
// 룰렛은 **결과를 먼저 뽑고**(`rollRoulette`) 그 숫자 칸 하나에 바늘을 세운다 — 그래서
// 그림과 확률이 늘 맞는다. 규칙 계산은 전부 `game/upgrades.ts`에 있고 여기선 그리기만 한다.
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react'
import { getChar } from '../../data/roster'
import type { CardDef, Offset } from '../../battle/types'
import {
  applyCardUpgrade,
  cardUpgrade,
  runCard,
  type RunState,
} from '../../game/run'
import { resolveRunCard } from '../../game/runcards'
import {
  EDIT_DF,
  EDIT_DU,
  MAX_UPGRADE,
  ROULETTE_RANGE,
  ROULETTE_SLOTS,
  ROULETTE_VALUE,
  addUpgrade,
  canPickCell,
  canWidenRange,
  cellsForTap,
  rollRoulette,
  rouletteSlots,
  upgradeBlockReason,
  upgradedCard,
  valueFieldOf,
  type RouletteTable,
  type UpgradeMode,
} from '../../game/upgrades'
import { CardFace, cardAccent } from '../CardFace'
import { useCardZoom } from '../CardDetail'
import { playSfx } from '../sfx'

export type UpgradeSource = 'rest' | 'shop' | 'forge'
const SOURCE_LABEL: Record<UpgradeSource, string> = { rest: '모닥불', shop: '상점 · 마렌', forge: '대장장이' }
const SOURCE_NOTE: Record<UpgradeSource, string> = {
  rest: '모닥불에서는 쉬기와 강화 중 하나만 고른다. 꽝(0)이 나와도 강화 기회는 쓴 것이다.',
  shop: '상점 강화는 상점마다 한 번. 꽝(0)이 나오면 돈도 돌려받지 못한다.',
  forge: '꺼지지 않는 화로. 꽝(0)이 나와도 기회는 한 번뿐이다.',
}

/** 판의 숫자별 색 — 0(꽝)은 어둡게, 클수록 뜨겁게. */
const VALUE_COLOR = ['#4a4058', '#6ab8ff', '#6ab83a', '#ffb43a', '#ff7a3a', '#e0485a']
const colorOf = (table: RouletteTable, v: number) => VALUE_COLOR[Math.max(0, table.findIndex(([x]) => x === v))]

const SPIN_MS = 5200
const SPIN_TURNS = 7
const SLICE = 360 / ROULETTE_SLOTS

type Step = 'pick' | 'path' | 'spin' | 'cells' | 'done'

const key = (o: Offset) => `${o.df},${o.du}`

/** 9×5 사거리 격자(df −4…4 · du +2…−2). 오른쪽이 앞. */
function RangeGrid({
  range,
  picks = [],
  can,
  cell,
  onTap,
}: {
  range: readonly Offset[]
  picks?: readonly Offset[]
  can?: (c: Offset) => boolean
  cell: number
  onTap?: (c: Offset) => void
}) {
  const inRange = new Set(range.map(key))
  const picked = new Set(picks.map(key))
  const rows: Offset[][] = []
  for (let du = EDIT_DU; du >= -EDIT_DU; du--) {
    const row: Offset[] = []
    for (let df = -EDIT_DF; df <= EDIT_DF; df++) row.push({ df, du })
    rows.push(row)
  }
  return (
    <div className="up__grid" style={{ gridTemplateColumns: `repeat(${EDIT_DF * 2 + 1}, ${cell}px)` }}>
      {rows.flat().map((c) => {
        const k = key(c)
        const me = c.df === 0 && c.du === 0
        const cls = me
          ? 'up__rc up__rc--me'
          : picked.has(k)
            ? 'up__rc up__rc--pick'
            : inRange.has(k)
              ? 'up__rc up__rc--on'
              : can?.(c)
                ? 'up__rc up__rc--can'
                : 'up__rc'
        const tappable = onTap && (picked.has(k) || can?.(c))
        return tappable ? (
          <button
            key={k}
            type="button"
            className={cls}
            style={{ width: cell, height: cell }}
            aria-label={`앞 ${c.df} · 위 ${c.du}`}
            onClick={() => onTap!(c)}
          />
        ) : (
          <span key={k} className={cls} style={{ width: cell, height: cell }} />
        )
      })}
    </div>
  )
}

export function UpgradeScreen({
  run,
  source,
  onDone,
  onCancel,
}: {
  run: RunState
  source: UpgradeSource
  /** 강화가 끝났다(꽝 포함) — 결과 run. */
  onDone: (next: RunState) => void
  /** 돌리기 전에 그만둔다(없으면 그만둘 수 없다). */
  onCancel?: () => void
}) {
  const char = getChar(run.charId)
  const zoom = useCardZoom(char.accent)
  const [step, setStep] = useState<Step>('pick')
  const [cardId, setCardId] = useState<string | null>(null)
  const [mode, setMode] = useState<UpgradeMode>('value')
  const [result, setResult] = useState<number | null>(null)
  const [rot, setRot] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [picks, setPicks] = useState<Offset[]>([])
  const [mirror, setMirror] = useState(true)
  const [final, setFinal] = useState<RunState | null>(null)

  const deck = run.deck
  const firstOk = deck.find((id) => {
    const c = resolveRunCard(run.charId, id)
    return c && !upgradeBlockReason(c, cardUpgrade(run, id))
  })
  const selId = cardId ?? firstOk ?? null
  const base = selId ? resolveRunCard(run.charId, selId) : undefined
  const cur = selId ? runCard(run, selId) : undefined
  const blocked = base ? upgradeBlockReason(base, cardUpgrade(run, selId!)) : '고를 카드가 없다'
  const vf = base ? valueFieldOf(base) : null
  const table = mode === 'value' ? ROULETTE_VALUE : ROULETTE_RANGE
  const slots = useMemo(() => rouletteSlots(table), [table])

  const spin = (m: UpgradeMode) => {
    const t = m === 'value' ? ROULETTE_VALUE : ROULETTE_RANGE
    const v = rollRoulette(t)
    const at = rouletteSlots(t)
      .map((x, i) => (x === v ? i : -1))
      .filter((i) => i >= 0)
    const k = at[Math.floor(Math.random() * at.length)]
    const jitter = (Math.random() - 0.5) * (SLICE * 0.6)
    setMode(m)
    setResult(v)
    setPicks([])
    setStep('spin')
    setRot(0)
    // 다음 프레임에 목표 각도로 — 0에서 출발하는 전이가 실제로 일어나게.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setSpinning(true)
        setRot(SPIN_TURNS * 360 + (360 - (k * SLICE + SLICE / 2)) + jitter)
      }),
    )
    playSfx('confirm')
    window.setTimeout(() => {
      setSpinning(false)
      playSfx(v > 0 ? 'heal' : 'block')
    }, SPIN_MS)
  }

  const finishValue = () => {
    const next = applyCardUpgrade(run, selId!, { value: result ?? 0 })
    setFinal(next)
    setStep('done')
  }
  const finishCells = () => {
    const next = applyCardUpgrade(run, selId!, { cells: picks })
    setFinal(next)
    setStep('done')
  }

  const curRange = cur?.range ?? []
  const left = (result ?? 0) - picks.length
  const tapCell = (c: Offset) => {
    const last = picks[picks.length - 1]
    if (last && last.df === c.df && last.du === c.du) {
      setPicks(picks.slice(0, -1))
      return
    }
    const add = cellsForTap(curRange, picks, c, mirror, left)
    if (add.length) setPicks([...picks, ...add])
  }

  const preview: CardDef | undefined =
    base && step !== 'pick'
      ? upgradedCard(
          base,
          addUpgrade(cardUpgrade(run, selId!), mode === 'value' ? { value: result ?? 0 } : { cells: picks }),
        )
      : undefined

  return (
    <div className="screen up">
      <div className="up__bg" aria-hidden="true" />
      <header className="up__head">
        <div className="up__title">
          <span className="up__anvil" aria-hidden="true" />
          <h1>카드 강화</h1>
          <span className="up__src">{SOURCE_LABEL[source]}</span>
        </div>
        <ol className="up__crumbs">
          {(['카드', '종류', '룰렛', '적용', '저장'] as const).map((label, i) => {
            const at = { pick: 0, path: 1, spin: 2, cells: 3, done: 4 }[step]
            return (
              <li key={label} className={i < at ? 'is-done' : i === at ? 'is-on' : ''}>
                {label}
              </li>
            )
          })}
        </ol>
        <span className="up__gold">🪙 {run.gold}</span>
      </header>

      {step === 'pick' && (
        <>
          <section className="up__panel up__sel">
            <div className="up__selhead">
              <span className="up__kicker">SELECTED</span>
              {base && (
                <span className="up__lvl">
                  강화 {cardUpgrade(run, selId!)?.times ?? 0}/{MAX_UPGRADE}
                </span>
              )}
            </div>
            {cur && (
              <>
                <h2 className="up__name">{cur.name}</h2>
                <div className="up__stats">
                  {vf && (
                    <span className="up__stat up__stat--dm">
                      {vf.short} {cur[vf.field]}
                    </span>
                  )}
                  {cur.energyCost !== undefined && <span className="up__stat up__stat--en">EN {cur.energyCost}</span>}
                </div>
                {cur.range && <RangeGrid range={cur.range} cell={32} />}
                {cur.range && <span className="up__hint">가운데 금색 = 나 · 빨강 = 맞는 칸 · 오른쪽이 앞</span>}
                <p className="up__desc">{cur.desc}</p>
              </>
            )}
            <div className="up__note">{SOURCE_NOTE[source]}</div>
          </section>
          <section className="up__deck">
            <h2>
              어떤 카드를 강화할까? <small>덱 {deck.length}장 · 이동 카드는 강화할 수 없다</small>
            </h2>
            <div className="up__deckgrid">
              {deck.map((id) => {
                const b = resolveRunCard(run.charId, id)
                const c = runCard(run, id)
                if (!b || !c) return null
                const why = upgradeBlockReason(b, cardUpgrade(run, id))
                return (
                  <button
                    key={id}
                    type="button"
                    aria-disabled={!!why}
                    className={`up__dk ${id === selId ? 'is-on' : ''} ${why ? 'is-locked' : ''}`}
                    {...zoom.bind(c)}
                    onClick={() => {
                      if (zoom.consumedClick() || why) return
                      setCardId(id)
                    }}
                  >
                    <CardFace card={c} accent={cardAccent(c, char.accent)} compact />
                    {why && <span className="up__lock">{why}</span>}
                  </button>
                )
              })}
            </div>
            <div className="up__actions">
              <span className="up__tip">
                강화는 <b className="t-gold">수치</b>(피해 · 방어 · 회복) 또는 <b className="t-orange">범위</b>(공격 카드만). 카드당 최대{' '}
                {MAX_UPGRADE}번.
              </span>
              {onCancel && (
                <button type="button" className="up__ghost" onClick={onCancel}>
                  그만둔다
                </button>
              )}
              <button type="button" className="up__go" disabled={!!blocked} onClick={() => setStep('path')}>
                이 카드로 ▶
              </button>
            </div>
          </section>
        </>
      )}

      {step === 'path' && base && cur && (
        <section className="up__path">
          <div className="up__chip">
            {cur.name} {vf && <b>{vf.short} {cur[vf.field]}</b>}
          </div>
          <h2>무엇을 강화할까?</h2>
          <div className="up__tiles">
            <button type="button" className="up__tile" disabled={!vf} onClick={() => spin('value')}>
              <span className="up__kicker t-gold">{vf?.short ?? 'VALUE'}</span>
              <b>{vf?.label ?? '수치'}</b>
              <div className="up__arrow">
                <span>{vf ? cur[vf.field] : '-'}</span>→<span className="t-gold">{vf ? `${cur[vf.field]}+?` : '-'}</span>
              </div>
              <div className="up__chips">
                {ROULETTE_VALUE.map(([v]) => (
                  <span key={v} style={{ background: colorOf(ROULETTE_VALUE, v) }}>
                    {v ? `+${v}` : '꽝'}
                  </span>
                ))}
              </div>
              <span className="up__tiletext">룰렛에 걸린 숫자만큼 {vf?.label ?? '수치'}이 오른다. 바로 적용 — 고를 것 없음.</span>
            </button>
            <button type="button" className="up__tile" disabled={!canWidenRange(base)} onClick={() => spin('range')}>
              <span className="up__kicker t-orange">RANGE</span>
              <b>범위</b>
              {cur.range ? (
                <RangeGrid range={cur.range} can={(c) => canPickCell(cur.range!, [], c)} cell={22} />
              ) : null}
              <span className="up__tiletext">
                걸린 숫자만큼 <b className="t-orange">지금 범위에 붙은 칸</b>을 직접 골라 넓힌다(주황 점선 = 고를 수 있는 칸).
              </span>
              {!canWidenRange(base) && <span className="up__warn">범위가 없는 카드 — 수치만 강화할 수 있다</span>}
            </button>
          </div>
          <button type="button" className="up__ghost" onClick={() => setStep('pick')}>
            ← 다른 카드
          </button>
        </section>
      )}

      {step === 'spin' && (
        <>
          <div className={`up__wheelbox ${spinning ? 'is-spinning' : ''}`} aria-label={`룰렛 결과 ${spinning ? '…' : result}`}>
            <div className="up__rim" />
            {Array.from({ length: 36 }, (_, i) => (
              <span key={i} className={`up__bulb ${i % 2 ? 'b2' : 'b1'}`} style={{ transform: `rotate(${i * 10}deg) translateY(-206px)` }} />
            ))}
            <div
              className="up__wheel"
              style={{
                background: `conic-gradient(${slots.map((v, i) => `${colorOf(table, v)} ${i * SLICE}deg ${(i + 1) * SLICE}deg`).join(',')})`,
                transform: `rotate(${rot}deg)`,
                transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.08,0.72,0.08,1)` : 'none',
              }}
            >
              {slots.map((v, i) => (
                <span key={i} className="up__lab" style={{ transform: `rotate(${i * SLICE + SLICE / 2}deg) translateY(-168px)` }}>
                  {v}
                </span>
              ))}
            </div>
            <div className="up__ptr" aria-hidden="true" />
            <div className={`up__hub ${!spinning ? 'is-res' : ''}`} style={!spinning && result !== null ? { background: colorOf(table, result) } : undefined}>
              {spinning ? '?' : result}
            </div>
          </div>
          <section className="up__panel up__spinpanel">
            <span className="up__kicker" style={{ color: mode === 'value' ? '#ffd86a' : '#ff9a3a' }}>
              {mode === 'value' ? 'VALUE' : 'RANGE'} ROULETTE
            </span>
            <h2>{spinning ? '돌아가는 중…' : result ? (mode === 'value' ? `${vf?.label} +${result}!` : `범위 +${result}칸!`) : '꽝…'}</h2>
            <div className="up__probs">
              {table.map(([v, p]) => (
                <div key={v} className={`up__prow ${!spinning && v === result ? 'is-on' : ''}`}>
                  <i style={{ background: colorOf(table, v) }} />
                  <b>{mode === 'value' ? (v ? `+${v}` : '0') : v}</b>
                  <span>{v ? (mode === 'value' ? `${vf?.label} +${v}` : `칸 ${v}개`) : '꽝 — 아무 일도 없다'}</span>
                  <em>{p}%</em>
                </div>
              ))}
            </div>
            {!spinning && (
              <div className="up__actions">
                {result === 0 && (
                  <button type="button" className="up__go" onClick={() => onDone(run)}>
                    받아들인다 ▶
                  </button>
                )}
                {!!result && mode === 'value' && (
                  <button type="button" className="up__go" onClick={finishValue}>
                    적용 ▶
                  </button>
                )}
                {!!result && mode === 'range' && (
                  <button type="button" className="up__go" onClick={() => setStep('cells')}>
                    칸 고르기 ▶
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {step === 'cells' && cur && (
        <section className="up__cells">
          <div className="up__panel up__cellpanel">
            <h2>
              붙은 칸 {result}개를 고른다 <small>남은 칸 {left}</small>
            </h2>
            <RangeGrid
              range={curRange}
              picks={picks}
              can={(c) => left > 0 && canPickCell(curRange, picks, c)}
              cell={46}
              onTap={tapCell}
            />
            <div className="up__cellbar">
              <button type="button" className="up__toggle" aria-pressed={mirror} onClick={() => setMirror(!mirror)}>
                <span className={`up__sw ${mirror ? 'is-on' : ''}`}>
                  <span />
                </span>
                앞뒤 대칭으로 찍기
              </button>
              <button type="button" className="up__ghost" disabled={!picks.length} onClick={() => setPicks(picks.slice(0, -1))}>
                되돌리기
              </button>
              <button type="button" className="up__ghost" disabled={!picks.length} onClick={() => setPicks([])}>
                초기화
              </button>
            </div>
            <span className="up__hint">주황 점선 = 지금 고를 수 있는 칸 · 고를수록 다음 칸이 열린다 · 마지막 칸을 다시 누르면 뺀다</span>
          </div>
          <div className="up__panel up__after">
            <span className="up__kicker">AFTER</span>
            {preview && <CardFace card={preview} accent={cardAccent(preview, char.accent)} compact />}
            <span className="up__hint">
              맞는 칸 {curRange.length} → {curRange.length + picks.length}
            </span>
            <button type="button" className="up__go" disabled={left > 0} onClick={finishCells}>
              저장 ▶
            </button>
          </div>
        </section>
      )}

      {step === 'done' && final && selId && (
        <section className="up__done">
          <h2>{runCard(final, selId)?.name} 완성!</h2>
          {(() => {
            const c = runCard(final, selId)
            return c ? (
              <div className="up__donecard" {...zoom.bind(c)}>
                <CardFace card={c} accent={cardAccent(c, char.accent)} compact />
              </div>
            ) : null
          })()}
          <p>{runCard(final, selId)?.upgradeNote}</p>
          <button type="button" className="up__go" onClick={() => onDone(final)}>
            {source === 'shop' ? '상점으로 ▶' : '지도로 ▶'}
          </button>
        </section>
      )}
      {zoom.sheet}
    </div>
  )
}
