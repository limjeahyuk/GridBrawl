import { useState } from 'react'
import { getChar } from '../../data/roster'
import { PortraitSvg } from '../PortraitSvg'
import { loadDecks, deleteDeck, type Deck } from '../../game/decks'

/** 덱 매니저 — 저장된 덱 목록. 새로 만들기 / 수정 / 삭제. */
export function DeckManagerScreen({
  onNew,
  onEdit,
  onBack,
}: {
  onNew: () => void
  onEdit: (deck: Deck) => void
  onBack: () => void
}) {
  const [decks, setDecks] = useState<Deck[]>(() => loadDecks())

  const remove = (id: string) => setDecks(deleteDeck(id))

  return (
    <div className="screen deckmgr">
      <div className="grid-bg" />
      <div className="deckmgr__bar">
        <button className="btn btn--ghost" onClick={onBack}>
          ◀ 뒤로
        </button>
        <h2 className="neon-text">내 덱</h2>
        <button className="btn" onClick={onNew}>
          + 새 덱
        </button>
      </div>

      <div className="deckmgr__list">
        {decks.length === 0 && (
          <p className="deckmgr__empty">
            저장된 덱이 없습니다. [+ 새 덱]으로 나만의 덱을 만들어 보세요.
          </p>
        )}
        {decks.map((d) => {
          const char = getChar(d.charId)
          return (
            <div
              key={d.id}
              className="deckmgr__card"
              style={{ ['--accent' as string]: char.accent }}
            >
              <PortraitSvg char={char} className="deckmgr__portrait" />
              <div className="deckmgr__info">
                <div className="deckmgr__name">{d.name}</div>
                <div className="deckmgr__meta">
                  {char.name} · 카드 {d.cardIds.length + 7}장
                </div>
              </div>
              <div className="deckmgr__actions">
                <button className="btn btn--ghost" onClick={() => onEdit(d)}>
                  수정
                </button>
                <button className="btn btn--ghost deckmgr__del" onClick={() => remove(d.id)}>
                  삭제
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <div className="scanlines" />
    </div>
  )
}
