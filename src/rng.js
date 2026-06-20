// src/rng.js — contract A
// Seeded deterministic RNG (mulberry32). All randomness in the game flows
// through here so a serialized state reproduces identical playthroughs.

// makeRng(seed) -> function rng(): float in [0,1)
// The returned function carries its 32-bit state on `rng.state` so the
// engine can snapshot/restore it (see makeRngFromState below).
export function makeRng(seed) {
  // Normalize seed to a uint32.
  let a = (seed >>> 0) || 0x9e3779b9;
  const rng = function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    rng.state = a >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.state = a >>> 0;
  return rng;
}

// Restore an rng whose internal counter is exactly `state` (a uint32 from a
// previous rng.state). Lets engine serialize {rngState} and resume bit-exact.
export function makeRngFromState(state) {
  return makeRng((state >>> 0) - 0x6d2b79f5);
}

// Inclusive integer in [a,b].
export function randInt(rng, a, b) {
  if (b < a) {
    const tmp = a;
    a = b;
    b = tmp;
  }
  return a + Math.floor(rng() * (b - a + 1));
}

// Random element of arr (undefined for empty arrays).
export function pick(rng, arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

// Pure Fisher–Yates: returns a NEW shuffled array, leaving the input intact.
export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
