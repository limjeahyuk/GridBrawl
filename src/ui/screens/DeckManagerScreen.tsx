import { useEffect, useState } from 'react'
import { getChar } from '../../data/roster'
import { PortraitSvg } from '../PortraitSvg'
import { cloudEnabled, listDecks, removeDeck } from '../../game/deckSync'
import type { Deck } from '../../game/decks'

/** 덱 매니저 — 저장된 덱 목록. 새로 만들기 / 수정 / 삭제.
 *  로그인 계정이면 클라우드에서 불러와 기기 간 공유된다. */
export function DeckManagerScreen({
  onNew,
  onEdit,
  onBack,
}: {
  onNew: () => void
  onEdit: (deck: Deck) => void
  onBack: () => void
}) {
  const [decks, setDecks] = useState<Deck[] | null>(null) // null = 불러오는 중
  const synced = cloudEnabled()

  useEffect(() => {
    let alive = true
    void listDecks().then((d) => {
      if (alive) setDecks(d)
    })
    return () => {
      alive = false
    }
  }, [])

  const remove = (id: string) => {
    setDecks((prev) => prev?.filter((d) => d.id !== id) ?? prev) // 낙관적 반영
    void removeDeck(id).catch(() => void listDecks().then(setDecks))
  }

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

      <div className="deckmgr__sync">
        {synced ? '☁ 계정에 저장 — 다른 기기에서도 같은 덱을 씁니다' : '이 기기에만 저장됩니다 (구글 로그인 시 계정 동기화)'}
      </div>

      <div className="deckmgr__list">
        {decks === null && <p className="deckmgr__empty">덱을 불러오는 중…</p>}
        {decks?.length === 0 && (
          <p className="deckmgr__empty">
            저장된 덱이 없습니다. [+ 새 덱]으로 나만의 덱을 만들어 보세요.
          </p>
        )}
        {decks?.map((d) => {
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
    </div>
  )
}
