// 상점 — 골드로 카드·유물·회복을 구매. 덱이 꽉 찬 상태의 카드 구매만 카드 선택
// (버릴 카드)이 필요하다. ⚠ 유료 "카드 1장 제거"는 뺐다(run.ts "덱 룰" 참고).
// 2026-11: 왼쪽에 상점 주인 마렌(그림 그대로 · 시안 Shop.dc.html) + **룰렛 강화 칸**(상점마다 한 번).
import { useMemo, useState } from 'react'
import { getChar } from '../../data/roster'
import { getRelic } from '../../game/relics'
import { resolveRunCard } from '../../game/runcards'
import {
  advanceFloor, buyShopItem, rollShop, runCard, upgradableDeckCards, type RunState, type ShopItem,
} from '../../game/run'
import { markRelicsSeen } from '../../game/progress'
import { UpgradeScreen } from './UpgradeScreen'
import { CardFace, cardAccent } from '../CardFace'
import { useCardZoom } from '../CardDetail'
import { DeckPicker } from '../DeckPicker'
import { RelicIcon } from '../RelicIcon'
import { RunBar } from '../RunBar'


export function ShopScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const shop = useMemo(() => rollShop(run), [run])
  const [cur, setCur] = useState<RunState>(run)
  const [bought, setBought] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<ShopItem | null>(null) // 카드 선택 대기(제거/획득)
  /** 강화 칸을 산 직후 — 낸 돈은 `paid`에, 그만두면 `cur`로 돌아간다(환불). */
  const [upgrading, setUpgrading] = useState<{ item: ShopItem; paid: RunState } | null>(null)
  const [line, setLine] = useState('"어서 오세요! 다친 데가 있으면 약부터 보세요."')
  const char = getChar(cur.charId)
  // 꾹 누르면 카드 상세(설명·능력의 뜻)가 열린다 — 압축 카드에는 설명이 없다.
  const zoom = useCardZoom(char.accent)

  const buy = (item: ShopItem) => {
    if (bought.has(item.id)) return
    const res = buyShopItem(cur, item)
    if (res.ok && res.openUpgrade) {
      setUpgrading({ item, paid: res.run })
    } else if (res.ok) {
      setCur(res.run)
      setBought((b) => new Set(b).add(item.id))
      if (item.kind === 'relic') markRelicsSeen([item.relicId])
      setLine('좋은 선택이에요. 또 오세요.')
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

  if (upgrading) {
    return (
      <UpgradeScreen
        run={upgrading.paid}
        source="shop"
        onCancel={() => setUpgrading(null)}
        onDone={(next) => {
          setCur(next)
          setBought((b) => new Set(b).add(upgrading.item.id))
          setUpgrading(null)
          setLine('손이 많이 갔네요. 잘 쓰세요.')
        }}
      />
    )
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
      <aside className="shop__keeper">
        <div className="shop__keeperframe">
          <div className="shop__keeperart" role="img" aria-label="상점 주인 마렌" />
        </div>
        <div className="shop__bubble">
          <b>상점 주인 마렌</b>
          <span>{line}</span>
        </div>
      </aside>
      <h2 className="shop__title">상점</h2>
      <div className="shop__items">
        {shop.map((item) => {
          const owned = bought.has(item.id)
          const poor = cur.gold < item.price
          const relic = item.kind === 'relic' ? getRelic(item.relicId) : null
          const card = item.kind === 'card' ? resolveRunCard(cur.charId, item.cardId) : null
          const noUp = item.kind === 'upgrade' && !upgradableDeckCards(cur).length
          return (
            <div key={item.id} className={`shop__item ${owned ? 'is-owned' : ''}`}>
              <div className="shop__item-body" {...(card ? zoom.bind(card) : {})}>
                {card && <CardFace card={card} accent={cardAccent(card, char.accent)} compact />}
                {relic && (
                  <div className="shop__relic">
                    <RelicIcon id={relic.id} size={52} className="shop__relic-icon" />
                    <div className="shop__relic-name">{relic.name}</div>
                    <div className="shop__relic-desc">{relic.desc}</div>
                  </div>
                )}
                {item.kind === 'upgrade' && (
                  <div className="shop__service shop__service--upgrade">
                    <div className="shop__anvil" aria-hidden="true" />
                    <div className="shop__service-name">카드 강화 · 룰렛</div>
                    <div className="shop__relic-desc">한 장 · 수치 또는 범위 · 상점마다 한 번 · 꽝이면 환불 없음</div>
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
                className={`btn shop__buy ${owned || poor || noUp ? 'is-disabled' : ''}`}
                disabled={owned || poor || noUp}
                onClick={() => buy(item)}
              >
                {owned ? (item.kind === 'upgrade' ? '강화함' : '구매함') : noUp ? '강화할 카드 없음' : `🪙 ${item.price}`}
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
