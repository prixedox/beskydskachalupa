// Pixel helpers for cutting flat, tileable texture patches out of photos.
// Images are { data: Float32Array, width, height } with 3 channels (RGB, 0..255).
// Panorama angles follow Photo Sphere Viewer: yaw 0 = image centre, positive yaw = right,
// pitch 0 = horizon, positive pitch = up. Angles are in radians.

export function toImage(buffer, width, height, channels) {
  const data = new Float32Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++) data[i * 3 + c] = buffer[i * channels + c];
  }
  return { data, width, height };
}

export function toBuffer(img) {
  return Buffer.from(Uint8ClampedArray.from(img.data, (v) => Math.round(v)));
}

export function equirectPixel(yaw, pitch, width, height) {
  const wrapped = ((yaw / (2 * Math.PI) + 0.5) % 1 + 1) % 1;
  return [wrapped * width, (0.5 - pitch / Math.PI) * height];
}

function sample(img, x, y, wrapX) {
  const { data, width, height } = img;
  const fx = x - 0.5;
  const fy = Math.min(Math.max(y - 0.5, 0), height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const cx = (v) => (wrapX ? ((v % width) + width) % width : Math.min(Math.max(v, 0), width - 1));
  const y1 = Math.min(y0 + 1, height - 1);
  const out = [0, 0, 0];
  for (const [xx, yy, w] of [
    [cx(x0), y0, (1 - tx) * (1 - ty)],
    [cx(x0 + 1), y0, tx * (1 - ty)],
    [cx(x0), y1, (1 - tx) * ty],
    [cx(x0 + 1), y1, tx * ty],
  ]) {
    const i = (yy * width + xx) * 3;
    out[0] += data[i] * w;
    out[1] += data[i + 1] * w;
    out[2] += data[i + 2] * w;
  }
  return out;
}

function render(size, dirAt, pano) {
  const out = { data: new Float32Array(size * size * 3), width: size, height: size };
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const [yaw, pitch] = dirAt(i, j);
      const [x, y] = equirectPixel(yaw, pitch, pano.width, pano.height);
      out.data.set(sample(pano, x, y, true), (j * size + i) * 3);
    }
  }
  return out;
}

// Top-down view of a square of floor `size` metres wide, centred `dist` metres from the
// camera in direction `yaw`. Top of the output is the far edge. `rotate` turns the square
// about its centre, e.g. to line floor planks up with the image axes.
export function floorPatch(pano, { yaw, dist, size, camHeight, px, rotate = 0 }) {
  const c = Math.cos(rotate);
  const s = Math.sin(rotate);
  return render(px, (i, j) => {
    const u = ((i + 0.5) / px - 0.5) * size;
    const v = (0.5 - (j + 0.5) / px) * size;
    const side = u * c - v * s;
    const ahead = dist + u * s + v * c;
    return [yaw + Math.atan2(side, ahead), -Math.atan2(camHeight, Math.hypot(side, ahead))];
  }, pano);
}

// Rectilinear (pinhole) view, as a normal camera would see it.
export function viewPatch(pano, { yaw, pitch, fov, px }) {
  const t = Math.tan(fov / 2);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return render(px, (i, j) => {
    const x = ((i + 0.5) / px * 2 - 1) * t;
    const y = (1 - (j + 0.5) / px * 2) * t;
    // Tilt the ray (x, y, 1) up by `pitch`, then measure its angles.
    const y2 = y * cp + sp;
    const z2 = -y * sp + cp;
    return [yaw + Math.atan2(x, z2), Math.atan2(y2, Math.hypot(x, z2))];
  }, pano);
}

export function crop(img, x, y, w, h) {
  const out = { data: new Float32Array(w * h * 3), width: w, height: h };
  for (let j = 0; j < h; j++) {
    out.data.set(img.data.subarray(((y + j) * img.width + x) * 3, ((y + j) * img.width + x + w) * 3), j * w * 3);
  }
  return out;
}

function boxBlurAxis(src, width, height, radius, horizontal) {
  const out = new Float32Array(src.length);
  const len = horizontal ? width : height;
  const lines = horizontal ? height : width;
  for (let line = 0; line < lines; line++) {
    const idx = (k) => (horizontal ? line * width + k : k * width + line) * 3;
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += src[idx(Math.min(Math.max(k, 0), len - 1)) + c];
      for (let k = 0; k < len; k++) {
        out[idx(k) + c] = sum / (2 * radius + 1);
        sum += src[idx(Math.min(k + radius + 1, len - 1)) + c] - src[idx(Math.max(k - radius, 0)) + c];
      }
    }
  }
  return out;
}

// Removes slow brightness gradients (vignetting, window light falloff) so tiles repeat
// without visible light/dark bands, keeping the patch's average colour.
export function flattenLighting(img, radius) {
  const { width, height } = img;
  let blur = img.data;
  for (let pass = 0; pass < 3; pass++) {
    blur = boxBlurAxis(blur, width, height, radius, true);
    blur = boxBlurAxis(blur, width, height, radius, false);
  }
  const mean = [0, 0, 0];
  for (let i = 0; i < img.data.length; i++) mean[i % 3] += img.data[i] / (width * height);
  const data = img.data.map((v, i) => Math.min(255, (v / Math.max(blur[i], 1)) * mean[i % 3]));
  return { data, width, height };
}

// Cross-fades `overlap` pixels of the right/bottom edge onto the left/top edge, so the
// result (overlap pixels smaller) repeats seamlessly.
export function makeTileable(img, overlap) {
  const blendAxis = (src, horizontal) => {
    const w = horizontal ? src.width - overlap : src.width;
    const h = horizontal ? src.height : src.height - overlap;
    const out = { data: new Float32Array(w * h * 3), width: w, height: h };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = horizontal ? x : y;
        const a = (y * src.width + x) * 3;
        const o = (y * w + x) * 3;
        if (k >= overlap) {
          out.data.set(src.data.subarray(a, a + 3), o);
          continue;
        }
        const t = k / overlap;
        const b = horizontal ? (y * src.width + x + w) * 3 : ((y + h) * src.width + x) * 3;
        for (let c = 0; c < 3; c++) out.data[o + c] = src.data[a + c] * t + src.data[b + c] * (1 - t);
      }
    }
    return out;
  };
  return blendAxis(blendAxis(img, true), false);
}

export function averageColor(img) {
  const sum = [0, 0, 0];
  for (let i = 0; i < img.data.length; i++) sum[i % 3] += img.data[i];
  const n = img.width * img.height;
  return '#' + sum.map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('');
}
