// 로그라이크 시작 — 캐릭터만 고른다. 시작 덱은 **기본 카드 9장**(공용 6 + 직업 기본기 3,
// 2026-08-04)이고 강한 직업 카드는
// 런 중 보상으로 번다(2026-07-31). 예전엔 직업 카드 1장을 골라 시작했는데, 런에선 큰
// 카드가 항상 유리해서 "시그니처로 시작"이 정답이 되고 나머지는 함정이었으며, 그 시작이
// 1~6층을 무료로 만들었다. 상세는 docs/ROGUELIKE.md ⑪.
import { useMemo, useState } from 'react'
import { PortraitSvg } from '../PortraitSvg'
import { COMMON_CARDS } from '../../battle/cards'
import { ROSTER, getChar } from '../../data/roster'
import { getRelic, signatureRelicId } from '../../game/relics'
import {
  DEFAULT_DIFFICULTY,
  RUN_DIFFICULTIES,
  isDifficultyUnlocked,
  startingDeck,
  type RunDifficulty,
} from '../../game/run'
import { clearedDifficulties } from '../../game/progress'
import { CardFace, cardAccent } from '../CardFace'
import { useCardZoom } from '../CardDetail'
import type { CardDef } from '../../battle/types'

/** 잠긴 단계의 안내에 쓸 "바로 앞 단계" 이름. */
const prevName = (id: RunDifficulty): string => {
  const i = RUN_DIFFICULTIES.findIndex((d) => d.id === id)
  return i > 0 ? RUN_DIFFICULTIES[i - 1].name : ''
}

export function RunStartScreen({
  onStart,
  onBack,
}: {
  onStart: (charId: string, difficulty: RunDifficulty) => void
  onBack: () => void
}) {
  const [charId, setCharId] = useState<string>(ROSTER[0].id)
  const char = getChar(charId)
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
  // 꾹 누르면 카드 상세(설명·능력의 뜻)가 열린다 — 압축 카드에는 설명이 없다.
  const zoom = useCardZoom(char.accent)
  const sigRelic = getRelic(signatureRelicId(charId))
  /**
   * 시작 덱 미리보기. 공용 카드 + 그 직업의 기본기 3장이라 캐릭터를 바꾸면 같이 바뀐다.
   *
   * ⚠ **이동 카드는 보여주지 않는다**(2026-08-05 사용자 요청). 이동은 판의 칸을
   * 눌러서 하므로 손에 드는 카드가 아니고, 세 직업이 똑같이 갖는 것이라 **직업을
   * 고르는 데 아무 정보도 주지 않는다**. 화살표 카드 넷이 자리의 절반을 먹어서
   * 정작 갈리는 부분(직업 기본 공격 3장)이 눌려 있었다.
   * 덱 자체(`startingDeck`)는 그대로다 — 표시만 거른다.
   */
  const startCards = useMemo(() => {
    const all = [...COMMON_CARDS, ...char.basics]
    return startingDeck(charId)
      .map((id) => all.find((c) => c.id === id))
      .filter((c): c is CardDef => !!c && c.kind !== 'move')
  }, [charId, char])

  return (
    <div className="screen runstart">
      <div className="grid-bg" />
      <div className="runstart__head">
        <button className="btn btn--ghost" onClick={onBack}>
          ◀ 뒤로
        </button>
        <h2>로그라이크 · 출발 준비</h2>
        <span />
      </div>

      <div className="runstart__chars">
        {ROSTER.map((c) => (
          <button
            key={c.id}
            className={`avatar-card ${c.id === charId ? 'is-active' : ''}`}
            style={{ ['--accent' as string]: c.accent }}
            onClick={() => setCharId(c.id)}
          >
            <PortraitSvg char={c} className="avatar-card__art" />
            <div className="avatar-card__name">{c.name}</div>
          </button>
        ))}
      </div>

      {/* 난이도 — 축은 하나다: 봇이 내 다음 수를 얼마나 읽는가(run.ts의 RUN_DIFFICULTIES).
          ⚠ 잠긴 단계에 `disabled`를 걸지 않는다 — 눌러도 안 열리는 대신 **왜 잠겼는지**를
          읽을 수 있어야 한다(카드 UI와 같은 이유). 선택은 아래 onClick이 막는다. */}
      <div className="runstart__diffs" role="radiogroup" aria-label="난이도">
        {RUN_DIFFICULTIES.map((d) => {
          const open = isDifficultyUnlocked(d.id, cleared)
          const active = d.id === difficulty
          return (
            <button
              key={d.id}
              className={`diffcard ${active ? 'is-active' : ''} ${open ? '' : 'is-locked'}`}
              role="radio"
              aria-checked={active}
              aria-disabled={!open}
              onClick={() => open && setDifficulty(d.id)}
            >
              <div className="diffcard__name">
                {open ? '' : '🔒 '}
                {d.name}
              </div>
              <div className="diffcard__desc">
                {/* 네 이름 모두 받침으로 끝나므로(…급) 조사는 늘 '을'이다 — 을(를) 표기 불필요. */}
                {open ? d.desc : `${prevName(d.id)}을 클리어하면 열립니다.`}
              </div>
            </button>
          )
        })}
      </div>

      <div className="runstart__pick">
        <div className="runstart__sig">
          <div className="runstart__sig-label">시그니처 유물</div>
          {sigRelic && (
            <div className="runstart__sig-relic">
              <span className="relicchip__icon">{sigRelic.icon}</span>
              <b>{sigRelic.name}</b> — {sigRelic.desc}
            </div>
          )}
        </div>
        <div className="runstart__cards-label">
          {/* ⚠ 장수는 **덱 전체**(9장)를 말한다 — 아래 그림은 이동 4장을 뺀 것이라
              `startCards.length`를 쓰면 "5장"이 되어 실제 덱과 어긋난다. */}
          시작 덱 — 기본 카드 {startingDeck(charId).length}장(공용 이동 4·지원 2 +{' '}
          <b>{char.name}</b>의 기본 공격 3장). 강한 직업 카드·유물은 전투 보상·상점·이벤트로 번다.
        </div>
        <div className="runstart__cards">
          {startCards.map((c) => (
            <div
              key={c.id}
              className="runstart__card"
              style={{ ['--accent' as string]: cardAccent(c, char.accent) }}
              {...zoom.bind(c)}
            >
              <CardFace card={c} accent={cardAccent(c, char.accent)} compact />
            </div>
          ))}
        </div>
      </div>

      <div className="runstart__foot">
        <button className="btn" onClick={() => onStart(charId, difficulty)}>
          그리드로 출발 ▶
        </button>
      </div>
      {zoom.sheet}
    </div>
  )
}
