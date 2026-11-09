// ---------------------------------------------------------------------------
// 고블린 장사꾼 (2026-11 · 시안 docs/redesign/screens/GoblinShop.dc.html · 기획 GOBLIN_MERCHANT.md)
//
// ? 칸이 상점으로 열리면 나온다. 만남(거래 · 덮친다 · 지나간다) → 거래 / 습격 확인 → 전투.
// **쓸수록 부자가 된다** — 산 만큼 `goblinSpent`가 오르고 문턱을 넘으면 그 자리에서 다음
// 단계 고블린으로 바뀐다. 진열·값은 떠날 때까지 그대로다(다음 단계로 바뀌어도 진열은 유지).
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react'
import { sheetFor } from '../../art/sprites'
import { getChar } from '../../data/roster'
import { getRelic } from '../../game/relics'
import { getMonster, monsterDeck } from '../../game/monsters'
import { markRelicsSeen } from '../../game/progress'
import { resolveRunCard } from '../../game/runcards'
import {
  GOBLIN_NAME,
  GOBLIN_REWARD_GOLD,
  GOBLIN_TIER_AT,
  advanceFloor,
  buyGoblinItem,
  enemyForNode,
  currentNode,
  goblinTier,
  regionOf,
  rollGoblinShop,
  runCard,
  startAmbush,
  type GoblinTier,
  type RunState,
  type ShopItem,
} from '../../game/run'
import { CardFace, cardAccent } from '../CardFace'
import { useCardZoom } from '../CardDetail'
import { DeckPicker } from '../DeckPicker'
import { RelicIcon } from '../RelicIcon'
import { RunBar } from '../RunBar'
import { SceneLayers } from '../SceneLayers'
import { SpriteClip } from '../SpriteClip'

const REWARD_TEXT: Record<GoblinTier, string> = {
  poor: `골드 ${GOBLIN_REWARD_GOLD.poor} + 진열품 1개 무작위`,
  mid: `골드 ${GOBLIN_REWARD_GOLD.mid} + 진열품 1개 고르기`,
  rich: `골드 ${GOBLIN_REWARD_GOLD.rich} + 진열품 1개 고르기 + 유물 확정`,
}
const TIER_UP_TOAST: Record<GoblinTier, string> = {
  poor: '',
  mid: '돈맛을 봤다 — 중간 고블린이 됐다!',
  rich: '금니까지 했다 — 부자 고블린이 됐다!',
}

/** 정가 대비 배율 칩 — 1 미만 싸다(초록) · 1.0 정가 · 1.3 이상 바가지(빨강). */
function MulChip({ mul }: { mul: number }) {
  const cls = mul < 1 ? 'is-cheap' : mul >= 1.3 ? 'is-rip' : mul > 1 ? 'is-up' : ''
  const word = mul < 1 ? '싸다' : mul >= 1.3 ? '바가지' : mul > 1 ? '조금 비쌈' : '정가'
  return (
    <span className={`gob__mul ${cls}`}>
      ×{mul.toFixed(1)} {word}
    </span>
  )
}

type Step = 'meet' | 'trade' | 'ambush'

export function GoblinScreen({
  run,
  onDone,
  onFight,
}: {
  run: RunState
  onDone: (next: RunState) => void
  onFight: (next: RunState) => void
}) {
  const char = getChar(run.charId)
  const zoom = useCardZoom(char.accent)
  const startTier = goblinTier(run.goblinSpent ?? 0)
  const stock = useMemo(() => rollGoblinShop(run, startTier), [run, startTier])
  const [cur, setCur] = useState<RunState>(run)
  const [step, setStep] = useState<Step>('meet')
  const [bought, setBought] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<ShopItem | null>(null)
  const [cheer, setCheer] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  const tier = goblinTier(cur.goblinSpent ?? 0)
  const sheet = sheetFor(`goblin-${tier}`)
  const spent = cur.goblinSpent ?? 0
  const nextAt = tier === 'poor' ? GOBLIN_TIER_AT.mid : tier === 'mid' ? GOBLIN_TIER_AT.rich : null

  const afterBuy = (item: ShopItem, next: RunState) => {
    const before = goblinTier(cur.goblinSpent ?? 0)
    const after = goblinTier(next.goblinSpent ?? 0)
    setCur(next)
    setBought((b) => new Set(b).add(item.id))
    setCheer((n) => n + 1)
    if (item.kind === 'relic') markRelicsSeen([item.relicId])
    if (after !== before) setToast(TIER_UP_TOAST[after])
  }
  const buy = (item: ShopItem) => {
    if (bought.has(item.id)) return
    const res = buyGoblinItem(cur, item)
    if (res.ok) afterBuy(item, res.run)
    else if (res.needsCardPick) setPending(item)
  }
  const pickCard = (cardId: string) => {
    if (!pending) return
    const res = buyGoblinItem(cur, pending, cardId)
    if (res.ok) afterBuy(pending, res.run)
    setPending(null)
  }
  // 습격 대상 — 남은 진열품이 곧 보상이다(산 물건은 이미 내 것).
  const left = stock.filter((i) => !bought.has(i.id))
  const foe = enemyForNode(cur, { ...currentNode(cur), monsterId: `goblin-${tier}` })
  const foeCards = monsterDeck(getMonster(`goblin-${tier}`))
  const abilityCount = Object.keys(getMonster(`goblin-${tier}`).passive).length

  if (pending) {
    return (
      <div className="screen shop">
        <div className="grid-bg" />
        <h2 className="shop__title">덱이 가득 찼습니다 — 버릴 카드를 고르세요</h2>
        <DeckPicker charId={cur.charId} deck={cur.deck} zoom={zoom} onPick={pickCard} cardOf={(id) => runCard(cur, id)} />
        <button className="btn btn--ghost" onClick={() => setPending(null)}>
          취소
        </button>
        {zoom.sheet}
      </div>
    )
  }

  return (
    <div className="screen gob">
      <SceneLayers scene={regionOf(cur.floor)} />
      <div className="node__shade" aria-hidden="true" />
      <header className="gob__head">
        <div>
          <h1>고블린 상점</h1>
          <span>
            ? 칸 · {regionOf(cur.floor) === 'grassland' ? '초원' : '던전'} · {cur.floor}층
          </span>
        </div>
        <RunBar run={cur} />
      </header>
      <section className="gob__wealth">
        <span className="gob__kicker">고블린 재산</span>
        <span className="gob__spent">
          이번 런에서 고블린에게 쓴 돈 <b>{spent}</b> · {GOBLIN_NAME[tier]}
        </span>
        <div className="gob__gauge">
          <i style={{ width: `${Math.min(100, (spent / (GOBLIN_TIER_AT.rich * 1.5)) * 100)}%` }} />
          <span style={{ left: `${(GOBLIN_TIER_AT.mid / (GOBLIN_TIER_AT.rich * 1.5)) * 100}%` }}>중간 {GOBLIN_TIER_AT.mid}</span>
          <span style={{ left: `${(1 / 1.5) * 100}%` }}>부자 {GOBLIN_TIER_AT.rich}</span>
        </div>
        <span className="gob__next">{nextAt ? `${nextAt - spent} 더 쓰면 ${tier === 'poor' ? '중간' : '부자'} 고블린` : '더 부자가 될 수 없다'}</span>
      </section>
      <div className={`gob__npc ${toast ? 'is-flash' : ''}`} key={tier}>
        {sheet && <SpriteClip sheet={sheet} clip={step === 'trade' && cheer ? 'cheer' : 'haggle'} seq={cheer} />}
        <b>{GOBLIN_NAME[tier]}</b>
      </div>
      {toast && (
        <div className="gob__toast" role="status" onAnimationEnd={() => setToast(null)}>
          {toast}
        </div>
      )}

      {step === 'meet' && (
        <section className="gob__meet">
          <span className="gob__kicker">? → SHOP</span>
          <h2>수상한 짐꾼을 만났다</h2>
          <p>사거나, 덮치거나, 그냥 지나가거나. 덮치면 바로 전투다 — 이기면 짐을 턴다.</p>
          <div className="gob__choices">
            <button type="button" className="gob__choice" onClick={() => setStep('trade')}>
              <b>거래한다</b>
              <span className="ev__costs">
                <span className="ev__cost">진열 {stock.length}개</span>
              </span>
              <span>값은 물건마다 정가 ×0.8~1.5 · 쓸수록 고블린이 부자가 된다</span>
            </button>
            <button type="button" className="gob__choice gob__choice--atk" onClick={() => setStep('ambush')}>
              <b>덮친다</b>
              <span className="ev__costs">
                <span className="ev__cost ev__cost--hp">전투 · HP {foe.maxHp}</span>
              </span>
              <span>이기면 {REWARD_TEXT[tier]} · 이기면 다음 상점은 가난부터</span>
            </button>
            <button type="button" className="gob__choice" onClick={() => onDone(advanceFloor(cur))}>
              <b>그냥 지나간다</b>
              <span>아무 일 없음</span>
            </button>
          </div>
        </section>
      )}

      {step === 'trade' && (
        <section className="gob__trade">
          <h2>
            고블린의 짐 <small>값은 물건마다 제각각(정가 ×0.8~1.5) · 진열·값은 떠날 때까지 유지</small>
          </h2>
          <div className="gob__items">
            {stock.map((item) => {
              const owned = bought.has(item.id)
              const poor = cur.gold < item.price
              const card = item.kind === 'card' ? resolveRunCard(cur.charId, item.cardId) : undefined
              const relic = item.kind === 'relic' ? getRelic(item.relicId) : undefined
              return (
                <div key={item.id} className={`gob__item ${owned ? 'is-owned' : ''}`}>
                  <div className="gob__itembody" {...(card ? zoom.bind(card) : {})}>
                    {card && <CardFace card={card} accent={cardAccent(card, char.accent)} compact />}
                    {relic && (
                      <div className="shop__relic">
                        <RelicIcon id={relic.id} size={52} />
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
                  <div className="gob__price">
                    {item.mul !== undefined && <MulChip mul={item.mul} />}
                    {item.base !== undefined && item.mul !== 1 && <s>정가 {item.base}</s>}
                  </div>
                  <button
                    type="button"
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
          <div className="gob__actions">
            <button type="button" className="gob__atk" onClick={() => setStep('ambush')}>
              마음이 바뀌었다 — 덮친다
            </button>
            <button type="button" className="ev__go" onClick={() => onDone(advanceFloor(cur))}>
              떠나기 ▶
            </button>
          </div>
        </section>
      )}

      {step === 'ambush' && (
        <section className="gob__ambush">
          <span className="gob__kicker gob__kicker--red">AMBUSH</span>
          <h2>{GOBLIN_NAME[tier]}이 짐을 내려놓는다</h2>
          <div className="gob__stats">
            <span>체력 {foe.maxHp}</span>
            <span>시작 기력 {foe.startEnergy}</span>
            <span>강함 {foe.aiLevel === 'hard' ? '엘리트급' : foe.aiLevel === 'normal' ? '보통' : '약함'}</span>
          </div>
          <div className="gob__cards">
            <span className="gob__kicker">내는 카드</span>
            {foeCards.map((c) => c.name).join(' · ')}
          </div>
          <div className="gob__abil">
            <span className="gob__kicker">고유 능력 — 처음 발동할 때 공개</span>
            {Array.from({ length: abilityCount }, (_, i) => (
              <span key={i} className="gob__q">?</span>
            ))}
            {!abilityCount && <span>없음</span>}
          </div>
          <div className="gob__reward">
            <span className="gob__kicker">이기면</span>
            {REWARD_TEXT[tier]}
            <small>재산 0 → 다음 고블린 상점은 가난부터</small>
          </div>
          <div className="gob__actions">
            <button type="button" className="ev__ghost" onClick={() => setStep('meet')}>
              물러선다
            </button>
            <span className="gob__warn">지면 런이 끝난다</span>
            <button type="button" className="gob__fight" onClick={() => onFight(startAmbush(cur, left))}>
              전투 시작 ▶
            </button>
          </div>
        </section>
      )}
      {zoom.sheet}
    </div>
  )
}
