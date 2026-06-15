// ---------------------------------------------------------------------------
// Card-battle domain types. The game is turn-based: each turn both fighters
// pick & order 3 cards, which resolve beat-by-beat. Movement/guard/energy
// ("fast" cards) resolve before attacks within a beat, so positioning and
// dodging matter — faithful to Inuyasha Demon Tournament's system.
// ---------------------------------------------------------------------------

export type Difficulty = 'easy' | 'normal' | 'hard'

/** Vertical posture for a single beat (resets to `stand` each beat). */
export type Stance = 'crouch' | 'stand' | 'jump'

export type CardKind = 'move' | 'attack' | 'guard' | 'energy'

/** Movement intent, resolved relative to the fighter's facing. */
export type MoveDir = 'forward' | 'back' | 'up' | 'down'

export interface CardDef {
  id: string
  name: string
  kind: CardKind
  desc: string

  // move
  dir?: MoveDir

  // attack
  reach?: number // max lane distance (in cells) that can connect
  damage?: number
  energyCost?: number
  hits?: Stance[] // which opponent stances this attack connects against

  // guard
  block?: number

  // energy
  gain?: number

  // visuals / flavour
  accent?: string
  signature?: boolean
  fx?: 'slash' | 'bolt' | 'orb' | 'quake' | 'flame' | 'shield' | 'rush' | 'punch'
}

export const LANE = 7 // cells 0..6
export const START_POS: [number, number] = [2, 4]

export interface BattleSnapshot {
  pos: [number, number]
  stance: [Stance, Stance]
  hp: [number, number]
  energy: [number, number]
  guard: [boolean, boolean]
}

export type ActionResult =
  | 'move'
  | 'jump'
  | 'crouch'
  | 'guard'
  | 'energy'
  | 'hit'
  | 'blocked'
  | 'whiff'
  | 'nofuel'

export interface ActorAction {
  card: CardDef
  result: ActionResult
  damageDealt: number
}

/** One resolved step of a turn (three per turn), with the post-step snapshot. */
export interface Beat {
  index: number
  actions: [ActorAction, ActorAction]
  snapshot: BattleSnapshot
}
