import * as THREE from "three";
import { TABLES, VENUE_DISHES, VENUE_DRINK, clampInt, type Dish, type Venue } from "./constants";
import { basic, box, ctex, cyl, lam } from "./mesh";

export type Seat = {
  id: string;
  table: string;
  side: "a" | "b";
  i: number;
  x: number;
  z: number;
  ry: number;
  plate: string;
  cush: THREE.Mesh;
  glass: { group: THREE.Group; liquid: THREE.Mesh; foam: THREE.Mesh | null };
};

export type Plate = {
  id: string;
  table: string;
  i: number;
  seats: [string, string];
  dishes: { group: THREE.Group; pieces: THREE.Object3D[] }[];
};

export type World = {
  seats: Record<string, Seat>;
  seatList: Seat[];
  plates: Record<string, Plate>;
  /** hanging lights that sway a little */
  lanterns: THREE.Group[];
  setGlass: (seat: Seat, level: number) => void;
  setPlate: (plateId: string, dish: number, left: number) => void;
  highlightSeat: (seat: Seat | null) => void;
};

/** Per-venue look of the shared furniture (tables, seats, glasses, bottles). */
type Furniture = {
  tableTop: THREE.Material;
  tableLeg: THREE.Material;
  stools: THREE.Material[];
  cushion: number | null;
  bottle: number;
  bottleLabel: THREE.Texture;
  glass: { rt: number; rb: number; h: number; liquid: number; liquidOpacity: number; foam: boolean };
};

export function buildWorld(scene: THREE.Scene, venue: Venue): World {
  const { lanterns, furniture } = venue === "izakaya" ? buildIzakaya(scene) : buildPocha(scene);
  const seats: Record<string, Seat> = {};
  const F = furniture;
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.32 });
  // glass and bottle come from the venue's drink style, so the table glass matches the one in hand
  const D = VENUE_DRINK[venue];
  const liquidMat = new THREE.MeshLambertMaterial({ color: D.glass.liquid, transparent: true, opacity: D.glass.liquidOpacity });
  const foamMat = lam(0xfff6e0);
  const cushionMat = F.cushion !== null ? lam(F.cushion) : null;
  const hiMat = new THREE.MeshLambertMaterial({ color: F.cushion ?? 0xffffff, emissive: 0x553300 });
  const G = D.glass, B = D.bottle;

  for (const t of TABLES) {
    const tg = new THREE.Group();
    tg.position.set(t.x, 0, t.z);
    scene.add(tg);
    box(3.3, 0.07, 1.1, F.tableTop, 0, 0.76, 0, tg);
    for (const sx of [-1.5, 1.5]) for (const sz of [-0.42, 0.42]) box(0.08, 0.73, 0.08, F.tableLeg, sx, 0.365, sz, tg);
    for (const bx of [-0.5, 0.5]) {
      const bg = new THREE.Group();
      bg.position.set(bx, 0.8, 0);
      tg.add(bg);
      const bm = new THREE.MeshLambertMaterial({ color: B.color, transparent: B.opacity < 1, opacity: B.opacity });
      cyl(B.body[0], B.body[1], B.body[2], 7, bm, 0, B.body[2] / 2, 0, bg);
      cyl(B.neck[0], B.neck[1], B.neck[2], 6, bm, 0, B.body[2] + B.neck[2] / 2, 0, bg);
      const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.12, 7, 1, true), lam(0xffffff, F.bottleLabel));
      lb.position.y = 0.15;
      bg.add(lb);
    }
    for (const side of ["a", "b"] as const) {
      const dz = side === "a" ? -1 : 1;
      for (let i = 0; i < 3; i++) {
        const id = `${t.id}-${side}${i}`;
        const x = t.x + (i - 1) * 1.0, z = t.z + dz * 0.98;
        const stoolMat = F.stools[(i + (side === "a" ? 0 : 1)) % F.stools.length];
        let cush: THREE.Mesh;
        if (cushionMat) {
          cyl(0.2, 0.22, 0.42, 8, stoolMat, x, 0.21, z, scene);
          cush = cyl(0.23, 0.23, 0.06, 8, cushionMat, x, 0.45, z, scene);
        } else {
          // plastic pojangmacha stool: flared legs, round top
          cyl(0.17, 0.24, 0.4, 8, stoolMat, x, 0.2, z, scene);
          cush = cyl(0.21, 0.21, 0.06, 10, stoolMat, x, 0.44, z, scene);
        }
        cush.userData.base = cush.material;
        const gg = new THREE.Group();
        gg.position.set(x - 0.12, 0.8, t.z + dz * 0.33);
        scene.add(gg);
        cyl(G.rt, G.rb, G.h, 8, glassMat, 0, G.h / 2, 0, gg);
        const liquid = cyl(G.rt * 0.88, G.rb * 0.9, G.h * 0.9, 8, liquidMat, 0, G.h * 0.45, 0, gg);
        const foam = G.foam ? cyl(G.rt * 0.9, G.rt * 0.9, 0.03, 8, foamMat, 0, G.h * 0.9, 0, gg) : null;
        seats[id] = { id, table: t.id, side, i, x, z, ry: side === "a" ? 0 : Math.PI, plate: `${t.id}-p${i}`, cush, glass: { group: gg, liquid, foam } };
      }
    }
  }
  const seatList = Object.values(seats);

  /* shared plates: one per facing pair */
  const dishes = VENUE_DISHES[venue];
  const plates: Record<string, Plate> = {};
  for (const t of TABLES)
    for (let i = 0; i < 3; i++) {
      const id = `${t.id}-p${i}`;
      const pg = new THREE.Group();
      pg.position.set(t.x + (i - 1) * 1.0 + 0.08, 0.8, t.z);
      pg.rotation.y = (i - 1) * 0.4;
      scene.add(pg);
      plates[id] = { id, table: t.id, i, seats: [`${t.id}-a${i}`, `${t.id}-b${i}`], dishes: dishes.map((d) => buildDish(d, pg)) };
    }

  let lit: Seat | null = null;
  return {
    seats,
    seatList,
    plates,
    lanterns,
    setGlass(seat, level) {
      const full = VENUE_DRINK[venue].sips;
      const L = clampInt(level, 0, full);
      const h = L / full;
      seat.glass.liquid.visible = L > 0;
      seat.glass.liquid.scale.y = Math.max(h, 0.001);
      seat.glass.liquid.position.y = G.h * 0.45 * h + 0.005;
      if (seat.glass.foam) {
        seat.glass.foam.visible = L > 0;
        seat.glass.foam.position.y = G.h * 0.9 * h + 0.01;
      }
    },
    setPlate(plateId, dish, left) {
      plates[plateId].dishes.forEach((d, k) => {
        d.group.visible = k === dish;
        if (k === dish) d.pieces.forEach((m, j) => (m.visible = j < left));
      });
    },
    highlightSeat(seat) {
      if (lit === seat) return;
      if (lit) lit.cush.material = lit.cush.userData.base;
      lit = seat;
      if (lit) {
        const base = lit.cush.userData.base as THREE.MeshLambertMaterial;
        hiMat.color.copy(base.color);
        lit.cush.material = hiMat;
      }
    },
  };
}

/* ======================================================================= izakaya */

function buildIzakaya(scene: THREE.Scene): { lanterns: THREE.Group[]; furniture: Furniture } {
  scene.background = new THREE.Color(0x1b130e);
  scene.fog = new THREE.Fog(0x1b130e, 9, 20);
  scene.add(new THREE.HemisphereLight(0xffd9a8, 0x2a1a10, 2.2));
  const sun = new THREE.DirectionalLight(0xffe2b8, 1.0);
  sun.position.set(2, 6, 4);
  scene.add(sun);

  const floorTex = ctex(64, 64, (g) => {
    for (let i = 0; i < 4; i++) {
      const s = 90 + ((i * 37) % 30);
      g.fillStyle = `rgb(${s},${(s * 0.62) | 0},${(s * 0.38) | 0})`;
      g.fillRect(0, i * 16, 64, 16);
      g.fillStyle = "rgba(0,0,0,.35)";
      g.fillRect(0, i * 16 + 15, 64, 1);
      g.fillRect(((i * 23) % 48) + 8, i * 16, 1, 16);
      g.fillStyle = "rgba(255,220,170,.06)";
      g.fillRect(0, i * 16 + 3, 64, 2);
    }
  }, [7, 5]);
  const wallTex = ctex(32, 32, (g) => {
    g.fillStyle = "#b9a27c";
    g.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(${(80 + Math.random() * 40) | 0},60,30,.12)`;
      g.fillRect((Math.random() * 32) | 0, (Math.random() * 32) | 0, 2, 2);
    }
  }, [6, 2]);
  const tableTex = woodTex();
  const menuTex = (top: string, price: string) =>
    ctex(32, 96, (g, w, h) => {
      g.fillStyle = "#f2e7cd";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#2b1b11";
      g.font = "bold 20px 'M PLUS Rounded 1c',sans-serif";
      g.textAlign = "center";
      g.textBaseline = "top";
      [...top].forEach((ch, i) => g.fillText(ch, 16, 4 + i * 21));
      g.fillStyle = "#b23a22";
      g.font = "bold 11px sans-serif";
      g.fillText(price, 16, h - 16);
    });
  const norenTex = ctex(64, 48, (g, w, h) => {
    g.fillStyle = "#24324f";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1b130e";
    g.fillRect(21, 8, 1, h);
    g.fillRect(42, 8, 1, h);
    g.fillStyle = "#f2e7cd";
    g.font = "bold 22px 'M PLUS Rounded 1c',sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("酒", 32, 24);
  });
  const lanternTex = ctex(32, 32, (g, w, h) => {
    g.fillStyle = "#d4442a";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(0,0,0,.25)";
    for (let i = 0; i < 5; i++) g.fillRect(0, i * 7 + 2, w, 1);
    g.fillStyle = "#1b130e";
    g.font = "bold 16px 'M PLUS Rounded 1c',sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("酒", 16, 17);
  });
  const beerLabel = ctex(16, 16, (g) => {
    g.fillStyle = "#f2e7cd";
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = "#d4442a";
    g.fillRect(3, 4, 10, 8);
    g.fillStyle = "#f1b53d";
    g.fillRect(6, 6, 4, 4);
  });

  shell(scene, lam(0xffffff, floorTex), lam(0xffffff, wallTex), lam(0x2c1c11));
  const beam = lam(0x3a2414);
  for (const z of [-3, 0, 3]) box(13, 0.22, 0.22, beam, 0, 3.05, z, scene);
  box(13, 0.25, 0.25, beam, 0, 1.0, -5.0, scene);
  const nor = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.95), new THREE.MeshLambertMaterial({ map: norenTex, side: THREE.DoubleSide }));
  nor.position.set(0, 1.85, 4.98);
  nor.rotation.y = Math.PI; // readable from inside
  scene.add(nor);

  const menus: [string, string][] = [["焼鳥", "¥180"], ["枝豆", "¥300"], ["おでん", "¥450"], ["生ビール", "¥550"], ["唐揚", "¥480"], ["冷奴", "¥320"]];
  menus.forEach(([t, p], i) => wallPanel(scene, menuTex(t, p), 0.34, 1.0, -6.48, 2.15, -2.6 + i * 0.55, Math.PI / 2));
  menus.slice(0, 4).reverse().forEach(([t, p], i) => wallPanel(scene, menuTex(t, p), 0.34, 1.0, 6.48, 2.15, -1.5 + i * 0.55, -Math.PI / 2));

  const cw = lam(0x6b4428), ct = lam(0xffffff, tableTex);
  box(10, 1.0, 0.55, cw, 0, 0.5, -3.35, scene);
  box(10.2, 0.08, 0.75, ct, 0, 1.04, -3.35, scene);
  box(10, 0.06, 0.35, cw, 0, 1.75, -4.8, scene);
  box(10, 0.06, 0.35, cw, 0, 2.35, -4.8, scene);
  const bottleCols = [0x3d5a2a, 0x5b2d1a, 0x2e3f5c, 0x7a5a22, 0x2a2a2a];
  for (let i = 0; i < 22; i++) {
    const x = -4.7 + i * 0.45, y = i % 2 ? 1.78 : 2.38, c = bottleCols[i % 5];
    cyl(0.07, 0.08, 0.36, 6, lam(c), x, y + 0.18, -4.8, scene);
    cyl(0.025, 0.035, 0.12, 5, lam(c), x, y + 0.42, -4.8, scene);
  }
  box(0.8, 0.55, 0.4, lam(0x222222), 5.6, 2.55, -4.6, scene);
  box(0.66, 0.42, 0.02, basic(0x3a6d8a), 5.6, 2.56, -4.39, scene);

  const lanterns: THREE.Group[] = [];
  const lantern = (x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    scene.add(g);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), new THREE.MeshBasicMaterial({ map: lanternTex }));
    m.scale.y = 1.25;
    g.add(m);
    cyl(0.12, 0.12, 0.06, 8, lam(0x1b130e), 0, 0.33, 0, g);
    cyl(0.12, 0.12, 0.06, 8, lam(0x1b130e), 0, -0.33, 0, g);
    g.add(new THREE.PointLight(0xff9a5a, 4.0, 6.5, 1.4));
    lanterns.push(g);
  };
  lantern(-2.7, 2.45, 0.6);
  lantern(2.7, 2.45, 0.6);
  lantern(0, 2.6, -3.0);

  return {
    lanterns,
    furniture: {
      tableTop: lam(0xffffff, tableTex),
      tableLeg: lam(0x3a2414),
      stools: [lam(0x3a2414)],
      cushion: 0xa8402c,
      bottle: 0x5b2d1a,
      bottleLabel: beerLabel,
      glass: { rt: 0.075, rb: 0.062, h: 0.2, liquid: 0xf1b53d, liquidOpacity: 0.92, foam: true },
    },
  };
}

/* ======================================================================= pocha */

function buildPocha(scene: THREE.Scene): { lanterns: THREE.Group[]; furniture: Furniture } {
  scene.background = new THREE.Color(0x120d12);
  scene.fog = new THREE.Fog(0x120d12, 9, 20);
  scene.add(new THREE.HemisphereLight(0xffd2a0, 0x281410, 2.0));
  const sun = new THREE.DirectionalLight(0xffc89a, 0.8);
  sun.position.set(-2, 6, 3);
  scene.add(sun);

  const floorTex = ctex(32, 32, (g) => {
    g.fillStyle = "#6d6862";
    g.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 90; i++) {
      const v = (Math.random() * 40) | 0;
      g.fillStyle = `rgba(${30 + v},${30 + v},${30 + v},.25)`;
      g.fillRect((Math.random() * 32) | 0, (Math.random() * 32) | 0, 1 + ((Math.random() * 2) | 0), 1);
    }
    g.fillStyle = "rgba(0,0,0,.25)";
    g.fillRect(0, 31, 32, 1);
    g.fillRect(31, 0, 1, 32);
  }, [8, 6]);
  // orange tarp with vertical seams
  const tarpTex = ctex(32, 32, (g) => {
    g.fillStyle = "#e0702a";
    g.fillRect(0, 0, 32, 32);
    g.fillStyle = "rgba(120,30,0,.28)";
    g.fillRect(0, 0, 2, 32);
    g.fillStyle = "rgba(255,200,140,.12)";
    g.fillRect(3, 0, 2, 32);
    for (let i = 0; i < 25; i++) {
      g.fillStyle = "rgba(90,30,0,.08)";
      g.fillRect((Math.random() * 32) | 0, (Math.random() * 32) | 0, 3, 1);
    }
  }, [10, 2]);
  const tableTex = ctex(16, 16, (g) => {
    g.fillStyle = "#b9bcc0";
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = "rgba(255,255,255,.25)";
    g.fillRect(0, 3, 16, 1);
    g.fillStyle = "rgba(0,0,0,.12)";
    g.fillRect(0, 12, 16, 1);
  });
  const menuBoard = ctex(128, 96, (g, w, h) => {
    g.fillStyle = "#f6f1e4";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#c0392b";
    g.lineWidth = 3;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = "#c0392b";
    g.font = "bold 15px 'Black Han Sans','Gowun Dodum',sans-serif";
    g.textBaseline = "top";
    const rows: [string, string][] = [["떡볶이", "5,000"], ["어묵탕", "8,000"], ["계란말이", "9,000"], ["닭꼬치", "4,000"], ["소주", "5,000"]];
    rows.forEach(([a, b], i) => {
      g.fillStyle = i === 4 ? "#2e7d32" : "#c0392b";
      g.textAlign = "left";
      g.fillText(a, 10, 9 + i * 17);
      g.textAlign = "right";
      g.fillText(b, w - 10, 9 + i * 17);
    });
  });
  const sideBoard = ctex(96, 48, (g, w, h) => {
    g.fillStyle = "#c0392b";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#fff5d6";
    g.font = "bold 22px 'Black Han Sans','Gowun Dodum',sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("오늘도 수고했어", w / 2, h / 2);
  });
  const flapTex = ctex(64, 48, (g, w, h) => {
    g.fillStyle = "rgba(220,235,245,.55)";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,.35)";
    for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 1, h);
    g.fillStyle = "#c0392b";
    g.font = "bold 13px 'Black Han Sans','Gowun Dodum',sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("포장마차", w / 2, 12);
  });
  const sojuLabel = ctex(16, 16, (g) => {
    g.fillStyle = "#e9f4ea";
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = "#2e7d32";
    g.fillRect(2, 5, 12, 6);
    g.fillStyle = "#e9f4ea";
    g.fillRect(5, 7, 6, 2);
  });

  const tarp = new THREE.MeshLambertMaterial({ map: tarpTex, side: THREE.DoubleSide });
  shell(scene, lam(0xffffff, floorTex), tarp, tarp);
  // aluminium tent frame
  const pole = lam(0x9ea3a8);
  for (const x of [-6.4, 6.4]) for (const z of [-4.9, -1.6, 1.6, 4.9]) cyl(0.05, 0.05, 3.2, 6, pole, x, 1.6, z, scene);
  for (const z of [-3, 0, 3]) box(13, 0.08, 0.08, pole, 0, 3.08, z, scene);
  // clear plastic flap at the entrance
  const flap = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.2), new THREE.MeshLambertMaterial({ map: flapTex, transparent: true, side: THREE.DoubleSide }));
  flap.position.set(0, 1.3, 4.98);
  flap.rotation.y = Math.PI; // readable from inside
  scene.add(flap);
  wallPanel(scene, menuBoard, 1.6, 1.2, -6.45, 2.0, -0.5, Math.PI / 2);
  wallPanel(scene, sideBoard, 1.6, 0.8, 6.45, 2.2, 0.2, -Math.PI / 2);

  // cooking cart along the back: steel body, pots, cutting board
  const steel = lam(0xc4c8cc), steelDark = lam(0x7d8287);
  box(10, 0.95, 0.6, steel, 0, 0.475, -3.35, scene);
  box(10.2, 0.06, 0.78, steelDark, 0, 0.98, -3.35, scene);
  cyl(0.38, 0.34, 0.32, 10, steelDark, -2.2, 1.17, -3.35, scene);
  cyl(0.35, 0.35, 0.02, 10, lam(0xc06a3a), -2.2, 1.32, -3.35, scene); // eomuk broth
  for (let i = 0; i < 6; i++) cyl(0.006, 0.006, 0.4, 4, lam(0xd9b98a), -2.4 + i * 0.08, 1.45, -3.35 + (i % 2 ? 0.08 : -0.08), scene);
  cyl(0.45, 0.4, 0.08, 12, lam(0x2a2a2a), 1.4, 1.05, -3.35, scene);
  cyl(0.42, 0.42, 0.02, 12, lam(0xd8452c), 1.4, 1.1, -3.35, scene); // tteokbokki pan
  box(0.6, 0.04, 0.4, lam(0xc89a5a), 3.4, 1.03, -3.35, scene);
  // crates of soju on the back wall
  const crate = lam(0x2e7d32), green = new THREE.MeshLambertMaterial({ color: 0x3fa34d, transparent: true, opacity: 0.85 });
  for (let c = 0; c < 4; c++) {
    const cx = -4.2 + c * 2.8;
    box(1.1, 0.35, 0.45, crate, cx, 0.18, -4.7, scene);
    box(1.1, 0.35, 0.45, crate, cx, 0.53, -4.7, scene);
    for (let i = 0; i < 5; i++) {
      cyl(0.06, 0.06, 0.28, 6, green, cx - 0.4 + i * 0.2, 0.84, -4.7, scene);
      cyl(0.022, 0.03, 0.1, 5, green, cx - 0.4 + i * 0.2, 1.02, -4.7, scene);
    }
  }
  // gas canister + fan corner
  cyl(0.15, 0.15, 0.4, 8, lam(0xc0392b), 5.7, 0.2, -4.4, scene);
  box(0.5, 0.05, 0.5, steelDark, -5.6, 0.03, -4.3, scene);

  // string lights across the tent
  const lanterns: THREE.Group[] = [];
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  for (const z of [-1.6, 1.6]) {
    const g = new THREE.Group();
    g.position.set(0, 2.85, z);
    scene.add(g);
    for (let i = 0; i < 13; i++) {
      const x = -6 + i, sag = 0.18 * Math.sin((i / 12) * Math.PI);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), bulbMat);
      b.position.set(x, -sag, 0);
      g.add(b);
    }
    g.add(new THREE.PointLight(0xffb26a, 3.0, 7.5, 1.3).translateX(-2.7));
    g.add(new THREE.PointLight(0xffb26a, 3.0, 7.5, 1.3).translateX(2.7));
    lanterns.push(g);
  }
  // one bare bulb over the cart
  const lamp = new THREE.Group();
  lamp.position.set(0, 2.5, -3.0);
  scene.add(lamp);
  lamp.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), bulbMat));
  cyl(0.005, 0.005, 0.6, 3, lam(0x222222), 0, 0.35, 0, lamp);
  lamp.add(new THREE.PointLight(0xffc27a, 3.0, 6, 1.4));
  lanterns.push(lamp);

  return {
    lanterns,
    furniture: {
      tableTop: lam(0xffffff, tableTex),
      tableLeg: lam(0x8d9196),
      stools: [lam(0xd23b2b), lam(0x2c63b8)],
      cushion: null,
      bottle: 0x3fa34d,
      bottleLabel: sojuLabel,
      glass: { rt: 0.05, rb: 0.04, h: 0.1, liquid: 0xeaf6ff, liquidOpacity: 0.6, foam: false },
    },
  };
}

/* ======================================================================= shared bits */

function shell(scene: THREE.Scene, floorMat: THREE.Material, wallMat: THREE.Material, ceilMat: THREE.Material) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(13, 10), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  box(13, 3.2, 0.2, wallMat, 0, 1.6, -5.1, scene);
  box(0.2, 3.2, 10, wallMat, -6.6, 1.6, 0, scene);
  box(0.2, 3.2, 10, wallMat, 6.6, 1.6, 0, scene);
  box(5.5, 3.2, 0.2, wallMat, -3.75, 1.6, 5.1, scene);
  box(5.5, 3.2, 0.2, wallMat, 3.75, 1.6, 5.1, scene);
  box(2, 0.9, 0.2, wallMat, 0, 2.75, 5.1, scene);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(13, 10), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 3.2;
  scene.add(ceil);
}

function wallPanel(scene: THREE.Scene, tex: THREE.Texture, w: number, h: number, x: number, y: number, z: number, ry: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lam(0xffffff, tex));
  m.rotation.y = ry;
  m.position.set(x, y, z);
  scene.add(m);
}

function woodTex() {
  return ctex(32, 16, (g) => {
    g.fillStyle = "#8a5a33";
    g.fillRect(0, 0, 32, 16);
    g.fillStyle = "rgba(0,0,0,.18)";
    for (let i = 0; i < 6; i++) g.fillRect(0, i * 3 + 1, 32, 1);
    g.fillStyle = "rgba(255,230,180,.12)";
    g.fillRect(0, 7, 32, 1);
  });
}

function skewerPiece(meat: number, chunk: [number, number, number] = [0.045, 0.04, 0.045]) {
  const sk = new THREE.Group();
  cyl(0.007, 0.007, 0.32, 4, lam(0xd9b98a), 0, 0, 0, sk);
  for (let j = 0; j < 3; j++) box(chunk[0], chunk[1], chunk[2], lam(meat), 0, -0.07 + j * 0.055, 0, sk);
  return sk;
}

function buildDish(dish: Dish, parent: THREE.Object3D) {
  const g = new THREE.Group();
  parent.add(g);
  const pieces: THREE.Object3D[] = [];
  const piece = <T extends THREE.Object3D>(o: T) => {
    g.add(o);
    pieces.push(o);
    return o;
  };
  const lay = (sk: THREE.Group, s: number) => {
    sk.position.set(0, 0.04, -0.05 + s * 0.05);
    sk.rotation.z = Math.PI / 2;
    sk.rotation.x = 0.15;
    return piece(sk);
  };
  switch (dish.key) {
    case "yakitori":
      box(0.36, 0.02, 0.16, lam(0x2b2b2b), 0, 0.01, 0, g);
      for (let s = 0; s < 3; s++) lay(skewerPiece(0x8a4a22), s);
      break;
    case "edamame":
      cyl(0.17, 0.12, 0.07, 10, lam(0x2e3f5c), 0, 0.035, 0, g);
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * Math.PI * 2;
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.035), lam(0x7fb24a));
        m.position.set(Math.cos(a) * 0.08, 0.08, Math.sin(a) * 0.08);
        m.rotation.y = -a + 0.6;
        piece(m);
      }
      break;
    case "karaage": {
      cyl(0.19, 0.16, 0.025, 10, lam(0xf2ead8), 0, 0.012, 0, g);
      const lemon = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 6, 1, false, 0, Math.PI), lam(0xf1d23d));
      lemon.rotation.z = Math.PI / 2;
      lemon.position.set(0.12, 0.04, 0.06);
      g.add(lemon);
      [[-0.06, -0.04], [0.03, -0.07], [0.07, 0.02], [-0.02, 0.05], [-0.09, 0.04]].forEach(([x, z], k) => {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), lam(0xc27a2c));
        m.position.set(x, 0.06 + (k === 3 ? 0.03 : 0), z);
        m.rotation.set(k, k * 2, 0);
        piece(m);
      });
      break;
    }
    case "oden": {
      cyl(0.17, 0.13, 0.08, 10, lam(0x3a2414), 0, 0.04, 0, g);
      cyl(0.15, 0.15, 0.01, 10, lam(0xb98a4a), 0, 0.075, 0, g);
      const daikon = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), lam(0xe8d6a8));
      daikon.position.set(-0.06, 0.1, 0.02);
      piece(daikon);
      const egg = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), lam(0xc9a25a));
      egg.scale.y = 1.2;
      egg.position.set(0.06, 0.11, -0.03);
      piece(egg);
      const konnyaku = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.05, 3), lam(0x6e6a66));
      konnyaku.rotation.x = Math.PI / 2;
      konnyaku.position.set(0.02, 0.1, 0.07);
      piece(konnyaku);
      break;
    }
    case "tofu":
      box(0.26, 0.02, 0.2, lam(0x2e3f5c), 0, 0.01, 0, g);
      [[-0.045, -0.04], [0.045, -0.04], [-0.045, 0.045], [0.045, 0.045]].forEach(([x, z]) => {
        const m = new THREE.Group();
        m.position.set(x, 0.05, z);
        box(0.08, 0.06, 0.08, lam(0xf7f4ea), 0, 0, 0, m);
        box(0.05, 0.012, 0.05, lam(0x6aa84f), 0, 0.035, 0, m);
        piece(m);
      });
      break;
    case "tteokbokki":
      cyl(0.19, 0.17, 0.04, 12, lam(0x2a2a2a), 0, 0.02, 0, g);
      cyl(0.17, 0.17, 0.012, 12, lam(0xd8452c), 0, 0.042, 0, g);
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * Math.PI * 2 + 0.3;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.09, 6), lam(0xe25b3c));
        m.rotation.z = Math.PI / 2;
        m.rotation.y = a;
        m.position.set(Math.cos(a) * 0.08, 0.06, Math.sin(a) * 0.08);
        piece(m);
      }
      break;
    case "eomuk":
      cyl(0.16, 0.12, 0.07, 10, lam(0xf2ead8), 0, 0.035, 0, g);
      cyl(0.145, 0.145, 0.01, 10, lam(0xc79a5c), 0, 0.068, 0, g);
      for (let s = 0; s < 3; s++) {
        const sk = new THREE.Group();
        cyl(0.007, 0.007, 0.34, 4, lam(0xd9b98a), 0, 0.05, 0, sk);
        box(0.08, 0.12, 0.02, lam(0xc9a066), 0, -0.03, 0, sk); // folded fishcake sheet
        sk.position.set(-0.05 + s * 0.05, 0.12, 0);
        sk.rotation.z = -0.35 + s * 0.35;
        piece(sk);
      }
      break;
    case "gyeranmari":
      box(0.32, 0.02, 0.16, lam(0xf6f6f2), 0, 0.01, 0, g);
      for (let s = 0; s < 4; s++) {
        const m = new THREE.Group();
        m.position.set(-0.11 + s * 0.073, 0.05, 0);
        box(0.06, 0.06, 0.1, lam(0xf5cf4a), 0, 0, 0, m);
        box(0.062, 0.01, 0.06, lam(0xe39a3a), 0, 0.031, 0, m);
        piece(m);
      }
      break;
    case "dakkochi":
      box(0.36, 0.02, 0.16, lam(0xf6f6f2), 0, 0.01, 0, g);
      for (let s = 0; s < 3; s++) lay(skewerPiece(0xa8402a, [0.05, 0.045, 0.05]), s);
      break;
    case "golbaengi": {
      cyl(0.19, 0.16, 0.025, 10, lam(0xf6f6f2), 0, 0.012, 0, g);
      // somyeon noodles and red dressing
      cyl(0.11, 0.12, 0.04, 10, lam(0xf3ead6), -0.04, 0.045, 0, g);
      cyl(0.08, 0.09, 0.02, 10, lam(0xc8402b), 0.07, 0.04, 0.03, g);
      [[0.05, -0.06], [0.1, 0.0], [0.03, 0.07], [-0.07, 0.07], [-0.09, -0.05]].forEach(([x, z], k) => {
        const m = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 5), lam(0x6b4a2a));
        m.rotation.set(1.2, k, 0.4);
        m.position.set(x, 0.07, z);
        piece(m);
      });
      break;
    }
  }
  g.visible = false;
  return { group: g, pieces };
}
