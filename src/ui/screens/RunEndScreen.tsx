// 런 종료 — 클리어(보스 격파) 또는 사망. 디자인 `Result`의 "런 클리어 / 런 실패"
// 두 판: 왼쪽에 도장 글씨와 영웅, 오른쪽에 이번 런의 기록이 선다.
import { sheetFor } from '../../art/sprites'
import { getChar } from '../../data/roster'
import { deckCap, difficultyDef, regionOf, type RunDifficulty, type RunState } from '../../game/run'
import { RelicIcon } from '../RelicIcon'
import { SceneLayers } from '../SceneLayers'
import { SpriteClip } from '../SpriteClip'

/** 네 칸짜리 수치 타일 — 디자인 `Result`의 `.stat`. */
function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="statbox">
      <span>{label}</span>
      <b style={tone ? { color: tone } : undefined}>{value}</b>
    </div>
  )
}

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
  const sheet = sheetFor(char.id)

  return (
    <div className={`screen runend runend--${won ? 'win' : 'loss'}`}>
      <SceneLayers scene={won ? 'grassland' : 'dungeon'} />
      <div className={`screenveil ${won ? '' : 'screenveil--gray'}`} />

      <section className="runend__left">
        <span className="runend__kicker">{won ? 'RUN CLEAR' : 'RUN OVER'}</span>
        <h1 className={`runend__banner runend__banner--${won ? 'win' : 'loss'}`}>
          {won ? '던전 정복' : '쓰러졌다'}
        </h1>
        {sheet && (
          <div className="runend__sprite" style={{ marginLeft: -sheet.anchorX * sheet.scale }}>
            <SpriteClip sheet={sheet} clip={won ? 'idle' : 'death'} />
          </div>
        )}
        <span className="runend__where">
          {regionOf(run.floor) === 'grassland' ? '초원' : '던전'} {run.floor}층 · {diff.name}
        </span>
        {/* 해금은 **새로 열렸을 때만** 띄운다 — 같은 난이도를 다시 깰 때마다 축하가
            반복되면 그 자체로 의미가 없어진다(markCleared가 null을 준다). */}
        {unlocked && (
          <div className="runend__unlock">
            <span className="runend__unlock-no">🔓</span>
            <span>
              <b>새 난이도 열림 — {difficultyDef(unlocked).name}</b>
              <em>{difficultyDef(unlocked).desc.replace(/\*\*/g, '')}</em>
            </span>
          </div>
        )}
      </section>

      <section className="runend__panel">
        <span className="runend__meta">
          {diff.name} · {char.name} · {run.floor}층까지
        </span>
        <div className="runend__stats">
          <Stat label={won ? '정복' : '도달'} value={`${run.floor}F`} />
          <Stat label="유물" value={String(run.relicIds.length)} tone="#ffd86a" />
          <Stat label="골드" value={String(run.gold)} tone="#ffd86a" />
          <Stat label="덱" value={`${run.deck.length}/${deckCap(run)}장`} />
        </div>
        <span className="runend__label">함께한 유물</span>
        <div className="runend__relics">
          {run.relicIds.length ? (
            run.relicIds.map((id) => <RelicIcon key={id} id={id} size={32} />)
          ) : (
            <em className="runend__none">하나도 얻지 못했다</em>
          )}
        </div>
        <div className="runend__buttons">
          <button className="btn btn--ghost" onClick={onMenu}>
            타이틀로
          </button>
          <button className="btn" onClick={onRetry}>
            {won ? '다시 도전 ▶' : '새 런 시작 ▶'}
          </button>
        </div>
      </section>
    </div>
  )
}
