import * as THREE from 'three';

// Small procedural textures, nearest-neighbor filtered for a crisp toy look.
function make(size: number, draw: (g: CanvasRenderingContext2D, rnd: () => number) => void, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  draw(g, rnd);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(g: CanvasRenderingContext2D, rnd: () => number, size: number, base: string, dots: string[], n: number, r = 1) {
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) { g.fillStyle = dots[Math.floor(rnd() * dots.length)]; g.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), r, r); }
}

let cache: ReturnType<typeof build> | null = null;
function build() {
  return {
    // white-ish so vertex colors tint it
    grass: make(32, (g, r) => {
      speckle(g, r, 32, '#f2f2f2', ['#ffffff', '#dcdcdc', '#e6e6e6', '#cfcfcf'], 160, 1);
      g.fillStyle = 'rgba(60,90,30,0.10)'; g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32); // faint parcel lines
    }),
    dirt: make(32, (g, r) => {
      speckle(g, r, 32, '#a5743f', ['#8e6233', '#b7854c', '#7d5329'], 120, 1);
      g.fillStyle = 'rgba(70,45,20,0.35)';
      for (let y = 2; y < 32; y += 6) g.fillRect(0, y, 32, 2); // furrows
    }),
    wood: make(32, (g, r) => {
      g.fillStyle = '#b98b55'; g.fillRect(0, 0, 32, 32);
      for (let y = 0; y < 32; y += 8) { g.fillStyle = '#8f6537'; g.fillRect(0, y, 32, 1); }
      for (let i = 0; i < 40; i++) { g.fillStyle = r() > 0.5 ? '#a77a47' : '#c99b62'; g.fillRect(Math.floor(r() * 32), Math.floor(r() * 32), 3, 1); }
    }),
    shingles: make(32, (g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 32, 32);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let y = 0; y < 32; y += 6) { g.fillRect(0, y, 32, 1); for (let x = (y / 6) % 2 ? 3 : 0; x < 32; x += 6) g.fillRect(x, y, 1, 6); }
    }),
    water: make(64, (g, r) => {
      g.fillStyle = '#3f8fd0'; g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 70; i++) { g.fillStyle = r() > 0.4 ? 'rgba(255,255,255,0.35)' : 'rgba(30,90,160,0.5)'; g.fillRect(Math.floor(r() * 64), Math.floor(r() * 64), 4 + Math.floor(r() * 5), 1); }
    }, 12),
    asphalt: make(32, (g, r) => {
      speckle(g, r, 32, '#55585e', ['#4a4c51', '#61646a'], 100, 1);
      g.fillStyle = '#f2c94c'; g.fillRect(0, 15, 12, 2); g.fillRect(18, 15, 10, 2);
    }),
  };
}
export const textures = () => (cache ??= build());
