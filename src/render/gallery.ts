import * as THREE from 'three';
import { MODELS } from './meshes';
import { CROPS } from '../sim/content/crops';
import { GAME_NAME } from '../config';

// Dev page: renders every generated model so the art can be reviewed at a glance.
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(220, 220);
r.outputColorSpace = THREE.SRGBColorSpace;
r.shadowMap.enabled = true;
document.title = `${GAME_NAME} — Asset Gallery`;
document.body.style.cssText = 'margin:0;padding:16px;background:#f4efe2;font-family:Fredoka,system-ui,sans-serif;color:#3b2a18';
const h = document.createElement('h1'); h.textContent = 'Asset Gallery'; document.body.append(h);
const grid = document.createElement('div');
grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px';
document.body.append(grid);

function shot(obj: THREE.Object3D, label: string, group: string) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bfe3f2');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa55, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(3, 5, 2); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#9cd05a' }));
  scene.add(ground, obj);
  const bb = new THREE.Box3().setFromObject(obj);
  const size = Math.max(...bb.getSize(new THREE.Vector3()).toArray()) * 0.8 + 0.05;
  const c = bb.getCenter(new THREE.Vector3());
  const cam = new THREE.OrthographicCamera(-size, size, size, -size, 0.01, 50);
  cam.position.copy(c).add(new THREE.Vector3(1, 1.1, 1).normalize().multiplyScalar(10));
  cam.lookAt(c);
  r.render(scene, cam);
  const card = document.createElement('figure');
  card.style.cssText = 'margin:0;background:#fff;border-radius:14px;padding:8px;box-shadow:0 2px 0 #d8cbb0;text-align:center';
  card.innerHTML = `<img src="${r.domElement.toDataURL()}" style="width:100%;border-radius:10px"><figcaption><b>${label}</b><br><small>${group}</small></figcaption>`;
  grid.append(card);
}

for (const m of MODELS) shot(m.build(), m.name, m.group);
// Crops at each growth stage
for (const c of CROPS) for (const stage of [0.2, 0.6, 1]) {
  const g = new THREE.Group();
  const col = new THREE.Color('#5fae3c').lerp(new THREE.Color(c.color), stage >= 1 ? 1 : stage * 0.5);
  for (let i = 0; i < 9; i++) {
    const shape = c.shape === 'tall' ? new THREE.CylinderGeometry(0.012, 0.02, 0.22, 5) : c.shape === 'clump' ? new THREE.BoxGeometry(0.16, 0.1, 0.06) : c.shape === 'flower' ? new THREE.CylinderGeometry(0.03, 0.008, 0.18, 6) : new THREE.CylinderGeometry(0.05, 0.055, 0.07, 8);
    const m = new THREE.Mesh(shape, new THREE.MeshLambertMaterial({ color: col }));
    const s = 0.35 + stage * 0.75;
    m.scale.setScalar(s); m.position.set((i % 3) * 0.25, 0.05 * s, Math.floor(i / 3) * 0.25);
    g.add(m);
  }
  shot(g, `${c.name} ${stage >= 1 ? '(ready)' : Math.round(stage * 100) + '%'}`, 'Crops');
}
