import { ROSTER } from '../data/roster'
import type { Difficulty } from '../battle/types'

export interface GauntletOpponent {
  charId: string
  difficulty: Difficulty
}

export interface Gauntlet {
  playerCharId: string
  opponents: GauntletOpponent[]
  index: number
  wins: number
}

// Difficulty ramps as you climb the ladder.
const DIFF_LADDER: Difficulty[] = ['easy', 'easy', 'normal', 'normal', 'hard']

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Build the GRID GAUNTLET: face every other fighter once, hardest last. */
export function buildGauntlet(playerCharId: string): Gauntlet {
  const pool = shuffle(ROSTER.filter((c) => c.id !== playerCharId).map((c) => c.id))
  const opponents = pool.map((charId, i) => ({
    charId,
    difficulty: DIFF_LADDER[i] ?? 'hard',
  }))
  return { playerCharId, opponents, index: 0, wins: 0 }
}

export const isFinalMatch = (g: Gauntlet) => g.index >= g.opponents.length - 1
