// ? 칸 이벤트(디자인 `EventsQ` · 규칙 `docs/redesign/EVENTS.md`). 로직은 `game/events.ts`.
// 선택지엔 대가만 → 고른 뒤 결과 공개. 반복 이벤트는 "계속하기", 낡은 대장간은 룰렛 강화로,
// 항아리는 뱀 전투로 이어진다.
import { useMemo, useState } from 'react'
import { getChar } from '../../data/roster'
import { getRelic } from '../../game/relics'
import {
  eventChoices, eventDef, resolveEventChoice, startEvent, tradeList, type EventChoice, type EventId,
  type EventOutcome,
} from '../../game/events'
import { advanceFloor, regionOf, runCard, type RunState, type SpecialFight } from '../../game/run'
import { CardFace, cardAccent } from '../CardFace'
import { useCardZoom } from '../CardDetail'
import { RARITY_LABEL, RelicIcon } from '../RelicIcon'
import { SceneLayers } from '../SceneLayers'
import { SpriteClip } from '../SpriteClip'
import { sheetFor } from '../../art/sprites'
import { UpgradeScreen } from './UpgradeScreen'

export function EventScreen({
  run,
  eventId,
  onDone,
  onFight,
}: {
  run: RunState
  /** 정해 두면 그 이벤트(? 칸 공개 단계가 고른 것). 없으면 무작위. */
  eventId?: EventId
  onDone: (next: RunState) => void
  /** 이벤트가 연 전투(항아리) — `special`이 붙은 런을 넘긴다. */
  onFight: (next: RunState) => void
}) {
  const [st, setSt] = useState(() => startEvent(eventId))
  const [cur, setCur] = useState(run)
  const [picking, setPicking] = useState<EventChoice | null>(null)
  const [out, setOut] = useState<EventOutcome | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const def = eventDef(st.id)
  const char = getChar(cur.charId)
  const zoom = useCardZoom(char.accent)
  const choices = useMemo(() => eventChoices(cur, st), [cur, st])
  const snake = sheetFor('snake')

  const choose = (c: EventChoice, pickId?: string) => {
    if (c.off) return
    if (c.leave) return onDone(advanceFloor(cur))
    if (c.pick && !pickId) return setPicking(c)
    const o = resolveEventChoice(cur, st, c.key, pickId)
    if (!o) return
    setPicking(null)
    setCur(o.run)
    setSt(o.st)
    if (o.upgrade) return setUpgrading(true)
    setOut(o)
  }

  if (upgrading)
    return <UpgradeScreen run={cur} source="event" onCancel={() => setUpgrading(false)} onDone={(next) => onDone(advanceFloor(next))} />

  const fight = (f: SpecialFight) => onFight({ ...cur, special: f })
  const relic = out?.relicId ? getRelic(out.relicId) : null
  const gotCard = out?.cardId ? runCard(cur, out.cardId) : null
  const a = def.art

  return (
    <div className="screen event">
      <SceneLayers scene={regionOf(cur.floor)} />
      <div className="screenveil" />
      <header className="event__head">
        <div className="shop__where">
          <h1 className="shop__title">? 칸 · 이벤트</h1>
          <span>
            {regionOf(cur.floor) === 'grassland' ? '초원' : '던전'} · {cur.floor}층
          </span>
        </div>
        <div className="shop__purse">
          <span className="goldchip">
            <i className="coin coin--sm" aria-hidden />
            {cur.gold}
          </span>
          <span className="hpchip">
            HP {cur.hp}/{cur.maxHp}
          </span>
        </div>
      </header>

      <div className="event__stage">
        <i
          className={`evart ${a.frames > 1 ? 'evart--anim' : ''}`}
          role="img"
          aria-label={def.name}
          style={{
            width: a.w * 3,
            height: a.h * 3,
            backgroundImage: `url('/redesign/ui/events/${a.file}.png')`,
            backgroundSize: `${a.w * 3 * a.frames}px ${a.h * 3}px`,
            ['--evw' as string]: `-${a.w * 3 * a.frames}px`,
            animationTimingFunction: `steps(${a.frames})`,
            animationDuration: `${a.frames * (a.frameMs ?? 150)}ms`,
          }}
        />
        <span className="event__code">{def.code}</span>
      </div>

      <section className="event__panel">
        <span className="event__kicker">
          EVENT · {def.mode === 'repeat' ? '반복' : def.mode === 'battle' ? '전투' : '한 번'}
        </span>
        <h2 className="event__name">{def.name}</h2>
        <p className="event__desc">{def.text}</p>

        {!out && !picking && (
          <>
            <div className="event__options">
              {choices.map((c) => (
                <button
                  key={c.key}
                  className={`event__opt ${c.hidden === 'locked' ? 'is-locked' : ''} ${c.hidden === 'open' ? 'is-hidden' : ''} ${c.off && c.hidden !== 'locked' ? 'is-off' : ''}`}
                  aria-disabled={!!c.off}
                  onClick={() => choose(c)}
                >
                  {c.hidden === 'locked' && <i className="event__lock" aria-hidden />}
                  {c.hidden === 'open' && <i className="event__unlock" aria-hidden />}
                  {c.icon && <i className="event__potion" style={{ backgroundImage: `url('/redesign/ui/events/${c.icon}.png')` }} aria-hidden />}
                  <span className="event__opt-label">
                    {c.label}
                    {c.sub && <small>{c.sub}</small>}
                  </span>
                  {c.off && c.hidden !== 'locked' ? (
                    <span className="chip chip--none">{c.off}</span>
                  ) : (
                    c.cost.map((k) => (
                      <span key={k.text} className={`chip chip--${k.kind}`}>
                        {k.kind === 'gold' && <i className="coin coin--sm" aria-hidden />}
                        {k.text}
                      </span>
                    ))
                  )}
                </button>
              ))}
            </div>
            <p className="event__note">
              선택지에는 <b>대가만</b> 보인다 — 고르면 무슨 일이 생기는지는 고른 뒤에 안다.
            </p>
          </>
        )}

        {picking && (
          <div className="event__picker">
            <span className="event__picktitle">{picking.pick === 'card' ? '내줄 카드를 고르세요' : '내줄 유물을 고르세요'}</span>
            <div className="event__picks">
              {tradeList(cur, picking.pick!).map((id) => {
                if (picking.pick === 'relic') {
                  const r = getRelic(id)
                  return (
                    <button key={id} className="event__pick" onClick={() => choose(picking, id)} title={r?.desc}>
                      <RelicIcon id={id} size={52} />
                      <span>{r?.name}</span>
                    </button>
                  )
                }
                const c = runCard(cur, id)
                if (!c) return null
                return (
                  <button
                    key={id}
                    className="event__pick event__pick--card"
                    {...zoom.bind(c)}
                    onClick={() => {
                      if (zoom.consumedClick()) return
                      choose(picking, id)
                    }}
                  >
                    <CardFace card={c} accent={cardAccent(c, char.accent)} compact />
                  </button>
                )
              })}
            </div>
            <button className="upg__ghost" onClick={() => setPicking(null)}>
              ← 다시 고르기
            </button>
          </div>
        )}

        {out?.fight && (
          <div className="event__ambush">
            <div className="event__snake">{snake && <SpriteClip sheet={snake} clip="idle" />}</div>
            <div className="event__ambushbody">
              <span className="event__kicker">AMBUSH</span>
              <b>{out.title}</b>
              <div className="event__chips">
                <span className="chip chip--poison">☠ 나는 중독 상태로 시작</span>
                <span className="chip chip--hp">동굴 뱀 · HP 34</span>
              </div>
              <button className="upg__go event__fight" onClick={() => fight(out.fight!)}>
                전투 시작 ▶
              </button>
            </div>
          </div>
        )}

        {out && !out.fight && (
          <>
            <div className={`event__res event__res--${relic ? 'relic' : out.bigKind ?? 'none'}`}>
              {relic && <RelicIcon id={relic.id} size={78} />}
              {gotCard && (
                <div className="event__rescard">
                  <CardFace card={gotCard} accent={cardAccent(gotCard, char.accent)} compact />
                </div>
              )}
              {!relic && !gotCard && out.big && <span className={`event__big is-${out.bigKind}`}>{out.big}</span>}
              <div className="event__resbody">
                <b>{out.title}</b>
                <span>{out.body}</span>
                {relic && (
                  <small>
                    <em className={`relictip__rarity is-${relic.rarity}`}>{RARITY_LABEL[relic.rarity]}</em> {relic.desc}
                  </small>
                )}
              </div>
            </div>
            <div className="event__resfoot">
              {!out.done && (
                <button className="upg__ghost" onClick={() => setOut(null)}>
                  계속하기
                </button>
              )}
              <span>{out.done ? '' : '그만두려면 선택지의 나가기를 고른다.'}</span>
              {out.done && (
                <button className="upg__go" onClick={() => onDone(advanceFloor(cur))}>
                  지도로 ▶
                </button>
              )}
            </div>
          </>
        )}
      </section>
      {zoom.sheet}
    </div>
  )
}
