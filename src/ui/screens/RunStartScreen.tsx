// 로그라이크 시작 — **두 단계**다(디자인 `Select` → `Difficulty`): 영웅을 고르고,
// 다음 화면에서 난이도를 고른다. 한 화면에 둘을 겹쳐 두면 난이도가 바닥의 작은
// 칩 줄로 밀려서, 런의 성격을 통째로 바꾸는 선택이 곁다리처럼 읽힌다.
//
// 시작 덱은 **기본 카드 9장**(공용 6 + 직업 기본기 3, 2026-08-04)이고 강한 직업 카드는
// 런 중 보상으로 번다(2026-07-31). 예전엔 직업 카드 1장을 골라 시작했는데, 런에선 큰
// 카드가 항상 유리해서 "시그니처로 시작"이 정답이 되고 나머지는 함정이었으며, 그 시작이
// 1~6층을 무료로 만들었다. 상세는 docs/ROGUELIKE.md ⑪.
import { useMemo, useState } from 'react'
import { sheetFor } from '../../art/sprites'
import { ROSTER } from '../../data/roster'
import { classPassive } from '../../game/relics'
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

/** 단계마다 색과 번호 — 디자인 `Difficulty`의 네 줄(로마 숫자 + 단계색). */
const TIER_UI: Record<RunDifficulty, { no: string; color: string }> = {
  novice: { no: 'I', color: '#b6ea6a' },
  adept: { no: 'II', color: '#6ab8ff' },
  expert: { no: 'III', color: '#ffa24a' },
  master: { no: 'IV', color: '#ff4a3a' },
}

/**
 * 탭에 보일 얼굴 자리 — 배경 그림(1280×720) 위 좌표. 탭은 그 그림을 `FACE_ZOOM`배로
 * 키워 이 점이 탭 가운데(위에서 46px)에 오게 자른다. 그림을 갈면 여기를 다시 맞춘다.
 */
const HERO_FACE: Record<string, [number, number]> = { warrior: [240, 140], archer: [215, 212], mage: [262, 186] }
const FACE_ZOOM = 1.2

/** 시작 체력 — 시그니처 유물의 최대 체력까지 반영한 실제 값(`startRun`과 같다). */
const startHp = (charId: string) => computeMaxHp(charId, [])

export function RunStartScreen({
  onStart,
  onBack,
}: {
  onStart: (charId: string, difficulty: RunDifficulty) => void
  onBack: () => void
}) {
  const [step, setStep] = useState<'hero' | 'difficulty'>('hero')
  const [charId, setCharId] = useState<string>(ROSTER[0].id)
  /** 배경을 갈아 끼울 때 새 그림이 페이드인하는 동안 밑에 깔아 둘 직전 영웅. */
  const [prevId, setPrevId] = useState<string>(ROSTER[0].id)
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
  const sheet = sheetFor(char.id)

  // ---- 2단계: 난이도 -------------------------------------------------------
  if (step === 'difficulty') {
    const clearedNames = RUN_DIFFICULTIES.filter((d) => cleared.has(d.id)).map((d) => d.name)
    return (
      <div className="screen runstart runstart--diff">
        <div className="grid-bg" />
        <nav className="runsteps" aria-label="출발 준비 단계">
          <button className="runsteps__done" onClick={() => setStep('hero')}>
            <span>✓</span>영웅
          </button>
          <i />
          <span className="runsteps__now">
            <span>2</span>난이도
          </span>
          <i />
          <span className="runsteps__next">
            <span>3</span>출발
          </span>
        </nav>

        <aside
          className="heroside"
          style={{ ['--accent' as string]: char.accent, ['--accent2' as string]: char.accent2 }}
        >
          <div className={`heroside__art herocard--${char.id}`}>
            <i className="herocard__shadow" />
            {sheet && (
              <div
                className="herocard__sprite"
                style={{ marginLeft: -sheet.anchorX * sheet.scale }}
              >
                <SpriteClip sheet={sheet} clip="idle" />
              </div>
            )}
          </div>
          <div className="heroside__body">
            <div className="heroside__name">
              <h2>{char.name}</h2>
              <button className="heroside__swap" onClick={() => setStep('hero')}>
                영웅 바꾸기
              </button>
            </div>
            <span className="heroside__meta">
              {CLASS_LABEL[char.id]} · {char.title} · HP {startHp(char.id)}
            </span>
            <div className="heroside__record">
              <span>지금까지 깬 난이도</span>
              <b>{clearedNames.length ? clearedNames.join(' · ') : '아직 없다'}</b>
            </div>
          </div>
        </aside>

        {/* 난이도 — 축은 하나다: 봇이 내 다음 수를 얼마나 읽는가(run.ts의 RUN_DIFFICULTIES).
            ⚠ 잠긴 단계에 `disabled`를 걸지 않는다 — 눌러도 안 열리는 대신 **왜 잠겼는지**를
            읽을 수 있어야 한다(카드 UI와 같은 이유). 선택은 아래 onClick이 막는다. */}
        <main className="tierlist">
          <div className="tierlist__head">
            <h1>난이도</h1>
            <span>달라지는 건 하나 — 적이 내 카드를 얼마나 읽는가</span>
          </div>
          {RUN_DIFFICULTIES.map((d) => {
            const open = isDifficultyUnlocked(d.id, cleared)
            const ui = TIER_UI[d.id]
            return (
              <button
                key={d.id}
                className={`tier ${d.id === difficulty ? 'tier--on' : ''} ${open ? '' : 'tier--locked'}`}
                style={{ ['--tier' as string]: ui.color }}
                role="radio"
                aria-checked={d.id === difficulty}
                aria-disabled={!open}
                onClick={() => open && setDifficulty(d.id)}
              >
                <span className="tier__no">{open ? ui.no : '🔒'}</span>
                <span className="tier__text">
                  <span className="tier__name">
                    <b>{d.name}</b>
                    {cleared.has(d.id) && <em>클리어함</em>}
                  </span>
                  <span className="tier__desc">
                    {open ? d.desc : `${prevName(d.id)}을 클리어하면 열립니다.`}
                  </span>
                </span>
                <span className="tier__read">
                  <span>적이 읽는 내 카드</span>
                  <span className="tier__slots">
                    {[0, 1, 2].map((i) => (
                      <i key={i} className={i < d.readSlots ? 'is-read' : ''}>
                        {i < d.readSlots ? '●' : i + 1}
                      </i>
                    ))}
                  </span>
                  <em>{d.reacts ? '제일 아픈 한 장에 대응' : ''}</em>
                </span>
              </button>
            )
          })}
          <div className="tierlist__foot">
            <span>체력·지도·보상은 단계가 달라도 똑같다</span>
            <button className="btn runstart__go" onClick={() => onStart(charId, difficulty)}>
              {char.name}으로 출발 ▶
            </button>
          </div>
        </main>
      </div>
    )
  }

  // ---- 1단계: 영웅 ---------------------------------------------------------
  // 디자인 `Select`(2026-11-09): 고른 영웅의 일러스트가 **화면 배경**이 된다(`public/redesign/heroes/
  // bg-*.png` — 원본은 왼쪽에 그대로, 오른쪽은 이어 그리고 흐리게. 만드는 스크립트
  // `docs/redesign/tools/hero-bg/build.py`). 위쪽 탭은 같은 그림에서 얼굴만 잘라 보여 준다.
  const pick = (id: string) => {
    if (id === charId) return
    setPrevId(charId)
    setCharId(id)
  }
  const passive = classPassive(char.id) // 직업 패시브(유물 아님)
  const sig = char.cards.find((k) => k.signature)
  const hp = startHp(char.id)
  return (
    <div
      className="screen runstart"
      style={{ ['--accent' as string]: char.accent, ['--accent2' as string]: char.accent2 }}
    >
      <div className={`artbg artbg--fill artbg--${char.id}`} aria-hidden="true" />
      <div className={`artbg artbg--${prevId}`} aria-hidden="true" />
      <div
        key={char.id}
        className={`artbg artbg--${char.id} artbg--in`}
        role="img"
        aria-label={`${char.name} — ${CLASS_LABEL[char.id]}`}
      />
      <i className="artbg__veil" aria-hidden="true" />

      <header className="runstart__head">
        <div>
          <p className="runstart__kicker">CHOOSE YOUR HERO</p>
          <h1>영웅 선택</h1>
        </div>
        <button className="btn btn--ghost" onClick={onBack}>
          ← 돌아가기
        </button>
      </header>

      <nav className="herotabs" aria-label="영웅 고르기">
        {ROSTER.map((c) => {
          const on = c.id === charId
          const [fx, fy] = HERO_FACE[c.id] ?? [0, 0]
          return (
            <button
              key={c.id}
              className={`herotab ${on ? 'is-active' : ''}`}
              style={{ ['--accent' as string]: c.accent }}
              aria-pressed={on}
              aria-label={`${c.name} 고르기`}
              onClick={() => pick(c.id)}
            >
              <i
                className={`herotab__face artbg--${c.id}`}
                style={{ left: `calc(50% - ${Math.round(fx * FACE_ZOOM)}px)`, top: 46 - Math.round(fy * FACE_ZOOM) }}
              />
              <span className="herotab__name">
                <b>{c.name}</b>
                <span>{CLASS_LABEL[c.id]}</span>
              </span>
              {on && <span className="herotab__sel">SELECTED</span>}
            </button>
          )
        })}
      </nav>

      <section key={char.id} className="heropanel">
        <div className="heropanel__body">
          <div className="heropanel__name">
            <h2>{char.name}</h2>
            <span>{CLASS_LABEL[char.id]}</span>
          </div>
          <p className="herocard__title">{char.title}</p>
          <div className="herocard__hp">
            <span>HP</span>
            <div className="bar">
              {/* 시작은 늘 만피다 — 직업끼리 견준 길이로 그리면 궁수·마법사가 다친 것처럼 보였다(2026-11-10). */}
              <i style={{ width: '100%' }} />
            </div>
            <b>{hp}</b>
          </div>
          {passive && (
            <p className="heropanel__passive">
              <b>{passive.name}</b> — {passive.desc.replace(`${passive.name}: `, '')}
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
        <div className="heropanel__stagewrap">
          <div className={`heropanel__stage herocard--${char.id}`}>
            <i className="herocard__shadow" />
            {sheet && (
              <div className="herocard__sprite" style={{ marginLeft: -sheet.anchorX * sheet.scale }}>
                <SpriteClip sheet={sheet} clip="idle" />
              </div>
            )}
          </div>
          <span>전투에서의 모습</span>
        </div>
      </section>

      <div className="runstart__foot">
        <span className="runstart__note">다음 단계에서 난이도를 고른다</span>
        <button className="btn runstart__go" onClick={() => setStep('difficulty')}>
          {char.name} 선택 · 다음 ▶
        </button>
      </div>
      {zoom.sheet}
    </div>
  )
}
