import type { CardDef } from './types'
import type { CharacterDef } from '../data/roster'

export const GUARD_BLOCK = 50 // damage absorbed by one guard for the whole turn
export const GUARD_COST = 10 // energy spent to raise the guard
export const ENERGY_GAIN = 50 // energy restored by the recovery card
export const ENERGY_REGEN = 10 // passive energy regained at the start of each turn

// Shared cards every fighter can play. Movement is free but cools down; guard
// costs energy and absorbs damage for the turn; energy restores fuel. All of
// these resolve before attacks within a turn (see engine `resolveTurn` phases).
export const COMMON_CARDS: CardDef[] = [
  { id: 'm-right', name: '오른쪽', kind: 'move', dir: 'right', steps: 1, cooldown: 0, desc: '오른쪽으로 한 칸 이동. (>)' },
  { id: 'm-left', name: '왼쪽', kind: 'move', dir: 'left', steps: 1, cooldown: 0, desc: '왼쪽으로 한 칸 이동. (<)' },
  { id: 'm-up', name: '위', kind: 'move', dir: 'up', steps: 1, cooldown: 0, desc: '위로 한 칸 이동. (^)' },
  { id: 'm-down', name: '아래', kind: 'move', dir: 'down', steps: 1, cooldown: 0, desc: '아래로 한 칸 이동. (v)' },
  { id: 'm-right2', name: '오른쪽 대시', kind: 'move', dir: 'right', steps: 2, cooldown: 1, desc: '오른쪽으로 두 칸 이동. (>>)' },
  { id: 'm-left2', name: '왼쪽 대시', kind: 'move', dir: 'left', steps: 2, cooldown: 1, desc: '왼쪽으로 두 칸 이동. (<<)' },
  {
    id: 'c-guard',
    name: '가드',
    kind: 'guard',
    block: GUARD_BLOCK,
    guardCost: GUARD_COST,
    cooldown: 1,
    desc: `기력 ${GUARD_COST} 소모. 이번 턴 받는 피해를 최대 ${GUARD_BLOCK} 막는다.`,
  },
  {
    id: 'c-energy',
    name: '원기 회복',
    kind: 'energy',
    gain: ENERGY_GAIN,
    cooldown: 0,
    desc: `기력을 ${ENERGY_GAIN} 회복한다.`,
  },
]

/** The full selectable card set for a fighter: common cards + their attacks. */
export function deckFor(char: CharacterDef): CardDef[] {
  return [...COMMON_CARDS, ...char.attacks]
}
