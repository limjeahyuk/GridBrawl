// 휴식 칸 = 모닥불(디자인 `Rest`) · 보물 칸 = 유물 상자. 둘 다 2026-11 리디자인에서 생긴 지도 칸.
import { useState } from 'react'
import { sheetFor } from '../../art/sprites'
import { getRelic } from '../../game/relics'
import {
  advanceFloor, openTreasure, regionOf, restAtFire, restHealAmount, upgradableDeckCards, type RunState,
} from '../../game/run'
import { RARITY_LABEL, RelicIcon } from '../RelicIcon'
import { SceneLayers } from '../SceneLayers'
import { SpriteClip } from '../SpriteClip'
import { UpgradeScreen } from './UpgradeScreen'

const where = (run: RunState, what: string) =>
  `${regionOf(run.floor) === 'grassland' ? '초원' : '던전'} · ${run.floor}층 · ${what}`

export function RestScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const [upgrading, setUpgrading] = useState(false)
  const hero = sheetFor(run.charId)
  const heal = restHealAmount(run)
  const canUp = upgradableDeckCards(run).length > 0
  if (upgrading)
    return <UpgradeScreen run={run} source="rest" onCancel={() => setUpgrading(false)} onDone={(next) => onDone(advanceFloor(next))} />
  return (
    <div className="screen rest">
      <SceneLayers scene={regionOf(run.floor)} />
      <i className="rest__glow" aria-hidden />
      <i className="rest__fire" role="img" aria-label="모닥불" />
      <div className="rest__hero">{hero && <SpriteClip sheet={hero} clip="idle" />}</div>
      <header className="shop__head">
        <div className="shop__where">
          <h1 className="shop__title">모닥불</h1>
          <span className="rest__where">{where(run, '휴식')}</span>
        </div>
        <span className="hpchip">
          HP {run.hp}/{run.maxHp}
        </span>
      </header>
      <section className="rest__panel">
        <p>
          불가에서 할 수 있는 건 <b>하나뿐</b>이다.
        </p>
        <div className="rest__opts">
          <button type="button" className="rest__opt" onClick={() => onDone(restAtFire(run))}>
            <span className="rest__en is-red">REST</span>
            <b>쉰다</b>
            <span>따뜻한 불 옆에서 눈을 붙인다.</span>
            <div className="rest__chips">
              <span className="chip chip--hp">HP +{heal} (최대의 30%)</span>
              <span className="chip chip--item">
                {run.hp} → {Math.min(run.maxHp, run.hp + heal)}
              </span>
            </div>
          </button>
          <button type="button" className="rest__opt" disabled={!canUp} onClick={() => setUpgrading(true)}>
            <span className="rest__en is-gold">
              UPGRADE <i className="item__anvil" aria-hidden />
            </span>
            <b>카드를 벼린다</b>
            <span>카드 한 장 · 수치 또는 범위 · 룰렛.</span>
            <div className="rest__chips">
              <span className="chip chip--gold">수치 +0~20</span>
              <span className="chip chip--range">범위 +0~5칸</span>
              <span className="chip chip--item">{canUp ? '0 = 꽝 10%' : '강화할 카드가 없다'}</span>
            </div>
          </button>
        </div>
        <span className="rest__note">지도의 대장장이 칸에서도 50골드를 내고 같은 강화를 할 수 있다(들를 때마다 한 번).</span>
      </section>
    </div>
  )
}

export function TreasureScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const [opened, setOpened] = useState<{ run: RunState; relicId?: string } | null>(null)
  const relic = opened?.relicId ? getRelic(opened.relicId) : null
  return (
    <div className="screen event">
      <SceneLayers scene={regionOf(run.floor)} />
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
