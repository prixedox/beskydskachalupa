import { escapeHtml } from '../escape-html.js';

const TAU = 2 * Math.PI;

export function normalizeYaw(yaw) {
  return ((yaw % TAU) + TAU) % TAU;
}

// Heading in plan frame is yaw + northOffset; keep it when entering the next room.
export function entryYaw(linkYaw, fromNorth, toNorth) {
  return normalizeYaw(linkYaw + fromNorth - toNorth);
}

// Yaw to face after walking through a link at `linkYaw`; `from` and `to` are node data.
export function arrivalYaw(linkYaw, from, to) {
  return to.fixedView ? to.startYaw : entryYaw(linkYaw, from.northOffset, to.northOffset);
}

// Where the minimap centres for one floor, in plan image pixels: the middle of that floor's
// part of the plan image when the plan lists its floors, else the middle of its photo spots.
export function planAnchor(tour, floor) {
  const part = tour.plan.floors?.find((f) => f.name === floor);
  if (part) return { x: part.x + part.width / 2, y: tour.plan.height / 2 };
  const spots = tour.rooms.filter((r) => r.planPos && r.floor === floor).map((r) => r.planPos);
  if (spots.length === 0) return null;
  const xs = spots.map((p) => p[0] * tour.plan.width);
  const ys = spots.map((p) => p[1] * tour.plan.height);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

export function tourToNodes(tour, baseUrl) {
  const plan = tour.plan;
  return tour.rooms.map((room) => ({
    id: room.id,
    // PSV renders name/caption via innerHTML.
    name: escapeHtml(room.name),
    caption: escapeHtml(room.name),
    panorama: baseUrl + room.pano,
    thumbnail: room.preview ? baseUrl + room.preview : undefined,
    links: room.links
      .filter((l) => l.yaw !== null)
      .map((l) => ({ nodeId: l.to, position: { yaw: l.yaw, pitch: l.pitch } })),
    map: plan && room.planPos ? { x: room.planPos[0] * plan.width, y: room.planPos[1] * plan.height } : false,
    data: { northOffset: room.northOffset, floor: room.floor, startYaw: room.startYaw, fixedView: room.fixedView },
  }));
}
