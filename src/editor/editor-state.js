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

export function setTitle(tour, title) {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  return trimmed ? { ...tour, title: trimmed } : tour;
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
      ...(r.floor ? { floor: r.floor } : {}),
      northOffset: round(r.northOffset, 3),
      ...(r.startYaw ? { startYaw: round(r.startYaw, 3) } : {}),
      ...(r.fixedView ? { fixedView: true } : {}),
      links: r.links.map((l) =>
        l.yaw === null ? { to: l.to, pitch: round(l.pitch, 3) } : { to: l.to, yaw: round(l.yaw, 3), pitch: round(l.pitch, 3) },
      ),
    })),
    exterior: tour.exterior,
  };
}
