import { getChar } from '../../data/roster'
import { PortraitSvg } from '../PortraitSvg'
import type { Deck } from '../../game/decks'

/** 모드 선택 — 고른 덱으로 봇전(1:1 단판) 또는 온라인 대전. */
export function ModeSelectScreen({
  deck,
  onBot,
  onOnline,
  onBack,
}: {
  deck: Deck
  onBot: () => void
  onOnline: () => void
  onBack: () => void
}) {
  const char = getChar(deck.charId)
  return (
    <div className="screen modeselect" style={{ ['--accent' as string]: char.accent }}>
      <div className="grid-bg" />
      <div className="deckmgr__bar">
        <button className="btn btn--ghost" onClick={onBack}>
          ◀ 뒤로
        </button>
        <h2 className="neon-text">모드 선택</h2>
        <div style={{ width: 90 }} />
      </div>

      <div className="modeselect__deck">
        <PortraitSvg char={char} className="modeselect__portrait" />
        <div>
          <div className="modeselect__deckname neon-text">{deck.name}</div>
          <div className="modeselect__meta">
            {char.name} · {deck.cardIds.length + 7}장
          </div>
        </div>
      </div>

      <div className="modeselect__options">
        <button className="mode-card" onClick={onBot}>
          <span className="mode-card__icon">🤖</span>
          <span className="mode-card__title">봇전</span>
          <span className="mode-card__desc">AI와 1:1 단판 대결</span>
        </button>
        <button className="mode-card mode-card--online" onClick={onOnline}>
          <span className="mode-card__icon">🌐</span>
          <span className="mode-card__title">온라인 대전</span>
          <span className="mode-card__desc">빠른 매칭 또는 코드로 친구와</span>
        </button>
      </div>
      <div className="scanlines" />
    </div>
  )
}
