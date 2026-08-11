import { useState } from 'react'
import type { AuthUser } from '../../net/auth'

const HOW_TO: { step: string; label: string }[] = [
  { step: '1', label: '매 라운드 카드 3장을 골라 슬롯에 순서대로 배치한다(3장 = 3턴).' },
  { step: '2', label: '같은 슬롯에선 이동·가드·원기(빠른 카드)가 공격보다 먼저 실행된다.' },
  { step: '3', label: '6×3 격자를 상하좌우로 움직여 상대의 사정거리를 피하라.' },
  { step: '4', label: '공격 카드는 기력(⚡)을 소모한다. 원기 카드로 회복.' },
  { step: '5', label: '상대 HP를 먼저 0으로 만들면 승리. 사다리를 끝까지 올라라.' },
]

/**
 * 타이틀. **"게임 시작"이 곧 로그라이크다**(2026-08-04 사용자 요청) — 예전엔 게임
 * 시작이 단판(덱 선택 → 봇/온라인)이고 로그라이크가 별도 버튼이었는데, 본편이
 * 로그라이크라 그쪽이 기본 입구가 됐다. 단판 흐름은 **PVP 버튼**으로 옮겼다
 * (덱 선택 → 봇전/온라인 = `deck-select`).
 *
 * **덱 만들기는 타이틀에 없다**(2026-08-04 사용자 요청) — 덱은 PVP에서만 쓰므로
 * PVP 안(`DeckSelectScreen`의 "덱 만들기" 버튼)으로 넣었다. 그래서 `deck-manage`는
 * 이제 `deck-select`에서만 열리고, 뒤로 가면 타이틀이 아니라 덱 선택으로 돌아간다.
 */
export function TitleScreen({
  user,
  onLogout,
  onStart,
  onPvp,
  onCodex,
  admin,
}: {
  user: AuthUser | null
  onLogout: () => void
  /** 게임 시작 = 로그라이크 런 출발(`run-start`). */
  onStart: () => void
  /** PVP = 덱 선택 → 봇전·온라인(`deck-select`). */
  onPvp: () => void
  onCodex: () => void
  /**
   * 밸런스 어드민 입구. **개발 빌드에서만 넘어온다** — 배포 빌드에서는 undefined이고,
   * 아래 JSX도 `import.meta.env.DEV &&`로 한 번 더 막아 **버튼 문자열까지** 번들에서
   * 사라지게 한다(`false && …`는 죽은 코드라 통째로 지워진다).
   * `dirty`는 지금 소스와 다르게 고쳐 둔 항목 수다.
   */
  admin?: { open: () => void; dirty: number }
}) {
  const [showControls, setShowControls] = useState(false)
  return (
    <div className="screen title">
      <div className="grid-bg grid-bg--hall" />

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
        {/* ⚠ 로그인 화면과 **같은 문구**여야 한다 — 두 화면이 이어 붙어 보인다.
            GAUNTLET(대진표 건틀릿)은 2026-08-04에 모드째 사라져서 ASCENT(15층
            사다리를 오른다)로 갈았다. `letter-spacing: 0.5em`이라 더 길어지면 넘친다. */}
        <div className="title__kicker neon-text">THE GRID · DEMON ASCENT</div>
        <h1 className="title__logo">
          <span className="title__word title__word--a">GRID</span>
          <span className="title__word title__word--b">BRAWL</span>
        </h1>
        <p className="title__tag">
          세 직업. 하나의 사다리. 끝까지 올라 그리드의 주인이 되어라.
        </p>
        <div className="title__buttons">
          <button className="btn btn--roguelike" onClick={onStart}>
            게임 시작
          </button>
          <button className="btn btn--pvp" onClick={onPvp}>
            PVP
          </button>
          <button className="btn btn--codex" onClick={onCodex}>
            도감
          </button>
          <button className="btn btn--ghost" onClick={() => setShowControls((v) => !v)}>
            조작법
          </button>
          {import.meta.env.DEV && admin && (
            <button className="btn btn--ghost" onClick={admin.open}>
              ⚙ 어드민{admin.dirty > 0 ? ` ·${admin.dirty}` : ''}
            </button>
          )}
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
    </div>
  )
}
