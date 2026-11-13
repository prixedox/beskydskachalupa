import { describe, it, expect } from 'vitest';
import { isPanorama, skeletonTour, parseCrop, cropRect, validateMapping } from '../scripts/lib/house-files.mjs';
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

describe('validateMapping', () => {
  it('accepts a valid mapping', () => {
    expect(() => validateMapping({ 'a.jpg': { id: 'obyvak', name: 'Obývák' }, 'b.jpg': { id: 'room-2', name: 'B' } })).not.toThrow();
  });

  it.each(['../x', 'a/b', 'A', 'a b', '', undefined])('rejects invalid id %s', (id) => {
    expect(() => validateMapping({ 'a.jpg': { id, name: 'X' } })).toThrow(/id/i);
  });

  it('rejects duplicate ids', () => {
    expect(() => validateMapping({ 'a.jpg': { id: 'x', name: 'A' }, 'b.jpg': { id: 'x', name: 'B' } })).toThrow(/duplic/i);
  });
});
