export class TourError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TourError';
  }
}

const HOUSE_ID = /^[a-z0-9-]+$/;

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;
const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

// A plan image can show several floors side by side; each entry says where one of them sits.
const isFloor = (f) => f && isNonEmptyString(f.name) && Number.isFinite(f.x) && f.width > 0;

function normalizePlan(plan) {
  if (!plan || !isNonEmptyString(plan.image)) return null;
  if (!(plan.width > 0) || !(plan.height > 0)) return null;
  const floors = Array.isArray(plan.floors) ? plan.floors.filter(isFloor).map(({ name, x, width }) => ({ name, x, width })) : [];
  return { image: plan.image, width: plan.width, height: plan.height, ...(floors.length > 0 ? { floors } : {}) };
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
    // Name of the floor the room is on, for plans that show several floors side by side.
    floor: isNonEmptyString(r.floor) ? r.floor : null,
    northOffset: Number.isFinite(r.northOffset) ? r.northOffset : 0,
    // Where the view points when the tour opens in this room (walking in keeps the heading).
    startYaw: Number.isFinite(r.startYaw) ? r.startYaw : 0,
    // Garden spots are far apart, so walking in turns to startYaw instead of keeping the heading.
    fixedView: r.fixedView === true,
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
        if (l && l.to === room.id) {
          warnings.push(`Místnost ${room.id}: odkaz sám na sebe`);
          return false;
        }
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
