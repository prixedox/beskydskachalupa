# House Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reusable web virtual tour (360° panoramas, room-to-room hotspots, floor-plan minimap, Czech UI) with a built-in editor, demoed on house Krakovská.

**Architecture:** Static Vite site. Each house is a folder `public/houses/<id>/` with web-sized images + `tour.json`. Pure modules (`tour-loader`, `viewer/nodes`, `editor/editor-state`, `editor/draft`) hold all logic and are unit-tested; thin DOM/PSV layers (`viewer/viewer.js`, `viewer/ui.js`, `editor/editor.js`, `editor/editor-panel.js`) wire Photo Sphere Viewer 5 and are covered by a Playwright smoke test. Node scripts prepare images and render the PDF floor plan.

**Tech Stack:** Node 24, Vite 8, vanilla JS (ESM), Photo Sphere Viewer 5.15.1 (core + virtual-tour, markers, map, gallery, gyroscope plugins), three, sharp, pdf-to-img 7, Vitest 5, @playwright/test.

**Spec:** `docs/superpowers/specs/2026-09-29-house-tour-design.md`

## Global Constraints

- UI text Czech only. Code, comments, identifiers English.
- All `@photo-sphere-viewer/*` packages pinned to the same version `5.15.1`.
- No backend, no UI framework. Static output only (`vite build`).
- `tour.json` format exactly as spec "Data model"; `yaw`/`pitch`/`northOffset` radians; `planPos` normalized `[0..1, 0..1]`; paths relative to the house folder.
- House ids match `/^[a-z0-9-]+$/`.
- Panorama output 4096×2048 JPEG q82; preview 512×256 blurred; exterior max 2560 px wide.
- Source photos live outside the repo (`C:\Users\prixe\Downloads\photos`); only generated images go into `public/houses/`.
- Shell: commands shown are for PowerShell 5.1 (no `&&`; use `;`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Unknown house on the Vite dev server: Vite answers `/houses/nope/tour.json` with index.html + HTTP 200 → user must see "Prohlídka „nope“ neexistuje.", not a JSON parse error. (Task 1 test + Task 5 e2e.)
2. Reverse links created by the editor have `yaw: null` → viewer must skip them, never render an arrow at NaN or crash. (Task 4 test.)
3. Yaw wrap-around: `entryYaw` and `setNorth` must normalize to `[0, 2π)` for inputs beyond ±π / negative. (Tasks 4, 6 tests.)
4. Corrupt or stale localStorage draft (invalid JSON, fails validation, storage throws) → ignored, editor still opens with served tour. (Task 6 test.)
5. Room names containing `<`, `&`, `"` or Czech diacritics rendered in the editor panel → shown literally, no HTML injection. (Task 7 test on `escapeHtml`.)

---

## File Structure

```
house-tour/
  package.json, vite.config.js, playwright.config.js, index.html, .gitignore, README.md
  houses-src/krakovska.mapping.json   # source filename -> room id/name
  scripts/
    lib/house-files.mjs      # pure helpers: isPanorama, skeletonTour, parseCrop, cropRect
    prepare-house.mjs        # CLI: source photos -> public/houses/<id>/
    render-plan.mjs          # CLI: PDF -> plan.png, updates tour.json plan
  src/
    main.js                  # URL params -> viewer or editor
    styles.css
    tour-loader.js           # TourError, validateTour, loadTour, findMissingPanoramas, withoutRooms
    viewer/nodes.js          # normalizeYaw, entryYaw, tourToNodes (pure)
    viewer/viewer.js         # createViewer: PSV + plugins
    viewer/ui.js             # renderHeader, showError, openLightbox
    editor/editor-state.js   # pure tour edit operations, validate, toJSON
    editor/draft.js          # readDraft / writeDraft / clearDraft (localStorage)
    editor/editor-panel.js   # escapeHtml, renderPanel (DOM)
    editor/editor.js         # startEditor: wires panel + viewer + state
  public/houses/krakovska/   # generated: pano/, exterior/, plan.png, tour.json
  tests/
    tour-loader.test.js, house-files.test.js, nodes.test.js,
    editor-state.test.js, draft.test.js, editor-panel.test.js
    e2e/smoke.spec.js
```

---

### Task 1: Project scaffold + tour loader

**Files:**
- Create: `package.json`, `vite.config.js`, `.gitignore`, `index.html`, `src/tour-loader.js`
- Test: `tests/tour-loader.test.js`

**Interfaces:**
- Produces:
  - `class TourError extends Error`
  - `validateTour(json: unknown) -> { tour: Tour, warnings: string[] }` (throws `TourError`)
  - `loadTour(houseId: string, baseUrl: string, fetchImpl = fetch) -> Promise<Tour>`
  - `findMissingPanoramas(tour: Tour, baseUrl: string, fetchImpl = fetch) -> Promise<string[]>` (room ids)
  - `withoutRooms(tour: Tour, ids: string[]) -> Tour` (throws `TourError` if nothing left)
  - `Tour = { title: string, start: string, plan: {image,width,height}|null, rooms: Room[], exterior: string[] }`
  - `Room = { id, name, pano, preview: string|null, planPos: [number,number]|null, northOffset: number, links: Link[] }`
  - `Link = { to: string, yaw: number|null, pitch: number }`

- [ ] **Step 1: Scaffold project and install dependencies**

`C:\dev\house-tour\package.json`:
```json
{
  "name": "house-tour",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "prepare-house": "node scripts/prepare-house.mjs",
    "render-plan": "node scripts/render-plan.mjs"
  }
}
```

Run:
```powershell
cd C:\dev\house-tour
npm i @photo-sphere-viewer/core@5.15.1 @photo-sphere-viewer/virtual-tour-plugin@5.15.1 @photo-sphere-viewer/markers-plugin@5.15.1 @photo-sphere-viewer/map-plugin@5.15.1 @photo-sphere-viewer/gallery-plugin@5.15.1 @photo-sphere-viewer/gyroscope-plugin@5.15.1 three
npm i -D vite vitest sharp pdf-to-img @playwright/test
```
Expected: installs without peer-dependency errors.

`vite.config.js`:
```js
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
  },
});
```

`.gitignore`:
```
node_modules/
dist/
test-results/
playwright-report/
```

`index.html`:
```html
<!doctype html>
<html lang="cs">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Prohlídka domu</title>
  </head>
  <body>
    <header id="header"></header>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the failing tests**

`tests/tour-loader.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { validateTour, loadTour, findMissingPanoramas, withoutRooms, TourError } from '../src/tour-loader.js';

const room = (id, extra = {}) => ({ id, name: id.toUpperCase(), pano: `pano/${id}.jpg`, ...extra });

describe('validateTour', () => {
  it('normalizes a minimal tour with defaults', () => {
    const { tour, warnings } = validateTour({ rooms: [room('a')] });
    expect(warnings).toEqual([]);
    expect(tour).toEqual({
      title: 'Prohlídka',
      start: 'a',
      plan: null,
      exterior: [],
      rooms: [{ id: 'a', name: 'A', pano: 'pano/a.jpg', preview: null, planPos: null, northOffset: 0, links: [] }],
    });
  });

  it('keeps optional fields when valid', () => {
    const { tour } = validateTour({
      title: 'Dům',
      start: 'b',
      plan: { image: 'plan.png', width: 2000, height: 1500 },
      exterior: ['exterior/01.jpg', 42],
      rooms: [
        room('a', { preview: 'pano/a-preview.jpg', planPos: [0.5, 0.25], northOffset: 1.5, links: [{ to: 'b', yaw: 1, pitch: -0.1 }] }),
        room('b'),
      ],
    });
    expect(tour.title).toBe('Dům');
    expect(tour.start).toBe('b');
    expect(tour.plan).toEqual({ image: 'plan.png', width: 2000, height: 1500 });
    expect(tour.exterior).toEqual(['exterior/01.jpg']);
    expect(tour.rooms[0]).toMatchObject({ preview: 'pano/a-preview.jpg', planPos: [0.5, 0.25], northOffset: 1.5, links: [{ to: 'b', yaw: 1, pitch: -0.1 }] });
  });

  it('keeps unplaced links as yaw null', () => {
    const { tour } = validateTour({ rooms: [room('a', { links: [{ to: 'b' }] }), room('b')] });
    expect(tour.rooms[0].links).toEqual([{ to: 'b', yaw: null, pitch: 0 }]);
  });

  it('drops links to unknown rooms with a warning', () => {
    const { tour, warnings } = validateTour({ rooms: [room('a', { links: [{ to: 'zzz', yaw: 0 }] })] });
    expect(tour.rooms[0].links).toEqual([]);
    expect(warnings).toEqual(['Místnost a: odkaz na neznámou místnost zzz']);
  });

  it('falls back to first room when start is unknown', () => {
    const { tour, warnings } = validateTour({ start: 'nope', rooms: [room('a'), room('b')] });
    expect(tour.start).toBe('a');
    expect(warnings).toEqual(['Výchozí místnost nope neexistuje, použita a']);
  });

  it('ignores a plan without positive size', () => {
    expect(validateTour({ plan: { image: 'plan.png' }, rooms: [room('a')] }).tour.plan).toBeNull();
  });

  it.each([
    [null, 'Soubor tour.json není platný.'],
    [{ rooms: [] }, 'Prohlídka neobsahuje žádné místnosti.'],
    [{ rooms: [{ pano: 'x.jpg' }] }, 'Místnost č. 1 nemá id.'],
    [{ rooms: [{ id: 'a' }] }, 'Místnost a nemá panorama.'],
    [{ rooms: [room('a'), room('a')] }, 'Duplicitní id místnosti: a'],
  ])('rejects %j', (json, message) => {
    expect(() => validateTour(json)).toThrow(new TourError(message));
  });
});

const jsonResponse = (body, { ok = true, type = 'application/json' } = {}) => ({
  ok,
  headers: { get: () => type },
  json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
});

describe('loadTour', () => {
  it('fetches and validates tour.json', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ rooms: [room('a')] }));
    const tour = await loadTour('dum-1', '/houses/dum-1/', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('/houses/dum-1/tour.json', { cache: 'no-cache' });
    expect(tour.start).toBe('a');
  });

  it('rejects invalid house ids without fetching', async () => {
    const fetchImpl = vi.fn();
    await expect(loadTour('../secret', '/x/', fetchImpl)).rejects.toThrow(new TourError('Neplatný název domu.'));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a missing house on 404', async () => {
    const fetchImpl = async () => jsonResponse({}, { ok: false });
    await expect(loadTour('nope', '/houses/nope/', fetchImpl)).rejects.toThrow(new TourError('Prohlídka „nope“ neexistuje.'));
  });

  it('reports a missing house when dev server answers with index.html', async () => {
    const fetchImpl = async () => jsonResponse('<!doctype html>', { type: 'text/html' });
    await expect(loadTour('nope', '/houses/nope/', fetchImpl)).rejects.toThrow(new TourError('Prohlídka „nope“ neexistuje.'));
  });

  it('reports invalid JSON', async () => {
    const fetchImpl = async () => jsonResponse('{oops');
    await expect(loadTour('a', '/houses/a/', fetchImpl)).rejects.toThrow(new TourError('Soubor tour.json není platný JSON.'));
  });

  it('reports network failure', async () => {
    const fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
    await expect(loadTour('a', '/houses/a/', fetchImpl)).rejects.toThrow(new TourError('Prohlídku se nepodařilo načíst.'));
  });
});

describe('findMissingPanoramas', () => {
  it('returns ids whose panorama is not an image', async () => {
    const { tour } = validateTour({ rooms: [room('a'), room('b'), room('c')] });
    const fetchImpl = async (url) => {
      if (url.endsWith('a.jpg')) return jsonResponse(null, { type: 'image/jpeg' });
      if (url.endsWith('b.jpg')) return jsonResponse(null, { type: 'text/html' });
      throw new TypeError('network');
    };
    expect(await findMissingPanoramas(tour, '/h/', fetchImpl)).toEqual(['b', 'c']);
  });
});

describe('withoutRooms', () => {
  it('removes rooms and links pointing to them, fixing start', () => {
    const { tour } = validateTour({ start: 'b', rooms: [room('a', { links: [{ to: 'b', yaw: 0 }] }), room('b')] });
    const result = withoutRooms(tour, ['b']);
    expect(result.rooms.map((r) => r.id)).toEqual(['a']);
    expect(result.rooms[0].links).toEqual([]);
    expect(result.start).toBe('a');
    expect(tour.rooms).toHaveLength(2);
  });

  it('throws when no room is left', () => {
    const { tour } = validateTour({ rooms: [room('a')] });
    expect(() => withoutRooms(tour, ['a'])).toThrow(new TourError('Žádná panoramata se nepodařilo načíst.'));
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/tour-loader.test.js`
Expected: FAIL — `Failed to resolve import "../src/tour-loader.js"`.

- [ ] **Step 4: Implement `src/tour-loader.js`**

```js
export class TourError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TourError';
  }
}

const HOUSE_ID = /^[a-z0-9-]+$/;

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;
const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

function normalizePlan(plan) {
  if (!plan || !isNonEmptyString(plan.image)) return null;
  if (!(plan.width > 0) || !(plan.height > 0)) return null;
  return { image: plan.image, width: plan.width, height: plan.height };
}

function normalizeRoom(r, index, ids) {
  if (!r || !isNonEmptyString(r.id)) throw new TourError(`Místnost č. ${index + 1} nemá id.`);
  if (!isNonEmptyString(r.pano)) throw new TourError(`Místnost ${r.id} nemá panorama.`);
  if (ids.has(r.id)) throw new TourError(`Duplicitní id místnosti: ${r.id}`);
  ids.add(r.id);
  return {
    id: r.id,
    name: isNonEmptyString(r.name) ? r.name : r.id,
    pano: r.pano,
    preview: isNonEmptyString(r.preview) ? r.preview : null,
    planPos: isPoint(r.planPos) ? [r.planPos[0], r.planPos[1]] : null,
    northOffset: Number.isFinite(r.northOffset) ? r.northOffset : 0,
    links: Array.isArray(r.links) ? r.links : [],
  };
}

export function validateTour(json) {
  if (!json || typeof json !== 'object') throw new TourError('Soubor tour.json není platný.');
  if (!Array.isArray(json.rooms) || json.rooms.length === 0) {
    throw new TourError('Prohlídka neobsahuje žádné místnosti.');
  }
  const ids = new Set();
  const warnings = [];
  const rooms = json.rooms.map((r, i) => normalizeRoom(r, i, ids));

  for (const room of rooms) {
    room.links = room.links
      .filter((l) => {
        if (l && ids.has(l.to)) return true;
        warnings.push(`Místnost ${room.id}: odkaz na neznámou místnost ${l?.to}`);
        return false;
      })
      .map((l) => ({
        to: l.to,
        yaw: Number.isFinite(l.yaw) ? l.yaw : null,
        pitch: Number.isFinite(l.pitch) ? l.pitch : 0,
      }));
  }

  let start = rooms[0].id;
  if (ids.has(json.start)) start = json.start;
  else if (json.start !== undefined) warnings.push(`Výchozí místnost ${json.start} neexistuje, použita ${start}`);

  return {
    tour: {
      title: isNonEmptyString(json.title) ? json.title : 'Prohlídka',
      start,
      plan: normalizePlan(json.plan),
      rooms,
      exterior: Array.isArray(json.exterior) ? json.exterior.filter(isNonEmptyString) : [],
    },
    warnings,
  };
}

export async function loadTour(houseId, baseUrl, fetchImpl = fetch) {
  if (!HOUSE_ID.test(houseId)) throw new TourError('Neplatný název domu.');
  let res;
  try {
    res = await fetchImpl(`${baseUrl}tour.json`, { cache: 'no-cache' });
  } catch {
    throw new TourError('Prohlídku se nepodařilo načíst.');
  }
  // Vite's dev server answers unknown paths with index.html and HTTP 200.
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.includes('json')) throw new TourError(`Prohlídka „${houseId}“ neexistuje.`);
  let json;
  try {
    json = await res.json();
  } catch {
    throw new TourError('Soubor tour.json není platný JSON.');
  }
  const { tour, warnings } = validateTour(json);
  warnings.forEach((w) => console.warn(w));
  return tour;
}

export async function findMissingPanoramas(tour, baseUrl, fetchImpl = fetch) {
  const checks = await Promise.all(
    tour.rooms.map(async (room) => {
      try {
        const res = await fetchImpl(baseUrl + room.pano, { method: 'HEAD' });
        const type = res.headers.get('content-type') || '';
        return res.ok && type.startsWith('image/') ? null : room.id;
      } catch {
        return room.id;
      }
    }),
  );
  return checks.filter(Boolean);
}

export function withoutRooms(tour, ids) {
  const drop = new Set(ids);
  const rooms = tour.rooms
    .filter((r) => !drop.has(r.id))
    .map((r) => ({ ...r, links: r.links.filter((l) => !drop.has(l.to)) }));
  if (rooms.length === 0) throw new TourError('Žádná panoramata se nepodařilo načíst.');
  const start = rooms.some((r) => r.id === tour.start) ? tour.start : rooms[0].id;
  return { ...tour, rooms, start };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/tour-loader.test.js`
Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json vite.config.js .gitignore index.html src/tour-loader.js tests/tour-loader.test.js
git commit -m @'
feat: scaffold project and add tour loader

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 2: Photo preparation script + demo images

**Files:**
- Create: `scripts/lib/house-files.mjs`, `scripts/prepare-house.mjs`, `houses-src/krakovska.mapping.json`
- Test: `tests/house-files.test.js`
- Generated: `public/houses/krakovska/pano/*.jpg`, `public/houses/krakovska/exterior/*.jpg`, `public/houses/krakovska/tour.json`

**Interfaces:**
- Consumes: `validateTour` from `src/tour-loader.js` (test only).
- Produces:
  - `isPanorama(width: number, height: number) -> boolean`
  - `skeletonTour(title: string, rooms: {id,name}[], exterior: string[]) -> object` (valid `tour.json`)
  - `parseCrop(text: string) -> [x,y,w,h]` fractions (throws `Error` on invalid)
  - `cropRect(crop: [x,y,w,h], width: number, height: number) -> {left, top, width, height}` integer pixels
  - CLI `node scripts/prepare-house.mjs <sourceDir> <houseId> [--map <mapping.json>]`

- [ ] **Step 1: Write the failing tests**

`tests/house-files.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { isPanorama, skeletonTour, parseCrop, cropRect } from '../scripts/lib/house-files.mjs';
import { validateTour } from '../src/tour-loader.js';

describe('isPanorama', () => {
  it.each([
    [8192, 4096, true],
    [4096, 2050, true],
    [4032, 2268, false],
    [2268, 4032, false],
  ])('%i x %i -> %s', (w, h, expected) => {
    expect(isPanorama(w, h)).toBe(expected);
  });
});

describe('skeletonTour', () => {
  it('builds a valid tour with pano and preview paths', () => {
    const json = skeletonTour('Dům', [{ id: 'a', name: 'Pokoj A' }, { id: 'b', name: 'Pokoj B' }], ['exterior/01.jpg']);
    expect(json).toEqual({
      title: 'Dům',
      start: 'a',
      plan: null,
      rooms: [
        { id: 'a', name: 'Pokoj A', pano: 'pano/a.jpg', preview: 'pano/a-preview.jpg', planPos: null, northOffset: 0, links: [] },
        { id: 'b', name: 'Pokoj B', pano: 'pano/b.jpg', preview: 'pano/b-preview.jpg', planPos: null, northOffset: 0, links: [] },
      ],
      exterior: ['exterior/01.jpg'],
    });
    expect(() => validateTour(json)).not.toThrow();
  });
});

describe('parseCrop / cropRect', () => {
  it('parses fractions', () => {
    expect(parseCrop('0.03,0.02,0.57,0.88')).toEqual([0.03, 0.02, 0.57, 0.88]);
  });

  it.each(['1,2,3', 'a,b,c,d', '0.5,0.5,0.6,0.1', '-0.1,0,0.5,0.5'])('rejects %s', (text) => {
    expect(() => parseCrop(text)).toThrow('Crop must be x,y,w,h fractions within 0..1');
  });

  it('converts fractions to pixel rect', () => {
    expect(cropRect([0.1, 0.2, 0.5, 0.5], 1000, 800)).toEqual({ left: 100, top: 160, width: 500, height: 400 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/house-files.test.js`
Expected: FAIL — cannot resolve `../scripts/lib/house-files.mjs`.

- [ ] **Step 3: Implement `scripts/lib/house-files.mjs`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/house-files.test.js`
Expected: PASS.

- [ ] **Step 5: Implement `scripts/prepare-house.mjs`**

```js
import { readdir, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { isPanorama, skeletonTour } from './lib/house-files.mjs';

const [sourceDir, houseId, ...rest] = process.argv.slice(2);
if (!sourceDir || !/^[a-z0-9-]+$/.test(houseId ?? '')) {
  console.error('Usage: node scripts/prepare-house.mjs <sourceDir> <houseId> [--map mapping.json]');
  process.exit(1);
}
const mapIndex = rest.indexOf('--map');
const mapping = mapIndex >= 0 ? JSON.parse(await readFile(rest[mapIndex + 1], 'utf8')) : {};

const outDir = path.join('public', 'houses', houseId);
await mkdir(path.join(outDir, 'pano'), { recursive: true });
await mkdir(path.join(outDir, 'exterior'), { recursive: true });

const files = (await readdir(sourceDir)).filter((f) => /\.jpe?g$/i.test(f)).sort();
const rooms = [];
const exterior = [];

for (const file of files) {
  const src = path.join(sourceDir, file);
  const { width, height } = await sharp(src).metadata();
  if (isPanorama(width, height)) {
    const entry = mapping[file] ?? { id: `room${rooms.length + 1}`, name: `Místnost ${rooms.length + 1}` };
    await sharp(src).resize(4096, 2048).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(outDir, 'pano', `${entry.id}.jpg`));
    await sharp(src).resize(512, 256).blur(2).jpeg({ quality: 60 }).toFile(path.join(outDir, 'pano', `${entry.id}-preview.jpg`));
    rooms.push(entry);
    console.log(`pano     ${file} -> ${entry.id}`);
  } else {
    const name = `exterior/${String(exterior.length + 1).padStart(2, '0')}.jpg`;
    await sharp(src).rotate().resize({ width: 2560, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(outDir, name));
    exterior.push(name);
    console.log(`exterior ${file} -> ${name}`);
  }
}

const tourPath = path.join(outDir, 'tour.json');
const exists = await access(tourPath).then(() => true, () => false);
if (exists) {
  console.log(`${tourPath} exists, not overwritten`);
} else {
  await writeFile(tourPath, JSON.stringify(skeletonTour(houseId, rooms, exterior), null, 2) + '\n');
  console.log(`wrote ${tourPath}`);
}
```

`houses-src/krakovska.mapping.json`:
```json
{
  "photo360.jpg": { "id": "obyvak", "name": "Obývací pokoj + kuchyně" },
  "photo360 (1).jpg": { "id": "technicka", "name": "Technická místnost" },
  "photo360 (2).jpg": { "id": "zadveri", "name": "Zádveří" },
  "photo360 (3).jpg": { "id": "koupelna", "name": "Koupelna" },
  "photo360 (4).jpg": { "id": "chodba", "name": "Chodba" },
  "photo360 (5).jpg": { "id": "loznice", "name": "Ložnice" },
  "photo360 (6).jpg": { "id": "pokoj106", "name": "Pokoj 2" },
  "photo360 (7).jpg": { "id": "pokoj105", "name": "Pokoj 1" }
}
```

- [ ] **Step 6: Run the script on the demo photos**

Run:
```powershell
node scripts/prepare-house.mjs "C:\Users\prixe\Downloads\photos" krakovska --map houses-src/krakovska.mapping.json
```
Expected: 8 `pano` lines with the ids above, 5 `exterior` lines (`01.jpg`–`05.jpg`), `wrote public\houses\krakovska\tour.json`.

Verify: `Get-ChildItem public\houses\krakovska\pano | Measure-Object` → 16 files; each 4096 panorama roughly 0.5–2 MB.

- [ ] **Step 7: Commit**

```powershell
git add scripts houses-src tests/house-files.test.js public/houses/krakovska
git commit -m @'
feat: add photo preparation script and demo house images

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 3: Floor plan render script + demo plan

**Files:**
- Create: `scripts/render-plan.mjs`
- Generated: `public/houses/krakovska/plan.png`; modifies `public/houses/krakovska/tour.json` (`plan` field)

**Interfaces:**
- Consumes: `parseCrop`, `cropRect` from `scripts/lib/house-files.mjs`.
- Produces: CLI `node scripts/render-plan.mjs <pdf> <houseId> [--crop x,y,w,h] [--scale 4]`; `tour.json.plan = { image: 'plan.png', width, height }`.

- [ ] **Step 1: Implement `scripts/render-plan.mjs`**

```js
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { pdf } from 'pdf-to-img';
import { parseCrop, cropRect } from './lib/house-files.mjs';

const [pdfPath, houseId, ...rest] = process.argv.slice(2);
if (!pdfPath || !/^[a-z0-9-]+$/.test(houseId ?? '')) {
  console.error('Usage: node scripts/render-plan.mjs <pdf> <houseId> [--crop x,y,w,h] [--scale 4]');
  process.exit(1);
}
const opt = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
const crop = opt('--crop') ? parseCrop(opt('--crop')) : null;
const scale = Number(opt('--scale') ?? 4);

const document = await pdf(pdfPath, { scale });
let pageBuffer;
for await (const page of document) {
  pageBuffer = page;
  break;
}

let image = sharp(pageBuffer);
if (crop) {
  const { width, height } = await image.metadata();
  image = sharp(pageBuffer).extract(cropRect(crop, width, height));
}
const outDir = path.join('public', 'houses', houseId);
const { width, height } = await image.png().toFile(path.join(outDir, 'plan.png'));
console.log(`wrote plan.png ${width}x${height}`);

const tourPath = path.join(outDir, 'tour.json');
if (await access(tourPath).then(() => true, () => false)) {
  const tour = JSON.parse(await readFile(tourPath, 'utf8'));
  tour.plan = { image: 'plan.png', width, height };
  await writeFile(tourPath, JSON.stringify(tour, null, 2) + '\n');
  console.log('updated tour.json plan');
}
```

- [ ] **Step 2: Render the demo plan**

The PDF name contains a non-ASCII character; resolve it by glob:
```powershell
$pdf = (Get-ChildItem "C:\Users\prixe\Downloads\photos\*.pdf" | Select-Object -First 1).FullName
node scripts/render-plan.mjs $pdf krakovska --crop 0.03,0.02,0.57,0.88 --scale 4
```
Expected: `wrote plan.png <W>x<H>` (roughly 2800×3100) and `updated tour.json plan`.

- [ ] **Step 3: Verify the crop visually**

Open `public/houses/krakovska/plan.png` (Read tool / image viewer). Expected: whole floor plan including the carport (112) at top and terrace (110) at bottom; the legend table on the right is NOT included; no wall cut off. If a wall is cut or the legend shows, adjust `--crop` and rerun Step 2. Record the final crop value in the commit message.

- [ ] **Step 4: Commit**

```powershell
git add scripts/render-plan.mjs public/houses/krakovska/plan.png public/houses/krakovska/tour.json
git commit -m @'
feat: add floor plan render script and demo plan

Crop used: 0.03,0.02,0.57,0.88

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 4: Viewer node mapping (pure)

**Files:**
- Create: `src/viewer/nodes.js`
- Test: `tests/nodes.test.js`

**Interfaces:**
- Consumes: `Tour` shape from Task 1.
- Produces:
  - `normalizeYaw(yaw: number) -> number` in `[0, 2π)`
  - `entryYaw(linkYaw: number, fromNorth: number, toNorth: number) -> number` normalized
  - `tourToNodes(tour: Tour, baseUrl: string) -> VirtualTourNode[]` where each node is `{ id, name, panorama, thumbnail?, links: [{ nodeId, position: {yaw, pitch} }], map: {x, y} | false, data: { northOffset } }`; `map` in plan pixels (`planPos × plan.width/height`), `false` if no plan or no `planPos`.

- [ ] **Step 1: Write the failing tests**

`tests/nodes.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { normalizeYaw, entryYaw, tourToNodes } from '../src/viewer/nodes.js';
import { validateTour } from '../src/tour-loader.js';

const TAU = 2 * Math.PI;

describe('normalizeYaw', () => {
  it.each([
    [0, 0],
    [Math.PI, Math.PI],
    [-Math.PI / 2, 1.5 * Math.PI],
    [TAU, 0],
    [5 * Math.PI, Math.PI],
    [-7 * Math.PI, Math.PI],
  ])('%f -> %f', (input, expected) => {
    expect(normalizeYaw(input)).toBeCloseTo(expected, 10);
  });
});

describe('entryYaw', () => {
  it('keeps link yaw when both rooms share orientation', () => {
    expect(entryYaw(1.2, 0, 0)).toBeCloseTo(1.2);
  });

  it('preserves plan-frame heading across differently rotated panoramas', () => {
    // heading in plan frame = yaw + northOffset
    const yaw = entryYaw(1.0, 0.5, 2.0);
    expect(normalizeYaw(yaw + 2.0)).toBeCloseTo(normalizeYaw(1.0 + 0.5));
  });

  it('wraps negative results', () => {
    expect(entryYaw(0.1, 0, 1.0)).toBeCloseTo(TAU - 0.9);
  });
});

describe('tourToNodes', () => {
  const { tour } = validateTour({
    plan: { image: 'plan.png', width: 2000, height: 1000 },
    rooms: [
      {
        id: 'a', name: 'A', pano: 'pano/a.jpg', preview: 'pano/a-preview.jpg', planPos: [0.25, 0.5], northOffset: 0.7,
        links: [{ to: 'b', yaw: 1, pitch: -0.2 }, { to: 'b' }],
      },
      { id: 'b', name: 'B', pano: 'pano/b.jpg' },
    ],
  });

  it('maps rooms to virtual tour nodes with absolute urls', () => {
    const [a, b] = tourToNodes(tour, '/houses/x/');
    expect(a).toEqual({
      id: 'a',
      name: 'A',
      panorama: '/houses/x/pano/a.jpg',
      thumbnail: '/houses/x/pano/a-preview.jpg',
      links: [{ nodeId: 'b', position: { yaw: 1, pitch: -0.2 } }],
      map: { x: 500, y: 500 },
      data: { northOffset: 0.7 },
    });
    expect(b.thumbnail).toBeUndefined();
    expect(b.map).toBe(false);
  });

  it('skips unplaced links (yaw null)', () => {
    const [a] = tourToNodes(tour, '/');
    expect(a.links).toHaveLength(1);
  });

  it('disables map positions when the tour has no plan', () => {
    const nodes = tourToNodes({ ...tour, plan: null }, '/');
    expect(nodes.every((n) => n.map === false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/nodes.test.js`
Expected: FAIL — cannot resolve `../src/viewer/nodes.js`.

- [ ] **Step 3: Implement `src/viewer/nodes.js`**

```js
const TAU = 2 * Math.PI;

export function normalizeYaw(yaw) {
  return ((yaw % TAU) + TAU) % TAU;
}

// Heading in plan frame is yaw + northOffset; keep it when entering the next room.
export function entryYaw(linkYaw, fromNorth, toNorth) {
  return normalizeYaw(linkYaw + fromNorth - toNorth);
}

export function tourToNodes(tour, baseUrl) {
  const plan = tour.plan;
  return tour.rooms.map((room) => ({
    id: room.id,
    name: room.name,
    panorama: baseUrl + room.pano,
    thumbnail: room.preview ? baseUrl + room.preview : undefined,
    links: room.links
      .filter((l) => l.yaw !== null)
      .map((l) => ({ nodeId: l.to, position: { yaw: l.yaw, pitch: l.pitch } })),
    map: plan && room.planPos ? { x: room.planPos[0] * plan.width, y: room.planPos[1] * plan.height } : false,
    data: { northOffset: room.northOffset },
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/nodes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/viewer/nodes.js tests/nodes.test.js
git commit -m @'
feat: map tour data to virtual tour nodes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 5: Viewer UI, demo tour data, smoke test

**Files:**
- Create: `src/viewer/viewer.js`, `src/viewer/ui.js`, `src/main.js`, `src/styles.css`, `playwright.config.js`, `tests/e2e/smoke.spec.js`
- Modify: `public/houses/krakovska/tour.json` (title, start, rooms)

**Interfaces:**
- Consumes: `loadTour`, `findMissingPanoramas`, `withoutRooms`, `TourError` (Task 1); `tourToNodes`, `entryYaw` (Task 4).
- Produces:
  - `createViewer({ container, tour, baseUrl, startRoom, onRoomChange?, extraButtons? }) -> ViewerHandle`
  - `ViewerHandle = { viewer, tour: VirtualTourPlugin, map: MapPlugin|null, currentRoom(): string, reload(tour: Tour): void, destroy(): void }`
  - `renderHeader(el: HTMLElement, title: string) -> void`
  - `showError(container: HTMLElement, message: string) -> void`
  - `openLightbox(urls: string[]) -> void`
  - Link arrow DOM: `<div class="tour-link" data-to="<roomId>">` (e2e and editor rely on it)
  - `main.js` routes: `?house=<id>` (default `krakovska`), `&room=<id>`, `&edit` → dynamic `import('./editor/editor.js')` and `startEditor({ houseId, baseUrl, tour, container, headerEl })` (implemented in Task 7).

- [ ] **Step 1: Implement `src/viewer/ui.js`**

```js
export function renderHeader(el, title) {
  el.textContent = '';
  const h1 = document.createElement('h1');
  h1.textContent = title;
  el.append(h1);
  document.title = title;
}

export function showError(container, message) {
  container.textContent = '';
  const box = document.createElement('div');
  box.className = 'error-screen';
  const p = document.createElement('p');
  p.textContent = message;
  box.append(p);
  container.append(box);
}

export function openLightbox(urls) {
  if (urls.length === 0) return;
  let index = 0;
  const overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.innerHTML = `
    <button class="lightbox__close" aria-label="Zavřít">×</button>
    <button class="lightbox__prev" aria-label="Předchozí">‹</button>
    <img class="lightbox__img" alt="Exteriér" />
    <button class="lightbox__next" aria-label="Další">›</button>`;
  const img = overlay.querySelector('img');
  const show = (i) => {
    index = (i + urls.length) % urls.length;
    img.src = urls[index];
  };
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  };
  overlay.querySelector('.lightbox__close').onclick = close;
  overlay.querySelector('.lightbox__prev').onclick = () => show(index - 1);
  overlay.querySelector('.lightbox__next').onclick = () => show(index + 1);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  show(0);
  document.body.append(overlay);
}
```

- [ ] **Step 2: Implement `src/viewer/viewer.js`**

```js
import { Viewer } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { MapPlugin } from '@photo-sphere-viewer/map-plugin';
import { GalleryPlugin } from '@photo-sphere-viewer/gallery-plugin';
import { GyroscopePlugin } from '@photo-sphere-viewer/gyroscope-plugin';
import { VirtualTourPlugin } from '@photo-sphere-viewer/virtual-tour-plugin';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';
import '@photo-sphere-viewer/map-plugin/index.css';
import '@photo-sphere-viewer/gallery-plugin/index.css';
import '@photo-sphere-viewer/virtual-tour-plugin/index.css';
import { tourToNodes, entryYaw } from './nodes.js';

const LANG = {
  zoom: 'Přiblížení',
  zoomOut: 'Oddálit',
  zoomIn: 'Přiblížit',
  moveUp: 'Nahoru',
  moveDown: 'Dolů',
  moveLeft: 'Vlevo',
  moveRight: 'Vpravo',
  fullscreen: 'Celá obrazovka',
  close: 'Zavřít',
  twoFingers: 'Pro posun použijte dva prsty',
  ctrlZoom: 'Pro přiblížení použijte Ctrl + kolečko',
  loadError: 'Panorama se nepodařilo načíst',
  gallery: 'Místnosti',
  gyroscope: 'Gyroskop',
  map: 'Plánek',
  mapMaximize: 'Zvětšit',
  mapMinimize: 'Zmenšit',
  mapNorth: 'Sever',
  mapReset: 'Obnovit',
};

function linkElement(link) {
  const el = document.createElement('div');
  el.className = 'tour-link';
  el.dataset.to = link.nodeId;
  el.innerHTML = '<span class="tour-link__ring"></span>';
  return el;
}

export function createViewer({ container, tour, baseUrl, startRoom, onRoomChange, extraButtons = [] }) {
  const hasPlan = Boolean(tour.plan);
  const plugins = [
    MarkersPlugin,
    [GalleryPlugin, { hideOnClick: true, thumbnailSize: { width: 160, height: 90 } }],
    GyroscopePlugin,
  ];
  if (hasPlan) {
    plugins.push([MapPlugin, {
      static: true,
      position: 'bottom left',
      size: '220px',
      shape: 'square',
      minimizeOnHotspotClick: true,
      spotStyle: { size: 14, color: '#c8a36a', hoverColor: '#ffffff', borderSize: 2, borderColor: '#ffffff' },
      coneColor: 'rgba(200, 163, 106, 0.45)',
      coneSize: 50,
    }]);
  }
  plugins.push([VirtualTourPlugin, {
    positionMode: 'manual',
    renderMode: '2d',
    nodes: tourToNodes(tour, baseUrl),
    startNodeId: startRoom,
    preload: true,
    arrowStyle: { element: linkElement, size: { width: 56, height: 56 } },
    transitionOptions: (toNode, fromNode, fromLink) => ({
      effect: 'fade',
      speed: 1500,
      rotation: true,
      showLoader: true,
      ...(fromLink && fromNode
        ? { rotateTo: { yaw: entryYaw(fromLink.position.yaw, fromNode.data.northOffset, toNode.data.northOffset), pitch: 0 } }
        : {}),
    }),
    ...(hasPlan ? { map: { imageUrl: baseUrl + tour.plan.image, size: { width: tour.plan.width, height: tour.plan.height } } } : {}),
  }]);

  const navbar = ['zoom', 'move', 'gallery', 'gyroscope', ...(hasPlan ? ['map'] : []), ...extraButtons, 'caption', 'fullscreen'];

  const viewer = new Viewer({
    container,
    lang: LANG,
    loadingTxt: 'Načítání…',
    defaultZoomLvl: 30,
    touchmoveTwoFingers: false,
    mousewheelCtrlKey: false,
    navbar,
    plugins,
  });

  const vt = viewer.getPlugin(VirtualTourPlugin);
  const map = hasPlan ? viewer.getPlugin(MapPlugin) : null;

  vt.addEventListener('node-changed', ({ node }) => {
    map?.setOptions({ rotation: node.data.northOffset });
    onRoomChange?.(node.id);
  });

  return {
    viewer,
    tour: vt,
    map,
    currentRoom: () => vt.getCurrentNode()?.id,
    reload(nextTour) {
      vt.setNodes(tourToNodes(nextTour, baseUrl), vt.getCurrentNode()?.id ?? nextTour.start);
    },
    destroy: () => viewer.destroy(),
  };
}
```

- [ ] **Step 3: Implement `src/main.js`**

```js
import './styles.css';
import { loadTour, findMissingPanoramas, withoutRooms, TourError } from './tour-loader.js';
import { createViewer } from './viewer/viewer.js';
import { renderHeader, showError, openLightbox } from './viewer/ui.js';

const DEFAULT_HOUSE = 'krakovska';

async function main() {
  const container = document.getElementById('app');
  const headerEl = document.getElementById('header');
  const params = new URLSearchParams(location.search);
  const houseId = params.get('house') || DEFAULT_HOUSE;
  const baseUrl = `${import.meta.env.BASE_URL}houses/${houseId}/`;

  try {
    let tour = await loadTour(houseId, baseUrl);

    if (params.has('edit')) {
      const { startEditor } = await import('./editor/editor.js');
      startEditor({ houseId, baseUrl, tour, container, headerEl });
      return;
    }

    const missing = await findMissingPanoramas(tour, baseUrl);
    if (missing.length > 0) {
      missing.forEach((id) => console.warn(`Panorama místnosti ${id} chybí, místnost skryta.`));
      tour = withoutRooms(tour, missing);
    }

    renderHeader(headerEl, tour.title);
    const requested = params.get('room');
    const startRoom = tour.rooms.some((r) => r.id === requested) ? requested : tour.start;
    const extraButtons = tour.exterior.length > 0
      ? [{ id: 'exterior', title: 'Exteriér', content: 'Exteriér', className: 'exterior-button', onClick: () => openLightbox(tour.exterior.map((p) => baseUrl + p)) }]
      : [];

    createViewer({
      container,
      tour,
      baseUrl,
      startRoom,
      extraButtons,
      onRoomChange: (id) => {
        const url = new URL(location.href);
        url.searchParams.set('room', id);
        history.replaceState(null, '', url);
      },
    });
  } catch (e) {
    console.error(e);
    showError(container, e instanceof TourError ? e.message : 'Něco se pokazilo. Zkuste stránku načíst znovu.');
  }
}

main();
```

- [ ] **Step 4: Implement `src/styles.css`**

```css
:root {
  --accent: #c8a36a;
  --bg: #111;
  --fg: #f5f2ec;
  --header-h: 48px;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  background: var(--bg);
  color: var(--fg);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

#header {
  height: var(--header-h);
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: rgba(0, 0, 0, 0.85);
}

#header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#app {
  position: relative;
  height: calc(100% - var(--header-h));
}

.tour-link {
  cursor: pointer;
  display: grid;
  place-items: center;
}

.tour-link__ring {
  width: 70%;
  height: 70%;
  border-radius: 50%;
  border: 3px solid #fff;
  background: rgba(200, 163, 106, 0.55);
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.5);
  transition: transform 0.2s, background 0.2s;
}

.tour-link:hover .tour-link__ring {
  transform: scale(1.2);
  background: var(--accent);
}

.exterior-button {
  width: auto !important;
  padding: 0 10px;
  font-size: 14px;
}

.error-screen {
  height: 100%;
  display: grid;
  place-items: center;
  padding: 16px;
  text-align: center;
  font-size: 18px;
}

.lightbox {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.92);
  display: grid;
  grid-template-columns: 56px 1fr 56px;
  align-items: center;
}

.lightbox__img {
  max-width: 100%;
  max-height: 90vh;
  justify-self: center;
}

.lightbox button {
  background: none;
  border: 0;
  color: #fff;
  font-size: 40px;
  cursor: pointer;
}

.lightbox__close {
  position: absolute;
  top: 8px;
  right: 16px;
}
```

- [ ] **Step 5: Write demo tour data**

Edit `public/houses/krakovska/tour.json`: set `title` and `start`, replace `rooms` with the array below. Keep the existing `plan` (written by Task 3) and `exterior` values unchanged. Yaw/pitch values are first-pass estimates from the panoramas (yaw = (x/width − 0.5)·2π); they get refined in the editor.

```json
{
  "title": "Novostavba RD Krakovská",
  "start": "obyvak",
  "rooms": [
    { "id": "obyvak", "name": "Obývací pokoj + kuchyně", "pano": "pano/obyvak.jpg", "preview": "pano/obyvak-preview.jpg", "planPos": [0.723, 0.67], "northOffset": 0,
      "links": [{ "to": "chodba", "yaw": 0.39, "pitch": -0.2 }] },
    { "id": "chodba", "name": "Chodba", "pano": "pano/chodba.jpg", "preview": "pano/chodba-preview.jpg", "planPos": [0.566, 0.639], "northOffset": 0,
      "links": [
        { "to": "koupelna", "yaw": -2.4, "pitch": -0.27 },
        { "to": "zadveri", "yaw": -1.24, "pitch": -0.2 },
        { "to": "obyvak", "yaw": -0.84, "pitch": -0.14 },
        { "to": "loznice", "yaw": 0.79, "pitch": -0.25 },
        { "to": "pokoj106", "yaw": 1.74, "pitch": -0.25 },
        { "to": "pokoj105", "yaw": 2.78, "pitch": -0.25 }
      ] },
    { "id": "zadveri", "name": "Zádveří", "pano": "pano/zadveri.jpg", "preview": "pano/zadveri-preview.jpg", "planPos": [0.575, 0.504], "northOffset": 0,
      "links": [{ "to": "technicka", "yaw": -1.21, "pitch": -0.2 }, { "to": "chodba", "yaw": 1.25, "pitch": -0.25 }] },
    { "id": "technicka", "name": "Technická místnost", "pano": "pano/technicka.jpg", "preview": "pano/technicka-preview.jpg", "planPos": [0.673, 0.484], "northOffset": 0,
      "links": [{ "to": "zadveri", "yaw": -0.04, "pitch": -0.25 }] },
    { "id": "koupelna", "name": "Koupelna", "pano": "pano/koupelna.jpg", "preview": "pano/koupelna-preview.jpg", "planPos": [0.464, 0.527], "northOffset": 0,
      "links": [{ "to": "chodba", "yaw": -2.25, "pitch": -0.25 }] },
    { "id": "loznice", "name": "Ložnice", "pano": "pano/loznice.jpg", "preview": "pano/loznice-preview.jpg", "planPos": [0.547, 0.75], "northOffset": 0,
      "links": [{ "to": "chodba", "yaw": -1.82, "pitch": -0.2 }] },
    { "id": "pokoj105", "name": "Pokoj 1", "pano": "pano/pokoj105.jpg", "preview": "pano/pokoj105-preview.jpg", "planPos": [0.316, 0.506], "northOffset": 0,
      "links": [{ "to": "chodba", "yaw": 1.77, "pitch": -0.2 }] },
    { "id": "pokoj106", "name": "Pokoj 2", "pano": "pano/pokoj106.jpg", "preview": "pano/pokoj106-preview.jpg", "planPos": [0.359, 0.755], "northOffset": 0,
      "links": [{ "to": "chodba", "yaw": -0.99, "pitch": -0.2 }] }
  ]
}
```

Check: `node -e "import('./src/tour-loader.js').then(m=>{const r=m.validateTour(JSON.parse(require('fs').readFileSync('public/houses/krakovska/tour.json','utf8')));console.log(r.tour.rooms.length, r.tour.plan, r.warnings)})"`
Expected: `8 { image: 'plan.png', width: …, height: … } []`.

- [ ] **Step 6: Write the smoke test**

`playwright.config.js`:
```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5178' },
  webServer: {
    command: 'npx vite --port 5178 --strictPort',
    url: 'http://localhost:5178',
    reuseExistingServer: true,
  },
});
```

`tests/e2e/smoke.spec.js`:
```js
import { test, expect } from '@playwright/test';

test('tour loads start room and navigates through a link', async ({ page }) => {
  await page.goto('/?house=krakovska');
  await expect(page.locator('#header h1')).toHaveText('Novostavba RD Krakovská');
  const link = page.locator('.tour-link[data-to="chodba"]');
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();
  await expect(page).toHaveURL(/room=chodba/, { timeout: 30_000 });
  await expect(page.locator('.tour-link[data-to="loznice"]')).toHaveCount(1, { timeout: 30_000 });
});

test('deep link opens the requested room', async ({ page }) => {
  await page.goto('/?house=krakovska&room=koupelna');
  await expect(page.locator('.tour-link[data-to="chodba"]')).toHaveCount(1, { timeout: 30_000 });
  await expect(page).toHaveURL(/room=koupelna/);
});

test('unknown house shows czech error', async ({ page }) => {
  await page.goto('/?house=neexistuje');
  await expect(page.locator('.error-screen')).toHaveText('Prohlídka „neexistuje“ neexistuje.');
});
```

Run once: `npx playwright install chromium`

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: all unit tests PASS.

Run: `npm run test:e2e`
Expected: 3 passed. If the first test fails because the `chodba` arrow is off-screen at yaw 0.39, open the page in a browser and confirm the arrow sits on the corridor opening; if yaw sign is mirrored, the corridor opening will be at −0.39 — fix all link yaws in `tour.json` by negating them, and note it in the commit.

- [ ] **Step 8: Manual check**

Run: `npm run dev`, open `http://localhost:5173/?house=krakovska`.
Verify: living room loads; drag rotates; arrow over the corridor opening; click → fade into Chodba; minimap bottom-left shows plan with 8 dots, current room centered; "Místnosti" button shows 8 thumbnails; "Exteriér" opens 5 drone photos; browser devtools phone width (390 px) still usable.

- [ ] **Step 9: Commit**

```powershell
git add src playwright.config.js tests/e2e public/houses/krakovska/tour.json
git commit -m @'
feat: add panorama viewer with minimap, room list and exterior gallery

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 6: Editor state + draft storage (pure)

**Files:**
- Create: `src/editor/editor-state.js`, `src/editor/draft.js`
- Test: `tests/editor-state.test.js`, `tests/draft.test.js`

**Interfaces:**
- Consumes: `validateTour` (Task 1), `normalizeYaw` (Task 4).
- Produces (all return a NEW tour; input is never mutated; unknown room ids throw `Error('Neznámá místnost: <id>')`):
  - `addLink(tour, fromId, toId, { yaw, pitch }, { reverse = false } = {}) -> Tour` — replaces an existing link `from→to`; `reverse` adds `to→from` with `yaw: null` only if no such link exists; `fromId === toId` throws `Error('Průchod nemůže vést do stejné místnosti.')`
  - `removeLink(tour, fromId, toId) -> Tour`
  - `moveLink(tour, fromId, toId, { yaw, pitch }) -> Tour`
  - `setPlanPos(tour, id, [x, y]) -> Tour` — clamps to `[0,1]`
  - `setNorth(tour, id, currentYaw) -> Tour` — `northOffset = normalizeYaw(-currentYaw)`
  - `setRoomProps(tour, id, { name?, pano?, preview? }) -> Tour`
  - `setStart(tour, id) -> Tour`
  - `validate(tour) -> string[]` warnings
  - `toJSON(tour) -> object` — spec format, yaw/pitch/northOffset rounded to 3 decimals, planPos to 4
  - `readDraft(storage, houseId) -> Tour | null`, `writeDraft(storage, houseId, tour) -> boolean`, `clearDraft(storage, houseId) -> void`; key `tour-edit:<houseId>`; never throw.

- [ ] **Step 1: Write the failing tests**

`tests/editor-state.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { validateTour } from '../src/tour-loader.js';
import {
  addLink, removeLink, moveLink, setPlanPos, setNorth, setRoomProps, setStart, validate, toJSON,
} from '../src/editor/editor-state.js';

const make = () => validateTour({
  plan: { image: 'plan.png', width: 100, height: 100 },
  rooms: [
    { id: 'a', name: 'A', pano: 'pano/a.jpg' },
    { id: 'b', name: 'B', pano: 'pano/b.jpg' },
    { id: 'c', name: 'C', pano: 'pano/c.jpg' },
  ],
}).tour;
const room = (tour, id) => tour.rooms.find((r) => r.id === id);

describe('addLink', () => {
  it('adds a link without mutating input', () => {
    const t0 = make();
    const t1 = addLink(t0, 'a', 'b', { yaw: 1, pitch: -0.1 });
    expect(room(t1, 'a').links).toEqual([{ to: 'b', yaw: 1, pitch: -0.1 }]);
    expect(room(t0, 'a').links).toEqual([]);
  });

  it('replaces an existing link to the same room', () => {
    let t = addLink(make(), 'a', 'b', { yaw: 1, pitch: 0 });
    t = addLink(t, 'a', 'b', { yaw: 2, pitch: 0 });
    expect(room(t, 'a').links).toEqual([{ to: 'b', yaw: 2, pitch: 0 }]);
  });

  it('adds an unplaced reverse link', () => {
    const t = addLink(make(), 'a', 'b', { yaw: 1, pitch: 0 }, { reverse: true });
    expect(room(t, 'b').links).toEqual([{ to: 'a', yaw: null, pitch: 0 }]);
  });

  it('keeps an existing reverse link untouched', () => {
    let t = addLink(make(), 'b', 'a', { yaw: 3, pitch: 0 });
    t = addLink(t, 'a', 'b', { yaw: 1, pitch: 0 }, { reverse: true });
    expect(room(t, 'b').links).toEqual([{ to: 'a', yaw: 3, pitch: 0 }]);
  });

  it('rejects self links and unknown rooms', () => {
    expect(() => addLink(make(), 'a', 'a', { yaw: 0, pitch: 0 })).toThrow('Průchod nemůže vést do stejné místnosti.');
    expect(() => addLink(make(), 'a', 'zzz', { yaw: 0, pitch: 0 })).toThrow('Neznámá místnost: zzz');
  });
});

describe('removeLink / moveLink', () => {
  it('removes and moves links', () => {
    let t = addLink(make(), 'a', 'b', { yaw: 1, pitch: 0 });
    t = addLink(t, 'a', 'c', { yaw: 2, pitch: 0 });
    t = moveLink(t, 'a', 'c', { yaw: 2.5, pitch: -0.3 });
    t = removeLink(t, 'a', 'b');
    expect(room(t, 'a').links).toEqual([{ to: 'c', yaw: 2.5, pitch: -0.3 }]);
  });
});

describe('room properties', () => {
  it('clamps plan positions', () => {
    expect(room(setPlanPos(make(), 'a', [1.2, -0.1]), 'a').planPos).toEqual([1, 0]);
  });

  it('stores north as normalized negative yaw', () => {
    expect(room(setNorth(make(), 'a', 1), 'a').northOffset).toBeCloseTo(2 * Math.PI - 1);
    expect(room(setNorth(make(), 'a', -Math.PI / 2), 'a').northOffset).toBeCloseTo(Math.PI / 2);
  });

  it('updates name/pano/preview and start', () => {
    let t = setRoomProps(make(), 'a', { name: 'Obývák' });
    t = setStart(t, 'c');
    expect(room(t, 'a').name).toBe('Obývák');
    expect(room(t, 'a').pano).toBe('pano/a.jpg');
    expect(t.start).toBe('c');
    expect(() => setStart(t, 'zzz')).toThrow('Neznámá místnost: zzz');
  });
});

describe('validate', () => {
  it('reports rooms without links, plan position, one-way and unplaced links', () => {
    let t = addLink(make(), 'a', 'b', { yaw: 1, pitch: 0 }, { reverse: true });
    t = setPlanPos(t, 'a', [0.5, 0.5]);
    expect(validate(t)).toEqual([
      'Místnost B: průchod do A nemá umístění',
      'Místnost C nemá žádný průchod',
      'Místnost B není umístěna na plánu',
      'Místnost C není umístěna na plánu',
    ]);
  });

  it('reports one-way links', () => {
    const t = addLink(make(), 'a', 'b', { yaw: 1, pitch: 0 });
    expect(validate(t)).toContain('Průchod A → B nemá zpětný průchod');
  });
});

describe('toJSON', () => {
  it('rounds numbers and round-trips through validateTour', () => {
    let t = addLink(make(), 'a', 'b', { yaw: 1.23456789, pitch: -0.1111111 });
    t = setPlanPos(t, 'a', [0.123456, 0.654321]);
    const json = toJSON(t);
    expect(json.rooms[0].links[0]).toEqual({ to: 'b', yaw: 1.235, pitch: -0.111 });
    expect(json.rooms[0].planPos).toEqual([0.1235, 0.6543]);
    expect(validateTour(JSON.parse(JSON.stringify(json))).tour).toEqual(validateTour(json).tour);
  });

  it('writes unplaced links without yaw', () => {
    const t = addLink(make(), 'a', 'b', { yaw: 1, pitch: 0 }, { reverse: true });
    expect(toJSON(t).rooms[1].links).toEqual([{ to: 'a', pitch: 0 }]);
  });
});
```

`tests/draft.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readDraft, writeDraft, clearDraft } from '../src/editor/draft.js';

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
};
const throwingStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); },
};
const tour = { title: 'T', start: 'a', plan: null, exterior: [], rooms: [{ id: 'a', name: 'A', pano: 'p.jpg', preview: null, planPos: null, northOffset: 0, links: [] }] };

describe('draft storage', () => {
  it('writes and reads back a draft', () => {
    const s = memoryStorage();
    expect(writeDraft(s, 'dum', tour)).toBe(true);
    expect(readDraft(s, 'dum')).toEqual(tour);
    clearDraft(s, 'dum');
    expect(readDraft(s, 'dum')).toBeNull();
  });

  it('ignores corrupt JSON and invalid tours', () => {
    const s = memoryStorage();
    s.setItem('tour-edit:dum', '{oops');
    expect(readDraft(s, 'dum')).toBeNull();
    s.setItem('tour-edit:dum', JSON.stringify({ rooms: [] }));
    expect(readDraft(s, 'dum')).toBeNull();
  });

  it('never throws when storage is unavailable', () => {
    expect(readDraft(throwingStorage, 'dum')).toBeNull();
    expect(writeDraft(throwingStorage, 'dum', tour)).toBe(false);
    expect(() => clearDraft(throwingStorage, 'dum')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/editor-state.test.js tests/draft.test.js`
Expected: FAIL — cannot resolve `../src/editor/editor-state.js` / `../src/editor/draft.js`.

- [ ] **Step 3: Implement `src/editor/editor-state.js`**

```js
import { normalizeYaw } from '../viewer/nodes.js';

const round = (n, digits) => Number(n.toFixed(digits));
const clamp01 = (n) => Math.min(1, Math.max(0, n));

function assertRoom(tour, id) {
  if (!tour.rooms.some((r) => r.id === id)) throw new Error(`Neznámá místnost: ${id}`);
}

function updateRoom(tour, id, fn) {
  assertRoom(tour, id);
  return { ...tour, rooms: tour.rooms.map((r) => (r.id === id ? fn(r) : r)) };
}

export function addLink(tour, fromId, toId, { yaw, pitch }, { reverse = false } = {}) {
  if (fromId === toId) throw new Error('Průchod nemůže vést do stejné místnosti.');
  assertRoom(tour, toId);
  let next = updateRoom(tour, fromId, (r) => ({
    ...r,
    links: [...r.links.filter((l) => l.to !== toId), { to: toId, yaw, pitch }],
  }));
  if (reverse) {
    next = updateRoom(next, toId, (r) =>
      r.links.some((l) => l.to === fromId) ? r : { ...r, links: [...r.links, { to: fromId, yaw: null, pitch: 0 }] },
    );
  }
  return next;
}

export function removeLink(tour, fromId, toId) {
  return updateRoom(tour, fromId, (r) => ({ ...r, links: r.links.filter((l) => l.to !== toId) }));
}

export function moveLink(tour, fromId, toId, { yaw, pitch }) {
  return updateRoom(tour, fromId, (r) => ({
    ...r,
    links: r.links.map((l) => (l.to === toId ? { ...l, yaw, pitch } : l)),
  }));
}

export function setPlanPos(tour, id, [x, y]) {
  return updateRoom(tour, id, (r) => ({ ...r, planPos: [clamp01(x), clamp01(y)] }));
}

export function setNorth(tour, id, currentYaw) {
  return updateRoom(tour, id, (r) => ({ ...r, northOffset: normalizeYaw(-currentYaw) }));
}

export function setRoomProps(tour, id, props) {
  const allowed = {};
  for (const key of ['name', 'pano', 'preview']) {
    if (typeof props[key] === 'string' && props[key].length > 0) allowed[key] = props[key];
  }
  return updateRoom(tour, id, (r) => ({ ...r, ...allowed }));
}

export function setStart(tour, id) {
  assertRoom(tour, id);
  return { ...tour, start: id };
}

export function validate(tour) {
  const names = Object.fromEntries(tour.rooms.map((r) => [r.id, r.name]));
  const warnings = [];
  for (const r of tour.rooms) {
    for (const l of r.links) {
      if (l.yaw === null) warnings.push(`Místnost ${r.name}: průchod do ${names[l.to]} nemá umístění`);
    }
  }
  for (const r of tour.rooms) {
    if (r.links.length === 0) warnings.push(`Místnost ${r.name} nemá žádný průchod`);
  }
  for (const r of tour.rooms) {
    for (const l of r.links) {
      const back = tour.rooms.find((x) => x.id === l.to)?.links.some((x) => x.to === r.id);
      if (!back) warnings.push(`Průchod ${r.name} → ${names[l.to]} nemá zpětný průchod`);
    }
  }
  if (tour.plan) {
    for (const r of tour.rooms) {
      if (!r.planPos) warnings.push(`Místnost ${r.name} není umístěna na plánu`);
    }
  }
  return warnings;
}

export function toJSON(tour) {
  return {
    title: tour.title,
    start: tour.start,
    plan: tour.plan,
    rooms: tour.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      pano: r.pano,
      ...(r.preview ? { preview: r.preview } : {}),
      ...(r.planPos ? { planPos: r.planPos.map((n) => round(n, 4)) } : {}),
      northOffset: round(r.northOffset, 3),
      links: r.links.map((l) =>
        l.yaw === null ? { to: l.to, pitch: round(l.pitch, 3) } : { to: l.to, yaw: round(l.yaw, 3), pitch: round(l.pitch, 3) },
      ),
    })),
    exterior: tour.exterior,
  };
}
```

- [ ] **Step 4: Implement `src/editor/draft.js`**

```js
import { validateTour } from '../tour-loader.js';

const key = (houseId) => `tour-edit:${houseId}`;

export function readDraft(storage, houseId) {
  try {
    const raw = storage.getItem(key(houseId));
    if (!raw) return null;
    return validateTour(JSON.parse(raw)).tour;
  } catch {
    return null;
  }
}

export function writeDraft(storage, houseId, tour) {
  try {
    storage.setItem(key(houseId), JSON.stringify(tour));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(storage, houseId) {
  try {
    storage.removeItem(key(houseId));
  } catch {
    // storage unavailable (private mode); nothing to clear
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/editor-state.test.js tests/draft.test.js`
Expected: PASS. Note `validate` warning order: unplaced links, rooms without links, one-way links, plan positions (the first test's expected array relies on the B→A placeholder counting as a back link for A→B and vice versa).

- [ ] **Step 6: Commit**

```powershell
git add src/editor/editor-state.js src/editor/draft.js tests/editor-state.test.js tests/draft.test.js
git commit -m @'
feat: add editor state operations and draft storage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 7: Editor UI + export e2e + README

**Files:**
- Create: `src/editor/editor-panel.js`, `src/editor/editor.js`, `tests/editor-panel.test.js`, `README.md`
- Modify: `src/styles.css` (append editor styles), `tests/e2e/smoke.spec.js` (append editor test)

**Interfaces:**
- Consumes: `createViewer` → `ViewerHandle` (Task 5); `renderHeader` (Task 5); all of `editor-state.js` and `draft.js` (Task 6); `validateTour`, `TourError` (Task 1).
- Produces:
  - `escapeHtml(text: string) -> string`
  - `renderPanel(root: HTMLElement, view: PanelView, on: PanelHandlers) -> void`
    - `PanelView = { tour: Tour, currentId: string, mode: null | 'add-link' | 'move-link' | 'plan', moveTarget: string|null, warnings: string[], status: string }`
    - `PanelHandlers = { selectRoom(id), rename(name), setStart(), startAddLink(toId, reverse), startMoveLink(toId), removeLink(toId), startPlan(), setNorth(), cancel(), exportJson(), importJson(file), discardDraft() }`
  - `startEditor({ houseId, baseUrl, tour, container, headerEl }) -> void`
  - DOM hooks used by e2e: `button[data-action="export"]`, `.editor-panel`.

- [ ] **Step 1: Write the failing test**

`tests/editor-panel.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/editor/editor-panel.js';

describe('escapeHtml', () => {
  it('escapes html special characters and keeps diacritics', () => {
    expect(escapeHtml('<b>Žlutá & "modrá"</b> \'x\'')).toBe('&lt;b&gt;Žlutá &amp; &quot;modrá&quot;&lt;/b&gt; &#39;x&#39;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor-panel.test.js`
Expected: FAIL — cannot resolve `../src/editor/editor-panel.js`.

- [ ] **Step 3: Implement `src/editor/editor-panel.js`**

```js
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function renderPanel(root, view, on) {
  const { tour, currentId, mode, warnings, status } = view;
  const current = tour.rooms.find((r) => r.id === currentId);
  const names = Object.fromEntries(tour.rooms.map((r) => [r.id, r.name]));
  const targets = tour.rooms.filter((r) => r.id !== currentId);

  root.innerHTML = `
    <h2>Editor prohlídky</h2>
    <section>
      <h3>Místnosti</h3>
      <ul class="editor-rooms">
        ${tour.rooms.map((r) => `
          <li><button data-action="select" data-id="${escapeHtml(r.id)}" class="${r.id === currentId ? 'is-current' : ''}">
            ${escapeHtml(r.name)}${r.id === tour.start ? ' ★' : ''}
          </button></li>`).join('')}
      </ul>
    </section>
    <section>
      <h3>${escapeHtml(current.name)}</h3>
      <label>Název <input data-field="name" value="${escapeHtml(current.name)}" /></label>
      <label class="editor-check"><input type="checkbox" data-action="start" ${current.id === tour.start ? 'checked disabled' : ''} /> Výchozí místnost</label>
      <div class="editor-row">
        <select data-field="target">
          ${targets.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join('')}
        </select>
        <label class="editor-check"><input type="checkbox" data-field="reverse" checked /> i zpětný</label>
      </div>
      <div class="editor-row">
        <button data-action="add-link">Přidat průchod</button>
        <button data-action="plan">Umístit na plán</button>
        <button data-action="north">Nastavit sever</button>
      </div>
      <ul class="editor-links">
        ${current.links.map((l) => `
          <li>
            → ${escapeHtml(names[l.to])}${l.yaw === null ? ' <em>(neumístěno)</em>' : ''}
            <button data-action="move" data-id="${escapeHtml(l.to)}">Přesunout</button>
            <button data-action="remove" data-id="${escapeHtml(l.to)}">Smazat</button>
          </li>`).join('') || '<li><em>Žádné průchody</em></li>'}
      </ul>
    </section>
    ${mode ? `<p class="editor-status">${escapeHtml(status)} <button data-action="cancel">Zrušit</button></p>` : status ? `<p class="editor-status">${escapeHtml(status)}</p>` : ''}
    <section>
      <h3>Kontrola</h3>
      <ul class="editor-warnings">
        ${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('') || '<li>Vše v pořádku</li>'}
      </ul>
    </section>
    <div class="editor-row">
      <button data-action="export">Export tour.json</button>
      <label class="editor-file">Import <input type="file" accept="application/json,.json" data-field="import" /></label>
      <button data-action="discard">Zahodit koncept</button>
    </div>`;

  root.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      switch (btn.dataset.action) {
        case 'select': return on.selectRoom(id);
        case 'add-link': {
          const toId = root.querySelector('[data-field="target"]').value;
          const reverse = root.querySelector('[data-field="reverse"]').checked;
          return toId ? on.startAddLink(toId, reverse) : undefined;
        }
        case 'move': return on.startMoveLink(id);
        case 'remove': return on.removeLink(id);
        case 'plan': return on.startPlan();
        case 'north': return on.setNorth();
        case 'cancel': return on.cancel();
        case 'export': return on.exportJson();
        case 'discard': return on.discardDraft();
      }
    });
  });
  root.querySelector('[data-action="start"]').addEventListener('change', () => on.setStart());
  root.querySelector('[data-field="name"]').addEventListener('change', (e) => on.rename(e.target.value.trim()));
  root.querySelector('[data-field="import"]').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) on.importJson(file);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/editor-panel.test.js`
Expected: PASS.

- [ ] **Step 5: Implement `src/editor/editor.js`**

```js
import { createViewer } from '../viewer/viewer.js';
import { renderHeader } from '../viewer/ui.js';
import { validateTour, TourError } from '../tour-loader.js';
import {
  addLink, removeLink, moveLink, setPlanPos, setNorth, setRoomProps, setStart, validate, toJSON,
} from './editor-state.js';
import { readDraft, writeDraft, clearDraft } from './draft.js';
import { renderPanel } from './editor-panel.js';

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
}

export function startEditor({ houseId, baseUrl, tour: served, container, headerEl }) {
  const storage = safeStorage();
  const draft = readDraft(storage, houseId);
  let tour = served;
  if (draft && JSON.stringify(toJSON(draft)) !== JSON.stringify(toJSON(served))
      && window.confirm('Máte rozpracovanou verzi prohlídky. Obnovit ji?')) {
    tour = draft;
  }

  renderHeader(headerEl, `Editor – ${tour.title}`);
  document.body.classList.add('is-editing');
  const panelEl = document.createElement('aside');
  panelEl.className = 'editor-panel';
  document.body.append(panelEl);

  const ui = { currentId: tour.start, mode: null, target: null, reverse: true, moveTarget: null, status: '' };
  const handle = createViewer({
    container,
    tour,
    baseUrl,
    startRoom: tour.start,
    onRoomChange: (id) => {
      ui.currentId = id;
      render();
    },
  });

  function commit(next, status = '') {
    tour = next;
    writeDraft(storage, houseId, tour);
    ui.mode = null;
    ui.status = status;
    handle.reload(tour);
    render();
  }

  function tryCommit(fn, status) {
    try {
      commit(fn(), status);
    } catch (e) {
      ui.status = e.message;
      render();
    }
  }

  function setMode(mode, status) {
    ui.mode = mode;
    ui.status = status;
    render();
  }

  handle.viewer.addEventListener('click', ({ data }) => {
    if (data.rightclick) return;
    const pos = { yaw: data.yaw, pitch: data.pitch };
    if (ui.mode === 'add-link') {
      tryCommit(() => addLink(tour, ui.currentId, ui.target, pos, { reverse: ui.reverse }), 'Průchod přidán.');
    } else if (ui.mode === 'move-link') {
      tryCommit(() => moveLink(tour, ui.currentId, ui.moveTarget, pos), 'Průchod přesunut.');
    }
  });

  function openPlanPicker() {
    if (!tour.plan) {
      ui.status = 'Prohlídka nemá plán (spusťte render-plan).';
      render();
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'plan-picker';
    const img = document.createElement('img');
    img.src = baseUrl + tour.plan.image;
    img.alt = 'Plán';
    const wrap = document.createElement('div');
    wrap.className = 'plan-picker__wrap';
    wrap.append(img);
    for (const r of tour.rooms) {
      if (!r.planPos) continue;
      const dot = document.createElement('span');
      dot.className = `plan-picker__dot${r.id === ui.currentId ? ' is-current' : ''}`;
      dot.style.left = `${r.planPos[0] * 100}%`;
      dot.style.top = `${r.planPos[1] * 100}%`;
      dot.title = r.name;
      wrap.append(dot);
    }
    const close = () => {
      overlay.remove();
      ui.mode = null;
      render();
    };
    img.addEventListener('click', (e) => {
      const rect = img.getBoundingClientRect();
      const pos = [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
      overlay.remove();
      tryCommit(() => setPlanPos(tour, ui.currentId, pos), 'Pozice na plánu uložena.');
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.append(wrap);
    document.body.append(overlay);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(toJSON(tour), null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tour.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    ui.status = `Uloženo. Soubor nahraďte v public/houses/${houseId}/tour.json.`;
    render();
  }

  async function importJson(file) {
    try {
      const { tour: imported } = validateTour(JSON.parse(await file.text()));
      ui.currentId = imported.start;
      commit(imported, 'Importováno.');
    } catch (e) {
      ui.status = e instanceof TourError ? e.message : 'Soubor není platný JSON.';
      render();
    }
  }

  const handlers = {
    selectRoom: (id) => handle.tour.setCurrentNode(id),
    rename: (name) => tryCommit(() => setRoomProps(tour, ui.currentId, { name })),
    setStart: () => tryCommit(() => setStart(tour, ui.currentId), 'Výchozí místnost nastavena.'),
    startAddLink: (toId, reverse) => {
      ui.target = toId;
      ui.reverse = reverse;
      setMode('add-link', 'Klikněte v panoramatu na průchod.');
    },
    startMoveLink: (toId) => {
      ui.moveTarget = toId;
      setMode('move-link', 'Klikněte v panoramatu na novou pozici průchodu.');
    },
    removeLink: (toId) => tryCommit(() => removeLink(tour, ui.currentId, toId), 'Průchod smazán.'),
    startPlan: () => {
      setMode('plan', 'Klikněte na plánu na pozici místnosti.');
      openPlanPicker();
    },
    setNorth: () => tryCommit(
      () => setNorth(tour, ui.currentId, handle.viewer.getPosition().yaw),
      'Sever nastaven (pohled = horní strana plánu).',
    ),
    cancel: () => setMode(null, ''),
    exportJson,
    importJson,
    discardDraft: () => {
      if (!window.confirm('Zahodit rozpracované změny a načíst uloženou verzi?')) return;
      clearDraft(storage, houseId);
      ui.currentId = served.start;
      tour = served;
      handle.reload(tour);
      ui.status = 'Koncept zahozen.';
      render();
    },
  };

  function render() {
    if (!tour.rooms.some((r) => r.id === ui.currentId)) ui.currentId = tour.start;
    renderPanel(panelEl, { tour, currentId: ui.currentId, mode: ui.mode, moveTarget: ui.moveTarget, warnings: validate(tour), status: ui.status }, handlers);
  }

  render();
}
```

- [ ] **Step 6: Append editor styles to `src/styles.css`**

```css
body.is-editing #app,
body.is-editing #header {
  margin-right: 340px;
}

.editor-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 340px;
  overflow-y: auto;
  padding: 12px 16px;
  background: #1b1b1b;
  border-left: 1px solid #333;
  font-size: 14px;
}

.editor-panel h2 { font-size: 16px; margin: 0 0 8px; }
.editor-panel h3 { font-size: 14px; margin: 16px 0 6px; color: var(--accent); }
.editor-panel ul { list-style: none; margin: 0; padding: 0; }
.editor-panel li { margin: 2px 0; }
.editor-panel label { display: block; margin: 6px 0; }
.editor-panel input:not([type]) { width: 100%; }
.editor-check { display: inline-flex !important; gap: 4px; align-items: center; }
.editor-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; align-items: center; }

.editor-panel button {
  background: #2c2c2c;
  color: var(--fg);
  border: 1px solid #444;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
}

.editor-rooms button { width: 100%; text-align: left; }
.editor-rooms button.is-current { border-color: var(--accent); }
.editor-status { background: #3a2f1c; padding: 6px 8px; border-radius: 4px; }
.editor-warnings li { color: #e7c07a; }
.editor-file input { display: none; }
.editor-file { display: inline-block !important; margin: 0 !important; padding: 4px 8px; border: 1px solid #444; border-radius: 4px; cursor: pointer; }

.plan-picker {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.85);
  display: grid;
  place-items: center;
}

.plan-picker__wrap { position: relative; }
.plan-picker__wrap img { display: block; max-width: 90vw; max-height: 90vh; background: #fff; cursor: crosshair; }

.plan-picker__dot {
  position: absolute;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  border-radius: 50%;
  background: #888;
  border: 2px solid #fff;
  pointer-events: none;
}

.plan-picker__dot.is-current { background: var(--accent); }

@media (max-width: 800px) {
  body.is-editing #app, body.is-editing #header { margin-right: 0; }
  .editor-panel { top: auto; width: 100%; height: 45vh; border-left: 0; border-top: 1px solid #333; }
}
```

- [ ] **Step 7: Append the editor e2e test**

Append to `tests/e2e/smoke.spec.js`:
```js
import { readFile } from 'node:fs/promises';
import { validateTour } from '../../src/tour-loader.js';

test('editor exports a valid tour.json', async ({ page }) => {
  page.on('dialog', (d) => d.dismiss());
  await page.goto('/?house=krakovska&edit');
  await expect(page.locator('.editor-panel')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[data-action="export"]').click(),
  ]);
  expect(download.suggestedFilename()).toBe('tour.json');
  const json = JSON.parse(await readFile(await download.path(), 'utf8'));
  const { tour } = validateTour(json);
  expect(tour.rooms).toHaveLength(8);
});
```
(Move the two `import` lines to the top of the file next to the existing import.)

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: all unit tests PASS.

Run: `npm run test:e2e`
Expected: 4 passed.

- [ ] **Step 9: Manual editor check**

Run `npm run dev`, open `http://localhost:5173/?house=krakovska&edit`.
Verify: panel on the right lists 8 rooms; select Chodba → viewer navigates; pick target "Ložnice", "Přidat průchod", click the bedroom door → arrow appears there, Ložnice gets reverse link "(neumístěno)" warning; "Umístit na plán" → plan overlay with dots, click sets position; turn to face top of plan → "Nastavit sever" → back in viewer mode the minimap cone points up when facing that way; reload page → prompt to restore draft; Export downloads tour.json; Import of that file works; a room renamed to `<b>x</b>` displays literally.

- [ ] **Step 10: Write `README.md`**

````markdown
# House Tour

Virtuální prohlídka domů z 360° fotek. Static site (Vite + Photo Sphere Viewer).

## Run

```powershell
npm install
npm run dev          # http://localhost:5173/?house=krakovska
npm test             # unit tests
npm run test:e2e     # Playwright smoke tests (first run: npx playwright install chromium)
npm run build        # static output in dist/
```

URL parameters: `house=<id>` (house folder), `room=<id>` (start room), `edit` (editor).

## Adding a new house

1. Put 360° photos (2:1 equirectangular JPG) and other photos (exterior) in one folder.
2. Optional: create `houses-src/<id>.mapping.json` mapping file names to `{ "id", "name" }` (see `krakovska.mapping.json`).
3. `node scripts/prepare-house.mjs <photoFolder> <id> --map houses-src/<id>.mapping.json`
4. `node scripts/render-plan.mjs <plan.pdf> <id> --crop x,y,w,h` (crop as page fractions; check `plan.png`, adjust).
5. `npm run dev`, open `/?house=<id>&edit`:
   - per room: pick target → "Přidat průchod" → click the doorway,
   - "Umístit na plán" → click the room on the plan,
   - face the top side of the plan → "Nastavit sever",
   - fix everything in "Kontrola".
6. "Export tour.json" → replace `public/houses/<id>/tour.json`, commit.
````

- [ ] **Step 11: Commit**

```powershell
git add src tests README.md
git commit -m @'
feat: add tour editor with hotspot placement, plan positions and export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```
