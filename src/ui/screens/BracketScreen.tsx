import { getChar } from '../../data/roster'
import type { Gauntlet } from '../../game/tournament'
import { PortraitSvg } from '../PortraitSvg'

const DIFF_LABEL: Record<string, string> = { easy: '하급', normal: '중급', hard: '상급' }

export function BracketScreen({
  gauntlet,
  onFight,
  onMenu,
}: {
  gauntlet: Gauntlet
  onFight: () => void
  onMenu: () => void
}) {
  const player = getChar(gauntlet.playerCharId)
  const current = gauntlet.opponents[gauntlet.index]
  const currentChar = getChar(current.charId)

  return (
    <div className="screen bracket">
      <div className="grid-bg" />
      <div className="bracket__header">
        <button className="btn btn--ghost" onClick={onMenu}>
          ◀ 메뉴
        </button>
        <h2 className="neon-text">GRID 사다리</h2>
        <div className="bracket__progress">
          {gauntlet.wins} / {gauntlet.opponents.length} 승
        </div>
      </div>

      <div className="bracket__body">
        <div className="bracket__player" style={{ ['--accent' as string]: player.accent }}>
          <div className="bracket__youtag">YOU</div>
          <PortraitSvg char={player} className="bracket__playerart" />
          <div className="bracket__playername neon-text">{player.name}</div>
        </div>

        <div className="bracket__ladder">
          {gauntlet.opponents.map((o, i) => {
            const c = getChar(o.charId)
            const state =
              i < gauntlet.index ? 'done' : i === gauntlet.index ? 'current' : 'upcoming'
            return (
              <div
                key={i}
                className={`rung rung--${state}`}
                style={{ ['--accent' as string]: c.accent }}
              >
                <span className="rung__no">{String(i + 1).padStart(2, '0')}</span>
                <PortraitSvg char={c} className="rung__art" />
                <span className="rung__name">{c.name}</span>
                <span className="rung__diff">{DIFF_LABEL[o.difficulty]}</span>
                <span className="rung__status">
                  {state === 'done' ? '✓ 격파' : state === 'current' ? '▶ 다음 상대' : '대기'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="bracket__footer">
        <div className="bracket__vs">
          다음 상대 — <b style={{ color: currentChar.accent }}>{currentChar.name}</b> ·{' '}
          {currentChar.title}
        </div>
        <button className="btn bracket__fight" onClick={onFight}>
          전투 시작 ▶
        </button>
      </div>
      <div className="scanlines" />
    </div>
  )
}
