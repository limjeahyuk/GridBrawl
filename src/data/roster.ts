import type { CardDef, Offset } from '../battle/types'

// ---------------------------------------------------------------------------
// THE GRID roster, rebuilt for 2D card battles. Each avatar keeps its identity
// (colour, silhouette, art) but fights with three signature attack cards that
// differ in their RANGE on the grid (a set of cells relative to the attacker),
// damage and energy cost — plus the shared common cards (see battle/cards.ts).
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
 *   lifestealDiv — on a connecting attack, heal floor(damageDealt / div) HP.
 *   shieldBreak — a connecting attack wipes the defender's remaining shield.
 */
export interface Passive {
  desc: string
  turnEnergy?: number
  turnShield?: number
  damageReduction?: number
  lifestealDiv?: number
  shieldBreak?: boolean
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
  attacks: CardDef[]
}

// --- range helpers ---------------------------------------------------------
const fwd = (n: number): Offset => ({ df: n, du: 0 })
/** A straight beam: forward cells a..b on the same row. */
const beam = (a: number, b: number): Offset[] => {
  const out: Offset[] = []
  for (let n = a; n <= b; n++) out.push(fwd(n))
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

function atk(over: Partial<CardDef> & { id: string; name: string }): CardDef {
  return {
    kind: 'attack',
    desc: '',
    cooldown: 0, // attacks are limited by energy, not cooldown
    range: [fwd(1)],
    damage: 20,
    energyCost: 12,
    fx: 'punch',
    ...over,
  }
}

export const ROSTER: CharacterDef[] = [
  {
    id: 'volt',
    name: 'VOLT',
    title: 'Arc Runner',
    accent: '#2ff3ff',
    accent2: '#ffe14d',
    description: '전광석화의 원거리 견제형. 체력은 낮지만 빠른 잽과 긴 전격 빔으로 거리를 지배한다.',
    maxHp: 100,
    maxEnergy: 100,
    startEnergy: 55,
    passive: { desc: '오버차지: 매 턴 기력 +10, 보호막 +10.', turnEnergy: 10, turnShield: 10 },
    attacks: [
      atk({ id: 'volt-jab', name: '스파크 잽', range: [fwd(1)], damage: 18, energyCost: 12, fx: 'punch', desc: '바로 앞 한 칸 약공격. 빠르고 저렴하다.' }),
      atk({ id: 'volt-bolt', name: '아크 볼트', range: beam(1, 4), damage: 30, energyCost: 28, fx: 'bolt', desc: '같은 줄로 4칸까지 뻗는 전격 빔.' }),
      atk({ id: 'volt-surge', name: '체인 서지', range: beam(1, 5), damage: 42, energyCost: 46, fx: 'bolt', signature: true, accent: '#2ff3ff', desc: '시그니처. 화면 끝까지 닿는 최장 전격 빔.' }),
    ],
  },
  {
    id: 'titan',
    name: 'TITAN',
    title: 'Siege Frame',
    accent: '#ff9a3d',
    accent2: '#ffd36b',
    description: '걸어다니는 요새. 느리지만 한 방이 무겁고, 앞 줄 전체를 짓이기는 광역기가 있다.',
    maxHp: 142,
    maxEnergy: 100,
    startEnergy: 40,
    passive: { desc: '장갑판: 받는 공격 피해 -10.', damageReduction: 10 },
    attacks: [
      atk({ id: 'titan-hammer', name: '해머 핸드', range: [fwd(1)], damage: 22, energyCost: 14, fx: 'punch', desc: '바로 앞 한 칸 강타. 묵직하다.' }),
      atk({ id: 'titan-crush', name: '크러셔', range: bar(1), damage: 36, energyCost: 30, fx: 'quake', desc: '앞 한 칸의 위·중·아래를 동시에 친다.' }),
      atk({ id: 'titan-slam', name: '사이즈믹 슬램', range: [...bar(1), ...bar(2)], damage: 52, energyCost: 48, fx: 'quake', signature: true, accent: '#ff9a3d', desc: '시그니처. 앞 두 칸 × 세 줄을 통째로 부수는 지진파.' }),
    ],
  },
  {
    id: 'nova',
    name: 'NOVA',
    title: 'Plasma Oracle',
    accent: '#ff3df0',
    accent2: '#a96bff',
    description: '플라스마 견제의 대가. 가장 긴 사거리의 구체로 접근을 응징한다.',
    maxHp: 106,
    maxEnergy: 100,
    startEnergy: 55,
    passive: { desc: '플라스마 충전: 매 턴 기력 +10, 보호막 +10.', turnEnergy: 10, turnShield: 10 },
    attacks: [
      atk({ id: 'nova-palm', name: '팜 펄스', range: [fwd(1)], damage: 18, energyCost: 10, fx: 'orb', desc: '바로 앞 한 칸 견제.' }),
      atk({ id: 'nova-blast', name: '노바 블래스트', range: beam(1, 5), damage: 32, energyCost: 30, fx: 'orb', desc: '같은 줄 끝까지 닿는 최장 구체.' }),
      atk({ id: 'nova-flare', name: '라이징 플레어', range: [...bar(1), fwd(2)], damage: 40, energyCost: 40, fx: 'orb', signature: true, accent: '#ff3df0', desc: '시그니처. 앞 한 칸의 세 줄 + 앞 두 칸을 덮는 폭발.' }),
    ],
  },
  {
    id: 'cipher',
    name: 'CIPHER',
    title: 'Null Phantom',
    accent: '#57ffa0',
    accent2: '#1bd6c4',
    description: '시스템의 버그. 순간이동으로 거리를 지우고, 상하좌우를 한 번에 베는 십자 베기를 쓴다.',
    maxHp: 100,
    maxEnergy: 100,
    startEnergy: 50,
    passive: { desc: '데이터 흡수: 공격 적중 시 입힌 피해의 1/5만큼 체력 회복.', lifestealDiv: 5 },
    attacks: [
      atk({ id: 'cipher-cut', name: '엣지 컷', range: [fwd(1)], damage: 18, energyCost: 10, fx: 'slash', desc: '바로 앞 한 칸 빠른 베기.' }),
      atk({ id: 'cipher-cross', name: '크로스 슬래시', range: CROSS, damage: 30, energyCost: 24, fx: 'slash', desc: '상·하·좌·우 네 칸을 동시에 베는 십자 범위.' }),
      atk({ id: 'cipher-phase', name: '페이즈 스트라이크', range: [...beam(1, 3), { df: 1, du: 1 }, { df: 1, du: -1 }], damage: 44, energyCost: 44, fx: 'slash', signature: true, accent: '#57ffa0', desc: '시그니처. 앞 세 칸 + 앞 한 칸의 위·아래까지 관통하는 순간이동 강타.' }),
    ],
  },
  {
    id: 'aegis',
    name: 'AEGIS',
    title: 'Bulwark Unit',
    accent: '#4d7cff',
    accent2: '#9fc2ff',
    description: '부동의 수호자. 단단한 방패로 버티다, 좌우를 쓸어버리는 돌격으로 되갚는다.',
    maxHp: 132,
    maxEnergy: 100,
    startEnergy: 45,
    passive: { desc: '상시 방벽: 매 턴 보호막 +20.', turnShield: 20 },
    attacks: [
      atk({ id: 'aegis-jab', name: '실드 잽', range: [fwd(1)], damage: 20, energyCost: 12, fx: 'shield', desc: '바로 앞 한 칸 방패 견제.' }),
      atk({ id: 'aegis-bash', name: '실드 배시', range: bar(1), damage: 34, energyCost: 28, fx: 'shield', desc: '앞 한 칸의 위·중·아래를 방패로 쓴다.' }),
      atk({ id: 'aegis-drive', name: '벌워크 드라이브', range: [fwd(-1), fwd(1), fwd(2)], damage: 50, energyCost: 44, fx: 'shield', signature: true, accent: '#4d7cff', desc: '시그니처. 같은 줄의 뒤 한 칸 + 앞 두 칸(좌·우)을 쓸어버리는 돌진.' }),
    ],
  },
  {
    id: 'ember',
    name: 'EMBER',
    title: 'Cinder Blade',
    accent: '#ff4d5e',
    accent2: '#ff9a3d',
    description: '끝없는 압박. 불타는 연격으로 가드를 녹이며 앞으로 파고든다.',
    maxHp: 102,
    maxEnergy: 100,
    startEnergy: 50,
    passive: { desc: '가드 브레이크: 공격이 적중하면 상대 보호막을 모두 제거.', shieldBreak: true },
    attacks: [
      atk({ id: 'ember-claw', name: '신더 클로', range: [fwd(1)], damage: 17, energyCost: 10, fx: 'flame', desc: '바로 앞 한 칸 빠른 할퀴기.' }),
      atk({ id: 'ember-kick', name: '플레임 킥', range: bar(1), damage: 30, energyCost: 26, fx: 'flame', desc: '앞 한 칸의 위·중·아래를 차는 불꽃 부채.' }),
      atk({ id: 'ember-inferno', name: '인페르노 러시', range: beam(1, 3), damage: 46, energyCost: 44, fx: 'rush', signature: true, accent: '#ff4d5e', desc: '시그니처. 같은 줄 앞 세 칸을 꿰뚫는 돌진 연격.' }),
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
