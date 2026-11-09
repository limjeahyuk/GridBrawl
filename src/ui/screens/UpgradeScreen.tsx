// 룰렛 카드 강화(디자인 `Upgrade` · 규칙 `docs/redesign/CARD_UPGRADE.md`).
// 카드 → 강화 종류(수치/범위) → 60칸 룰렛 → (범위면 칸 고르기) → 저장.
// 모닥불·상점·대장장이 이벤트가 같은 화면을 쓴다.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CardDef, Offset } from '../../battle/types'
import { regionOf, runCard, upgradeBlockOf, upgradeCard, type RunState } from '../../game/run'
import {
  MAX_UPGRADE, ROULETTE_RANGE, ROULETTE_VALUE, VALUE_LABEL, canPickCell, canUpgradeRange,
  spinRoulette, valueFieldOf, type RouletteTable,
} from '../../game/upgrades'
import { SceneLayers } from '../SceneLayers'

export type UpgradeSource = 'rest' | 'shop' | 'event'
type Step = 'pick' | 'path' | 'spin' | 'value' | 'range' | 'done'
type Path = 'value' | 'range'

const DFS = [-4, -3, -2, -1, 0, 1, 2, 3, 4]
const DUS = [2, 1, 0, -1, -2]
const ME = '#f4d470', HIT = '#e0485a', NEW = '#ff9a3a', EMPTY = '#2a2438'
const has = (arr: Offset[], df: number, du: number) => arr.some((o) => o.df === df && o.du === du)
const costOf = (c: CardDef) => c.energyCost ?? c.guardCost ?? c.healCost ?? c.buffCost ?? 0
const statOf = (c: CardDef): number | null => {
  const f = valueFieldOf(c)
  return f ? (c[f] ?? 0) : null
}

/** 9×5 사거리 격자(앞뒤 4칸 · 위아래 2줄). 가운데 = 나. */
function RangeGrid({ range, extra = [], cell }: { range: Offset[]; extra?: Offset[]; cell: number }) {
  return (
    <span className="upg__grid" style={{ gridTemplateColumns: `repeat(9, ${cell}px)` }} aria-hidden>
      {DUS.flatMap((du) =>
        DFS.map((df) => (
          <i
            key={`${df},${du}`}
            style={{
              width: cell,
              height: cell,
              background: df === 0 && du === 0 ? ME : has(extra, df, du) ? NEW : has(range, df, du) ? HIT : EMPTY,
            }}
          />
        )),
      )}
    </span>
  )
}

/** 60칸 배치 — 숫자마다 원 둘레에 등간격으로 흩뿌리고 같은 숫자가 붙은 자리를 바꾼다(시안 `seq`). */
function wheelSeq(table: RouletteTable): number[] {
  const ent: [number, number][] = []
  table.forEach(([v, p], j) => {
    const n = Math.round(p * 0.6)
    for (let k = 0; k < n; k++) ent.push([(k + ((j * 0.37 + 0.11) % 1)) / n, v])
  })
  const out = ent.sort((a, b) => a[0] - b[0]).map((e) => e[1])
  const L = out.length
  for (let pass = 0; pass < 4; pass++)
    for (let i = 0; i < L; i++) {
      const a = out[(i - 1 + L) % L]
      if (out[i] !== a) continue
      for (let d = 1; d < L; d++) {
        const j = (i + d) % L
        const b = out[j]
        if (b !== a && out[(j - 1 + L) % L] !== out[i] && out[(j + 1) % L] !== out[i] && out[(i + 1) % L] !== b) {
          out[j] = out[i]
          out[i] = b
          break
        }
      }
    }
  return out
}
const TONE = [
  ['#3a3448', '#2e2a3a', '#b9b1c9'], ['#3a6aa8', '#2e5690', '#e4f0ff'], ['#3c9c98', '#2e8480', '#e4fffc'],
  ['#6ab83a', '#58a02e', '#f0ffe4'], ['#a46ae0', '#8c56c8', '#f6ecff'], ['#ffd24a', '#e8b830', '#1d1408'],
]
const toneMap = (table: RouletteTable) => {
  const m: Record<number, string[]> = {}
  table.forEach(([v], i) => (m[v] = i === table.length - 1 ? TONE[5] : TONE[i]))
  return m
}
const SPIN_MS = 5200

export function UpgradeScreen({
  run,
  source,
  onDone,
  onCancel,
}: {
  run: RunState
  source: UpgradeSource
  /** 강화가 끝난(꽝이어도) 런. */
  onDone: (next: RunState) => void
  /** 룰렛을 돌리기 전에만 — 이 강화 기회를 쓰지 않고 돌아간다. */
  onCancel?: () => void
}) {
  const deck = run.deck
  const firstOk = deck.find((id) => !upgradeBlockOf(run, id)) ?? deck[0]
  const [cardId, setCardId] = useState(firstOk)
  const [step, setStep] = useState<Step>('pick')
  const [path, setPath] = useState<Path>('value')
  const [rot, setRot] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<number | null>(null)
  const [picks, setPicks] = useState<Offset[]>([])
  const [mirror, setMirror] = useState(false)
  const [saved, setSaved] = useState<RunState | null>(null)
  const timer = useRef<number>(0)
  useEffect(() => () => clearTimeout(timer.current), [])

  const card = runCard(run, cardId)!
  const lvl = run.upgrades[cardId]?.times ?? 0
  const block = upgradeBlockOf(run, cardId)
  const vf = valueFieldOf(card)
  const stat = vf ? VALUE_LABEL[vf] : null
  const range = card.range ?? []
  const rangeOk = canUpgradeRange(card)
  const table: RouletteTable = path === 'value' ? ROULETTE_VALUE : ROULETTE_RANGE
  const seq = useMemo(() => wheelSeq(table), [table])
  const tone = useMemo(() => toneMap(table), [table])
  const SL = 360 / seq.length
  const wheelBg = `conic-gradient(from 0deg, ${seq
    .map((v, i) => {
      const a = i * SL, b = (i + 1) * SL
      return `#0a0810 ${a}deg ${a + 0.5}deg, ${tone[v][i % 2]} ${a + 0.5}deg ${b}deg`
    })
    .join(', ')})`

  const isShop = source === 'shop'
  const srcLabel = isShop ? '상점 · 강화' : source === 'rest' ? '휴식 · 모닥불' : '이벤트 · 대장간'
  const leaveLabel = isShop ? '← 상점으로' : source === 'rest' ? '← 모닥불로' : '← 그만둔다'

  const spin = () => {
    const v = spinRoulette(table)
    const idxs = seq.map((x, i) => (x === v ? i : -1)).filter((i) => i >= 0)
    const k = idxs[Math.floor(Math.random() * idxs.length)]
    const target = -((k + 0.5) * SL + (Math.random() - 0.5) * SL * 0.6)
    const curMod = ((rot % 360) + 360) % 360
    const tgtMod = ((target % 360) + 360) % 360
    setRot(rot + 360 * 7 + ((tgtMod - curMod + 360) % 360))
    setSpinning(true)
    setResult(null)
    timer.current = window.setTimeout(() => {
      setSpinning(false)
      setResult(v)
    }, SPIN_MS + 100)
  }
  const afterSpin = () => {
    if (path === 'range' && result) {
      setPicks([])
      setStep('range')
    } else setStep('value')
  }
  const commit = (gain: { value?: number; cells?: Offset[] }) => {
    setSaved(upgradeCard(run, cardId, gain))
    setStep('done')
  }

  const left = (result ?? 0) - picks.length
  const allCells = [...range, ...picks]
  const tapCell = (df: number, du: number) => {
    const pi = picks.findIndex((o) => o.df === df && o.du === du)
    if (pi >= 0) {
      if (pi === picks.length - 1) setPicks(picks.slice(0, -1)) // 마지막 칸만 뺀다 — 가운데를 빼면 떨어진 칸이 생긴다
      return
    }
    if (left <= 0 || !canPickCell(range, picks, { df, du })) return
    const add = [{ df, du }]
    if (mirror && df !== 0 && left >= 2 && !has(allCells, -df, du)) add.push({ df: -df, du })
    setPicks([...picks, ...add])
  }
  // 판 미리보기: 나 = 2열(col 1, row 1), 적 둘.
  const foes = [{ c: 3, r: 1 }, { c: 4, r: 2 }]
  const hits = foes.filter(({ c, r }) => has(allCells, c - 1, 1 - r)).length

  const crumbIdx = { pick: 0, path: 1, spin: 2, value: 3, range: 3, done: 4 }[step]
  const stepCrumbs = ['카드', '강화 종류', '룰렛', '적용', '저장']
  const finalCard = saved ? runCard(saved, cardId)! : card
  const statNum = statOf(card)

  return (
    <div className="screen upg">
      <SceneLayers scene={regionOf(run.floor)} />
      <div className="screenveil" />
      <header className="upg__head">
        <div className="upg__title">
          <i className="upg__anvil" aria-hidden />
          <h1>카드 강화</h1>
          <span className={`upg__src upg__src--${source}`}>{srcLabel}</span>
        </div>
        <div className="upg__crumbs">
          {stepCrumbs.map((c, i) => (
            <span key={c} className={i === crumbIdx ? 'is-on' : ''}>
              {i < crumbIdx ? '✓ ' : ''}
              {c}
            </span>
          ))}
        </div>
        <span className="goldchip">
          <i className="coin coin--sm" aria-hidden />
          {run.gold}
        </span>
      </header>

      {step === 'pick' && (
        <>
          <section className="upg__sel rise">
            <div className="upg__selhead">
              <span>SELECTED</span>
              <span className={block ? 'is-bad' : lvl ? 'is-up' : ''}>{block ?? `강화 ${lvl}/${MAX_UPGRADE}`}</span>
            </div>
            <h2>{card.name}</h2>
            <div className="upg__chips">
              <span className="upg__dm">{stat ? `${stat.tag} ${statNum}` : 'MOVE'}</span>
              <span className="upg__en">EN {costOf(card)}</span>
            </div>
            <RangeGrid range={range} cell={32} />
            <span className="upg__hint">가운데 금색 = 나 · 빨강 = 맞는 칸 · 앞(오른쪽) 4칸 · 뒤 4칸 · 위아래 2줄</span>
            <p>{card.desc}</p>
            <div className="upg__note">
              {isShop
                ? '상점 강화: 상점마다 한 번. 룰렛을 돌린 뒤엔 결과가 0이어도 돈은 돌려받지 못한다.'
                : source === 'rest'
                  ? '모닥불에선 쉬기(체력 회복)와 강화 중 하나만 고를 수 있다. 결과가 0이면 그걸로 끝.'
                  : '결과가 0이면 그걸로 끝.'}
            </div>
          </section>
          <section className="upg__list rise">
            <h2>
              어떤 카드를 강화할까?{' '}
              <small>덱 {deck.length}장 · 이동 카드 빼고 전부 · 카드당 최대 {MAX_UPGRADE}번 (꽝은 안 셈)</small>
            </h2>
            <div className="upg__deck">
              {deck.map((id) => {
                const c = runCard(run, id)
                if (!c) return null
                const b = upgradeBlockOf(run, id)
                const t = run.upgrades[id]?.times ?? 0
                const f = valueFieldOf(c)
                return (
                  <button
                    key={id}
                    type="button"
                    className={`upg__dk upg__dk--${c.kind} ${id === cardId ? 'is-on' : ''} ${b ? 'is-locked' : ''}`}
                    onClick={() => setCardId(id)}
                  >
                    <span className="upg__dkstat">
                      <span>{f ? `${VALUE_LABEL[f].tag}${c[f] ?? 0}` : 'MOVE'}</span>
                      <span>EN{costOf(c)}</span>
                    </span>
                    <span className="upg__dkname">{c.name}</span>
                    <RangeGrid range={c.range ?? []} cell={10} />
                    <span className={`upg__dktag ${b ? 'is-bad' : t ? 'is-up' : ''}`}>
                      {c.kind === 'move' ? '강화 불가' : t >= MAX_UPGRADE ? `최대 ${t}/${MAX_UPGRADE}` : `${t}/${MAX_UPGRADE}`}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="upg__foot">
              <span>
                강화는 <b className="is-gold">수치</b>(피해 · 방어 · 회복) 또는 <b className="is-orange">범위</b>(공격 카드만) — 룰렛이 정한다.
              </span>
              {onCancel && (
                <button type="button" className="upg__ghost" onClick={onCancel}>
                  {leaveLabel}
                </button>
              )}
              <button type="button" className="upg__go" disabled={!!block} onClick={() => setStep('path')}>
                이 카드로 ▶
              </button>
            </div>
          </section>
        </>
      )}

      {step !== 'pick' && step !== 'done' && (
        <div className="upg__chip">
          <RangeGrid range={range} cell={6} />
          <span>{card.name}</span>
          <b>{stat ? `${stat.tag} ${statNum}` : ''}</b>
        </div>
      )}

      {step === 'path' && stat && (
        <section className="upg__paths rise">
          <h2>무엇을 강화할까?</h2>
          <div className="upg__tiles">
            <button type="button" className="upg__tile" onClick={() => { setPath('value'); setResult(null); setStep('spin') }}>
              <span className="upg__en2 is-red">{stat.en}</span>
              <b>{stat.name}</b>
              <span className="upg__arrow">
                <span className="is-red">{statNum}</span> → <span className="is-gold">{statNum}+?</span>
              </span>
              <span className="upg__vals">
                {ROULETTE_VALUE.map(([v], i) => (
                  <i key={v} style={{ background: [TONE[0], TONE[1], TONE[2], TONE[3], TONE[5]][i][0], color: [TONE[0], TONE[1], TONE[2], TONE[3], TONE[5]][i][2] }}>
                    +{v}
                  </i>
                ))}
              </span>
              <span className="upg__tiledesc">
                룰렛에 걸린 숫자만큼 {stat.word}이(가) 오른다.
                <br />
                바로 적용 — 고를 것 없음.
              </span>
            </button>
            <button type="button" className="upg__tile" disabled={!rangeOk} onClick={() => { setPath('range'); setResult(null); setStep('spin') }}>
              <span className="upg__en2 is-orange">RANGE</span>
              <b>범위</b>
              <span className="upg__grid" style={{ gridTemplateColumns: 'repeat(9, 22px)' }} aria-hidden>
                {DUS.flatMap((du) =>
                  DFS.map((df) => {
                    const me = df === 0 && du === 0, hit = has(range, df, du)
                    const can = !hit && canPickCell(range, [], { df, du })
                    return (
                      <i
                        key={`${df},${du}`}
                        style={{
                          width: 22,
                          height: 22,
                          background: me ? ME : hit ? HIT : can ? 'rgba(255,154,58,0.18)' : EMPTY,
                          boxShadow: can ? 'inset 0 0 0 2px #ff9a3a' : 'none',
                        }}
                      />
                    )
                  }),
                )}
              </span>
              <span className="upg__tiledesc">
                걸린 숫자만큼 <b className="is-orange">지금 범위에 붙은 칸</b>을
                <br />
                직접 골라 넓힌다(주황 점선 = 고를 수 있는 칸).
              </span>
              {!rangeOk && <span className="upg__norange">범위가 없는 카드 — 수치만 강화할 수 있다</span>}
            </button>
          </div>
          <button type="button" className="upg__ghost" onClick={() => setStep('pick')}>
            ← 다른 카드
          </button>
        </section>
      )}

      {step === 'spin' && (
        <>
          <div className={`upg__wheelbox ${spinning ? 'is-spinning' : ''}`} aria-label="룰렛">
            <div className="upg__rim" />
            {Array.from({ length: 36 }, (_, i) => (
              <span key={i} className={`upg__bulb ${i % 2 ? 'b2' : 'b1'}`} style={{ transform: `rotate(${i * 10}deg) translateY(-206px)` }} />
            ))}
            <div
              className="upg__wheel"
              style={{
                background: wheelBg,
                transform: `rotate(${rot}deg)`,
                transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.08, 0.72, 0.08, 1)` : 'none',
              }}
            >
              {seq.map((v, i) => (
                <span key={i} className="upg__lab" style={{ transform: `rotate(${(i + 0.5) * SL}deg) translateY(-168px)`, color: tone[v][2] }}>
                  {v}
                </span>
              ))}
            </div>
            <div className="upg__ptr" aria-hidden />
            <div
              className={`upg__hub ${result != null && !spinning ? 'res' : ''}`}
              style={
                result != null && !spinning
                  ? { background: `radial-gradient(circle at 40% 35%, #fff6dc, ${tone[result][0]} 60%, ${tone[result][1]})` }
                  : undefined
              }
            >
              {spinning ? '…' : result == null ? '?' : result}
            </div>
          </div>
          <section className="upg__spinpanel panel rise">
            <span className={`upg__en2 ${path === 'value' ? 'is-red' : 'is-orange'}`}>
              {path === 'value' ? stat?.en : 'RANGE'} ROULETTE
            </span>
            <h2>{path === 'value' ? `${stat?.word}이(가) 얼마나 오를까?` : '범위가 몇 칸 넓어질까?'}</h2>
            <div className="upg__probs">
              {table.map(([v, p]) => (
                <div key={v} className={`upg__prow ${result === v && !spinning ? 'is-on' : ''}`}>
                  <i style={{ background: tone[v][0] }} />
                  <span className={v === table[table.length - 1][0] ? 'is-gold' : ''}>{path === 'value' && v ? `+${v}` : v}</span>
                  <span className="upg__bar">
                    <span style={{ width: `${p * 3}%`, background: tone[v][0] }} />
                  </span>
                  <span>{p}%</span>
                </div>
              ))}
            </div>
            <span className="upg__hint">
              {path === 'value'
                ? '60칸 룰렛 — 0과 +20은 6칸씩, +5·+15는 15칸, +10은 18칸이 섞여 있다.'
                : '60칸 룰렛 — 0과 5는 6칸씩, 1~4는 12칸씩 섞여 있다.'}
            </span>
            <div className="upg__foot">
              <span className="upg__resline">
                {spinning
                  ? '돌아가는 중…'
                  : result == null
                    ? ''
                    : result === 0
                      ? '0 — 꽝! 이번 강화는 빈손'
                      : path === 'value'
                        ? `${result} — ${stat?.word} +${result}`
                        : `${result} — 범위 ${result}칸을 고른다`}
              </span>
              {result == null && !spinning && (
                <button type="button" className="upg__ghost" onClick={() => setStep('path')}>
                  ← 종류 다시
                </button>
              )}
              <button type="button" className="upg__go" disabled={spinning} onClick={result == null ? spin : afterSpin}>
                {spinning ? '돌아가는 중' : result == null ? '돌린다!' : '다음 ▶'}
              </button>
            </div>
          </section>
        </>
      )}

      {step === 'value' && (
        <section className={`upg__valres panel rise ${result ? '' : 'is-miss'}`}>
          <span className="upg__en2">{result ? `${stat?.en} UP` : 'NO LUCK'}</span>
          <h2>{result ? `${stat?.word} +${result}!` : '꽝 — 아무것도 오르지 않았다'}</h2>
          {stat && (
            <div className="upg__arrow upg__arrow--big">
              <span>
                <small>지금</small>
                <b className="is-red">{statNum}</b>
              </span>
              →
              <span className="res">
                <small>강화 후</small>
                <b className="is-gold">{(statNum ?? 0) + (path === 'value' ? (result ?? 0) : 0)}</b>
              </span>
            </div>
          )}
          <p>
            {result
              ? '바로 적용된다. 범위는 그대로.'
              : path === 'range'
                ? '범위를 노렸지만 0이 나왔다. 강화 기회는 사용됐다.'
                : '강화 기회는 사용됐다. 다음 모닥불이나 상점에서 다시.'}
          </p>
          <button type="button" className="upg__go" onClick={() => commit({ value: path === 'value' ? (result ?? 0) : 0 })}>
            {result ? '저장 ✓' : '확인'}
          </button>
        </section>
      )}

      {step === 'range' && (
        <>
          <section className="upg__edit rise">
            <h2>
              넓힐 칸 <span className="is-orange">{left}</span>개를 고르자
            </h2>
            <span className="upg__hint">주황 점선 = 지금 범위(또는 나)에 붙은 칸 — 위아래·대각선 포함. 고른 칸에 붙은 칸도 새로 열린다.</span>
            <div className="panel upg__editbox">
              <div className="upg__grid" style={{ gridTemplateColumns: 'repeat(9, 48px)', gap: 4 }}>
                {DUS.flatMap((du) =>
                  DFS.map((df) => {
                    const me = df === 0 && du === 0, hit = has(range, df, du)
                    const pi = picks.findIndex((o) => o.df === df && o.du === du)
                    const can = left > 0 && canPickCell(range, picks, { df, du })
                    return (
                      <button
                        key={`${df},${du}`}
                        type="button"
                        className={`upg__rc ${pi >= 0 ? 'is-pick' : can ? 'is-can' : ''}`}
                        style={{ background: me ? ME : hit ? HIT : pi >= 0 ? NEW : undefined }}
                        onClick={() => tapCell(df, du)}
                        aria-label={me ? '나' : hit ? '원래 범위' : pi >= 0 ? `${pi + 1}번째로 고른 칸` : can ? '고를 수 있는 칸' : '빈 칸'}
                      >
                        {me ? '나' : pi >= 0 ? pi + 1 : ''}
                      </button>
                    )
                  }),
                )}
              </div>
              <div className="upg__lr">
                <span>← 뒤</span>
                <span>앞 →</span>
              </div>
            </div>
            <div className="upg__legend">
              <span><i style={{ background: ME }} /> 나</span>
              <span><i style={{ background: HIT }} /> 원래 범위</span>
              <span><i style={{ background: NEW }} /> 새로 고른 칸(번호 = 고른 순서)</span>
            </div>
          </section>
          <section className="upg__rangeside panel rise">
            <div className="upg__pipsrow">
              <div className="upg__pips">
                {Array.from({ length: result ?? 0 }, (_, i) => (
                  <i key={i} className={i < picks.length ? 'is-on' : ''}>{i < picks.length ? i + 1 : ''}</i>
                ))}
              </div>
              <span>
                룰렛 <b className="is-orange">{result}</b> · 남은 칸 <b className="is-gold">{left}</b>
              </span>
              <span style={{ flexGrow: 1 }} />
              <button type="button" className="upg__toggle" onClick={() => setMirror(!mirror)}>
                <span className={`upg__sw ${mirror ? 'is-on' : ''}`}><span /></span>앞뒤 대칭으로 찍기
              </button>
            </div>
            <span className="upg__hint">대칭을 켜면 한 번 눌러 앞뒤 두 칸이 같이 찍힌다(남은 칸도 2개 쓴다).</span>
            <div className="upg__cols">
              <div>
                <span className="upg__hint">판에서 보면 (나 = 2열)</span>
                <div className="upg__board">
                  {Array.from({ length: 4 }, (_, r) =>
                    Array.from({ length: 6 }, (_, c) => {
                      const df = c - 1, du = 1 - r
                      const me = c === 1 && r === 1, foe = foes.some((f) => f.c === c && f.r === r)
                      return (
                        <i
                          key={`${c},${r}`}
                          className={foe ? 'is-foe' : ''}
                          style={{
                            background: me ? ME : has(picks, df, du) ? 'rgba(255,154,58,0.85)' : has(range, df, du) ? 'rgba(224,72,90,0.7)' : undefined,
                          }}
                        >
                          {me ? '나' : foe ? '적' : ''}
                        </i>
                      )
                    }),
                  )}
                </div>
                <span className={hits ? 'is-green' : 'upg__hint'}>
                  {hits ? `지금 자리에서 적 ${hits}명이 범위 안` : '이 자리에선 아직 아무도 안 닿는다'}
                </span>
              </div>
              <div>
                <span className="upg__hint">강화 후 카드</span>
                <div className="upg__after">
                  <span className="upg__dkstat">
                    <span>{stat ? `${stat.tag} ${statNum}` : ''}</span>
                    <span>EN {costOf(card)}</span>
                  </span>
                  <span className="upg__dkname">{card.name.replace(/\+\d$/, '')}+{lvl + 1}</span>
                  <RangeGrid range={range} extra={picks} cell={12} />
                  <span className="upg__hint">맞는 칸 {range.length} → {range.length + picks.length}</span>
                </div>
              </div>
            </div>
            <div className="upg__foot upg__foot--line">
              <button type="button" className="upg__ghost" onClick={() => setPicks(picks.slice(0, -1))}>↶ 되돌리기</button>
              <button type="button" className="upg__ghost" onClick={() => setPicks([])}>초기화</button>
              <span className={`upg__savehint ${left > 0 ? 'is-orange' : 'is-green'}`}>
                {left > 0 ? `${left}칸 더 골라야 저장할 수 있다` : '다 골랐다 — 저장하면 되돌릴 수 없다'}
              </span>
              <button type="button" className="upg__go" disabled={left > 0} onClick={() => commit({ cells: picks })}>
                저장 ✓
              </button>
            </div>
          </section>
        </>
      )}

      {step === 'done' && saved && (
        <section className="upg__done panel rise">
          <span className="upg__en2 is-green">SAVED</span>
          <h2>{result ? `${finalCard.name} 강화 완료` : '이번엔 빈손'}</h2>
          <div className="upg__final res">
            <span className="upg__dkstat">
              <span>{stat ? `${stat.tag} ${statOf(finalCard)}` : ''}</span>
              <span>EN {costOf(finalCard)}</span>
            </span>
            <span className="upg__dkname">{finalCard.name}</span>
            <RangeGrid range={finalCard.range ?? []} cell={24} />
          </div>
          <p>
            {result ? finalCard.upgradeNote : '카드는 그대로다.'} · 강화 {saved.upgrades[cardId]?.times ?? 0}/{MAX_UPGRADE}
          </p>
          <button type="button" className="upg__go" onClick={() => onDone(saved)}>
            {isShop ? '상점으로 ▶' : '지도로 ▶'}
          </button>
        </section>
      )}
    </div>
  )
}
