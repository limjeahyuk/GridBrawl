// 런 종료 — 클리어(보스 격파) 또는 사망.
import { getChar } from '../../data/roster'
import type { RunState } from '../../game/run'
import { RelicChip } from '../RunBar'

export function RunEndScreen({
  run,
  won,
  onMenu,
  onRetry,
}: {
  run: RunState
  won: boolean
  onMenu: () => void
  onRetry: () => void
}) {
  const char = getChar(run.charId)
  return (
    <div className="screen runend">
      <div className="grid-bg" />
      <div className="runend__content" style={{ ['--accent' as string]: char.accent }}>
        <div className={`runend__banner ${won ? 'runend__banner--win' : 'runend__banner--loss'}`}>
          {won ? '런 클리어!' : '쓰러졌다'}
        </div>
        <div className="runend__stat">
          {char.name} · {run.floor}층까지 · 유물 {run.relicIds.length}개 · 🪙 {run.gold}
        </div>
        <div className="runend__relics">
          {run.relicIds.map((id) => (
            <RelicChip key={id} id={id} />
          ))}
        </div>
        <div className="runend__buttons">
          <button className="btn" onClick={onRetry}>
            새 런 시작
          </button>
          <button className="btn btn--ghost" onClick={onMenu}>
            메뉴로
          </button>
        </div>
      </div>
      <div className="scanlines" />
    </div>
  )
}
