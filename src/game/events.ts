// ---------------------------------------------------------------------------
// ? 이벤트 8종(2026-11 리디자인) — 규칙 `docs/redesign/EVENTS.md` · 데이터 `events.json`.
//
// 공통 규칙:
//   ① 선택지에는 **대가만** 보인다. 결과는 고른 뒤에 처음 공개된다.
//   ② 히든 선택지는 조건 전까지 자물쇠 + ??? 로 잠근다(무엇이 필요한지 말하지 않는다).
//   ③ 반복 이벤트(약방 · 갓챠 · 두더지)는 결과 뒤 "계속하기". 나가기로 끝낸다.
//   ④ 확률은 화면에 안 보인다.
//
// 순수 로직이다 — 화면(`EventScreen`)과 밸런스 시뮬(`simrun.ts`)이 같은 걸 쓴다.
// ---------------------------------------------------------------------------
import { RELIC_BY_ID, signatureRelicId } from './relics'
import {
  GOBLIN_LOOT, cardRewardPool, grantCard, grantGoblinItem, grantRelic, healHp, isLockedCard, loseHp, loseMaxHp, loseRelic,
  removeCard, rollRelicId, upgradableDeckCards, type RunState, type SpecialFight,
} from './run'

export type EventId = 'forge' | 'trade' | 'spring' | 'apothecary' | 'jar' | 'gacha' | 'mole' | 'surgery'

export interface EventDef {
  id: EventId
  code: string
  name: string
  mode: 'once' | 'repeat' | 'battle'
  /** `public/redesign/ui/events/<file>.png` — 화면엔 ×4. */
  art: { file: string; w: number; h: number; frames: number; frameMs?: number }
  text: string
}

export const EVENT_DEFS: EventDef[] = [
  { id: 'forge', code: 'EV-FORGE', name: '낡은 대장간', mode: 'once', art: { file: 'forge', w: 64, h: 52, frames: 6, frameMs: 110 },
    text: '빈 대장간을 발견했다.\n신기하게 불은 꺼질 생각을 하지 않는다.' },
  { id: 'trade', code: 'EV-TRADE', name: '거래', mode: 'once', art: { file: 'trader', w: 52, h: 60, frames: 1 },
    text: '"그 물건 탐나는군요. 저와 거래하실래요?"\n누군가가 거래를 요청했다.' },
  { id: 'spring', code: 'EV-SPRING', name: '온천', mode: 'once', art: { file: 'hotspring', w: 76, h: 48, frames: 4, frameMs: 225 },
    text: '김이 모락모락 나는 아주 뜨끈한 온천을 발견했다.\n당장 쉬고 싶어진다.' },
  { id: 'apothecary', code: 'EV-APOTHECARY', name: '약방', mode: 'repeat', art: { file: 'apothecary', w: 72, h: 60, frames: 1 },
    text: '엄청나게 많은 약들이 있는 약방에 들어섰다.\n의문의 남자가 약 3가지를 보여 준다.' },
  { id: 'jar', code: 'EV-JAR', name: '항아리', mode: 'battle', art: { file: 'jar', w: 48, h: 52, frames: 1 },
    text: '어둡고 매우 습한 동굴에 들어왔다.\n눈앞에 항아리 하나가 떡하니 있다. 열어 보겠습니까?' },
  { id: 'gacha', code: 'EV-GACHA', name: '갓챠', mode: 'repeat', art: { file: 'gacha', w: 52, h: 68, frames: 2, frameMs: 450 },
    text: '반짝반짝 거리는 가게에 들어서니, 돈을 넣으면 무언가를 집을 수 있을 것 같은 기계가 있다.\n해 보겠습니까?' },
  { id: 'mole', code: 'EV-MOLE', name: '두더지', mode: 'repeat', art: { file: 'mole', w: 64, h: 44, frames: 4, frameMs: 225 },
    text: '반짝거리는 걸 들고 땅으로 들어가는 두더지를 발견했다.\n잡을까요?' },
  { id: 'surgery', code: 'EV-SURGERY', name: '수술실', mode: 'once', art: { file: 'surgery', w: 72, h: 56, frames: 1 },
    text: '누군가는 강해지기 위해, 누군가는 아름다워지기 위해 이곳을 찾죠.\n당신은 무엇을 위해 이곳에 왔나요?' },
]
export const eventDef = (id: EventId): EventDef => EVENT_DEFS.find((e) => e.id === id)!

/** 이벤트가 "○○ 관련 유물"을 줄 때의 풀(이미 있는 유물에 태그를 단 것). */
export const RELIC_POOLS = {
  iron: ['plating', 'ironshoes', 'buckler', 'ironwill', 'towershield', 'bulwark', 'thorns'],
  poison: ['venomflask', 'toxinvial', 'witchbrew'],
  heart: ['heart', 'oxheart', 'titanheart', 'emberheart'],
  hand: ['frostbite', 'punisher', 'midastouch', 'chainshock'],
  foot: ['ironshoes', 'anchorstone', 'skywalk'],
} as const
export type RelicPool = keyof typeof RELIC_POOLS | 'any'

const COLD_IRON = 'coldiron'
const POTION_PRICE = 50
const GACHA_PRICE = 50
const MOLE_BASE_HP = 10
const MOLE_HP_STEP = 3

type PotionFx = 'heal' | 'hurt' | 'none'
/** 진행 중인 이벤트 하나의 상태(반복 이벤트의 확률·대가가 여기서 자란다). */
export interface EventState {
  id: EventId
  /** 약방 — 세 병의 효과(방문마다 섞인다). */
  potions: PotionFx[]
  /** 갓챠 — 넣은 횟수 · 마지막 당첨 뒤 실패 수 · 남은 상품. 두더지 — 판 횟수. */
  tries: number
  fails: number
  prizes: ('heal' | 'relic')[]
}

const pickOne = <T>(a: readonly T[], rng: () => number): T => a[Math.floor(rng() * a.length)]

export function startEvent(id?: EventId, rng: () => number = Math.random): EventState {
  const fx: PotionFx[] = ['heal', 'hurt', 'none']
  for (let i = fx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[fx[i], fx[j]] = [fx[j], fx[i]]
  }
  return { id: id ?? pickOne(EVENT_DEFS, rng).id, potions: fx, tries: 0, fails: 0, prizes: ['heal', 'relic'] }
}

/** 대가 칩 — 골드(금) · HP(빨강) · 최대 HP(분홍) · 카드/유물(회색). */
export interface CostChip { kind: 'gold' | 'hp' | 'maxhp' | 'item'; text: string }
export interface EventChoice {
  key: string
  label: string
  cost: CostChip[]
  /** 약방의 병 그림(`potion-N`). */
  icon?: string
  /** 아래 줄 설명(갓챠 횟수 · 히든 열린 이유 …). */
  sub?: string
  /** 히든 — 'locked' = 아직 잠김(??? 로 그린다) · 'open' = 조건을 채워 열렸다. */
  hidden?: 'locked' | 'open'
  /** 지금 못 고르는 이유(골드 부족 …). */
  off?: string
  /** 고른 뒤 고를 게 더 있다(거래). */
  pick?: 'card' | 'relic'
  leave?: boolean
}

const gold = (n: number): CostChip => ({ kind: 'gold', text: `${n}G` })
const hp = (n: number): CostChip => ({ kind: 'hp', text: `HP -${n}` })

/** 거래에서 내줄 수 있는 것 — 잠긴 이동 4장 · 시그니처 유물은 빼고. */
export function tradeList(run: RunState, what: 'card' | 'relic'): string[] {
  return what === 'card'
    ? run.deck.filter((id) => !isLockedCard(id))
    : run.relicIds.filter((id) => id !== signatureRelicId(run.charId))
}

export function eventChoices(run: RunState, st: EventState): EventChoice[] {
  const leave: EventChoice = { key: 'leave', label: '나간다', cost: [], leave: true }
  switch (st.id) {
    case 'forge': {
      const hasIron = run.relicIds.includes(COLD_IRON)
      return [
        { key: 'hammer', label: '카드라도 두들긴다', cost: [], off: upgradableDeckCards(run).length ? undefined : '강화할 카드가 없다' },
        { key: 'iron', label: '주변에 쇠라도 챙긴다', cost: [], off: hasIron ? '이미 챙겼다' : undefined },
        hasIron
          ? { key: 'swap', label: '쇠를 두들긴다', cost: [], hidden: 'open', sub: '히든 · 「차가운 쇠」가 있어서 열렸다' }
          : { key: 'swap', label: '???', cost: [], hidden: 'locked', sub: '잠겨 있다 — 무언가 필요해 보인다', off: '잠김' },
      ]
    }
    case 'trade': {
      const cards = tradeList(run, 'card').length
      const relics = tradeList(run, 'relic').length
      return [
        { key: 'card-card', label: '내 카드 한 장 ↔ 다른 카드', cost: [{ kind: 'item', text: '카드 1장' }], pick: 'card', off: cards ? undefined : '내줄 카드가 없다' },
        { key: 'card-relic', label: '내 카드 한 장 ↔ 유물', cost: [{ kind: 'item', text: '카드 1장' }], pick: 'card', off: cards ? undefined : '내줄 카드가 없다' },
        { key: 'relic-relic', label: '내 유물 하나 ↔ 다른 유물', cost: [{ kind: 'item', text: '유물 1개' }], pick: 'relic', off: relics ? undefined : '내줄 유물이 없다' },
      ]
    }
    case 'spring':
      return [{ key: 'rest', label: '휴식', cost: [] }]
    case 'apothecary': {
      const poor = run.gold < POTION_PRICE ? '골드 부족' : undefined
      return [
        ...['빨강', '초록', '보라'].map((c, i) => ({ key: `potion-${i}`, label: `약(${c})`, cost: [gold(POTION_PRICE)], icon: `potion-${i}`, off: poor })),
        leave,
      ]
    }
    case 'jar':
      return [
        { key: 'open', label: '연다', cost: [] },
        { key: 'leave', label: '건드리지 않는다', cost: [], leave: true },
      ]
    case 'gacha':
      return [
        {
          key: 'coin', label: '돈 넣기', cost: [gold(GACHA_PRICE)],
          sub: `넣은 횟수 ${st.tries} · 남은 상품 ${st.prizes.length}개${st.fails >= 3 ? ' · 기계가 조금 헐거워진 것 같다' : ''}`,
          off: run.gold < GACHA_PRICE ? '골드 부족' : undefined,
        },
        { key: 'leave', label: '나가기', cost: [], leave: true },
      ]
    case 'mole':
      return [
        { key: 'dig', label: '땅 파기', cost: [hp(MOLE_BASE_HP + MOLE_HP_STEP * st.tries)], sub: st.tries ? '다시 파면 더 힘들다' : undefined },
        { key: 'leave', label: '가던 길 가기', cost: [], leave: true },
      ]
    case 'surgery':
      return [
        { key: 'heart', label: '심장', cost: [{ kind: 'maxhp', text: '최대 HP -10' }] },
        { key: 'hand', label: '손', cost: [hp(15)] },
        { key: 'foot', label: '발', cost: [hp(15)] },
      ]
  }
}

/** 결과 패널. `done`이면 지도로, 아니면(반복) 계속하기. */
export interface EventOutcome {
  run: RunState
  st: EventState
  title: string
  body: string
  /** 큰 숫자(HP +20 …). */
  big?: string
  bigKind?: 'gain' | 'cost' | 'none'
  relicId?: string
  cardId?: string
  done: boolean
  /** 룰렛 강화 화면으로(낡은 대장간). */
  upgrade?: boolean
  /** 이벤트가 연 전투(항아리). */
  fight?: SpecialFight
}

/** 풀에서 미보유 유물 하나. 풀을 다 가졌으면 아무 유물이나. */
export function relicFromPool(run: RunState, pool: RelicPool, rng: () => number = Math.random): string | undefined {
  if (pool !== 'any') {
    const left = RELIC_POOLS[pool].filter((id) => RELIC_BY_ID[id] && !run.relicIds.includes(id))
    if (left.length) return pickOne(left, rng)
  }
  return rollRelicId(run)
}
const relicName = (id: string) => RELIC_BY_ID[id]?.name ?? id

/** 유물 하나를 받는 결과(다 가졌으면 소량 회복). */
function gainRelic(run: RunState, st: EventState, pool: RelicPool, title: string, done = true, rng = Math.random): EventOutcome {
  const id = relicFromPool(run, pool, rng)
  if (!id) return { run: healHp(run, 20), st, title, body: '더 받을 유물이 없다 — 대신 숨을 돌렸다.', big: 'HP +20', bigKind: 'gain', done }
  return { run: grantRelic(run, id), st, title, body: `「${relicName(id)}」을(를) 얻었다.`, relicId: id, done }
}

/**
 * 선택지 적용. 거래는 `pickId`(내줄 카드·유물)가 있어야 한다 — 없으면 null.
 * 못 고르는 선택지(`off`)·나가기는 화면이 먼저 걸러야 한다(여기선 null).
 */
export function resolveEventChoice(
  run: RunState,
  st: EventState,
  key: string,
  pickId?: string,
  rng: () => number = Math.random,
): EventOutcome | null {
  const c = eventChoices(run, st).find((x) => x.key === key)
  if (!c || c.off || c.leave) return null
  if (c.pick && !pickId) return null
  switch (key) {
    // --- 낡은 대장간
    case 'hammer':
      return { run, st, title: '망치를 들었다', body: '카드 한 장을 골라 두들긴다.', done: true, upgrade: true }
    case 'iron':
      return { run: grantRelic(run, COLD_IRON), st, title: '차가운 쇠를 챙겼다', body: `「${relicName(COLD_IRON)}」을(를) 얻었다.`, relicId: COLD_IRON, done: true }
    case 'swap':
      return gainRelic(loseRelic(run, COLD_IRON), st, 'iron', '쇠를 두들겼다', true, rng)
    // --- 거래 — 받을 것은 고르기 전엔 안 보인다
    case 'card-card': {
      const gone = removeCard(run, pickId!)
      const id = pickOne(cardRewardPool(gone).filter((x) => x !== pickId), rng)
      return { run: grantCard(gone, id).run, st, title: '거래 성사', body: '내 카드를 내주고 다른 카드를 받았다.', cardId: id, done: true }
    }
    case 'card-relic':
      return gainRelic(removeCard(run, pickId!), st, 'any', '거래 성사', true, rng)
    case 'relic-relic': {
      const id = rollRelicId(run) // 내주는 유물은 아직 갖고 있으니 같은 걸 돌려받을 일이 없다
      const gone = loseRelic(run, pickId!)
      if (!id) return { run: healHp(gone, 20), st, title: '거래 성사', body: '마땅한 물건이 없다며 약을 건넸다.', big: 'HP +20', bigKind: 'gain', done: true }
      return { run: grantRelic(gone, id), st, title: '거래 성사', body: `「${relicName(id)}」을(를) 받았다.`, relicId: id, done: true }
    }
    // --- 온천
    case 'rest': {
      const n = Math.round(run.maxHp * 0.3)
      return { run: healHp(run, n), st, title: '몸이 녹는다', body: '뜨끈한 물에 몸을 담갔다.', big: `HP +${n}`, bigKind: 'gain', done: true }
    }
    // --- 약방
    case 'potion-0':
    case 'potion-1':
    case 'potion-2': {
      const paid = { ...run, gold: run.gold - POTION_PRICE }
      const fx = st.potions[Number(key.slice(-1))]
      if (fx === 'heal') return { run: healHp(paid, 20), st, title: '몸이 가벼워졌다', body: '쓴맛 뒤로 상처가 아문다.', big: 'HP +20', bigKind: 'gain', done: false }
      if (fx === 'hurt') return { run: loseHp(paid, 10), st, title: '속이 뒤집힌다', body: '이건 약이 아니었다.', big: 'HP -10', bigKind: 'cost', done: false }
      return { run: paid, st, title: '…아무 일도 없다', body: '맹물이었던 걸까.', big: '—', bigKind: 'none', done: false }
    }
    // --- 항아리
    case 'open':
      if (rng() < 0.5)
        return {
          run, st, title: '항아리에서 뱀이 튀어나왔다!', body: '독니에 물렸다 — 중독된 채로 싸운다.', done: true,
          fight: { kind: 'jar', monsterId: 'snake', startPoison: 2 },
        }
      return { run, st, title: '텅 비어 있다', body: '습기만 가득하다.', done: true }
    // --- 갓챠 — 10%에서 시작해 실패마다 +10%, 당첨되면 10%로
    case 'coin': {
      const paid = { ...run, gold: run.gold - GACHA_PRICE }
      const tries = st.tries + 1
      if (rng() >= 0.1 + 0.1 * st.fails)
        return { run: paid, st: { ...st, tries, fails: st.fails + 1 }, title: '꽝', body: '집게가 헛손질했다.', big: '—', bigKind: 'none', done: false }
      const prize = pickOne(st.prizes, rng)
      const prizes = st.prizes.filter((p) => p !== prize)
      const next = { ...st, tries, fails: 0, prizes }
      const allDone = !prizes.length
      if (prize === 'heal')
        return { run: healHp(paid, 25), st: next, title: '당첨!', body: allDone ? '물약이 굴러 나왔다. 다 뽑은 것 같다…' : '물약이 굴러 나왔다.', big: 'HP +25', bigKind: 'gain', done: allDone }
      const o = gainRelic(paid, next, 'any', '당첨!', allDone, rng)
      return allDone ? { ...o, body: `${o.body} 다 뽑은 것 같다…` } : o
    }
    // --- 두더지 — 30%에서 시작해 실패마다 +10%, 대가는 10 → 13 → 16 …
    case 'dig': {
      const cost = MOLE_BASE_HP + MOLE_HP_STEP * st.tries
      const hurt = loseHp(run, cost)
      const next = { ...st, tries: st.tries + 1 }
      if (rng() < 0.3 + 0.1 * st.tries) return gainRelic(hurt, next, 'any', '잡았다!', true, rng)
      return { run: hurt, st: next, title: '놓쳤다', body: '두더지가 더 깊이 파고들었다.', big: `HP -${cost}`, bigKind: 'cost', done: false }
    }
    // --- 수술실
    case 'heart':
      return gainRelic(loseMaxHp(run, 10), st, 'heart', '수술 끝', true, rng)
    case 'hand':
      return gainRelic(loseHp(run, 15), st, 'hand', '수술 끝', true, rng)
    case 'foot':
      return gainRelic(loseHp(run, 15), st, 'foot', '수술 끝', true, rng)
  }
  return null
}

/**
 * 이벤트가 연 전투를 이겼을 때의 덤 — 항아리 뱀은 `poison` 유물 하나.
 * `afterWin` 뒤에 부른다(App · 시뮬 공용). 받은 유물은 `special.wonRelicId`에 남겨
 * 보상 화면이 띄운다.
 */
export function applySpecialWin(run: RunState, rng: () => number = Math.random): RunState {
  const sp = run.special
  if (sp?.kind === 'jar') {
    const id = relicFromPool(run, 'poison', rng)
    return id ? { ...grantRelic(run, id), special: { ...sp, wonRelicId: id } } : run
  }
  if (sp?.kind === 'goblin') {
    // 고블린 습격 — 골드 + 전리품, 그리고 재산이 0으로(다음 고블린은 가난부터).
    const loot = GOBLIN_LOOT[sp.goblinTier ?? 'poor']
    let r: RunState = { ...run, gold: run.gold + loot.gold, goblinSpent: 0 }
    const won: { wonItemId?: string; wonRelicId?: string } = {}
    if (!loot.pick) {
      const ok = (sp.goblinStock ?? []).filter((it) => !grantGoblinItem(r, it).needsReplace)
      if (ok.length) {
        const it = pickOne(ok, rng)
        r = grantGoblinItem(r, it).run
        won.wonItemId = it.id
      }
    }
    if (loot.relic) {
      const id = rollRelicId(r)
      if (id) {
        r = grantRelic(r, id)
        won.wonRelicId = id
      }
    }
    return { ...r, special: { ...sp, ...won } }
  }
  return run
}
