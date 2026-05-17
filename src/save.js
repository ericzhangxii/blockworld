const SAVE_KEY = 'blockworld-save';
const NEXT_WORLD_KEY = 'blockworld-next-world-num';
export const SAVE_VERSION = 1;

export function nextDefaultWorldName() {
  const n = parseInt(localStorage.getItem(NEXT_WORLD_KEY) || '1', 10);
  localStorage.setItem(NEXT_WORLD_KEY, String(n + 1));
  return `New Game ${n}`;
}

export function hasSave() {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function writeSave(data) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function readSave() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}
