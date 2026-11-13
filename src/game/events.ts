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
import { RELIC_BY_ID } from './relics'
import {
  GOBLIN_LOOT, cardRewardPool, grantCard, needsReplaceFor, slotOfId, grantGoblinItem, grantRelic, healHp, isLockedCard, loseHp, loseMaxHp, loseRelic,
  removeCard, rollRelicId, upgradableDeckCards, type RunState, type SpecialFight,
} from './run'
import { WORLDTREE_CARD } from './runcards'

export type EventId =
  | 'forge' | 'trade' | 'spring' | 'apothecary' | 'jar' | 'gacha' | 'mole' | 'surgery'
  | 'spirit' | 'egg' | 'worldtree' | 'phoenix'

export interface EventDef {
  id: EventId
  code: string
  name: string
  /** chain = 단계마다 다음 선택지가 이어지는 이벤트(타오르는 알 · 불사조). */
  mode: 'once' | 'repeat' | 'battle' | 'chain'
  /**
   * `public/<file>.png`의 원본 크기 — 화면엔 `scale`배(기본 3). `file`은 `redesign/ui/events/` 기준.
   * ⚠ 사슬 이벤트 4종은 그림이 아직 없어 지도 아이콘 `?`를 임시로 쓴다(PROGRESS 2-bis).
   */
  art: { file: string; w: number; h: number; frames: number; frameMs?: number; scale?: number }
  text: string
  /** 사슬 이벤트의 단계별 본문(`step`번째). 없으면 `text`. */
  steps?: string[]
}

const SEED = 'seed'
const FIRE_EGG = 'fireegg'
const NUTRIENT = 'nutrient'
const WORLD_BRANCH = 'worldtree' // 유물 id는 옛 「세계수 가지」 그대로(그림이 그 id에 붙어 있다)
const PHOENIX_FEATHER = 'phoenixfeather'
const EGG_COST = [0, 10, 15, 20] // 단계별 HP 대가(0단계는 오히려 +5)
const EGG_WARM = 5
const PHOENIX_CAVE_COST = 20
const PLACEHOLDER_ART = { file: '../map-icons/unknown', w: 14, h: 14, frames: 1, scale: 8 }

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
  // --- 이벤트 사슬(2026-11-09 사용자 기획): 정령 → 씨앗 → 세계수 / 알 → 불사조 -----------
  { id: 'spirit', code: 'EV-SPIRIT', name: '초록 정령', mode: 'battle', art: PLACEHOLDER_ART,
    text: '숲속에 들어서니 초록색 정령들이 늑대들의 위협을 받고 있다.\n도와주겠습니까?' },
  { id: 'egg', code: 'EV-EGG', name: '따뜻한 바람', mode: 'chain', art: PLACEHOLDER_ART,
    text: '숲속에 들어서니 어울리지 않는 따뜻한 바람이 불어온다.\n가까이 다가가겠습니까?',
    steps: [
      '숲속에 들어서니 어울리지 않는 따뜻한 바람이 불어온다.\n가까이 다가가겠습니까?',
      '이제는 따뜻하다 못해 뜨거워진다.\n계속 나아가겠습니까?',
      '점점 다가갈수록 더 뜨거워진다.\n계속 나아가겠습니까?',
      '화르르 타오르고 있는 알을 발견했다.\n가져오겠습니까?',
    ] },
  { id: 'worldtree', code: 'EV-WORLDTREE', name: '세계수', mode: 'chain', art: PLACEHOLDER_ART,
    text: '어디선가 나타난 초록 정령들이 자꾸만 나를 어디론가 끌어당긴다. 마치 따라오라는 것 같다.\n따라가니 광활한 평야와 함께 너무 아름다운 풍경이 펼쳐졌다. 나도 모르게 손에는 씨앗이 들려 있다.',
    steps: [
      '어디선가 나타난 초록 정령들이 자꾸만 나를 어디론가 끌어당긴다. 마치 따라오라는 것 같다.\n따라가니 광활한 평야와 함께 너무 아름다운 풍경이 펼쳐졌다. 나도 모르게 손에는 씨앗이 들려 있다.',
      '씨앗이 움트더니 눈 깜짝할 새 어린 나무가 되었다.\n가지 끝에서 빛나는 잎 한 장이 내려온다.',
    ] },
  { id: 'phoenix', code: 'EV-PHOENIX', name: '불사조', mode: 'chain', art: PLACEHOLDER_ART,
    text: '화산에 오르다 숨겨져 있는 동굴을 발견했다.\n내부가 매우 뜨거워서 화상을 입을 것 같다.',
    steps: [
      '화산에 오르다 숨겨져 있는 동굴을 발견했다.\n내부가 매우 뜨거워서 화상을 입을 것 같다.',
      '동굴 안에는 거대한 불이 계속 타오르고 있다.\n가까이 다가가 보니 전설의 동물 불사조가 쳐다보고 있었다.',
    ] },
]
export const eventDef = (id: EventId): EventDef => EVENT_DEFS.find((e) => e.id === id)!
/** 지금 단계의 본문. */
export const eventText = (st: EventState): string => {
  const d = eventDef(st.id)
  // 마지막 단계를 지나면(알을 얻은 뒤 등) 마지막 본문을 그대로 둔다.
  return d.steps ? d.steps[Math.min(st.step, d.steps.length - 1)] : d.text
}

/**
 * 이 런에서 지금 나올 수 있는가 — 사슬 이벤트만 조건이 있다(나머지 8종은 언제나).
 * **1막(초원) = 정령 · 알, 2막(던전) = 세계수(씨앗이 있을 때) · 불사조**(2026-11-12 사용자 지정 — 예전엔 10층 경계).
 * 이미 끝을 본 사슬은 다시 안 나온다.
 * ⚠ 불사조는 기획상 "화산 지형에서만"인데 지금은 화산 지역이 없어 층 조건만 건다 — 화산이 생기면 여기에 더한다.
 */
export function eventEligible(run: RunState, id: EventId): boolean {
  const has = (r: string) => run.relicIds.includes(r)
  const early = run.act <= 1
  switch (id) {
    case 'spirit': return early && !has(SEED) && !has(WORLD_BRANCH)
    case 'egg': return early && !has(FIRE_EGG) && !has(PHOENIX_FEATHER)
    case 'worldtree': return !early && has(SEED)
    case 'phoenix': return !early && !has(PHOENIX_FEATHER)
    default: return true
  }
}

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
  /** 사슬 이벤트의 단계(0부터). */
  step: number
}

const pickOne = <T>(a: readonly T[], rng: () => number): T => a[Math.floor(rng() * a.length)]

/**
 * 이벤트 하나를 연다. `id`가 없으면 무작위 — `run`을 넘기면 **지금 나올 수 있는 것**
 * (`eventEligible`) 중에서, 안 넘기면 조건 없는 8종 중에서 고른다.
 */
export function startEvent(id?: EventId, rng: () => number = Math.random, run?: RunState): EventState {
  const fx: PotionFx[] = ['heal', 'hurt', 'none']
  for (let i = fx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[fx[i], fx[j]] = [fx[j], fx[i]]
  }
  const pool = EVENT_DEFS.filter((e) => (run ? eventEligible(run, e.id) : !e.steps && e.id !== 'spirit'))
  // 한 런 안에서는 겹치지 않는다(2026-11-12 사용자 지정) — 나올 수 있는 걸 다 봤을 때만 다시 섞는다.
  const fresh = pool.filter((e) => !run?.seenEvents?.includes(e.id))
  return { id: id ?? pickOne(fresh.length ? fresh : pool, rng).id, potions: fx, tries: 0, fails: 0, prizes: ['heal', 'relic'], step: 0 }
}

/**
 * ? 칸의 정체 — **전부 같은 확률**(2026-11-12 사용자 지정: "일반 몬스터 전투 or 여관, 대장간, 그 외 여러
 * 이벤트들이 모두 같은 확률로"). 후보 = 전투 · 여관 · 대장간 · 고블린 상점 + 지금 나올 수 있는 이벤트 하나하나.
 * 이벤트는 한 런 안에서 겹치지 않는다(다 봤으면 다시 섞는다). 모닥불은 없다.
 */
export type QuestionFate =
  | { kind: 'combat' | 'inn' | 'smith' | 'goblin' }
  | { kind: 'event'; eventId: EventId }
export function questionFates(run: RunState): QuestionFate[] {
  const eligible = EVENT_DEFS.filter((e) => eventEligible(run, e.id))
  const fresh = eligible.filter((e) => !run.seenEvents?.includes(e.id))
  return [
    { kind: 'combat' },
    { kind: 'inn' },
    { kind: 'smith' },
    { kind: 'goblin' },
    ...(fresh.length ? fresh : eligible).map((e) => ({ kind: 'event' as const, eventId: e.id })),
  ]
}
export const rollQuestionFate = (run: RunState, rng: () => number = Math.random): QuestionFate => pickOne(questionFates(run), rng)

/** 이 이벤트를 만났다고 런에 적는다 — 이벤트 화면이 열리자마자(그냥 떠나도 본 것이다). */
export const withEventSeen = (run: RunState, id: EventId): RunState =>
  run.seenEvents?.includes(id) ? run : { ...run, seenEvents: [...(run.seenEvents ?? []), id] }

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
  /** 고른 뒤 고를 게 더 있다(거래 · 덱이 꽉 찼을 때 카드 받기). */
  pick?: 'card' | 'relic'
  leave?: boolean
}
const item = (text: string): CostChip => ({ kind: 'item', text })

const gold = (n: number): CostChip => ({ kind: 'gold', text: `${n}G` })
const hp = (n: number): CostChip => ({ kind: 'hp', text: `HP -${n}` })

/** 거래에서 내줄 수 있는 것 — 잠긴 이동 4장은 빼고(직업 패시브는 애초에 유물이 아니다). */
export function tradeList(run: RunState, what: 'card' | 'relic'): string[] {
  return what === 'card'
    ? run.deck.filter((id) => !isLockedCard(id))
    : run.relicIds
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
    case 'spirit':
      return [
        { key: 'help', label: '네 — 늑대들과 싸운다', cost: [] },
        { key: 'leave', label: '아니요', cost: [], leave: true },
      ]
    case 'egg':
      return [
        { key: 'egg-go', label: st.step < 3 ? (st.step === 0 ? '네 — 다가간다' : '네 — 계속 나아간다') : '네 — 알을 가져온다', cost: st.step ? [hp(EGG_COST[st.step])] : [] },
        { key: 'leave', label: '아니오', cost: [], leave: true },
      ]
    case 'worldtree': {
      if (st.step === 1) {
        // 받을지 말지는 플레이어가 고른다. 덱이 꽉 찼으면 한 장과 바꾼다.
        const full = needsReplaceFor(run, WORLDTREE_CARD)
        return [
          { key: 'wt-take', label: '「세계수의 가호」를 받는다', cost: [], pick: full ? 'card' : undefined, sub: full ? '덱이 꽉 찼다 — 한 장과 바꾼다' : undefined },
          { key: 'leave', label: '두고 간다', cost: [], leave: true },
        ]
      }
      const hasNutrient = run.relicIds.includes(NUTRIENT)
      return [
        { key: 'wt-plant', label: '땅에 심는다', cost: [item(relicName(SEED))] },
        hasNutrient
          ? { key: 'wt-water', label: '땅에 심고 영양분을 뿌린다', cost: [item(relicName(SEED)), item(relicName(NUTRIENT))], hidden: 'open', sub: `히든 · 「${relicName(NUTRIENT)}」이 있어서 열렸다` }
          : { key: 'wt-water', label: '???', cost: [], hidden: 'locked', sub: '잠겨 있다 — 무언가 필요해 보인다', off: '잠김' },
        { key: 'leave', label: '그냥 간다', cost: [], leave: true },
      ]
    }
    case 'phoenix': {
      if (st.step === 0) {
        const immune = run.relicIds.includes(FIRE_EGG)
        return [
          { key: 'ph-enter', label: '들어간다', cost: immune ? [] : [hp(PHOENIX_CAVE_COST)], sub: immune ? `「${relicName(FIRE_EGG)}」이 열기를 막아 준다` : undefined },
          { key: 'leave', label: '들어가지 않는다', cost: [], leave: true },
        ]
      }
      const hasEgg = run.relicIds.includes(FIRE_EGG)
      return [
        hasEgg
          ? { key: 'ph-give', label: '타오르는 알을 건넨다', cost: [item(relicName(FIRE_EGG))], hidden: 'open', sub: `히든 · 「${relicName(FIRE_EGG)}」이 있어서 열렸다` }
          : { key: 'ph-give', label: '???', cost: [], hidden: 'locked', sub: '잠겨 있다 — 무언가 필요해 보인다', off: '잠김' },
        // 불사조 보스는 추후 개발(사용자 기획) — 그때까지 자리만 보여 준다.
        { key: 'ph-fight', label: '불사조와 싸운다', cost: [], off: '아직 열리지 않았다' },
        { key: 'leave', label: '돌아 나온다', cost: [], leave: true },
      ]
    }
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

/** 유물 하나를 받는 결과. 받을 유물이 없으면 그걸로 끝 — 대체 보상 없음(2026-11-13 사용자 지정). */
function gainRelic(run: RunState, st: EventState, pool: RelicPool, title: string, done = true, rng = Math.random): EventOutcome {
  const id = relicFromPool(run, pool, rng)
  if (!id) return { run, st, title, body: '더 받을 유물이 없다.', big: '—', bigKind: 'none', done }
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
      // 받는 카드는 **내준 카드와 같은 칸**(공격 / 보조 / 이동)에서 — 그래야 자리가 있다(덱 상한은 칸마다 5장).
      const slot = slotOfId(run, pickId!)
      const id = pickOne(cardRewardPool(gone).filter((x) => x !== pickId && slotOfId(run, x) === slot), rng)
      if (!id) return { run, st, title: '거래 무산', body: '마땅한 카드가 없다며 고개를 저었다.', big: '—', bigKind: 'none', done: true }
      return { run: grantCard(gone, id).run, st, title: '거래 성사', body: '내 카드를 내주고 다른 카드를 받았다.', cardId: id, done: true }
    }
    case 'card-relic':
      return gainRelic(removeCard(run, pickId!), st, 'any', '거래 성사', true, rng)
    case 'relic-relic': {
      const id = rollRelicId(run) // 내주는 유물은 아직 갖고 있으니 같은 걸 돌려받을 일이 없다
      const gone = loseRelic(run, pickId!)
      if (!id) return { run: gone, st, title: '거래 성사', body: '유물을 건넸지만 돌아온 건 없다.', big: '—', bigKind: 'none', done: true }
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
    // --- 초록 정령 — 엘리트 늑대와 싸운다. 이기면 「의문의 씨앗」(`applySpecialWin`)
    case 'help':
      return { run, st, title: '늑대들이 이빨을 드러낸다!', body: '정령들을 등 뒤에 두고 늑대 무리와 맞선다.', done: true,
        fight: { kind: 'spirit', monsterId: 'wolf', elite: true } }
    // --- 따뜻한 바람 — "네"를 누를 때마다 다음 단계. 마지막에 알
    case 'egg-go': {
      const next = { ...st, step: st.step + 1 }
      if (st.step === 0) return { run: healHp(run, EGG_WARM), st: next, title: '포근하다', body: '따뜻한 바람이 몸을 감싼다.', big: `HP +${EGG_WARM}`, bigKind: 'gain', done: false }
      const cost = EGG_COST[st.step]
      const hurt = loseHp(run, cost)
      if (st.step < 3) return { run: hurt, st: next, title: '살갗이 따끔거린다', body: '열기가 점점 세진다.', big: `HP -${cost}`, bigKind: 'cost', done: false }
      return { run: grantRelic(hurt, FIRE_EGG), st: next, title: '알을 품에 안았다', body: `손이 데었지만 「${relicName(FIRE_EGG)}」을 얻었다. (HP -${cost})`, relicId: FIRE_EGG, done: true }
    }
    // --- 세계수
    case 'wt-plant':
      return { run: loseRelic(run, SEED), st: { ...st, step: 1 }, title: '씨앗을 심었다', body: '빛나는 잎이 카드가 되어 손에 내려앉으려 한다.', cardId: WORLDTREE_CARD, done: false }
    case 'wt-take': {
      const got = grantCard(run, WORLDTREE_CARD, pickId)
      return { run: got.run, st, title: '세계수의 가호', body: '잎이 카드가 되어 덱에 들어왔다.', cardId: WORLDTREE_CARD, done: true }
    }
    case 'wt-water': {
      const r = grantRelic(loseRelic(loseRelic(run, SEED), NUTRIENT), WORLD_BRANCH)
      return { run: r, st, title: '세계수가 깨어났다', body: `영양가루를 먹은 나무가 하늘까지 자라 가지 하나를 내주었다. 「${relicName(WORLD_BRANCH)}」을 얻었다.`, relicId: WORLD_BRANCH, done: true }
    }
    // --- 불사조
    case 'ph-enter': {
      const immune = run.relicIds.includes(FIRE_EGG)
      const next = { ...st, step: 1 }
      if (immune) return { run, st: next, title: '열기가 비켜 간다', body: `품속의 「${relicName(FIRE_EGG)}」이 뜨거움을 막아 주었다.`, big: 'HP -0', bigKind: 'none', done: false }
      return { run: loseHp(run, PHOENIX_CAVE_COST), st: next, title: '살이 익는 것 같다', body: '숨이 턱 막히는 열기 속으로 들어섰다.', big: `HP -${PHOENIX_CAVE_COST}`, bigKind: 'cost', done: false }
    }
    case 'ph-give': {
      const r = grantRelic(loseRelic(run, FIRE_EGG), PHOENIX_FEATHER)
      return { run: r, st, title: '불사조가 알을 품었다', body: `불사조가 고개를 숙이더니 깃털 하나를 떨어뜨렸다. 「${relicName(PHOENIX_FEATHER)}」을 얻었다.`, relicId: PHOENIX_FEATHER, done: true }
    }
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
  if (sp?.kind === 'spirit') {
    // 초록 정령 — 늑대를 쫓아내면 정령들이 씨앗을 건넨다.
    return { ...grantRelic(run, SEED), special: { ...sp, wonRelicId: SEED } }
  }
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
