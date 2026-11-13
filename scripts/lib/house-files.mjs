export function isPanorama(width, height) {
  return Math.abs(width / height - 2) < 0.02;
}

export function skeletonTour(title, rooms, exterior) {
  return {
    title,
    start: rooms[0]?.id,
    plan: null,
    rooms: rooms.map(({ id, name }) => ({
      id,
      name,
      pano: `pano/${id}.jpg`,
      preview: `pano/${id}-preview.jpg`,
      planPos: null,
      northOffset: 0,
      links: [],
    })),
    exterior,
  };
}

export function parseCrop(text) {
  const parts = String(text).split(',').map(Number);
  const [x, y, w, h] = parts;
  const valid =
    parts.length === 4 &&
    parts.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) &&
    w > 0 && h > 0 && x + w <= 1 && y + h <= 1;
  if (!valid) throw new Error('Crop must be x,y,w,h fractions within 0..1');
  return parts;
}

export function cropRect([x, y, w, h], width, height) {
  return {
    left: Math.round(x * width),
    top: Math.round(y * height),
    width: Math.round(w * width),
    height: Math.round(h * height),
  };
}

const MAPPING_ID = /^[a-z0-9-]+$/;

export function validateMapping(mapping) {
  const seen = new Set();
  for (const [file, entry] of Object.entries(mapping)) {
    const id = entry?.id;
    if (typeof id !== 'string' || !MAPPING_ID.test(id)) {
      throw new Error(`Neplatné id "${id}" u souboru ${file} (povoleno a-z, 0-9, pomlčka).`);
    }
    if (seen.has(id)) throw new Error(`Duplicitní id "${id}" v mapování (soubor ${file}).`);
    seen.add(id);
  }
}
