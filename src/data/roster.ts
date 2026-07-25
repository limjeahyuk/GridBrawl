import type { CardDef, Offset } from '../battle/types'

// ---------------------------------------------------------------------------
// THE GRID roster, rebuilt for 2D card battles. Each avatar keeps its identity
// (colour, silhouette, art) but is now a distinct "직업" built around unique
// cards: everyone shares the weak common attack/guard cards (battle/cards.ts),
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
    name: 'VOLT',
    title: 'Arc Runner',
    accent: '#29b6cf',
    accent2: '#f7c948',
    description:
      '전격 흡수형 스피드스터. 체력은 낮지만 긴 빔으로 거리를 지배하고, 맞힐 때마다 상대의 기력을 빨아들여 제 연료로 쓴다.',
    maxHp: 157,
    maxEnergy: 100,
    startEnergy: 60,
    passive: { desc: '오버차지: 매 턴 기력 +10, 보호막 +10.', turnEnergy: 10, turnShield: 10 },
    cards: [
      atk({ id: 'volt-jab', name: '스파크 잽', range: both(1), damage: 24, energyCost: 10, fx: 'punch', desc: '앞뒤 한 칸을 동시에 지지는 약공격. 빠르고 저렴하다.' }),
      atk({ id: 'volt-leech', name: '포크 라이트닝', range: FORK, damage: 20, energyCost: 20, drain: 10, pointBlank: false, fx: 'bolt', desc: '앞뒤 대각선 네 갈래(X자)로 갈라지는 번개. 정면과 밀착은 사각. 적중 시 상대 기력 10 흡수.' }),
      atk({ id: 'volt-bolt', name: '아크 볼트', range: beamBoth(1, 2), damage: 30, energyCost: 29, fx: 'bolt', desc: '같은 줄 앞뒤 2칸씩 뻗는 전격 빔.' }),
      atk({ id: 'volt-surge', name: '체인 서지', range: beamBoth(1, 3), damage: 40, energyCost: 50, drain: 10, fx: 'bolt', signature: true, accent: '#29b6cf', desc: '시그니처. 같은 줄 전체(앞뒤 3칸씩)를 훑는 전격 — 적중 시 기력 10까지 흡수.' }),
    ],
  },
  {
    id: 'titan',
    name: 'TITAN',
    title: 'Siege Frame',
    accent: '#e8863a',
    accent2: '#f7c96b',
    description:
      '걸어다니는 공성 병기. 느리지만 한 방이 무겁고, 광역 강타와 넉백으로 제 사거리를 강요한다.',
    maxHp: 172,
    maxEnergy: 100,
    startEnergy: 60,
    passive: { desc: '장갑판: 받는 공격 피해 -9.', damageReduction: 9 },
    cards: [
      atk({ id: 'titan-hammer', name: '해머 핸드', range: both(1), damage: 29, energyCost: 10, fx: 'punch', desc: '앞뒤 한 칸을 후려치는 강타. 싸고 묵직하다.' }),
      atk({ id: 'titan-ram', name: '램 프레스', range: [fwd(1)], damage: 30, energyCost: 20, push: 2, fx: 'punch', desc: '앞 한 칸을 밀쳐 두 칸 넉백. 전방 전용 — 들러붙는 상대를 떼어낸다.' }),
      atk({ id: 'titan-crush', name: '크러셔', range: [...bar(1), ...bar(-1)], damage: 30, energyCost: 25, fx: 'quake', desc: '앞뒤 한 칸의 위·중·아래(세로 3줄)를 동시에 부순다.' }),
      atk({ id: 'titan-slam', name: '사이즈믹 슬램', range: [...bar(1), ...bar(-1), fwd(2), fwd(-2)], damage: 50, energyCost: 50, push: 1, fx: 'quake', signature: true, accent: '#e8863a', desc: '시그니처. 몸 주변 앞뒤 세로 3줄 + 앞뒤 2칸째를 부수는 지진파 — 적중한 상대를 한 칸 밀어낸다.' }),
    ],
  },
  {
    id: 'nova',
    name: 'NOVA',
    title: 'Plasma Oracle',
    accent: '#d45fae',
    accent2: '#9b6fd4',
    description:
      '초장거리 포격수. 끝없이 차오르는 플라스마로 화면 반대편에서 상대를 태우고, 관통 광선은 가드조차 소용없다.',
    maxHp: 162,
    maxEnergy: 100,
    startEnergy: 60,
    passive: { desc: '플라스마 코어: 매 턴 기력 +20.', turnEnergy: 20 },
    cards: [
      atk({ id: 'nova-palm', name: '팜 펄스', range: both(1), damage: 22, energyCost: 10, fx: 'orb', desc: '앞뒤 한 칸을 튕겨내는 견제 펄스.' }),
      atk({ id: 'nova-lance', name: '이온 랜스', range: beam(2, 4), damage: 30, energyCost: 25, pierce: true, pointBlank: false, fx: 'orb', desc: '앞 2~4칸 관통 광선. 전방 전용 저격 — 상대 보호막을 무시하고, 바로 앞과 밀착은 사각.' }),
      atk({ id: 'nova-blast', name: '노바 블래스트', range: beam(1, 5), damage: 40, energyCost: 32, fx: 'orb', desc: '같은 줄 끝까지 닿는 최장 구체. 전방 전용 주포.' }),
      atk({ id: 'nova-flare', name: '라이징 플레어', range: [...bar(1), ...bar(2), fwd(-1), fwd(-2)], damage: 50, energyCost: 45, fx: 'orb', signature: true, accent: '#d45fae', desc: '시그니처. 앞 두 칸 × 세 줄의 대폭발 + 등 뒤 2칸까지 후폭풍이 휩쓴다.' }),
    ],
  },
  {
    id: 'cipher',
    name: 'CIPHER',
    title: 'Null Phantom',
    accent: '#3cbf7a',
    accent2: '#2aa7a0',
    description:
      '시스템의 버그이자 흡혈 암살자. 상하좌우를 동시에 베고, 베어낸 만큼 체력과 기력을 제 것으로 만든다.',
    maxHp: 145,
    maxEnergy: 100,
    startEnergy: 50,
    passive: { desc: '데이터 흡수: 공격으로 피해를 주면 체력 +10.', lifesteal: 10 },
    cards: [
      atk({ id: 'cipher-cut', name: '엣지 컷', range: both(1), damage: 20, energyCost: 10, fx: 'slash', desc: '앞뒤 한 칸을 스치는 빠른 베기.' }),
      atk({ id: 'cipher-siphon', name: '널 사이펀', range: bar(1), damage: 20, energyCost: 20, leech: 10, drain: 10, fx: 'slash', desc: '앞 한 칸의 세 줄을 베며 체력 10 회복 + 상대 기력 10 흡수. 전방 전용.' }),
      atk({ id: 'cipher-cross', name: '크로스 슬래시', range: CROSS, damage: 30, energyCost: 24, fx: 'slash', desc: '상·하·좌·우 네 칸을 동시에 베는 십자 범위. 등 뒤도 벤다.' }),
      atk({ id: 'cipher-phase', name: '페이즈 스트라이크', range: [...beamBoth(1, 2), ...FORK], damage: 50, energyCost: 45, leech: 10, fx: 'slash', signature: true, accent: '#3cbf7a', desc: '시그니처. 앞뒤 2칸 + 대각선 네 방향을 한 번에 관통하는 순간이동 난무 — 체력 10 회복.' }),
    ],
  },
  {
    id: 'aegis',
    name: 'AEGIS',
    title: 'Bulwark Unit',
    accent: '#5b7ee0',
    accent2: '#9db8ef',
    description:
      '부동의 수호자. 공격하면서도 방패를 거두지 않고, 전용 방벽 아이언 커튼은 웬만한 강타를 통째로 삼킨다.',
    maxHp: 164,
    maxEnergy: 100,
    startEnergy: 50,
    passive: { desc: '상시 방벽: 매 턴 보호막 +15.', turnShield: 15 },
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
    name: 'EMBER',
    title: 'Cinder Blade',
    accent: '#e25563',
    accent2: '#e8863a',
    description:
      '제 몸을 태워 싸우는 하이리스크 러셔. 반동을 감수한 초화력으로 단기 결전을 노리고, 쓰러져도 잿불에서 한 번 되살아난다.',
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
