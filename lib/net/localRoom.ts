import { PROTOCOL_VERSION, type NetRoom, type NetStatus, type PayloadOf, type PresencePayload, type Topic } from "./protocol";

/**
 * Same-browser stand-in for Supabase, built on BroadcastChannel.
 * Open two tabs with NEXT_PUBLIC_SAKABA_NET=local to test multiplayer without any backend.
 */
type Msg =
  | { t: "pres"; p: PresencePayload }
  | { t: "bye"; id: string }
  | { t: "hello"; id: string }
  | { t: "bc"; topic: Topic; d: { id: string } };

export class LocalRoom implements NetRoom {
  readonly shop = 1;
  private bc = new BroadcastChannel("sakaba-local");
  private peers = new Map<string, { p: PresencePayload; seen: number }>();
  private known = new Set<string>();
  private mine: PresencePayload | null = null;
  private peerFns = new Set<(p: Map<string, PresencePayload>, j: string[], l: string[]) => void>();
  private topicFns: Record<Topic, Set<(d: unknown) => void>> = { mv: new Set(), st: new Set(), ev: new Set() };
  private timer: ReturnType<typeof setInterval>;

  constructor(readonly myId: string) {
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
    if (m.t === "bc" && m.d?.id !== this.myId) this.topicFns[m.topic]?.forEach((fn) => fn(m.d));
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
  setPresence(p: PresencePayload) { this.mine = p; this.post({ t: "pres", p }); }
  send<T extends Topic>(topic: T, data: PayloadOf<T>) { this.post({ t: "bc", topic, d: data }); }
  on<T extends Topic>(topic: T, fn: (d: PayloadOf<T>) => void) {
    const f = fn as (d: unknown) => void;
    this.topicFns[topic].add(f);
    return () => void this.topicFns[topic].delete(f);
  }
  async leave() {
    this.bye();
    clearInterval(this.timer);
    window.removeEventListener("pagehide", this.bye);
    this.bc.close();
  }
}
