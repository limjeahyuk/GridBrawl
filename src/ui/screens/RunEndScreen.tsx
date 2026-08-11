// 런 종료 — 클리어(보스 격파) 또는 사망.
import { getChar } from '../../data/roster'
import { difficultyDef, type RunDifficulty, type RunState } from '../../game/run'
import { RelicChip } from '../RunBar'

export function RunEndScreen({
  run,
  won,
  unlocked,
  onMenu,
  onRetry,
}: {
  run: RunState
  won: boolean
  /** 이 클리어로 **새로 열린** 난이도(없으면 null). App이 `markCleared`에서 받아 넘긴다. */
  unlocked?: RunDifficulty | null
  onMenu: () => void
  onRetry: () => void
}) {
  const char = getChar(run.charId)
  const diff = difficultyDef(run.difficulty)
  return (
    <div className="screen runend">
      <div className="grid-bg grid-bg--hall" />
      <div className="runend__content" style={{ ['--accent' as string]: char.accent }}>
        <div className={`runend__banner ${won ? 'runend__banner--win' : 'runend__banner--loss'}`}>
          {won ? '런 클리어!' : '쓰러졌다'}
        </div>
        <div className="runend__stat">
          {diff.name} · {char.name} · {run.floor}층까지 · 유물 {run.relicIds.length}개 · 🪙{' '}
          {run.gold}
        </div>
        {/* 해금은 **새로 열렸을 때만** 띄운다 — 같은 난이도를 다시 깰 때마다 축하가
            반복되면 그 자체로 의미가 없어진다(markCleared가 null을 준다). */}
        {unlocked && (
          <div className="runend__unlock">
            🔓 <b>{difficultyDef(unlocked).name}</b> 난이도가 열렸다 —{' '}
            {difficultyDef(unlocked).desc.replace(/\*\*/g, '')}
          </div>
        )}
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
    </div>
  )
}
