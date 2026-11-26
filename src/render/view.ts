import * as THREE from 'three';
import type { GameState, Tile } from '../sim/types';
import { CROP } from '../sim/content/crops';
import { daylight, isGoldenHour, seasonOf } from '../sim/time';
import { COUNTY_ROAD_Y } from '../sim/map/home80';
import { hash2 } from '../sim/rng';
import { buildModel, carModel, box, cone, cyl, mat, trailSign } from './meshes';
import { Instancer } from './instancer';
import { textures } from './textures';

// The only module the game talks to for drawing. The sim never imports Three.js.

const ISO_DIR = new THREE.Vector3(1, 1.15, 1).normalize(); // camera offset direction (≈40° elevation)
const C = (h: string) => new THREE.Color(h);
const COLORS = {
  crop: C('#a8d860'), pasture: C('#8fcf52'), timber: C('#6aae44'), sand: C('#f3dea0'), road: C('#6b6e73'),
  gravel: C('#e6cf9a'), trail: C('#d9b077'), water: C('#4a8fc9'), nbCrop: C('#9fd05c'), nbPasture: C('#96cc58'),
};

export interface ScreenPoint { x: number; y: number; visible: boolean }

export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly target = new THREE.Vector3(24, 0, 17);
  viewSize = 9;            // world units visible vertically
  private sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6a8f3a, 1.1);
  private terrain!: THREE.Mesh;
  private corners: Float32Array = new Float32Array(0);
  private w = 0; private h = 0;
  private water!: THREE.Mesh;
  private time = { value: 0 };
  private trees: Instancer; private pines: Instancer; private rocks: Instancer; private signs: Instancer;
  private posts: Instancer; private rails: Instancer; private whiteRails: Instancer; private whitePosts: Instancer;
  private dirt: Instancer;
  private gravel: Instancer;
  private trail: Instancer;
  private crops = new Map<string, Instancer>();
  private buildings = new Map<number, { obj: THREE.Object3D; key: string }>();
  private static = new THREE.Group();
  private player = new THREE.Group();
  private vehicles: Record<string, THREE.Object3D> = {};
  private ace: THREE.Object3D;
  private acePos = new THREE.Vector3();
  private cows: Instancer;
  private solar: Instancer;
  private tenantCows: { id: number; x: number; y: number }[] = [];
  private selection: THREE.Mesh;
  private ghostObj: THREE.Object3D | null = null;
  private ghostKey = '';
  private ghostTile: THREE.Mesh;
  private cars: { obj: THREE.Object3D; x: number; stopX: number; t: number; dir: number }[] = [];
  private raycaster = new THREE.Raycaster();
  private low = false;
  private sentinel: THREE.Object3D;
  private landmarkObjs = new THREE.Group();
  private sky = new THREE.Color();
  facing = 0;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.static);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;

    const sway = this.time;
    this.trees = new Instancer(buildModel('tree_round'), 6000, { sway });
    this.pines = new Instancer(buildModel('tree_pine'), 6000, { sway });
    this.rocks = new Instancer(buildModel('boulder'), 1500);
    this.signs = new Instancer(buildModel('sale_sign'), 600);
    const post = new THREE.Group(); cyl(post, 0.018, 0.02, 0.16, '#7a5230');
    const rail = new THREE.Group(); box(rail, 1, 0.022, 0.018, '#8a5a2b', 0, 0.07, 0, false); box(rail, 1, 0.022, 0.018, '#8a5a2b', 0, 0.12, 0, false);
    const wpost = new THREE.Group(); cyl(wpost, 0.016, 0.018, 0.15, '#f4f1e8');
    const wrail = new THREE.Group(); box(wrail, 1, 0.02, 0.016, '#f4f1e8', 0, 0.06, 0, false); box(wrail, 1, 0.02, 0.016, '#f4f1e8', 0, 0.11, 0, false);
    this.posts = new Instancer(post, 8000); this.rails = new Instancer(rail, 8000);
    this.whitePosts = new Instancer(wpost, 4000); this.whiteRails = new Instancer(wrail, 4000);
    const dirt = new THREE.Group(); box(dirt, 0.9, 0.04, 0.9, mat('#ffffff', { map: textures().dirt }), 0, -0.02, 0, false);
    this.dirt = new Instancer(dirt, 2200, { shadows: false });
    const strip = (c: string) => { const g = new THREE.Group(); box(g, 1, 0.03, 1, c, 0, -0.01, 0, false); return g; };
    this.gravel = new Instancer(strip('#e4d2a2'), 6000, { shadows: false });
    this.trail = new Instancer(strip('#c79a5e'), 6000, { shadows: false });
    this.cows = new Instancer(buildModel('cow'), 600);
    this.solar = new Instancer(buildModel('solar_panels'), 400);
    for (const i of [this.trees, this.pines, this.rocks, this.signs, this.posts, this.rails, this.whitePosts, this.whiteRails, this.dirt, this.cows, this.solar, this.gravel, this.trail]) this.scene.add(i.group);

    this.selection = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }));
    this.selection.renderOrder = 10; this.selection.visible = false;
    this.ghostTile = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x46d160, transparent: true, opacity: 0.45, depthTest: false }));
    this.ghostTile.renderOrder = 9; this.ghostTile.visible = false;
    this.scene.add(this.selection, this.ghostTile);

    for (const v of ['truck', 'tractor', 'atv']) { this.vehicles[v] = buildModel(v); this.scene.add(this.vehicles[v]); }
    this.player.add(buildModel('farmer'));
    this.ace = buildModel('ace');
    this.sentinel = buildModel('sentinel_tree');
    this.scene.add(this.player, this.ace, this.landmarkObjs);
    this.resize();
  }

  // ── layout ────────────────────────────────────────────────────────────────
  resize() {
    const w = this.host.clientWidth || window.innerWidth, h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.left = (-this.viewSize * aspect) / 2; this.camera.right = (this.viewSize * aspect) / 2;
    this.camera.top = this.viewSize / 2; this.camera.bottom = -this.viewSize / 2;
    this.camera.updateProjectionMatrix();
    this.placeCamera();
  }
  private placeCamera() {
    if (this.w) {
      this.target.x = Math.min(Math.max(this.target.x, 0), this.w);
      this.target.z = Math.min(Math.max(this.target.z, 0), this.h);
    }
    this.camera.position.copy(this.target).addScaledVector(ISO_DIR, 60);
    this.camera.lookAt(this.target);
    const s = this.viewSize * 1.4;
    const cam = this.sun.shadow.camera;
    cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.near = 1; cam.far = 120;
    cam.updateProjectionMatrix();
  }
  pan(dxPx: number, dyPx: number) {
    const perPx = this.viewSize / this.host.clientHeight;
    const right = new THREE.Vector3(1, 0, -1).normalize();
    const fwd = new THREE.Vector3(-1, 0, -1).normalize();
    this.target.addScaledVector(right, -dxPx * perPx).addScaledVector(fwd, (dyPx * perPx) / Math.sin(0.7));
    this.placeCamera();
  }
  zoom(factor: number) {
    this.viewSize = Math.min(Math.max(this.viewSize * factor, 3), 34);
    this.resize();
  }
  focus(x: number, y: number) { this.target.set(x, 0, y); this.placeCamera(); }

  pick(clientX: number, clientY: number): { x: number; y: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.terrain, false)[0];
    if (!hit) return null;
    const x = Math.floor(hit.point.x), y = Math.floor(hit.point.z);
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? { x, y } : null;
  }
  toScreen(x: number, y: number, z: number): ScreenPoint {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.host.clientWidth, y: ((1 - v.y) / 2) * this.host.clientHeight, visible: Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  }

  /** Ground height at a world position (bilinear over tile corners). */
  ground(x: number, y: number): number {
    if (!this.w) return 0;
    const cx = Math.min(Math.max(x, 0), this.w - 0.001), cy = Math.min(Math.max(y, 0), this.h - 0.001);
    const x0 = Math.floor(cx), y0 = Math.floor(cy), fx = cx - x0, fy = cy - y0, W = this.w + 1;
    const c = this.corners;
    const a = c[y0 * W + x0], b = c[y0 * W + x0 + 1], d = c[(y0 + 1) * W + x0], e = c[(y0 + 1) * W + x0 + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
  }
  tileTop(s: GameState, x: number, y: number) { return Math.max(this.ground(x + 0.5, y + 0.5), s.tiles[y * s.w + x].t === 'water' ? -0.08 : -1); }

  setQuality(low: boolean) {
    this.low = low;
    this.renderer.shadowMap.enabled = !low;
    this.sun.castShadow = !low;
    this.renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio, 2));
    this.scene.traverse((o) => { if ((o as THREE.Mesh).material) ((o as THREE.Mesh).material as THREE.Material).needsUpdate = true; });
    this.resize();
  }

  // ── world building ────────────────────────────────────────────────────────
  /** Rebuilds everything derived from game state. Call after any change. */
  sync(s: GameState) {
    if (this.w !== s.w || this.h !== s.h) this.buildStatic(s);
    this.colorTerrain(s);
    this.syncDecor(s);
    this.syncFences(s);
    this.syncCrops(s);
    this.syncBuildings(s);
    this.syncLoopSigns(s);
    this.syncPaths(s);
  }

  /** Roads and trails: a pad in the tile centre with arms to connected neighbors. */
  private syncPaths(s: GameState) {
    this.gravel.reset(); this.trail.reset();
    s.tiles.forEach((t, i) => {
      if (!t.path) return;
      const x = i % s.w, y = Math.floor(i / s.w);
      const inst = t.path === 'gravel' ? this.gravel : this.trail;
      const wdt = t.path === 'gravel' ? 0.34 : 0.2;
      const seg = (ax: number, ay: number, bx: number, by: number) => {
        const cx = (ax + bx) / 2, cy = (ay + by) / 2;
        const sx = Math.abs(bx - ax) + wdt, sy = Math.abs(by - ay) + wdt;
        inst.addBox(cx, this.ground(cx, cy) + 0.012, cy, sx, sy);
      };
      seg(x + 0.5, y + 0.5, x + 0.5, y + 0.5);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
        const n = s.tiles[ny * s.w + nx];
        if (n.path || n.t === 'road') seg(x + 0.5, y + 0.5, x + 0.5 + dx * 0.5, y + 0.5 + dy * 0.5);
      }
    });
    this.gravel.commit(); this.trail.commit();
  }

  private loopSigns: THREE.Object3D[] = [];
  private loopKey = '';
  private syncLoopSigns(s: GameState) {
    const key = `${s.flags.leonardTile}|${s.flags.goldenTile}`;
    if (key === this.loopKey) return;
    this.loopKey = key;
    for (const o of this.loopSigns) this.scene.remove(o);
    this.loopSigns = [];
    for (const [k, text] of [['leonardTile', "LEONARD'S LOOP"], ['goldenTile', 'GOLDEN HOUR LOOP']] as const) {
      const i = s.flags[k];
      if (i === undefined) continue;
      const x = i % s.w, y = Math.floor(i / s.w), o = trailSign(text);
      o.position.set(x + 0.2, this.ground(x + 0.2, y + 0.2), y + 0.2); o.rotation.y = Math.PI / 4;
      this.scene.add(o); this.loopSigns.push(o);
    }
  }

  private buildStatic(s: GameState) {
    this.w = s.w; this.h = s.h;
    const W = s.w + 1;
    this.corners = new Float32Array(W * (s.h + 1));
    for (let cy = 0; cy <= s.h; cy++) for (let cx = 0; cx <= s.w; cx++) {
      let sum = 0, n = 0, wet = false;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const t = s.tiles[(cy + dy) * s.w + cx + dx];
        if (cx + dx < 0 || cy + dy < 0 || cx + dx >= s.w || cy + dy >= s.h || !t) continue;
        sum += t.h; n++; if (t.t === 'water') wet = true;
      }
      this.corners[cy * W + cx] = wet ? Math.min(sum / n, -0.18) : sum / n;
    }
    const pos: number[] = [], uv: number[] = [], index: number[] = [];
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const v = pos.length / 3;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { pos.push(x + dx, this.corners[(y + dy) * W + x + dx], y + dy); uv.push(dx, dy); }
      index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
    g.setIndex(index);
    g.computeVertexNormals();
    if (this.terrain) this.scene.remove(this.terrain);
    this.terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map: textures().grass }));
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

    // Lake Stillwater
    const wt = textures().water;
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(s.w + 40, s.h + 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffffff, map: wt, transparent: true, opacity: 0.92 }));
    wt.repeat.set((s.w + 40) / 3, (s.h + 40) / 3);
    this.water.position.set(s.w / 2, -0.1, s.h / 2);
    this.water.receiveShadow = true;
    this.scene.add(this.water);
    // A grassy apron beyond the map edge so the world doesn't end in a cliff.
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(s.w + 80, s.h + 80).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#86b24f' }));
    apron.position.set(s.w / 2, -0.35, s.h / 2);
    this.scene.add(apron);

    // County road with power lines along the north shoulder.
    const at = textures().asphalt.clone(); at.needsUpdate = true; at.repeat.set(s.w + 40, 1);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(s.w + 40, 0.8).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: at }));
    road.position.set(s.w / 2, 0.045, COUNTY_ROAD_Y + 0.5); road.receiveShadow = true;
    this.static.add(road);
    const poles: THREE.Vector3[] = [];
    for (let x = -18; x < s.w + 18; x += 3) {
      const p = buildModel('power_pole'); p.position.set(x + 0.5, 0.03, COUNTY_ROAD_Y + 0.05); p.rotation.y = Math.PI / 2;
      this.static.add(p); poles.push(new THREE.Vector3(x + 0.5, 0.82, COUNTY_ROAD_Y + 0.05));
    }
    for (const dz of [-0.13, 0.13]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < poles.length - 1; i++) for (let k = 0; k < 6; k++) {
        const t = k / 6; pts.push(new THREE.Vector3(poles[i].x + t * 3, 0.82 - Math.sin(t * Math.PI) * 0.08, COUNTY_ROAD_Y + 0.05 + dz));
      }
      this.static.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x333333 })));
    }
    // Landmarks
    this.landmarkObjs.clear();
    s.tiles.forEach((t, i) => {
      if (t.landmark === 'sentinel') {
        const x = i % s.w, y = Math.floor(i / s.w);
        this.sentinel.position.set(x + 0.5, this.ground(x + 0.5, y + 0.5), y + 0.5);
        this.landmarkObjs.add(this.sentinel);
      }
      if (t.landmark === 'ridge') {
        const x = i % s.w, y = Math.floor(i / s.w), m = buildModel('ridge_marker');
        m.position.set(x + 0.5, this.ground(x + 0.5, y + 0.5), y + 0.5); m.rotation.y = Math.PI / 4;
        this.landmarkObjs.add(m);
      }
    });
  }

  private tileColor(s: GameState, t: Tile): THREE.Color {
    if (t.t === 'water') return COLORS.water;
    if (t.t === 'road') return COLORS.road;
    const base = t.owned ? (COLORS as any)[t.t] as THREE.Color : t.t === 'crop' ? COLORS.nbCrop : t.t === 'pasture' ? COLORS.nbPasture : COLORS.timber;
    const c = base.clone();
    if (seasonOf(s.time.day) === 3) c.lerp(C('#dfe6e8'), 0.55);      // winter
    else if (seasonOf(s.time.day) === 2) c.lerp(C('#c9b45a'), 0.18); // fall
    return c;
  }
  private colorTerrain(s: GameState) {
    const col = this.terrain.geometry.getAttribute('color') as THREE.BufferAttribute;
    const W = s.w + 1;
    const sandCorner = (cx: number, cy: number) => this.corners[cy * W + cx] < -0.05;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x, t = s.tiles[i];
      const c = this.tileColor(s, t);
      const jitter = 0.94 + hash2(x, y, 5) * 0.08;
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy], k) => {
        const cc = t.t !== 'water' && sandCorner(x + dx, y + dy) ? COLORS.sand : c;
        col.setXYZ(i * 4 + k, cc.r * jitter, cc.g * jitter, cc.b * jitter);
      });
    }
    col.needsUpdate = true;
  }

  private syncDecor(s: GameState) {
    const lowSkip = this.low ? 2 : 1;
    for (const i of [this.trees, this.pines, this.rocks, this.signs]) i.reset();
    const buyable = new Set<number>();
    s.tiles.forEach((t, i) => {
      if (!t.owned || t.t === 'water') return;
      const x = i % s.w, y = Math.floor(i / s.w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 2], [0, -2]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
        if (Math.abs(dy) === 2 && s.tiles[(y + dy / 2) * s.w + x].t !== 'road') continue;
        const n = s.tiles[ny * s.w + nx];
        if (!n.owned && n.t !== 'water' && n.t !== 'road' && !(n.lease && s.leases.some((l) => l.id === n.lease && l.dir === 'in'))) buyable.add(ny * s.w + nx);
      }
    });
    s.tiles.forEach((t, i) => {
      const x = i % s.w, y = Math.floor(i / s.w);
      const r = (k: number) => hash2(x, y, k);
      if (t.trees && !t.b && !(t.f?.tilled)) {
        const n = t.trees;
        for (let k = 0; k < n; k += lowSkip) {
          const px = x + 0.2 + r(10 + k) * 0.6, py = y + 0.2 + r(20 + k) * 0.6;
          const pine = t.t === 'timber' ? r(30 + k) > 0.45 : r(30 + k) > 0.8;
          (pine ? this.pines : this.trees).add(px, this.ground(px, py), py, r(40 + k) * 6, 0.85 + r(50 + k) * 0.5);
        }
      }
      if (t.rock && !t.b) this.rocks.add(x + 0.3 + r(60) * 0.4, this.ground(x + 0.5, y + 0.5), y + 0.3 + r(61) * 0.4, r(62) * 6, 0.8 + r(63) * 0.6);
      if (buyable.has(i)) this.signs.add(x + 0.5, this.ground(x + 0.5, y + 0.5), y + 0.5, Math.PI / 4, 1.8);
    });
    // Off-map tree line
    for (let k = 0; k < 160; k += lowSkip) {
      const side = k % 4, f = hash2(k, 1, 77) * (side < 2 ? s.w : s.h);
      const off = 1 + hash2(k, 2, 77) * 6;
      const [px, py] = side === 0 ? [f, -off] : side === 1 ? [f, s.h + off] : side === 2 ? [-off, f] : [s.w + off, f];
      (hash2(k, 3, 77) > 0.5 ? this.pines : this.trees).add(px, -0.3, py, k, 1 + hash2(k, 4, 77) * 0.6);
    }
    for (const i of [this.trees, this.pines, this.rocks, this.signs]) i.commit();
    // Tenants at work: solar arrays and a rancher's cattle.
    this.solar.reset();
    this.tenantCows = [];
    for (const l of s.leases) {
      if (l.dir !== 'out') continue;
      for (const i of l.tiles) {
        const x = i % s.w, y = Math.floor(i / s.w);
        if (l.tenant === 'solar') this.solar.add(x + 0.5, this.ground(x + 0.5, y + 0.5), y + 0.5, 0, 1.15);
        if (l.tenant === 'rancher' && hash2(x, y, 8) > 0.3) this.tenantCows.push({ id: i, x: x + 0.5, y: y + 0.5 });
      }
    }
    this.solar.commit();
  }

  private syncFences(s: GameState) {
    for (const i of [this.posts, this.rails, this.whitePosts, this.whiteRails]) i.reset();
    const fenced = (t: Tile | undefined) => !!t && (t.owned || !!t.lease) && t.t !== 'water' && t.t !== 'road';
    const kind = (t: Tile) => (t.lease ? `L${t.lease}` : 'own');
    const postsSeen = new Set<string>();
    const edge = (ax: number, ay: number, bx: number, by: number, white: boolean) => {
      const ha = this.ground(ax, ay) + 0.01, hb = this.ground(bx, by) + 0.01;
      (white ? this.whiteRails : this.rails).addSpan(ax, ha, ay, bx, hb, by);
      for (const [px, py, ph] of [[ax, ay, ha], [bx, by, hb]]) {
        const k = `${px},${py},${white}`;
        if (!postsSeen.has(k)) { postsSeen.add(k); (white ? this.whitePosts : this.posts).add(px, ph, py); }
      }
    };
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const t = s.tiles[y * s.w + x];
      const fx = (dx: number, dy: number) => (x + dx >= 0 && y + dy >= 0 && x + dx < s.w && y + dy < s.h ? s.tiles[(y + dy) * s.w + x + dx] : undefined);
      // Property-line fence (wood rail; white for leased parcels).
      if (fenced(t)) {
        for (const [dx, dy, ax, ay, bx, by] of [[0, -1, 0, 0, 1, 0], [0, 1, 0, 1, 1, 1], [-1, 0, 0, 0, 0, 1], [1, 0, 1, 0, 1, 1]]) {
          const n = fx(dx, dy);
          if (n?.t === 'water' || (t.landmark === 'entrance' && dy === -1) || (t.b && dy === -1 && n?.t === 'road' && s.buildings.find((b) => b.id === t.b)?.type === 'farm_sign')) continue;
          if (!fenced(n) || kind(n!) !== kind(t)) edge(x + ax, y + ay, x + bx, y + by, !!t.lease);
        }
      }
      // Player-drawn fences around fenced tiles.
      if (t.fence) for (const [dx, dy, ax, ay, bx, by] of [[0, -1, 0.04, 0.04, 0.96, 0.04], [0, 1, 0.04, 0.96, 0.96, 0.96], [-1, 0, 0.04, 0.04, 0.04, 0.96], [1, 0, 0.96, 0.04, 0.96, 0.96]]) {
        if (!fx(dx, dy)?.fence) edge(x + ax, y + ay, x + bx, y + by, true);
      }
    }
    for (const i of [this.posts, this.rails, this.whitePosts, this.whiteRails]) i.commit();
  }

  private cropInstancer(id: string) {
    let inst = this.crops.get(id);
    if (!inst) {
      const def = CROP[id];
      const g = new THREE.Group();
      const m = mat('#ffffff');
      if (def.shape === 'tall') { cyl(g, 0.03, 0.045, 0.24, m, 0, 0, 0, 6); cone(g, 0.05, 0.1, m, 0, 0.2, 0, 6); }
      else if (def.shape === 'clump') box(g, 0.16, 0.1, 0.06, m, 0, 0, 0);
      else if (def.shape === 'bush') { const b = cyl(g, 0.05, 0.06, 0.08, m, 0, 0, 0, 6); b.scale.set(1, 1, 1); }
      else if (def.shape === 'flower') { cyl(g, 0.008, 0.008, 0.18, m, 0, 0, 0, 4); const f = cyl(g, 0.035, 0.035, 0.015, m, 0, 0.18, 0, 8); f.rotation.x = 0.5; }
      else { const b = cyl(g, 0.045, 0.05, 0.06, m, 0, 0, 0, 8); b.scale.set(1, 1, 1); }
      inst = new Instancer(g, 20000, { shadows: def.shape === 'tall' || def.shape === 'flower' });
      this.crops.set(id, inst);
      this.scene.add(inst.group);
    }
    return inst;
  }
  private syncCrops(s: GameState) {
    this.dirt.reset();
    for (const i of this.crops.values()) i.reset();
    const green = C('#5fae3c');
    const season = seasonOf(s.time.day);
    const plant = (x: number, y: number, cropId: string, growth: number, rows: number) => {
      const def = CROP[cropId];
      const inst = this.cropInstancer(cropId);
      const ripe = growth >= 1;
      const color = green.clone().lerp(C(def.color), ripe ? 1 : growth * 0.5);
      const sc = 0.35 + Math.min(growth, 1) * 0.75;
      for (let r = 0; r < rows; r++) for (let c = 0; c < rows; c++) {
        const px = x + 0.12 + (c + 0.5) * (0.76 / rows), py = y + 0.12 + (r + 0.5) * (0.76 / rows);
        inst.add(px, this.ground(px, py) + 0.02, py, def.shape === 'clump' ? 0 : hash2(x * 9 + c, y * 9 + r, 1) * 6, sc, color);
      }
    };
    s.tiles.forEach((t, i) => {
      const x = i % s.w, y = Math.floor(i / s.w);
      if (t.f?.tilled) {
        this.dirt.add(x + 0.5, this.ground(x + 0.5, y + 0.5) + 0.005, y + 0.5);
        if (t.f.crop) plant(x, y, t.f.crop, t.f.growth, 4);
        return;
      }
      // Neighbors (and tenants) farm their own land.
      const tenantCrop = t.lease && s.leases.find((l) => l.id === t.lease && l.dir === 'out' && l.tenant === 'farmer');
      if ((!t.owned && t.t === 'crop' && !t.lease && season < 3 && !this.low) || tenantCrop) {
        const opts = season === 2 ? ['wheat', 'pumpkins', 'corn'] : ['corn', 'soybeans', 'wheat'];
        const crop = opts[Math.floor(hash2(x >> 1, y >> 1, 3) * 3)];
        const growth = Math.min(1, 0.3 + ((s.time.day - 1) % 9) / 6 + hash2(x >> 1, y >> 1, 4) * 0.5);
        this.dirt.add(x + 0.5, this.ground(x + 0.5, y + 0.5) + 0.005, y + 0.5);
        plant(x, y, crop, growth, 4);
      }
    });
    this.dirt.commit();
    for (const i of this.crops.values()) i.commit();
  }

  private syncBuildings(s: GameState) {
    const seen = new Set<number>();
    for (const b of s.buildings) {
      seen.add(b.id);
      const key = `${b.type}|${b.level}|${b.x},${b.y}`;
      const have = this.buildings.get(b.id);
      if (have?.key === key) continue;
      if (have) this.scene.remove(have.obj);
      const obj = buildModel(b.type, b.level);
      obj.position.set(b.x + 0.5, this.ground(b.x + 0.5, b.y + 0.5), b.y + 0.5);
      obj.rotation.y = this.facingFor(s, b.x, b.y, b.type);
      if (b.type === 'fishing_dock') obj.position.y = Math.max(obj.position.y, -0.02);
      this.scene.add(obj);
      this.buildings.set(b.id, { obj, key });
    }
    for (const [id, v] of this.buildings) if (!seen.has(id)) { this.scene.remove(v.obj); this.buildings.delete(id); }
  }
  /** Buildings face the road, docks face the water. */
  private facingFor(s: GameState, x: number, y: number, type: string) {
    const t = (dx: number, dy: number) => s.tiles[(y + dy) * s.w + x + dx];
    if (type === 'fishing_dock' || type === 'guest_cabin') {
      const dirs: [number, number, number][] = [[0, 1, 0], [1, 0, Math.PI / 2], [0, -1, Math.PI], [-1, 0, -Math.PI / 2]];
      for (const [dx, dy, a] of dirs) if (t(dx, dy)?.t === 'water') return type === 'guest_cabin' ? a : a;
    }
    if (t(0, -1)?.t === 'road') return Math.PI;
    return 0;
  }

  // ── selection / ghost ─────────────────────────────────────────────────────
  select(s: GameState, tile: { x: number; y: number } | null) {
    this.selection.visible = !!tile;
    if (tile) this.selection.position.set(tile.x + 0.5, this.tileTop(s, tile.x, tile.y) + 0.03, tile.y + 0.5);
  }
  ghost(s: GameState, type: string | null, x = 0, y = 0, ok = true) {
    if (!type) { if (this.ghostObj) this.scene.remove(this.ghostObj); this.ghostObj = null; this.ghostKey = ''; this.ghostTile.visible = false; return; }
    const key = `${type}|${ok}`;
    if (this.ghostKey !== key) {
      if (this.ghostObj) this.scene.remove(this.ghostObj);
      this.ghostObj = buildModel(type);
      const gm = new THREE.MeshLambertMaterial({ color: ok ? 0x8dffa0 : 0xff8080, transparent: true, opacity: 0.6 });
      this.ghostObj.traverse((o) => { if (o instanceof THREE.Mesh) { o.material = gm; o.castShadow = false; } });
      this.scene.add(this.ghostObj);
      this.ghostKey = key;
      (this.ghostTile.material as THREE.MeshBasicMaterial).color.set(ok ? 0x46d160 : 0xe04848);
    }
    this.ghostObj!.position.set(x + 0.5, this.ground(x + 0.5, y + 0.5) + 0.02, y + 0.5);
    this.ghostObj!.rotation.y = this.facingFor(s, x, y, type);
    this.ghostTile.visible = true;
    this.ghostTile.position.set(x + 0.5, this.tileTop(s, x, y) + 0.02, y + 0.5);
  }

  spawnCar(standX: number) {
    const colors = ['#e8b23a', '#d64545', '#3f7fd1', '#f4f1e8', '#4a4a4a', '#5cb85c'];
    const obj = carModel(colors[Math.floor(Math.random() * colors.length)]);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const x = dir > 0 ? standX - 14 : standX + 14;
    obj.position.set(x, 0.05, COUNTY_ROAD_Y + 0.5 + (dir > 0 ? 0.18 : -0.18));
    obj.rotation.y = dir > 0 ? 0 : Math.PI;
    this.scene.add(obj);
    this.cars.push({ obj, x, stopX: standX + 0.5, t: 0, dir });
  }

  // ── per frame ─────────────────────────────────────────────────────────────
  frame(s: GameState, dt: number) {
    this.time.value += dt;
    const minute = s.time.minute;
    // Sun arc from east (morning) to west (evening).
    const dayT = (minute / 60 - 6) / 14;
    const light = Math.min(1, daylight(minute) * 1.8);
    const golden = isGoldenHour(minute);
    const az = Math.PI * (0.15 + dayT * 0.7);
    const el = 0.25 + light * 0.95;
    this.sun.position.set(this.target.x + Math.cos(az) * 30, Math.max(6, Math.sin(el) * 40), this.target.z - Math.sin(az) * 18 + 10);
    this.sun.target.position.copy(this.target);
    const night = 1 - Math.min(1, light * 2.2);
    const sunCol = golden ? C('#ffb35c') : C('#fff4e0').lerp(C('#ffd29a'), 1 - light);
    this.sun.color.copy(sunCol);
    this.sun.intensity = 0.25 + light * 2.4 + (golden ? 0.4 : 0);
    this.hemi.intensity = 0.5 + light * 1.1;
    this.hemi.color.copy(C('#cfe8ff').lerp(C('#6a7fb8'), night).lerp(C('#ffc88a'), golden ? 0.55 : 0));
    this.sky.copy(C('#a7d8f0').lerp(C('#1d2a4a'), night).lerp(C('#f6b878'), golden ? 0.6 : 0));
    this.scene.background = this.sky;
    // water ripple
    const wt = (this.water.material as THREE.MeshLambertMaterial).map!;
    wt.offset.set(Math.sin(this.time.value * 0.2) * 0.05, this.time.value * 0.01);
    // spinning / flickering bits
    for (const { obj } of this.buildings.values()) {
      const spin = obj.getObjectByName('spin'); if (spin) spin.rotation.z += dt * 2;
      const flame = obj.getObjectByName('flame'); if (flame) flame.scale.setScalar(0.85 + Math.sin(this.time.value * 13) * 0.15 + (night > 0.3 ? 0.3 : 0));
    }
    this.drawActors(s, dt);
    for (const c of this.cars) {
      c.t += dt;
      const toStop = (c.stopX - c.obj.position.x) * c.dir;
      const speed = toStop > 0 && toStop < 2 ? Math.max(0.15, toStop) * 1.5 : 3;
      if (toStop > 0.05 || c.t > 6) c.obj.position.x += c.dir * speed * dt;
    }
    this.cars = this.cars.filter((c) => {
      if (Math.abs(c.obj.position.x - c.stopX) > 16) { this.scene.remove(c.obj); return false; }
      return true;
    });
    this.renderer.render(this.scene, this.camera);
  }

  private drawActors(s: GameState, dt: number) {
    const p = s.player;
    const gy = this.ground(p.x, p.y);
    const v = p.vehicle;
    for (const [k, obj] of Object.entries(this.vehicles)) {
      const owned = s.vehicles.includes(k as any);
      obj.visible = owned;
      if (!owned) continue;
      if (k === v) { obj.position.set(p.x, gy, p.y); obj.rotation.y = this.facing; continue; }
      const at = s.parked[k] ?? { x: p.x + 0.6, y: p.y + 0.5 };
      obj.position.set(at.x, this.ground(at.x, at.y), at.y);
    }
    this.player.visible = v === 'foot' || v === 'atv' || v === 'tractor';
    const seat = v === 'atv' ? 0.08 : v === 'tractor' ? 0.16 : 0;
    this.player.position.set(p.x, gy + seat, p.y);
    this.player.rotation.y = this.facing;
    this.player.scale.setScalar(v === 'foot' ? 1 : 0.8);
    // Ace follows a little behind; rides in the truck bed.
    if (v === 'truck') {
      const tr = this.vehicles.truck;
      this.acePos.set(tr.position.x - Math.cos(this.facing) * 0.13, gy + 0.11, tr.position.z + Math.sin(this.facing) * 0.13);
      this.ace.rotation.y = this.facing;
    } else {
      const behind = new THREE.Vector3(p.x - Math.cos(this.facing) * 0.35 + 0.12, 0, p.y + Math.sin(this.facing) * 0.35 + 0.12);
      const d = behind.distanceTo(new THREE.Vector3(this.acePos.x, 0, this.acePos.z));
      if (d > 4) this.acePos.copy(behind);
      else if (d > 0.05) {
        const k = Math.min(1, dt * 3);
        this.ace.rotation.y = Math.atan2(-(behind.z - this.acePos.z), behind.x - this.acePos.x);
        this.acePos.x += (behind.x - this.acePos.x) * k; this.acePos.z += (behind.z - this.acePos.z) * k;
      }
      this.acePos.y = this.ground(this.acePos.x, this.acePos.z) + Math.abs(Math.sin(this.time.value * 9)) * (d > 0.1 ? 0.02 : 0);
    }
    this.ace.position.copy(this.acePos);
    // Cattle graze around their spot.
    this.cows.reset();
    for (const c of [...s.cattle, ...this.tenantCows.map((q) => ({ ...q, age: 99 }))]) {
      const t = this.time.value * 0.15 + c.id;
      const x = c.x + Math.sin(t) * 0.25, y = c.y + Math.cos(t * 0.7) * 0.25;
      this.cows.add(x, this.ground(x, y), y, -t, c.age < 9 ? 0.75 : 1);
    }
    this.cows.commit();
  }
  /** Turns the player model toward a movement direction (screen-relative input already mapped to world). */
  face(dx: number, dy: number) { if (dx || dy) this.facing = Math.atan2(-dy, dx); }

  dispose() { this.renderer.dispose(); this.renderer.domElement.remove(); }
}
