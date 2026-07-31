import { useState } from 'react'
import type { AuthUser } from '../../net/auth'

const HOW_TO: { step: string; label: string }[] = [
  { step: '1', label: '매 턴 카드 3장을 골라 슬롯에 순서대로 배치한다.' },
  { step: '2', label: '같은 슬롯에선 이동·가드·원기(빠른 카드)가 공격보다 먼저 실행된다.' },
  { step: '3', label: '6×3 격자를 상하좌우로 움직여 상대의 사정거리를 피하라.' },
  { step: '4', label: '공격 카드는 기력(⚡)을 소모한다. 원기 카드로 회복.' },
  { step: '5', label: '상대 HP를 먼저 0으로 만들면 승리. 사다리를 끝까지 올라라.' },
]

export function TitleScreen({
  user,
  onLogout,
  onStart,
  onRoguelike,
  onDecks,
  onCodex,
}: {
  user: AuthUser | null
  onLogout: () => void
  onStart: () => void
  onRoguelike: () => void
  onDecks: () => void
  onCodex: () => void
}) {
  const [showControls, setShowControls] = useState(false)
  return (
    <div className="screen title">
      <div className="grid-bg" />

      {user && (
        <div className="userchip">
          {user.photo ? (
            <img className="userchip__avatar" src={user.photo} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="userchip__avatar userchip__avatar--fallback">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="userchip__name">{user.name}</span>
          <button
            className="userchip__logout"
            onClick={onLogout}
            title="로그아웃"
            aria-label="로그아웃"
          >
            ⏻
          </button>
        </div>
      )}
      <div className="title__content">
        <div className="title__kicker neon-text">THE GRID · DEMON GAUNTLET</div>
        <h1 className="title__logo">
          <span className="title__word title__word--a">GRID</span>
          <span className="title__word title__word--b">BRAWL</span>
        </h1>
        <p className="title__tag">
          세 직업. 하나의 사다리. 끝까지 올라 그리드의 주인이 되어라.
        </p>
        <div className="title__buttons">
          <button className="btn" onClick={onStart}>
            게임 시작
          </button>
          <button className="btn btn--roguelike" onClick={onRoguelike}>
            로그라이크
          </button>
          <button className="btn btn--online" onClick={onDecks}>
            덱 만들기
          </button>
          <button className="btn btn--codex" onClick={onCodex}>
            도감
          </button>
          <button className="btn btn--ghost" onClick={() => setShowControls((v) => !v)}>
            조작법
          </button>
        </div>
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
      <div className="scanlines" />
    </div>
  )
}
