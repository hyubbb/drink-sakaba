import * as THREE from "three";
import {
  CHEER_WINDOW_MS, COLORS, COUNTER_FRONT_Z, DISHES, FULL, MASTER_POUR_AFTER_S, MOVE_HZ, PLATE_REFILL_MS, ROOM,
  SAY_COOLDOWN_MS, STATE_HEARTBEAT_MS, TABLES, TABLE_HALF, clampInt,
} from "./constants";
import { type Avatar, disposeChar, makeChar, playAnim, updateChar } from "./character";
import { PHRASE_MAP, UI, type Lang } from "./i18n";
import { Sound } from "./sound";
import { buildWorld, type Seat, type World } from "./world";
import type { EventPayload, MovePayload, NetRoom, NetStatus, PlateState, PresencePayload, StatePayload } from "../net/protocol";
import { PROTOCOL_VERSION } from "../net/protocol";

/* ------------------------------------------------------------------ types */

export type Target = { id: string; nick: string; glass: number };
export type Snapshot = {
  entered: boolean;
  lang: Lang;
  muted: boolean;
  seated: boolean;
  canSit: boolean;
  targets: Target[];
  selTarget: string | null;
  canPour: boolean;
  canDrink: boolean;
  dish: { name: string; left: number } | null;
  hint: string | null;
  stats: { drank: number; poured: number; got: number };
  net: { mode: "connecting" | "live" | "solo" | "offline"; people: number; shop: number };
  toast: { id: number; text: string } | null;
};

type Occupant = { id: string; glass: number; nick: string; t: number };
type Remote = {
  id: string;
  pres: PresencePayload;
  glass: number;
  pl: PlateState | null;
  x: number; z: number; ry: number; hasPos: boolean;
  av: Avatar; label: HTMLDivElement; bubble: Bubble;
  cheerAt: number;
};
type Bubble = { el: HTMLDivElement; until: number };
type PlateRuntime = { d: number; l: number; v: number };

const now = () => performance.now();
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const BOT_SEAT = "t1-b1";
const BOT_REPLY: Record<string, string[]> = {
  hi: ["hi"], sit: ["welcome"], otsu: ["thx", "koseng"], koseng: ["thx"], hard: ["agree", "thx"],
  week: ["good", "bad", "soso", "tired"], today: ["good", "bad", "soso", "tired", "happy"], work: ["really", "heol"],
  bad: ["hard", "canbe"], tired: ["otsu", "koseng"], good: ["agree"], happy: ["agree"], co: ["agree", "canbe"],
  boss: ["agree", "hard"], money: ["agree", "dots"], love: ["canbe", "dots"], self: ["doing", "canbe"],
  one: ["kanpai"], nomu: ["lol", "oneshot"], pourme: ["one"], oneshot: ["heol", "lol"], slow: ["thx"], thx: ["lol"],
  lol: ["lol"], really: ["agree"], dots: ["dots", "otsu"], yum: ["agree"], have: ["thx"], leave: ["bye"], bye: ["bye"],
  doing: ["thx"], canbe: ["thx"],
};

/* ------------------------------------------------------------------ engine */

export class Engine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.1, 60);
  private world: World;
  private sound = new Sound();
  private raf = 0;
  private disposers: (() => void)[] = [];

  private room: NetRoom | null = null;
  private netMode: Snapshot["net"]["mode"] = "connecting";

  readonly myId: string;
  private lang: Lang;
  private me = {
    nick: "", col: COLORS[(Math.random() * COLORS.length) | 0],
    x: 0, z: 3.0, ry: Math.PI, seat: null as string | null, seatT: 0, glass: 0,
    pl: null as PlateState | null,
  };
  private entered = false;
  private enteredAt = 0;
  private myAv: Avatar | null = null;
  private myLabel: HTMLDivElement | null = null;
  private myBubble: Bubble | null = null;
  private master: Avatar;
  private masterLabel: HTMLDivElement;
  private masterBubble: Bubble;

  private remotes = new Map<string, Remote>();
  private plateCache: Record<string, PlateRuntime> = {};
  private botPlates: Record<string, PlateRuntime> = {};
  private refillTimers: Record<string, ReturnType<typeof setTimeout> | null> = {};
  private lastDishSeen: Record<string, string> = {};
  private lastClink: Record<string, number> = {};
  private bot = { active: false, glass: FULL, av: null as Avatar | null, label: null as HTMLDivElement | null, bubble: null as Bubble | null, next: 0, pourAt: 0, cheerAt: -1e9 };

  private stats = { drank: 0, poured: 0, got: 0 };
  private keys: Record<string, boolean> = {};
  private joy = { x: 0, y: 0 };
  private camYaw = Math.PI;
  private camDist = 4.2;
  private nearSeat: Seat | null = null;
  private selTarget: string | null = null;
  private myCheerAt = -1e9;
  private masterWait = 0;
  private sayCooldown = 0;
  private pourCooldown = 0;
  private lastMove = 0;
  private wasWalking = false;
  private lastHeartbeat = 0;
  private toastState: Snapshot["toast"] = null;
  private toastSeq = 0;

  private snap: Snapshot;
  private snapKey = "";
  private listeners = new Set<() => void>();
  private lastSnapAt = 0;

  constructor(private mount: HTMLElement, private labels: HTMLElement) {
    this.myId = makeId();
    this.lang = store.get("sakaba.lang") === "ja" ? "ja" : "ko";
    this.sound.muted = store.get("sakaba.mute") === "1";

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
    this.renderer.setPixelRatio(1);
    mount.appendChild(this.renderer.domElement);
    this.world = buildWorld(this.scene);

    this.master = makeChar(this.scene, 0xf2e7cd, 0x2a2a3a, 0xf7f7f7);
    this.master.root.position.set(0.3, 0, -4.0);
    this.masterLabel = this.mkLabel("大将", false);
    this.masterBubble = this.mkBubble();

    this.snap = this.computeSnapshot();
    this.bindInput();
    this.resize();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ---------------- public API for React ---------------- */

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => void this.listeners.delete(fn); };
  getSnapshot = () => this.snap;
  get savedNick() { return store.get("sakaba.nick") || ""; }

  setLang(l: Lang) {
    this.lang = l;
    store.set("sakaba.lang", l);
    if (this.myLabel) this.myLabel.textContent = `${l === "ja" ? "🇯🇵" : "🇰🇷"} ${this.me.nick}`;
    if (this.bot.label) this.bot.label.textContent = "🤖 " + this.T.botName;
    this.pushPresence();
    this.refresh(true);
  }
  toggleMute() { this.sound.muted = !this.sound.muted; store.set("sakaba.mute", this.sound.muted ? "1" : "0"); this.refresh(true); }
  setJoy(x: number, y: number) { this.joy.x = x; this.joy.y = y; }
  setTarget(id: string) { this.selTarget = id; this.refresh(true); }

  /** Called from the entrance form submit (a user gesture, so audio can start). */
  enter(nick: string, lang: Lang, connect: () => Promise<NetRoom | null>) {
    if (this.entered) return;
    this.lang = lang;
    this.me.nick = nick.replace(/[\u0000-\u001f​-‏‪-‮]/g, "").trim().slice(0, 12) || UI[lang].guest;
    store.set("sakaba.nick", this.me.nick);
    store.set("sakaba.lang", lang);
    this.sound.unlock();
    this.myAv = makeChar(this.scene, this.me.col, 0x3b4a5e);
    this.myAv.root.position.set(this.me.x, 0, this.me.z);
    this.myLabel = this.mkLabel(`${lang === "ja" ? "🇯🇵" : "🇰🇷"} ${this.me.nick}`, true);
    this.myBubble = this.mkBubble();
    this.entered = true;
    this.enteredAt = now();
    setTimeout(() => { this.showBubble(this.masterBubble, "welcome"); playAnim(this.master, "talk"); }, 500);
    setTimeout(() => this.maybeBot(), 2600);
    setTimeout(() => { if (this.remotes.size === 0) this.toast(this.T.soloToast); }, 3000);
    this.refresh(true);

    connect().then((room) => {
      if (!room) { this.netMode = "solo"; this.refresh(true); return; }
      if (!this.entered || this.disposed) { void room.leave(); return; }
      this.attachRoom(room);
    }).catch((e) => {
      console.warn("[sakaba] realtime unavailable, solo mode:", e);
      this.netMode = "solo";
      this.refresh(true);
    });
  }

  sit() { if (this.nearSeat) this.sitDown(this.nearSeat); }
  stand() { this.standUp(); }

  pour() {
    if (!this.me.seat || now() < this.pourCooldown) return;
    const tgt = this.currentTargets(this.occupancy()).find((t) => t.id === this.selTarget);
    if (!tgt || tgt.glass >= FULL) return;
    this.pourCooldown = now() + 1300;
    this.playMine("pour");
    this.sound.pour();
    this.stats.poured++;
    if (tgt.id === "bot") setTimeout(() => { this.bot.glass = FULL; this.botSay("thx", 500); }, 600);
    else this.sendEv({ id: this.myId, k: "pour", to: tgt.id });
    this.refresh(true);
  }

  drink() {
    if (!this.me.seat || this.me.glass <= 0 || this.myAv?.anim) return;
    this.me.glass--;
    if (this.me.glass === 0) this.stats.drank++;
    this.playMine("drink");
    this.sendEv({ id: this.myId, k: "drink" });
    this.sendState();
    setTimeout(() => this.sound.gulp(), 350);
    this.refresh(true);
  }

  eat() {
    if (!this.me.seat || this.myAv?.anim) return;
    const occ = this.occupancy();
    const pid = this.world.seats[this.me.seat].plate;
    const st = this.plateState(pid, occ);
    if (st.l <= 0) return;
    const owner = this.plateOwner(pid, occ);
    if (owner === "me" || owner === "bot") this.takePiece(pid);
    this.sendEv({ id: this.myId, k: "eat", pl: pid, d: st.d }); // owner elsewhere applies it
    this.playMine("eat", st.d);
    setTimeout(() => this.sound.eat(), 300);
    this.refresh(true);
  }

  cheer() {
    if (!this.me.seat) return;
    this.playMine("cheer");
    this.myCheerAt = now();
    this.sendEv({ id: this.myId, k: "cheer" });
    if (this.bot.active && this.isOpposite(this.me.seat, BOT_SEAT))
      setTimeout(() => {
        if (!this.bot.active || !this.bot.av) return;
        playAnim(this.bot.av, "cheer");
        this.bot.cheerAt = now();
        this.checkClink(this.world.seats[BOT_SEAT].table);
      }, 450);
    this.checkClink(this.world.seats[this.me.seat].table);
  }

  say(k: string) {
    if (now() < this.sayCooldown || !PHRASE_MAP[k] || !this.myBubble || !this.myAv) return;
    this.sayCooldown = now() + SAY_COOLDOWN_MS;
    this.sendEv({ id: this.myId, k: "say", p: k });
    this.showBubble(this.myBubble, k);
    if (!this.myAv.anim) playAnim(this.myAv, "talk");
    this.sound.pop();
    if (k === "kanpai" && this.me.seat) this.cheer();
    this.botHear(k);
  }

  private disposed = false;
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.disposers.forEach((d) => d());
    Object.values(this.refillTimers).forEach((t) => t && clearTimeout(t));
    void this.room?.leave();
    this.room = null;
    this.sound.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.textContent = "";
    this.listeners.clear();
  }

  /* ---------------- realtime ---------------- */

  private attachRoom(room: NetRoom) {
    this.room = room;
    this.netMode = room.status() === "live" ? "live" : "connecting";
    this.disposers.push(
      room.onStatus((s: NetStatus) => { this.netMode = s === "live" ? "live" : s === "offline" ? "offline" : "connecting"; if (s === "live") { this.pushPresence(); this.sendState(); } this.refresh(true); }),
      room.onPeers((peers, joined) => this.onPeers(peers, joined)),
      room.on("mv", (d) => this.onMove(d)),
      room.on("st", (d) => this.onState(d)),
      room.on("ev", (d) => this.onEvent(d)),
    );
    this.pushPresence();
    this.sendState();
    this.refresh(true);
  }

  private pushPresence() {
    this.room?.setPresence({ v: PROTOCOL_VERSION, id: this.myId, nick: this.me.nick, lang: this.lang, col: this.me.col, seat: this.me.seat, seatT: this.me.seatT });
  }
  private sendState() {
    if (!this.room || !this.entered) return;
    this.lastHeartbeat = now();
    this.room.send("st", { id: this.myId, glass: this.me.glass, pl: this.me.pl, x: r2(this.me.x), z: r2(this.me.z), ry: r2(this.me.ry) });
  }
  private sendEv(e: EventPayload) { this.room?.send("ev", e); }

  private onPeers(peers: Map<string, PresencePayload>, joined: string[]) {
    for (const [id, p] of peers) {
      const r = this.remotes.get(id);
      if (!r) this.createRemote(id, p);
      else {
        const relabel = r.pres.nick !== p.nick || r.pres.lang !== p.lang;
        r.pres = sanitizePresence(p);
        if (relabel) this.setRemoteLabel(r);
      }
    }
    for (const id of [...this.remotes.keys()]) if (!peers.has(id)) this.removeRemote(id);
    // newcomers need everyone's slow state; reply with a little jitter
    if (joined.length) setTimeout(() => this.sendState(), 150 + Math.random() * 600);
    if (this.remotes.size && this.bot.active) this.botLeave();
    this.resolveMySeat();
    this.maybeBot();
    this.refresh(true);
  }
  private onMove(d: MovePayload) {
    const r = this.remotes.get(d.id);
    if (!r) return;
    r.x = num(d.x); r.z = num(d.z); r.ry = num(d.ry);
    if (!r.hasPos) { r.av.root.position.set(r.x, 0, r.z); r.hasPos = true; }
  }
  private onState(d: StatePayload) {
    const r = this.remotes.get(d.id);
    if (!r) return;
    r.glass = clampInt(d.glass, 0, FULL);
    const pl = d.pl && this.world.plates[d.pl.id] ? validPlate(d.pl) : null;
    r.pl = pl ? { id: d.pl!.id, ...pl } : null;
    if (r.pl) this.plateCache[r.pl.id] = validPlate(r.pl)!;
    this.onMove({ id: d.id, x: d.x, z: d.z, ry: d.ry });
    this.refresh();
  }
  private onEvent(e: EventPayload) {
    const r = this.remotes.get(e.id);
    if (!r) return;
    const sameTable = this.sameTableAsMe(r.pres.seat);
    switch (e.k) {
      case "drink":
        playAnim(r.av, "drink");
        break;
      case "cheer":
        playAnim(r.av, "cheer");
        r.cheerAt = now();
        if (r.pres.seat && this.world.seats[r.pres.seat]) this.checkClink(this.world.seats[r.pres.seat].table);
        break;
      case "pour":
        playAnim(r.av, "pour");
        if (sameTable) this.sound.pour();
        if (e.to === this.myId) this.receivePour(r.pres.nick, r.pres.seat);
        break;
      case "eat":
        playAnim(r.av, "eat", clampInt(e.d, 0, DISHES.length - 1));
        if (sameTable) this.sound.eat();
        if (this.world.plates[e.pl] && r.pres.seat && this.world.seats[r.pres.seat]?.plate === e.pl) this.takePiece(e.pl);
        break;
      case "say":
        if (PHRASE_MAP[e.p]) { this.showBubble(r.bubble, e.p); if (!r.av.anim) playAnim(r.av, "talk"); }
        break;
    }
  }

  private createRemote(id: string, p: PresencePayload) {
    const pres = sanitizePresence(p);
    const av = makeChar(this.scene, pres.col, 0x3b4a5e);
    av.root.position.set(0, 0, 4);
    const r: Remote = { id, pres, glass: 0, pl: null, x: 0, z: 4, ry: Math.PI, hasPos: false, av, label: this.mkLabel("", false), bubble: this.mkBubble(), cheerAt: -1e9 };
    this.setRemoteLabel(r);
    this.remotes.set(id, r);
  }
  private setRemoteLabel(r: Remote) { r.label.textContent = `${r.pres.lang === "ja" ? "🇯🇵" : "🇰🇷"} ${r.pres.nick}`; }
  private removeRemote(id: string) {
    const r = this.remotes.get(id);
    if (!r) return;
    if (r.pl) this.plateCache[r.pl.id] = validPlate(r.pl)!;
    disposeChar(r.av);
    r.label.remove();
    r.bubble.el.remove();
    this.remotes.delete(id);
  }

  private resolveMySeat() {
    if (!this.me.seat) return;
    for (const r of this.remotes.values()) {
      if (r.pres.seat !== this.me.seat) continue;
      if (r.pres.seatT < this.me.seatT || (r.pres.seatT === this.me.seatT && r.id < this.myId)) {
        this.standUp();
        this.toast(this.T.taken);
        return;
      }
    }
  }

  /* ---------------- rules ---------------- */

  private get T() { return UI[this.lang]; }

  private occupancy(): Record<string, Occupant> {
    const occ: Record<string, Occupant> = {};
    if (this.me.seat) occ[this.me.seat] = { id: "me", glass: this.me.glass, nick: this.me.nick, t: this.me.seatT };
    for (const r of this.remotes.values()) {
      const s = r.pres.seat;
      if (!s || !this.world.seats[s]) continue;
      const cand: Occupant = { id: r.id, glass: r.glass, nick: r.pres.nick, t: r.pres.seatT };
      const cur = occ[s];
      if (!cur || (cur.id !== "me" && (cand.t < cur.t || (cand.t === cur.t && r.id < cur.id)))) occ[s] = cand;
    }
    if (this.bot.active && !occ[BOT_SEAT]) occ[BOT_SEAT] = { id: "bot", glass: this.bot.glass, nick: this.T.botName, t: 0 };
    return occ;
  }

  private currentTargets(occ: Record<string, Occupant>): (Occupant & { seat: Seat })[] {
    if (!this.me.seat) return [];
    const s = this.world.seats[this.me.seat];
    return this.world.seatList
      .filter((x) => x.table === s.table && x.side !== s.side && occ[x.id])
      .map((x) => ({ seat: x, ...occ[x.id] }))
      .sort((a, b) => Math.abs(a.seat.i - s.i) - Math.abs(b.seat.i - s.i));
  }

  private isOpposite(a: string | null, b: string | null) {
    const A = a ? this.world.seats[a] : null, B = b ? this.world.seats[b] : null;
    return !!A && !!B && A.table === B.table && A.side !== B.side;
  }
  private sameTableAsMe(seatId: string | null) {
    return !!this.me.seat && !!seatId && !!this.world.seats[seatId] && this.world.seats[this.me.seat].table === this.world.seats[seatId].table;
  }

  private sitDown(seat: Seat) {
    if (this.me.seat || !this.myAv) return;
    this.me.seat = seat.id;
    this.me.seatT = Date.now();
    this.me.glass = 0;
    this.me.x = seat.x; this.me.z = seat.z; this.me.ry = seat.ry;
    this.camYaw = seat.ry; this.camDist = 2.7;
    this.myAv.seated = true;
    this.masterWait = 0;
    this.selTarget = null;
    this.pushPresence();
    this.sendState();
    this.sound.pop();
    this.refresh(true);
  }
  private standUp() {
    if (!this.me.seat || !this.myAv) return;
    const s = this.world.seats[this.me.seat];
    this.me.seat = null;
    this.me.x = s.x - Math.sin(s.ry) * 0.75;
    this.me.z = s.z - Math.cos(s.ry) * 0.75;
    this.myAv.seated = false;
    this.camDist = 4.2;
    this.pushPresence();
    this.syncMyPlate(this.occupancy());
    this.sendState();
    this.refresh(true);
  }
  private receivePour(nick: string, fromSeat: string | null) {
    if (!this.me.seat || this.me.glass >= FULL || !this.isOpposite(this.me.seat, fromSeat)) return;
    this.me.glass = FULL;
    this.stats.got++;
    this.sendState();
    this.sound.pour();
    this.toast(this.T.poured(nick));
    this.refresh(true);
  }
  private playMine(k: "drink" | "pour" | "eat" | "cheer", d?: number) { if (this.myAv) playAnim(this.myAv, k, d); }

  private checkClink(tableId: string) {
    const t = now();
    if (this.lastClink[tableId] && t - this.lastClink[tableId] < CHEER_WINDOW_MS) return;
    let c = 0;
    if (this.me.seat && this.world.seats[this.me.seat].table === tableId && t - this.myCheerAt < CHEER_WINDOW_MS) c++;
    for (const r of this.remotes.values()) if (r.pres.seat && this.world.seats[r.pres.seat]?.table === tableId && t - r.cheerAt < CHEER_WINDOW_MS) c++;
    if (this.bot.active && this.world.seats[BOT_SEAT].table === tableId && t - this.bot.cheerAt < CHEER_WINDOW_MS) c++;
    if (c < 2) return;
    this.lastClink[tableId] = t;
    const tb = TABLES.find((x) => x.id === tableId)!;
    const el = document.createElement("div");
    el.className = "burst";
    el.textContent = this.T.kanpai;
    this.labels.appendChild(el);
    this.placeDom(el, new THREE.Vector3(tb.x, 1.4, tb.z), 0);
    setTimeout(() => el.remove(), 1400);
    if (!this.me.seat || this.world.seats[this.me.seat].table === tableId) this.sound.clink();
  }

  /* ---------------- shared plates ---------------- */

  /** The plate's keeper: occupant on side a, else side b. Only the keeper changes plate state. */
  private plateOwner(pid: string, occ: Record<string, Occupant>) {
    const P = this.world.plates[pid];
    const a = occ[P.seats[0]], b = occ[P.seats[1]];
    return a ? a.id : b ? b.id : null;
  }
  private plateState(pid: string, occ: Record<string, Occupant>): PlateRuntime {
    const owner = this.plateOwner(pid, occ);
    if (owner === "me" && this.me.pl && this.me.pl.id === pid) return this.me.pl;
    if (owner === "bot") return this.botPlates[pid] || (this.botPlates[pid] = { ...(this.plateCache[pid] || defaultPlate(pid)) });
    if (owner && owner !== "me") {
      const r = this.remotes.get(owner);
      if (r?.pl && r.pl.id === pid) return r.pl;
    }
    return this.plateCache[pid] || defaultPlate(pid);
  }
  private syncMyPlate(occ: Record<string, Occupant>) {
    const pid = this.me.seat ? this.world.seats[this.me.seat].plate : null;
    const mine = !!pid && this.plateOwner(pid, occ) === "me";
    if (mine && (!this.me.pl || this.me.pl.id !== pid)) {
      this.me.pl = { id: pid!, ...(this.plateCache[pid!] || defaultPlate(pid!)) };
      this.sendState();
    } else if (!mine && this.me.pl) {
      this.plateCache[this.me.pl.id] = validPlate(this.me.pl)!;
      this.me.pl = null;
      this.sendState();
    }
    if (this.me.pl && this.me.pl.l === 0)
      this.scheduleRefill(this.me.pl.id, () => this.me.pl, (st) => {
        if (!this.me.pl) return;
        this.me.pl = { id: this.me.pl.id, ...st };
        this.plateCache[this.me.pl.id] = st;
        this.sendState();
      });
    for (const bp of Object.keys(this.botPlates))
      if (this.botPlates[bp].l === 0) this.scheduleRefill(bp, () => this.botPlates[bp], (st) => { this.botPlates[bp] = st; });
  }
  private scheduleRefill(pid: string, get: () => PlateRuntime | null | undefined, set: (s: PlateRuntime) => void) {
    if (this.refillTimers[pid]) return;
    this.refillTimers[pid] = setTimeout(() => {
      this.refillTimers[pid] = null;
      const cur = get();
      if (!cur || cur.l > 0) return;
      set(freshPlate(cur.d));
      this.refresh(true);
    }, PLATE_REFILL_MS);
  }
  private takePiece(pid: string) {
    if (this.me.pl && this.me.pl.id === pid && this.me.pl.l > 0) {
      this.me.pl = { ...this.me.pl, l: this.me.pl.l - 1, v: this.me.pl.v + 1 };
      this.plateCache[pid] = validPlate(this.me.pl)!;
      this.sendState();
      return true;
    }
    const bp = this.botPlates[pid];
    if (bp && bp.l > 0) { this.botPlates[pid] = { ...bp, l: bp.l - 1, v: bp.v + 1 }; return true; }
    return false;
  }

  /* ---------------- practice bot (only while nobody else is here) ---------------- */

  private maybeBot() {
    if (this.entered && this.remotes.size === 0 && !this.bot.active && now() - this.enteredAt > 2500) this.botJoin();
  }
  private botJoin() {
    const b = this.bot;
    b.active = true;
    b.glass = FULL;
    b.av = makeChar(this.scene, 0x8a6a3a, 0x5a4636, 0x2b1b11);
    b.av.seated = true;
    const s = this.world.seats[BOT_SEAT];
    b.av.root.position.set(s.x, 0, s.z);
    b.av.root.rotation.y = s.ry;
    b.label = this.mkLabel("🤖 " + this.T.botName, false);
    b.bubble = this.mkBubble();
    b.next = now() + 4000;
  }
  private botLeave() {
    const b = this.bot;
    if (!b.active) return;
    b.active = false;
    for (const k in this.botPlates) { this.plateCache[k] = this.botPlates[k]; delete this.botPlates[k]; }
    if (b.av) disposeChar(b.av);
    b.label?.remove();
    b.bubble?.el.remove();
    b.av = null; b.label = null; b.bubble = null;
  }
  private botSay(k: string, delay = 700) {
    setTimeout(() => { if (this.bot.active && this.bot.bubble && this.bot.av) { this.showBubble(this.bot.bubble, k); playAnim(this.bot.av, "talk"); } }, delay);
  }
  private botHear(k: string) {
    if (!this.bot.active || !this.isOpposite(this.me.seat, BOT_SEAT)) return;
    const o = BOT_REPLY[k];
    if (o) this.botSay(o[(Math.random() * o.length) | 0], 900 + Math.random() * 700);
  }
  private botTick() {
    const b = this.bot;
    if (!b.active || !b.av) return;
    if (b.pourAt && now() > b.pourAt) {
      b.pourAt = 0;
      if (this.isOpposite(this.me.seat, BOT_SEAT) && this.me.glass < FULL) {
        playAnim(b.av, "pour");
        setTimeout(() => { if (this.me.seat && this.me.glass < FULL) this.receivePour(this.T.botName, BOT_SEAT); }, 700);
      }
    }
    if (now() < b.next) return;
    b.next = now() + 3500 + Math.random() * 4500;
    const opp = this.isOpposite(this.me.seat, BOT_SEAT);
    if (opp && this.me.glass === 0 && !b.pourAt) { b.pourAt = now() + 1800; return; }
    const r = Math.random();
    if (b.glass > 0 && r < 0.4) { playAnim(b.av, "drink"); b.glass--; if (opp) this.sound.gulp(); return; }
    if (b.glass === 0 && opp && r < 0.7) { this.botSay("pourme", 0); return; }
    if (r < 0.6) {
      const pid = this.world.seats[BOT_SEAT].plate;
      const st = this.plateState(pid, this.occupancy());
      if (st.l > 0 && this.takePiece(pid)) { playAnim(b.av, "eat", st.d); if (opp) this.sound.eat(); return; }
    }
    if (opp && r < 0.75) this.botSay(["dots", "yum", "tired", "week"][(Math.random() * 4) | 0], 0);
  }

  /* ---------------- DOM overlay ---------------- */

  private mkLabel(text: string, isMe: boolean) {
    const el = document.createElement("div");
    el.className = "label" + (isMe ? " me" : "");
    el.textContent = text;
    this.labels.appendChild(el);
    return el;
  }
  private mkBubble(): Bubble {
    const el = document.createElement("div");
    el.className = "bubble";
    el.hidden = true;
    this.labels.appendChild(el);
    return { el, until: 0 };
  }
  private showBubble(b: Bubble, key: string) {
    const p = PHRASE_MAP[key];
    if (!p) return;
    b.el.textContent = p[this.lang];
    b.el.hidden = false;
    b.until = now() + 3600;
  }
  private tmpV = new THREE.Vector3();
  private placeDom(el: HTMLElement, pos: THREE.Vector3, yOff: number) {
    const v = this.tmpV.copy(pos);
    v.y += yOff;
    v.project(this.camera);
    if (v.z > 1 || v.z < -1) { el.style.display = "none"; return; }
    el.style.display = "";
    el.style.left = ((v.x + 1) / 2) * this.mount.clientWidth + "px";
    el.style.top = ((1 - v.y) / 2) * this.mount.clientHeight + "px";
  }
  private tickBubble(b: Bubble, pos: THREE.Vector3, y: number, t: number) {
    if (b.el.hidden) return;
    if (t > b.until) b.el.hidden = true;
    else this.placeDom(b.el, pos, y);
  }

  private toast(text: string) {
    this.toastState = { id: ++this.toastSeq, text };
    this.refresh(true);
  }

  /* ---------------- input ---------------- */

  private bindInput() {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.entered || (e.target as HTMLElement)?.tagName === "INPUT") return;
      this.keys[e.code] = true;
      if (e.repeat) return;
      if (e.code === "KeyE") { if (this.me.seat) this.standUp(); else this.sit(); }
      if (e.code === "Digit1") this.pour();
      if (e.code === "Digit2") this.drink();
      if (e.code === "Digit3") this.eat();
      if (e.code === "Digit4") this.cheer();
    };
    const onKeyUp = (e: KeyboardEvent) => { this.keys[e.code] = false; };
    const onBlur = () => { for (const k in this.keys) this.keys[k] = false; };
    const onResize = () => this.resize();
    const cv = this.renderer.domElement;
    let drag: { id: number; x: number } | null = null;
    const down = (e: PointerEvent) => { drag = { id: e.pointerId, x: e.clientX }; cv.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (drag && drag.id === e.pointerId) { this.camYaw -= (e.clientX - drag.x) * 0.006; drag.x = e.clientX; } };
    const up = () => { drag = null; };
    const wheel = (e: WheelEvent) => { this.camDist = Math.min(7, Math.max(1.8, this.camDist + e.deltaY * 0.004)); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onResize);
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", wheel, { passive: true });
    this.disposers.push(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onResize);
    });
  }

  private resize() {
    const w = this.mount.clientWidth || window.innerWidth, h = this.mount.clientHeight || window.innerHeight;
    const pix = Math.max(1.6, h / 330);
    this.renderer.setSize(Math.round(w / pix), Math.round(h / pix), false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private collide(x: number, z: number): [number, number] {
    const r = 0.28;
    x = Math.min(ROOM.x1 - 0.4, Math.max(ROOM.x0 + 0.4, x));
    z = Math.min(ROOM.z1 - 0.4, Math.max(COUNTER_FRONT_Z, z));
    for (const t of TABLES) {
      const hx = TABLE_HALF.x + r, hz = TABLE_HALF.z + r, dx = x - t.x, dz = z - t.z;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
        if (hx - Math.abs(dx) < hz - Math.abs(dz)) x = t.x + Math.sign(dx || 1) * hx;
        else z = t.z + Math.sign(dz || 1) * hz;
      }
    }
    return [x, z];
  }

  /* ---------------- frame loop ---------------- */

  private introA = 0;
  private lookAt = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private last = now();

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const t = now();
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;

    this.world.lanterns.forEach((g, i) => (g.rotation.z = Math.sin(t * 0.0012 + i) * 0.05));
    this.master.root.rotation.y = Math.sin(t * 0.0005) * 0.4;
    updateChar(this.master, dt);

    if (!this.entered || !this.myAv) {
      this.introA += dt * 0.08;
      this.camera.position.set(Math.sin(this.introA) * 1.5, 2.2, 6.2);
      this.camera.lookAt(0, 1.0, 0);
      this.renderPlates({});
      this.placeDom(this.masterLabel, this.master.root.position, 1.85);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const me = this.me, av = this.myAv;

    if (!me.seat) {
      let fx = 0, fy = 0;
      const k = this.keys;
      if (k.KeyW || k.ArrowUp) fy += 1;
      if (k.KeyS || k.ArrowDown) fy -= 1;
      if (k.KeyD || k.ArrowRight) fx += 1;
      if (k.KeyA || k.ArrowLeft) fx -= 1;
      fx += this.joy.x;
      fy -= this.joy.y;
      const mag = Math.min(1, Math.hypot(fx, fy));
      const run = k.ShiftLeft || k.ShiftRight ? 1.6 : 1;
      const walking = mag > 0.08;
      if (walking) {
        const y = this.camYaw;
        const dx = Math.sin(y) * fy - Math.cos(y) * fx, dz = Math.cos(y) * fy + Math.sin(y) * fx;
        const l = Math.hypot(dx, dz) || 1, sp = 2.4 * run * mag * dt;
        [me.x, me.z] = this.collide(me.x + (dx / l) * sp, me.z + (dz / l) * sp);
        let d = Math.atan2(dx, dz) - me.ry;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        me.ry += d * Math.min(1, dt * 12);
        av.speed = mag * run;
        if (t - this.lastMove > 1000 / MOVE_HZ) { this.lastMove = t; this.room?.send("mv", { id: this.myId, x: r2(me.x), z: r2(me.z), ry: r2(me.ry) }); }
      } else av.speed = 0;
      if (this.wasWalking && !walking) this.sendState(); // final resting position
      this.wasWalking = walking;
      av.root.position.set(me.x, av.root.position.y, me.z);
      av.root.rotation.y = me.ry;
      const occ = this.occupancy();
      let best: Seat | null = null, bd = 0.95;
      for (const s of this.world.seatList) {
        if (occ[s.id]) continue;
        const d = Math.hypot(s.x - me.x, s.z - me.z);
        if (d < bd) { bd = d; best = s; }
      }
      if (best !== this.nearSeat) { this.nearSeat = best; this.refresh(true); }
    } else {
      const s = this.world.seats[me.seat];
      av.root.position.set(s.x, av.root.position.y, s.z);
      av.root.rotation.y = s.ry;
      av.speed = 0;
      this.nearSeat = null;
      const tg = this.currentTargets(this.occupancy());
      if (!tg.length && me.glass === 0) {
        this.masterWait += dt;
        if (this.masterWait > MASTER_POUR_AFTER_S) {
          this.masterWait = 0;
          playAnim(this.master, "pour");
          this.showBubble(this.masterBubble, "one");
          setTimeout(() => {
            if (this.me.seat && this.me.glass === 0) { this.me.glass = FULL; this.stats.got++; this.sendState(); this.sound.pour(); this.toast(this.T.master); }
          }, 800);
        }
      } else this.masterWait = 0;
    }
    updateChar(av, dt);
    if (t - this.lastHeartbeat > STATE_HEARTBEAT_MS) this.sendState();

    const occ = this.occupancy();
    for (const r of this.remotes.values()) {
      const ra = r.av, sid = r.pres.seat;
      if (sid && this.world.seats[sid] && occ[sid]?.id === r.id) {
        const s = this.world.seats[sid];
        ra.seated = true;
        ra.root.position.x = s.x;
        ra.root.position.z = s.z;
        ra.root.rotation.y = s.ry;
        ra.speed = 0;
      } else {
        ra.seated = false;
        const kk = 1 - Math.exp(-dt * 10), ox = ra.root.position.x, oz = ra.root.position.z;
        ra.root.position.x += (r.x - ox) * kk;
        ra.root.position.z += (r.z - oz) * kk;
        let dr = r.ry - ra.root.rotation.y;
        dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        ra.root.rotation.y += dr * kk;
        ra.speed = Math.min(1.6, Math.hypot(ra.root.position.x - ox, ra.root.position.z - oz) / Math.max(dt, 1e-3) / 2.4);
      }
      updateChar(ra, dt);
      this.placeDom(r.label, ra.root.position, 1.95);
      this.tickBubble(r.bubble, ra.root.position, 2.25, t);
    }
    if (this.bot.active && this.bot.av) {
      this.botTick();
      updateChar(this.bot.av, dt);
      if (this.bot.label) this.placeDom(this.bot.label, this.bot.av.root.position, 1.95);
      if (this.bot.bubble) this.tickBubble(this.bot.bubble, this.bot.av.root.position, 2.25, t);
    }

    this.syncMyPlate(occ);
    this.renderPlates(occ);
    for (const s of this.world.seatList) {
      const o = occ[s.id];
      this.world.setGlass(s, o ? o.glass : 0);
      const oav = !o ? null : o.id === "me" ? av : o.id === "bot" ? this.bot.av : this.remotes.get(o.id)?.av;
      s.glass.group.visible = !(oav?.anim && (oav.anim.k === "drink" || oav.anim.k === "cheer"));
    }
    this.world.highlightSeat(this.nearSeat);

    // camera
    if (me.seat) {
      const s = this.world.seats[me.seat];
      const tb = TABLES.find((x) => x.id === s.table)!;
      this.lookAt.set(s.x * 0.5 + tb.x * 0.5, 1.0, tb.z);
      this.camPos.set(s.x - Math.sin(this.camYaw) * this.camDist, 2.6, s.z - Math.cos(this.camYaw) * this.camDist);
    } else {
      this.lookAt.set(me.x, 1.15, me.z);
      this.camPos.set(me.x - Math.sin(this.camYaw) * this.camDist, 2.6, me.z - Math.cos(this.camYaw) * this.camDist);
    }
    this.camPos.x = Math.min(6.2, Math.max(-6.2, this.camPos.x));
    this.camPos.z = Math.min(4.8, Math.max(-4.7, this.camPos.z));
    this.camera.position.lerp(this.camPos, 1 - Math.exp(-dt * 8));
    this.camera.lookAt(this.lookAt);

    // seated, my own name tag would float over the person across the table, so hide it
    if (this.myLabel) { this.myLabel.hidden = !!me.seat; if (!me.seat) this.placeDom(this.myLabel, av.root.position, 1.95); }
    if (this.myBubble) this.tickBubble(this.myBubble, av.root.position, 2.25, t);
    this.placeDom(this.masterLabel, this.master.root.position, 1.85);
    this.tickBubble(this.masterBubble, this.master.root.position, 2.15, t);

    if (t - this.lastSnapAt > 200) this.refresh();
    this.renderer.render(this.scene, this.camera);
  };

  private renderPlates(occ: Record<string, Occupant>) {
    for (const pid in this.world.plates) {
      const st = this.plateState(pid, occ);
      this.world.setPlate(pid, st.d, st.l);
      if (this.me.seat && this.world.seats[this.me.seat].plate === pid) {
        const key = `${st.d}`;
        const prev = this.lastDishSeen[pid];
        if (prev !== undefined && prev !== key && st.l === DISHES[st.d].n) this.toast(this.T.refill(DISHES[st.d][this.lang]));
        this.lastDishSeen[pid] = key;
      } else delete this.lastDishSeen[pid];
    }
  }

  /* ---------------- snapshot for React ---------------- */

  private computeSnapshot(): Snapshot {
    const T = this.T;
    const seated = !!this.me.seat;
    const occ = this.occupancy();
    const tg = this.currentTargets(occ);
    if (seated && !tg.find((x) => x.id === this.selTarget)) this.selTarget = tg.length ? tg[0].id : null;
    const cur = tg.find((x) => x.id === this.selTarget);
    const plate = seated ? this.plateState(this.world.seats[this.me.seat!].plate, occ) : null;
    let hint: string | null = null;
    if (this.entered) {
      if (!seated) hint = this.nearSeat ? T.hintNear : T.hintWalk;
      else if (!tg.length) hint = T.hintSeatNobody;
      else if (this.me.glass === 0) hint = T.hintEmpty;
    }
    return {
      entered: this.entered,
      lang: this.lang,
      muted: this.sound.muted,
      seated,
      canSit: !seated && !!this.nearSeat,
      targets: tg.map((x) => ({ id: x.id, nick: x.nick, glass: x.glass })),
      selTarget: this.selTarget,
      canPour: !!cur && cur.glass < FULL && now() >= this.pourCooldown,
      canDrink: this.me.glass > 0,
      dish: plate ? { name: DISHES[plate.d][this.lang], left: plate.l } : null,
      hint,
      stats: { ...this.stats },
      net: { mode: this.netMode, people: this.remotes.size + 1, shop: this.room?.shop ?? 0 },
      toast: this.toastState,
    };
  }

  private refresh(force = false) {
    if (!force && now() - this.lastSnapAt < 200) return;
    this.lastSnapAt = now();
    const s = this.computeSnapshot();
    const key = JSON.stringify(s);
    if (key === this.snapKey) return;
    this.snapKey = key;
    this.snap = s;
    this.listeners.forEach((fn) => fn());
  }
}

/* ------------------------------------------------------------------ helpers */

function makeId() {
  try {
    const k = "sakaba.id";
    const existing = sessionStorage.getItem(k);
    if (existing) return existing;
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    sessionStorage.setItem(k, id);
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 18);
  }
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function sanitizePresence(p: PresencePayload): PresencePayload {
  return {
    v: PROTOCOL_VERSION,
    id: String(p.id),
    nick: String(p.nick || "?").replace(/[\u0000-\u001f​-‏‪-‮]/g, "").slice(0, 12),
    lang: p.lang === "ja" ? "ja" : "ko",
    col: COLORS.includes(p.col) ? p.col : COLORS[1],
    seat: typeof p.seat === "string" ? p.seat : null,
    seatT: Number(p.seatT) || 0,
  };
}
function validPlate(s: { d: unknown; l: unknown; v: unknown } | null | undefined): PlateRuntime | null {
  if (!s) return null;
  const d = Number(s.d);
  if (!Number.isInteger(d) || d < 0 || d >= DISHES.length) return null;
  return { d, l: clampInt(s.l, 0, DISHES[d].n), v: Number(s.v) || 0 };
}
function freshPlate(prev: number): PlateRuntime {
  let d: number;
  do d = (Math.random() * DISHES.length) | 0;
  while (DISHES.length > 1 && d === prev);
  return { d, l: DISHES[d].n, v: Date.now() % 100000 };
}
function defaultPlate(id: string): PlateRuntime {
  const k = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const d = k % DISHES.length;
  return { d, l: DISHES[d].n, v: 0 };
}
