// 보물 칸 = 유물 상자(2026-11 리디자인 · 시안 `Treasure.dc.html` 2026-11-13).
// 그림(상자)을 화면 전체에 깔고 글은 오른쪽 패널, 선택지는 그 아래 — 그림 있는 ? 이벤트와 같은 배치.
// 열면 상자 그림이 열린 상자(`box-in`)로 바뀌고 받은 유물을 상자 안에 얹는다. 받을 유물이 없으면 체력 +20.
// ⚠ 시안의 미믹(`mimic.png`)은 규칙이 없어 아직 안 나온다(PROGRESS T17).
import { useState } from 'react'
import { getRelic } from '../../game/relics'
import { advanceFloor, openTreasure, placeLabel, type RunState } from '../../game/run'
import { RARITY_LABEL, RelicIcon } from '../RelicIcon'

const EDGE = '#c9952f'
const RARITY_EDGE = { common: '#8a849a', rare: '#6ab8ff', epic: '#c48aff', legend: '#ffd86a' } as const

export function TreasureScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const [opened, setOpened] = useState<{ run: RunState; relicId?: string } | null>(null)
  const relic = opened?.relicId ? getRelic(opened.relicId) : null
  const cur = opened?.run ?? run
  const empty = opened && !relic
  return (
    <div className="screen event event--scene treasure" style={{ ['--evcol' as string]: empty ? '#6a6478' : EDGE }}>
      <div className={`artbg artbg--fill artbg--tb-${opened ? 'in' : 'box'}`} aria-hidden="true" />
      <div
        key={opened ? 'in' : 'box'}
        className={`artbg artbg--tb-${opened ? 'in' : 'box'} ${opened ? 'treasure__bgin' : ''}`}
        role="img"
        aria-label={opened ? (relic ? '상자 안의 유물' : '빈 상자') : '유물 상자'}
      />
      <i className="event__sceneveil" aria-hidden="true" />
      <header className="event__head">
        <div className="shop__where">
          <h1 className="shop__title">보물</h1>
          <span>{placeLabel(run)} · 유물 상자</span>
        </div>
        <div className="shop__purse">
          <span className="hpchip">
            HP {cur.hp}/{cur.maxHp}
          </span>
        </div>
      </header>

      {/* 상자 안에 든 것 — 열린 상자 그림 위에 얹는다 */}
      {opened && (
        <div className="treasure__loot">
          <span className="treasure__shine" aria-hidden="true" />
          {relic ? (
            <RelicIcon id={relic.id} size={78} className="treasure__relic" />
          ) : (
            <span className="treasure__big">+20</span>
          )}
          <span className="treasure__tag" style={{ borderColor: relic ? RARITY_EDGE[relic.rarity] : '#6ab83a' }}>
            {relic ? `「${relic.name}」` : '체력 +20'}
          </span>
        </div>
      )}

      <section className="event__panel">
        <span className="event__kicker">{!opened ? 'TREASURE' : relic ? 'TREASURE · 획득' : 'TREASURE · 빈 상자'}</span>
        <h2 className="event__name">
          {!opened ? '유물 상자' : relic ? '상자 안에 유물이 들어 있었다' : '상자는 비어 있었다'}
        </h2>
        <p className="event__desc">
          {!opened
            ? '길가에 낡은 상자가 놓여 있다.\n자물쇠는 이미 부서져 있다.'
            : relic
              ? `「${relic.name}」을(를) 손에 넣었다.`
              : '먼지만 풀썩인다. 대신 잠깐 숨을 돌렸다.'}
        </p>
        {relic && (
          <span className="treasure__desc">
            <em className={`relictip__rarity is-${relic.rarity}`}>{RARITY_LABEL[relic.rarity]}</em> · {relic.desc}
          </span>
        )}
      </section>

      <nav className="treasure__choices" key={opened ? 'after' : 'before'}>
        {!opened ? (
          <>
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
          </>
        ) : (
          <button className="event__opt treasure__opt" onClick={() => onDone(advanceFloor(opened.run))}>
            <span className="event__opt-label">
              {relic ? '받고 지도로' : '지도로'}
              {relic && <small>유물 줄에 바로 붙는다</small>}
            </span>
          </button>
        )}
      </nav>
    </div>
  )
}
