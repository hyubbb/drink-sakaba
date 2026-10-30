/**
 * Wire protocol. Two kinds of traffic, chosen to stay inside Supabase Realtime's limits
 * (Presence messages are the scarcest: 20/s project-wide on the Free plan).
 *
 *  Presence  — who is in the shop and where they sit. Changes rarely: enter, sit, stand, language.
 *  Broadcast — everything else:
 *    "mv"  position while walking (MOVE_HZ), one final packet on stop
 *    "st"  slow state snapshot (glass, the plate I keep, position); on change, on someone's join, and every heartbeat
 *    "ev"  one-off moments: drink / pour / eat / cheer / say
 *
 * Every payload carries the sender id. Nothing here is authority; receivers validate.
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

export type StatePayload = { id: string; glass: number; pl: PlateState | null; x: number; z: number; ry: number };

export type EventPayload =
  | { id: string; k: "drink" }
  | { id: string; k: "cheer" }
  | { id: string; k: "pour"; to: string }
  | { id: string; k: "eat"; pl: string; d: number }
  | { id: string; k: "say"; p: string };

export type Topic = "mv" | "st" | "ev";
export type PayloadOf<T extends Topic> = T extends "mv" ? MovePayload : T extends "st" ? StatePayload : EventPayload;

export type NetStatus = "connecting" | "live" | "offline";

/** What the game needs from a realtime backend. Supabase implements it; tests could fake it. */
export interface NetRoom {
  readonly myId: string;
  readonly shop: number;
  status(): NetStatus;
  onStatus(fn: (s: NetStatus) => void): () => void;
  /** Presence of everyone else, keyed by id. Called on every presence sync. */
  onPeers(fn: (peers: Map<string, PresencePayload>, joined: string[], left: string[]) => void): () => void;
  setPresence(p: PresencePayload): void;
  send<T extends Topic>(topic: T, data: PayloadOf<T>): void;
  on<T extends Topic>(topic: T, fn: (data: PayloadOf<T>) => void): () => void;
  leave(): Promise<void>;
}
