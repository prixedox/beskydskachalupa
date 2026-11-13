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
const tour = { title: 'T', start: 'a', plan: null, exterior: [], rooms: [{ id: 'a', name: 'A', pano: 'p.jpg', preview: null, planPos: null, floor: null, northOffset: 0, startYaw: 0, fixedView: false, links: [] }] };

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
