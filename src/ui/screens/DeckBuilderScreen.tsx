import { useMemo, useState } from 'react'
import { ROSTER, getChar } from '../../data/roster'
import type { CardDef } from '../../battle/types'
import { CardFace, cardAccent } from '../CardFace'
import { PortraitSvg } from '../PortraitSvg'
import {
  DECK_SIZE,
  FIXED_CARDS,
  poolFor,
  newDeckId,
  type Deck,
} from '../../game/decks'

type Tab = 'move' | 'attack' | 'support'
const TABS: { id: Tab; label: string }[] = [
  { id: 'move', label: '이동' },
  { id: 'attack', label: '공격' },
  { id: 'support', label: '지원' },
]
const tabOf = (c: CardDef): Tab =>
  c.kind === 'move' ? 'move' : c.kind === 'attack' ? 'attack' : 'support'

/** 덱 빌더 — 캐릭터를 고르고 선택 풀에서 7장을 골라 저장한다. 고정 카드는 항상 포함(잠금). */
export function DeckBuilderScreen({
  editing,
  onSave,
  onCancel,
}: {
  editing?: Deck
  onSave: (deck: Deck) => void
  onCancel: () => void
}) {
  const [charId, setCharId] = useState(editing?.charId ?? ROSTER[0].id)
  const [name, setName] = useState(editing?.name ?? '')
  const [picked, setPicked] = useState<string[]>(editing?.cardIds ?? [])
  const [tab, setTab] = useState<Tab>('attack')

  const char = getChar(charId)
  const pool = useMemo(() => poolFor(charId), [charId])
  const pickedSet = new Set(picked)

  const changeChar = (id: string) => {
    if (id === charId) return
    setCharId(id)
    setPicked([]) // 풀이 캐릭터마다 달라 초기화
  }
  const toggle = (id: string) => {
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length < DECK_SIZE ? [...p, id] : p,
    )
  }

  const full = picked.length === DECK_SIZE
  const canSave = full && name.trim().length > 0
  const save = () => {
    if (!canSave) return
    onSave({
      id: editing?.id ?? newDeckId(),
      name: name.trim(),
      charId,
      cardIds: picked,
    })
  }

  const fixedInTab = FIXED_CARDS.filter((c) => tabOf(c) === tab)
  const poolInTab = pool.filter((c) => tabOf(c) === tab)

  return (
    <div className="screen deckbuild" style={{ ['--accent' as string]: char.accent }}>
      <div className="grid-bg" />
      <div className="deckbuild__bar">
        <button className="btn btn--ghost" onClick={onCancel}>
          ◀ 취소
        </button>
        <input
          className="deckbuild__name"
          placeholder="덱 이름"
          value={name}
          maxLength={16}
          onChange={(e) => setName(e.target.value)}
        />
        <button className={`btn ${canSave ? '' : 'is-disabled'}`} disabled={!canSave} onClick={save}>
          저장 ({picked.length}/{DECK_SIZE})
        </button>
      </div>

      <div className="deckbuild__chars">
        {ROSTER.map((c) => (
          <button
            key={c.id}
            className={`deckbuild__char ${c.id === charId ? 'is-active' : ''}`}
            style={{ ['--accent' as string]: c.accent }}
            onClick={() => changeChar(c.id)}
            title={c.name}
          >
            <PortraitSvg char={c} className="deckbuild__charart" />
            <span>{c.name}</span>
          </button>
        ))}
      </div>

      <div className="deckbuild__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`cards__tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <span className="deckbuild__hint">고정 카드는 항상 포함됩니다</span>
      </div>

      <div className="deckbuild__grid">
        {fixedInTab.map((c) => (
          <div key={c.id} className="deckcard deckcard--fixed" title="고정 카드">
            <CardFace card={c} accent={cardAccent(c, char.accent)} />
            <span className="deckcard__badge deckcard__badge--fixed">고정</span>
          </div>
        ))}
        {poolInTab.map((c) => {
          const on = pickedSet.has(c.id)
          const blocked = !on && full
          return (
            <button
              key={c.id}
              className={`deckcard ${on ? 'is-picked' : ''} ${blocked ? 'is-blocked' : ''}`}
              onClick={() => toggle(c.id)}
            >
              <CardFace card={c} accent={cardAccent(c, char.accent)} />
              {on && <span className="deckcard__badge deckcard__badge--on">✓</span>}
            </button>
          )
        })}
      </div>
      <div className="scanlines" />
    </div>
  )
}
