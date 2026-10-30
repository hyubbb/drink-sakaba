/** A glass is finished in this many sips; pouring always fills it to FULL. */
export const FULL = 3;

/** People allowed in one shop channel (12 seats + a few walking around). */
export const SHOP_CAPACITY = 16;
export const MAX_SHOPS = 9;

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
  key: "yakitori" | "edamame" | "karaage" | "oden" | "tofu";
  ko: string;
  ja: string;
  n: number;
  bite: number;
  biteScale: [number, number, number];
};

export const DISHES: Dish[] = [
  { key: "yakitori", ko: "꼬치", ja: "焼き鳥", n: 3, bite: 0x8a4a22, biteScale: [1, 1, 1] },
  { key: "edamame", ko: "풋콩", ja: "枝豆", n: 6, bite: 0x7fb24a, biteScale: [1.3, 0.5, 0.6] },
  { key: "karaage", ko: "가라아게", ja: "唐揚げ", n: 5, bite: 0xc27a2c, biteScale: [1.1, 1.1, 1.1] },
  { key: "oden", ko: "오뎅", ja: "おでん", n: 3, bite: 0xe8d6a8, biteScale: [1, 1.2, 1] },
  { key: "tofu", ko: "히야얏코", ja: "冷奴", n: 4, bite: 0xf7f4ea, biteScale: [1, 0.9, 1] },
];

export const clampInt = (v: unknown, a: number, b: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : a;
};
