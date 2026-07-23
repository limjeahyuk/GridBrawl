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
const TAB_ORDER: Record<Tab, number> = { move: 0, attack: 1, support: 2 }
const tabOf = (c: CardDef): Tab =>
  c.kind === 'move' ? 'move' : c.kind === 'attack' ? 'attack' : 'support'

/** 덱 빌더 — 위쪽 풀에서 고르면 아래 '내 덱' 트레이로 내려가고, 트레이는 이동→
 *  공격→지원 순으로 정렬돼 전체를 스크롤로 본다. 고정 카드는 항상 포함(잠금). */
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
  const [tab, setTab] = useState<Tab>('move')

  const char = getChar(charId)
  const pool = useMemo(() => poolFor(charId), [charId])
  const pickedSet = new Set(picked)

  const changeChar = (id: string) => {
    if (id === charId) return
    setCharId(id)
    setPicked([]) // 풀이 캐릭터마다 달라 초기화
  }
  const add = (id: string) =>
    setPicked((p) => (p.includes(id) || p.length >= DECK_SIZE ? p : [...p, id]))
  const remove = (id: string) => setPicked((p) => p.filter((x) => x !== id))

  const full = picked.length === DECK_SIZE
  const canSave = full && name.trim().length > 0
  const save = () => {
    if (!canSave) return
    onSave({ id: editing?.id ?? newDeckId(), name: name.trim(), charId, cardIds: picked })
  }

  // 아직 안 고른, 현재 탭의 풀 카드 (고른 카드는 아래 트레이로 내려간다)
  const poolInTab = pool.filter((c) => tabOf(c) === tab && !pickedSet.has(c.id))

  // 내 덱 = 고정 + 고른 카드, 이동→공격→지원 순 정렬(정렬 안정)
  const deckList = useMemo(() => {
    const fixed = FIXED_CARDS.map((c) => ({ card: c, fixed: true }))
    const chosen = picked
      .map((id) => pool.find((c) => c.id === id))
      .filter((c): c is CardDef => !!c)
      .map((c) => ({ card: c, fixed: false }))
    return [...fixed, ...chosen].sort(
      (a, b) => TAB_ORDER[tabOf(a.card)] - TAB_ORDER[tabOf(b.card)],
    )
  }, [picked, pool])

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

      {/* 위: 고를 수 있는 카드 풀 (탭별) */}
      <div className="deckbuild__poolwrap">
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
          <span className="deckbuild__hint">카드를 눌러 아래 덱에 담기</span>
        </div>
        <div className="deckbuild__pool">
          {poolInTab.length === 0 ? (
            <p className="deckbuild__poolempty">이 종류의 카드를 모두 담았습니다.</p>
          ) : (
            poolInTab.map((c) => {
              const blocked = full
              return (
                <button
                  key={c.id}
                  className={`deckcard ${blocked ? 'is-blocked' : ''}`}
                  onClick={() => add(c.id)}
                  disabled={blocked}
                >
                  <CardFace card={c} accent={cardAccent(c, char.accent)} />
                  <span className="deckcard__badge deckcard__badge--add">+</span>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* 아래: 내 덱 (고정 + 고른 카드), 이동→공격→지원 순, 가로 스크롤 */}
      <div className="deckbuild__tray">
        <div className="deckbuild__trayhead">
          내 덱 <b>{deckList.length}</b>장 · 고른 카드 {picked.length}/{DECK_SIZE}
        </div>
        <div className="deckbuild__trayrow">
          {deckList.map(({ card, fixed }) => (
            <div key={card.id} className={`traycard ${fixed ? 'traycard--fixed' : ''}`}>
              <button
                className="traycard__btn"
                onClick={() => (fixed ? undefined : remove(card.id))}
                disabled={fixed}
                title={fixed ? '고정 카드' : '빼기'}
              >
                <CardFace card={card} accent={cardAccent(card, char.accent)} />
              </button>
              <span className={`deckcard__badge ${fixed ? 'deckcard__badge--fixed' : 'deckcard__badge--rm'}`}>
                {fixed ? '고정' : '−'}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="scanlines" />
    </div>
  )
}
