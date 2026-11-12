// 고블린 장사꾼(디자인 `GoblinShop` · `GoblinTiers` · 규칙 `docs/redesign/GOBLIN_MERCHANT.md`).
// 만남(거래한다 · 덮친다 · 지나간다) → 거래 / 습격 확인. 쓸수록 고블린이 부자가 되고,
// 덮쳐서 이기면 재산이 0으로 — 다음 고블린 상점은 가난부터.
// 2026-11-12: 여관과 같은 배치 — 단계별 일러스트를 왼쪽에 깔고 대사창 · 선택지는 오른쪽.
//   ⚠ **쓴 돈(재산)은 화면에 보여 주지 않는다**(시안) — 단계가 오르면 그림이 바뀌는 것으로만 안다.
import { useMemo, useRef, useState } from 'react'
import { getChar } from '../../data/roster'
import { getRelic, type Rarity } from '../../game/relics'
import {
  GOBLIN_LOOT, advanceFloor, currentEnemy, buyGoblinItem, goblinMonsterId, goblinTier, regionOf, rollGoblinShop,
  replaceCandidates, runCard, type GoblinItem, type GoblinTier, type RunState,
} from '../../game/run'
import { RangeChart } from '../CardFace'
import { useCardZoom } from '../CardDetail'
import { DeckPicker } from '../DeckPicker'
import { RARITY_LABEL, RelicIcon } from '../RelicIcon'
import { Opts, Purse } from './InnScreen'

const TIER: Record<GoblinTier, { name: string; tag: string; look: string; line: string; stars: string; style: string; deck: string[]; q: number; qTxt: string }> = {
  poor: { name: '가난한 고블린', tag: 'POOR', look: '해진 두건 망토 · 맨발 · 등짐', line: '"헤헤… 오늘 첫 손님이야. 싸게, 아주 싸게 줄게. 제발 사 줘."', stars: '★☆☆', style: '도망치며 던짐', deck: ['돌팔매', '국자 후려치기'], q: 0, qTxt: '능력 없음 — 맨몸이다' },
  mid: { name: '중간 고블린', tag: 'TRADER', look: '동그란 안경 · 조끼 · 회중시계', line: '"오, 또 왔네 단골! 덕분에 옷도 새로 맞췄지. 이번엔 물건이 좀 된다고."', stars: '★★☆', style: '붙어서 벤다', deck: ['언월도 베기', '찌르기', '가드'], q: 1, qTxt: '상시 능력 1개' },
  rich: { name: '부자 고블린', tag: 'TYCOON', look: '모피 코트 · 금잔 · 왕좌 · 시종들', line: '"흐흐, 자네 덕에 왕좌까지 샀다네. 이 몸의 진짜 물건을 보여 주지 — 값은 좀 나가."', stars: '★★★', style: '돈으로 버틴다', deck: ['지팡이 후려치기', '금화 뿌리기', '방패 밀치기', '버티기'], q: 3, qTxt: '능력 3개 · 엘리트급' },
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
  const [cheering, setCheering] = useState(false)
  // 단계가 오를 때 그림을 겹쳐 넘긴다 — 밑에 깔 이전 단계 그림 · 다시 뛰는 키.
  const [prevTier, setPrevTier] = useState<GoblinTier | null>(null)
  const [flip, setFlip] = useState(0)
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
    setCheering(true)
    window.setTimeout(() => setCheering(false), 1400)
    if (after !== before) {
      setPrevTier(before)
      setFlip((n) => n + 1)
      setToast(after === 'rich' ? '왕좌까지 샀다 — 부자 고블린이 됐다!' : '돈맛을 봤다 — 중간 고블린이 됐다!')
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
        <h2 className="shop__title">덱의 그 칸이 가득 찼습니다 — 바꿀 카드를 고르세요</h2>
        <DeckPicker charId={cur.charId} deck={pending.kind === 'card' ? replaceCandidates(cur, pending.cardId) : cur.deck} zoom={zoom} onPick={(id) => buy(pending, id)} cardOf={(id) => runCard(cur, id)} />
        <button className="btn btn--ghost" onClick={() => setPending(null)}>
          취소
        </button>
        {zoom.sheet}
      </div>
    )

  const fightTitle = t.name + (tier === 'rich' ? '이 왕좌에서 일어난다' : '이 짐을 내려놓는다')
  const line = phase === 'fight' ? FIGHT_LINE[tier] : cheering ? '"헤헤, 고맙수다! 짤랑짤랑~"' : t.line

  return (
    <div className="screen gob">
      <div className={`artbg artbg--fill artbg--goblin-${tier}`} aria-hidden="true" />
      {prevTier && <div className={`artbg artbg--goblin-${prevTier}`} aria-hidden="true" />}
      <div
        key={flip}
        className={`artbg artbg--goblin-${tier} ${prevTier ? 'gob__bgin' : ''}`}
        role="img"
        aria-label={t.name}
      />
      <i className="inn__veil" aria-hidden="true" />
      <header className="shop__head">
        <div className="shop__where">
          <h1 className="shop__title">고블린 상점</h1>
          <span className="gob__where">
            ? 칸 · {regionOf(cur.floor) === 'grassland' ? '초원' : '던전'} · {cur.floor}층
          </span>
        </div>
        <Purse run={cur} />
      </header>
      {toast && (
        <div className="gob__toast">
          <i className="coin" aria-hidden />
          {toast}
        </div>
      )}

      <section className="inn__say gob__say" key={`${phase}-${tier}-${cheering}`}>
        <div className="inn__name">
          <b className={`gob__tag gob__tag--${tier}`}>{t.name}</b>
          <span>{t.look}</span>
        </div>
        <p>{line}</p>
      </section>

      {phase === 'meet' && (
        <Opts
          opts={[
            { label: '거래한다', sub: `진열 ${stock.length}개 · 값은 물건마다 정가 ×0.8~1.5 · 떠날 때까지 진열 그대로`, onTap: () => setPhase('trade') },
            {
              label: '덮친다',
              sub: `이기면 ${lootTxt(tier).join(' + ')} · 다음 고블린 상점은 가난부터`,
              chip: `전투 ${t.stars} · HP ${foe.maxHp}`,
              tone: 'fight',
              onTap: () => setPhase('fight'),
            },
            { label: '그냥 지나간다', sub: '아무 일 없이 지도로 돌아간다', tone: 'mute', onTap: () => onDone(advanceFloor(cur)) },
          ]}
        />
      )}

      {phase === 'trade' && (
        <section className="gob__panel rise">
          {stock.map((it) => {
            const owned = bought.has(it.id)
            const poor = cur.gold < it.price
            const card = it.kind === 'card' ? runCard(cur, it.cardId) : null
            const relic = it.kind === 'relic' ? getRelic(it.relicId) : null
            const tone = it.mul < 1 ? 'cheap' : it.mul >= 1.3 ? 'dear' : 'mid'
            return (
              <div key={it.id} className={`gob__row ${owned ? 'is-owned' : ''} ${relic?.rarity === 'legend' ? 'is-legend' : ''}`}>
                <span className="gob__thumb" {...(card ? zoom.bind(card) : {})}>
                  {relic && <RelicIcon id={relic.id} />}
                  {card && <RangeChart card={card} />}
                  {it.kind === 'heal' && <i className="item__potion" aria-hidden />}
                </span>
                <span className="gob__info">
                  <span className="gob__iname">
                    {card?.name ?? relic?.name ?? `물약 · HP +${it.kind === 'heal' ? it.amount : 0}`}
                    {relic && <em className={`relictip__rarity is-${relic.rarity as Rarity}`}>{RARITY_LABEL[relic.rarity]}</em>}
                    {card && <em className="relictip__rarity is-common">카드</em>}
                    {it.kind === 'heal' && <em className="relictip__rarity is-potion">소모품</em>}
                  </span>
                  <span className="gob__idesc">{card?.desc ?? relic?.desc ?? '체력을 회복한다.'}</span>
                </span>
                <span className="gob__mul">
                  <i className={`chip gob__mulchip is-${tone}`}>
                    ×{it.mul.toFixed(1)} {mulTag(it.mul)}
                  </i>
                  {it.mul !== 1 && !owned && <s>정가 {it.base}</s>}
                </span>
                <button type="button" className={`gob__buy ${owned || poor ? 'is-off' : ''}`} onClick={() => buy(it)}>
                  {owned ? (
                    '판매 완료'
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
            <span className="gob__note">진열 · 값은 떠날 때까지 그대로</span>
            <button type="button" className="upg__go" onClick={() => onDone(advanceFloor(cur))}>
              떠나기 ▶
            </button>
          </div>
        </section>
      )}

      {phase === 'fight' && (
        <section className="gob__panel gob__panel--fight rise">
          <div className="gob__tradehead">
            <h2>
              <span className="gob__kicker is-red">AMBUSH</span>
              {fightTitle}
            </h2>
            <span>일반 전투와 같은 화면 · 빈 판</span>
          </div>
          <dl className="gob__stats">
            <div><dt>체력</dt><dd className="is-red">{foe.maxHp}</dd></div>
            <div><dt>시작 기력</dt><dd className="is-blue">{foe.startEnergy}</dd></div>
            <div><dt>강함</dt><dd className="is-gold">{t.stars}</dd></div>
            <div><dt>성격</dt><dd className="is-text">{t.style}</dd></div>
          </dl>
          <div className="gob__line">
            <span>내는 카드</span>
            {t.deck.map((d) => <i key={d} className="chip chip--hp">{d}</i>)}
          </div>
          <div className="gob__line">
            <span>고유 능력</span>
            {Array.from({ length: t.q }, (_, i) => <i key={i} className="gob__q">?</i>)}
            <small>{t.qTxt} · 처음 발동할 때 공개</small>
          </div>
          <div className="gob__line gob__loot">
            <span>이기면</span>
            {lootTxt(tier).map((l) => <i key={l} className="chip chip--gold">{l}</i>)}
            <i className="chip chip--item">다음 고블린은 가난부터</i>
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
