// 로그라이크 시작 — 영웅과 난이도만 고른다. 시작 덱은 **기본 카드 9장**(공용 6 + 직업 기본기 3,
// 2026-08-04)이고 강한 직업 카드는 런 중 보상으로 번다(2026-07-31). 예전엔 직업 카드 1장을
// 골라 시작했는데, 런에선 큰 카드가 항상 유리해서 "시그니처로 시작"이 정답이 되고 나머지는
// 함정이었으며, 그 시작이 1~6층을 무료로 만들었다. 상세는 docs/ROGUELIKE.md ⑪.
import { useMemo, useState } from 'react'
import { sheetFor } from '../../art/sprites'
import { ROSTER } from '../../data/roster'
import { getRelic, signatureRelicId } from '../../game/relics'
import {
  computeMaxHp,
  DEFAULT_DIFFICULTY,
  RUN_DIFFICULTIES,
  isDifficultyUnlocked,
  type RunDifficulty,
} from '../../game/run'
import { clearedDifficulties } from '../../game/progress'
import { useCardZoom } from '../CardDetail'
import { SpriteClip } from '../SpriteClip'

/** 잠긴 단계의 안내에 쓸 "바로 앞 단계" 이름. */
const prevName = (id: RunDifficulty): string => {
  const i = RUN_DIFFICULTIES.findIndex((d) => d.id === id)
  return i > 0 ? RUN_DIFFICULTIES[i - 1].name : ''
}

/** 직업 표기. 영문 이름 옆에 붙는다. */
const CLASS_LABEL: Record<string, string> = { warrior: '전사', archer: '궁수', mage: '마법사' }

/** 시작 체력 — 시그니처 유물의 최대 체력까지 반영한 실제 값(`startRun`과 같다). */
const startHp = (charId: string) => computeMaxHp(charId, [signatureRelicId(charId)])

export function RunStartScreen({
  onStart,
  onBack,
}: {
  onStart: (charId: string, difficulty: RunDifficulty) => void
  onBack: () => void
}) {
  const [charId, setCharId] = useState<string>(ROSTER[0].id)
  const char = ROSTER.find((c) => c.id === charId) ?? ROSTER[0]
  /**
   * 해금 상태는 화면이 뜰 때 한 번만 읽는다 — 런 도중에 바뀌지 않고, 클리어 직후엔
   * 이 화면이 새로 마운트되므로(결과 → 새 런) 자동으로 갱신된다.
   */
  const cleared = useMemo(() => clearedDifficulties(), [])
  /** 열린 것 중 **가장 높은 단계**를 기본값으로 — 고급을 깬 사람에게 초급을 다시 들이밀지 않는다. */
  const [difficulty, setDifficulty] = useState<RunDifficulty>(() => {
    const open = RUN_DIFFICULTIES.filter((d) => isDifficultyUnlocked(d.id, cleared))
    return open.length ? open[open.length - 1].id : DEFAULT_DIFFICULTY
  })
  // 시그니처 칸을 꾹 누르면 그 카드의 상세가 열린다.
  const zoom = useCardZoom(char.accent)
  const hpTop = Math.max(...ROSTER.map((c) => startHp(c.id)))
  const diff = RUN_DIFFICULTIES.find((d) => d.id === difficulty)

  return (
    <div className="screen runstart">
      <div className="grid-bg" />
      <header className="runstart__head">
        <div>
          <p className="runstart__kicker">CHOOSE YOUR HERO</p>
          <h1>영웅 선택</h1>
        </div>
        <button className="btn btn--ghost" onClick={onBack}>
          ← 돌아가기
        </button>
      </header>

      <div className="runstart__chars">
        {ROSTER.map((c) => {
          const sheet = sheetFor(c.id)
          const relic = getRelic(signatureRelicId(c.id))
          const sig = c.cards.find((k) => k.signature)
          const hp = startHp(c.id)
          const on = c.id === charId
          return (
            <button
              key={c.id}
              className={`herocard herocard--${c.id} ${on ? 'is-active' : ''}`}
              style={{ ['--accent' as string]: c.accent, ['--accent2' as string]: c.accent2 }}
              aria-pressed={on}
              onClick={() => {
                if (zoom.consumedClick()) return
                setCharId(c.id)
              }}
            >
              <div className="herocard__art">
                <i className="herocard__shadow" />
                {sheet && (
                  <div
                    className="herocard__sprite"
                    style={{ marginLeft: -sheet.anchorX * sheet.scale }}
                  >
                    <SpriteClip sheet={sheet} clip="idle" />
                  </div>
                )}
                {on && <span className="herocard__sel">SELECTED</span>}
              </div>
              <div className="herocard__body">
                <div className="herocard__name">
                  <h2>{c.name}</h2>
                  <span>{CLASS_LABEL[c.id]}</span>
                </div>
                <p className="herocard__title">{c.title}</p>
                <div className="herocard__hp">
                  <span>HP</span>
                  <div className="bar">
                    <i style={{ width: `${(hp / hpTop) * 100}%` }} />
                  </div>
                  <b>{hp}</b>
                </div>
                {relic && (
                  <p className="herocard__passive">
                    <b>{relic.name}</b> — {relic.desc.replace(`${relic.name}: `, '')}
                  </p>
                )}
                {sig && (
                  <div className="herocard__sig" {...zoom.bind(sig)}>
                    <span>시그니처 · {sig.name}</span>
                    <em>
                      DM{sig.damage} EN{sig.energyCost}
                    </em>
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* 난이도 — 축은 하나다: 봇이 내 다음 수를 얼마나 읽는가(run.ts의 RUN_DIFFICULTIES).
          ⚠ 잠긴 단계에 `disabled`를 걸지 않는다 — 눌러도 안 열리는 대신 **왜 잠겼는지**를
          읽을 수 있어야 한다(카드 UI와 같은 이유). 선택은 아래 onClick이 막는다. */}
      <div className="runstart__foot">
        <div className="runstart__diffs" role="radiogroup" aria-label="난이도">
          {RUN_DIFFICULTIES.map((d) => {
            const open = isDifficultyUnlocked(d.id, cleared)
            return (
              <button
                key={d.id}
                className={`diffseg ${d.id === difficulty ? 'is-active' : ''} ${open ? '' : 'is-locked'}`}
                role="radio"
                aria-checked={d.id === difficulty}
                aria-disabled={!open}
                title={open ? d.desc : `${prevName(d.id)}을 클리어하면 열립니다.`}
                onClick={() => open && setDifficulty(d.id)}
              >
                {open ? '' : '🔒 '}
                {d.name}
              </button>
            )
          })}
        </div>
        <span className="runstart__note">{diff?.desc}</span>
        <button className="btn runstart__go" onClick={() => onStart(charId, difficulty)}>
          {char.name}으로 출발 ▶
        </button>
      </div>
      {zoom.sheet}
    </div>
  )
}
