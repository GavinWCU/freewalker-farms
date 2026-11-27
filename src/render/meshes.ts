import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { textures } from './textures';

// Every model in the game, built from code primitives. 1 world unit = 1 tile
// (an acre), so these are toy-scale. The gallery page renders this registry.

const matCache = new Map<string, THREE.Material>();
export function mat(color: string | number, opts: { map?: THREE.Texture; emissive?: number; transparent?: number } = {}) {
  const key = `${color}|${opts.map?.uuid ?? ''}|${opts.emissive ?? ''}|${opts.transparent ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color, map: opts.map ?? null,
      emissive: opts.emissive ?? 0x000000,
      transparent: opts.transparent !== undefined, opacity: opts.transparent ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
const geo = (key: string, make: () => THREE.BufferGeometry) => geoCache.get(key) ?? (geoCache.set(key, make()), geoCache.get(key)!);

function add(g: THREE.Object3D, mesh: THREE.Mesh, x: number, y: number, z: number) {
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
type M = THREE.Material;
const at = (o: THREE.Object3D, x: number, y: number, z: number) => { o.position.set(x, y, z); return o; };
const asMat = (c: string | M) => (typeof c === 'string' ? mat(c) : c);

export function box(g: THREE.Object3D, w: number, h: number, d: number, c: string | M, x = 0, y = 0, z = 0, round = true) {
  const r = Math.min(w, h, d) * 0.18;
  const geometry = round
    ? geo(`rb${w},${h},${d}`, () => new RoundedBoxGeometry(w, h, d, 2, r))
    : geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  return add(g, new THREE.Mesh(geometry, asMat(c)), x, y + h / 2, z);
}
export function cyl(g: THREE.Object3D, rt: number, rb: number, h: number, c: string | M, x = 0, y = 0, z = 0, seg = 10) {
  return add(g, new THREE.Mesh(geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), asMat(c)), x, y + h / 2, z);
}
export function cone(g: THREE.Object3D, r: number, h: number, c: string | M, x = 0, y = 0, z = 0, seg = 8) {
  return add(g, new THREE.Mesh(geo(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), asMat(c)), x, y + h / 2, z);
}
export function ball(g: THREE.Object3D, r: number, c: string | M, x = 0, y = 0, z = 0, detail = 1) {
  return add(g, new THREE.Mesh(geo(`s${r},${detail}`, () => new THREE.IcosahedronGeometry(r, detail)), asMat(c)), x, y, z);
}
/** Roof prism (gable, or gambrel for barns), ridge running along z. */
export function roof(g: THREE.Object3D, w: number, h: number, d: number, c: string | M, y: number, z = 0, gambrel = false, x = 0) {
  const m = geo(`r${w},${h},${d},${gambrel}`, () => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    if (gambrel) { s.lineTo(-w * 0.36, h * 0.6); s.lineTo(0, h); s.lineTo(w * 0.36, h * 0.6); }
    else s.lineTo(0, h);
    s.lineTo(w / 2, 0); s.lineTo(-w / 2, 0);
    const e = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    e.translate(0, 0, -d / 2);
    return e;
  });
  return add(g, new THREE.Mesh(m, asMat(c)), x, y, z);
}
function wheel(g: THREE.Object3D, r: number, w: number, x: number, y: number, z: number) {
  const m = cyl(g, r, r, w, '#2b2b2b', x, 0, z, 12);
  m.rotation.x = Math.PI / 2;
  m.position.y = y;
  return m;
}

function textBoard(lines: string[], w: number, h: number, bg = '#f6e7c8', fg = '#5a3a1a') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = Math.round(256 * (h / w));
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(4, 4, c.width - 8, c.height - 8);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    const size = i === 0 ? c.height / (lines.length + 0.6) : c.height / (lines.length + 2.2);
    g.font = `700 ${size}px Fredoka, sans-serif`;
    g.fillText(l, c.width / 2, (c.height / (lines.length + 1)) * (i + 1), c.width - 16);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: t });
}
function stripes(a: string, b: string) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 2;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 4, 0, 4, 2); }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: t });
}
const wood = () => mat('#ffffff', { map: textures().wood });
const shingle = (c: string) => mat(c, { map: textures().shingles });

// ── nature ──────────────────────────────────────────────────────────────────
function treeRound(scale = 1) {
  const g = new THREE.Group();
  cyl(g, 0.035, 0.05, 0.22, '#7a4f2a');
  ball(g, 0.2, '#5aa83c', 0, 0.32, 0).name = 'canopy';
  ball(g, 0.14, '#6dbb48', 0.08, 0.42, 0.05).name = 'canopy';
  g.scale.setScalar(scale);
  return g;
}
function treePine(scale = 1) {
  const g = new THREE.Group();
  cyl(g, 0.03, 0.04, 0.1, '#6b4426');
  cone(g, 0.19, 0.3, '#2f7a3d', 0, 0.08, 0, 7).name = 'canopy';
  cone(g, 0.14, 0.26, '#3a8a46', 0, 0.26, 0, 7).name = 'canopy';
  g.scale.setScalar(scale);
  return g;
}
function sentinelTree() {
  const g = new THREE.Group();
  cyl(g, 0.07, 0.12, 0.5, '#6e4426');
  const arms: [number, number, number, number][] = [[0, 0.62, 0, 0.32], [0.24, 0.55, 0.1, 0.24], [-0.22, 0.56, -0.08, 0.25], [0.05, 0.6, -0.24, 0.22], [-0.05, 0.82, 0.12, 0.22]];
  for (const [x, y, z, r] of arms) ball(g, r, '#3f9a3a', x, y, z).name = 'canopy';
  cyl(g, 0.01, 0.01, 0.12, '#6e4426', 0.32, 0, 0.32);
  box(g, 0.14, 0.08, 0.02, wood(), 0.32, 0.1, 0.32);
  return g;
}
function boulder() {
  const g = new THREE.Group();
  ball(g, 0.1, '#9aa0a6', 0, 0.06, 0, 0).scale.set(1.2, 0.8, 1);
  ball(g, 0.06, '#b4b9bd', 0.09, 0.04, 0.03, 0);
  return g;
}
function saleSign() {
  const g = new THREE.Group();
  cyl(g, 0.012, 0.012, 0.2, '#6b4426');
  box(g, 0.16, 0.1, 0.02, textBoard(['FOR', 'SALE'], 0.16, 0.1, '#e8c98f', '#7a2e1d'), 0, 0.15, 0, false);
  return g;
}
function farmSign() {
  const g = new THREE.Group();
  box(g, 0.9, 0.02, 0.6, '#cdb48a', 0, 0, 0, false); // gravel pad
  cyl(g, 0.03, 0.035, 0.55, '#6b4426', -0.3, 0, 0);
  cyl(g, 0.03, 0.035, 0.55, '#6b4426', 0.3, 0, 0);
  box(g, 0.72, 0.05, 0.05, '#6b4426', 0, 0.52, 0);
  box(g, 0.5, 0.2, 0.03, textBoard(['FREEWALKER FARMS', 'Family roots since 1874'], 0.5, 0.2), 0, 0.28, 0, false);
  return g;
}

// ── buildings ───────────────────────────────────────────────────────────────
function container() {
  const g = new THREE.Group();
  box(g, 0.75, 0.3, 0.32, '#c8643b', 0, 0.01, 0, false);
  for (let i = -0.33; i <= 0.34; i += 0.06) box(g, 0.015, 0.3, 0.34, '#b25530', i, 0.01, 0, false);
  box(g, 0.02, 0.26, 0.28, '#9c4a2a', 0.385, 0.03, 0, false);
  return g;
}
function camper() {
  const g = new THREE.Group();
  box(g, 0.55, 0.26, 0.3, '#f4f1e8', 0, 0.06, 0);
  box(g, 0.56, 0.05, 0.31, '#3a8fb7', 0, 0.16, 0);
  box(g, 0.12, 0.08, 0.02, '#9fd3ea', 0.12, 0.2, 0.15);
  box(g, 0.08, 0.16, 0.02, '#8a8a8a', -0.14, 0.06, 0.155);
  wheel(g, 0.06, 0.04, 0, 0.06, 0.16); wheel(g, 0.06, 0.04, 0, 0.06, -0.16);
  box(g, 0.12, 0.02, 0.02, '#555', 0.33, 0.06, 0);
  return g;
}
function toolRack() {
  const g = new THREE.Group();
  box(g, 0.4, 0.3, 0.04, wood(), 0, 0, 0);
  box(g, 0.46, 0.04, 0.12, '#6b4426', 0, 0.3, 0);
  for (let i = 0; i < 4; i++) { cyl(g, 0.008, 0.008, 0.3, '#8a5a2b', -0.14 + i * 0.09, 0.02, 0.04); box(g, 0.05, 0.04, 0.01, '#9aa0a6', -0.14 + i * 0.09, 0.02, 0.04); }
  return g;
}
function gardenBed(veg = true) {
  const g = new THREE.Group();
  box(g, 0.6, 0.1, 0.36, wood(), 0, 0, 0);
  box(g, 0.54, 0.02, 0.3, '#6e4a2a', 0, 0.09, 0, false);
  if (veg) for (let i = 0; i < 8; i++) ball(g, 0.04, i % 3 ? '#4f9e3a' : '#d9473b', -0.22 + (i % 4) * 0.15, 0.13, i < 4 ? -0.07 : 0.07, 0);
  return g;
}
function chickenCoop() {
  const g = new THREE.Group();
  box(g, 0.4, 0.24, 0.32, '#c0392b', 0, 0.05, 0);
  for (const [x, z] of [[-0.17, -0.13], [0.17, -0.13], [-0.17, 0.13], [0.17, 0.13]]) box(g, 0.03, 0.06, 0.03, '#6b4426', x, 0, z, false);
  roof(g, 0.48, 0.16, 0.38, shingle('#e8e2d0'), 0.29).rotation.y = Math.PI / 2;
  box(g, 0.1, 0.12, 0.02, '#f4efe2', 0, 0.08, 0.165);
  box(g, 0.08, 0.02, 0.2, wood(), 0, 0.02, 0.26).rotation.x = 0.4;
  for (let i = 0; i < 3; i++) g.add(at(chicken(), -0.3 + i * 0.25, 0, 0.32));
  return g;
}
function cabin() {
  const g = new THREE.Group();
  box(g, 0.62, 0.32, 0.46, mat('#a86d3b', { map: textures().wood }), 0, 0, 0);
  roof(g, 0.74, 0.26, 0.56, shingle('#2f5d3a'), 0.32).rotation.y = Math.PI / 2;
  box(g, 0.08, 0.3, 0.08, '#8d8d8d', 0.2, 0.34, -0.12);
  box(g, 0.62, 0.03, 0.16, wood(), 0, 0, 0.31);
  box(g, 0.1, 0.18, 0.02, '#6b3f1d', 0, 0.03, 0.235);
  box(g, 0.1, 0.08, 0.02, '#ffe7a3', -0.18, 0.14, 0.235);
  box(g, 0.1, 0.08, 0.02, '#ffe7a3', 0.18, 0.14, 0.235);
  return g;
}
function firePit() {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ball(g, 0.04, '#8f969c', Math.cos(a) * 0.12, 0.03, Math.sin(a) * 0.12, 0); }
  cone(g, 0.06, 0.14, mat('#ff9a2e', { emissive: 0xff6a00 }), 0, 0.02, 0, 6).name = 'flame';
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const l = box(g, 0.14, 0.03, 0.03, '#7a4f2a', Math.cos(a) * 0.04, 0.01, Math.sin(a) * 0.04); l.rotation.y = -a; }
  return g;
}
function dock() {
  const g = new THREE.Group();
  box(g, 0.22, 0.03, 0.9, wood(), 0, 0.02, 0.35, false);
  for (const z of [0.05, 0.4, 0.75]) { cyl(g, 0.02, 0.02, 0.3, '#6b4426', -0.1, -0.2, z); cyl(g, 0.02, 0.02, 0.3, '#6b4426', 0.1, -0.2, z); }
  box(g, 0.1, 0.06, 0.08, '#c0392b', 0.0, 0.05, 0.7); // tackle box
  return g;
}
function farmStand(level = 1) {
  const g = new THREE.Group();
  if (level >= 3) return farmMarket();
  const w = level === 2 ? 0.7 : 0.5;
  box(g, w, 0.16, 0.22, wood(), 0, 0, 0);
  cyl(g, 0.015, 0.015, 0.34, '#6b4426', -w / 2 + 0.03, 0, -0.08); cyl(g, 0.015, 0.015, 0.34, '#6b4426', w / 2 - 0.03, 0, -0.08);
  cyl(g, 0.015, 0.015, 0.3, '#6b4426', -w / 2 + 0.03, 0, 0.1); cyl(g, 0.015, 0.015, 0.3, '#6b4426', w / 2 - 0.03, 0, 0.1);
  const aw = box(g, w + 0.08, 0.03, 0.34, stripes('#d63c3c', '#fbf6ec'), 0, 0.31, 0.02, false);
  aw.rotation.x = -0.25;
  const goods = ['#e74c3c', '#f39c12', '#f7e27a', '#58a83a', '#f2efe6'];
  for (let i = 0; i < (level === 2 ? 6 : 4); i++) { box(g, 0.09, 0.05, 0.09, '#a0703d', -w / 2 + 0.08 + i * 0.11, 0.16, 0); ball(g, 0.035, goods[i % 5], -w / 2 + 0.08 + i * 0.11, 0.22, 0, 0); }
  box(g, 0.22, 0.08, 0.02, textBoard(['FARM STAND'], 0.22, 0.08), 0, 0.35, -0.12, false);
  return g;
}
function farmMarket() {
  const g = new THREE.Group();
  box(g, 0.78, 0.34, 0.5, '#f3ead7', 0, 0, 0);
  roof(g, 0.9, 0.24, 0.6, shingle('#2f5d3a'), 0.34).rotation.y = Math.PI / 2;
  box(g, 0.8, 0.04, 0.16, stripes('#2f6b45', '#fbf6ec'), 0, 0.26, 0.3, false).rotation.x = -0.3;
  box(g, 0.5, 0.12, 0.02, textBoard(['FREEWALKER', 'FARM MARKET'], 0.5, 0.12, '#2f6b45', '#fff6df'), 0, 0.42, 0.27, false);
  box(g, 0.14, 0.2, 0.02, '#7fc6e0', 0, 0.02, 0.255);
  for (let i = 0; i < 5; i++) ball(g, 0.035, ['#e74c3c', '#f39c12', '#58a83a', '#f7e27a', '#e67e22'][i], -0.3 + i * 0.15, 0.05, 0.33, 0);
  return g;
}
function equipmentShed() {
  const g = new THREE.Group();
  box(g, 0.7, 0.3, 0.45, '#8a9299', 0, 0, 0);
  for (let i = -0.32; i <= 0.33; i += 0.08) box(g, 0.012, 0.3, 0.46, '#7b838a', i, 0, 0, false);
  roof(g, 0.76, 0.14, 0.52, shingle('#46525c'), 0.3).rotation.y = Math.PI / 2;
  box(g, 0.34, 0.24, 0.02, '#3d4349', 0, 0, 0.23);
  return g;
}
function beehives() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const x = -0.22 + i * 0.22;
    box(g, 0.14, 0.04, 0.14, '#6b4426', x, 0, 0);
    box(g, 0.13, 0.08, 0.13, '#f6f0dd', x, 0.04, 0); box(g, 0.13, 0.08, 0.13, '#f2c94c', x, 0.12, 0);
    box(g, 0.15, 0.02, 0.15, '#c8c2b0', x, 0.2, 0);
  }
  for (let i = 0; i < 5; i++) g.add(at(bee(), -0.2 + i * 0.1, 0.3 + (i % 2) * 0.06, 0.1));
  return g;
}
function solarPanels() {
  const g = new THREE.Group();
  const panel = mat('#23406b');
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const x = -0.24 + c * 0.24, z = -0.12 + r * 0.26;
    cyl(g, 0.01, 0.01, 0.12, '#9aa0a6', x, 0, z);
    const p = box(g, 0.2, 0.015, 0.16, panel, x, 0.12, z, false); p.rotation.x = -0.45;
    const f = box(g, 0.21, 0.008, 0.17, '#d9dde1', x, 0.118, z, false); f.rotation.x = -0.45;
  }
  return g;
}
function bellPost() {
  const g = new THREE.Group();
  box(g, 0.24, 0.04, 0.24, '#9aa0a6', 0, 0, 0);
  cyl(g, 0.03, 0.035, 0.55, '#6b4426', 0, 0.04, 0);
  box(g, 0.22, 0.04, 0.04, '#6b4426', 0.08, 0.52, 0);
  cone(g, 0.06, 0.09, '#c9a23a', 0.15, 0.4, 0, 10).name = 'bell';
  return g;
}
function kimsGarden() {
  const g = new THREE.Group();
  const flowers = ['#ff6fa3', '#ffd23f', '#b07cff', '#ff8a3d', '#ffffff', '#e63946'];
  for (let r = 0; r < 2; r++) {
    box(g, 0.32, 0.06, 0.16, wood(), -0.18, 0, -0.18 + r * 0.24);
    for (let i = 0; i < 6; i++) ball(g, 0.03, flowers[(i + r * 2) % 6], -0.3 + i * 0.048, 0.08, -0.18 + r * 0.24, 0);
  }
  box(g, 0.32, 0.06, 0.16, wood(), -0.18, 0, 0.3);
  for (let i = 0; i < 4; i++) ball(g, 0.035, '#4f9e3a', -0.3 + i * 0.08, 0.08, 0.3, 0);
  g.add(at(greenhouse(0.55), 0.2, 0, 0.05));
  cyl(g, 0.01, 0.01, 0.16, '#6b4426', 0.0, 0, 0.42);
  box(g, 0.2, 0.07, 0.015, textBoard(["KIM'S GARDEN"], 0.2, 0.07), 0.0, 0.14, 0.42, false);
  return g;
}
function windmill() {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) {
    const leg = box(g, 0.02, 0.8, 0.02, '#a4a9ad', x * 0.6, 0, z * 0.6, false);
    leg.rotation.set(z * 0.5, 0, -x * 0.5);
  }
  const hub = new THREE.Group(); hub.position.set(0, 0.82, 0.06); hub.name = 'spin';
  for (let i = 0; i < 12; i++) { const arm = new THREE.Group(); arm.rotation.z = (i / 12) * Math.PI * 2; box(arm, 0.03, 0.18, 0.008, '#dfe3e6', 0, 0.02, 0, false); hub.add(arm); }
  g.add(hub);
  box(g, 0.04, 0.04, 0.24, '#a4a9ad', 0, 0.8, -0.08, false);
  cyl(g, 0.1, 0.1, 0.16, '#7fb3cf', 0.28, 0, 0.1);
  return g;
}
function windTurbine() {
  const g = new THREE.Group();
  cyl(g, 0.16, 0.18, 0.05, '#b9bec3', 0, 0, 0, 12);
  cyl(g, 0.03, 0.06, 1.5, '#f2f4f5', 0, 0.05, 0, 12);
  box(g, 0.09, 0.08, 0.2, '#f2f4f5', 0, 1.53, -0.02);
  const hub = new THREE.Group(); hub.position.set(0, 1.57, 0.1); hub.name = 'spin';
  ball(hub, 0.04, '#dfe3e6', 0, 0, 0, 1);
  for (let i = 0; i < 3; i++) { const arm = new THREE.Group(); arm.rotation.z = (i / 3) * Math.PI * 2; box(arm, 0.04, 0.55, 0.012, '#f7f8f9', 0, 0.02, 0, false); hub.add(arm); }
  g.add(hub);
  return g;
}
function blackBarn() {
  const g = new THREE.Group();
  box(g, 0.66, 0.4, 0.78, '#2a2a2e', 0, 0, 0);
  roof(g, 0.74, 0.36, 0.86, shingle('#4a4f57'), 0.4, 0, true);
  box(g, 0.3, 0.3, 0.02, '#1c1c1f', 0, 0, 0.395);
  const t = mat('#f4f1e8');
  box(g, 0.32, 0.025, 0.025, t, 0, 0.3, 0.4, false); box(g, 0.025, 0.3, 0.025, t, -0.15, 0, 0.4, false); box(g, 0.025, 0.3, 0.025, t, 0.15, 0, 0.4, false);
  box(g, 0.4, 0.02, 0.02, t, 0, 0.14, 0.41, false).rotation.z = 0.75;
  box(g, 0.4, 0.02, 0.02, t, 0, 0.14, 0.41, false).rotation.z = -0.75;
  box(g, 0.12, 0.12, 0.02, '#f2c94c', 0, 0.5, 0.4);
  return g;
}
function corral() {
  const g = new THREE.Group();
  const r = 0.42, rail = '#8a5a2b';
  for (const s of [-1, 1]) {
    box(g, r * 2, 0.025, 0.025, rail, 0, 0.1, s * r, false); box(g, r * 2, 0.025, 0.025, rail, 0, 0.18, s * r, false);
    box(g, 0.025, 0.025, r * 2, rail, s * r, 0.1, 0, false); box(g, 0.025, 0.025, r * 2, rail, s * r, 0.18, 0, false);
    for (const t of [-1, 0, 1]) { cyl(g, 0.018, 0.018, 0.22, '#6b4426', s * r, 0, t * r); cyl(g, 0.018, 0.018, 0.22, '#6b4426', t * r, 0, s * r); }
  }
  box(g, 0.24, 0.06, 0.1, '#9aa0a6', 0.2, 0, -0.25); box(g, 0.2, 0.01, 0.07, '#4a90c8', 0.2, 0.055, -0.25, false);
  box(g, 0.3, 0.2, 0.22, '#8a5a2b', -0.2, 0, -0.26);
  roof(g, 0.34, 0.1, 0.28, shingle('#3d4a55'), 0.2, -0.26, false, -0.2);
  return g;
}
function silo() {
  const g = new THREE.Group();
  cyl(g, 0.17, 0.17, 0.75, '#c9ced3', 0, 0, 0, 14);
  for (let y = 0.1; y < 0.75; y += 0.15) cyl(g, 0.175, 0.175, 0.015, '#aab0b6', 0, y, 0, 14);
  ball(g, 0.17, '#dfe3e6', 0, 0.75, 0, 1).scale.y = 0.6;
  return g;
}
function greenhouse(scale = 1) {
  const g = new THREE.Group();
  box(g, 0.44, 0.06, 0.6, '#f2f2ee', 0, 0, 0, false);
  const arch = geo('gh', () => new THREE.CylinderGeometry(0.22, 0.22, 0.6, 12, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2));
  const glass = new THREE.MeshLambertMaterial({ color: '#d8f0f4', transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  add(g, new THREE.Mesh(arch, glass), 0, 0.06, 0).castShadow = false;
  const rib = geo('ghr', () => new THREE.TorusGeometry(0.22, 0.008, 4, 12, Math.PI));
  for (let z = -0.28; z <= 0.29; z += 0.14) add(g, new THREE.Mesh(rib, mat('#ffffff')), 0, 0.06, z);
  for (let i = 0; i < 6; i++) ball(g, 0.04, '#4f9e3a', -0.1 + (i % 2) * 0.2, 0.1, -0.2 + Math.floor(i / 2) * 0.2, 0);
  g.scale.setScalar(scale);
  return g;
}
function appleTree() {
  const g = treeRound(0.8);
  for (let i = 0; i < 5; i++) ball(g, 0.025, '#d93a2b', Math.cos(i * 1.3) * 0.16, 0.3 + (i % 3) * 0.05, Math.sin(i * 1.3) * 0.16, 0);
  return g;
}
function orchard() {
  const g = new THREE.Group();
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.add(at(appleTree(), -0.28 + c * 0.28, 0, -0.28 + r * 0.28));
  return g;
}
function workshop() {
  const g = new THREE.Group();
  box(g, 0.66, 0.34, 0.48, '#4e6e8e', 0, 0, 0);
  roof(g, 0.72, 0.1, 0.54, shingle('#2d3e50'), 0.34).rotation.y = Math.PI / 2;
  box(g, 0.3, 0.24, 0.02, '#cfd6dc', -0.1, 0, 0.245);
  for (let y = 0.03; y < 0.24; y += 0.04) box(g, 0.3, 0.006, 0.025, '#aab3bb', -0.1, y, 0.245, false);
  box(g, 0.08, 0.16, 0.02, '#e1b345', 0.2, 0, 0.245);
  cyl(g, 0.008, 0.008, 0.3, '#9aa0a6', 0.25, 0.42, -0.1);
  ball(g, 0.025, '#e74c3c', 0.25, 0.72, -0.1, 0);
  box(g, 0.34, 0.08, 0.02, textBoard(["GAVIN'S WORKSHOP"], 0.34, 0.08, '#2d3e50', '#ffd36b'), 0, 0.27, 0.25, false);
  return g;
}
function lab() {
  const g = new THREE.Group();
  box(g, 0.7, 0.32, 0.48, '#eef1f4', 0, 0, 0);
  box(g, 0.72, 0.04, 0.5, '#6f7c88', 0, 0.32, 0);
  ball(g, 0.14, '#9fd3ea', -0.15, 0.36, 0, 1).scale.y = 0.7;
  const dish = cone(g, 0.1, 0.06, '#dfe3e6', 0.2, 0.42, 0, 12); dish.rotation.x = Math.PI * 0.8;
  cyl(g, 0.01, 0.01, 0.08, '#9aa0a6', 0.2, 0.36, 0);
  for (let i = 0; i < 4; i++) box(g, 0.1, 0.1, 0.02, '#7fc6e0', -0.25 + i * 0.17, 0.12, 0.245);
  box(g, 0.4, 0.07, 0.02, textBoard(["PAIGE'S ENGINEERING LAB"], 0.4, 0.07, '#3b4a5a', '#ffffff'), 0, 0.24, 0.25, false);
  return g;
}
function guestCabin() {
  const g = new THREE.Group();
  box(g, 0.42, 0.06, 0.5, wood(), 0, 0, 0.04);
  roof(g, 0.46, 0.46, 0.42, shingle('#3b6e52'), 0.04).rotation.y = 0;
  box(g, 0.2, 0.26, 0.02, '#a86d3b', 0, 0.06, 0.22);
  box(g, 0.08, 0.08, 0.02, '#ffe7a3', 0, 0.2, 0.23);
  box(g, 0.3, 0.03, 0.12, wood(), 0, 0.03, 0.3);
  return g;
}
function storage() {
  const g = new THREE.Group();
  box(g, 0.82, 0.24, 0.4, '#d8cdb8', 0, 0, 0);
  box(g, 0.86, 0.04, 0.44, '#7a5a3c', 0, 0.24, 0);
  for (let i = 0; i < 5; i++) box(g, 0.13, 0.17, 0.02, '#d9762b', -0.32 + i * 0.16, 0.02, 0.205);
  box(g, 0.36, 0.08, 0.02, textBoard(['BUFFALO STORAGE'], 0.36, 0.08, '#7a5a3c', '#fff6df'), 0, 0.3, 0.1, false);
  return g;
}
function farmhouse() {
  const g = new THREE.Group();
  box(g, 0.66, 0.48, 0.48, '#f7f4ec', 0, 0, -0.04);
  roof(g, 0.74, 0.3, 0.56, shingle('#4b6a8f'), 0.48, -0.04).rotation.y = Math.PI / 2;
  box(g, 0.24, 0.26, 0.24, '#f7f4ec', 0.25, 0, 0.18);
  roof(g, 0.3, 0.16, 0.3, shingle('#4b6a8f'), 0.26, 0.18, false, 0.25);
  box(g, 0.7, 0.03, 0.18, wood(), -0.05, 0, 0.28);
  box(g, 0.56, 0.03, 0.2, shingle('#4b6a8f'), -0.1, 0.22, 0.28);
  for (const x of [-0.36, -0.2, -0.04, 0.12]) cyl(g, 0.012, 0.012, 0.22, '#ffffff', x, 0, 0.36);
  box(g, 0.09, 0.15, 0.02, '#a8433a', -0.1, 0.02, 0.2);
  for (const [x, y] of [[-0.25, 0.08], [-0.25, 0.3], [0.05, 0.3], [-0.1, 0.3]]) box(g, 0.08, 0.09, 0.02, '#9fd3ea', x, y, 0.205);
  box(g, 0.07, 0.24, 0.07, '#a8433a', -0.22, 0.6, -0.15);
  return g;
}
function landscaping() {
  const g = new THREE.Group();
  cyl(g, 0.16, 0.18, 0.05, '#bfc4c9', 0, 0, 0, 16);
  cyl(g, 0.13, 0.13, 0.01, '#5aa9e0', 0, 0.05, 0, 16);
  cyl(g, 0.02, 0.03, 0.14, '#bfc4c9', 0, 0.05, 0);
  const fl = ['#ff6fa3', '#ffd23f', '#b07cff', '#ffffff'];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ball(g, 0.045, i % 3 ? '#3f8f3a' : fl[i % 4], Math.cos(a) * 0.32, 0.04, Math.sin(a) * 0.32, 0); }
  return g;
}

// ── animals, people, vehicles ───────────────────────────────────────────────
function cow() {
  const g = new THREE.Group();
  box(g, 0.2, 0.1, 0.1, '#f4f1ea', 0, 0.06, 0);
  box(g, 0.07, 0.06, 0.104, '#2a2a2a', -0.03, 0.09, 0, false);
  box(g, 0.07, 0.07, 0.07, '#f4f1ea', 0.12, 0.1, 0);
  box(g, 0.03, 0.03, 0.06, '#e8a3a0', 0.16, 0.1, 0, false);
  for (const [x, z] of [[-0.07, -0.035], [0.07, -0.035], [-0.07, 0.035], [0.07, 0.035]]) box(g, 0.025, 0.06, 0.025, '#2a2a2a', x, 0, z, false);
  return g;
}
function chicken() {
  const g = new THREE.Group();
  ball(g, 0.035, '#ffffff', 0, 0.04, 0, 0);
  ball(g, 0.02, '#ffffff', 0.03, 0.075, 0, 0);
  box(g, 0.01, 0.015, 0.008, '#e74c3c', 0.035, 0.095, 0, false);
  box(g, 0.012, 0.008, 0.008, '#f39c12', 0.052, 0.072, 0, false);
  return g;
}
function bee() {
  const g = new THREE.Group();
  ball(g, 0.015, '#f2c94c', 0, 0, 0, 0);
  box(g, 0.006, 0.02, 0.02, '#2a2a2a', 0, 0, 0, false);
  return g;
}
function dog() {
  // Ace. Change the colors here to match the real Ace.
  const g = new THREE.Group();
  const coat = '#b5793d';
  box(g, 0.14, 0.06, 0.06, coat, 0, 0.05, 0);
  box(g, 0.06, 0.06, 0.06, coat, 0.08, 0.09, 0);
  box(g, 0.03, 0.03, 0.04, '#e9d5b5', 0.12, 0.085, 0, false);
  box(g, 0.015, 0.03, 0.02, '#7a4a20', 0.07, 0.13, -0.025, false); box(g, 0.015, 0.03, 0.02, '#7a4a20', 0.07, 0.13, 0.025, false);
  box(g, 0.05, 0.015, 0.015, coat, -0.09, 0.1, 0, false).rotation.z = 0.7;
  box(g, 0.02, 0.012, 0.062, '#d63c3c', 0.06, 0.07, 0, false); // red collar
  for (const [x, z] of [[-0.05, -0.02], [0.05, -0.02], [-0.05, 0.02], [0.05, 0.02]]) box(g, 0.018, 0.05, 0.018, coat, x, 0, z, false);
  return g;
}
function farmer() {
  const g = new THREE.Group();
  box(g, 0.04, 0.08, 0.035, '#3b5b8c', 0, 0, -0.022, false); box(g, 0.04, 0.08, 0.035, '#3b5b8c', 0, 0, 0.022, false);
  box(g, 0.06, 0.09, 0.09, '#c0392b', 0, 0.08, 0);
  ball(g, 0.04, '#f0c8a0', 0, 0.21, 0, 1);
  cyl(g, 0.065, 0.065, 0.01, '#8a5a2b', 0, 0.235, 0, 12); cyl(g, 0.038, 0.04, 0.04, '#8a5a2b', 0, 0.24, 0, 10);
  return g;
}
function truck() {
  const g = new THREE.Group();
  box(g, 0.42, 0.08, 0.2, '#2b5f9e', 0, 0.05, 0);
  box(g, 0.16, 0.09, 0.19, '#2b5f9e', 0.05, 0.13, 0);
  box(g, 0.1, 0.06, 0.195, '#bfe3f2', 0.06, 0.15, 0, false);
  box(g, 0.16, 0.03, 0.18, '#1d3f6b', -0.13, 0.13, 0, false);
  for (const x of [-0.13, 0.13]) for (const z of [-0.1, 0.1]) wheel(g, 0.045, 0.03, x, 0.045, z);
  box(g, 0.02, 0.02, 0.05, '#fff3b0', 0.21, 0.08, -0.06, false); box(g, 0.02, 0.02, 0.05, '#fff3b0', 0.21, 0.08, 0.06, false);
  return g;
}
function tractor() {
  const g = new THREE.Group();
  box(g, 0.24, 0.08, 0.12, '#c8432b', 0.03, 0.06, 0);
  box(g, 0.1, 0.12, 0.12, '#c8432b', -0.06, 0.12, 0);
  box(g, 0.08, 0.08, 0.13, '#bfe3f2', -0.06, 0.24, 0, false);
  box(g, 0.11, 0.02, 0.15, '#c8432b', -0.06, 0.32, 0, false);
  cyl(g, 0.012, 0.012, 0.1, '#333', 0.1, 0.13, 0);
  wheel(g, 0.08, 0.05, -0.07, 0.08, 0.09); wheel(g, 0.08, 0.05, -0.07, 0.08, -0.09);
  wheel(g, 0.045, 0.03, 0.12, 0.045, 0.08); wheel(g, 0.045, 0.03, 0.12, 0.045, -0.08);
  return g;
}
function atv() {
  const g = new THREE.Group();
  box(g, 0.2, 0.06, 0.12, '#d63c3c', 0, 0.06, 0);
  box(g, 0.08, 0.03, 0.08, '#222', -0.02, 0.12, 0, false);
  box(g, 0.02, 0.02, 0.14, '#555', 0.07, 0.15, 0, false);
  for (const x of [-0.07, 0.07]) for (const z of [-0.07, 0.07]) wheel(g, 0.04, 0.035, x, 0.04, z);
  return g;
}
function car(color = '#e8b23a') {
  const g = new THREE.Group();
  box(g, 0.34, 0.07, 0.17, color, 0, 0.04, 0);
  box(g, 0.18, 0.07, 0.15, color, -0.02, 0.11, 0);
  box(g, 0.19, 0.05, 0.155, '#bfe3f2', -0.02, 0.12, 0, false);
  for (const x of [-0.11, 0.11]) for (const z of [-0.08, 0.08]) wheel(g, 0.04, 0.025, x, 0.04, z);
  return g;
}
export function trailSign(text: string) {
  const g = new THREE.Group();
  cyl(g, 0.02, 0.025, 0.32, '#6b4426', -0.14, 0, 0);
  cyl(g, 0.02, 0.025, 0.32, '#6b4426', 0.14, 0, 0);
  box(g, 0.36, 0.11, 0.025, textBoard([text], 0.36, 0.11, '#7a4f2a', '#ffe9b0'), 0, 0.18, 0, false);
  return g;
}
function ridgeMarker() {
  const g = new THREE.Group();
  ball(g, 0.1, '#9aa0a6', 0, 0.05, 0, 0).scale.set(1.2, 0.7, 1.1);
  ball(g, 0.07, '#b4b9bd', 0.02, 0.13, 0, 0);
  ball(g, 0.045, '#8f969c', 0, 0.2, 0.01, 0);
  cyl(g, 0.008, 0.008, 0.3, '#6b4426', 0.12, 0, 0.05);
  box(g, 0.1, 0.06, 0.005, '#d63c3c', 0.17, 0.24, 0.05, false);
  g.add(at(trailSign('BUFFALO RIDGE'), -0.1, 0, 0.25));
  return g;
}
function powerPole() {
  const g = new THREE.Group();
  cyl(g, 0.018, 0.022, 0.9, '#7a5a3c');
  box(g, 0.32, 0.025, 0.025, '#7a5a3c', 0, 0.8, 0, false);
  return g;
}


// ── 1.5: ranch, farmtainment and decor ─────────────────────────────────────
function buffalo() {
  const g = new THREE.Group();
  const fur = '#4a3020', dark = '#2e1d13';
  box(g, 0.2, 0.1, 0.11, fur, -0.02, 0.06, 0);
  box(g, 0.12, 0.15, 0.13, dark, 0.06, 0.05, 0); // shaggy hump and shoulders
  box(g, 0.07, 0.08, 0.08, dark, 0.15, 0.06, 0);
  box(g, 0.03, 0.04, 0.05, '#1b120c', 0.17, 0.02, 0, false); // beard
  for (const z of [-0.045, 0.045]) cone(g, 0.012, 0.04, '#e8dcc0', 0.16, 0.13, z, 5).rotation.x = z > 0 ? 0.6 : -0.6;
  for (const [x, z] of [[-0.08, -0.035], [0.07, -0.035], [-0.08, 0.035], [0.07, 0.035]]) box(g, 0.028, 0.06, 0.028, '#21150e', x, 0, z, false);
  return g;
}
function horse(color = '#8a5a34') {
  const g = new THREE.Group();
  box(g, 0.2, 0.08, 0.08, color, 0, 0.1, 0);
  const neck = box(g, 0.05, 0.12, 0.05, color, 0.1, 0.13, 0); neck.rotation.z = -0.5;
  box(g, 0.09, 0.045, 0.05, color, 0.16, 0.22, 0);
  box(g, 0.012, 0.08, 0.052, '#2a1a10', 0.08, 0.16, 0, false); // mane
  box(g, 0.02, 0.09, 0.02, '#2a1a10', -0.11, 0.07, 0, false); // tail
  for (const [x, z] of [[-0.08, -0.025], [0.08, -0.025], [-0.08, 0.025], [0.08, 0.025]]) box(g, 0.02, 0.1, 0.02, color, x, 0, z, false);
  return g;
}
function horseStable() {
  const g = new THREE.Group();
  box(g, 0.66, 0.26, 0.34, '#a3442f', 0, 0, -0.18);
  roof(g, 0.74, 0.16, 0.4, shingle('#3b3f45'), 0.26, -0.18, false).rotation.y = Math.PI / 2;
  for (const x of [-0.22, 0, 0.22]) { box(g, 0.14, 0.12, 0.02, '#6b3a20', x, 0.0, -0.005); box(g, 0.14, 0.08, 0.02, '#3a2416', x, 0.13, -0.005); }
  const r = 0.4, rail = '#f4f1e8';
  for (const z of [0.06, 0.44]) { box(g, r * 2, 0.02, 0.02, rail, 0, 0.12, z, false); box(g, r * 2, 0.02, 0.02, rail, 0, 0.2, z, false); }
  for (const x of [-r, r]) { box(g, 0.02, 0.02, 0.38, rail, x, 0.12, 0.25, false); box(g, 0.02, 0.02, 0.38, rail, x, 0.2, 0.25, false); }
  g.add(at(horse(), -0.12, 0, 0.26));
  const h2 = at(horse('#e8e2d6'), 0.18, 0, 0.3); h2.rotation.y = 2.4; g.add(h2);
  return g;
}
function paddock() {
  const g = new THREE.Group();
  const r = 0.44, rail = '#5c3b22';
  for (const s of [-1, 1]) {
    for (const y of [0.08, 0.16, 0.24]) { box(g, r * 2, 0.022, 0.022, rail, 0, y, s * r, false); box(g, 0.022, 0.022, r * 2, rail, s * r, y, 0, false); }
    for (const t of [-1, 0, 1]) { cyl(g, 0.02, 0.02, 0.28, '#3e2716', s * r, 0, t * r); cyl(g, 0.02, 0.02, 0.28, '#3e2716', t * r, 0, s * r); }
  }
  cyl(g, 0.1, 0.1, 0.12, '#d8b45a', -0.22, 0, -0.2, 10).rotation.z = Math.PI / 2; // round bale
  g.add(at(buffalo(), 0.12, 0, 0.1));
  return g;
}
function pumpkinPatch() {
  const g = new THREE.Group();
  box(g, 0.84, 0.02, 0.84, '#6e4a2a', 0, 0, 0, false);
  for (let i = 0; i < 18; i++) {
    const x = -0.33 + (i % 6) * 0.13, z = -0.3 + Math.floor(i / 6) * 0.22;
    ball(g, 0.045 + (i % 3) * 0.008, '#e8771f', x, 0.05, z, 1).scale.y = 0.75;
    box(g, 0.01, 0.02, 0.01, '#4f6b2a', x, 0.08, z, false);
  }
  // hay wagon
  box(g, 0.3, 0.05, 0.14, wood(), 0.2, 0.06, 0.34);
  cyl(g, 0.06, 0.06, 0.05, '#d8b45a', 0.15, 0.1, 0.34, 8).rotation.x = Math.PI / 2;
  cyl(g, 0.06, 0.06, 0.05, '#d8b45a', 0.26, 0.1, 0.34, 8).rotation.x = Math.PI / 2;
  for (const x of [0.1, 0.3]) for (const z of [0.27, 0.41]) cyl(g, 0.035, 0.035, 0.015, '#333', x, 0.02, z, 10).rotation.x = Math.PI / 2;
  return g;
}
function hauntedHouse() {
  const g = new THREE.Group();
  box(g, 0.5, 0.34, 0.4, '#4b4552', 0, 0, 0);
  roof(g, 0.6, 0.24, 0.48, shingle('#26232b'), 0.34).rotation.y = Math.PI / 2;
  box(g, 0.14, 0.42, 0.14, '#3c3743', 0.2, 0, -0.1);
  cone(g, 0.12, 0.2, '#1e1b22', 0.2, 0.42, -0.1, 4).rotation.y = Math.PI / 4;
  const glow = mat('#ffb347', { emissive: 0xff7a00 });
  for (const x of [-0.14, 0.04]) box(g, 0.07, 0.08, 0.02, glow, x, 0.18, 0.205);
  box(g, 0.08, 0.14, 0.02, '#1b1418', -0.05, 0, 0.205);
  box(g, 0.5, 0.02, 0.02, '#6a2c8a', 0, 0.32, 0.21, false);
  for (let i = 0; i < 3; i++) { const p = ball(g, 0.04, '#e8771f', -0.3 + i * 0.3, 0.035, 0.32, 1); p.scale.y = 0.8; }
  for (let i = 0; i < 4; i++) box(g, 0.025, 0.14 + (i % 2) * 0.05, 0.025, '#8e8e8e', -0.35 + i * 0.07, 0, -0.32, false); // tombstones
  return g;
}
function cornMaze() {
  const g = new THREE.Group();
  const corn = mat('#c9b04a'), green = mat('#7a9a3a');
  for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
    if ((i === 3 && j > 0) || (j === 1 && i > 0 && i < 6) || (j === 5 && i > 1) || (i === 5 && j > 2 && j < 6)) continue; // paths
    box(g, 0.11, 0.16 + ((i * 3 + j) % 3) * 0.02, 0.11, (i + j) % 2 ? corn : green, -0.36 + i * 0.12, 0, -0.36 + j * 0.12, false);
  }
  box(g, 0.08, 0.1, 0.02, '#f4e6b8', 0, 0, 0.47);
  return g;
}
function treeLot() {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const x = -0.32 + (i % 4) * 0.2, z = -0.28 + Math.floor(i / 4) * 0.22;
    cone(g, 0.07, 0.2, '#2f6b3a', x, 0.03, z, 7);
    cyl(g, 0.012, 0.012, 0.04, '#6b4426', x, 0, z);
  }
  box(g, 0.32, 0.16, 0.18, '#c0392b', 0.15, 0, 0.3);
  roof(g, 0.36, 0.08, 0.22, shingle('#f4f1e8'), 0.16, 0.3, false, 0.15).rotation.y = Math.PI / 2;
  const light = (c: string) => mat(c, { emissive: new THREE.Color(c).getHex() });
  ['#ff4d4d', '#ffe14d', '#4dd2ff', '#7dff7d'].forEach((c, i) => ball(g, 0.012, light(c), -0.02 + i * 0.1, 0.17, 0.4, 0));
  return g;
}
function bench() {
  const g = new THREE.Group();
  box(g, 0.32, 0.025, 0.1, wood(), 0, 0.08, 0);
  box(g, 0.32, 0.08, 0.02, wood(), 0, 0.11, -0.05);
  for (const x of [-0.13, 0.13]) box(g, 0.025, 0.08, 0.09, '#2e2e30', x, 0, 0, false);
  return g;
}
function planter() {
  const g = new THREE.Group();
  box(g, 0.3, 0.1, 0.16, wood(), 0, 0, 0);
  const fl = ['#ff6fa3', '#ffd23f', '#b07cff', '#ffffff', '#ff7a45'];
  for (let i = 0; i < 8; i++) ball(g, 0.035, i % 2 ? '#3f8f3a' : fl[i % 5], -0.11 + (i % 4) * 0.075, 0.12, i < 4 ? -0.03 : 0.03, 0);
  return g;
}
function lampPost() {
  const g = new THREE.Group();
  cyl(g, 0.04, 0.05, 0.03, '#2e2e30', 0, 0, 0);
  cyl(g, 0.012, 0.012, 0.42, '#2e2e30', 0, 0.03, 0);
  box(g, 0.06, 0.07, 0.06, mat('#fff2b3', { emissive: 0xffc94d }), 0, 0.44, 0);
  cone(g, 0.05, 0.04, '#2e2e30', 0, 0.51, 0, 4).rotation.y = Math.PI / 4;
  return g;
}
function gazebo() {
  const g = new THREE.Group();
  cyl(g, 0.34, 0.36, 0.04, '#d9d2c3', 0, 0, 0, 8);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; cyl(g, 0.016, 0.016, 0.3, '#ffffff', Math.cos(a) * 0.3, 0.04, Math.sin(a) * 0.3, 6); }
  for (let i = 0; i < 8; i++) { if (i === 2) continue; const a = (i / 8 + 1 / 16) * Math.PI * 2; const r = box(g, 0.24, 0.02, 0.015, '#ffffff', Math.cos(a) * 0.28, 0.14, Math.sin(a) * 0.28, false); r.rotation.y = -a + Math.PI / 2; }
  cone(g, 0.42, 0.2, shingle('#3d6b4a'), 0, 0.34, 0, 8);
  ball(g, 0.025, '#ffffff', 0, 0.55, 0, 0);
  return g;
}
function outdoorKitchen() {
  const g = new THREE.Group();
  const stone = mat('#a7a29a');
  box(g, 0.5, 0.14, 0.14, stone, -0.05, 0, -0.18);
  box(g, 0.52, 0.02, 0.16, '#5b5f63', -0.05, 0.14, -0.18, false);
  box(g, 0.16, 0.06, 0.12, '#2e2e30', 0.08, 0.16, -0.18); // grill
  box(g, 0.08, 0.3, 0.1, stone, -0.26, 0.14, -0.2); // chimney
  for (const [x, z] of [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]]) box(g, 0.04, 0.4, 0.04, wood(), x, 0, z, false);
  box(g, 0.78, 0.03, 0.68, wood(), 0, 0.4, 0, false); // pergola
  for (let i = 0; i < 5; i++) box(g, 0.025, 0.03, 0.72, '#7a4f2a', -0.32 + i * 0.16, 0.43, 0, false);
  box(g, 0.34, 0.02, 0.18, wood(), 0, 0.1, 0.16); // table
  for (const x of [-0.13, 0.13]) box(g, 0.02, 0.1, 0.16, '#6b4426', x, 0, 0.16, false);
  return g;
}
function fountain() {
  const g = new THREE.Group();
  const stone = mat('#bcb6ab');
  cyl(g, 0.32, 0.34, 0.08, stone, 0, 0, 0, 16);
  cyl(g, 0.28, 0.28, 0.01, mat('#5aa9e0', { transparent: 0.85 }), 0, 0.075, 0, 16);
  cyl(g, 0.04, 0.06, 0.2, stone, 0, 0.08, 0, 10);
  cyl(g, 0.14, 0.1, 0.03, stone, 0, 0.27, 0, 12);
  cone(g, 0.05, 0.1, mat('#bfe3ff', { transparent: 0.7 }), 0, 0.3, 0, 8);
  return g;
}
export interface ModelDef { id: string; name: string; group: string; build: (level?: number) => THREE.Object3D }

export const MODELS: ModelDef[] = [
  { id: 'container', name: 'Shipping Container', group: 'Buildings', build: container },
  { id: 'farm_sign', name: 'Freewalker Farm Sign', group: 'Buildings', build: farmSign },
  { id: 'tool_rack', name: 'Tool Rack', group: 'Buildings', build: toolRack },
  { id: 'camper', name: 'Camper', group: 'Buildings', build: camper },
  { id: 'garden_bed', name: 'Raised Garden Bed', group: 'Buildings', build: () => gardenBed() },
  { id: 'chicken_coop', name: 'Chicken Coop', group: 'Buildings', build: chickenCoop },
  { id: 'cabin', name: 'Cabin', group: 'Buildings', build: cabin },
  { id: 'fire_pit', name: 'Fire Pit', group: 'Buildings', build: firePit },
  { id: 'fishing_dock', name: 'Fishing Dock', group: 'Buildings', build: dock },
  { id: 'farm_stand', name: 'Farm Stand', group: 'Buildings', build: (l = 1) => farmStand(l) },
  { id: 'farm_stand_2', name: 'Bigger Farm Stand', group: 'Buildings', build: () => farmStand(2) },
  { id: 'farm_market', name: 'Freewalker Farm Market', group: 'Buildings', build: farmMarket },
  { id: 'equipment_shed', name: 'Equipment Shed', group: 'Buildings', build: equipmentShed },
  { id: 'beehives', name: 'Beehives', group: 'Buildings', build: beehives },
  { id: 'solar_panels', name: 'Solar Panels', group: 'Buildings', build: solarPanels },
  { id: 'bell_post', name: 'The Bell Post', group: 'Buildings', build: bellPost },
  { id: 'kims_garden', name: "Kim's Garden", group: 'Buildings', build: kimsGarden },
  { id: 'windmill', name: 'Windmill', group: 'Buildings', build: windmill },
  { id: 'wind_turbine', name: 'Wind Turbine', group: 'Buildings', build: windTurbine },
  { id: 'black_barn', name: 'Black Barn', group: 'Buildings', build: blackBarn },
  { id: 'cattle_corral', name: 'Cattle Corral', group: 'Buildings', build: corral },
  { id: 'silo', name: 'Grain Silo', group: 'Buildings', build: silo },
  { id: 'greenhouse', name: 'Greenhouse', group: 'Buildings', build: () => greenhouse() },
  { id: 'orchard', name: 'Apple Orchard', group: 'Buildings', build: orchard },
  { id: 'workshop', name: "Gavin's Workshop", group: 'Buildings', build: workshop },
  { id: 'lab', name: "Paige's Engineering Lab", group: 'Buildings', build: lab },
  { id: 'guest_cabin', name: 'Fishing Cabin', group: 'Buildings', build: guestCabin },
  { id: 'buffalo_storage', name: 'Buffalo Storage', group: 'Buildings', build: storage },
  { id: 'farmhouse', name: 'Dream Farmhouse', group: 'Buildings', build: farmhouse },
  { id: 'landscaping', name: 'Landscaped Grounds', group: 'Buildings', build: landscaping },
  { id: 'bench', name: 'Garden Bench', group: 'Buildings', build: bench },
  { id: 'planter', name: 'Flower Planter', group: 'Buildings', build: planter },
  { id: 'lamp_post', name: 'Lamp Post', group: 'Buildings', build: lampPost },
  { id: 'gazebo', name: 'Gazebo', group: 'Buildings', build: gazebo },
  { id: 'outdoor_kitchen', name: 'Outdoor Kitchen', group: 'Buildings', build: outdoorKitchen },
  { id: 'pumpkin_patch', name: 'Pumpkin Patch', group: 'Buildings', build: pumpkinPatch },
  { id: 'horse_stable', name: 'Horse Stable', group: 'Buildings', build: horseStable },
  { id: 'buffalo_paddock', name: 'Buffalo Paddock', group: 'Buildings', build: paddock },
  { id: 'corn_maze', name: 'Corn Maze', group: 'Buildings', build: cornMaze },
  { id: 'haunted_house', name: 'Haunted House', group: 'Buildings', build: hauntedHouse },
  { id: 'tree_lot', name: 'Christmas Tree Lot', group: 'Buildings', build: treeLot },
  { id: 'fountain', name: 'Stone Fountain', group: 'Buildings', build: fountain },
  { id: 'buffalo', name: 'Buffalo', group: 'Characters', build: buffalo },
  { id: 'horse', name: 'Horse', group: 'Characters', build: () => horse() },
  { id: 'tree_round', name: 'Round Tree', group: 'Nature', build: () => treeRound() },
  { id: 'tree_pine', name: 'Pine', group: 'Nature', build: () => treePine() },
  { id: 'apple_tree', name: 'Apple Tree', group: 'Nature', build: appleTree },
  { id: 'sentinel_tree', name: 'Sentinel Tree', group: 'Nature', build: sentinelTree },
  { id: 'boulder', name: 'Boulder', group: 'Nature', build: boulder },
  { id: 'sale_sign', name: 'For Sale Sign', group: 'Nature', build: saleSign },
  { id: 'power_pole', name: 'Power Pole', group: 'Nature', build: powerPole },
  { id: 'ridge_marker', name: 'Buffalo Ridge Cairn', group: 'Nature', build: ridgeMarker },
  { id: 'loop_sign', name: "Leonard's Loop Sign", group: 'Nature', build: () => trailSign("LEONARD'S LOOP") },
  { id: 'farmer', name: 'Farmer (you)', group: 'Characters', build: farmer },
  { id: 'ace', name: 'Ace', group: 'Characters', build: dog },
  { id: 'cow', name: 'Cow', group: 'Characters', build: cow },
  { id: 'chicken', name: 'Chicken', group: 'Characters', build: chicken },
  { id: 'bee', name: 'Bee', group: 'Characters', build: bee },
  { id: 'truck', name: 'Pickup Truck', group: 'Vehicles', build: truck },
  { id: 'tractor', name: 'Small Tractor', group: 'Vehicles', build: tractor },
  { id: 'atv', name: 'ATV', group: 'Vehicles', build: atv },
  { id: 'car', name: 'Customer Car', group: 'Vehicles', build: () => car() },
];
export const MODEL: Record<string, ModelDef> = Object.fromEntries(MODELS.map((m) => [m.id, m]));
export const buildModel = (id: string, level = 1) => (MODEL[id] ?? MODEL.container).build(level);
export { car as carModel };
