// 상점 — 골드로 카드·유물·회복을 구매. 덱이 꽉 찬 상태의 카드 구매만 카드 선택
// (버릴 카드)이 필요하다. ⚠ 유료 "카드 1장 제거"는 뺐다(run.ts "덱 룰" 참고).
import { useMemo, useState } from 'react'
import { getChar } from '../../data/roster'
import { getRelic } from '../../game/relics'
import { resolveRunCard } from '../../game/runcards'
import { upgradedCard } from '../../game/upgrades'
import {
  advanceFloor, buyShopItem, cardLevel, rollShop, runCard, type RunState, type ShopItem,
} from '../../game/run'
import { CardFace, cardAccent } from '../CardFace'
import { useCardZoom } from '../CardDetail'
import { DeckPicker } from '../DeckPicker'
import { RunBar } from '../RunBar'


export function ShopScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const shop = useMemo(() => rollShop(run), [run])
  const [cur, setCur] = useState<RunState>(run)
  const [bought, setBought] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<ShopItem | null>(null) // 카드 선택 대기(제거/획득)
  const char = getChar(cur.charId)
  // 꾹 누르면 카드 상세(설명·능력의 뜻)가 열린다 — 압축 카드에는 설명이 없다.
  const zoom = useCardZoom(char.accent)

  const buy = (item: ShopItem) => {
    if (bought.has(item.id)) return
    const res = buyShopItem(cur, item)
    if (res.ok) {
      setCur(res.run)
      setBought((b) => new Set(b).add(item.id))
    } else if (res.needsCardPick) {
      setPending(item)
    }
  }
  const pickCard = (cardId: string) => {
    if (!pending) return
    const res = buyShopItem(cur, pending, cardId)
    if (res.ok) {
      setCur(res.run)
      setBought((b) => new Set(b).add(pending.id))
    }
    setPending(null)
  }

  if (pending) {
    return (
      <div className="screen shop">
        <div className="grid-bg" />
        <h2 className="shop__title">
          덱이 가득 찼습니다 — 버릴 카드를 고르세요
        </h2>
        <DeckPicker
          charId={cur.charId}
          deck={cur.deck}
          zoom={zoom}
          onPick={pickCard}
          cardOf={(id) => runCard(cur, id)}
        />
        <button className="btn btn--ghost" onClick={() => setPending(null)}>
          취소
        </button>
        {zoom.sheet}
      </div>
    )
  }

  return (
    <div className="screen shop">
      <div className="grid-bg" />
      <div className="shop__topbar">
        <RunBar run={cur} />
      </div>
      <h2 className="shop__title">🛒 상점</h2>
      <div className="shop__items">
        {shop.map((item) => {
          const owned = bought.has(item.id)
          const poor = cur.gold < item.price
          const relic = item.kind === 'relic' ? getRelic(item.relicId) : null
          // 진열된 카드가 이미 덱에 있으면 그건 **강화 상품**이다(2026-08-08) — 사고
          // 나면 장수가 아니라 단계가 오르므로, 진열도 강화 후 모습으로 그린다.
          const base = item.kind === 'card' ? resolveRunCard(cur.charId, item.cardId) : null
          const isUp = item.kind === 'card' && cur.deck.includes(item.cardId)
          const card = base && isUp && item.kind === 'card'
            ? upgradedCard(base, cardLevel(cur, item.cardId) + 1)
            : base
          return (
            <div key={item.id} className={`shop__item ${owned ? 'is-owned' : ''}`}>
              <div className="shop__item-body" {...(card ? zoom.bind(card) : {})}>
                {isUp && <span className="reward__uptag">강화</span>}
                {card && <CardFace card={card} accent={cardAccent(card, char.accent)} compact />}
                {relic && (
                  <div className="shop__relic">
                    <div className="shop__relic-icon">{relic.icon}</div>
                    <div className="shop__relic-name">{relic.name}</div>
                    <div className="shop__relic-desc">{relic.desc}</div>
                  </div>
                )}
                {item.kind === 'heal' && (
                  <div className="shop__service">
                    <div className="shop__service-icon">❤</div>
                    <div className="shop__service-name">체력 +{item.amount}</div>
                  </div>
                )}
              </div>
              <button
                className={`btn shop__buy ${owned || poor ? 'is-disabled' : ''}`}
                disabled={owned || poor}
                onClick={() => buy(item)}
              >
                {owned ? '구매함' : `🪙 ${item.price}`}
              </button>
            </div>
          )
        })}
      </div>
      <button className="btn shop__leave" onClick={() => onDone(advanceFloor(cur))}>
        상점을 떠난다 ▶
      </button>
      {zoom.sheet}
    </div>
  )
}
