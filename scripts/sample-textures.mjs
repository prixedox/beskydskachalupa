// Cuts flat, seamlessly tileable textures out of a house's panoramas and photos.
// Usage: node scripts/sample-textures.mjs <houseId> [--raw]
// Reads houses-src/<id>.textures.json, writes public/houses/<id>/textures/<name>.jpg.
// --raw also writes <name>.raw.jpg (before tiling) to check what was sampled.
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { toImage, toBuffer, floorPatch, viewPatch, crop, flattenLighting, makeTileable, averageColor } from './lib/equirect.mjs';

const [houseId, ...flags] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(houseId ?? '')) {
  console.error('Usage: node scripts/sample-textures.mjs <houseId> [--raw]');
  process.exit(1);
}
const raw = flags.includes('--raw');
const houseDir = path.join('public', 'houses', houseId);
const outDir = path.join(houseDir, 'textures');
const spec = JSON.parse(await readFile(path.join('houses-src', `${houseId}.textures.json`), 'utf8'));
await mkdir(outDir, { recursive: true });

const deg = (d) => (d * Math.PI) / 180;
const cache = new Map();
async function load(source) {
  if (!cache.has(source)) {
    const { data, info } = await sharp(path.join(houseDir, source)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    cache.set(source, toImage(data, info.width, info.height, info.channels));
  }
  return cache.get(source);
}

const writeJpg = (img, file) =>
  sharp(toBuffer(img), { raw: { width: img.width, height: img.height, channels: 3 } }).jpeg({ quality: 88 }).toFile(file);

for (const t of spec.textures) {
  const src = await load(t.source);
  const px = t.px ?? 512;
  let patch;
  if (t.floor) {
    patch = floorPatch(src, { yaw: deg(t.floor.yaw), dist: t.floor.dist, size: t.floor.size, rotate: deg(t.floor.rotate ?? 0), camHeight: spec.camHeight, px });
  } else if (t.view) {
    patch = viewPatch(src, { yaw: deg(t.view.yaw), pitch: deg(t.view.pitch), fov: deg(t.view.fov), px });
  } else if (t.crop) {
    const [x, y, w, h] = t.crop;
    patch = crop(src, x, y, w, h);
  } else {
    throw new Error(`Texture ${t.name}: needs floor, view or crop`);
  }
  if (raw) await writeJpg(patch, path.join(outDir, `${t.name}.raw.jpg`));
  const flat = flattenLighting(patch, Math.round(patch.width / 6));
  const tiled = makeTileable(flat, Math.round(patch.width * (t.overlap ?? 0.2)));
  const file = path.join(outDir, `${t.name}.jpg`);
  await sharp(toBuffer(tiled), { raw: { width: tiled.width, height: tiled.height, channels: 3 } })
    .resize(t.out ?? tiled.width)
    .jpeg({ quality: 88 })
    .toFile(file);
  console.log(`${t.name}: ${tiled.width}px, average ${averageColor(patch)}`);
}
