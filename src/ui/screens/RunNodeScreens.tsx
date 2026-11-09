// ---------------------------------------------------------------------------
// 지도 칸 화면 셋(2026-11 리디자인) — ? 칸 정체 공개 · 모닥불(휴식) · 보물 상자.
// 시안: docs/redesign/screens/Event.dc.html(정체 공개) · Rest.dc.html · RunMap.dc.html(범례).
// 규칙은 전부 `game/run.ts`(`enterReveal`·`restHeal`·`openTreasure`)에 있다.
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react'
import { sheetFor } from '../../art/sprites'
import { getChar } from '../../data/roster'
import { getRelic } from '../../game/relics'
import { markRelicsSeen } from '../../game/progress'
import {
  advanceFloor,
  currentNode,
  enterReveal,
  openTreasure,
  regionOf,
  restHeal,
  restHealAmount,
  upgradableDeckCards,
  type RunState,
  type UnknownKind,
} from '../../game/run'
import { RelicIcon } from '../RelicIcon'
import { RunBar } from '../RunBar'
import { SceneLayers } from '../SceneLayers'
import { SpriteClip } from '../SpriteClip'
import { UpgradeScreen } from './UpgradeScreen'

const REVEAL: Record<UnknownKind, { icon: string; label: string; line: string }> = {
  event: { icon: 'unknown', label: '이벤트', line: '무언가 기다리고 있다.' },
  combat: { icon: 'enemy', label: '전투', line: '수풀이 흔들린다 — 적이다!' },
  goblin: { icon: 'merchant', label: '고블린 장사꾼', line: '보따리를 멘 고블린이 손을 비빈다.' },
  rest: { icon: 'rest', label: '휴식', line: '꺼지지 않은 모닥불이 남아 있다.' },
}

const place = (run: RunState, what: string) =>
  `${regionOf(run.floor) === 'grassland' ? '초원' : '던전'} · ${run.floor}층 · ${what}`

/** ? 칸 — 들어가는 순간 정체가 뒤집힌다. 확인을 누르면 그 칸으로 들어간다. */
export function RevealScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const kind = currentNode(run).reveal ?? 'event'
  const r = REVEAL[kind]
  const [flipped, setFlipped] = useState(false)
  return (
    <div className="screen node">
      <SceneLayers scene={regionOf(run.floor)} />
      <div className="node__shade" aria-hidden="true" />
      <header className="node__head">
        <h1>미지의 칸</h1>
        <span>{place(run, '?')}</span>
      </header>
      <button
        type="button"
        className={`reveal__card ${flipped ? 'is-flipped' : ''}`}
        onClick={() => setFlipped(true)}
        aria-label={flipped ? r.label : '눌러서 뒤집기'}
      >
        <span className="reveal__face reveal__face--back">?</span>
        <span className="reveal__face reveal__face--front">
          <span className="mapicon reveal__icon" style={{ backgroundImage: `url(/redesign/ui/map-icons/${r.icon}.png)` }} />
          <b>{r.label}</b>
        </span>
      </button>
      <p className="node__line">{flipped ? r.line : '무엇이 있을지 모른다. 눌러서 확인한다.'}</p>
      {flipped && (
        <button type="button" className="node__go" onClick={() => onDone(enterReveal(run))}>
          들어간다 ▶
        </button>
      )}
    </div>
  )
}

/** 모닥불 — 쉬기 또는 강화, **하나만**. */
export function RestScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const [upgrading, setUpgrading] = useState(false)
  const heal = restHealAmount(run)
  const after = Math.min(run.maxHp, run.hp + heal)
  const canUp = upgradableDeckCards(run).length > 0
  const hero = sheetFor(run.charId)
  if (upgrading) {
    return (
      <UpgradeScreen run={run} source="rest" onDone={(next) => onDone(advanceFloor(next))} onCancel={() => setUpgrading(false)} />
    )
  }
  return (
    <div className="screen node rest">
      <SceneLayers scene={regionOf(run.floor)} />
      <div className="rest__glow" aria-hidden="true" />
      <div className="rest__fire" role="img" aria-label="모닥불" />
      {hero && (
        <div className="rest__hero">
          <SpriteClip sheet={hero} clip="idle" />
        </div>
      )}
      <header className="node__head">
        <h1>모닥불</h1>
        <span>{place(run, '휴식')}</span>
        <div className="node__bar">
          <RunBar run={run} />
        </div>
      </header>
      <section className="rest__opts">
        <p>
          불가에서 할 수 있는 건 <b>하나뿐</b>이다.
        </p>
        <div className="rest__row">
          <button type="button" className="rest__opt" onClick={() => onDone(advanceFloor(restHeal(run)))}>
            <span className="rest__kicker">REST</span>
            <b>쉰다</b>
            <span>따뜻한 불 옆에서 눈을 붙인다.</span>
            <div className="rest__chips">
              <span>HP +{heal} (최대의 30%)</span>
              <span>
                {run.hp} → {after}
              </span>
            </div>
          </button>
          <button
            type="button"
            className="rest__opt"
            aria-disabled={!canUp}
            onClick={() => canUp && setUpgrading(true)}
          >
            <span className="rest__kicker">
              UPGRADE <span className="rest__anvil" aria-hidden="true" />
            </span>
            <b>카드를 벼린다</b>
            <span>카드 한 장 · 수치 또는 범위 · 룰렛.</span>
            <div className="rest__chips">
              <span>수치 +0~20</span>
              <span>범위 +0~5칸</span>
              <span>0 = 꽝 10%</span>
            </div>
            {!canUp && <span className="rest__why">강화할 카드가 없다</span>}
          </button>
        </div>
        <span className="rest__foot">상점에서는 50골드를 내고 같은 강화를 할 수 있다(상점마다 한 번).</span>
      </section>
    </div>
  )
}

/** 보물 칸 — 상자를 열면 유물 하나. */
export function TreasureScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const opened = useMemo(() => {
    const r = openTreasure(run)
    if (r.relicId) markRelicsSeen([r.relicId])
    return r
  }, [run])
  const [shown, setShown] = useState(false)
  const relic = opened.relicId ? getRelic(opened.relicId) : undefined
  const char = getChar(run.charId)
  return (
    <div className="screen node treasure">
      <SceneLayers scene={regionOf(run.floor)} />
      <div className="node__shade" aria-hidden="true" />
      <header className="node__head">
        <h1>보물</h1>
        <span>{place(run, '보물')}</span>
      </header>
      {!shown ? (
        <button type="button" className="treasure__chest" onClick={() => setShown(true)}>
          <span className="mapicon treasure__icon" style={{ backgroundImage: 'url(/redesign/ui/map-icons/treasure.png)' }} />
          <b>상자를 연다</b>
        </button>
      ) : (
        <div className="treasure__got" style={{ ['--accent' as string]: char.accent }}>
          {relic ? (
            <>
              <RelicIcon id={relic.id} size={78} />
              <b>{relic.name}</b>
              <p>{relic.desc}</p>
            </>
          ) : (
            <p>상자 안엔 약초만 들어 있었다. 체력을 조금 회복했다.</p>
          )}
          <button type="button" className="node__go" onClick={() => onDone(advanceFloor(opened.run))}>
            지도로 ▶
          </button>
        </div>
      )}
    </div>
  )
}
