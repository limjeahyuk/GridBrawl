import { getChar } from '../../data/roster'
import { PortraitSvg } from '../PortraitSvg'

export type Outcome = 'win' | 'champion' | 'loss'

export function ResultScreen({
  outcome,
  playerCharId,
  onNext,
  onRetry,
  onMenu,
}: {
  outcome: Outcome
  playerCharId: string
  onNext: () => void
  onRetry: () => void
  onMenu: () => void
}) {
  const player = getChar(playerCharId)
  const cfg = {
    win: { title: '승리', sub: 'K.O.', cls: 'win' },
    champion: { title: 'GRID 챔피언', sub: '코어를 장악했다', cls: 'champ' },
    loss: { title: '패배', sub: 'SYSTEM FAILURE', cls: 'loss' },
  }[outcome]

  return (
    <div className={`screen result result--${cfg.cls}`}>
      <div className="grid-bg" />
      <div className="result__content" style={{ ['--accent' as string]: player.accent }}>
        <div className="result__sub neon-text">{cfg.sub}</div>
        <h1 className="result__title">{cfg.title}</h1>
        {outcome === 'champion' && (
          <div className="result__crown">★ 모든 아바타를 격파했다 ★</div>
        )}
        <PortraitSvg char={player} className="result__portrait" />
        <div className="result__name neon-text">{player.name}</div>
        <div className="result__buttons">
          {outcome === 'win' && (
            <button className="btn" onClick={onNext}>
              다음 상대 ▶
            </button>
          )}
          {outcome === 'loss' && (
            <button className="btn" onClick={onRetry}>
              다시 도전
            </button>
          )}
          <button className="btn btn--ghost" onClick={onMenu}>
            메인 메뉴
          </button>
        </div>
      </div>
      <div className="scanlines" />
    </div>
  )
}
