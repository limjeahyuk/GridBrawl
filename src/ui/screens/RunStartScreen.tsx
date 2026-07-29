// 로그라이크 시작 — 캐릭터 + 시작 직업 카드 1장 선택.
import { useMemo, useState } from 'react'
import { ROSTER, getChar } from '../../data/roster'
import { buildFighterSvg } from '../../art/art'
import { getRelic, signatureRelicId } from '../../game/relics'
import { CardFace, cardAccent } from '../CardFace'

export function RunStartScreen({
  onStart,
  onBack,
}: {
  onStart: (charId: string, classCardId: string) => void
  onBack: () => void
}) {
  const [charId, setCharId] = useState<string>(ROSTER[0].id)
  const [cardId, setCardId] = useState<string | null>(null)
  const char = getChar(charId)
  const svgs = useMemo(() => Object.fromEntries(ROSTER.map((c) => [c.id, buildFighterSvg(c)])), [])
  const sigRelic = getRelic(signatureRelicId(charId))

  const pickChar = (id: string) => {
    setCharId(id)
    setCardId(null) // 캐릭터가 바뀌면 직업 카드 선택 초기화
  }

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
            onClick={() => pickChar(c.id)}
          >
            <div className="avatar-card__art" dangerouslySetInnerHTML={{ __html: svgs[c.id] }} />
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
        <div className="runstart__cards-label">시작 직업 카드 1장을 고르세요</div>
        <div className="runstart__cards">
          {char.cards.map((c) => (
            <button
              key={c.id}
              className={`runstart__card ${c.id === cardId ? 'is-active' : ''}`}
              style={{ ['--accent' as string]: cardAccent(c, char.accent) }}
              onClick={() => setCardId(c.id)}
            >
              <CardFace card={c} accent={cardAccent(c, char.accent)} />
            </button>
          ))}
        </div>
      </div>

      <div className="runstart__foot">
        <button
          className={`btn ${cardId ? '' : 'is-disabled'}`}
          disabled={!cardId}
          onClick={() => cardId && onStart(charId, cardId)}
        >
          그리드로 출발 ▶
        </button>
      </div>
      <div className="scanlines" />
    </div>
  )
}
