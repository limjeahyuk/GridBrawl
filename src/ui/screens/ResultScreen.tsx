import { getChar } from '../../data/roster'
import { PortraitSvg } from '../PortraitSvg'

// ⚠ 'champion'(전원 격파)은 **건틀릿 모드 전용이었고, 그 모드는 2026-08-04에 코드째
// 지웠다**(game/tournament.ts·BracketScreen·CharacterSelect). 아무도 설정하지 않는
// 값이 남아 있어 2026-08-05에 걷어냈다 — 'GRID 챔피언 / 코어를 장악했다'라는 사이버
// 시절 문구를 통째로 이고 있던 자리다. 되살리려면 git 기록에서 셋과 함께 꺼낸다.
export type Outcome = 'win' | 'loss'

export function ResultScreen({
  outcome,
  playerCharId,
  onRetry,
  onMenu,
  variant = 'single',
}: {
  outcome: Outcome
  playerCharId: string
  onRetry: () => void
  onMenu: () => void
  /** 'single'(봇 단판) 다시 대전, 'versus'(온라인) 메뉴만. */
  variant?: 'single' | 'versus'
}) {
  const player = getChar(playerCharId)
  const cfg = {
    win: { title: '승리', sub: 'K.O.', cls: 'win' },
    loss: { title: '패배', sub: '쓰러졌다', cls: 'loss' },
  }[outcome]

  return (
    <div className={`screen result result--${cfg.cls}`}>
      <div className="grid-bg grid-bg--hall" />
      <div className="result__content" style={{ ['--accent' as string]: player.accent }}>
        <div className="result__sub neon-text">{cfg.sub}</div>
        <h1 className="result__title">{cfg.title}</h1>
        <PortraitSvg char={player} className="result__portrait" />
        <div className="result__name neon-text">{player.name}</div>
        <div className="result__buttons">
          {variant === 'single' && (
            <button className="btn" onClick={onRetry}>
              다시 대전 ▶
            </button>
          )}
          <button className="btn btn--ghost" onClick={onMenu}>
            메인 메뉴
          </button>
        </div>
      </div>
    </div>
  )
}
