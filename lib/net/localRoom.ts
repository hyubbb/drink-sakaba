import { CHANNEL_CAPACITY, CHANNEL_COUNT } from "../game/constants";
import { PROTOCOL_VERSION, type NetRoom, type NetStatus, type PayloadOf, type PresencePayload, type Scope, type Topic } from "./protocol";

/**
 * Same-browser stand-in for Supabase, built on BroadcastChannel.
 * Open two tabs with NEXT_PUBLIC_SAKABA_NET=local to test multiplayer without any backend.
 * Table scoping is emulated: a table message reaches only tabs seated at that table.
 */
type Msg =
  | { t: "pres"; p: PresencePayload }
  | { t: "bye"; id: string }
  | { t: "hello"; id: string }
  | { t: "bc"; topic: Topic; scope: string; d: { id: string } };

/** Venue-wide { id, ch } heartbeats over BroadcastChannel, standing in for the Supabase lobby. */
class LocalLobby {
  private bc: BroadcastChannel;
  private seen = new Map<string, { ch: number; at: number }>();
  private fns = new Set<(c: Record<number, number>) => void>();
  private mine: number | null = null;
  private timer: ReturnType<typeof setInterval>;
  private last: Record<number, number> | null = null;

  constructor(private myId: string, venue: string) {
    this.bc = new BroadcastChannel(`sakaba-local:${venue}:lobby`);
    this.bc.onmessage = (e: MessageEvent<{ id: string; ch: number | null }>) => {
      const { id, ch } = e.data || ({} as { id: string; ch: number | null });
      if (!id || id === this.myId) return;
      if (ch === null) this.seen.delete(id);
      else if (id === "?") { if (this.mine) this.post(); return; }
      else this.seen.set(id, { ch, at: Date.now() });
      this.emit();
    };
    this.bc.postMessage({ id: "?", ch: 0 }); // ask everyone to announce themselves
    this.timer = setInterval(() => {
      if (this.mine) this.post();
      const t = Date.now();
      let changed = false;
      for (const [k, v] of this.seen) if (t - v.at > 6000) { this.seen.delete(k); changed = true; }
      if (changed) this.emit();
    }, 2000);
  }
  private post() { this.bc.postMessage({ id: this.myId, ch: this.mine }); }
  private emit() {
    const c: Record<number, number> = {};
    for (let i = 1; i <= CHANNEL_COUNT; i++) c[i] = 0;
    for (const v of this.seen.values()) if (c[v.ch] !== undefined) c[v.ch]++;
    if (this.mine && c[this.mine] !== undefined) c[this.mine]++;
    this.last = c;
    this.fns.forEach((fn) => fn(c));
  }
  track(ch: number) { this.mine = ch; this.post(); this.emit(); }
  counts() { return this.last; }
  onCounts(fn: (c: Record<number, number>) => void) { this.fns.add(fn); return () => void this.fns.delete(fn); }
  leave() { this.bc.postMessage({ id: this.myId, ch: null }); clearInterval(this.timer); this.fns.clear(); this.bc.close(); }

  /** Listen briefly, then report what we heard. */
  static async open(myId: string, venue: string) {
    const l = new LocalLobby(myId, venue);
    await new Promise((r) => setTimeout(r, 600));
    l.emit();
    return l;
  }
}

/** Same-browser room: picks a channel from the local lobby, like joinShop does with Supabase. */
export async function openLocalRoom(myId: string, venue: string, preferred: number | null) {
  const lobby = await LocalLobby.open(myId, venue);
  const counts = lobby.counts() ?? {};
  let ch = preferred ?? 0;
  if (!ch) {
    ch = 1;
    for (let i = 1; i <= CHANNEL_COUNT; i++) if ((counts[i] ?? 0) < CHANNEL_CAPACITY) { ch = i; break; }
  }
  const room = new LocalRoom(myId, venue, ch);
  room.lobby = lobby;
  lobby.track(ch);
  return room;
}

export class LocalRoom implements NetRoom {
  private bc: BroadcastChannel;
  lobby: LocalLobby | null = null;
  private peers = new Map<string, { p: PresencePayload; seen: number }>();
  private known = new Set<string>();
  private mine: PresencePayload | null = null;
  private table: string | null = null;
  private peerFns = new Set<(p: Map<string, PresencePayload>, j: string[], l: string[]) => void>();
  private tableReadyFns = new Set<(t: string) => void>();
  private topicFns: Record<Topic, Set<(d: unknown) => void>> = { mv: new Set(), st: new Set(), ev: new Set() };
  private timer: ReturnType<typeof setInterval>;

  constructor(readonly myId: string, venue: string, readonly shop: number) {
    this.bc = new BroadcastChannel(`sakaba-local:${venue}:ch-${shop}`);
    this.bc.onmessage = (e: MessageEvent<Msg>) => this.onMsg(e.data);
    this.post({ t: "hello", id: myId });
    this.timer = setInterval(() => {
      if (this.mine) this.post({ t: "pres", p: this.mine });
      const t = Date.now();
      let changed = false;
      for (const [k, v] of this.peers) if (t - v.seen > 6000) { this.peers.delete(k); changed = true; }
      if (changed) this.emit();
    }, 2000);
    window.addEventListener("pagehide", this.bye);
  }

  private bye = () => this.post({ t: "bye", id: this.myId });
  private post(m: Msg) { this.bc.postMessage(m); }

  private onMsg(m: Msg) {
    if (m.t === "hello") { if (this.mine) this.post({ t: "pres", p: this.mine }); return; }
    if (m.t === "bye") { if (this.peers.delete(m.id)) this.emit(); return; }
    if (m.t === "pres") {
      if (m.p.v !== PROTOCOL_VERSION || m.p.id === this.myId) return;
      const prev = this.peers.get(m.p.id);
      this.peers.set(m.p.id, { p: m.p, seen: Date.now() });
      if (!prev || JSON.stringify(prev.p) !== JSON.stringify(m.p)) this.emit();
      return;
    }
    if (m.t === "bc" && m.d?.id !== this.myId) {
      if (m.scope !== "shop" && m.scope !== `table:${this.table}`) return;
      // dev counter: messages this tab received, by topic and scope (inspect window.__sakabaRx)
      const w = window as unknown as { __sakabaRx?: Record<string, number> };
      const key = `${m.topic}@${m.scope === "shop" ? "shop" : "table"}`;
      (w.__sakabaRx ??= {})[key] = (w.__sakabaRx[key] ?? 0) + 1;
      this.topicFns[m.topic]?.forEach((fn) => fn(m.d));
    }
  }

  private emit() {
    const map = new Map([...this.peers].map(([k, v]) => [k, v.p]));
    const joined = [...map.keys()].filter((k) => !this.known.has(k));
    const left = [...this.known].filter((k) => !map.has(k));
    this.known = new Set(map.keys());
    this.peerFns.forEach((fn) => fn(map, joined, left));
  }

  status(): NetStatus { return "live"; }
  onStatus() { return () => {}; }
  onPeers(fn: (p: Map<string, PresencePayload>, j: string[], l: string[]) => void) { this.peerFns.add(fn); return () => void this.peerFns.delete(fn); }
  onTableReady(fn: (t: string) => void) { this.tableReadyFns.add(fn); return () => void this.tableReadyFns.delete(fn); }
  channelCounts() { return this.lobby?.counts() ?? null; }
  onChannelCounts(fn: (c: Record<number, number>) => void) { return this.lobby ? this.lobby.onCounts(fn) : () => {}; }
  setPresence(p: PresencePayload) { this.mine = p; this.post({ t: "pres", p }); }
  joinTable(tableId: string | null) {
    if (this.table === tableId) return;
    this.table = tableId;
    if (tableId) setTimeout(() => { if (this.table === tableId) this.tableReadyFns.forEach((fn) => fn(tableId)); }, 50);
  }
  send<T extends Topic>(topic: T, data: PayloadOf<T>, scope: Scope) {
    if (scope === "table" && !this.table) return;
    this.post({ t: "bc", topic, scope: scope === "table" ? `table:${this.table}` : "shop", d: data });
  }
  on<T extends Topic>(topic: T, fn: (d: PayloadOf<T>) => void) {
    const f = fn as (d: unknown) => void;
    this.topicFns[topic].add(f);
    return () => void this.topicFns[topic].delete(f);
  }
  async leave() {
    this.bye();
    this.lobby?.leave();
    this.lobby = null;
    clearInterval(this.timer);
    window.removeEventListener("pagehide", this.bye);
    this.bc.close();
  }
}
