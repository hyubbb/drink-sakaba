/**
 * Wire protocol, shaped to stay inside Supabase Realtime's limits.
 * A message delivered to N clients likely counts as N messages, so the big lever is
 * how many people each message reaches. Two channel levels:
 *
 *  Shop channel  `sakaba:<venue>:ch-N`     everyone in that venue channel (≤ CHANNEL_CAPACITY)
 *                venue = izakaya | pocha, N = 1 … CHANNEL_COUNT
 *    Presence  identity + seat. Changes rarely: enter, sit, stand, language.
 *    "mv"      position of people standing up: 5 Hz while walking, once on stop, once in reply to a join
 *    "ev" say  phrases said while standing (greeting someone before sitting)
 *
 *  Table channel `sakaba:<venue>:ch-N:t1`  only the ≤ 6 people seated at that table
 *    "st"      glass level and the shared plate I keep; on change, when someone sits down, every heartbeat
 *    "ev"      drink / pour / eat / cheer / say
 *
 * People at other tables are not told what happens at yours. Every payload carries the
 * sender id; nothing here is authority, receivers validate.
 */

export const PROTOCOL_VERSION = 2;

export type PresencePayload = {
  v: typeof PROTOCOL_VERSION;
  id: string;
  nick: string;
  lang: "ko" | "ja";
  col: number;
  seat: string | null;
  /** epoch ms when the seat was taken; earliest wins a contested seat */
  seatT: number;
};

export type PlateState = { id: string; d: number; l: number; v: number };

export type MovePayload = { id: string; x: number; z: number; ry: number };

/** rd: how many glasses' worth the sender has in them (0 … 6, halves allowed); drives face colour */
export type StatePayload = { id: string; glass: number; pl: PlateState | null; rd?: number };

export type EventPayload =
  | { id: string; k: "drink" }
  | { id: string; k: "cheer" }
  | { id: string; k: "pour"; to: string }
  | { id: string; k: "eat"; pl: string; d: number }
  | { id: string; k: "say"; p: string };

export type Topic = "mv" | "st" | "ev";
export type Scope = "shop" | "table";
export type PayloadOf<T extends Topic> = T extends "mv" ? MovePayload : T extends "st" ? StatePayload : EventPayload;

export type NetStatus = "connecting" | "live" | "offline";

/** What the game needs from a realtime backend. Supabase implements it; LocalRoom fakes it for two-tab tests. */
export interface NetRoom {
  readonly myId: string;
  /** channel number within the venue (1 … CHANNEL_COUNT) */
  readonly shop: number;
  status(): NetStatus;
  onStatus(fn: (s: NetStatus) => void): () => void;
  /** Presence of everyone else in the shop, keyed by id. Called on every presence sync. */
  onPeers(fn: (peers: Map<string, PresencePayload>, joined: string[], left: string[]) => void): () => void;
  setPresence(p: PresencePayload): void;
  /** Join the table channel for the seat I just took, or leave it with null. */
  joinTable(tableId: string | null): void;
  /** Fires once the table channel is ready to send (after joinTable). */
  onTableReady(fn: (tableId: string) => void): () => void;
  /** Dropped (never queued) when that channel is not joined yet. */
  send<T extends Topic>(topic: T, data: PayloadOf<T>, scope: Scope): void;
  /** Hears the topic on both the shop channel and my current table channel. */
  on<T extends Topic>(topic: T, fn: (data: PayloadOf<T>) => void): () => void;
  leave(): Promise<void>;
}
