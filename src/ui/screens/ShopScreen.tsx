// 상점 — 골드로 카드·유물·회복·카드 제거를 구매. 카드 제거/획득은 카드 선택이 필요.
import { useMemo, useState } from 'react'
import { getChar } from '../../data/roster'
import { getRelic } from '../../game/relics'
import { resolveRunCard } from '../../game/runcards'
import {
  advanceFloor, buyShopItem, rollShop, type RunState, type ShopItem,
} from '../../game/run'
import { CardFace, cardAccent } from '../CardFace'
import { RunBar } from '../RunBar'


export function ShopScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const shop = useMemo(() => rollShop(run), [run])
  const [cur, setCur] = useState<RunState>(run)
  const [bought, setBought] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<ShopItem | null>(null) // 카드 선택 대기(제거/획득)
  const char = getChar(cur.charId)

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
    const removing = pending.kind === 'removeCard'
    return (
      <div className="screen shop">
        <div className="grid-bg" />
        <h2 className="shop__title">{removing ? '제거할 카드를 고르세요' : '버릴 카드를 고르세요'}</h2>
        <div className="reward__deck">
          {cur.deck.map((id, i) => {
            const c = resolveRunCard(cur.charId, id)
            if (!c) return null
            return (
              <button
                key={`${id}-${i}`}
                className="reward__card"
                style={{ ['--accent' as string]: cardAccent(c, char.accent) }}
                onClick={() => pickCard(id)}
              >
                <CardFace card={c} accent={cardAccent(c, char.accent)} compact />
              </button>
            )
          })}
        </div>
        <button className="btn btn--ghost" onClick={() => setPending(null)}>
          취소
        </button>
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
          const card = item.kind === 'card' ? resolveRunCard(cur.charId, item.cardId) : null
          return (
            <div key={item.id} className={`shop__item ${owned ? 'is-owned' : ''}`}>
              <div className="shop__item-body">
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
                {item.kind === 'removeCard' && (
                  <div className="shop__service">
                    <div className="shop__service-icon">🗑</div>
                    <div className="shop__service-name">카드 1장 제거</div>
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
    </div>
  )
}
