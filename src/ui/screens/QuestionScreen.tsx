// ? 칸(디자인 `Event` 1단계) — 들어가 봐야 정체를 안다: 전투 · 여관 · 대장간 · 고블린 상점 · 이벤트.
// 후보 하나하나가 **같은 확률**이다(이벤트는 종류마다 한 칸 — `events.ts`의 `questionFates`, 2026-11-12).
// 정체를 굴려 보여 준 뒤 "들어간다"로 그 화면에 넘긴다.
import { useEffect, useMemo, useState } from 'react'
import { ambushFight, placeLabel, regionOf, type RunState } from '../../game/run'
import { rollQuestionFate, type QuestionFate } from '../../game/events'
import { SceneLayers } from '../SceneLayers'
import { useFirstTip } from '../FirstTip'
import { EventScreen } from './EventScreen'
import { GoblinScreen } from './GoblinScreen'
import { InnScreen, SmithScreen } from './InnScreen'

const FATES: { id: QuestionFate['kind']; icon: string; label: string; sub: string }[] = [
  { id: 'combat', icon: 'enemy', label: '전투', sub: '일반 적이 숨어 있다' },
  { id: 'inn', icon: 'inn', label: '여관', sub: '쉬거나 · 사거나' },
  { id: 'smith', icon: 'smith', label: '대장간', sub: '카드를 벼린다' },
  { id: 'goblin', icon: 'merchant', label: '고블린 상점', sub: '사거나 · 덮치거나' },
  { id: 'event', icon: 'unknown', label: '이벤트', sub: '대화와 선택' },
]
const ROLL_MS = 1100

export function QuestionScreen({
  run,
  onDone,
  onFight,
}: {
  run: RunState
  onDone: (next: RunState) => void
  onFight: (next: RunState) => void
}) {
  const fate = useMemo(() => rollQuestionFate(run), [run])
  const [hl, setHl] = useState(0)
  const [rolled, setRolled] = useState(false)
  const [entered, setEntered] = useState(false)
  const tip = useFirstTip(['question'])
  // 정체 굴리기 — 빛이 칸을 돌다가 정체에서 멈춘다(연출뿐, 결과는 이미 정해졌다).
  useEffect(() => {
    const t = window.setInterval(() => setHl((i) => (i + 1) % FATES.length), 110)
    const stop = window.setTimeout(() => {
      clearInterval(t)
      setHl(FATES.findIndex((f) => f.id === fate.kind))
      setRolled(true)
    }, ROLL_MS)
    return () => {
      clearInterval(t)
      clearTimeout(stop)
    }
  }, [fate])

  if (entered && fate.kind === 'event') return <EventScreen run={run} eventId={fate.eventId} onDone={onDone} onFight={onFight} />
  if (entered && fate.kind === 'goblin') return <GoblinScreen run={run} onDone={onDone} onFight={onFight} />
  if (entered && fate.kind === 'inn') return <InnScreen run={run} onDone={onDone} />
  if (entered && fate.kind === 'smith') return <SmithScreen run={run} onDone={onDone} />
  const enter = () => (fate.kind === 'combat' ? onFight({ ...run, special: ambushFight(run) }) : setEntered(true))

  return (
    <div className="screen event">
      <SceneLayers scene={regionOf(run)} />
      <div className="screenveil" />
      {tip}
      <header className="event__head">
        <div className="shop__where">
          <h1 className="shop__title">? 칸</h1>
          <span>
            {placeLabel(run)}
          </span>
        </div>
        <span className="hpchip">
          HP {run.hp}/{run.maxHp}
        </span>
      </header>
      <section className="fates">
        <p>이 칸에 무엇이 있는지는 들어가 봐야 안다 — 다섯 중 하나</p>
        <div className="fates__row">
          {FATES.map((f, i) => (
            <div key={f.id} className={`fate ${i === hl ? 'is-on' : rolled ? 'is-off' : ''}`}>
              <i className="fate__icon" style={{ backgroundImage: `url(/redesign/ui/map-icons/${f.icon}.png)` }} aria-hidden />
              <span>{f.label}</span>
              <small>{f.sub}</small>
            </div>
          ))}
        </div>
        <button className="upg__go" disabled={!rolled} onClick={enter}>
          들어간다 ▶
        </button>
      </section>
    </div>
  )
}
