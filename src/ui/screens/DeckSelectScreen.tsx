import { useEffect, useState } from 'react'
import { getChar, ROSTER } from '../../data/roster'
import { PortraitSvg } from '../PortraitSvg'
import { presetDeck, type Deck } from '../../game/decks'
import { listDecks } from '../../game/deckSync'

/** 덱 선택 — 전투 전에 쓸 덱을 고른다. 저장된 덱 + 캐릭터별 기본 덱(빠른 시작). */
export function DeckSelectScreen({
  onSelect,
  onManage,
  onBack,
}: {
  onSelect: (deck: Deck) => void
  onManage: () => void
  onBack: () => void
}) {
  const [saved, setSaved] = useState<Deck[]>([])
  useEffect(() => {
    let alive = true
    void listDecks().then((d) => {
      if (alive) setSaved(d)
    })
    return () => {
      alive = false
    }
  }, [])

  const DeckButton = ({ deck }: { deck: Deck }) => {
    const char = getChar(deck.charId)
    return (
      <button
        className="deckpick"
        style={{ ['--accent' as string]: char.accent }}
        onClick={() => onSelect(deck)}
      >
        <PortraitSvg char={char} className="deckpick__portrait" />
        <div className="deckpick__name">{deck.name}</div>
        <div className="deckpick__meta">
          {char.name} · {deck.cardIds.length + 7}장
        </div>
      </button>
    )
  }

  return (
    <div className="screen deckselect">
      <div className="grid-bg" />
      <div className="deckmgr__bar">
        <button className="btn btn--ghost" onClick={onBack}>
          ◀ 뒤로
        </button>
        <h2 className="neon-text">덱 선택</h2>
        {/* 타이틀에서 내려온 **덱 관리의 유일한 입구**(2026-08-04) — 그래서 ghost가
            아니라 원래 타이틀 버튼이 쓰던 색(`btn--online`) 그대로 눈에 띄게 둔다. */}
        <button className="btn btn--online" onClick={onManage}>
          덱 만들기
        </button>
      </div>

      <div className="deckselect__body">
        {saved.length > 0 && (
          <>
            <div className="deckselect__label">내 덱</div>
            <div className="deckselect__row">
              {saved.map((d) => (
                <DeckButton key={d.id} deck={d} />
              ))}
            </div>
          </>
        )}
        <div className="deckselect__label">빠른 시작 · 기본 덱</div>
        <div className="deckselect__row">
          {ROSTER.map((c) => (
            <DeckButton key={c.id} deck={presetDeck(c.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}
