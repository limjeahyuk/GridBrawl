// 보물 칸 = 유물 상자(2026-11 리디자인 · 시안 `Treasure.dc.html` 2026-11-13).
// 닫힌 상자 그림 + 오른쪽 글 · 선택지(연다 / 그냥 지나간다). 열면 열린 상자(`box-in`) **한가운데**에 유물이
// 떠오르고 오른쪽에 툴팁처럼 효과가 붙는다 — **유물을 누르면 바로 지도로**(사용자 지정 11-13).
// 체력 · 골드 칩은 없다(유물만 얻는 곳 — 사용자 지정). 받을 유물이 없으면 체력 +20(`openTreasure`).
// ⚠ 시안의 미믹(`mimic.png`)은 규칙이 없어 아직 안 나온다(PROGRESS T17).
import { useState } from 'react'
import { getRelic } from '../../game/relics'
import { advanceFloor, openTreasure, placeLabel, type RunState } from '../../game/run'
import { RARITY_LABEL, RelicIcon } from '../RelicIcon'

const RARITY_EDGE = { common: '#8a849a', rare: '#6ab8ff', epic: '#c48aff', legend: '#ffd86a' } as const

export function TreasureScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const [opened, setOpened] = useState<{ run: RunState; relicId?: string } | null>(null)
  const relic = opened?.relicId ? getRelic(opened.relicId) : null
  const art = opened ? 'in' : 'box'
  return (
    <div className="screen event event--scene treasure" style={{ ['--evcol' as string]: '#c9952f' }}>
      <div className={`artbg artbg--fill artbg--tb-${art}`} aria-hidden="true" />
      <div
        key={art}
        className={`artbg artbg--tb-${art} ${opened ? 'treasure__bgin' : ''}`}
        role="img"
        aria-label={opened ? '열린 상자' : '유물 상자'}
      />
      <i className={opened ? 'treasure__veil' : 'event__sceneveil'} aria-hidden="true" />
      <header className="event__head">
        <div className="shop__where">
          <h1 className="shop__title">보물</h1>
          <span>{placeLabel(run)} · 유물 상자</span>
        </div>
      </header>

      {!opened ? (
        <>
          <section className="event__panel">
            <span className="event__kicker">TREASURE</span>
            <h2 className="event__name">유물 상자</h2>
            <p className="event__desc">{'길가에 낡은 상자가 놓여 있다.\n자물쇠는 이미 부서져 있다.'}</p>
          </section>
          <nav className="treasure__choices">
            <button className="event__opt treasure__opt" onClick={() => setOpened(openTreasure(run))}>
              <span className="event__opt-label">
                연다
                <small>유물 하나 — 고르는 건 없다</small>
              </span>
            </button>
            <button className="event__opt treasure__opt" onClick={() => onDone(advanceFloor(run))}>
              <span className="event__opt-label">
                그냥 지나간다
                <small>아무 일 없이 지도로 돌아간다</small>
              </span>
            </button>
          </nav>
        </>
      ) : (
        // 상자 안 한가운데 — 누르면 지도로.
        <div className="treasure__loot">
          <span className="treasure__shine" aria-hidden="true" />
          <button
            type="button"
            className="treasure__item"
            onClick={() => onDone(advanceFloor(opened.run))}
            aria-label={relic ? `「${relic.name}」 받고 지도로` : '지도로'}
          >
            {relic ? <RelicIcon id={relic.id} size={78} className="treasure__relic" /> : <span className="treasure__big">+20</span>}
          </button>
          <span className="treasure__hint">눌러서 지도로 ▶</span>
          <div className="treasure__tip" style={{ ['--tipcol' as string]: relic ? RARITY_EDGE[relic.rarity] : '#6ab83a' }}>
            {relic ? (
              <>
                <span className="relictip__name">
                  <b>{relic.name}</b>
                  <em className={`relictip__rarity is-${relic.rarity}`}>{RARITY_LABEL[relic.rarity]}</em>
                </span>
                <p>{relic.desc}</p>
              </>
            ) : (
              <>
                <span className="relictip__name">
                  <b>빈 상자</b>
                </span>
                <p>먼지만 풀썩인다. 대신 잠깐 숨을 돌렸다 — 체력 +20.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
