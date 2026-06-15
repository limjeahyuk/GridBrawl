// ---------------------------------------------------------------------------
// Card-battle domain types. Turn-based on a 2D grid: each turn both fighters
// pick 3 cards, which resolve in fixed GLOBAL PHASES — all movement first,
// then defense (guard/energy), then attacks — faithful to Inuyasha Demon
// Tournament. Cards carry a cooldown (turns locked after use). See
// docs/GAME_DESIGN.md for the full design.
// ---------------------------------------------------------------------------

export type Difficulty = 'easy' | 'normal' | 'hard'

export type CardKind = 'move' | 'attack' | 'guard' | 'energy'

/** Absolute screen directions, matching the >, <, ^, v arrows on the cards. */
export type MoveDir = 'right' | 'left' | 'up' | 'down'

/** A board cell. col grows rightward (0..GRID_COLS-1), row downward (0..GRID_ROWS-1). */
export interface Cell {
  col: number
  row: number
}

/**
 * One target cell of an attack, relative to the attacker AND its facing:
 *   df: cells forward — + toward the opponent, - behind.
 *   du: rows upward   — + above (smaller row), - below (larger row).
 * Mirrors the 3x3 range chart of the reference game (center = the attacker).
 */
export interface Offset {
  df: number
  du: number
}

export interface CardDef {
  id: string
  name: string
  kind: CardKind
  desc: string
  /** Turns the card is locked after being played. 0 / undefined = reusable. */
  cooldown?: number

  // move
  dir?: MoveDir
  steps?: number // cells moved per play (1 or 2)

  // attack
  range?: Offset[] // cells hit, relative to attacker (+facing)
  damage?: number
  energyCost?: number

  // guard
  block?: number // damage absorbed this turn
  guardCost?: number // energy spent to raise the guard

  // energy
  gain?: number

  // visuals / flavour
  accent?: string
  signature?: boolean
  fx?: 'slash' | 'bolt' | 'orb' | 'quake' | 'flame' | 'shield' | 'rush' | 'punch'
}

export const GRID_COLS = 6
export const GRID_ROWS = 3
/** Both fighters start on the middle row at opposite ends, facing each other. */
export const START_CELLS: readonly [Cell, Cell] = [
  { col: 0, row: 1 },
  { col: GRID_COLS - 1, row: 1 },
]

export interface BattleSnapshot {
  pos: [Cell, Cell]
  hp: [number, number]
  energy: [number, number]
  shield: [number, number] // remaining guard absorption for the current turn
}

export type ActionResult =
  | 'move'
  | 'guard'
  | 'energy'
  | 'hit'
  | 'blocked' // connected but fully absorbed by the opponent's guard
  | 'whiff' // out of range
  | 'nofuel' // could not pay the energy cost

export type Phase = 'move' | 'defense' | 'attack'

/** One resolved card action, with the post-action snapshot (for animation). */
export interface Step {
  phase: Phase
  actor: number // 0 (player) or 1 (opponent)
  card: CardDef
  result: ActionResult
  damage: number // damage dealt to the opponent by this action
  snapshot: BattleSnapshot
}
