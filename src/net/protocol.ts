// ---------------------------------------------------------------------------
// Transport-agnostic multiplayer protocol. The game talks ONLY to a
// `NetTransport`, never to WebRTC directly, so the transport can be swapped
// later (a WebSocket relay, an authoritative server, …) without touching the
// battle engine or the UI. The first implementation is `net/webrtc.ts`
// (serverless invite-code exchange).
// ---------------------------------------------------------------------------

/** Game-level messages exchanged between the two peers. */
export type NetMessage =
  // sent once on connect so each peer learns the other's chosen avatar
  | { t: 'hello'; charId: string }
  // a single turn's three chosen card ids, tagged with the turn number so the
  // peers can stay in lockstep even if messages arrive slightly out of phase
  | { t: 'plan'; turn: number; cards: string[] }

/** A bidirectional, ordered, reliable message channel between two peers. */
export interface NetTransport {
  send(msg: NetMessage): void
  /** Subscribe to incoming messages. Returns an unsubscribe function. */
  onMessage(cb: (msg: NetMessage) => void): () => void
  /** Fires once when the connection drops. Returns an unsubscribe function. */
  onClose(cb: () => void): () => void
  isOpen(): boolean
  close(): void
}
