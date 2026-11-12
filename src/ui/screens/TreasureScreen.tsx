// 보물 칸 = 유물 상자(2026-11 리디자인). ? 칸 모닥불은 2026-11-12에 없앴다(사용자 — "옛날 잔재").
import { useState } from 'react'
import { getRelic } from '../../game/relics'
import { advanceFloor, openTreasure, placeLabel, regionOf, type RunState } from '../../game/run'
import { RARITY_LABEL, RelicIcon } from '../RelicIcon'
import { SceneLayers } from '../SceneLayers'

const where = (run: RunState, what: string) =>
  `${placeLabel(run)} · ${what}`

export function TreasureScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const [opened, setOpened] = useState<{ run: RunState; relicId?: string } | null>(null)
  const relic = opened?.relicId ? getRelic(opened.relicId) : null
  return (
    <div className="screen event">
      <SceneLayers scene={regionOf(run)} />
      <div className="screenveil" />
      <header className="event__head">
        <div className="shop__where">
          <h1 className="shop__title">보물</h1>
          <span>{where(run, '유물 상자')}</span>
        </div>
      </header>
      <div className="event__stage">
        <i className={`treasure__chest ${opened ? 'is-open' : ''}`} role="img" aria-label="유물 상자" />
      </div>
      <section className="event__panel">
        <span className="event__kicker">TREASURE</span>
        <h2 className="event__name">유물 상자</h2>
        <p className="event__desc">길가에 낡은 상자가 놓여 있다. 자물쇠는 이미 부서져 있다.</p>
        {!opened ? (
          <button className="upg__go treasure__open" onClick={() => setOpened(openTreasure(run))}>
            연다 ▶
          </button>
        ) : (
          <>
            <div className={`event__res event__res--${relic ? 'relic' : 'gain'}`}>
              {relic ? <RelicIcon id={relic.id} size={78} /> : <span className="event__big is-gain">HP +20</span>}
              <div className="event__resbody">
                <b>{relic ? `「${relic.name}」` : '빈 상자 — 대신 숨을 돌렸다'}</b>
                {relic && (
                  <small>
                    <em className={`relictip__rarity is-${relic.rarity}`}>{RARITY_LABEL[relic.rarity]}</em> {relic.desc}
                  </small>
                )}
              </div>
            </div>
            <div className="event__resfoot">
              <span />
              <button className="upg__go" onClick={() => onDone(advanceFloor(opened.run))}>
                지도로 ▶
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
