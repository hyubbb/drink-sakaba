/** A glass is finished in this many sips; pouring always fills it to FULL. */
export const FULL = 3;

/** People allowed in one channel (12 seats + a few walking around). */
export const CHANNEL_CAPACITY = 16;
/** Channels per venue, like game-server channels: 1채널 … 5채널. */
export const CHANNEL_COUNT = 5;

export type Venue = "izakaya" | "pocha";
export const VENUES: Venue[] = ["izakaya", "pocha"];
export const VENUE_INFO: Record<Venue, { ko: string; ja: string; sign: string; npc: { ko: string; ja: string } }> = {
  izakaya: { ko: "이자카야", ja: "居酒屋", sign: "souka 酒場", npc: { ko: "대장", ja: "大将" } },
  pocha: { ko: "포차", ja: "ポチャ", sign: "souka 포차", npc: { ko: "이모", ja: "おばちゃん" } },
};

/** Movement broadcast rate while walking (Hz). Seated people send nothing. */
export const MOVE_HZ = 5;
/** Full-state heartbeat so missed messages heal themselves (ms). */
export const STATE_HEARTBEAT_MS = 20000;

export const PLATE_REFILL_MS = 2500;
export const MASTER_POUR_AFTER_S = 10;
export const CHEER_WINDOW_MS = 2500;
export const SAY_COOLDOWN_MS = 1200;

export const COLORS = [0xd4442a, 0x3d7ea6, 0x6aa84f, 0xe69138, 0x8e5cc2, 0xc2577a, 0x2f9e8f, 0xb8902a];

export const ROOM = { x0: -6.5, x1: 6.5, z0: -5, z1: 5 };
export const COUNTER_FRONT_Z = -2.75;

export type TableDef = { id: string; x: number; z: number };
/** Two tables, six seats each: three on side a facing three on side b. */
export const TABLES: TableDef[] = [
  { id: "t1", x: -2.7, z: 0.6 },
  { id: "t2", x: 2.7, z: 0.6 },
];
export const TABLE_HALF = { x: 1.65, z: 0.55 };

export type Dish = {
  key:
    | "yakitori" | "edamame" | "karaage" | "oden" | "tofu"
    | "tteokbokki" | "eomuk" | "gyeranmari" | "dakkochi" | "golbaengi";
  ko: string;
  ja: string;
  /** pieces on a full plate; one press takes one */
  n: number;
  /** colour of the piece carried to the mouth */
  bite: number;
  biteScale: [number, number, number];
  /** eaten off a skewer instead of with chopsticks */
  skewer?: boolean;
};

export const VENUE_DISHES: Record<Venue, Dish[]> = {
  izakaya: [
    { key: "yakitori", ko: "꼬치", ja: "焼き鳥", n: 3, bite: 0x8a4a22, biteScale: [1, 1, 1], skewer: true },
    { key: "edamame", ko: "풋콩", ja: "枝豆", n: 6, bite: 0x7fb24a, biteScale: [1.3, 0.5, 0.6] },
    { key: "karaage", ko: "가라아게", ja: "唐揚げ", n: 5, bite: 0xc27a2c, biteScale: [1.1, 1.1, 1.1] },
    { key: "oden", ko: "오뎅", ja: "おでん", n: 3, bite: 0xe8d6a8, biteScale: [1, 1.2, 1] },
    { key: "tofu", ko: "히야얏코", ja: "冷奴", n: 4, bite: 0xf7f4ea, biteScale: [1, 0.9, 1] },
  ],
  pocha: [
    { key: "tteokbokki", ko: "떡볶이", ja: "トッポッキ", n: 6, bite: 0xe0563a, biteScale: [0.6, 0.6, 1.3] },
    { key: "eomuk", ko: "어묵꼬치", ja: "韓国おでん", n: 3, bite: 0xc9a066, biteScale: [1, 1, 1], skewer: true },
    { key: "gyeranmari", ko: "계란말이", ja: "卵焼き", n: 4, bite: 0xf5cf4a, biteScale: [1.2, 0.9, 0.9] },
    { key: "dakkochi", ko: "닭꼬치", ja: "タッコチ", n: 3, bite: 0xa8402a, biteScale: [1, 1, 1], skewer: true },
    { key: "golbaengi", ko: "골뱅이무침", ja: "つぶ貝和え", n: 5, bite: 0x6b4a2a, biteScale: [0.9, 0.9, 0.9] },
  ],
};

export const clampInt = (v: unknown, a: number, b: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : a;
};
