// 상점 — 골드로 카드·유물·회복을 구매. 덱이 꽉 찬 상태의 카드 구매만 카드 선택
// (버릴 카드)이 필요하다. ⚠ 유료 "카드 1장 제거"는 뺐다(run.ts "덱 룰" 참고).
//
// 화면은 디자인 `Shop` 그대로다 — 왼쪽에 **떠돌이 상인 마렌**이 서 있고, 오른쪽
// 진열은 카드 / 유물 / 회복 세 묶음으로 나뉜다. 진열 자체는 `rollShop`(카드 3·유물
// 1·회복 2)을 그대로 쓴다.
import { useMemo, useState } from 'react'
import { getChar } from '../../data/roster'
import { getRelic } from '../../game/relics'
import {
  advanceFloor, buyShopItem, regionOf, rollShop, runCard, upgradableDeckCards, type RunState, type ShopItem,
} from '../../game/run'
import { CardFace, cardAccent } from '../CardFace'
import { useCardZoom } from '../CardDetail'
import { DeckPicker } from '../DeckPicker'
import { RARITY_LABEL, RelicIcon } from '../RelicIcon'
import { SceneLayers } from '../SceneLayers'
import { useFirstTip } from '../FirstTip'
import { UpgradeScreen } from './UpgradeScreen'

/** 마렌의 인사 — 체력이 깎였으면 약부터 권한다(디자인 `Shop`의 대사). */
const greeting = (hpFrac: number): string =>
  hpFrac < 0.6
    ? '"골드만 있으면 뭐든 내주지. 피 흘리는 얼굴이면 약부터 보시게."'
    : '"골드만 있으면 뭐든 내주지. 천천히 둘러보게."'

export function ShopScreen({ run, onDone }: { run: RunState; onDone: (next: RunState) => void }) {
  const shop = useMemo(() => rollShop(run), [run])
  const [cur, setCur] = useState<RunState>(run)
  const [bought, setBought] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<ShopItem | null>(null) // 카드 선택 대기(제거/획득)
  // 룰렛 강화 중 — 결제 전 런(취소하면 돌려준다)과 결제 뒤 런.
  const [upgrading, setUpgrading] = useState<{ before: RunState; paid: RunState; itemId: string } | null>(null)
  const char = getChar(cur.charId)
  // 꾹 누르면 카드 상세(설명·능력의 뜻)가 열린다 — 압축 카드에는 설명이 없다.
  const zoom = useCardZoom(char.accent)
  const tip = useFirstTip(['shop'])

  const buy = (item: ShopItem) => {
    if (bought.has(item.id)) return
    const res = buyShopItem(cur, item)
    if (res.ok && res.needsUpgrade) {
      setUpgrading({ before: cur, paid: res.run, itemId: item.id })
    } else if (res.ok) {
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

  if (upgrading) {
    return (
      <UpgradeScreen
        run={upgrading.paid}
        source="shop"
        onCancel={() => setUpgrading(null)} // 룰렛을 안 돌렸으면 돈을 안 받는다
        onDone={(next) => {
          setCur(next)
          setBought((b) => new Set(b).add(upgrading.itemId))
          setUpgrading(null)
        }}
      />
    )
  }

  if (pending) {
    return (
      <div className="screen shop shop--pick">
        <div className="grid-bg" />
        <h2 className="shop__title">덱이 가득 찼습니다 — 버릴 카드를 고르세요</h2>
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

  /** 값 칸 — 금화 + 가격. 산 물건은 "구매함", 돈이 모자라면 잠긴다. */
  const Price = ({ item }: { item: ShopItem }) => {
    const owned = bought.has(item.id)
    const poor = cur.gold < item.price
    return (
      <span className={`price ${owned ? 'price--owned' : ''} ${poor ? 'price--poor' : ''}`}>
        {owned ? (
          '구매함'
        ) : (
          <>
            <i className="coin coin--sm" aria-hidden />
            {item.price}
          </>
        )}
      </span>
    )
  }

  const cards = shop.filter((i) => i.kind === 'card')
  const relics = shop.filter((i) => i.kind === 'relic')
  const heals = shop.filter((i) => i.kind === 'heal')
  const ups = shop.filter((i) => i.kind === 'upgrade')
  const noUpgradable = !upgradableDeckCards(cur).length
  const cardPrice = cards[0]?.price ?? 0

  return (
    <div className="screen shop">
      <SceneLayers scene={regionOf(cur.floor)} />
      <div className="screenveil screenveil--light" />
      {tip}

      <header className="shop__head">
        <div className="shop__where">
          <h1 className="shop__title">상점</h1>
          <span>
            {regionOf(cur.floor) === 'grassland' ? '초원' : '던전'} · {cur.floor}층
          </span>
        </div>
        <div className="shop__purse">
          <span className="goldchip">
            <i className="coin coin--sm" aria-hidden />
            {cur.gold}
          </span>
          <span className="hpchip">
            HP {cur.hp}/{cur.maxHp}
          </span>
          <button className="btn btn--ghost shop__leave" onClick={() => onDone(advanceFloor(cur))}>
            떠나기 →
          </button>
        </div>
      </header>

      <aside className="trader">
        {/* 상점 주인은 **그림 한 장**이다(2026-11 시안 변경 — 받은 그림 그대로 · 배경 포함 ·
            애니메이션 없음, `public/redesign/cutscene/shopkeeper/`). 옛 `sprites/trader` 시트는 지웠다. */}
        <div className="trader__portrait" role="img" aria-label="상점 주인 마렌" />
        <div className="trader__say">
          <b>상점 주인 마렌</b>
          <p>{greeting(cur.hp / Math.max(1, cur.maxHp))}</p>
        </div>
        <p className="trader__note">
          덱이 꽉 찼으면 카드를 살 때 한 장과 바꾼다. 진열은 이 상점을 나갈 때까지 유지.
        </p>
      </aside>

      <main className="shop__main">
        <section className="shop__sec" aria-label="카드">
          <h2>
            카드 <span>· 한 장 {cardPrice}</span>
          </h2>
          <div className="shop__row">
            {cards.map((item) => {
              if (item.kind !== 'card') return null
              const card = runCard(cur, item.cardId)
              if (!card) return null
              return (
                <button
                  key={item.id}
                  className={`item ${bought.has(item.id) ? 'is-owned' : ''}`}
                  style={{ ['--accent' as string]: cardAccent(card, char.accent) }}
                  {...zoom.bind(card)}
                  onClick={() => {
                    if (zoom.consumedClick()) return
                    buy(item)
                  }}
                  aria-disabled={bought.has(item.id) || cur.gold < item.price}
                >
                  <CardFace card={card} accent={cardAccent(card, char.accent)} />
                  <Price item={item} />
                </button>
              )
            })}
          </div>
        </section>

        <div className="shop__bottom">
          <section className="shop__sec" aria-label="유물">
            <h2>
              유물 <span>· 등급별 60 / 95 / 145 / 230</span>
            </h2>
            <div className="shop__row">
              {relics.map((item) => {
                if (item.kind !== 'relic') return null
                const relic = getRelic(item.relicId)
                if (!relic) return null
                return (
                  <button
                    key={item.id}
                    className={`item item--relic ${bought.has(item.id) ? 'is-owned' : ''}`}
                    onClick={() => buy(item)}
                    aria-disabled={bought.has(item.id) || cur.gold < item.price}
                  >
                    <RelicIcon id={relic.id} size={78} />
                    <span className="item__relicbody">
                      <span className="item__relichead">
                        <b>{relic.name}</b>
                        <em className={`relictip__rarity is-${relic.rarity}`}>
                          {RARITY_LABEL[relic.rarity]}
                        </em>
                      </span>
                      <span className="item__relicdesc">{relic.desc}</span>
                      <Price item={item} />
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="shop__sec" aria-label="회복">
            <h2>
              회복 <span>· 두 번까지</span>
            </h2>
            <div className="shop__row">
              {heals.map((item) => (
                <button
                  key={item.id}
                  className={`item item--heal ${bought.has(item.id) ? 'is-owned' : ''}`}
                  onClick={() => buy(item)}
                  aria-disabled={bought.has(item.id) || cur.gold < item.price}
                >
                  <i className="item__potion" aria-hidden />
                  <span className="item__healname">
                    물약 · HP +{item.kind === 'heal' ? item.amount : 0}
                  </span>
                  <Price item={item} />
                </button>
              ))}
            </div>
          </section>

          <section className="shop__sec" aria-label="강화">
            <h2>
              강화 <span>· 한 번</span>
            </h2>
            <div className="shop__row">
              {ups.map((item) => (
                <button
                  key={item.id}
                  className={`item item--upgrade ${bought.has(item.id) ? 'is-owned' : ''}`}
                  onClick={() => buy(item)}
                  aria-disabled={bought.has(item.id) || cur.gold < item.price || noUpgradable}
                  title={noUpgradable ? '강화할 카드가 없다' : undefined}
                >
                  <i className="item__anvil" aria-hidden />
                  <span className="item__healname">카드 강화 · 룰렛</span>
                  <Price item={item} />
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
      {zoom.sheet}
    </div>
  )
}
