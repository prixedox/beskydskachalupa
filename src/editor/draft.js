import { validateTour } from '../tour-loader.js';

const key = (houseId) => `tour-edit:${houseId}`;

export function readDraft(storage, houseId) {
  try {
    const raw = storage.getItem(key(houseId));
    if (!raw) return null;
    return validateTour(JSON.parse(raw)).tour;
  } catch {
    return null;
  }
}

export function writeDraft(storage, houseId, tour) {
  try {
    storage.setItem(key(houseId), JSON.stringify(tour));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(storage, houseId) {
  try {
    storage.removeItem(key(houseId));
  } catch {
    // storage unavailable (private mode); nothing to clear
  }
}
