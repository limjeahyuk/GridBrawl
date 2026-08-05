// 런 이벤트 — 대가를 치르고 보상을 얻는 선택. 카드 제거형은 버릴 카드를 고른다.
import { useMemo, useState } from 'react'
import { getChar } from '../../data/roster'
import { getRelic } from '../../game/relics'
import { resolveRunCard } from '../../game/runcards'
import {
  advanceFloor, resolveEventEffect, rollEvent, type EventEffect, type RunState,
} from '../../game/run'
import { useCardZoom } from '../CardDetail'
import { DeckPicker } from '../DeckPicker'
import { RunBar } from '../RunBar'


export function EventScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const ev = useMemo(() => rollEvent(), [run])
  const char = getChar(run.charId)
  // 꾹 누르면 카드 상세(설명·능력의 뜻)가 열린다 — 압축 카드에는 설명이 없다.
  const zoom = useCardZoom(char.accent)
  const [pending, setPending] = useState<EventEffect | null>(null) // 카드 제거 대기
  const [result, setResult] = useState<{ run: RunState; relicId?: string } | null>(null)

  const choose = (effect: EventEffect) => {
    const res = resolveEventEffect(run, effect)
    if (res.needsCardPick) setPending(effect)
    else setResult({ run: res.run, relicId: res.gainedRelicId })
  }
  const pickRemove = (id: string) => {
    if (!pending) return
    const res = resolveEventEffect(run, pending, id)
    setResult({ run: res.run, relicId: res.gainedRelicId })
    setPending(null)
  }

  if (result) {
    const relic = result.relicId ? getRelic(result.relicId) : null
    return (
      <div className="screen event">
        <div className="grid-bg" />
        <div className="event__result">
          <div className="event__icon">{relic ? relic.icon : '✓'}</div>
          <div className="event__result-text">
            {relic ? (
              <>
                <b>{relic.name}</b> 획득! <span className="event__result-desc">{relic.desc}</span>
              </>
            ) : (
              '처리되었습니다.'
            )}
          </div>
          <button className="btn event__continue" onClick={() => onDone(advanceFloor(result.run))}>
            계속 ▶
          </button>
        </div>
      </div>
    )
  }

  if (pending) {
    return (
      <div className="screen event">
        <div className="grid-bg" />
        <h2 className="event__title">녹일 카드를 고르세요</h2>
        <DeckPicker charId={run.charId} deck={run.deck} zoom={zoom} onPick={pickRemove} />
        {zoom.sheet}
        <button className="btn btn--ghost" onClick={() => setPending(null)}>
          취소
        </button>
      </div>
    )
  }

  return (
    <div className="screen event">
      <div className="grid-bg" />
      <div className="event__topbar">
        <RunBar run={run} />
      </div>
      <div className="event__body">
        <div className="event__icon">{ev.icon}</div>
        <h2 className="event__name">{ev.name}</h2>
        <p className="event__desc">{ev.desc}</p>
        <div className="event__options">
          {ev.options.map((o, i) => (
            <button key={i} className="btn event__opt" onClick={() => choose(o.effect)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
