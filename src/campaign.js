// src/campaign.js — owner: feat/campaign (interfaces-v4 §4)
// Pure campaign logic: progression, scenario -> createGame config, objective
// evaluation, completion + reward. No DOM beyond a guarded localStorage. Imports
// only the campaign DATA (resilient to its absence). Deterministic.
//
// Public API (interfaces-v4 §4):
//   campaignList(state)            -> [{id,nameKey,descKey,locked,completed}]
//   startScenario(id)              -> createGame config { playerFaction, seed,
//                                       startOwnerOverride, objective }
//   checkObjective(state)          -> { done, won, failed }
//   completeScenario(state, id)    -> { completed, unlocked, reward } (and persists)
//
// Progress model (JSON-serializable):
//   { completed: { [scenarioId]: true }, unlocked: { [scenarioId]: true } }
// The FIRST scenario is always unlocked. Completing a scenario unlocks the next
// (per data unlocksNext + CAMPAIGN order). Progress is read from `state.campaign`
// when a state is supplied, else from localStorage (guarded for node).

import { CAMPAIGN, CAMPAIGN_ORDER, CROWN_CASTLES } from './data/campaign.js';

const STORAGE_KEY = 'l2toa.campaign.progress';

// ---------------------------------------------------------------------------
// Data access (resilient: empty campaign -> empty everything, never throws).
// ---------------------------------------------------------------------------
function scenarios() {
  return Array.isArray(CAMPAIGN) ? CAMPAIGN : [];
}
function order() {
  return Array.isArray(CAMPAIGN_ORDER) && CAMPAIGN_ORDER.length
    ? CAMPAIGN_ORDER
    : scenarios().map((s) => s.id);
}
function scenarioById(id) {
  return scenarios().find((s) => s && s.id === id) || null;
}
function firstId() {
  const o = order();
  return o.length ? o[0] : null;
}
function nextIdAfter(id) {
  const o = order();
  const i = o.indexOf(id);
  if (i < 0 || i + 1 >= o.length) return null;
  return o[i + 1];
}

// ---------------------------------------------------------------------------
// Persistence. Progress lives on `state.campaign` when a state is given; for the
// menu (no state) we fall back to localStorage, guarded for node/SSR.
// ---------------------------------------------------------------------------
function emptyProgress() {
  const p = { completed: {}, unlocked: {} };
  const f = firstId();
  if (f) p.unlocked[f] = true; // chapter 1 always available
  return p;
}

function normalizeProgress(raw) {
  const p = emptyProgress();
  if (raw && typeof raw === 'object') {
    if (raw.completed && typeof raw.completed === 'object') {
      for (const k in raw.completed) if (raw.completed[k]) p.completed[k] = true;
    }
    if (raw.unlocked && typeof raw.unlocked === 'object') {
      for (const k in raw.unlocked) if (raw.unlocked[k]) p.unlocked[k] = true;
    }
  }
  // Derive unlocks from completions so persisted data is always self-consistent:
  // any completed scenario whose data unlocksNext opens the following chapter.
  for (const s of scenarios()) {
    if (p.completed[s.id] && s.unlocksNext) {
      const nxt = nextIdAfter(s.id);
      if (nxt) p.unlocked[nxt] = true;
    }
  }
  return p;
}

function lsGet() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}
function lsSet(progress) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (_) { /* ignore */ }
}

// Read progress: prefer the live state, else localStorage, else fresh defaults.
function readProgress(state) {
  if (state && state.campaign && typeof state.campaign === 'object') {
    return normalizeProgress(state.campaign);
  }
  return normalizeProgress(lsGet());
}

// Write progress back to whichever store applies (state and/or localStorage).
function writeProgress(state, progress) {
  if (state && typeof state === 'object') state.campaign = progress;
  // Always mirror to localStorage so the menu (which may run without a state)
  // sees the latest progress.
  lsSet(progress);
}

// ---------------------------------------------------------------------------
// campaignList(state) -> [{id,nameKey,descKey,locked,completed}]
// ---------------------------------------------------------------------------
export function campaignList(state) {
  const p = readProgress(state);
  return scenarios().map((s) => ({
    id: s.id,
    nameKey: s.nameKey,
    descKey: s.descKey,
    objective: s.objective,           // extra (harmless) — useful for the UI
    reward: s.reward,                  // extra (harmless) — useful for the UI
    locked: !p.unlocked[s.id],
    completed: !!p.completed[s.id],
  }));
}

// ---------------------------------------------------------------------------
// startScenario(id) -> createGame config the engine consumes.
//   { playerFaction, seed, startOwnerOverride:{provId:faction}, objective }
// The objective is stored by the engine as state.campaignObjective; we tag it
// with the scenario id so completeScenario/checkObjective can correlate.
// ---------------------------------------------------------------------------
export function startScenario(id) {
  const s = scenarioById(id) || scenarios()[0];
  if (!s) return null;
  // Deterministic per-scenario seed (stable hash of the id) so a scenario always
  // generates the same starting battlefield.
  const seed = hashSeed(s.id);
  const objective = Object.assign({ scenarioId: s.id }, s.objective || {});
  return {
    playerFaction: s.playerFaction,
    seed,
    startOwnerOverride: Object.assign({}, s.startOwner || {}),
    objective,
  };
}

// ---------------------------------------------------------------------------
// checkObjective(state) -> { done, won, failed }
//   Evaluated against state.campaignObjective (set by createGame from the config
//   above). `done` is true once the scenario is decided either way.
//   A scenario is FAILED if the player faction has been eliminated (no provinces).
// ---------------------------------------------------------------------------
export function checkObjective(state) {
  const obj = state && state.campaignObjective;
  if (!obj || !obj.type) return { done: false, won: false, failed: false };

  const pf = state.playerFaction;
  // Universal fail: player wiped out (and the game isn't already a player win).
  const playerProvs = countProvinces(state, pf);
  const playerAlive = isAlive(state, pf) && playerProvs > 0;

  let won = false;
  switch (obj.type) {
    case 'holdCrowns': {
      const need = typeof obj.target === 'number' ? obj.target : CROWN_CASTLES.length;
      won = countCrowns(state, pf) >= need;
      break;
    }
    case 'captureProvince': {
      won = !!obj.target && ownerOf(state, obj.target) === pf;
      break;
    }
    case 'surviveTurns': {
      const need = typeof obj.turns === 'number' ? obj.turns : 0;
      won = playerAlive && curTurn(state) >= need;
      break;
    }
    case 'eliminate': {
      // Target enemy faction has no provinces left.
      won = !!obj.target && countProvinces(state, obj.target) === 0;
      break;
    }
    default:
      won = false;
  }

  // For surviveTurns the player being wiped before the turn count is the fail;
  // for the others, a wipe is also a fail. A win takes precedence over a fail.
  const failed = !won && !playerAlive;
  return { done: won || failed, won, failed };
}

// ---------------------------------------------------------------------------
// completeScenario(state, id) -> { completed, unlocked, reward }
//   Marks the scenario completed, unlocks the next chapter (per data), persists,
//   and returns the reward so the client can apply it via engine.applyReward.
// ---------------------------------------------------------------------------
export function completeScenario(state, id) {
  const s = scenarioById(id);
  const p = readProgress(state);
  if (!s) {
    return { completed: false, unlocked: null, reward: { adena: 0, wood: 0, crystal: 0 } };
  }
  p.completed[s.id] = true;
  let unlocked = null;
  if (s.unlocksNext) {
    unlocked = nextIdAfter(s.id);
    if (unlocked) p.unlocked[unlocked] = true;
  }
  writeProgress(state, p);
  const reward = Object.assign({ adena: 0, wood: 0, crystal: 0 }, s.reward || {});
  return { completed: true, unlocked, reward };
}

// ---------------------------------------------------------------------------
// Helpers (pure; tolerate partial/empty state).
// ---------------------------------------------------------------------------
function ownerOf(state, provId) {
  const p = state && state.provinces && state.provinces[provId];
  return p ? p.owner : null;
}
function countProvinces(state, faction) {
  const provs = state && state.provinces;
  if (!provs) return 0;
  let n = 0;
  for (const id in provs) if (provs[id] && provs[id].owner === faction) n++;
  return n;
}
function countCrowns(state, faction) {
  let n = 0;
  for (const id of CROWN_CASTLES) if (ownerOf(state, id) === faction) n++;
  return n;
}
function isAlive(state, faction) {
  const f = state && state.factions && state.factions[faction];
  if (!f) return false;
  return f.alive !== false;
}
function curTurn(state) {
  return state && typeof state.turn === 'number' ? state.turn : 0;
}

// Stable, deterministic 32-bit seed from a string id (FNV-1a-ish).
function hashSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h >>>= 0;
  return h || 1;
}
