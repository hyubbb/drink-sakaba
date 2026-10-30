import * as THREE from "three";
import { DISHES, FULL, TABLES, clampInt, type Dish } from "./constants";
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
  glass: { group: THREE.Group; liquid: THREE.Mesh; foam: THREE.Mesh };
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
  lanterns: THREE.Group[];
  setGlass: (seat: Seat, level: number) => void;
  setPlate: (plateId: string, dish: number, left: number) => void;
  highlightSeat: (seat: Seat | null) => void;
};

export function buildWorld(scene: THREE.Scene): World {
  scene.background = new THREE.Color(0x1b130e);
  scene.fog = new THREE.Fog(0x1b130e, 9, 20);
  scene.add(new THREE.HemisphereLight(0xffd9a8, 0x2a1a10, 2.2));
  const sun = new THREE.DirectionalLight(0xffe2b8, 1.0);
  sun.position.set(2, 6, 4);
  scene.add(sun);

  /* textures */
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
  const tableTex = ctex(32, 16, (g) => {
    g.fillStyle = "#8a5a33";
    g.fillRect(0, 0, 32, 16);
    g.fillStyle = "rgba(0,0,0,.18)";
    for (let i = 0; i < 6; i++) g.fillRect(0, i * 3 + 1, 32, 1);
    g.fillStyle = "rgba(255,230,180,.12)";
    g.fillRect(0, 7, 32, 1);
  });
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

  /* room shell */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(13, 10), lam(0xffffff, floorTex));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const wm = lam(0xffffff, wallTex);
  box(13, 3.2, 0.2, wm, 0, 1.6, -5.1, scene);
  box(0.2, 3.2, 10, wm, -6.6, 1.6, 0, scene);
  box(0.2, 3.2, 10, wm, 6.6, 1.6, 0, scene);
  box(5.5, 3.2, 0.2, wm, -3.75, 1.6, 5.1, scene);
  box(5.5, 3.2, 0.2, wm, 3.75, 1.6, 5.1, scene);
  box(2, 0.9, 0.2, wm, 0, 2.75, 5.1, scene);
  const beam = lam(0x3a2414);
  for (const z of [-3, 0, 3]) box(13, 0.22, 0.22, beam, 0, 3.05, z, scene);
  box(13, 0.25, 0.25, beam, 0, 1.0, -5.0, scene);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(13, 10), lam(0x2c1c11));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 3.2;
  scene.add(ceil);
  const nor = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.95), new THREE.MeshLambertMaterial({ map: norenTex, side: THREE.DoubleSide }));
  nor.position.set(0, 1.85, 4.98);
  scene.add(nor);

  const menus: [string, string][] = [["焼鳥", "¥180"], ["枝豆", "¥300"], ["おでん", "¥450"], ["生ビール", "¥550"], ["唐揚", "¥480"], ["冷奴", "¥320"]];
  menus.forEach(([t, p], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 1.0), lam(0xffffff, menuTex(t, p)));
    m.rotation.y = Math.PI / 2;
    m.position.set(-6.48, 2.15, -2.6 + i * 0.55);
    scene.add(m);
  });
  menus.slice(0, 4).reverse().forEach(([t, p], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 1.0), lam(0xffffff, menuTex(t, p)));
    m.rotation.y = -Math.PI / 2;
    m.position.set(6.48, 2.15, -1.5 + i * 0.55);
    scene.add(m);
  });

  /* counter, shelf, bottles, TV */
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

  /* lanterns */
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

  /* tables, seats, glasses */
  const seats: Record<string, Seat> = {};
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.32 });
  const beerMat = new THREE.MeshLambertMaterial({ color: 0xf1b53d, transparent: true, opacity: 0.92 });
  const foamMat = lam(0xfff6e0);
  const cushionMat = lam(0xa8402c);
  const cushionHi = new THREE.MeshLambertMaterial({ color: 0xa8402c, emissive: 0x553300 });
  for (const t of TABLES) {
    const tg = new THREE.Group();
    tg.position.set(t.x, 0, t.z);
    scene.add(tg);
    box(3.3, 0.07, 1.1, lam(0xffffff, tableTex), 0, 0.76, 0, tg);
    for (const sx of [-1.5, 1.5]) for (const sz of [-0.42, 0.42]) box(0.08, 0.73, 0.08, lam(0x3a2414), sx, 0.365, sz, tg);
    for (const bx of [-0.5, 0.5]) {
      const bg = new THREE.Group();
      bg.position.set(bx, 0.8, 0);
      tg.add(bg);
      cyl(0.075, 0.08, 0.34, 7, lam(0x5b2d1a), 0, 0.17, 0, bg);
      cyl(0.025, 0.04, 0.13, 6, lam(0x5b2d1a), 0, 0.4, 0, bg);
      const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.12, 7, 1, true), lam(0xffffff, beerLabel));
      lb.position.y = 0.15;
      bg.add(lb);
    }
    for (const side of ["a", "b"] as const) {
      const dz = side === "a" ? -1 : 1;
      for (let i = 0; i < 3; i++) {
        const id = `${t.id}-${side}${i}`;
        const x = t.x + (i - 1) * 1.0, z = t.z + dz * 0.98;
        cyl(0.2, 0.22, 0.42, 8, lam(0x3a2414), x, 0.21, z, scene);
        const cush = cyl(0.23, 0.23, 0.06, 8, cushionMat, x, 0.45, z, scene);
        const gg = new THREE.Group();
        gg.position.set(x - 0.12, 0.8, t.z + dz * 0.33);
        scene.add(gg);
        cyl(0.075, 0.062, 0.2, 8, glassMat, 0, 0.1, 0, gg);
        const liquid = cyl(0.066, 0.056, 0.18, 8, beerMat, 0, 0.09, 0, gg);
        const foam = cyl(0.067, 0.067, 0.03, 8, foamMat, 0, 0.18, 0, gg);
        seats[id] = { id, table: t.id, side, i, x, z, ry: side === "a" ? 0 : Math.PI, plate: `${t.id}-p${i}`, cush, glass: { group: gg, liquid, foam } };
      }
    }
  }
  const seatList = Object.values(seats);

  /* shared plates: one per facing pair */
  const plates: Record<string, Plate> = {};
  for (const t of TABLES)
    for (let i = 0; i < 3; i++) {
      const id = `${t.id}-p${i}`;
      const pg = new THREE.Group();
      pg.position.set(t.x + (i - 1) * 1.0 + 0.08, 0.8, t.z);
      pg.rotation.y = (i - 1) * 0.4;
      scene.add(pg);
      plates[id] = { id, table: t.id, i, seats: [`${t.id}-a${i}`, `${t.id}-b${i}`], dishes: DISHES.map((d) => buildDish(d, pg)) };
    }

  let lit: Seat | null = null;
  return {
    seats,
    seatList,
    plates,
    lanterns,
    setGlass(seat, level) {
      const L = clampInt(level, 0, FULL);
      seat.glass.liquid.visible = seat.glass.foam.visible = L > 0;
      const h = L / FULL;
      seat.glass.liquid.scale.y = Math.max(h, 0.001);
      seat.glass.liquid.position.y = 0.09 * h + 0.005;
      seat.glass.foam.position.y = 0.18 * h + 0.01;
    },
    setPlate(plateId, dish, left) {
      plates[plateId].dishes.forEach((d, k) => {
        d.group.visible = k === dish;
        if (k === dish) d.pieces.forEach((m, j) => (m.visible = j < left));
      });
    },
    highlightSeat(seat) {
      if (lit === seat) return;
      if (lit) lit.cush.material = cushionMat;
      lit = seat;
      if (lit) lit.cush.material = cushionHi;
    },
  };
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
  if (dish.key === "yakitori") {
    box(0.36, 0.02, 0.16, lam(0x2b2b2b), 0, 0.01, 0, g);
    for (let s = 0; s < 3; s++) {
      const sk = new THREE.Group();
      sk.position.set(0, 0.04, -0.05 + s * 0.05);
      sk.rotation.z = Math.PI / 2;
      sk.rotation.x = 0.15;
      cyl(0.007, 0.007, 0.32, 4, lam(0xd9b98a), 0, 0, 0, sk);
      for (let j = 0; j < 3; j++) box(0.045, 0.04, 0.045, lam(0x8a4a22), 0, -0.07 + j * 0.055, 0, sk);
      piece(sk);
    }
  } else if (dish.key === "edamame") {
    cyl(0.17, 0.12, 0.07, 10, lam(0x2e3f5c), 0, 0.035, 0, g);
    for (let s = 0; s < 6; s++) {
      const a = (s / 6) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.035), lam(0x7fb24a));
      m.position.set(Math.cos(a) * 0.08, 0.08, Math.sin(a) * 0.08);
      m.rotation.y = -a + 0.6;
      piece(m);
    }
  } else if (dish.key === "karaage") {
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
  } else if (dish.key === "oden") {
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
  } else {
    box(0.26, 0.02, 0.2, lam(0x2e3f5c), 0, 0.01, 0, g);
    [[-0.045, -0.04], [0.045, -0.04], [-0.045, 0.045], [0.045, 0.045]].forEach(([x, z]) => {
      const m = new THREE.Group();
      m.position.set(x, 0.05, z);
      box(0.08, 0.06, 0.08, lam(0xf7f4ea), 0, 0, 0, m);
      box(0.05, 0.012, 0.05, lam(0x6aa84f), 0, 0.035, 0, m);
      piece(m);
    });
  }
  g.visible = false;
  return { group: g, pieces };
}
