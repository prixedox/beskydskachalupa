import { describe, it, expect } from 'vitest';
import { equirectPixel, floorPatch, viewPatch, makeTileable, averageColor } from '../scripts/lib/equirect.mjs';

function image(width, height, fn) {
  const data = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(fn(x, y), (y * width + x) * 3);
  }
  return { data, width, height };
}

const px = (img, x, y) => Array.from(img.data.subarray((y * img.width + x) * 3, (y * img.width + x) * 3 + 3));

describe('equirectPixel', () => {
  it('maps yaw 0 / horizon to the image centre', () => {
    expect(equirectPixel(0, 0, 400, 200)).toEqual([200, 100]);
  });
  it('maps straight down to the bottom row and wraps yaw', () => {
    expect(equirectPixel(-Math.PI / 2, -Math.PI / 2, 400, 200)).toEqual([100, 200]);
    expect(equirectPixel(Math.PI * 1.5, 0, 400, 200)[0]).toBeCloseTo(100);
  });
});

describe('patches', () => {
  // Red = right half of the panorama (yaw > 0), blue = lower half (below horizon).
  const pano = image(400, 200, (x, y) => [x >= 200 ? 255 : 0, 0, y >= 100 ? 255 : 0]);

  it('floor patch looks below the horizon with the right side on the right', () => {
    const out = floorPatch(pano, { yaw: 0, dist: 1, size: 1, camHeight: 1.5, px: 8 });
    expect(px(out, 7, 4)).toEqual([255, 0, 255]);
    expect(px(out, 0, 4)).toEqual([0, 0, 255]);
  });

  it('view patch keeps up as up', () => {
    const out = viewPatch(pano, { yaw: 0.5, pitch: 0, fov: 0.6, px: 8 });
    expect(px(out, 4, 0)).toEqual([255, 0, 0]);
    expect(px(out, 4, 7)).toEqual([255, 0, 255]);
  });
});

describe('makeTileable', () => {
  it('shrinks by the overlap and wraps without a seam', () => {
    const src = image(20, 20, (x, y) => [x * 10, y * 10, 0]);
    const out = makeTileable(src, 4);
    expect([out.width, out.height]).toEqual([16, 16]);
    // The column after the last one wraps to column 0, which must continue the gradient.
    const last = px(out, 15, 8)[0];
    const first = px(out, 0, 8)[0];
    expect(Math.abs(first - (last + 10))).toBeLessThan(10);
  });
});

describe('averageColor', () => {
  it('returns a hex colour', () => {
    expect(averageColor(image(2, 1, () => [255, 128, 0]))).toBe('#ff8000');
  });
});
