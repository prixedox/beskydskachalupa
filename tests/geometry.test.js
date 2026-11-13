import { describe, it, expect } from 'vitest';
import { wallBoxes, liningRects, roofPolygons, planPosToModel, blockingFootprints, moveWithCollision } from '../src/model3d/geometry.js';

describe('wallBoxes', () => {
  const wall = [0, 0, 4000, 300];

  it('keeps a wall without openings whole', () => {
    expect(wallBoxes(wall, [], 2600)).toEqual([{ min: [0, 0, 0], max: [4000, 2600, 300] }]);
  });

  it('cuts a window into side pieces, parapet and lintel', () => {
    const win = { rect: [1000, 0, 2000, 300], sill: 900, head: 2300 };
    expect(wallBoxes(wall, [win], 2600)).toEqual([
      { min: [0, 0, 0], max: [1000, 2600, 300] },
      { min: [1000, 0, 0], max: [2000, 900, 300] },
      { min: [1000, 2300, 0], max: [2000, 2600, 300] },
      { min: [2000, 0, 0], max: [4000, 2600, 300] },
    ]);
  });

  it('cuts a door along a vertical wall and ignores openings elsewhere', () => {
    const door = { rect: [0, 500, 125, 1300], sill: 0, head: 1970 };
    const far = { rect: [3000, 500, 3125, 1300], sill: 0, head: 1970 };
    expect(wallBoxes([0, 0, 125, 2000], [door, far], 2600)).toEqual([
      { min: [0, 0, 0], max: [125, 2600, 500] },
      { min: [0, 1970, 500], max: [125, 2600, 1300] },
      { min: [0, 0, 1300], max: [125, 2600, 2000] },
    ]);
  });

  it('lets a lining next to a wall pick up its openings through the tolerance', () => {
    const door = { rect: [1000, -125, 1800, 0], sill: 0, head: 1970 };
    expect(wallBoxes([0, 0, 4000, 10], [door], 2000)).toHaveLength(1);
    expect(wallBoxes([0, 0, 4000, 10], [door], 2000, { tolerance: 20 })).toHaveLength(3);
  });
});

describe('liningRects', () => {
  it('lines all four sides of a single rect', () => {
    expect(liningRects({ rects: [[0, 0, 100, 100]] }, 10)).toHaveLength(4);
  });

  it('skips the edge two rects of one room share', () => {
    const strips = liningRects({ rects: [[0, 0, 100, 100], [0, 100, 100, 200]] }, 10);
    expect(strips).toHaveLength(6);
    expect(strips).not.toContainEqual([0, 90, 100, 100]);
  });
});

describe('roofPolygons', () => {
  it('builds a hip roof with a ridge of the right height and length', () => {
    const { slopes, gables } = roofPolygons([0, 0, 10000, 6000], 45, 3000);
    expect(slopes).toHaveLength(4);
    expect(gables).toHaveLength(0);
    const ridge = slopes[0].filter((p) => p[1] > 3000);
    expect(ridge.map((p) => p[1])[0]).toBeCloseTo(6000);
    expect(Math.abs(ridge[0][0] - ridge[1][0])).toBeCloseTo(4000);
  });

  it('builds a gable roof along z with two end triangles', () => {
    const { slopes, gables } = roofPolygons([0, 0, 2000, 4000], 30, 0, { ridge: 'z', gable: true });
    expect(slopes).toHaveLength(2);
    expect(gables).toHaveLength(2);
    expect(gables[0].every((p) => p[2] === gables[0][0][2])).toBe(true);
  });

  it('winds every slope so its normal points up', () => {
    for (const ridge of ['x', 'z']) {
      for (const poly of roofPolygons([0, 0, 8000, 5000], 30, 0, { ridge }).slopes) {
        const [a, b, c] = poly.filter((p, i, all) => all.findIndex((q) => q.join() === p.join()) === i);
        const u = b.map((v, i) => v - a[i]);
        const w = c.map((v, i) => v - a[i]);
        const ny = u[2] * w[0] - u[0] * w[2];
        expect(ny).toBeGreaterThan(0);
      }
    }
  });
});

describe('planPosToModel', () => {
  it('maps plan fractions through the calibration', () => {
    expect(planPosToModel([0.5, 0.5], { width: 2000, height: 1000 }, { originPx: [500, 100], mmPerPx: 2 })).toEqual([1000, 800]);
  });
});

describe('walking', () => {
  const boxes = [
    { min: [0, 0, 0], max: [1000, 2600, 100] },
    { min: [0, 1970, 200], max: [1000, 2600, 300] },
  ];

  it('only low boxes block walking', () => {
    expect(blockingFootprints(boxes)).toEqual([[0, 0, 1000, 100]]);
  });

  it('slides along a wall instead of passing through', () => {
    const walls = blockingFootprints(boxes);
    expect(moveWithCollision([500, 500], [0, -500], 250, walls)).toEqual([500, 500]);
    expect(moveWithCollision([500, 500], [300, -500], 250, walls)).toEqual([800, 500]);
    expect(moveWithCollision([500, 500], [0, 100], 250, walls)).toEqual([500, 600]);
  });
});
