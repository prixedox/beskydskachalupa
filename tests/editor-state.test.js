import { describe, it, expect } from 'vitest';
import { validateTour } from '../src/tour-loader.js';
import {
  addLink, removeLink, moveLink, setPlanPos, setNorth, setRoomProps, setStart, setTitle, validate, toJSON,
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

  it('keeps the floor and opening yaw of a room', () => {
    const { tour } = validateTour({ rooms: [{ id: 'a', pano: 'a.jpg', floor: 'podkrovi', startYaw: 1.23456, fixedView: true }, { id: 'b', pano: 'b.jpg' }] });
    const [a, b] = toJSON(tour).rooms;
    expect(a).toMatchObject({ floor: 'podkrovi', startYaw: 1.235, fixedView: true });
    expect(b).not.toHaveProperty('floor');
    expect(b).not.toHaveProperty('startYaw');
    expect(b).not.toHaveProperty('fixedView');
  });

  it('writes unplaced links without yaw', () => {
    const t = addLink(make(), 'a', 'b', { yaw: 1, pitch: 0 }, { reverse: true });
    expect(toJSON(t).rooms[1].links).toEqual([{ to: 'a', pitch: 0 }]);
  });
});

describe('setTitle', () => {
  it('sets a trimmed title and returns a new tour', () => {
    const tour = make();
    const next = setTitle(tour, '  Nový dům  ');
    expect(next.title).toBe('Nový dům');
    expect(next).not.toBe(tour);
    expect(next.rooms).toBe(tour.rooms);
  });

  it('ignores empty or whitespace titles', () => {
    const tour = make();
    expect(setTitle(tour, '').title).toBe(tour.title);
    expect(setTitle(tour, '   ').title).toBe(tour.title);
  });
});
