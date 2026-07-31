import type { CardDef, Offset } from '../battle/types'

// ---------------------------------------------------------------------------
// 로스터. **테마는 다크 판타지**(2026-07-31 리스킨 — 사이버 아레나에서 전환).
// 바뀐 것은 이름·칭호·소개문·색뿐이고 **id·카드·수치는 그대로**다: id는 저장된
// 덱(RTDB `decks/<uid>`)·유물(`sig-<id>`)·몬스터 `baseArtId`가 참조하고, 수치는
// 시뮬로 맞춘 밸런스라 건드리면 재측정이 필요하다. 옛 이름 대응표는
// docs/GAME_DESIGN.md "로스터 리스킨" 참고(밸런스 기록은 옛 이름 그대로 남겼다).
//
// 각 캐릭터는 고유 카드로 정체성을 낸다: 공용의 약한 공격/가드는 모두가 쓰고
// (battle/cards.ts),
// and the character's own cards carry the exciting abilities — wide ranges,
// heavy damage, energy drain, lifesteal, pierce, knockback, self-shield,
// recoil. Unique cards are mostly attacks but can be any kind (AEGIS has a
// unique guard).
//
// Range offsets are { df, du }: df = cells forward (+ toward opponent), du =
// rows upward (+ above). The engine mirrors df by the attacker's facing.
// ---------------------------------------------------------------------------

/**
 * A character's signature passive. Each field is an independent hook the engine
 * applies at a fixed moment (see `CardBattle.resolveTurn` / `computeAttack`):
 *   turnEnergy/turnShield — granted at the start of every turn (after the global
 *     regen + shield reset).
 *   damageReduction — flat amount subtracted from each incoming attack's damage.
 *   lifesteal — on an attack that deals damage, heal this flat amount of HP.
 *   shieldBreak — a connecting attack wipes the defender's remaining shield.
 *   revive — once per battle, a KO'd fighter comes back with this much HP.
 */
export interface Passive {
  desc: string
  turnEnergy?: number
  turnShield?: number
  damageReduction?: number
  lifesteal?: number
  shieldBreak?: boolean
  revive?: number
  // --- 로그라이크 유물용 추가 훅(2026-07-24) — 엔진이 결정론적으로 적용 ---
  /** 매 턴 시작 시 체력 +N(최대치 cap). */
  regen?: number
  /** 내 공격이 실제로 겨냥에 들면 피해 +N(맞기 전 raw에 더함). */
  attackBonus?: number
  /** 피격해 피해를 실제로 입으면 공격자에게 N 반사. */
  thorns?: number
  /** 최대 체력 ±N(전투 시작 시 반영, 최소 1). */
  maxHpBonus?: number
  // --- 조합형 유물 훅(2026-07-31) — 로그라이크 전용, 전부 결정론적 ---
  /**
   * **누적 기력 소비 트리거**. 이 전투에서 쓴 기력이 `per`의 배수를 넘길 때마다 발동.
   * 여러 유물의 트리거는 배열로 **누적**된다(각자 자기 주기로 따로 발동) — 유물을
   * 겹쳐 쌓는 조합 플레이를 막지 않기 위한 설계. 순서는 유물 장착 순서(랜덤 없음).
   */
  energyTriggers?: EnergyTrigger[]
  /** 체력이 절반(`LOW_HP_FRAC`) 이하일 때 내 공격 피해 +N%. 유물끼리 합산된다. */
  lowHpBonusPct?: number
  /** 상대 보호막을 무시하고 피해를 관통시킨다(카드의 `pierce`를 상시화). */
  alwaysPierce?: boolean
  /** 내 공격이 적중하면 상대를 N턴 기절시킨다(전투당 `stunCap`회까지). */
  stunOnHit?: number
  /** `stunOnHit`이 전투당 발동할 수 있는 횟수(합산). 없으면 1회. */
  stunCap?: number
  /** 첫 턴에 얻는 보호막(선공 방어형). */
  openingShield?: number
  // --- 상태이상 훅(2026-08-01) — 3직업 개편의 빌드 재료 ---
  /**
   * 내 공격이 피해를 입히면 독을 N(턴당 피해) 추가로 건다. 카드의 `poison`과 합산.
   * 궁수 "독으로 조이기" 빌드의 핵심 — 유물을 겹칠수록 위력이 쌓인다.
   */
  poisonOnHit?: number
  /** 내 공격이 피해를 입히면 화상을 N 추가로 건다(마법사 상태이상 빌드). */
  burnOnHit?: number
  /**
   * 내가 거는 지속피해(독·화상)의 위력 +N%. **거는 순간 한 번 계산해 박아 넣는다**
   * — 매 틱 다시 계산하면 유물을 도중에 얻었을 때 이미 걸린 것까지 소급돼 어긋난다.
   */
  statusPowerPct?: number
  /** 상대가 상태이상에 하나라도 걸려 있으면 내 공격 피해 +N(상태이상 시너지). */
  bonusVsAfflicted?: number
}

/** 누적 기력 소비 트리거 한 개. `per`만큼 쓸 때마다 아래 효과가 한 번씩 터진다. */
export interface EnergyTrigger {
  per: number
  /** 상대를 N턴 기절시킨다(카드를 못 냄). */
  stun?: number
  /** 내 체력 +N. */
  heal?: number
  /** 내 보호막 +N. */
  shield?: number
  /** 상대에게 즉시 N 고정 피해(보호막 무시). */
  damage?: number
  /** 내 기력 +N(무한 순환은 아니다 — 소비량보다 작게 잡는다). */
  energy?: number
  /** 표시용 이름(연출 로그·툴팁). */
  label?: string
}

export interface CharacterDef {
  id: string
  name: string
  title: string
  accent: string
  accent2: string
  description: string
  maxHp: number
  maxEnergy: number
  startEnergy: number
  passive: Passive
  /** 고유(전용) 카드. 대부분 공격이지만 어떤 종류든 될 수 있다(예: AEGIS의 전용 가드). */
  cards: CardDef[]
}

// --- range helpers ---------------------------------------------------------
// 교차(뛰어넘기) 플레이가 의도된 룰이라 대부분의 공격은 앞뒤를 함께 커버한다.
// 대신 한쪽 사거리는 짧게 — 예: 앞 3칸 빔 대신 앞뒤 2칸씩.
const fwd = (n: number): Offset => ({ df: n, du: 0 })
/** A straight beam: forward cells a..b on the same row. */
const beam = (a: number, b: number): Offset[] => {
  const out: Offset[] = []
  for (let n = a; n <= b; n++) out.push(fwd(n))
  return out
}
/** 앞뒤 한 칸씩 (n=1) 또는 앞뒤 n칸째 셀 두 개. */
const both = (n: number): Offset[] => [fwd(n), fwd(-n)]
/** 앞뒤 대칭 직선: 같은 줄 양방향 a..b칸. */
const beamBoth = (a: number, b: number): Offset[] => {
  const out: Offset[] = []
  for (let n = a; n <= b; n++) out.push(fwd(n), fwd(-n))
  return out
}
/** A vertical bar (up/mid/down) at forward distance df — good vs other rows. */
const bar = (df: number): Offset[] => [
  { df, du: 1 },
  { df, du: 0 },
  { df, du: -1 },
]
/** The classic cross: the four cells orthogonally adjacent to the attacker. */
const CROSS: Offset[] = [
  { df: 1, du: 0 },
  { df: -1, du: 0 },
  { df: 0, du: 1 },
  { df: 0, du: -1 },
]
/** 앞뒤 대각선 네 갈래(X자) — 정면·바로 위아래는 사각. */
const FORK: Offset[] = [
  { df: 1, du: 1 },
  { df: 1, du: -1 },
  { df: -1, du: 1 },
  { df: -1, du: -1 },
]

function atk(over: Partial<CardDef> & { id: string; name: string }): CardDef {
  return {
    kind: 'attack',
    desc: '',
    cooldown: 0, // attacks are limited by energy, not cooldown
    range: [fwd(1)],
    damage: 20,
    energyCost: 10,
    fx: 'punch',
    ...over,
  }
}

export const ROSTER: CharacterDef[] = [
  {
    id: 'volt',
    name: 'VESPER',
    title: 'Stormbound Knight',
    accent: '#8fb6d6',
    accent2: '#d9b463',
    description:
      '폭풍에 서약한 방랑 기사. 갑주는 얇지만 뇌명이 흐르는 룬검으로 줄 하나를 통째로 지배하고, 베어낼 때마다 상대의 마력을 빨아들여 제 연료로 쓴다.',
    maxHp: 157,
    maxEnergy: 100,
    startEnergy: 60,
    passive: { desc: '뇌운의 가호: 매 턴 기력 +10, 보호막 +10.', turnEnergy: 10, turnShield: 10 },
    cards: [
      atk({ id: 'volt-jab', name: '스파크 잽', range: both(1), damage: 24, energyCost: 10, fx: 'punch', desc: '앞뒤 한 칸을 동시에 지지는 약공격. 빠르고 저렴하다.' }),
      atk({ id: 'volt-leech', name: '포크 라이트닝', range: FORK, damage: 20, energyCost: 20, drain: 10, pointBlank: false, fx: 'bolt', desc: '앞뒤 대각선 네 갈래(X자)로 갈라지는 번개. 정면과 밀착은 사각. 적중 시 상대 기력 10 흡수.' }),
      atk({ id: 'volt-bolt', name: '아크 볼트', range: beamBoth(1, 2), damage: 30, energyCost: 29, fx: 'bolt', desc: '같은 줄 앞뒤 2칸씩 뻗는 전격 빔.' }),
      atk({ id: 'volt-surge', name: '체인 서지', range: beamBoth(1, 3), damage: 40, energyCost: 50, drain: 10, fx: 'bolt', signature: true, accent: '#29b6cf', desc: '시그니처. 같은 줄 전체(앞뒤 3칸씩)를 훑는 전격 — 적중 시 기력 10까지 흡수.' }),
    ],
  },
  {
    id: 'titan',
    name: 'MAUL',
    title: 'Ruin Berserker',
    accent: '#c9713a',
    accent2: '#d9a45e',
    description:
      '성문을 부수라고 사슬에서 풀어놓은 광전사. 느리지만 한 방이 산을 무너뜨리고, 대지를 가르는 강타와 밀어내기로 제 사거리를 강요한다.',
    maxHp: 172,
    maxEnergy: 100,
    startEnergy: 60,
    passive: { desc: '무쇠 비늘: 받는 공격 피해 -9.', damageReduction: 9 },
    cards: [
      atk({ id: 'titan-hammer', name: '해머 핸드', range: both(1), damage: 29, energyCost: 10, fx: 'punch', desc: '앞뒤 한 칸을 후려치는 강타. 싸고 묵직하다.' }),
      atk({ id: 'titan-ram', name: '램 프레스', range: [fwd(1)], damage: 30, energyCost: 20, push: 2, fx: 'punch', desc: '앞 한 칸을 밀쳐 두 칸 넉백. 전방 전용 — 들러붙는 상대를 떼어낸다.' }),
      atk({ id: 'titan-crush', name: '크러셔', range: [...bar(1), ...bar(-1)], damage: 30, energyCost: 25, fx: 'quake', desc: '앞뒤 한 칸의 위·중·아래(세로 3줄)를 동시에 부순다.' }),
      atk({ id: 'titan-slam', name: '사이즈믹 슬램', range: [...bar(1), ...bar(-1), fwd(2), fwd(-2)], damage: 50, energyCost: 50, push: 1, fx: 'quake', signature: true, accent: '#e8863a', desc: '시그니처. 몸 주변 앞뒤 세로 3줄 + 앞뒤 2칸째를 부수는 지진파 — 적중한 상대를 한 칸 밀어낸다.' }),
    ],
  },
  {
    id: 'nova',
    name: 'DIRGE',
    title: 'Hollow Oracle',
    accent: '#a578cf',
    accent2: '#6fc0b0',
    description:
      '만가를 읊는 원령 무녀. 마르지 않는 혼백을 태워 전장 반대편에서 상대를 사르고, 뼈를 꿰뚫는 창은 방패조차 소용없다.',
    maxHp: 162,
    maxEnergy: 100,
    startEnergy: 60,
    passive: { desc: '혼백의 등불: 매 턴 기력 +20.', turnEnergy: 20 },
    cards: [
      atk({ id: 'nova-palm', name: '팜 펄스', range: both(1), damage: 22, energyCost: 10, fx: 'orb', desc: '앞뒤 한 칸을 튕겨내는 견제 펄스.' }),
      atk({ id: 'nova-lance', name: '이온 랜스', range: beam(2, 4), damage: 30, energyCost: 25, pierce: true, pointBlank: false, fx: 'orb', desc: '앞 2~4칸 관통 광선. 전방 전용 저격 — 상대 보호막을 무시하고, 바로 앞과 밀착은 사각.' }),
      atk({ id: 'nova-blast', name: '노바 블래스트', range: beam(1, 5), damage: 40, energyCost: 32, fx: 'orb', desc: '같은 줄 끝까지 닿는 최장 구체. 전방 전용 주포.' }),
      atk({ id: 'nova-flare', name: '라이징 플레어', range: [...bar(1), ...bar(2), fwd(-1), fwd(-2)], damage: 50, energyCost: 45, fx: 'orb', signature: true, accent: '#d45fae', desc: '시그니처. 앞 두 칸 × 세 줄의 대폭발 + 등 뒤 2칸까지 후폭풍이 휩쓴다.' }),
    ],
  },
  {
    id: 'cipher',
    name: 'SABLE',
    title: 'Bloodletter',
    accent: '#5aa06d',
    accent2: '#3f9a90',
    description:
      '그림자에 스며드는 흡혈 도적. 독을 먹인 쌍검으로 상하좌우를 동시에 베고, 베어낸 만큼 상대의 피와 기력을 제 것으로 만든다.',
    maxHp: 145,
    maxEnergy: 100,
    startEnergy: 50,
    passive: { desc: '피의 갈증: 공격으로 피해를 주면 체력 +10.', lifesteal: 10 },
    cards: [
      atk({ id: 'cipher-cut', name: '엣지 컷', range: both(1), damage: 20, energyCost: 10, fx: 'slash', desc: '앞뒤 한 칸을 스치는 빠른 베기.' }),
      atk({ id: 'cipher-siphon', name: '널 사이펀', range: bar(1), damage: 20, energyCost: 20, leech: 10, drain: 10, fx: 'slash', desc: '앞 한 칸의 세 줄을 베며 체력 10 회복 + 상대 기력 10 흡수. 전방 전용.' }),
      atk({ id: 'cipher-cross', name: '크로스 슬래시', range: CROSS, damage: 30, energyCost: 24, fx: 'slash', desc: '상·하·좌·우 네 칸을 동시에 베는 십자 범위. 등 뒤도 벤다.' }),
      atk({ id: 'cipher-phase', name: '페이즈 스트라이크', range: [...beamBoth(1, 2), ...FORK], damage: 50, energyCost: 45, leech: 10, fx: 'slash', signature: true, accent: '#3cbf7a', desc: '시그니처. 앞뒤 2칸 + 대각선 네 방향을 한 번에 관통하는 순간이동 난무 — 체력 10 회복.' }),
    ],
  },
  {
    id: 'aegis',
    name: 'CAIRN',
    title: 'Oathbound Warden',
    accent: '#6d8ac4',
    accent2: '#a7b8d4',
    description:
      '무너진 성채에 홀로 남은 파수꾼. 때리는 동안에도 방패를 거두지 않고, 전용 방벽은 웬만한 강타를 통째로 삼킨다.',
    maxHp: 164,
    maxEnergy: 100,
    startEnergy: 50,
    passive: { desc: '불침의 서약: 매 턴 보호막 +15.', turnShield: 15 },
    cards: [
      atk({ id: 'aegis-jab', name: '실드 잽', range: both(1), damage: 20, energyCost: 10, selfShield: 5, fx: 'shield', desc: '앞뒤 한 칸 방패 견제. 사용 시 보호막 +5.' }),
      atk({ id: 'aegis-bash', name: '실드 배시', range: bar(1), damage: 30, energyCost: 28, push: 1, fx: 'shield', desc: '앞 한 칸의 세 줄을 방패로 후려쳐 한 칸 밀어낸다. 전방 전용.' }),
      {
        id: 'aegis-wall',
        name: '아이언 커튼',
        kind: 'guard',
        block: 70,
        guardCost: 20,
        cooldown: 2,
        fx: 'shield',
        desc: '전용 방벽. 기력 20 소모, 이번 턴 받는 피해를 최대 70 막는다. 쿨타임 2턴.',
      },
      atk({ id: 'aegis-drive', name: '벌워크 드라이브', range: [fwd(-1), fwd(1), fwd(2)], damage: 50, energyCost: 50, selfShield: 20, fx: 'shield', signature: true, accent: '#5b7ee0', desc: '시그니처. 같은 줄의 뒤 한 칸 + 앞 두 칸을 쓸어버리는 돌진 — 사용 시 보호막 +20.' }),
    ],
  },
  {
    id: 'ember',
    name: 'PYRE',
    title: 'Ashen Devil',
    accent: '#cf5347',
    accent2: '#e0913f',
    description:
      '제 몸을 장작 삼아 싸우는 잿불 마귀. 반동을 감수한 초화력으로 단기 결전을 노리고, 쓰러져도 재 속에서 한 번 되살아난다.',
    maxHp: 156,
    maxEnergy: 100,
    startEnergy: 50,
    passive: { desc: '잿불 부활: 쓰러져도 전투당 한 번, HP 50으로 되살아난다.', revive: 50 },
    cards: [
      atk({ id: 'ember-claw', name: '신더 클로', range: both(1), damage: 20, energyCost: 10, fx: 'flame', desc: '앞뒤 한 칸을 긋는 빠른 할퀴기.' }),
      atk({ id: 'ember-fan', name: '플레임 팬', range: [...bar(1), fwd(-1)], damage: 30, energyCost: 20, fx: 'flame', desc: '앞 한 칸의 세 줄 + 등 뒤 한 칸을 도는 회전 불꽃차기.' }),
      atk({ id: 'ember-blitz', name: '오버히트 블리츠', range: beam(1, 2), damage: 38, energyCost: 26, recoil: 5, fx: 'rush', desc: '과열 돌진. 전방 전용 — 싸고 강하지만 자신도 화상으로 체력 5를 잃는다.' }),
      atk({ id: 'ember-inferno', name: '인페르노 러시', range: beamBoth(1, 2), damage: 60, energyCost: 50, recoil: 10, fx: 'rush', signature: true, accent: '#e25563', desc: '시그니처. 같은 줄 앞뒤 2칸씩을 불태우는 최대 화력 — 반동으로 체력 10을 잃는다.' }),
    ],
  },
]

export const ROSTER_BY_ID: Record<string, CharacterDef> = Object.fromEntries(
  ROSTER.map((c) => [c.id, c]),
)

export function getChar(id: string): CharacterDef {
  const c = ROSTER_BY_ID[id]
  if (!c) throw new Error(`Unknown character: ${id}`)
  return c
}
