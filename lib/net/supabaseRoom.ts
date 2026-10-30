import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { MAX_SHOPS, SHOP_CAPACITY } from "../game/constants";
import { PROTOCOL_VERSION, type NetRoom, type NetStatus, type PayloadOf, type PresencePayload, type Topic } from "./protocol";

const TOPICS: Topic[] = ["mv", "st", "ev"];
export const channelName = (shop: number) => `sakaba:shop-${shop}`;

class SupabaseRoom implements NetRoom {
  private st: NetStatus = "connecting";
  private statusFns = new Set<(s: NetStatus) => void>();
  private peerFns = new Set<(p: Map<string, PresencePayload>, j: string[], l: string[]) => void>();
  private topicFns: Record<Topic, Set<(d: unknown) => void>> = { mv: new Set(), st: new Set(), ev: new Set() };
  private known = new Set<string>();
  private lastPresence = "";
  private pendingPresence: PresencePayload | null = null;
  readonly channel: RealtimeChannel;

  constructor(private client: SupabaseClient, readonly myId: string, readonly shop: number, isPrivate: boolean) {
    this.channel = client.channel(channelName(shop), {
      config: { broadcast: { self: false, ack: false }, presence: { key: myId }, private: isPrivate },
    });
    for (const t of TOPICS) {
      this.channel.on("broadcast", { event: t }, (msg) => {
        const d = msg.payload as { id?: unknown } | undefined;
        if (!d || typeof d.id !== "string" || d.id === this.myId) return;
        this.topicFns[t].forEach((fn) => fn(d));
      });
    }
    this.channel.on("presence", { event: "sync" }, () => this.emitPeers());
  }

  /** Subscribe and resolve once joined (or reject on failure). */
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

  /** Distinct people currently in the channel (waits briefly for the first presence sync). */
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

  setPresence(p: PresencePayload) {
    this.pendingPresence = p;
    if (this.st === "live") this.track(p);
  }

  send<T extends Topic>(topic: T, data: PayloadOf<T>) {
    if (this.st !== "live") return; // dropped, never queued
    void this.channel.send({ type: "broadcast", event: topic, payload: data });
  }

  on<T extends Topic>(topic: T, fn: (data: PayloadOf<T>) => void) {
    const f = fn as (d: unknown) => void;
    this.topicFns[topic].add(f);
    return () => void this.topicFns[topic].delete(f);
  }

  async leave() {
    this.statusFns.clear();
    this.peerFns.clear();
    TOPICS.forEach((t) => this.topicFns[t].clear());
    try { await this.channel.untrack(); } catch { /* ignore */ }
    await this.client.removeChannel(this.channel);
  }
}

/**
 * Walk shop-1, shop-2, ... and join the first one with room.
 * A shop is "full" at SHOP_CAPACITY people; two people racing for the last spot may both get in, which is fine.
 */
export async function joinShop(client: SupabaseClient, myId: string, isPrivate: boolean): Promise<NetRoom> {
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
  let last: SupabaseRoom | null = null;
  for (let shop = 1; shop <= MAX_SHOPS; shop++) {
    const room = new SupabaseRoom(client, myId, shop, isPrivate);
    await room.join();
    const n = await room.headcount();
    if (n < SHOP_CAPACITY || shop === MAX_SHOPS) return room;
    last = room;
    await room.leave();
  }
  if (last) return last;
  throw new Error("no shop available");
}
