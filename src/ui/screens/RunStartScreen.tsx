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
import { startingDeck } from '../../game/run'
import { CardFace, cardAccent } from '../CardFace'

export function RunStartScreen({
  onStart,
  onBack,
}: {
  onStart: (charId: string) => void
  onBack: () => void
}) {
  const [charId, setCharId] = useState<string>(ROSTER[0].id)
  const char = getChar(charId)
  const sigRelic = getRelic(signatureRelicId(charId))
  // 시작 덱은 공용 카드 + 그 직업의 기본기 3장이라 캐릭터를 바꾸면 같이 바뀐다.
  const startCards = useMemo(() => {
    const all = [...COMMON_CARDS, ...char.basics]
    return startingDeck(charId).map((id) => all.find((c) => c.id === id)).filter((c) => !!c)
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
          시작 덱 — 기본 카드 {startCards.length}장(공용 이동·지원 + <b>{char.name}</b>의 기본 공격
          3장). 강한 직업 카드·유물은 전투 보상·상점·이벤트로 번다.
        </div>
        <div className="runstart__cards">
          {startCards.map((c) => (
            <div
              key={c.id}
              className="runstart__card"
              style={{ ['--accent' as string]: cardAccent(c, char.accent) }}
            >
              <CardFace card={c} accent={cardAccent(c, char.accent)} compact />
            </div>
          ))}
        </div>
      </div>

      <div className="runstart__foot">
        <button className="btn" onClick={() => onStart(charId)}>
          그리드로 출발 ▶
        </button>
      </div>
    </div>
  )
}
