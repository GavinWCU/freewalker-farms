// Generates the app icons (PNG) from code: sky, rolling hill, a red barn and the sun.
// Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel((x + 0.5) / size, (y + 0.5) / size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
function art(x, y) {
  let c = mix([120, 196, 236], [255, 214, 140], y); // sky
  if (Math.hypot(x - 0.76, y - 0.24) < 0.1) c = [255, 210, 80]; // sun
  const hill = 0.62 + Math.sin(x * 3.2) * 0.06;
  if (y > hill) c = mix([140, 205, 90], [90, 160, 60], (y - hill) * 2); // field
  if (y > hill + 0.12 && Math.floor(x * 14 + y * 6) % 2 === 0) c = mix(c, [235, 190, 80], 0.5); // wheat rows
  // barn: body + gambrel roof + door
  if (x > 0.24 && x < 0.56 && y > 0.48 && y < 0.72) c = [200, 58, 48];
  const roofY = 0.48 - (0.16 - Math.abs(x - 0.4)) * 0.9;
  if (x > 0.21 && x < 0.59 && y < 0.49 && y > roofY && y > 0.3) c = [70, 74, 84];
  if (x > 0.35 && x < 0.45 && y > 0.58 && y < 0.72) c = [245, 240, 228];
  if (x > 0.36 && x < 0.44 && y > 0.6 && y < 0.72 && Math.abs((x - 0.36) / 0.08 - (y - 0.6) / 0.12) < 0.12) c = [200, 58, 48];
  return c;
}
mkdirSync('public/icons', { recursive: true });
for (const size of [180, 192, 512]) writeFileSync(`public/icons/icon-${size}.png`, png(size, art));
console.log('icons written');
