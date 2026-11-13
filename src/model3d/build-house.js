import * as THREE from 'three';
import { wallBoxes, liningRects, roofPolygons, planPosToModel } from './geometry.js';

// Builds three.js meshes from model.json. Geometry is built in millimetres and the
// returned groups are scaled to metres. Texture coordinates are in world metres, so a
// material's `size` (metres one texture tile covers) maps straight to texture.repeat.

const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((v) => v / l);
};

class Buckets {
  constructor() {
    this.byKey = new Map();
  }

  // Convex polygon. If `facing` is given the winding is fixed so the face looks that way.
  poly(layer, material, pts, facing) {
    let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    if (facing && dot(n, facing) < 0) {
      pts = [...pts].reverse();
      n = n.map((v) => -v);
    }
    const u = Math.abs(n[1]) > 0.99 ? [1, 0, 0] : norm(cross([0, 1, 0], n));
    const v = Math.abs(n[1]) > 0.99 ? [0, 0, 1] : cross(n, u);
    const key = `${layer}|${material}`;
    if (!this.byKey.has(key)) this.byKey.set(key, { layer, material, pos: [], nor: [], uv: [] });
    const b = this.byKey.get(key);
    for (let i = 1; i < pts.length - 1; i++) {
      const tri = [pts[0], pts[i], pts[i + 1]];
      if (Math.hypot(...cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]))) < 1e-6) continue;
      for (const p of tri) {
        b.pos.push(...p);
        b.nor.push(...n);
        b.uv.push(dot(p, u) / 1000, dot(p, v) / 1000);
      }
    }
  }

  box(layer, material, { min, max }, pickMaterial) {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const faces = [
      [[1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
      [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
      [[0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]],
      [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
      [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
      [[0, 0, -1], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]],
    ];
    for (const [n, pts] of faces) {
      const centre = pts.reduce((s, p) => s.map((v, i) => v + p[i] / 4), [0, 0, 0]);
      this.poly(layer, pickMaterial ? pickMaterial(n, centre) : material, pts, n);
    }
  }
}

function makeMaterial(spec, baseUrl, loader, maxAnisotropy) {
  if (spec.glass) {
    return new THREE.MeshPhysicalMaterial({
      color: spec.color, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.18, envMapIntensity: 1.5,
    });
  }
  const mat = new THREE.MeshStandardMaterial({ color: spec.color ?? '#cccccc', roughness: spec.roughness ?? 0.8, metalness: 0 });
  if (spec.texture) {
    loader.load(baseUrl + spec.texture, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1 / spec.size, 1 / spec.size);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAnisotropy;
      mat.map = tex;
      // `tint` multiplies the photo texture, e.g. to undo bright midday exposure.
      mat.color.set(spec.tint ?? '#ffffff');
      mat.needsUpdate = true;
    });
  }
  return mat;
}

const FRAME = 70;
const FRAME_DEPTH = 80;
const CASING_PROUD = 15;
const SKIRTING_HEIGHT = 60;

function addWindow(b, o, interior, solids) {
  const [x0, z0, x1, z1] = o.rect;
  const alongX = x1 - x0 >= z1 - z0;
  const [a, bb] = alongX ? [x0, x1] : [z0, z1];
  const [c0, c1] = alongX ? [z0, z1] : [x0, x1];
  // Frames sit a third of the way in from the outer face.
  const outerFirst = alongX ? z0 < interior[1] : x0 < interior[0];
  const outer = outerFirst ? c0 : c1;
  const mid = outer + (outerFirst ? 1 : -1) * (c1 - c0) / 3;
  const across = [mid - FRAME_DEPTH / 2, mid + FRAME_DEPTH / 2];
  const piece = (p, q, y0, y1, d = across) => (alongX
    ? { min: [p, y0, d[0]], max: [q, y1, d[1]] }
    : { min: [d[0], y0, p], max: [d[1], y1, q] });
  const { sill, head } = o;

  const frames = [
    piece(a, a + FRAME, sill, head),
    piece(bb - FRAME, bb, sill, head),
    piece(a, bb, head - FRAME, head),
    piece(a, bb, sill, sill + FRAME),
  ];
  const width = bb - a;
  const panes = width > 2400 ? 3 : width > 1250 ? 2 : 1;
  for (let i = 1; i < panes; i++) {
    const m = a + (width * i) / panes;
    frames.push(piece(m - FRAME / 2, m + FRAME / 2, sill, head));
  }
  frames.forEach((f) => b.box('main', 'frame', f));
  const glass = piece(a, bb, sill, head, [mid - 4, mid + 4]);
  b.box('glass', 'glass', glass);
  solids.push(glass);
  // Interior window board on the parapet.
  if (sill > 0) {
    const inner = outerFirst ? c1 : c0;
    const board = outerFirst ? [across[1], inner + 20] : [inner - 20, across[0]];
    b.box('main', 'frame', piece(a, bb, sill - 20, sill, board));
  }
}

function addDoorCasing(b, o) {
  const [x0, z0, x1, z1] = o.rect;
  const alongX = x1 - x0 >= z1 - z0;
  const [a, bb] = alongX ? [x0, x1] : [z0, z1];
  const [c0, c1] = alongX ? [z0, z1] : [x0, x1];
  const piece = (p, q, y0, y1, d0, d1) => (alongX
    ? { min: [p, y0, d0], max: [q, y1, d1] }
    : { min: [d0, y0, p], max: [d1, y1, q] });
  for (const [d0, d1] of [[c0 - CASING_PROUD, c0], [c1, c1 + CASING_PROUD]]) {
    b.box('main', 'trim', piece(a - FRAME, a, 0, o.head + FRAME, d0, d1));
    b.box('main', 'trim', piece(bb, bb + FRAME, 0, o.head + FRAME, d0, d1));
    b.box('main', 'trim', piece(a, bb, o.head, o.head + FRAME, d0, d1));
  }
  // Reveal lining (the frame inside the opening).
  b.box('main', 'trim', piece(a, a + 20, 0, o.head, c0, c1));
  b.box('main', 'trim', piece(bb - 20, bb, 0, o.head, c0, c1));
  b.box('main', 'trim', piece(a, bb, o.head - 20, o.head, c0, c1));
}

function addEntrance(b, o, solids) {
  const [x0, z0, x1, z1] = o.rect;
  const mid = (z0 + z1) / 2;
  const leaf = { min: [x0 + FRAME, 0, mid - 30], max: [x1 - FRAME, o.head - FRAME, mid + 30] };
  b.box('main', 'trim', leaf);
  b.box('main', 'frame', { min: [x0, 0, mid - 40], max: [x0 + FRAME, o.head, mid + 40] });
  b.box('main', 'frame', { min: [x1 - FRAME, 0, mid - 40], max: [x1, o.head, mid + 40] });
  b.box('main', 'frame', { min: [x0, o.head - FRAME, mid - 40], max: [x1, o.head, mid + 40] });
  solids.push(leaf);
}

function footprint(model) {
  const ext = model.walls.filter((w) => w.exterior).map((w) => w.rect);
  return [
    Math.min(...ext.map((r) => r[0])), Math.min(...ext.map((r) => r[1])),
    Math.max(...ext.map((r) => r[2])), Math.max(...ext.map((r) => r[3])),
  ];
}

// Everything that does not need three.js: triangle buckets per layer and material,
// solid boxes for walking collisions, and the outer footprint. All in millimetres.
export function houseGeometry(model) {
  const b = new Buckets();
  const solids = [];
  const outline = footprint(model);
  const ext = model.walls.find((w) => w.exterior).rect;
  const thick = Math.min(ext[2] - ext[0], ext[3] - ext[1]);
  const interior = [outline[0] + thick, outline[1] + thick, outline[2] - thick, outline[3] - thick];
  const isInside = (x, z) => x > interior[0] && x < interior[2] && z > interior[1] && z < interior[3];

  // Walls: exterior faces get plaster, everything facing a room gets wall paint.
  for (const w of model.walls) {
    const height = w.exterior ? model.eave : model.ceiling;
    const pick = w.exterior
      ? (n, c) => (n[1] === 0 && isInside(c[0] + n[0] * 5, c[2] + n[2] * 5) ? 'wall' : 'plaster')
      : null;
    for (const box of wallBoxes(w.rect, model.openings, height)) {
      b.box('main', 'wall', box, pick);
      solids.push(box);
    }
    if (w.exterior) b.box('main', 'plinth', { min: [w.rect[0], model.ground, w.rect[1]], max: [w.rect[2], 0, w.rect[3]] });
  }

  // Tiled rooms get their tiles; the others an oak skirting board.
  for (const room of model.rooms) {
    const [material, height, thickness] = room.lining
      ? [room.lining.material, room.lining.height, 10]
      : ['trim', SKIRTING_HEIGHT, 12];
    for (const strip of liningRects(room, thickness)) {
      for (const box of wallBoxes(strip, model.openings, height, { tolerance: 20 })) b.box('main', material, box);
    }
  }

  for (const o of model.openings) {
    if (o.type === 'window') addWindow(b, o, interior, solids);
    else if (o.type === 'door') addDoorCasing(b, o);
    else if (o.type === 'entrance') addEntrance(b, o, solids);
  }

  // Floor across the whole footprint (all rooms share the oak floor), ceiling above rooms.
  const [fx0, fz0, fx1, fz1] = outline;
  b.poly('floor', model.floor, [[fx0, 0, fz0], [fx0, 0, fz1], [fx1, 0, fz1], [fx1, 0, fz0]], [0, 1, 0]);
  const [ix0, iz0, ix1, iz1] = interior;
  b.poly('ceiling', 'ceiling', [[ix0, model.ceiling, iz0], [ix1, model.ceiling, iz0], [ix1, model.ceiling, iz1], [ix0, model.ceiling, iz1]], [0, -1, 0]);
  // Attic floor over the ceiling, so the house reads as closed from inside the roof space.
  b.poly('roof', 'plaster', [[ix0, model.ceiling + 1, iz0], [ix0, model.ceiling + 1, iz1], [ix1, model.ceiling + 1, iz1], [ix1, model.ceiling + 1, iz0]], [0, 1, 0]);

  for (const r of model.roofs) {
    const { slopes, gables } = roofPolygons(r.rect, r.pitch, r.base, { ridge: r.ridge, gable: r.gable });
    for (const s of slopes) {
      b.poly('roof', 'roof', s);
      b.poly('roof', 'plaster', [...s].reverse());
    }
    const cx = (r.rect[0] + r.rect[2]) / 2;
    const cz = (r.rect[1] + r.rect[3]) / 2;
    for (const g of gables) {
      const c = g.reduce((s, p) => s.map((v, i) => v + p[i] / g.length), [0, 0, 0]);
      b.poly('roof', 'plaster', g, norm([c[0] - cx, 0, c[2] - cz]));
    }
  }

  for (const p of model.posts) {
    const post = { min: [p.at[0] - 60, model.ground, p.at[1] - 60], max: [p.at[0] + 60, p.height, p.at[1] + 60] };
    b.box('main', 'wood', post);
    solids.push(post);
  }
  for (const s of model.slabs) {
    b.box('main', s.material, { min: [s.rect[0], model.ground, s.rect[1]], max: [s.rect[2], s.top, s.rect[3]] });
  }

  return { buckets: [...b.byKey.values()], solids, outline };
}

// Rooms in metres, with their 360° photo spot when the tour has one.
export function houseRooms(model, tour) {
  const toMetres = ([x, z]) => [x / 1000, z / 1000];
  const panoRooms = new Map(tour.rooms.map((r) => [r.id, r]));
  return model.rooms.map((room) => {
    const pano = panoRooms.get(room.id);
    const biggest = [...room.rects].sort((p, q) => (q[2] - q[0]) * (q[3] - q[1]) - (p[2] - p[0]) * (p[3] - p[1]))[0];
    const centre = [(biggest[0] + biggest[2]) / 2, (biggest[1] + biggest[3]) / 2];
    const panoPos = pano?.planPos && tour.plan ? planPosToModel(pano.planPos, tour.plan, model.plan) : null;
    return {
      id: room.id,
      name: pano?.name ?? room.name ?? room.id,
      hasPano: Boolean(pano),
      centre: toMetres(centre),
      panoPos: panoPos ? toMetres(panoPos) : null,
    };
  });
}

export function buildHouse(model, tour, baseUrl, { maxAnisotropy = 8 } = {}) {
  const { buckets, solids, outline } = houseGeometry(model);
  const loader = new THREE.TextureLoader();
  const materials = Object.fromEntries(Object.entries(model.materials).map(([k, spec]) => [k, makeMaterial(spec, baseUrl, loader, maxAnisotropy)]));
  materials.roof.side = THREE.FrontSide;

  const groups = {};
  for (const name of ['main', 'floor', 'ceiling', 'roof', 'glass']) {
    groups[name] = new THREE.Group();
    groups[name].scale.setScalar(0.001);
  }
  for (const { layer, material, pos, nor, uv } of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(geo, materials[material]);
    mesh.castShadow = layer !== 'glass' && layer !== 'floor';
    mesh.receiveShadow = true;
    groups[layer].add(mesh);
  }

  return {
    groups,
    materials,
    rooms: houseRooms(model, tour),
    solids,
    bounds: { min: [outline[0] / 1000, outline[1] / 1000], max: [outline[2] / 1000, outline[3] / 1000] },
    eyeRoomHeight: model.ceiling / 1000,
  };
}
