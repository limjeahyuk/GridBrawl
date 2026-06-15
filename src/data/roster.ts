import type { CardDef } from '../battle/types'

// ---------------------------------------------------------------------------
// THE GRID roster, rebuilt for card battles. Each avatar keeps its identity
// (colour, silhouette, art) but now fights with three signature attack cards
// that differ in reach, height (which stances they connect against), damage
// and energy cost — plus the shared common cards (see battle/cards.ts).
// ---------------------------------------------------------------------------

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
  attacks: CardDef[]
}

function atk(over: Partial<CardDef> & { id: string; name: string }): CardDef {
  return {
    kind: 'attack',
    desc: '',
    reach: 1,
    damage: 10,
    energyCost: 8,
    hits: ['crouch', 'stand'],
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
    description:
      '전광석화의 원거리 견제형. 체력은 낮지만 빠른 잽과 아크 볼트로 거리를 지배한다.',
    maxHp: 100,
    maxEnergy: 100,
    startEnergy: 36,
    attacks: [
      atk({ id: 'volt-jab', name: '스파크 잽', reach: 1, damage: 7, energyCost: 4, hits: ['crouch', 'stand'], fx: 'punch', desc: '근접 약공격. 빠르고 저렴하다.' }),
      atk({ id: 'volt-bolt', name: '아크 볼트', reach: 5, damage: 12, energyCost: 16, hits: ['stand', 'jump'], fx: 'bolt', desc: '원거리 전격. 서거나 점프한 상대를 맞춘다.' }),
      atk({ id: 'volt-surge', name: '체인 서지', reach: 2, damage: 18, energyCost: 26, hits: ['stand'], fx: 'bolt', signature: true, accent: '#2ff3ff', desc: '시그니처. 중거리 강타. 앉기·점프로 회피 가능.' }),
    ],
  },
  {
    id: 'titan',
    name: 'TITAN',
    title: 'Siege Frame',
    accent: '#ff9a3d',
    accent2: '#ffd36b',
    description: '걸어다니는 요새. 느리지만 한 방이 무겁고 체력이 압도적이다.',
    maxHp: 142,
    maxEnergy: 100,
    startEnergy: 30,
    attacks: [
      atk({ id: 'titan-hammer', name: '해머 핸드', reach: 1, damage: 12, energyCost: 8, hits: ['crouch', 'stand'], fx: 'punch', desc: '근접 강타. 묵직하다.' }),
      atk({ id: 'titan-crush', name: '크러셔', reach: 1, damage: 20, energyCost: 18, hits: ['stand', 'jump'], fx: 'quake', desc: '솟구치는 강타. 점프한 상대도 잡는다.' }),
      atk({ id: 'titan-slam', name: '사이즈믹 슬램', reach: 2, damage: 26, energyCost: 32, hits: ['crouch', 'stand'], fx: 'quake', signature: true, accent: '#ff9a3d', desc: '시그니처. 지진파. 앉아도 피할 수 없다(점프로만 회피).' }),
    ],
  },
  {
    id: 'nova',
    name: 'NOVA',
    title: 'Plasma Oracle',
    accent: '#ff3df0',
    accent2: '#a96bff',
    description: '플라스마 견제의 대가. 긴 사거리의 구체로 접근을 응징한다.',
    maxHp: 106,
    maxEnergy: 100,
    startEnergy: 42,
    attacks: [
      atk({ id: 'nova-palm', name: '팜 펄스', reach: 1, damage: 8, energyCost: 5, hits: ['stand'], fx: 'orb', desc: '근접 견제. 앉기·점프로 회피 가능.' }),
      atk({ id: 'nova-blast', name: '노바 블래스트', reach: 6, damage: 15, energyCost: 20, hits: ['stand', 'jump'], fx: 'orb', desc: '최장 사거리 구체. 화면 끝에서도 닿는다.' }),
      atk({ id: 'nova-flare', name: '라이징 플레어', reach: 1, damage: 14, energyCost: 16, hits: ['stand', 'jump'], fx: 'orb', signature: true, accent: '#ff3df0', desc: '시그니처. 대공기. 점프한 상대를 격추한다.' }),
    ],
  },
  {
    id: 'cipher',
    name: 'CIPHER',
    title: 'Null Phantom',
    accent: '#57ffa0',
    accent2: '#1bd6c4',
    description: '시스템의 버그. 순간이동으로 거리를 지우고 모든 높이를 베어버린다.',
    maxHp: 100,
    maxEnergy: 100,
    startEnergy: 36,
    attacks: [
      atk({ id: 'cipher-cut', name: '엣지 컷', reach: 1, damage: 8, energyCost: 5, hits: ['crouch', 'stand'], fx: 'slash', desc: '빠른 근접 베기.' }),
      atk({ id: 'cipher-cross', name: '크로스 슬래시', reach: 2, damage: 13, energyCost: 13, hits: ['stand'], fx: 'slash', desc: '중거리 베기. 자세를 낮추거나 띄우면 회피.' }),
      atk({ id: 'cipher-phase', name: '페이즈 스트라이크', reach: 3, damage: 18, energyCost: 24, hits: ['crouch', 'stand', 'jump'], fx: 'slash', signature: true, accent: '#57ffa0', desc: '시그니처. 순간이동 강타. 모든 자세를 관통한다.' }),
    ],
  },
  {
    id: 'aegis',
    name: 'AEGIS',
    title: 'Bulwark Unit',
    accent: '#4d7cff',
    accent2: '#9fc2ff',
    description: '부동의 수호자. 단단한 방패 뒤에서 버티다 한 번에 되갚는다.',
    maxHp: 132,
    maxEnergy: 100,
    startEnergy: 32,
    attacks: [
      atk({ id: 'aegis-jab', name: '실드 잽', reach: 1, damage: 8, energyCost: 5, hits: ['crouch', 'stand'], fx: 'shield', desc: '방패로 밀어치는 견제.' }),
      atk({ id: 'aegis-bash', name: '실드 배시', reach: 1, damage: 15, energyCost: 14, hits: ['stand', 'jump'], fx: 'shield', desc: '방패 강타. 점프한 상대도 받아친다.' }),
      atk({ id: 'aegis-drive', name: '벌워크 드라이브', reach: 2, damage: 21, energyCost: 24, hits: ['stand'], fx: 'shield', signature: true, accent: '#4d7cff', desc: '시그니처. 돌진 방패. 중거리까지 밀어붙인다.' }),
    ],
  },
  {
    id: 'ember',
    name: 'EMBER',
    title: 'Cinder Blade',
    accent: '#ff4d5e',
    accent2: '#ff9a3d',
    description: '끝없는 압박. 불타는 연격으로 가드를 녹이며 몰아붙인다.',
    maxHp: 102,
    maxEnergy: 100,
    startEnergy: 36,
    attacks: [
      atk({ id: 'ember-claw', name: '신더 클로', reach: 1, damage: 7, energyCost: 4, hits: ['crouch', 'stand'], fx: 'flame', desc: '빠른 불꽃 할퀴기.' }),
      atk({ id: 'ember-kick', name: '플레임 킥', reach: 1, damage: 13, energyCost: 12, hits: ['stand', 'jump'], fx: 'flame', desc: '불꽃 발차기. 점프 상대에게 강하다.' }),
      atk({ id: 'ember-inferno', name: '인페르노 러시', reach: 3, damage: 19, energyCost: 26, hits: ['crouch', 'stand'], fx: 'rush', signature: true, accent: '#ff4d5e', desc: '시그니처. 돌진 연격. 넓은 사거리로 파고든다.' }),
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
