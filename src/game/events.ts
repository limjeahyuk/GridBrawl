// ---------------------------------------------------------------------------
// ? 이벤트 8종 (2026-11 리디자인 · 기획 docs/redesign/EVENTS.md · 데이터 events.json)
//
// 공통 규칙(모든 이벤트):
//   ① 선택지에는 **대가만** 보인다. 결과는 고른 뒤에 처음 공개된다.
//   ② 히든 선택지는 조건을 채우기 전까지 `???`로 잠겨 있고, 무엇이 필요한지 말하지 않는다.
//   ③ 반복 이벤트(약방·갓챠·두더지)는 결과 뒤 "계속하기" — 나가기를 고르거나 끝나는
//      조건을 채우면 나간다.
//   ④ 확률은 화면에 안 보인다(분위기 문구로만).
//
// 화면(`EventScreen`)과 시뮬(`scripts/simrun.ts`)이 같은 함수를 쓴다 — 결과 계산은 전부
// 여기 있고, 화면은 고르기·연출만 한다.
// ---------------------------------------------------------------------------
import {
  cardRewardPool,
  grantCard,
  grantRandomRelic,
  grantRelic,
  grantRelicFromPool,
  healHp,
  isLockedCard,
  loseHp,
  loseMaxHp,
  removeCard,
  removeRelic,
  rollRelicId,
  startEventFight,
  tradableRelics,
  upgradableDeckCards,
  type RunState,
} from './run'

export type EventId =
  | 'EV-FORGE'
  | 'EV-TRADE'
  | 'EV-SPRING'
  | 'EV-APOTHECARY'
  | 'EV-JAR'
  | 'EV-GACHA'
  | 'EV-MOLE'
  | 'EV-SURGERY'

/** 이벤트가 "○○ 관련 유물"을 줄 때의 풀(이미 있는 유물에 태그를 단 것). */
export const RELIC_POOLS: Readonly<Record<string, readonly string[]>> = {
  iron: ['plating', 'ironshoes', 'buckler', 'ironwill', 'towershield', 'bulwark', 'thorns'],
  poison: ['venomflask', 'toxinvial', 'witchbrew'],
  heart: ['heart', 'oxheart', 'titanheart', 'emberheart'],
  hand: ['frostbite', 'punisher', 'midastouch', 'chainshock'],
  foot: ['ironshoes', 'anchorstone', 'skywalk'],
}

export interface EventArt {
  src: string
  w: number
  h: number
  frames: number
  frameMs?: number
}

export interface EventDef {
  id: EventId
  name: string
  repeat: boolean
  text: string
  art: EventArt
}

const art = (name: string, w: number, h: number, frames = 1, frameMs?: number): EventArt => ({
  src: `/redesign/ui/events/${name}.png`,
  w,
  h,
  frames,
  frameMs,
})

export const EVENT_DEFS: readonly EventDef[] = [
  { id: 'EV-FORGE', name: '대장장이', repeat: false, art: art('forge', 64, 52, 6, 110),
    text: '빈 대장간을 발견했다.\n신기하게 불은 꺼질 생각을 하지 않는다.' },
  { id: 'EV-TRADE', name: '거래', repeat: false, art: art('trader', 52, 60),
    text: '"그 물건 탐나는군요. 저와 거래하실래요?"\n누군가가 거래를 요청했다.' },
  { id: 'EV-SPRING', name: '온천', repeat: false, art: art('hotspring', 76, 48, 4, 225),
    text: '김이 모락모락 나는 아주 뜨끈한 온천을 발견했다.\n당장 쉬고 싶어진다.' },
  { id: 'EV-APOTHECARY', name: '약방', repeat: true, art: art('apothecary', 72, 60),
    text: '엄청나게 많은 약들이 있는 약방에 들어섰다.\n의문의 남자가 약 3가지를 보여 준다.' },
  { id: 'EV-JAR', name: '항아리', repeat: false, art: art('jar', 48, 52),
    text: '어둡고 매우 습한 동굴에 들어왔다.\n눈앞에 항아리 하나가 떡하니 있다. 열어 보겠습니까?' },
  { id: 'EV-GACHA', name: '갓챠', repeat: true, art: art('gacha', 52, 68, 2, 450),
    text: '반짝반짝 거리는 가게에 들어서니, 돈을 넣으면 무언가를 집을 수 있을 것 같은 기계가 있다.\n해 보겠습니까?' },
  { id: 'EV-MOLE', name: '두더지', repeat: true, art: art('mole', 64, 44, 4, 225),
    text: '반짝거리는 걸 들고 땅으로 들어가는 두더지를 발견했다.\n잡을까요?' },
  { id: 'EV-SURGERY', name: '수술실', repeat: false, art: art('surgery', 72, 56),
    text: '누군가는 강해지기 위해, 누군가는 아름다워지기 위해 이곳을 찾죠.\n당신은 무엇을 위해 이곳에 왔나요?' },
]
export const EVENT_BY_ID: Readonly<Record<EventId, EventDef>> = Object.fromEntries(
  EVENT_DEFS.map((e) => [e.id, e]),
) as Record<EventId, EventDef>

// --- 수치 — "시안에서 임의로 정한 것"은 여기 모은다 ------------------------
export const SPRING_HEAL_PCT = 30
export const POTION_PRICE = 50
export const POTION_HEAL = 20
export const POTION_HURT = 10
export const JAR_FIGHT_CHANCE = 0.5
export const JAR_POISON_ROUNDS = 2
export const GACHA_PRICE = 50
export const GACHA_HEAL = 25
export const GACHA_START_P = 0.1
export const GACHA_STEP_P = 0.1
export const MOLE_START_COST = 10
export const MOLE_COST_STEP = 3
export const MOLE_START_P = 0.3
export const MOLE_STEP_P = 0.1
export const SURGERY_MAXHP = 10
export const SURGERY_HP = 15

type Potion = 'heal' | 'hurt' | 'none'
type Prize = 'heal' | 'relic'

/** 이벤트 한 번 방문의 상태(반복 이벤트의 확률·남은 상품 등). 화면/시뮬이 들고 다닌다. */
export interface EventSession {
  id: EventId
  /** 약방 세 병의 효과 — 방문할 때마다 섞인다. */
  potions: Potion[]
  gachaP: number
  gachaLeft: Prize[]
  moleP: number
  moleCost: number
  tries: number
  /** 이 방문이 끝났다(지도로 돌아간다). */
  over: boolean
}

const shuffle = <T>(a: T[], rng: () => number): T[] => {
  const out = a.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function openEvent(id: EventId, rng: () => number = Math.random): EventSession {
  return {
    id,
    potions: shuffle<Potion>(['heal', 'hurt', 'none'], rng),
    gachaP: GACHA_START_P,
    gachaLeft: ['heal', 'relic'],
    moleP: MOLE_START_P,
    moleCost: MOLE_START_COST,
    tries: 0,
    over: false,
  }
}

/** 이번 ? 칸의 이벤트 — 이번 런에 아직 안 본 것 중에서(다 봤으면 아무거나). */
export function rollEventId(run: RunState, rng: () => number = Math.random): EventId {
  const fresh = EVENT_DEFS.filter((e) => !run.seenEvents?.includes(e.id))
  const pool = fresh.length ? fresh : EVENT_DEFS
  return pool[Math.floor(rng() * pool.length)].id
}
export const markEventSeen = (run: RunState, id: EventId): RunState =>
  run.seenEvents?.includes(id) ? run : { ...run, seenEvents: [...(run.seenEvents ?? []), id] }

// --- 선택지 -----------------------------------------------------------------
/** 대가 칩 — 화면에 보이는 건 이것뿐이다. */
export interface EventCost {
  gold?: number
  hp?: number
  maxHp?: number
  card?: number
  relic?: number
}

export interface EventChoice {
  key: string
  label: string
  icon?: string
  cost?: EventCost
  /** 히든 — 조건을 못 채워 잠김(라벨은 `???`로 그린다). */
  locked?: boolean
  /** 히든인데 조건을 채워 열렸다 — "○○이 있어서 열렸다". */
  unlockedBy?: string
  /** 지금은 못 고르는 이유(골드 부족 등). */
  disabled?: string
  /** 나가기 선택지. */
  leave?: boolean
}

export function eventChoices(run: RunState, s: EventSession): EventChoice[] {
  const gold = (n: number): Pick<EventChoice, 'cost' | 'disabled'> => ({
    cost: { gold: n },
    disabled: run.gold < n ? '골드가 모자라다' : undefined,
  })
  const tradeCards = run.deck.filter((id) => !isLockedCard(id))
  switch (s.id) {
    case 'EV-FORGE': {
      const hasIron = run.relicIds.includes('coldiron')
      return [
        { key: 'upgrade', label: '카드라도 두들긴다',
          disabled: upgradableDeckCards(run).length ? undefined : '두들길 카드가 없다' },
        { key: 'iron', label: '주변에 쇠라도 챙긴다' },
        hasIron
          ? { key: 'smith', label: '쇠를 두들긴다', cost: { relic: 1 }, unlockedBy: '차가운 쇠가' }
          : { key: 'smith', label: '???', locked: true },
      ]
    }
    case 'EV-TRADE':
      return [
        { key: 'card-card', label: '내 카드 한 장 ↔ 다른 카드', cost: { card: 1 },
          disabled: tradeCards.length ? undefined : '내놓을 카드가 없다' },
        { key: 'card-relic', label: '내 카드 한 장 ↔ 유물', cost: { card: 1 },
          disabled: tradeCards.length ? undefined : '내놓을 카드가 없다' },
        { key: 'relic-relic', label: '내 유물 하나 ↔ 다른 유물', cost: { relic: 1 },
          disabled: tradableRelics(run).length ? undefined : '내놓을 유물이 없다' },
      ]
    case 'EV-SPRING':
      return [{ key: 'rest', label: '휴식' }]
    case 'EV-APOTHECARY':
      return [
        ...[0, 1, 2].map((i) => ({ key: `potion-${i}`, label: '약', icon: `/redesign/ui/events/potion-${i}.png`, ...gold(POTION_PRICE) })),
        { key: 'leave', label: '나간다', leave: true },
      ]
    case 'EV-JAR':
      return [
        { key: 'open', label: '연다' },
        { key: 'leave', label: '건드리지 않는다', leave: true },
      ]
    case 'EV-GACHA':
      return [
        { key: 'coin', label: '돈 넣기', ...gold(GACHA_PRICE) },
        { key: 'leave', label: '나가기', leave: true },
      ]
    case 'EV-MOLE':
      return [
        { key: 'dig', label: '땅 파기', cost: { hp: s.moleCost } },
        { key: 'leave', label: '가던 길 가기', leave: true },
      ]
    case 'EV-SURGERY':
      return [
        { key: 'heart', label: '심장', cost: { maxHp: SURGERY_MAXHP } },
        { key: 'hand', label: '손', cost: { hp: SURGERY_HP } },
        { key: 'foot', label: '발', cost: { hp: SURGERY_HP } },
      ]
  }
}

// --- 결과 -------------------------------------------------------------------
export interface EventOutcome {
  run: RunState
  session: EventSession
  /** 결과 패널 문구. 없으면 아직 고르는 중(`need`). */
  text?: string
  relicId?: string
  lostRelicId?: string
  cardId?: string
  lostCardId?: string
  /** 화면이 무엇을 더 받아야 하는가 — 카드 고르기 · 유물 고르기 · 룰렛 강화 화면. */
  need?: 'card' | 'relic' | 'upgrade'
  /** 전투로 넘어갔다(`run.status === 'fighting'`). */
  fight?: boolean
}

const done = (s: EventSession, repeat: boolean, force = false): EventSession =>
  ({ ...s, over: force || !repeat })

/**
 * 선택지 적용. 카드·유물을 골라야 하는 선택지는 `pick` 없이 부르면 `need`를 돌려준다
 * (대가는 고른 뒤에 치른다 — 순서를 뒤집으면 못 고르고 대가만 낸다).
 */
export function chooseEvent(
  run: RunState,
  s: EventSession,
  key: string,
  pick: { cardId?: string; relicId?: string } = {},
  rng: () => number = Math.random,
): EventOutcome {
  const def = EVENT_BY_ID[s.id]
  const choice = eventChoices(run, s).find((c) => c.key === key)
  if (!choice || choice.locked || choice.disabled) return { run, session: s }
  if (choice.leave) return { run, session: done(s, false, true), text: '발걸음을 돌렸다.' }
  const once = done(s, def.repeat)

  switch (s.id) {
    case 'EV-FORGE': {
      if (key === 'upgrade') return { run, session: done(s, false), need: 'upgrade' }
      if (key === 'iron') {
        const had = run.relicIds.includes('coldiron')
        const r = had ? grantRandomRelic(run) : { run: grantRelic(run, 'coldiron'), relicId: 'coldiron' }
        return { run: r.run, session: once, relicId: r.relicId, text: '쓸 만한 쇳조각을 챙겼다.' }
      }
      const r = grantRelicFromPool(removeRelic(run, 'coldiron'), RELIC_POOLS.iron)
      return { run: r.run, session: once, relicId: r.relicId, lostRelicId: 'coldiron',
        text: '쇠를 두들기자 전혀 다른 물건이 됐다.' }
    }
    case 'EV-TRADE': {
      if (key === 'relic-relic') {
        if (!pick.relicId || !tradableRelics(run).includes(pick.relicId)) return { run, session: s, need: 'relic' }
        const r = grantRandomRelicExcept(removeRelic(run, pick.relicId), pick.relicId)
        return { run: r.run, session: once, relicId: r.relicId, lostRelicId: pick.relicId, text: '"좋은 거래였어요."' }
      }
      if (!pick.cardId || isLockedCard(pick.cardId) || !run.deck.includes(pick.cardId)) {
        return { run, session: s, need: 'card' }
      }
      const without = removeCard(run, pick.cardId)
      if (key === 'card-relic') {
        const r = grantRandomRelic(without)
        return { run: r.run, session: once, relicId: r.relicId, lostCardId: pick.cardId, text: '"좋은 거래였어요."' }
      }
      const pool = cardRewardPool(without).filter((id) => id !== pick.cardId)
      const cardId = pool[Math.floor(rng() * pool.length)]
      const next = cardId ? grantCard(without, cardId).run : without
      return { run: next, session: once, cardId, lostCardId: pick.cardId, text: '"좋은 거래였어요."' }
    }
    case 'EV-SPRING':
      return { run: healHp(run, Math.round((run.maxHp * SPRING_HEAL_PCT) / 100)), session: once,
        text: '몸이 노곤하게 풀렸다.' }
    case 'EV-APOTHECARY': {
      const potion = s.potions[Number(key.split('-')[1])]
      const paid = { ...run, gold: run.gold - POTION_PRICE }
      const session = { ...s, tries: s.tries + 1 }
      if (potion === 'heal') return { run: healHp(paid, POTION_HEAL), session, text: '몸이 한결 가벼워졌다.' }
      if (potion === 'hurt') return { run: loseHp(paid, POTION_HURT), session, text: '속이 뒤집힌다…' }
      return { run: paid, session, text: '아무 맛도 나지 않는다.' }
    }
    case 'EV-JAR': {
      if (rng() < JAR_FIGHT_CHANCE) {
        const next = startEventFight(run, 'snake', [...RELIC_POOLS.poison], JAR_POISON_ROUNDS)
        return { run: next, session: done(s, false, true), fight: true,
          text: '항아리에서 독이 오른 뱀이 튀어나와 물었다!' }
      }
      return { run, session: once, text: '텅 비어 있다.' }
    }
    case 'EV-GACHA': {
      const paid = { ...run, gold: run.gold - GACHA_PRICE }
      const tries = s.tries + 1
      if (rng() >= s.gachaP) {
        return { run: paid, session: { ...s, tries, gachaP: Math.min(1, s.gachaP + GACHA_STEP_P) },
          text: '아깝다! 기계가 조금 헐거워진 것 같다.' }
      }
      const prize = s.gachaLeft[Math.floor(rng() * s.gachaLeft.length)]
      const gachaLeft = s.gachaLeft.filter((p) => p !== prize)
      const session = { ...s, tries, gachaP: GACHA_START_P, gachaLeft, over: !gachaLeft.length }
      const tail = gachaLeft.length ? '' : '\n다 뽑은 것 같다…'
      if (prize === 'heal') return { run: healHp(paid, GACHA_HEAL), session, text: `회복약이 굴러 나왔다!${tail}` }
      const r = grantRandomRelic(paid)
      return { run: r.run, session, relicId: r.relicId, text: `무언가 반짝이는 게 걸려 나왔다!${tail}` }
    }
    case 'EV-MOLE': {
      const hurt = loseHp(run, s.moleCost)
      const tries = s.tries + 1
      if (rng() < s.moleP) {
        const r = grantRandomRelic(hurt)
        return { run: r.run, session: { ...s, tries, over: true }, relicId: r.relicId, text: '잡았다! 두더지가 물건을 떨어뜨리고 달아났다.' }
      }
      return {
        run: hurt,
        session: { ...s, tries, moleP: Math.min(1, s.moleP + MOLE_STEP_P), moleCost: s.moleCost + MOLE_COST_STEP },
        text: '놓쳤다… 다시 파면 더 힘들 것 같다.',
      }
    }
    case 'EV-SURGERY': {
      if (key === 'heart') {
        const r = grantRelicFromPool(loseMaxHp(run, SURGERY_MAXHP), RELIC_POOLS.heart)
        return { run: r.run, session: once, relicId: r.relicId, text: '가슴 속에서 무언가 힘차게 뛴다.' }
      }
      const r = grantRelicFromPool(loseHp(run, SURGERY_HP), RELIC_POOLS[key])
      return { run: r.run, session: once, relicId: r.relicId,
        text: key === 'hand' ? '손끝에 낯선 힘이 감돈다.' : '발걸음이 달라졌다.' }
    }
  }
}

/** 방금 내놓은 유물이 그대로 돌아오지 않게 한다. */
function grantRandomRelicExcept(run: RunState, except: string): { run: RunState; relicId?: string } {
  for (let i = 0; i < 8; i++) {
    const id = rollRelicId(run)
    if (id && id !== except) return { run: grantRelic(run, id), relicId: id }
  }
  return grantRandomRelic(run)
}
