import { describe, it, expect } from 'vitest';
import { normalizeYaw, entryYaw, arrivalYaw, tourToNodes, planAnchor } from '../src/viewer/nodes.js';
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

describe('arrivalYaw', () => {
  const from = { northOffset: 0.5 };

  it('keeps the walking direction by default', () => {
    expect(arrivalYaw(1.0, from, { northOffset: 2.0, startYaw: 0.3, fixedView: false })).toBeCloseTo(entryYaw(1.0, 0.5, 2.0));
  });

  it('opens a room with a fixed view at its own yaw', () => {
    expect(arrivalYaw(1.0, from, { northOffset: 2.0, startYaw: 0.3, fixedView: true })).toBe(0.3);
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
      caption: 'A',
      panorama: '/houses/x/pano/a.jpg',
      thumbnail: '/houses/x/pano/a-preview.jpg',
      links: [{ nodeId: 'b', position: { yaw: 1, pitch: -0.2 } }],
      map: { x: 500, y: 500 },
      data: { northOffset: 0.7, floor: null, startYaw: 0, fixedView: false },
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

describe('planAnchor', () => {
  const { tour } = validateTour({
    plan: { image: 'plan.png', width: 1000, height: 500 },
    rooms: [
      { id: 'a', pano: 'a.jpg', planPos: [0.25, 0.5], floor: 'prizemi' },
      { id: 'b', pano: 'b.jpg', planPos: [0.75, 0.25], floor: 'prizemi' },
      { id: 'c', pano: 'c.jpg', planPos: [0.5, 0.75], floor: 'podkrovi' },
      { id: 'd', pano: 'd.jpg', floor: 'podkrovi' },
    ],
  });

  it('is the middle of the photo spots of one floor, in plan pixels', () => {
    expect(planAnchor(tour, 'prizemi')).toEqual({ x: 500, y: 187.5 });
    expect(planAnchor(tour, 'podkrovi')).toEqual({ x: 500, y: 375 });
  });

  it('is the middle of the floor in the plan image when the plan lists its floors', () => {
    const withFloors = { ...tour, plan: { ...tour.plan, floors: [{ name: 'prizemi', x: 0, width: 400 }, { name: 'podkrovi', x: 600, width: 400 }] } };
    expect(planAnchor(withFloors, 'podkrovi')).toEqual({ x: 800, y: 250 });
  });

  it('is null for a floor without photo spots', () => {
    expect(planAnchor(tour, null)).toBeNull();
  });
});

describe('tourToNodes escaping', () => {
  it('escapes html in name and caption', () => {
    const { tour } = validateTour({ rooms: [{ id: 'a', name: '<b>x</b> & y', pano: 'pano/a.jpg' }] });
    const [a] = tourToNodes(tour, '/');
    expect(a.name).toBe('&lt;b&gt;x&lt;/b&gt; &amp; y');
    expect(a.caption).toBe('&lt;b&gt;x&lt;/b&gt; &amp; y');
  });
});
