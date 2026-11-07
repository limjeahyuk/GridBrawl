// 고블린 장사꾼(디자인 `GoblinShop` · 규칙 `docs/redesign/GOBLIN_MERCHANT.md`).
// 만남(거래한다 · 덮친다 · 지나간다) → 거래 / 습격 확인. 쓸수록 고블린이 부자가 되고,
// 덮쳐서 이기면 재산이 0으로 — 다음 고블린 상점은 가난부터.
import { useMemo, useRef, useState } from 'react'
import { sheetFor } from '../../art/sprites'
import { getChar } from '../../data/roster'
import { getRelic, type Rarity } from '../../game/relics'
import {
  GOBLIN_LOOT, GOBLIN_TIER_AT, advanceFloor, currentEnemy, buyGoblinItem, goblinMonsterId, goblinTier, regionOf, rollGoblinShop,
  runCard, type GoblinItem, type GoblinTier, type RunState,
} from '../../game/run'
import { CardFace, cardAccent } from '../CardFace'
import { useCardZoom } from '../CardDetail'
import { DeckPicker } from '../DeckPicker'
import { RARITY_LABEL, RelicIcon } from '../RelicIcon'
import { SceneLayers } from '../SceneLayers'
import { SpriteClip } from '../SpriteClip'

const TIER: Record<GoblinTier, { name: string; tag: string; look: string; line: string; stars: string; style: string; deck: string[]; q: number; qTxt: string }> = {
  poor: { name: '가난한 고블린', tag: 'POOR', look: '해진 두건 · 보따리 · 국자', line: '"헤헤… 오늘 첫 손님이야. 싸게, 아주 싸게 줄게. 제발 사 줘."', stars: '★☆☆', style: '도망치며 던짐', deck: ['돌팔매', '국자 후려치기'], q: 0, qTxt: '능력 없음 — 맨몸이다' },
  mid: { name: '중간 고블린', tag: 'TRADER', look: '가죽 모자 · 큰 배낭 · 언월도', line: '"오, 또 왔네 단골! 덕분에 배낭을 새로 샀지. 이번엔 물건이 좀 된다고."', stars: '★★☆', style: '붙어서 벤다', deck: ['언월도 베기', '찌르기', '가드'], q: 1, qTxt: '상시 능력 1개' },
  rich: { name: '부자 고블린', tag: 'TYCOON', look: '실크햇 · 금사슬 · 금화 자루 · 보석 지팡이', line: '"흐흐, 자네 덕에 금니도 했다네. 이 몸의 진짜 물건을 보여 주지 — 값은 좀 나가."', stars: '★★★', style: '돈으로 버틴다', deck: ['지팡이 후려치기', '금화 뿌리기', '방패 밀치기', '버티기'], q: 3, qTxt: '능력 3개 · 엘리트급' },
}
const FIGHT_LINE: Record<GoblinTier, string> = {
  poor: '"으악, 가진 것도 없는데!"',
  mid: '"단골인 줄 알았더니 강도였어?!"',
  rich: '"감히 이 몸을? 금화로 네 무덤을 덮어 주지!"',
}
const lootTxt = (tier: GoblinTier): string[] => {
  const l = GOBLIN_LOOT[tier]
  return [`골드 ${l.gold}`, l.pick ? '진열품 1개 고르기' : '진열품 1개', ...(l.relic ? ['유물 확정'] : [])]
}
const NEXT_NAME: Record<GoblinTier, string> = { poor: '중간 고블린', mid: '부자 고블린', rich: '' }
const mulTag = (m: number) => (m < 1 ? '싸다' : m >= 1.3 ? '바가지' : m === 1 ? '정가' : '조금 비쌈')

export function GoblinScreen({
  run,
  onDone,
  onFight,
}: {
  run: RunState
  onDone: (next: RunState) => void
  onFight: (next: RunState) => void
}) {
  const [cur, setCur] = useState(run)
  const [phase, setPhase] = useState<'meet' | 'trade' | 'fight'>('meet')
  const [bought, setBought] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<GoblinItem | null>(null)
  const [cheer, setCheer] = useState(0) // 산 횟수 — cheer 클립을 처음부터 다시 돌리는 키
  const [cheering, setCheering] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastT = useRef(0)
  const char = getChar(cur.charId)
  const zoom = useCardZoom(char.accent)
  const spent = cur.goblinSpent ?? 0
  const tier = goblinTier(spent)
  // 진열·값은 **떠날 때까지 유지** — 들어온 순간의 단계로 한 번 굴린다.
  const stock = useMemo(() => rollGoblinShop(run, goblinTier(run.goblinSpent ?? 0)), [run])
  const t = TIER[tier]
  // 체력은 층 스케일이 걸린 실제 값으로 보여 준다(전투와 같은 계산).
  const foe = currentEnemy({ ...cur, special: { kind: 'goblin', monsterId: goblinMonsterId(tier) } })
  const sheet = sheetFor(goblinMonsterId(tier))

  const buy = (item: GoblinItem, removeId?: string) => {
    if (bought.has(item.id)) return
    const res = buyGoblinItem(cur, item, removeId)
    if (res.needsCardPick) return setPending(item)
    if (!res.ok) return
    setPending(null)
    const before = goblinTier(cur.goblinSpent ?? 0)
    const after = goblinTier(res.run.goblinSpent ?? 0)
    setCur(res.run)
    setBought((b) => new Set(b).add(item.id))
    setCheer((n) => n + 1)
    setCheering(true)
    window.setTimeout(() => setCheering(false), 660) // cheer 6프레임 × 110ms → 다시 흥정
    if (after !== before) {
      setToast(after === 'rich' ? '금니까지 했다 — 부자 고블린이 됐다!' : '돈맛을 봤다 — 중간 고블린이 됐다!')
      clearTimeout(toastT.current)
      toastT.current = window.setTimeout(() => setToast(null), 2000)
    }
  }
  // 덮칠 때의 진열 = 아직 안 산 것(이기면 여기서 전리품을 고른다).
  const fight = () =>
    onFight({
      ...cur,
      special: { kind: 'goblin', monsterId: goblinMonsterId(tier), goblinTier: tier, goblinStock: stock.filter((i) => !bought.has(i.id)) },
    })

  if (pending)
    return (
      <div className="screen shop shop--pick">
        <div className="grid-bg" />
        <h2 className="shop__title">덱이 가득 찼습니다 — 버릴 카드를 고르세요</h2>
        <DeckPicker charId={cur.charId} deck={cur.deck} zoom={zoom} onPick={(id) => buy(pending, id)} cardOf={(id) => runCard(cur, id)} />
        <button className="btn btn--ghost" onClick={() => setPending(null)}>
          취소
        </button>
        {zoom.sheet}
      </div>
    )

  const pct = Math.min(100, (spent / 300) * 100)
  const next = tier === 'poor' ? GOBLIN_TIER_AT.mid : tier === 'mid' ? GOBLIN_TIER_AT.rich : null
  const clip = phase === 'fight' ? 'idle' : cheering ? 'cheer' : 'haggle'

  return (
    <div className="screen gob">
      <SceneLayers scene={regionOf(cur.floor)} />
      <div className="screenveil" />
      <header className="shop__head">
        <div className="shop__where">
          <h1 className="shop__title">고블린 상점</h1>
          <span className="gob__where">
            ? 칸 · {regionOf(cur.floor) === 'grassland' ? '초원' : '던전'} · {cur.floor}층
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
        </div>
      </header>

      <section className="gob__wealth" aria-label="고블린 재산">
        <div className="gob__wealthhead">
          <b>고블린 재산</b>
          <span>
            이번 런에서 고블린에게 쓴 돈 <b>{spent}</b> · {next ? `${next - spent} 더 쓰면 ${NEXT_NAME[tier]}` : '최고 단계'}
          </span>
        </div>
        <div className="gob__bar">
          <i style={{ width: `${pct}%` }} />
          <em style={{ left: '26.6%' }} />
          <em style={{ left: '66.6%' }} />
        </div>
        <div className="gob__marks">
          <span style={{ left: 0 }}>가난 0</span>
          <span style={{ left: '26.6%', transform: 'translateX(-50%)' }}>중간 80</span>
          <span style={{ left: '66.6%', transform: 'translateX(-50%)' }}>부자 200</span>
          <span style={{ right: 0 }}>300+</span>
        </div>
      </section>

      <i className={`gob__rug gob__rug--${tier}`} aria-hidden />
      <div className={`gob__spr ${toast ? 'is-flash' : ''}`} role="img" aria-label={t.name}>
        {sheet && <SpriteClip key={tier} sheet={sheet} clip={clip} seq={cheer} scale={4} />}
      </div>
      {toast && (
        <div className="gob__toast">
          <i className="coin" aria-hidden />
          {toast}
        </div>
      )}

      <div className="gob__intro">
        <div className="gob__name">
          <b>{t.name}</b>
          <span className={`gob__tag gob__tag--${tier}`}>{t.tag}</span>
          <small>{t.look}</small>
        </div>
        <div className="gob__say">
          <p>{phase === 'fight' ? FIGHT_LINE[tier] : cheering ? '"헤헤, 고맙수다! 짤랑짤랑~"' : t.line}</p>
        </div>
      </div>

      {phase === 'meet' && (
        <section className="gob__panel rise">
          <span className="gob__kicker">? → SHOP</span>
          <h2>수상한 짐꾼을 만났다</h2>
          <p>사거나, 덮치거나, 그냥 지나가거나. 덮치면 바로 전투다 — 이기면 짐을 턴다.</p>
          <div className="gob__opts">
            <button type="button" className="gob__opt" onClick={() => setPhase('trade')}>
              <span>거래한다</span>
              <i className="chip chip--gold">진열 {stock.length}개</i>
              <i className="chip chip--gold">값은 물건마다 정가 ×0.8~1.5</i>
              <i className="chip chip--poison">쓸수록 고블린이 부자가 된다</i>
            </button>
            <button type="button" className="gob__opt gob__opt--fight" onClick={() => setPhase('fight')}>
              <span>덮친다</span>
              <i className="chip chip--hp">전투 {t.stars} · HP {foe.maxHp}</i>
              <i className="chip chip--gold">이기면 {lootTxt(tier).join(' + ')}</i>
              <i className="chip chip--item">이기면 다음 상점은 가난부터</i>
            </button>
            <button type="button" className="gob__opt" onClick={() => onDone(advanceFloor(cur))}>
              <span>그냥 지나간다</span>
              <i className="chip chip--item">아무 일 없음</i>
            </button>
          </div>
        </section>
      )}

      {phase === 'trade' && (
        <section className="gob__panel rise">
          <div className="gob__tradehead">
            <h2>고블린의 짐</h2>
            <span>값은 물건마다 제각각(정가 ×0.8~1.5) · 진열·값은 떠날 때까지 유지</span>
          </div>
          {stock.map((it) => {
            const owned = bought.has(it.id)
            const poor = cur.gold < it.price
            const card = it.kind === 'card' ? runCard(cur, it.cardId) : null
            const relic = it.kind === 'relic' ? getRelic(it.relicId) : null
            const tone = it.mul < 1 ? 'cheap' : it.mul >= 1.3 ? 'dear' : 'mid'
            return (
              <div key={it.id} className={`gob__row ${owned ? 'is-owned' : ''}`}>
                <span className="gob__thumb">
                  {relic && <RelicIcon id={relic.id} size={52} />}
                  {card && (
                    <span className="gob__card" {...zoom.bind(card)}>
                      <CardFace card={card} accent={cardAccent(card, char.accent)} compact />
                    </span>
                  )}
                  {it.kind === 'heal' && <i className="item__potion" aria-hidden />}
                </span>
                <span className="gob__info">
                  <span className="gob__iname">
                    {card?.name ?? relic?.name ?? `물약 · HP +${it.kind === 'heal' ? it.amount : 0}`}
                    {relic && <em className={`relictip__rarity is-${relic.rarity as Rarity}`}>{RARITY_LABEL[relic.rarity]}</em>}
                    {card && <em className="relictip__rarity is-common">카드</em>}
                  </span>
                  <span className="gob__idesc">{card?.desc ?? relic?.desc ?? '체력을 회복한다.'}</span>
                </span>
                <span className="gob__mul">
                  <i className={`chip gob__mulchip is-${tone}`}>
                    ×{it.mul.toFixed(1)} {mulTag(it.mul)}
                  </i>
                  {it.mul !== 1 && <s>정가 {it.base}</s>}
                </span>
                <button type="button" className={`gob__buy ${owned || poor ? 'is-off' : ''}`} onClick={() => buy(it)}>
                  {owned ? (
                    '구매함'
                  ) : (
                    <>
                      <i className="coin coin--sm" aria-hidden />
                      {it.price}
                    </>
                  )}
                </button>
              </div>
            )
          })}
          <div className="gob__foot">
            <button type="button" className="upg__ghost gob__change" onClick={() => setPhase('fight')}>
              마음이 바뀌었다 — 덮친다
            </button>
            <span style={{ flexGrow: 1 }} />
            <button type="button" className="upg__go" onClick={() => onDone(advanceFloor(cur))}>
              떠나기 ▶
            </button>
          </div>
        </section>
      )}

      {phase === 'fight' && (
        <section className="gob__panel gob__panel--fight rise">
          <div className="gob__tradehead">
            <span className="gob__kicker is-red">AMBUSH</span>
            <span>전투 화면은 일반 전투와 같다 · 판은 빈 판</span>
          </div>
          <h2>{t.name}이(가) 짐을 내려놓는다</h2>
          <dl className="gob__stats">
            <div><dt>체력</dt><dd className="is-red">{foe.maxHp}</dd></div>
            <div><dt>시작 기력</dt><dd className="is-blue">{foe.startEnergy}</dd></div>
            <div><dt>강함</dt><dd className="is-gold">{t.stars}</dd></div>
            <div><dt>성격</dt><dd className="is-text">{t.style}</dd></div>
          </dl>
          <div className="gob__sub">
            <span>내는 카드</span>
            <div>{t.deck.map((d) => <i key={d} className="chip chip--hp">{d}</i>)}</div>
          </div>
          <div className="gob__sub">
            <span>고유 능력 — 처음 발동할 때 공개 (보스와 같은 ? 규칙)</span>
            <div>
              {Array.from({ length: t.q }, (_, i) => <i key={i} className="gob__q">?</i>)}
              <small>{t.qTxt}</small>
            </div>
          </div>
          <div className="gob__loot">
            <span>이기면</span>
            {lootTxt(tier).map((l) => <i key={l} className="chip chip--gold">{l}</i>)}
            <i className="chip chip--item">재산 0 → 다음 고블린 상점은 가난부터</i>
          </div>
          <div className="gob__foot">
            <button type="button" className="upg__ghost" onClick={() => setPhase('meet')}>
              물러선다
            </button>
            <span className="gob__warn">지면 런이 끝난다</span>
            <button type="button" className="upg__go event__fight" onClick={fight}>
              전투 시작 ▶
            </button>
          </div>
        </section>
      )}
      {zoom.sheet}
    </div>
  )
}
