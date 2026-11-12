import { useState } from 'react'
import { sheetFor } from '../../art/sprites'
import { SceneLayers } from '../SceneLayers'
import { SpriteClip } from '../SpriteClip'

const HOW_TO: { step: string; label: string }[] = [
  { step: '1', label: '매 라운드 카드 3장을 골라 슬롯에 순서대로 배치한다(3장 = 3턴).' },
  { step: '2', label: '같은 슬롯에선 이동·가드·원기(빠른 카드)가 공격보다 먼저 실행된다.' },
  { step: '3', label: '6×4 격자를 상하좌우로 움직여 상대의 사정거리를 피하라.' },
  { step: '4', label: '공격 카드는 기력(⚡)을 소모한다. 원기 카드로 회복.' },
  { step: '5', label: '상대 HP를 먼저 0으로 만들면 승리. 사다리를 끝까지 올라라.' },
]

function TitleLogo() {
  return (
    <div className="title__head">
      <p className="title__kicker">TACTICAL CARD BRAWLER</p>
      <h1 className="title__logo">
        GRID
        <br />
        BRAWL
      </h1>
      <p className="title__tag">카드 세 장, 한 칸의 승부</p>
    </div>
  )
}

/** 풀밭에 선 세 영웅과 슬라임(디자인의 타이틀). 위치는 프레임 왼쪽 위 기준이다. */
const PARTY: { id: string; left: number; top: number; flip?: boolean; scale?: number }[] = [
  { id: 'slime', left: 1100, top: 520, flip: true, scale: 2 },
  { id: 'warrior', left: 640, top: 456 },
  { id: 'archer', left: 780, top: 468 },
  { id: 'mage', left: 905, top: 456 },
]

function TitleParty() {
  return (
    <div className="title__party" aria-hidden="true">
      <i className="title__shadow" />
      {PARTY.map((p) => {
        const sheet = sheetFor(p.id)
        return (
          sheet && (
            <div
              key={p.id}
              style={{
                position: 'absolute',
                left: p.left,
                top: p.top,
                ['--artflip' as string]: p.flip ? -1 : 1,
              }}
            >
              <SpriteClip sheet={sheet} clip="idle" scale={p.scale} />
            </div>
          )
        )
      })}
    </div>
  )
}

/**
 * 타이틀. "모험 시작"이 곧 로그라이크다. PvP(봇전·온라인)·덱 만들기·로그인은
 * 2026-11-10에 main에서 뺐다 — 브랜치 `archive/pvp`에 남아 있다.
 */
export function TitleScreen({
  onStart,
  onCodex,
}: {
  /** 게임 시작 = 로그라이크 런 출발(`run-start`). */
  onStart: () => void
  onCodex: () => void
}) {
  const [showControls, setShowControls] = useState(false)
  return (
    <div className="screen title">
      <SceneLayers scene="grassland" />
      <div className="title__shade" aria-hidden="true" />

      <TitleLogo />

      <nav className="title__menu" aria-label="메인 메뉴">
        <button className="titlebtn titlebtn--main" onClick={onStart}>
          <span className="titlebtn__arrow">▶</span>모험 시작
        </button>
        <button className="titlebtn" onClick={onCodex}>
          도감
        </button>
        <button className="titlebtn titlebtn--small" onClick={() => setShowControls((v) => !v)}>
          조작법
        </button>
      </nav>

      <TitleParty />

      <div className="title__foot">
        <span>V0.2 REDESIGN</span>
        <i />
        <span className="title__footko">지역: 초원 → 던전</span>
      </div>

      {showControls && (
        <div className="overlay" onClick={() => setShowControls(false)}>
          <div className="panel controls" onClick={(e) => e.stopPropagation()}>
            <h2>게임 방법</h2>
            <div className="howto">
              {HOW_TO.map((h) => (
                <div className="howto__row" key={h.step}>
                  <span className="howto__step">{h.step}</span>
                  <span className="howto__label">{h.label}</span>
                </div>
              ))}
            </div>
            <p className="controls__note">마우스로 카드를 클릭해 배치하고 실행합니다.</p>
            <button className="btn btn--ghost" onClick={() => setShowControls(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
