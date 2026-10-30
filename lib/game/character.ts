import * as THREE from "three";
import { DISHES, clampInt } from "./constants";
import { basic, box, cyl, lam } from "./mesh";

export type AnimKind = "drink" | "pour" | "eat" | "cheer" | "talk";

export type Avatar = {
  root: THREE.Group;
  hip: THREE.Group;
  headG: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  armRParts: { sleeve: THREE.Mesh; hand: THREE.Mesh };
  legL: THREE.Group;
  legR: THREE.Group;
  handGlass: THREE.Group;
  handBottle: THREE.Group;
  handBite: THREE.Group;
  bite: { stick: THREE.Mesh; meat: THREE.Mesh[]; chop: THREE.Mesh[]; piece: THREE.Mesh; mat: THREE.MeshLambertMaterial };
  anim: { k: AnimKind; t0: number; dur: number } | null;
  walkPh: number;
  speed: number;
  seated: boolean;
};

const skinMat = lam(0xfaf3e6);
const blackMat = basic(0x141414);
const blushMat = basic(0xf09aa4);

/** souka-style mascot: round head, dot eyes, blush, hachimaki headband in the player's colour. */
export function makeChar(parent: THREE.Object3D, col: number, bodyCol: number, bandCol?: number): Avatar {
  const root = new THREE.Group();
  const cloth = lam(bodyCol), accent = lam(col), band = lam(bandCol ?? col);
  const hip = new THREE.Group();
  hip.position.y = 0.42;
  root.add(hip);
  cyl(0.2, 0.27, 0.52, 8, cloth, 0, 0.26, 0, hip);

  const headG = new THREE.Group();
  headG.position.y = 0.88;
  hip.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), skinMat);
  head.scale.set(1.08, 0.95, 1);
  headG.add(head);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.052, 6, 4), blackMat);
    e.position.set(0.14 * s, 0.02, 0.365);
    e.scale.z = 0.5;
    headG.add(e);
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.06, 8), blushMat);
    b.position.set(0.25 * s, -0.08, 0.305);
    b.rotation.y = 0.6 * s;
    headG.add(b);
  }
  box(0.07, 0.014, 0.02, blackMat, 0, -0.09, 0.378, headG);
  const tor = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.045, 4, 14), band);
  tor.rotation.x = Math.PI / 2;
  tor.position.y = 0.14;
  tor.scale.set(1.08, 1, 1);
  headG.add(tor);
  box(0.12, 0.1, 0.08, band, 0, 0.14, -0.4, headG);

  const arms: THREE.Group[] = [];
  const parts: { sleeve: THREE.Mesh; hand: THREE.Mesh }[] = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Group();
    p.position.set(0.25 * s, 0.46, 0);
    hip.add(p);
    const sleeve = cyl(0.05, 0.05, 0.3, 6, cloth, 0, -0.15, 0, p);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 4), skinMat);
    hand.position.y = -0.32;
    p.add(hand);
    arms.push(p);
    parts.push({ sleeve, hand });
  }
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Group();
    p.position.set(0.11 * s, 0, 0);
    hip.add(p);
    cyl(0.07, 0.07, 0.38, 6, accent, 0, -0.19, 0, p);
    box(0.13, 0.07, 0.18, lam(0x2b1b11), 0, -0.38, 0.03, p);
    legs.push(p);
  }

  const handGlass = new THREE.Group();
  hip.add(handGlass);
  cyl(0.065, 0.055, 0.17, 8, new THREE.MeshLambertMaterial({ color: 0xf1b53d, transparent: true, opacity: 0.9 }), 0, 0, 0, handGlass);
  cyl(0.066, 0.066, 0.035, 8, lam(0xfff6e0), 0, 0.09, 0, handGlass);
  handGlass.visible = false;

  const armR = arms[1];
  const handBottle = new THREE.Group();
  handBottle.position.set(0, -0.36, 0.08);
  armR.add(handBottle);
  const bm = lam(0x5b2d1a);
  cyl(0.07, 0.075, 0.3, 7, bm, 0, 0, 0, handBottle);
  cyl(0.025, 0.04, 0.12, 6, bm, 0, 0.2, 0, handBottle);
  handBottle.visible = false;

  const handBite = new THREE.Group();
  hip.add(handBite);
  const biteMat = lam(0x8a4a22);
  const stick = cyl(0.008, 0.008, 0.32, 4, lam(0xd9b98a), 0, 0.05, 0, handBite);
  const meat = [0, 1, 2].map((i) => box(0.06, 0.05, 0.06, biteMat, 0, 0.1 + i * 0.06, 0, handBite));
  const chop = [-1, 1].map((sx) => cyl(0.006, 0.006, 0.3, 4, lam(0x6b4428), sx * 0.012, 0.05, 0, handBite));
  const piece = box(0.07, 0.06, 0.07, biteMat, 0, 0.2, 0, handBite);
  handBite.visible = false;

  parent.add(root);
  return {
    root, hip, headG, armL: arms[0], armR, armRParts: parts[1], legL: legs[0], legR: legs[1],
    handGlass, handBottle, handBite, bite: { stick, meat, chop, piece, mat: biteMat },
    anim: null, walkPh: 0, speed: 0, seated: false,
  };
}

export function disposeChar(av: Avatar) {
  av.root.parent?.remove(av.root);
  av.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}

const DUR: Record<AnimKind, number> = { drink: 1.0, pour: 1.3, eat: 0.9, cheer: 1.3, talk: 0.6 };

export function playAnim(av: Avatar, k: AnimKind, dish?: number) {
  if (k === "eat") {
    const D = DISHES[clampInt(dish ?? 0, 0, DISHES.length - 1)];
    const skewer = D.key === "yakitori";
    av.bite.stick.visible = skewer;
    av.bite.meat.forEach((m) => (m.visible = skewer));
    av.bite.chop.forEach((c) => (c.visible = !skewer));
    av.bite.piece.visible = !skewer;
    av.bite.mat.color.setHex(D.bite);
    av.bite.piece.scale.set(...D.biteScale);
  }
  av.anim = { k, t0: performance.now(), dur: DUR[k] * 1000 };
}

// hip-space anchor points for held items (head centre at y 0.88, face toward +z)
const SHOULDER_R = new THREE.Vector3(0.25, 0.46, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const REST = new THREE.Vector3(0.24, 0.2, 0.24);
const MOUTH = new THREE.Vector3(0.03, 0.74, 0.47);
const BITE = new THREE.Vector3(0.12, 0.76, 0.44);
const OFFER = new THREE.Vector3(0.1, 0.62, 0.64);
const tmp = new THREE.Vector3();

export function updateChar(av: Avatar, dt: number) {
  const a = av.anim;
  let p = 0, k: AnimKind | null = null;
  if (a) {
    p = (performance.now() - a.t0) / a.dur;
    if (p >= 1) av.anim = null;
    else k = a.k;
  }
  const w = k ? Math.sin(Math.PI * Math.min(1, p)) : 0;
  const hold = k ? Math.min(1, Math.sin(Math.PI * p) * 1.6) : 0;

  let aR = 0, aL = 0, hx = 0, hz = 0;
  if (av.seated) {
    av.legL.rotation.x = av.legR.rotation.x = -Math.PI / 2;
    av.root.position.y = 0.05;
    av.hip.position.y = 0.42;
    aR = aL = -0.5;
  } else {
    av.root.position.y = 0;
    const moving = av.speed > 0.05;
    if (moving) av.walkPh += dt * (4 + av.speed * 3);
    const sw = moving ? Math.sin(av.walkPh) * 0.65 : 0;
    av.legL.rotation.x = sw;
    av.legR.rotation.x = -sw;
    aL = -sw * 0.6;
    aR = sw * 0.6;
    av.hip.position.y = 0.42 + (moving ? Math.abs(Math.cos(av.walkPh)) * 0.04 : 0);
  }

  av.handGlass.visible = k === "drink" || k === "cheer";
  av.handBottle.visible = k === "pour";
  av.handBite.visible = k === "eat";

  let reach: THREE.Vector3 | null = null;
  if (k === "drink") {
    const lift = Math.min(1, w * 1.5), tip = Math.max(0, (w - 0.55) / 0.45);
    reach = tmp.copy(REST).lerp(MOUTH, lift);
    av.handGlass.position.copy(reach);
    av.handGlass.rotation.set(-1.15 * tip, 0, 0.15 * lift);
    hx = -0.32 * tip;
  } else if (k === "eat") {
    const lift = Math.min(1, w * 1.5);
    reach = tmp.copy(REST).lerp(BITE, lift);
    av.handBite.position.copy(reach);
    av.handBite.rotation.set(0, 0, 1.25 * lift);
    hx = 0.06 * w;
  } else if (k === "cheer") {
    reach = tmp.copy(REST).lerp(OFFER, hold);
    av.handGlass.position.copy(reach);
    av.handGlass.rotation.set(0.3 * hold, 0, 0);
  } else if (k === "pour") {
    aR = -0.5 - 0.9 * hold;
    av.handBottle.rotation.x = 1.6 * hold;
    hx = 0.1 * hold;
  } else if (k === "talk") {
    hz = Math.sin(p * Math.PI * 4) * 0.12;
  }

  const P = av.armRParts;
  if (reach) {
    // aim the right arm at the held item and stretch it to reach
    const d = reach.clone().sub(SHOULDER_R);
    const L = d.length();
    av.armR.quaternion.setFromUnitVectors(DOWN, d.normalize());
    P.sleeve.scale.y = L / 0.3;
    P.sleeve.position.y = -L / 2;
    P.hand.position.y = -L;
  } else {
    av.armR.rotation.set(aR, 0, 0);
    P.sleeve.scale.y = 1;
    P.sleeve.position.y = -0.15;
    P.hand.position.y = -0.32;
  }
  av.armL.rotation.x = aL;
  av.headG.rotation.x = hx;
  av.headG.rotation.z = hz;
}
