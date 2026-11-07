import { sheetFor } from '../../art/sprites'
import { getChar } from '../../data/roster'
import { PortraitSvg } from '../PortraitSvg'
import { SceneLayers } from '../SceneLayers'
import { SpriteClip } from '../SpriteClip'

// ⚠ 'champion'(전원 격파)은 **건틀릿 모드 전용이었고, 그 모드는 2026-08-04에 코드째
// 지웠다**(game/tournament.ts·BracketScreen·CharacterSelect). 아무도 설정하지 않는
// 값이 남아 있어 2026-08-05에 걷어냈다 — 'GRID 챔피언 / 코어를 장악했다'라는 사이버
// 시절 문구를 통째로 이고 있던 자리다. 되살리려면 git 기록에서 셋과 함께 꺼낸다.
export type Outcome = 'win' | 'loss'

/**
 * 단판(봇·온라인) 결과. 디자인 `Result`의 "전투 승리" 판 — 큰 도장 글씨 + 영웅이
 * 서 있는 그림 + 버튼. ⚠ 시안의 네 수치(라운드·준 피해·받은 피해·유물 발동)는
 * 지금 엔진이 밖으로 내보내지 않아 넣지 않았다(시안 README의 "임의로 정한 것").
 */
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
  const sheet = sheetFor(player.id)
  const win = outcome === 'win'
  const cfg = {
    win: { stamp: 'VICTORY', sub: '쓰러뜨렸다', cls: 'win' },
    loss: { stamp: 'DEFEAT', sub: '쓰러졌다', cls: 'loss' },
  }[outcome]

  return (
    <div className={`screen result result--${cfg.cls}`}>
      {/* 이긴 판은 밝은 초원, 진 판은 잿빛 던전 — 디자인 `Result`의 두 배경. */}
      <SceneLayers scene={win ? 'grassland' : 'dungeon'} />
      <div className={`screenveil ${win ? '' : 'screenveil--gray'}`} />
      <div className="result__content" style={{ ['--accent' as string]: player.accent }}>
        <div className="result__stamp">{cfg.stamp}</div>
        <div className="result__sub">{cfg.sub}</div>
        {sheet ? (
          <div className="result__sprite" style={{ marginLeft: -sheet.anchorX * sheet.scale }}>
            <SpriteClip sheet={sheet} clip={win ? 'idle' : 'death'} />
          </div>
        ) : (
          <PortraitSvg char={player} className="result__portrait" />
        )}
        <div className="result__name">{player.name}</div>
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
