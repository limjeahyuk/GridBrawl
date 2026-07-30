// ---------------------------------------------------------------------------
// 몬스터 — 로그라이크 사다리에서 만나는 적. 지금은 1:1 전투라, 각 몬스터의
// 개성은 **덱 + 패시브 + AI 성격**으로 낸다(진짜 다인 전투는 Phase 2). 몬스터는
// 엔진에 넘길 합성 CharacterDef(monsterChar)를 만든다 — 아트는 baseArtId의
// ROSTER 캐릭터를 재활용하고, 이름·최대체력·패시브·덱은 몬스터 것으로 갈아끼운다.
// 상세 설계는 docs/ROGUELIKE.md ⑦.
// ---------------------------------------------------------------------------
import { COMMON_CARDS } from '../battle/cards'
import { getChar, ROSTER, type CharacterDef, type Passive } from '../data/roster'
import type { CardDef, Difficulty } from '../battle/types'

export interface MonsterDef {
  id: string
  name: string // 화면에 뜨는 이름(슬라임 등)
  baseArtId: string // 아트·색을 빌려올 ROSTER 캐릭터 id
  tier: number // 1이 가장 약함 — 층이 오를수록 높은 티어가 등장
  maxHp: number
  startEnergy: number
  aiLevel: Difficulty
  /** 몬스터 고유 상시 능력(인라인 패시브). 유물 시스템과 같은 훅을 쓴다. */
  passive: Omit<Passive, 'desc'>
  deckCardIds: string[] // AI가 낼 수 있는 카드
  note: string // 정체성 한 줄(보상/조우 안내용)
}

// 모든 카드(공용 + 전 캐릭터 고유)를 id로 조회 — 몬스터 덱 해석용.
const ALL_CARDS: CardDef[] = [...COMMON_CARDS, ...ROSTER.flatMap((c) => c.cards)]
const cardById = (id: string): CardDef | undefined => ALL_CARDS.find((c) => c.id === id)
const resolveCards = (ids: string[]): CardDef[] =>
  ids.map(cardById).filter((c): c is CardDef => !!c)

export const MONSTERS: MonsterDef[] = [
  {
    id: 'slime',
    name: '슬라임',
    baseArtId: 'cipher',
    tier: 1,
    maxHp: 55,
    startEnergy: 40,
    aiLevel: 'easy',
    passive: { revive: 25 }, // 분열: 쓰러지면 작은 몸으로 한 번 되살아난다
    deckCardIds: ['c-strike', 'c-shot', 'cipher-cut'],
    note: '분열: 쓰러지면 작은 몸으로 한 번 되살아난다.',
  },
  {
    id: 'grunt',
    name: '도끼병',
    baseArtId: 'titan',
    tier: 1,
    maxHp: 70,
    startEnergy: 50,
    aiLevel: 'easy',
    passive: {},
    deckCardIds: ['c-strike', 'titan-hammer', 'c-guard'],
    note: '평범한 근접 잡졸. 몸풀기 상대.',
  },
  {
    id: 'sentry',
    name: '센트리',
    baseArtId: 'nova',
    tier: 2,
    maxHp: 65,
    startEnergy: 60,
    aiLevel: 'normal',
    passive: { turnEnergy: 8 },
    deckCardIds: ['nova-lance', 'nova-blast', 'c-shot', 'c-guard'],
    note: '원거리 견제 + 가끔 방어. 접근을 강요당한다.',
  },
  {
    id: 'ogre',
    name: '오우거',
    baseArtId: 'titan',
    tier: 2,
    maxHp: 130,
    startEnergy: 50,
    aiLevel: 'normal',
    passive: { damageReduction: 6 },
    deckCardIds: ['titan-hammer', 'titan-crush', 'titan-ram', 'c-energy'],
    note: '느리지만 한 방이 무겁고, 넉백으로 떼어낸다.',
  },
  {
    id: 'berserker',
    name: '버서커',
    baseArtId: 'ember',
    tier: 2,
    maxHp: 60,
    startEnergy: 50,
    aiLevel: 'hard',
    passive: { attackBonus: 6 },
    deckCardIds: ['ember-blitz', 'ember-claw', 'c-strike'],
    note: '저체력 유리대포. 빨리 죽이지 않으면 이쪽이 터진다.',
  },
  {
    id: 'vampire',
    name: '뱀파이어',
    baseArtId: 'cipher',
    tier: 3,
    maxHp: 95,
    startEnergy: 50,
    aiLevel: 'hard',
    passive: { lifesteal: 8 },
    deckCardIds: ['cipher-siphon', 'cipher-cross', 'c-strike', 'c-brace'],
    note: '흡혈 지속 — 오래 끌수록 불리하다.',
  },
  {
    id: 'guardian',
    name: '가디언',
    baseArtId: 'aegis',
    tier: 3,
    maxHp: 120,
    startEnergy: 60,
    aiLevel: 'normal',
    passive: { turnShield: 15, damageReduction: 6 },
    deckCardIds: ['aegis-wall', 'aegis-bash', 'aegis-drive', 'c-energy'],
    note: '방벽을 세우고 한 방을 노린다. 뚫기 전엔 안 죽는다.',
  },
  {
    id: 'phantom',
    name: '팬텀',
    baseArtId: 'volt',
    tier: 3,
    maxHp: 80,
    startEnergy: 60,
    aiLevel: 'hard',
    passive: { turnEnergy: 8, regen: 4 },
    deckCardIds: ['cipher-cross', 'volt-leech', 'c-shot'],
    note: '십자·대각으로 교란하며 조금씩 아문다.',
  },
  {
    id: 'overlord',
    name: '오버로드',
    baseArtId: 'ember',
    tier: 4,
    maxHp: 200,
    startEnergy: 70,
    aiLevel: 'hard',
    passive: { turnEnergy: 15, turnShield: 10, damageReduction: 6, revive: 60 },
    deckCardIds: ['nova-flare', 'titan-slam', 'nova-blast', 'c-guard'],
    note: '보스 — 광역기·방벽·부활을 두른 복합 위협.',
  },
  // --- 확장 세트(2026-07-24) ---
  {
    id: 'bat',
    name: '박쥐 떼',
    baseArtId: 'volt',
    tier: 1,
    maxHp: 45,
    startEnergy: 50,
    aiLevel: 'easy',
    passive: { turnEnergy: 6 },
    deckCardIds: ['c-shot', 'volt-leech', 'c-jab'],
    note: '흩어져 쏘는 약한 무리. 물량으로 갉는다.',
  },
  {
    id: 'goblin',
    name: '고블린',
    baseArtId: 'ember',
    tier: 1,
    maxHp: 55,
    startEnergy: 45,
    aiLevel: 'easy',
    passive: {},
    deckCardIds: ['c-jab', 'c-strike', 'cipher-cut'],
    note: '재빠른 잡졸. 붙어서 찔러댄다.',
  },
  {
    id: 'crossbow',
    name: '석궁병',
    baseArtId: 'nova',
    tier: 2,
    maxHp: 70,
    startEnergy: 55,
    aiLevel: 'normal',
    passive: {},
    deckCardIds: ['nova-lance', 'c-shot', 'c-brace'],
    note: '거리를 벌리며 관통 화살을 쏜다.',
  },
  {
    id: 'shaman',
    name: '주술사',
    baseArtId: 'cipher',
    tier: 2,
    maxHp: 85,
    startEnergy: 55,
    aiLevel: 'normal',
    passive: { regen: 6 },
    deckCardIds: ['cipher-siphon', 'c-brace', 'c-repair'],
    note: '스스로 아물며 흡혈로 버틴다. 화력을 몰아쳐야 한다.',
  },
  {
    id: 'knight',
    name: '기사',
    baseArtId: 'aegis',
    tier: 2,
    maxHp: 100,
    startEnergy: 55,
    aiLevel: 'normal',
    passive: { turnShield: 10 },
    deckCardIds: ['titan-hammer', 'aegis-bash', 'c-guard'],
    note: '방패를 두른 정석 근접. 빈틈이 적다.',
  },
  {
    id: 'golem',
    name: '골렘',
    baseArtId: 'titan',
    tier: 3,
    maxHp: 160,
    startEnergy: 50,
    aiLevel: 'normal',
    passive: { damageReduction: 10, turnShield: 10 },
    deckCardIds: ['titan-crush', 'aegis-wall', 'titan-ram'],
    note: '거대한 바위 몸. 딜을 뚫기 전엔 꿈쩍도 안 한다.',
  },
  {
    id: 'assassin',
    name: '암살자',
    baseArtId: 'cipher',
    tier: 3,
    maxHp: 75,
    startEnergy: 60,
    aiLevel: 'hard',
    passive: { attackBonus: 8 },
    deckCardIds: ['cipher-cross', 'ember-blitz', 'c-strike'],
    note: '순식간에 파고들어 급소를 노린다.',
  },
  {
    id: 'witch',
    name: '마녀',
    baseArtId: 'nova',
    tier: 3,
    maxHp: 90,
    startEnergy: 65,
    aiLevel: 'hard',
    passive: { turnEnergy: 12 },
    deckCardIds: ['nova-blast', 'nova-lance', 'c-guard'],
    note: '화면 끝에서 광역 폭발을 퍼붓는다.',
  },
  {
    id: 'splitter',
    name: '분열체',
    baseArtId: 'cipher',
    tier: 3,
    maxHp: 85,
    startEnergy: 50,
    aiLevel: 'normal',
    passive: { revive: 45 },
    deckCardIds: ['cipher-cross', 'c-shot', 'c-strike'],
    note: '쓰러뜨려도 두 번은 죽여야 하는 끈질긴 개체.',
  },
  {
    id: 'warden',
    name: '수호기사',
    baseArtId: 'aegis',
    tier: 4,
    maxHp: 170,
    startEnergy: 65,
    aiLevel: 'hard',
    passive: { turnShield: 20, damageReduction: 8, turnEnergy: 8 },
    deckCardIds: ['aegis-drive', 'aegis-wall', 'aegis-bash'],
    note: '엘리트 — 방벽을 올렸다 열며 반격한다.',
  },
  {
    id: 'pyrelord',
    name: '화염군주',
    baseArtId: 'ember',
    tier: 4,
    maxHp: 180,
    startEnergy: 65,
    aiLevel: 'hard',
    passive: { attackBonus: 8, revive: 50, turnEnergy: 10 },
    deckCardIds: ['ember-inferno', 'ember-fan', 'ember-blitz'],
    note: '엘리트 — 불길을 모았다 인페르노로 폭발시킨다.',
  },
]

export const MONSTER_BY_ID: Record<string, MonsterDef> = Object.fromEntries(
  MONSTERS.map((m) => [m.id, m]),
)

export function getMonster(id: string): MonsterDef {
  const m = MONSTER_BY_ID[id]
  if (!m) throw new Error(`Unknown monster: ${id}`)
  return m
}

/** 티어별 몬스터 목록(사다리 구성용). 보스는 tier 4. */
export function monstersOfTier(tier: number): MonsterDef[] {
  return MONSTERS.filter((m) => m.tier === tier)
}

/** 몬스터를 엔진용 CharacterDef로 — 아트는 baseArtId 재활용, 스탯은 몬스터 것. */
export function monsterChar(m: MonsterDef): CharacterDef {
  const base = getChar(m.baseArtId)
  return {
    ...base,
    name: m.name,
    maxHp: m.maxHp,
    startEnergy: m.startEnergy,
    passive: { desc: m.note, ...m.passive },
    cards: resolveCards(m.deckCardIds),
  }
}

export function monsterDeck(m: MonsterDef): CardDef[] {
  return resolveCards(m.deckCardIds)
}

export function monsterPassive(m: MonsterDef): Passive {
  return { desc: m.note, ...m.passive }
}
