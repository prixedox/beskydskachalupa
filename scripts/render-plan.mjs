import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { pdf } from 'pdf-to-img';
import { parseCrop, cropRect } from './lib/house-files.mjs';

const USAGE = 'Usage: node scripts/render-plan.mjs <pdf|image> [<next floor> …] <houseId> [--rotate 90|180|270 …] [--crop x,y,w,h …] [--floor <name> …] [--scale 4]';

// Leading file arguments are the floors, drawn left to right into one plan image: a PDF
// (its first page) or an image such as a garden map (SVG, PNG, JPG), used at its own size.
const FLOOR_FILE = /\.(pdf|svg|png|jpe?g)$/i;
const args = process.argv.slice(2);
const firstOther = args.findIndex((a) => !FLOOR_FILE.test(a));
const pdfPaths = firstOther > 0 ? args.slice(0, firstOther) : [];
const [houseId, ...rest] = firstOther > 0 ? args.slice(firstOther) : [];
if (pdfPaths.length === 0 || !/^[a-z0-9-]+$/.test(houseId ?? '')) {
  console.error(USAGE);
  process.exit(1);
}
const opts = (name) => rest.flatMap((a, i) => (a === name ? [rest[i + 1]] : []));
// One --crop per floor, in the same order; fractions of the page after --rotate.
const crops = opts('--crop').map(parseCrop);
// One --floor per PDF names the floors; rooms in tour.json refer to these names.
const names = opts('--floor');
const scale = Number(opts('--scale')[0] ?? 4);
// One --rotate turns every floor; several are taken per floor, in order.
const rotations = opts('--rotate').map(Number);
const rotationOf = (i) => (rotations.length === 1 ? rotations[0] : rotations[i] ?? 0);

async function renderFloor(file, crop, rotate) {
  let page;
  if (/\.pdf$/i.test(file)) {
    for await (const p of await pdf(file, { scale })) {
      page = p;
      break;
    }
  } else {
    page = await sharp(file).png().toBuffer();
  }
  // Rotate first (plans are often drawn sideways), so the crop is given as the result looks.
  const upright = rotate ? await sharp(page).rotate(rotate).png().toBuffer() : page;
  const { width, height } = await sharp(upright).metadata();
  const image = crop ? sharp(upright).extract(cropRect(crop, width, height)) : sharp(upright);
  return image.flatten({ background: '#fff' }).png().toBuffer({ resolveWithObject: true });
}

const floors = [];
for (const [i, file] of pdfPaths.entries()) floors.push(await renderFloor(file, crops[i], rotationOf(i)));

// The gap keeps the neighbouring floor out of the minimap, which shows one floor at a time.
const gap = Math.round(floors[0].info.width * 0.15);
let left = 0;
const parts = [];
const placed = floors.map(({ data, info }, i) => {
  const at = { input: data, left, top: 0 };
  parts.push({ name: names[i] ?? String(i + 1), x: left, width: info.width });
  console.log(`floor at x=${left}: ${info.width}x${info.height}`);
  left += info.width + gap;
  return at;
});
const size = { width: left - gap, height: Math.max(...floors.map((f) => f.info.height)) };

const outDir = path.join('public', 'houses', houseId);
const { width, height } = await sharp({ create: { ...size, channels: 3, background: '#fff' } })
  .composite(placed)
  .png({ palette: true })
  .toFile(path.join(outDir, 'plan.png'));
console.log(`wrote plan.png ${width}x${height}`);

const tourPath = path.join(outDir, 'tour.json');
if (await access(tourPath).then(() => true, () => false)) {
  const tour = JSON.parse(await readFile(tourPath, 'utf8'));
  tour.plan = { image: 'plan.png', width, height, ...(parts.length > 1 ? { floors: parts } : {}) };
  await writeFile(tourPath, JSON.stringify(tour, null, 2) + '\n');
  console.log('updated tour.json plan');
}
