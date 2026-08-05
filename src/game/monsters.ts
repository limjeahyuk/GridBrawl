// ---------------------------------------------------------------------------
// 몬스터 — 로그라이크 사다리에서 만나는 적. 지금은 1:1 전투라, 각 몬스터의
// 개성은 **덱 + 패시브 + AI 성격**으로 낸다(진짜 다인 전투는 Phase 2). 몬스터는
// 엔진에 넘길 합성 CharacterDef(monsterChar)를 만든다 — 아트는 baseArtId의
// ROSTER 캐릭터를 재활용하고, 이름·최대체력·패시브·덱은 몬스터 것으로 갈아끼운다.
// 상세 설계는 docs/ROGUELIKE.md ⑦.
// ---------------------------------------------------------------------------
import { COMMON_CARDS } from '../battle/cards'
import { getChar, ROSTER, type CharacterDef, type Passive } from '../data/roster'
import { BOSS_CARDS } from './bosscards'
import type { Archetype } from '../battle/ai'
import type { CardDef, Difficulty } from '../battle/types'

export interface MonsterDef {
  id: string
  name: string // 화면에 뜨는 이름(슬라임 등)
  baseArtId: string // 색·기본 스탯을 빌려올 ROSTER 캐릭터 id
  /**
   * 이 몬스터 전용 스프라이트 시트(`SHEETS` 키). 비우면 `baseArtId`의 직업 시트를
   * 빌려 쓴다 — 20종이 직업 그림 3개를 돌려쓰던 상태의 잔재라, 채울수록 좋다.
   */
  spriteId?: string
  tier: number // 1이 가장 약함 — 층이 오를수록 높은 티어가 등장
  maxHp: number
  startEnergy: number
  aiLevel: Difficulty
  /**
   * AI 성격(2026-08-05). 같은 종류의 몬스터가 매번 똑같이 움직이던 걸 가른다 —
   * 돌격/카이팅/거북이/교란. 비우면 `balanced`(조정 없음). 상세는 ai.ts `Archetype`.
   * ⚠ 보스는 `bosses.ts` 스크립트가 우선이라 이 값은 스크립트가 비는 턴에만 쓰인다.
   */
  behavior?: Archetype
  /** 몬스터 고유 상시 능력(인라인 패시브). 유물 시스템과 같은 훅을 쓴다. */
  passive: Omit<Passive, 'desc'>
  deckCardIds: string[] // AI가 낼 수 있는 카드
  note: string // 정체성 한 줄(보상/조우 안내용)
}

// 모든 카드(공용 + 전 캐릭터 고유 + 보스 전용)를 id로 조회 — 몬스터 덱 해석용.
// ⚠ 보스 전용 카드(`bosscards.ts`)는 **여기서만** 풀에 들어간다. 플레이어 쪽
// 해석기(`decks.ts`의 `deckFor` · `runbattle.ts`의 런 덱)는 이 목록을 쓰지 않으므로
// 보스 카드가 덱 빌더·보상에 새어 나가지 않는다.
const ALL_CARDS: CardDef[] = [
  ...COMMON_CARDS,
  ...ROSTER.flatMap((c) => c.cards),
  ...BOSS_CARDS,
]
const cardById = (id: string): CardDef | undefined => ALL_CARDS.find((c) => c.id === id)
const resolveCards = (ids: string[]): CardDef[] =>
  ids.map(cardById).filter((c): c is CardDef => !!c)

export const MONSTERS: MonsterDef[] = [
  {
    id: 'slime',
    behavior: 'balanced',
    name: '슬라임',
    baseArtId: 'archer',
    spriteId: 'slime',
    tier: 1,
    maxHp: 48,
    startEnergy: 40,
    aiLevel: 'easy',
    passive: { revive: 25 }, // 분열: 쓰러지면 작은 몸으로 한 번 되살아난다
    deckCardIds: ['c-strike', 'c-shot', 'war-cleave'],
    note: '분열: 쓰러지면 작은 몸으로 한 번 되살아난다.',
  },
  {
    id: 'grunt',
    behavior: 'rusher',
    name: '도끼병',
    baseArtId: 'warrior',
    spriteId: 'rat',
    tier: 1,
    maxHp: 60,
    startEnergy: 50,
    aiLevel: 'easy',
    passive: {},
    // 2026-07-31: 시작 덱이 공용 기본 9장으로 줄면서 해머 핸드(29)를 든 1층 잡졸이
    // 실제로 런을 끝냈다(1~2층 사망 8%). "몸풀기"라는 정체성에 맞게 약공만 남겼다.
    deckCardIds: ['c-strike', 'c-jab', 'c-guard'],
    note: '평범한 근접 잡졸. 몸풀기 상대.',
  },
  {
    id: 'sentry',
    behavior: 'kiter',
    // 2026-08-05: '센트리'(포탑)는 사이버 시절 이름이었다 — 그림이 떠 있는 눈이라
    // 이름을 거기 맞췄다. id는 저장 상태·문서가 물고 있어 그대로 둔다.
    name: '감시안',
    baseArtId: 'mage',
    spriteId: 'flying-eye',
    tier: 2,
    maxHp: 80,
    startEnergy: 60,
    aiLevel: 'normal',
    // 2026-07-30 밸런스: 노바 블래스트(40, 같은 줄 끝까지)를 뺐다. tier2가 매 턴
    // 광역 주포를 쏘니 4~7층에서 가장 많이 죽이는 몬스터가 됐다(시뮬 승률 68%,
    // 2.8턴 결판). 관통 랜스로 견제하는 원래 정체성에 맞추고 체력을 올려 오래 버틴다.
    passive: { turnEnergy: 8 },
    deckCardIds: ['arc-shot', 'c-shot', 'c-guard'],
    note: '원거리 견제 + 가끔 방어. 접근을 강요당한다.',
  },
  {
    id: 'ogre',
    behavior: 'balanced',
    name: '오우거',
    baseArtId: 'warrior',
    spriteId: 'ogre',
    tier: 2,
    maxHp: 112,
    startEnergy: 50,
    aiLevel: 'normal',
    passive: { damageReduction: 6 },
    deckCardIds: ['war-cleave', 'war-quake', 'war-bash', 'c-energy'],
    note: '느리지만 한 방이 무겁고, 넉백으로 떼어낸다.',
  },
  {
    id: 'berserker',
    behavior: 'rusher',
    name: '버서커',
    baseArtId: 'mage',
    spriteId: 'martial-hero',
    tier: 2,
    maxHp: 60,
    startEnergy: 50,
    aiLevel: 'hard',
    passive: { attackBonus: 6 },
    deckCardIds: ['arc-pin', 'war-cleave', 'c-strike'],
    note: '저체력 유리대포. 빨리 죽이지 않으면 이쪽이 터진다.',
  },
  {
    id: 'vampire',
    behavior: 'balanced',
    name: '뱀파이어',
    baseArtId: 'archer',
    spriteId: 'mimic',
    tier: 3,
    maxHp: 115,
    startEnergy: 60,
    aiLevel: 'hard',
    // 2026-07-30 밸런스: tier3 후반 몬스터인데 체력 95 + 저댐 덱이라 시뮬 승률 99%,
    // 플레이어가 오히려 체력을 15 벌어가는 샌드백이었다. 흡혈 정체성을 세게 굴린다.
    // attackBonus는 **한 방의 크기**를 키운다 — 후반 플레이어는 보호막·피해감소를
    // 겹쳐 쌓아서, 잔챙이 타격 여러 번보다 큰 한 방이 아니면 뚫리지 않는다(시뮬).
    passive: { lifesteal: 12, attackBonus: 6 },
    deckCardIds: ['mag-frost', 'mag-spark', 'arc-rain', 'c-brace'],
    note: '흡혈 지속 — 오래 끌수록 불리하다.',
  },
  {
    id: 'guardian',
    behavior: 'turtle',
    name: '가디언',
    baseArtId: 'warrior',
    spriteId: 'angel',
    tier: 3,
    maxHp: 120,
    startEnergy: 60,
    aiLevel: 'normal',
    passive: { turnShield: 15, damageReduction: 6 },
    deckCardIds: ['war-wall', 'war-bash', 'war-oath', 'c-energy'],
    note: '방벽을 세우고 한 방을 노린다. 뚫기 전엔 안 죽는다.',
  },
  {
    id: 'phantom',
    behavior: 'skirmisher',
    name: '팬텀',
    baseArtId: 'warrior',
    spriteId: 'bat',
    tier: 3,
    maxHp: 100,
    startEnergy: 60,
    aiLevel: 'hard',
    // 2026-07-30 밸런스: 십자·대각 교란은 좋았지만 화력이 없어 그냥 지나가는 층이었다
    // (시뮬 승률 100%). 약한 견제기(10)를 아픈 카드(30)로 바꿔 실제로 위협이 되게.
    passive: { turnEnergy: 10, regen: 6, attackBonus: 6 },
    deckCardIds: ['mag-spark', 'arc-venom', 'arc-pin'],
    note: '십자·대각으로 교란하며 조금씩 아문다.',
  },
  {
    id: 'overlord',
    behavior: 'balanced',
    name: '오버로드',
    baseArtId: 'mage',
    spriteId: 'demon',
    tier: 4,
    maxHp: 200,
    startEnergy: 70,
    aiLevel: 'hard',
    passive: { turnEnergy: 15, turnShield: 10, damageReduction: 6, revive: 60 },
    // 전용 카드(2026-08-05) — 실제 행동은 `bosses.ts` 스크립트가 정하고, 이 목록은
    // 도감 표시 + 스크립트가 비었을 때의 AI 폴백이다. 둘이 어긋나면 안 되므로 같은
    // 카드로 채운다.
    deckCardIds: ['b-abyss-maw', 'b-abyss-grasp', 'b-abyss-tide', 'b-abyss-brand'],
    note: '보스 — 도망쳐도 끌어당겨 삼킨다. 보호막이 통하지 않는다.',
  },
  // --- 확장 세트(2026-07-24) ---
  {
    id: 'bat',
    behavior: 'skirmisher',
    name: '박쥐 떼',
    baseArtId: 'warrior',
    spriteId: 'bat',
    tier: 1,
    maxHp: 45,
    startEnergy: 50,
    aiLevel: 'easy',
    passive: { turnEnergy: 6 },
    deckCardIds: ['c-shot', 'arc-venom', 'c-jab'],
    note: '흩어져 쏘는 약한 무리. 물량으로 갉는다.',
  },
  {
    id: 'goblin',
    behavior: 'rusher',
    name: '고블린',
    baseArtId: 'mage',
    spriteId: 'rat',
    tier: 1,
    maxHp: 48,
    startEnergy: 45,
    aiLevel: 'easy',
    passive: {},
    deckCardIds: ['c-jab', 'c-strike', 'war-cleave'],
    note: '재빠른 잡졸. 붙어서 찔러댄다.',
  },
  {
    id: 'crossbow',
    behavior: 'kiter',
    name: '석궁병',
    baseArtId: 'mage',
    spriteId: 'martial-hero',
    tier: 2,
    maxHp: 70,
    startEnergy: 55,
    aiLevel: 'normal',
    passive: {},
    deckCardIds: ['arc-shot', 'c-shot', 'c-brace'],
    note: '거리를 벌리며 관통 화살을 쏜다.',
  },
  {
    id: 'shaman',
    behavior: 'turtle',
    name: '주술사',
    baseArtId: 'archer',
    spriteId: 'church-wizard',
    tier: 2,
    maxHp: 85,
    startEnergy: 55,
    aiLevel: 'normal',
    passive: { regen: 6 },
    deckCardIds: ['mag-frost', 'c-brace', 'c-repair'],
    note: '스스로 아물며 흡혈로 버틴다. 화력을 몰아쳐야 한다.',
  },
  {
    id: 'knight',
    behavior: 'turtle',
    name: '기사',
    baseArtId: 'warrior',
    spriteId: 'martial-hero',
    tier: 2,
    maxHp: 90,
    startEnergy: 55,
    aiLevel: 'normal',
    passive: { turnShield: 10 },
    deckCardIds: ['war-cleave', 'war-bash', 'c-guard'],
    note: '방패를 두른 정석 근접. 빈틈이 적다.',
  },
  {
    id: 'golem',
    behavior: 'turtle',
    name: '골렘',
    baseArtId: 'warrior',
    spriteId: 'golem',
    tier: 3,
    maxHp: 160,
    startEnergy: 50,
    aiLevel: 'normal',
    passive: { damageReduction: 10, turnShield: 10 },
    deckCardIds: ['war-quake', 'war-wall', 'war-bash'],
    note: '거대한 바위 몸. 딜을 뚫기 전엔 꿈쩍도 안 한다.',
  },
  {
    id: 'assassin',
    behavior: 'rusher',
    name: '암살자',
    baseArtId: 'archer',
    spriteId: 'martial-hero',
    tier: 3,
    maxHp: 95, // 75 → 95 (2026-07-30): 급소를 노리기 전에 먼저 죽었다(시뮬 3턴 만에 격파)
    startEnergy: 70,
    aiLevel: 'hard',
    passive: { attackBonus: 10 },
    deckCardIds: ['mag-spark', 'arc-pin', 'c-strike'],
    note: '순식간에 파고들어 급소를 노린다.',
  },
  {
    id: 'witch',
    behavior: 'kiter',
    name: '마녀',
    baseArtId: 'mage',
    spriteId: 'evil-wizard',
    tier: 3,
    maxHp: 100,
    startEnergy: 45,
    aiLevel: 'hard',
    // 기력을 조인다(2026-07-30 밸런스): 예전엔 매 턴 노바 블래스트(40)를 쏴서
    // 3턴 만에 런이 끝났다. 이제 한 방 쏘면 모아야 해서 반격·회피 창이 생긴다.
    passive: { turnEnergy: 8 },
    deckCardIds: ['arc-pin', 'arc-shot', 'c-guard'],
    note: '화면 끝에서 광역 폭발을 퍼붓는다. 쏜 직후가 빈틈이다.',
  },
  {
    id: 'splitter',
    behavior: 'balanced',
    name: '분열체',
    baseArtId: 'archer',
    spriteId: 'slime',
    tier: 3,
    maxHp: 100,
    startEnergy: 60,
    aiLevel: 'hard',
    // 2026-07-30 밸런스: "두 번 죽여야 한다"는 정체성인데 두 몸 다 아프지 않아
    // 시간만 끌었다(시뮬 승률 100%). 되살아난 뒤가 더 무섭게.
    passive: { revive: 60 },
    deckCardIds: ['mag-spark', 'war-cleave', 'mag-frost'],
    note: '쓰러뜨려도 두 번은 죽여야 하는 끈질긴 개체.',
  },
  {
    id: 'warden',
    behavior: 'turtle',
    name: '수호기사',
    baseArtId: 'warrior',
    spriteId: 'terrible-knight',
    tier: 4,
    maxHp: 155,
    startEnergy: 65,
    aiLevel: 'hard',
    // 방벽을 낮춘다(2026-07-30 밸런스): 매 턴 보호막 20 + 피해감소 8이면 플레이어
    // 화력이 통째로 먹혀 15턴 독안개 소모전이 됐다. 뚫리는 벽으로 조정.
    passive: { turnShield: 12, damageReduction: 8, turnEnergy: 8 },
    deckCardIds: ['b-ward-menhir', 'b-ward-bulwark', 'b-ward-riposte', 'b-ward-lance', 'b-ward-verdict'],
    note: '엘리트 — 방벽을 올렸다 열며 보호막째 부순다.',
  },
  {
    id: 'pyrelord',
    behavior: 'balanced',
    name: '화염군주',
    baseArtId: 'mage',
    spriteId: 'dragon',
    tier: 4,
    maxHp: 180,
    startEnergy: 65,
    aiLevel: 'hard',
    passive: { attackBonus: 8, revive: 50, turnEnergy: 10 },
    deckCardIds: ['b-pyre-inferno', 'b-pyre-pillar', 'b-pyre-lash', 'b-pyre-ember'],
    note: '엘리트 — 불씨를 모을수록 무거워진다. 길게 끌면 인페르노가 터진다.',
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
    spriteId: m.spriteId ?? base.id,
    name: m.name,
    maxHp: m.maxHp,
    startEnergy: m.startEnergy,
    passive: { desc: m.note, ...m.passive },
    // 직업 기본기는 **플레이어 것이다** — 아트를 빌려온 직업의 기본기까지 딸려 오면
    // AI 기본 풀(`deckFor`)에 몬스터가 낼 수 없는 카드가 섞인다. 몬스터의 손패는
    // `deckCardIds`가 전부다(공용 이동은 runbattle.ts가 따로 주입).
    basics: [],
    cards: resolveCards(m.deckCardIds),
  }
}

export function monsterDeck(m: MonsterDef): CardDef[] {
  return resolveCards(m.deckCardIds)
}

export function monsterPassive(m: MonsterDef): Passive {
  return { desc: m.note, ...m.passive }
}
