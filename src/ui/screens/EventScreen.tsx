// ---------------------------------------------------------------------------
// ? 이벤트 (2026-11 · 시안 docs/redesign/screens/EventsQ.dc.html · 기획 EVENTS.md)
//
// 공통 규칙: ① 선택지엔 **대가만** 보이고 결과는 고른 뒤에 공개 ② 히든 선택지는 자물쇠로
// 잠기고 무엇이 필요한지 말하지 않는다 ③ 반복 이벤트는 결과 뒤 "계속하기" ④ 확률은 안 보인다.
// 결과 계산은 전부 `game/events.ts` — 여기선 고르기·연출만 한다.
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react'
import { getChar } from '../../data/roster'
import { getRelic } from '../../game/relics'
import { markRelicsSeen } from '../../game/progress'
import { resolveRunCard } from '../../game/runcards'
import {
  EVENT_BY_ID,
  chooseEvent,
  eventChoices,
  markEventSeen,
  openEvent,
  rollEventId,
  type EventChoice,
  type EventCost,
  type EventOutcome,
  type EventSession,
} from '../../game/events'
import { advanceFloor, regionOf, runCard, tradableRelics, type RunState } from '../../game/run'
import { CardFace, cardAccent } from '../CardFace'
import { useCardZoom } from '../CardDetail'
import { DeckPicker } from '../DeckPicker'
import { RelicIcon } from '../RelicIcon'
import { RunBar } from '../RunBar'
import { SceneLayers } from '../SceneLayers'
import { UpgradeScreen } from './UpgradeScreen'

/** 대가 칩 — 골드(금) · HP(빨강) · 최대 HP(분홍) · 카드/유물(회색). 대가가 없으면 칩도 없다. */
function CostChips({ cost }: { cost?: EventCost }) {
  if (!cost) return null
  return (
    <span className="ev__costs">
      {cost.gold ? <span className="ev__cost ev__cost--gold">{cost.gold}G</span> : null}
      {cost.hp ? <span className="ev__cost ev__cost--hp">HP -{cost.hp}</span> : null}
      {cost.maxHp ? <span className="ev__cost ev__cost--max">최대 HP -{cost.maxHp}</span> : null}
      {cost.card ? <span className="ev__cost">카드 {cost.card}장</span> : null}
      {cost.relic ? <span className="ev__cost">유물 {cost.relic}개</span> : null}
    </span>
  )
}

function ChoiceButton({ c, onPick }: { c: EventChoice; onPick: () => void }) {
  if (c.locked) {
    return (
      <div className="ev__opt ev__opt--locked" aria-disabled="true">
        <span className="ev__lock" style={{ backgroundImage: 'url(/redesign/ui/events/lock.png)' }} aria-hidden="true" />
        <b>???</b>
        <span className="ev__why">잠겨 있다 — 무언가 필요해 보인다</span>
      </div>
    )
  }
  return (
    <button
      type="button"
      className={`ev__opt ${c.unlockedBy ? 'ev__opt--hidden' : ''} ${c.disabled ? 'is-disabled' : ''}`}
      aria-disabled={!!c.disabled}
      onClick={() => !c.disabled && onPick()}
    >
      {c.unlockedBy && (
        <span className="ev__lock" style={{ backgroundImage: 'url(/redesign/ui/events/unlock.png)' }} aria-hidden="true" />
      )}
      {c.icon && <span className="ev__potion" style={{ backgroundImage: `url(${c.icon})` }} aria-hidden="true" />}
      <b>{c.label}</b>
      <CostChips cost={c.cost} />
      {c.unlockedBy && <span className="ev__why ev__why--gold">히든 · {c.unlockedBy} 있어서 열렸다</span>}
      {c.disabled && <span className="ev__why">{c.disabled}</span>}
    </button>
  )
}

export function EventScreen({
  run,
  onDone,
  onFight,
}: {
  run: RunState
  onDone: (next: RunState) => void
  /** 이벤트가 전투로 넘어갔다(항아리 뱀). */
  onFight: (next: RunState) => void
}) {
  const id = useMemo(() => rollEventId(run), [run])
  const def = EVENT_BY_ID[id]
  const char = getChar(run.charId)
  const zoom = useCardZoom(char.accent)
  const [cur, setCur] = useState<RunState>(() => markEventSeen(run, id))
  const [session, setSession] = useState<EventSession>(() => openEvent(id))
  const [need, setNeed] = useState<{ key: string; what: 'card' | 'relic' } | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const [outcome, setOutcome] = useState<EventOutcome | null>(null)

  const apply = (key: string, pick?: { cardId?: string; relicId?: string }) => {
    const out = chooseEvent(cur, session, key, pick)
    if (out.need === 'upgrade') {
      setCur(out.run)
      setSession(out.session)
      setUpgrading(true)
      return
    }
    if (out.need) {
      setNeed({ key, what: out.need })
      return
    }
    setNeed(null)
    if (out.relicId) markRelicsSeen([out.relicId])
    setCur(out.run)
    setSession(out.session)
    setOutcome(out)
  }

  if (upgrading) {
    return <UpgradeScreen run={cur} source="forge" onDone={(next) => onDone(advanceFloor(next))} />
  }

  const art = def.art
  const scale = 4
  const artEl = (
    <div
      className="ev__art"
      role="img"
      aria-label={def.name}
      style={{
        width: art.w * scale,
        height: art.h * scale,
        backgroundImage: `url(${art.src})`,
        backgroundSize: `${art.w * scale * art.frames}px ${art.h * scale}px`,
        animation: art.frames > 1 ? `ev-strip ${art.frames * (art.frameMs ?? 150)}ms steps(${art.frames}) infinite` : undefined,
        ['--strip' as string]: `${-art.w * scale * art.frames}px`,
      }}
    />
  )

  let body: React.ReactNode
  if (need?.what === 'card') {
    body = (
      <div className="ev__pick">
        <h3>내놓을 카드를 고른다</h3>
        <DeckPicker charId={cur.charId} deck={cur.deck} zoom={zoom} onPick={(cardId) => apply(need.key, { cardId })} cardOf={(cid) => runCard(cur, cid)} />
        <button type="button" className="ev__ghost" onClick={() => setNeed(null)}>
          취소
        </button>
      </div>
    )
  } else if (need?.what === 'relic') {
    body = (
      <div className="ev__pick">
        <h3>내놓을 유물을 고른다</h3>
        <div className="ev__relics">
          {tradableRelics(cur).map((rid) => {
            const r = getRelic(rid)
            return (
              <button key={rid} type="button" className="ev__relic" onClick={() => apply(need.key, { relicId: rid })}>
                <RelicIcon id={rid} size={52} />
                <b>{r?.name}</b>
              </button>
            )
          })}
        </div>
        <button type="button" className="ev__ghost" onClick={() => setNeed(null)}>
          취소
        </button>
      </div>
    )
  } else if (outcome) {
    const gained = outcome.relicId ? getRelic(outcome.relicId) : undefined
    const lost = outcome.lostRelicId ? getRelic(outcome.lostRelicId) : undefined
    const gotCard = outcome.cardId ? resolveRunCard(cur.charId, outcome.cardId) : undefined
    const lostCard = outcome.lostCardId ? resolveRunCard(cur.charId, outcome.lostCardId) : undefined
    const again = def.repeat && !session.over
    body = (
      <div className="ev__result">
        <p className="ev__resulttext">{outcome.text}</p>
        <div className="ev__gains">
          {lostCard && <span className="ev__lost">− {lostCard.name}</span>}
          {lost && <span className="ev__lost">− {lost.name}</span>}
          {gotCard && (
            <div className="ev__gotcard" {...zoom.bind(gotCard)}>
              <CardFace card={gotCard} accent={cardAccent(gotCard, char.accent)} compact />
            </div>
          )}
          {gained && (
            <div className="ev__gotrelic">
              <RelicIcon id={gained.id} size={78} />
              <b>{gained.name}</b>
              <span>{gained.desc}</span>
            </div>
          )}
        </div>
        <div className="ev__actions">
          {outcome.fight ? (
            <button type="button" className="ev__go" onClick={() => onFight(cur)}>
              싸운다 ▶
            </button>
          ) : again ? (
            <button type="button" className="ev__go" onClick={() => setOutcome(null)}>
              계속하기
            </button>
          ) : (
            <button type="button" className="ev__go" onClick={() => onDone(advanceFloor(cur))}>
              지도로 ▶
            </button>
          )}
        </div>
      </div>
    )
  } else {
    const choices = eventChoices(cur, session)
    body = (
      <>
        <div className="ev__opts">
          {choices.map((c) => (
            <ChoiceButton key={c.key} c={c} onPick={() => apply(c.key)} />
          ))}
        </div>
        {session.id === 'EV-GACHA' && (
          <span className="ev__meta">
            넣은 횟수 {session.tries} · 남은 상품 {session.gachaLeft.length}개
          </span>
        )}
        {session.id === 'EV-MOLE' && session.tries > 0 && <span className="ev__meta">다시 파면 더 힘들다.</span>}
      </>
    )
  }

  return (
    <div className="screen ev">
      <SceneLayers scene={regionOf(cur.floor)} />
      <div className="ev__shade" aria-hidden="true" />
      <header className="ev__head">
        <div>
          <h1>{def.name}</h1>
          <span>
            {regionOf(cur.floor) === 'grassland' ? '초원' : '던전'} · {cur.floor}층 · ?{def.repeat ? ' · 반복' : ''}
          </span>
        </div>
        <RunBar run={cur} />
      </header>
      <div className="ev__stage">{artEl}</div>
      <section className="ev__panel">
        <p className="ev__text">{def.text}</p>
        {body}
      </section>
      {zoom.sheet}
    </div>
  )
}
