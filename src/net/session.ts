// ---------------------------------------------------------------------------
// Per-match plan exchange. Both peers run the IDENTICAL deterministic engine
// (host = side 0, guest = side 1). Each turn a peer sends its three chosen card
// ids and waits for the other's; once both plans are known, both call the same
// `resolveTurn(planA, planB)` and animate the same steps — so the simulation
// stays in lockstep with no authoritative server. (`engine.resolveTurn` uses no
// randomness; the CPU AI is not involved in PvP.)
// ---------------------------------------------------------------------------
import { deckFor } from '../battle/cards'
import type { CardBattle } from '../battle/engine'
import type { CardDef } from '../battle/types'
import type { NetTransport } from './protocol'

export interface PlanExchange {
  /** Send my plan for this turn and resolve with the opponent's, or `null` if
   *  the connection dropped while waiting. Signature matches BattleScreen's
   *  `getOpponentPlan`. */
  getOpponentPlan(localPlan: CardDef[], battle: CardBattle): Promise<CardDef[] | null>
  dispose(): void
}

export function createPlanExchange(transport: NetTransport, localSide: 0 | 1): PlanExchange {
  const oppSide = (1 - localSide) as 0 | 1
  const buffered = new Map<number, string[]>() // opponent plans that arrived early
  let waiting: { turn: number; resolve: (cards: CardDef[] | null) => void } | null = null
  let oppDeck: CardDef[] | null = null // resolved lazily from the live battle

  const toCards = (ids: string[]): CardDef[] => {
    const deck = oppDeck ?? []
    return ids.map((id) => deck.find((c) => c.id === id)).filter((c): c is CardDef => !!c)
  }

  const offMsg = transport.onMessage((m) => {
    if (m.t !== 'plan') return
    if (waiting && waiting.turn === m.turn) {
      const w = waiting
      waiting = null
      w.resolve(toCards(m.cards))
    } else {
      buffered.set(m.turn, m.cards)
    }
  })

  const offClose = transport.onClose(() => {
    if (waiting) {
      const w = waiting
      waiting = null
      w.resolve(null)
    }
  })

  const getOpponentPlan = (localPlan: CardDef[], b: CardBattle): Promise<CardDef[] | null> => {
    if (!oppDeck) oppDeck = deckFor(b.chars[oppSide])
    const turn = b.state.turn
    transport.send({ t: 'plan', turn, cards: localPlan.map((c) => c.id) })
    const early = buffered.get(turn)
    if (early) {
      buffered.delete(turn)
      return Promise.resolve(toCards(early))
    }
    if (!transport.isOpen()) return Promise.resolve(null)
    return new Promise((resolve) => {
      waiting = { turn, resolve }
    })
  }

  const dispose = () => {
    offMsg()
    offClose()
    if (waiting) {
      waiting.resolve(null)
      waiting = null
    }
  }

  return { getOpponentPlan, dispose }
}
