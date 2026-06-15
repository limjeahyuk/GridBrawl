import type { CardDef } from './types'
import type { CharacterDef } from '../data/roster'

export const GUARD_BLOCK = 15
export const ENERGY_GAIN = 15

// Shared cards every fighter can play. Movement/guard/energy are free; they
// resolve before attacks within a beat, so they set up or dodge.
export const COMMON_CARDS: CardDef[] = [
  { id: 'c-forward', name: '전진', kind: 'move', dir: 'forward', desc: '상대 쪽으로 한 칸 이동.' },
  { id: 'c-back', name: '후퇴', kind: 'move', dir: 'back', desc: '상대에게서 한 칸 멀어진다.' },
  { id: 'c-up', name: '점프', kind: 'move', dir: 'up', desc: '이번 비트 동안 공중. 지상기를 회피한다.' },
  { id: 'c-down', name: '앉기', kind: 'move', dir: 'down', desc: '이번 비트 동안 앉기. 상단기를 회피한다.' },
  { id: 'c-guard', name: '가드', kind: 'guard', block: GUARD_BLOCK, desc: `이번 비트의 피해를 ${GUARD_BLOCK} 막는다.` },
  { id: 'c-energy', name: '원기', kind: 'energy', gain: ENERGY_GAIN, desc: `기력을 ${ENERGY_GAIN} 회복한다.` },
]

/** The full selectable card set for a fighter: common cards + their attacks. */
export function deckFor(char: CharacterDef): CardDef[] {
  return [...COMMON_CARDS, ...char.attacks]
}

export const STANCE_LABEL: Record<string, string> = {
  crouch: '앉기',
  stand: '서기',
  jump: '점프',
}
