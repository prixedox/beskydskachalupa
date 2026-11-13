// Pure geometry for the 3D house model. Plan coordinates are millimetres with x to the
// right and z down the plan (the plan's y); height is y, up. Rects are [x0, z0, x1, z1].
// Boxes are { min: [x, y, z], max: [x, y, z] }.

const box = (x0, y0, z0, x1, y1, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });

export function rectsOverlap(a, b, tolerance = 0) {
  return a[0] < b[2] + tolerance && b[0] < a[2] + tolerance && a[1] < b[3] + tolerance && b[1] < a[3] + tolerance;
}

// Splits a full-height block along its long axis around the openings that cross it:
// solid pieces between openings, plus the parapet below each sill and the lintel above
// each head. `tolerance` lets thin linings (tiles) pick up the openings of the wall behind.
export function wallBoxes(rect, openings, height, { base = 0, tolerance = 0 } = {}) {
  const [x0, z0, x1, z1] = rect;
  const alongX = x1 - x0 >= z1 - z0;
  const lo = alongX ? x0 : z0;
  const hi = alongX ? x1 : z1;
  const make = (a, b, y0, y1) => (alongX ? box(a, y0, z0, b, y1, z1) : box(x0, y0, a, x1, y1, b));

  const cuts = openings
    .filter((o) => rectsOverlap(rect, o.rect, tolerance))
    .map((o) => ({
      a: Math.max(lo, alongX ? o.rect[0] : o.rect[1]),
      b: Math.min(hi, alongX ? o.rect[2] : o.rect[3]),
      sill: o.sill,
      head: o.head,
    }))
    .filter((c) => c.b > c.a)
    .sort((p, q) => p.a - q.a);

  const out = [];
  let cursor = lo;
  for (const c of cuts) {
    if (c.a > cursor) out.push(make(cursor, c.a, base, height));
    if (c.sill > base) out.push(make(c.a, c.b, base, Math.min(c.sill, height)));
    if (c.head < height) out.push(make(c.a, c.b, Math.max(c.head, base), height));
    cursor = Math.max(cursor, c.b);
  }
  if (hi > cursor) out.push(make(cursor, hi, base, height));
  return out;
}

const inside = (rects, x, z) => rects.some((r) => x > r[0] && x < r[2] && z > r[1] && z < r[3]);

// Thin strips lining a room's walls (e.g. tiles), skipping edges shared between the
// room's own rects.
export function liningRects(room, thickness) {
  const out = [];
  for (const [x0, z0, x1, z1] of room.rects) {
    const edges = [
      { strip: [x0, z0, x1, z0 + thickness], probe: [(x0 + x1) / 2, z0 - 1] },
      { strip: [x0, z1 - thickness, x1, z1], probe: [(x0 + x1) / 2, z1 + 1] },
      { strip: [x0, z0, x0 + thickness, z1], probe: [x0 - 1, (z0 + z1) / 2] },
      { strip: [x1 - thickness, z0, x1, z1], probe: [x1 + 1, (z0 + z1) / 2] },
    ];
    for (const e of edges) if (!inside(room.rects, ...e.probe)) out.push(e.strip);
  }
  return out;
}

// Hip roof (or gable roof with `gable`) over `rect`, eaves at height `base`, ridge
// along x or z. Returns polygons as arrays of [x, y, z] points, counter-clockwise seen
// from outside: `slopes` are roof planes, `gables` the vertical end triangles.
export function roofPolygons(rect, pitchDeg, base, { ridge = 'x', gable = false } = {}) {
  // Work in a frame where the ridge runs along u; map back at the end.
  const [x0, z0, x1, z1] = rect;
  const alongX = ridge === 'x';
  const [u0, u1, v0, v1] = alongX ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
  const half = (v1 - v0) / 2;
  const top = base + half * Math.tan((pitchDeg * Math.PI) / 180);
  const vc = (v0 + v1) / 2;
  const inset = gable ? 0 : Math.min(half, (u1 - u0) / 2);
  const r0 = [u0 + inset, top, vc];
  const r1 = [u1 - inset, top, vc];
  const a = [u0, base, v0];
  const b = [u1, base, v0];
  const c = [u1, base, v1];
  const d = [u0, base, v1];
  // Map (u, y, v) to (x, y, z). Swapping axes mirrors the shape, so reverse winding.
  const toXYZ = (poly) => {
    const pts = poly.map(([u, y, v]) => (alongX ? [u, y, v] : [v, y, u]));
    return alongX ? pts : pts.reverse();
  };
  const slopes = [[a, r0, r1, b], [c, r1, r0, d]];
  const ends = [[d, r0, a], [b, r1, c]];
  return {
    slopes: (gable ? slopes : [...slopes, ...ends]).map(toXYZ),
    gables: gable ? ends.map(toXYZ) : [],
  };
}

// The tour stores room positions as fractions of the plan image; the model calibration
// says where the house's top-left outer corner is in that image and how big a pixel is.
export function planPosToModel(planPos, planSize, calibration) {
  const { originPx, mmPerPx } = calibration;
  return [
    (planPos[0] * planSize.width - originPx[0]) * mmPerPx,
    (planPos[1] * planSize.height - originPx[1]) * mmPerPx,
  ];
}

// Walking: anything between ankle and chest height blocks, as a 2D footprint.
export function blockingFootprints(boxes, fromY = 300, toY = 1500) {
  return boxes.filter((b) => b.min[1] < toY && b.max[1] > fromY).map((b) => [b.min[0], b.min[2], b.max[0], b.max[2]]);
}

// Moves a circle of `radius` by (dx, dz), one axis at a time so it slides along walls.
export function moveWithCollision([x, z], [dx, dz], radius, footprints) {
  const hits = (px, pz) => footprints.some((r) => px + radius > r[0] && px - radius < r[2] && pz + radius > r[1] && pz - radius < r[3]);
  const nx = hits(x + dx, z) ? x : x + dx;
  const nz = hits(nx, z + dz) ? z : z + dz;
  return [nx, nz];
}
