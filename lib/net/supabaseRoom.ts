import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { CHANNEL_CAPACITY, CHANNEL_COUNT, type Venue } from "../game/constants";
import { PROTOCOL_VERSION, type NetRoom, type NetStatus, type PayloadOf, type PresencePayload, type Scope, type Topic } from "./protocol";

const SHOP_TOPICS: Topic[] = ["mv", "ev"];
const TABLE_TOPICS: Topic[] = ["st", "ev"];
export const shopChannelName = (venue: Venue, ch: number) => `sakaba:${venue}:ch-${ch}`;
export const tableChannelName = (venue: Venue, ch: number, table: string) => `${shopChannelName(venue, ch)}:${table}`;

class SupabaseRoom implements NetRoom {
  private st: NetStatus = "connecting";
  private statusFns = new Set<(s: NetStatus) => void>();
  private peerFns = new Set<(p: Map<string, PresencePayload>, j: string[], l: string[]) => void>();
  private tableReadyFns = new Set<(t: string) => void>();
  private topicFns: Record<Topic, Set<(d: unknown) => void>> = { mv: new Set(), st: new Set(), ev: new Set() };
  private known = new Set<string>();
  private lastPresence = "";
  private pendingPresence: PresencePayload | null = null;
  readonly channel: RealtimeChannel;
  private table: { id: string; ch: RealtimeChannel; live: boolean } | null = null;

  constructor(private client: SupabaseClient, readonly myId: string, private venue: Venue, readonly shop: number, private isPrivate: boolean) {
    this.channel = client.channel(shopChannelName(venue, shop), {
      config: { broadcast: { self: false, ack: false }, presence: { key: myId }, private: isPrivate },
    });
    this.listen(this.channel, SHOP_TOPICS);
    this.channel.on("presence", { event: "sync" }, () => this.emitPeers());
  }

  private listen(ch: RealtimeChannel, topics: Topic[]) {
    for (const t of topics) {
      ch.on("broadcast", { event: t }, (msg) => {
        const d = msg.payload as { id?: unknown } | undefined;
        if (!d || typeof d.id !== "string" || d.id === this.myId) return;
        this.topicFns[t].forEach((fn) => fn(d));
      });
    }
  }

  /** Subscribe to the shop channel and resolve once joined (or reject on failure). */
  join(timeoutMs = 8000) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("realtime join timed out")), timeoutMs);
      this.channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          this.setStatus("live");
          if (this.pendingPresence) this.track(this.pendingPresence);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          this.setStatus("offline");
          clearTimeout(timer);
          reject(new Error(`realtime ${status}`));
        } else if (status === "CLOSED") {
          this.setStatus("offline");
        }
      });
    });
  }

  /** Distinct people currently in the shop (waits briefly for the first presence sync). */
  async headcount(waitMs = 1200) {
    await new Promise((r) => setTimeout(r, waitMs));
    return Object.keys(this.channel.presenceState()).length;
  }

  private setStatus(s: NetStatus) {
    if (this.st === s) return;
    this.st = s;
    this.statusFns.forEach((fn) => fn(s));
  }

  private emitPeers() {
    const state = this.channel.presenceState() as Record<string, Array<Record<string, unknown>>>;
    const peers = new Map<string, PresencePayload>();
    for (const [key, metas] of Object.entries(state)) {
      if (key === this.myId) continue;
      const p = metas?.[metas.length - 1] as unknown as PresencePayload | undefined;
      if (!p || p.v !== PROTOCOL_VERSION || p.id !== key) continue;
      peers.set(key, p);
    }
    const joined = [...peers.keys()].filter((k) => !this.known.has(k));
    const left = [...this.known].filter((k) => !peers.has(k));
    this.known = new Set(peers.keys());
    this.peerFns.forEach((fn) => fn(peers, joined, left));
  }

  private track(p: PresencePayload) {
    const key = JSON.stringify(p);
    if (key === this.lastPresence) return;
    this.lastPresence = key;
    void this.channel.track(p);
  }

  status() { return this.st; }
  onStatus(fn: (s: NetStatus) => void) { this.statusFns.add(fn); return () => void this.statusFns.delete(fn); }
  onPeers(fn: (p: Map<string, PresencePayload>, j: string[], l: string[]) => void) { this.peerFns.add(fn); return () => void this.peerFns.delete(fn); }
  onTableReady(fn: (t: string) => void) { this.tableReadyFns.add(fn); return () => void this.tableReadyFns.delete(fn); }

  setPresence(p: PresencePayload) {
    this.pendingPresence = p;
    if (this.st === "live") this.track(p);
  }

  joinTable(tableId: string | null) {
    if ((this.table?.id ?? null) === tableId) return;
    if (this.table) {
      const old = this.table.ch;
      this.table = null;
      void this.client.removeChannel(old);
    }
    if (!tableId) return;
    const ch = this.client.channel(tableChannelName(this.venue, this.shop, tableId), {
      config: { broadcast: { self: false, ack: false }, private: this.isPrivate },
    });
    this.listen(ch, TABLE_TOPICS);
    const entry = { id: tableId, ch, live: false };
    this.table = entry;
    ch.subscribe((status) => {
      if (this.table !== entry) return;
      if (status === "SUBSCRIBED") {
        entry.live = true;
        this.tableReadyFns.forEach((fn) => fn(tableId));
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        entry.live = false;
      }
    });
  }

  send<T extends Topic>(topic: T, data: PayloadOf<T>, scope: Scope) {
    const ch = scope === "table" ? (this.table?.live ? this.table.ch : null) : this.st === "live" ? this.channel : null;
    if (!ch) return; // dropped, never queued
    void ch.send({ type: "broadcast", event: topic, payload: data });
  }

  on<T extends Topic>(topic: T, fn: (data: PayloadOf<T>) => void) {
    const f = fn as (d: unknown) => void;
    this.topicFns[topic].add(f);
    return () => void this.topicFns[topic].delete(f);
  }

  async leave() {
    this.statusFns.clear();
    this.peerFns.clear();
    this.tableReadyFns.clear();
    (Object.keys(this.topicFns) as Topic[]).forEach((t) => this.topicFns[t].clear());
    if (this.table) { await this.client.removeChannel(this.table.ch); this.table = null; }
    try { await this.channel.untrack(); } catch { /* ignore */ }
    await this.client.removeChannel(this.channel);
  }
}

/**
 * Join a channel of the given venue. With `preferred` set, join exactly that channel;
 * otherwise walk ch-1 … ch-CHANNEL_COUNT and take the first with room (the last one if all are full).
 * Two people racing for the last spot may both get in, which is fine.
 */
export async function joinShop(client: SupabaseClient, myId: string, isPrivate: boolean, venue: Venue, preferred: number | null): Promise<NetRoom> {
  if (isPrivate) {
    let { data: { session } } = await client.auth.getSession();
    if (!session) {
      const { data, error } = await client.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }
    // make sure the socket carries the user's JWT before joining a private channel
    if (session) await client.realtime.setAuth(session.access_token);
  }
  if (preferred) {
    const room = new SupabaseRoom(client, myId, venue, preferred, isPrivate);
    await room.join();
    return room;
  }
  for (let ch = 1; ch <= CHANNEL_COUNT; ch++) {
    const room = new SupabaseRoom(client, myId, venue, ch, isPrivate);
    await room.join();
    const n = await room.headcount();
    if (n < CHANNEL_CAPACITY || ch === CHANNEL_COUNT) return room;
    await room.leave();
  }
  throw new Error("no channel available");
}
