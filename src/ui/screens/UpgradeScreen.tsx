// 룰렛 카드 강화(디자인 `Upgrade` · 규칙 `docs/rules/CARD_UPGRADE.md`).
// 카드 → 강화 종류(수치/범위) → 10칸 룰렛 → (범위면 붙일 칸 / 뺄 칸 고르기) → 저장.
// 대장간(지도 칸 · ? 칸 — 맡기기 `paid` / 직접 `free`)·낡은 대장간(이벤트 — `paid`)이 같은 화면을 쓴다.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CardDef, Offset } from '../../battle/types'
import { regionOf, runCard, upgradeBlockOf, upgradeCard, type RunState } from '../../game/run'
import {
  MAX_UPGRADE, ROULETTES, VALUE_LABEL, canPickCell, canUpgradeRange, signed,
  spinRoulette, valueFieldOf, type RouletteTable, type UpgradeTier,
} from '../../game/upgrades'
import { SceneLayers } from '../SceneLayers'

export type UpgradeSource = 'smith' | 'event'
type Step = 'pick' | 'path' | 'spin' | 'value' | 'range' | 'done'
type Path = 'value' | 'range'

const DFS = [-4, -3, -2, -1, 0, 1, 2, 3, 4]
const DUS = [2, 1, 0, -1, -2]
const ME = '#f4d470', HIT = '#e0485a', NEW = '#ff9a3a', EMPTY = '#2a2438', GONE = '#5a2a34'
const has = (arr: Offset[], df: number, du: number) => arr.some((o) => o.df === df && o.du === du)
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, MAX_UPGRADE - n))
const costOf = (c: CardDef) => c.energyCost ?? c.guardCost ?? c.healCost ?? c.buffCost ?? 0
const statOf = (c: CardDef): number | null => {
  const f = valueFieldOf(c)
  return f ? (c[f] ?? 0) : null
}

/** 9×5 사거리 격자(앞뒤 4칸 · 위아래 2줄). 가운데 = 나. */
function RangeGrid({ range, extra = [], cell, gone = [] }: { range: Offset[]; extra?: Offset[]; cell: number; gone?: Offset[] }) {
  return (
    <span className="upg__grid" style={{ gridTemplateColumns: `repeat(9, ${cell}px)` }} aria-hidden>
      {DUS.flatMap((du) =>
        DFS.map((df) => (
          <i
            key={`${df},${du}`}
            style={{
              width: cell,
              height: cell,
              background: df === 0 && du === 0 ? ME : has(extra, df, du) ? NEW : has(gone, df, du) ? GONE : has(range, df, du) ? HIT : EMPTY,
            }}
          />
        )),
      )}
    </span>
  )
}

/**
 * 룰렛 칸 — **숫자마다 2칸, 칸 폭 = 확률의 절반**(2026-11-12 사용자 — 60칸은 너무 잘아 숫자가 겹쳤다).
 * 5개 숫자 판이면 10칸이고, 그림의 넓이가 곧 확률이다. 같은 숫자가 붙지 않게 한 칸씩 건너 배치한다.
 */
interface Slice { v: number; a: number; b: number }
function wheelSlices(table: RouletteTable): Slice[] {
  const n = table.length
  const order = n % 2 ? Array.from({ length: n }, (_, i) => (i * 2) % n) : table.map((_, i) => i)
  const out: Slice[] = []
  let a = 0
  for (const i of [...order, ...order]) {
    const [v, p] = table[i]
    const w = (p / 2) * 3.6
    out.push({ v, a, b: a + w })
    a += w
  }
  return out
}
/** 받침 조사 — "피해가" · "방어량이". */
const iga = (w = '') => ((w.charCodeAt(w.length - 1) - 0xac00) % 28 ? '이' : '가')
const TONE = [
  ['#3a3448', '#2e2a3a', '#b9b1c9'], ['#3a6aa8', '#2e5690', '#e4f0ff'], ['#3c9c98', '#2e8480', '#e4fffc'],
  ['#6ab83a', '#58a02e', '#f0ffe4'], ['#a46ae0', '#8c56c8', '#f6ecff'], ['#ffd24a', '#e8b830', '#1d1408'],
]
/** 색 — 0 = 회색, 마이너스 = 붉은색, 플러스 = 파랑 → 초록 → 보라 순, 판의 맨 위 값 = 금색. */
const NEG = [['#a8323e', '#8c2832', '#ffe4e8'], ['#c45a4a', '#a84a3c', '#fff0ec']]
const toneMap = (table: RouletteTable) => {
  const m: Record<number, string[]> = {}
  const neg = table.filter(([v]) => v < 0).map(([v]) => v)
  const pos = table.filter(([v]) => v > 0).map(([v]) => v)
  neg.forEach((v, i) => (m[v] = NEG[Math.min(i + 2 - neg.length, NEG.length - 1)] ?? NEG[0]))
  pos.forEach((v, i) => (m[v] = i === pos.length - 1 ? TONE[5] : TONE[1 + i]))
  m[0] = TONE[0]
  return m
}
const SPIN_MS = 5200

export function UpgradeScreen({
  run,
  source,
  tier,
  onDone,
  onCancel,
}: {
  run: RunState
  source: UpgradeSource
  /** 룰렛 판 — 맡긴 강화(반드시 오른다) / 직접 강화(0 · 마이너스도). */
  tier: UpgradeTier
  /** 강화가 끝난(0 · 마이너스여도) 런. */
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
  const table: RouletteTable = ROULETTES[tier][path]
  const slices = useMemo(() => wheelSlices(table), [table])
  const tone = useMemo(() => toneMap(table), [table])
  const wheelBg = `conic-gradient(from 0deg, ${slices
    .map(({ v, a, b }, i) => `#0a0810 ${a}deg ${a + 0.8}deg, ${tone[v][i % 2]} ${a + 0.8}deg ${b}deg`)
    .join(', ')})`

  const isSmith = source === 'smith'
  const free = tier === 'free'
  const srcLabel = isSmith ? (free ? '대장간 · 직접 강화' : '대장간 · 맡긴 강화') : '이벤트 · 낡은 대장간'
  const leaveLabel = isSmith ? '← 대장간으로' : '← 그만둔다'

  const spin = () => {
    const v = spinRoulette(table)
    const mine = slices.filter((x) => x.v === v)
    const sl = mine[Math.floor(Math.random() * mine.length)]
    const target = -((sl.a + sl.b) / 2 + (Math.random() - 0.5) * (sl.b - sl.a) * 0.6)
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
  // 범위 마이너스 = 뺄 칸을 직접 고른다. 최소 1칸은 남긴다 — 1칸짜리 카드면 뺄 게 없어 "변화 없음"이 된다.
  const drop = path === 'range' && (result ?? 0) < 0
  const need = !result || path !== 'range' ? 0 : result > 0 ? result : Math.min(-result, range.length - 1)
  const afterSpin = () => {
    setPicks([])
    setStep(need ? 'range' : 'value')
  }
  const gainOf = (): { value?: number; cells?: Offset[]; removed?: Offset[] } =>
    path === 'value' ? { value: result ?? 0 } : drop ? { removed: picks } : { cells: picks }
  const commit = () => {
    setSaved(upgradeCard(run, cardId, gainOf()))
    setStep('done')
  }
  /** 저장하면 이렇게 된다 — 수치는 0 아래로 안 내려가서 "지금 + 결과"와 다를 수 있다. */
  const preview = runCard(upgradeCard(run, cardId, gainOf()), cardId)!

  const left = need - picks.length
  const allCells = drop ? range.filter((o) => !has(picks, o.df, o.du)) : [...range, ...picks]
  const tapCell = (df: number, du: number) => {
    const pi = picks.findIndex((o) => o.df === df && o.du === du)
    if (pi >= 0) {
      if (pi === picks.length - 1) setPicks(picks.slice(0, -1)) // 마지막 칸만 뺀다 — 가운데를 빼면 떨어진 칸이 생긴다
      return
    }
    if (left <= 0) return
    if (drop ? !has(range, df, du) : !canPickCell(range, picks, { df, du })) return
    const add = [{ df, du }]
    const twin = drop ? has(range, -df, du) && !has(picks, -df, du) : !has(allCells, -df, du)
    if (mirror && df !== 0 && left >= 2 && twin) add.push({ df: -df, du })
    setPicks([...picks, ...add])
  }
  // 판 미리보기: 나 = 2열(col 1, row 1), 적 둘.
  const foes = [{ c: 3, r: 1 }, { c: 4, r: 2 }]
  const hits = foes.filter(({ c, r }) => has(allCells, c - 1, 1 - r)).length
  const fmt = (v: number) => (path === 'value' || table.some(([x]) => x < 0) ? signed(v) : String(v))
  const maxP = Math.max(...table.map(([, p]) => p))
  const best = table[table.length - 1][0]

  const crumbIdx = { pick: 0, path: 1, spin: 2, value: 3, range: 3, done: 4 }[step]
  const stepCrumbs = ['카드', '강화 종류', '룰렛', '적용', '저장']
  const finalCard = saved ? runCard(saved, cardId)! : card
  const statNum = statOf(card)

  return (
    <div className="screen upg">
      <SceneLayers scene={regionOf(run)} />
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
          <section className={`upg__sel upg__sel--${card.kind} panel rise`}>
            <div className="upg__selhead">
              <span>SELECTED</span>
              <span className={block ? 'is-bad' : lvl ? 'is-up' : ''}>{block ?? `강화 ${stars(lvl)}`}</span>
            </div>
            <h2>
              {card.name} <span className="upg__stars">{stars(lvl)}</span>
            </h2>
            <div className="upg__chips">
              <span className="upg__dm">{stat ? `${stat.tag} ${statNum}` : 'MOVE'}</span>
              <span className="upg__en">EN {costOf(card)}</span>
            </div>
            <RangeGrid range={range} cell={32} />
            <span className="upg__hint">가운데 금색 = 나 · 빨강 = 맞는 칸 · 앞(오른쪽) 4칸 · 뒤 4칸 · 위아래 2줄</span>
            <p>{card.desc}</p>
            <div className="upg__note">
              {free
                ? '직접 강화: 공짜지만 그대로거나(0) 오히려 나빠질(−) 수도 있다. 그래도 강화 1번(★)은 쓴다.'
                : isSmith
                  ? '맡긴 강화: 반드시 오른다. 들를 때마다 한 장 · 한 번. 룰렛을 돌린 뒤엔 돈을 돌려받지 못한다.'
                  : '낡은 대장간: 맡긴 강화와 같은 판 — 반드시 오른다.'}
            </div>
          </section>
          <section className="upg__list rise">
            <h2>
              어떤 카드를 강화할까?{' '}
              <small>덱 {deck.length}장 · 이동 카드 빼고 전부 · 카드당 최대 {MAX_UPGRADE}번(★) · 0 · 마이너스도 한 번으로 센다</small>
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
                      {c.kind === 'move' ? '강화 불가' : t >= MAX_UPGRADE ? `최대 ${stars(t)}` : stars(t)}
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
                <span className="is-red">{statNum}</span> → <span className="is-gold">{statNum}{free ? '±' : '+'}?</span>
              </span>
              <span className="upg__vals">
                {ROULETTES[tier].value.map(([v]) => {
                  const t = toneMap(ROULETTES[tier].value)[v]
                  return (
                    <i key={v} style={{ background: t[0], color: t[2] }}>
                      {signed(v)}
                    </i>
                  )
                })}
              </span>
              <span className="upg__tiledesc">
                룰렛에 걸린 숫자만큼 {stat.word}{iga(stat.word)} {free ? '오르거나 내린다' : '오른다'}.
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
                {free && (
                  <>
                    <br />
                    마이너스면 <b className="is-red">뺄 칸</b>을 직접 고른다(1칸은 남는다).
                  </>
                )}
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
              {slices.map(({ v, a, b }, i) => (
                <span key={i} className="upg__lab" style={{ transform: `rotate(${(a + b) / 2}deg) translateY(-160px)`, color: tone[v][2] }}>
                  {fmt(v)}
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
              {spinning ? '…' : result == null ? '?' : fmt(result)}
            </div>
          </div>
          <section className="upg__spinpanel panel rise">
            <span className={`upg__en2 ${path === 'value' ? 'is-red' : 'is-orange'}`}>
              {path === 'value' ? stat?.en : 'RANGE'} ROULETTE
            </span>
            <h2>
              {path === 'value'
                ? `${stat?.word}${iga(stat?.word)} 얼마나 ${free ? '바뀔까' : '오를까'}?`
                : free ? '범위가 넓어질까, 좁아질까?' : '범위가 몇 칸 넓어질까?'}
            </h2>
            <div className="upg__probs">
              {table.map(([v, p]) => (
                <div key={v} className={`upg__prow ${result === v && !spinning ? 'is-on' : ''}`}>
                  <i style={{ background: tone[v][0] }} />
                  <span className={v === best ? 'is-gold' : v < 0 ? 'is-red' : ''}>{fmt(v)}</span>
                  <span className="upg__bar">
                    <span style={{ width: `${(p / maxP) * 90}%`, background: tone[v][0] }} />
                  </span>
                  <span>{p}%</span>
                </div>
              ))}
            </div>
            <span className="upg__hint">
              10칸 룰렛 — 숫자마다 2칸씩, 칸이 넓을수록 잘 나온다(넓이 = 확률).
            </span>
            <div className="upg__foot">
              <span className="upg__resline">
                {spinning
                  ? '돌아가는 중…'
                  : result == null
                    ? ''
                    : result === 0
                      ? '0 — 그대로! 강화 1번(★)은 쓴다'
                      : path === 'value'
                        ? `${signed(result)} — ${stat?.word} ${signed(result)}`
                        : result > 0
                          ? `${result} — 범위 ${result}칸을 고른다`
                          : `${signed(result)} — 범위에서 ${need}칸을 뺀다${need < -result ? '(1칸은 남는다)' : ''}`}
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
        <section className={`upg__valres panel rise ${path === 'value' && (result ?? 0) > 0 ? '' : path === 'value' && (result ?? 0) < 0 ? 'is-down' : 'is-miss'}`}>
          <span className="upg__en2">{path === 'value' && result ? `${stat?.en} ${result > 0 ? 'UP' : 'DOWN'}` : 'NO CHANGE'}</span>
          <h2>
            {path === 'value' && result
              ? `${stat?.word} ${signed(result)}${result > 0 ? '!' : ' — 망쳤다'}`
              : '그대로 — 아무것도 바뀌지 않았다'}
          </h2>
          {stat && (
            <div className="upg__arrow upg__arrow--big">
              <span>
                <small>지금</small>
                <b className="is-red">{statNum}</b>
              </span>
              →
              <span className="res">
                <small>강화 후</small>
                <b className={(statOf(preview) ?? 0) < (statNum ?? 0) ? 'is-red' : 'is-gold'}>{statOf(preview)}</b>
              </span>
            </div>
          )}
          <p>
            {path === 'value' && result
              ? `바로 적용된다. 범위는 그대로. 강화 ${stars(lvl + 1)}`
              : path === 'range' && result
                ? `범위가 1칸뿐이라 뺄 칸이 없다. 그래도 강화 1번(★)은 쓴다 — ${stars(lvl + 1)}`
                : `카드는 그대로지만 강화 1번(★)은 쓴다 — ${stars(lvl + 1)}`}
          </p>
          <button type="button" className="upg__go" onClick={commit}>
            저장 ✓
          </button>
        </section>
      )}

      {step === 'range' && (
        <>
          <section className="upg__edit rise">
            <h2>
              {drop ? '뺄' : '넓힐'} 칸 <span className={drop ? 'is-red' : 'is-orange'}>{left}</span>개를 고르자
            </h2>
            <span className="upg__hint">
              {drop
                ? '빨간 칸(지금 범위) 중에서 고른다 — 고른 칸은 범위에서 빠진다.'
                : '주황 점선 = 지금 범위(또는 나)에 붙은 칸 — 위아래·대각선 포함. 고른 칸에 붙은 칸도 새로 열린다.'}
            </span>
            <div className="panel upg__editbox">
              <div className="upg__grid" style={{ gridTemplateColumns: 'repeat(9, 48px)', gap: 4 }}>
                {DUS.flatMap((du) =>
                  DFS.map((df) => {
                    const me = df === 0 && du === 0, hit = has(range, df, du)
                    const pi = picks.findIndex((o) => o.df === df && o.du === du)
                    const can = left > 0 && (drop ? hit && pi < 0 : canPickCell(range, picks, { df, du }))
                    return (
                      <button
                        key={`${df},${du}`}
                        type="button"
                        className={`upg__rc ${pi >= 0 ? 'is-pick' : can ? 'is-can' : ''}`}
                        style={{ background: me ? ME : pi >= 0 ? (drop ? GONE : NEW) : hit ? HIT : undefined }}
                        onClick={() => tapCell(df, du)}
                        aria-label={
                          me ? '나' : pi >= 0 ? `${pi + 1}번째로 고른 칸` : can ? (drop ? '뺄 수 있는 칸' : '고를 수 있는 칸') : hit ? '지금 범위' : '빈 칸'
                        }
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
              <span><i style={{ background: HIT }} /> 지금 범위</span>
              {drop
                ? <span><i style={{ background: GONE }} /> 뺄 칸(번호 = 고른 순서)</span>
                : <span><i style={{ background: NEW }} /> 새로 고른 칸(번호 = 고른 순서)</span>}
            </div>
          </section>
          <section className="upg__rangeside panel rise">
            <div className="upg__pipsrow">
              <div className="upg__pips">
                {Array.from({ length: need }, (_, i) => (
                  <i key={i} className={i < picks.length ? 'is-on' : ''}>{i < picks.length ? i + 1 : ''}</i>
                ))}
              </div>
              <span>
                룰렛 <b className={drop ? 'is-red' : 'is-orange'}>{drop ? signed(result ?? 0) : result}</b> · 남은 칸 <b className="is-gold">{left}</b>
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
                            background: me
                              ? ME
                              : has(picks, df, du)
                                ? drop ? 'rgba(90,42,52,0.9)' : 'rgba(255,154,58,0.85)'
                                : has(range, df, du) ? 'rgba(224,72,90,0.7)' : undefined,
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
                  <span className="upg__dkname">{card.name} {stars(lvl + 1)}</span>
                  <RangeGrid range={range} extra={drop ? [] : picks} gone={drop ? picks : []} cell={12} />
                  <span className="upg__hint">맞는 칸 {range.length} → {allCells.length}</span>
                </div>
              </div>
            </div>
            <div className="upg__foot upg__foot--line">
              <button type="button" className="upg__ghost" onClick={() => setPicks(picks.slice(0, -1))}>↶ 되돌리기</button>
              <button type="button" className="upg__ghost" onClick={() => setPicks([])}>초기화</button>
              <span className={`upg__savehint ${left > 0 ? 'is-orange' : 'is-green'}`}>
                {left > 0 ? `${left}칸 더 골라야 저장할 수 있다` : '다 골랐다 — 저장하면 되돌릴 수 없다'}
              </span>
              <button type="button" className="upg__go" disabled={left > 0} onClick={commit}>
                저장 ✓
              </button>
            </div>
          </section>
        </>
      )}

      {step === 'done' && saved && (
        <section className="upg__done panel rise">
          <span className="upg__en2 is-green">SAVED</span>
          <h2>{(result ?? 0) > 0 ? `${finalCard.name} 강화 완료` : result ? `${finalCard.name} — 강화가 빗나갔다` : `${finalCard.name} — 그대로`}</h2>
          <div className="upg__final res">
            <span className="upg__dkstat">
              <span>{stat ? `${stat.tag} ${statOf(finalCard)}` : ''}</span>
              <span>EN {costOf(finalCard)}</span>
            </span>
            <span className="upg__dkname">{finalCard.name} {stars(finalCard.upgraded ?? 0)}</span>
            <RangeGrid range={finalCard.range ?? []} cell={24} />
          </div>
          <p>
            {finalCard.upgradeNote ?? '강화 내역 없음 — 카드는 그대로다.'} · 강화 {saved.upgrades[cardId]?.times ?? 0}/{MAX_UPGRADE}
          </p>
          <button type="button" className="upg__go" onClick={() => onDone(saved)}>
            지도로 ▶
          </button>
        </section>
      )}
    </div>
  )
}
