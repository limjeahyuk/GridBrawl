import type { CardDef } from './types'
import type { CharacterDef } from '../data/roster'

export const GUARD_BLOCK = 50 // damage absorbed by one guard for the whole turn
export const GUARD_COST = 10 // energy spent to raise the guard
export const ENERGY_GAIN = 35 // energy restored by the recovery card
export const ENERGY_REGEN = 20 // passive energy regained at the start of each turn

// Shared cards every fighter can play. Movement is free but cools down; the
// common attack/guard cards are deliberately WEAK — every fighter has them as a
// baseline, and the exciting versions are each character's unique cards (and,
// later, cards obtained from draws/purchases). All non-attacks resolve before
// attacks within a slot (see engine `resolveTurn`).
export const COMMON_CARDS: CardDef[] = [
  { id: 'm-right', name: '오른쪽', kind: 'move', dir: 'right', steps: 1, cooldown: 0, desc: '오른쪽으로 한 칸 이동. (>)' },
  { id: 'm-left', name: '왼쪽', kind: 'move', dir: 'left', steps: 1, cooldown: 0, desc: '왼쪽으로 한 칸 이동. (<)' },
  { id: 'm-up', name: '위', kind: 'move', dir: 'up', steps: 1, cooldown: 0, desc: '위로 한 칸 이동. (^)' },
  { id: 'm-down', name: '아래', kind: 'move', dir: 'down', steps: 1, cooldown: 0, desc: '아래로 한 칸 이동. (v)' },
  { id: 'm-right2', name: '오른쪽 대시', kind: 'move', dir: 'right', steps: 2, cooldown: 1, desc: '오른쪽으로 두 칸 이동. (>>)' },
  { id: 'm-left2', name: '왼쪽 대시', kind: 'move', dir: 'left', steps: 2, cooldown: 1, desc: '왼쪽으로 두 칸 이동. (<<)' },
  // 대각선 이동(2026-07-23) — 가로·세로를 한 번에. 줄을 바꾸며 파고들 때 쓴다.
  { id: 'm-ur', name: '↗ 대각 이동', kind: 'move', dir: 'up-right', steps: 1, cooldown: 0, desc: '오른쪽 위로 한 칸 이동. (↗)' },
  { id: 'm-ul', name: '↖ 대각 이동', kind: 'move', dir: 'up-left', steps: 1, cooldown: 0, desc: '왼쪽 위로 한 칸 이동. (↖)' },
  { id: 'm-dr', name: '↘ 대각 이동', kind: 'move', dir: 'down-right', steps: 1, cooldown: 0, desc: '오른쪽 아래로 한 칸 이동. (↘)' },
  { id: 'm-dl', name: '↙ 대각 이동', kind: 'move', dir: 'down-left', steps: 1, cooldown: 0, desc: '왼쪽 아래로 한 칸 이동. (↙)' },
  {
    id: 'c-strike',
    name: '스트라이크',
    kind: 'attack',
    range: [
      { df: 1, du: 0 },
      { df: -1, du: 0 },
    ],
    damage: 10,
    energyCost: 10,
    cooldown: 0,
    fx: 'punch',
    desc: '앞뒤 한 칸 기본 타격. 약하지만 누구나 언제든 쓸 수 있다.',
  },
  {
    id: 'c-shot',
    name: '펄스 샷',
    kind: 'attack',
    range: [
      { df: 2, du: 0 },
      { df: -2, du: 0 },
    ],
    damage: 10,
    energyCost: 10,
    cooldown: 0,
    fx: 'bolt',
    pointBlank: false, // 두 칸째 전용 — 밀착도 사각
    desc: '앞뒤 두 칸째 한 칸씩만 맞히는 견제 사격. 위력은 낮고, 붙은 상대는 못 맞힌다.',
  },
  {
    id: 'c-jab',
    name: '잽',
    kind: 'attack',
    range: [{ df: 1, du: 0 }],
    damage: 12,
    energyCost: 8,
    cooldown: 0,
    fx: 'punch',
    desc: '앞 한 칸만 노리는 값싼 기본 공격. 로그라이크 시작 공용기.',
  },
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
    id: 'c-brace',
    name: '브레이스',
    kind: 'guard',
    block: 30,
    guardCost: 10,
    cooldown: 0,
    desc: '기력 10 소모. 이번 턴 받는 피해를 최대 30 막는다. 쿨타임이 없다.',
  },
  {
    id: 'c-energy',
    name: '원기 회복',
    kind: 'energy',
    gain: ENERGY_GAIN,
    cooldown: 1,
    desc: `기력을 ${ENERGY_GAIN} 회복한다.`,
  },
  // 힐 지원 카드(2026-07-23) — 기력을 체력으로 바꾼다. 장기전 버티기용.
  {
    id: 'c-repair',
    name: '리페어',
    kind: 'heal',
    healHp: 20,
    healCost: 20,
    cooldown: 1,
    desc: '기력 20 소모. 체력을 20 회복한다. 쿨타임 1턴.',
  },
]

/**
 * The full selectable card set for a fighter: common cards + 직업 기본기 + uniques.
 * ⚠ **기본기를 빼면 안 된다** — 멀티 락스텝의 상대 플랜 복원(`net/session.ts`)과 AI가
 * 이 목록으로 카드 id를 되찾으므로, 빠진 카드는 조용히 사라진다.
 */
export function deckFor(char: CharacterDef): CardDef[] {
  return [...COMMON_CARDS, ...char.basics, ...char.cards]
}
