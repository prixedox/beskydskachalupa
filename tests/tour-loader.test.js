import { describe, it, expect, vi } from 'vitest';
import { validateTour, loadTour, findMissingPanoramas, withoutRooms, TourError } from '../src/tour-loader.js';

const room = (id, extra = {}) => ({ id, name: id.toUpperCase(), pano: `pano/${id}.jpg`, ...extra });

describe('validateTour', () => {
  it('drops links from a room to itself with a warning', () => {
    const { tour, warnings } = validateTour({ rooms: [room('a', { links: [{ to: 'a', yaw: 1 }, { to: 'b', yaw: 2 }] }), room('b')] });
    expect(tour.rooms[0].links.map((l) => l.to)).toEqual(['b']);
    expect(warnings).toContain('Místnost a: odkaz sám na sebe');
  });

  it('normalizes a minimal tour with defaults', () => {
    const { tour, warnings } = validateTour({ rooms: [room('a')] });
    expect(warnings).toEqual([]);
    expect(tour).toEqual({
      title: 'Prohlídka',
      start: 'a',
      plan: null,
      exterior: [],
      rooms: [{ id: 'a', name: 'A', pano: 'pano/a.jpg', preview: null, planPos: null, floor: null, northOffset: 0, startYaw: 0, fixedView: false, links: [] }],
    });
  });

  it('keeps the fixed view of a room only when it is true', () => {
    const { tour } = validateTour({ rooms: [room('a', { fixedView: true }), room('b', { fixedView: 'yes' })] });
    expect(tour.rooms.map((r) => r.fixedView)).toEqual([true, false]);
  });

  it('keeps the yaw a room opens at', () => {
    const { tour } = validateTour({ rooms: [room('a', { startYaw: 1.2 }), room('b', { startYaw: 'left' })] });
    expect(tour.rooms.map((r) => r.startYaw)).toEqual([1.2, 0]);
  });

  it('keeps where each floor sits in the plan image', () => {
    const plan = { image: 'plan.png', width: 3000, height: 1000, floors: [{ name: 'Přízemí', x: 0, width: 1400 }, { name: 'Podkroví', x: 1600, width: 1400 }, { name: 'bez šířky', x: 5 }] };
    const { tour } = validateTour({ plan, rooms: [room('a')] });
    expect(tour.plan.floors).toEqual([{ name: 'Přízemí', x: 0, width: 1400 }, { name: 'Podkroví', x: 1600, width: 1400 }]);
  });

  it('keeps the floor of a room when it is a name', () => {
    const { tour } = validateTour({ rooms: [room('a', { floor: 'podkrovi' }), room('b', { floor: 2 })] });
    expect(tour.rooms.map((r) => r.floor)).toEqual(['podkrovi', null]);
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
