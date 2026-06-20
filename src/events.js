// src/events.js — contract v2 §2 (engine owner B)
// Campaign event system. Reads the DECLARATIVE event grammar from
// ./data/events.js and interprets it against the live State. At most one
// event fires per player turn, gated by a tunable chance + per-event
// eligibility + relative weight, honoring oncePerGame.
//
// Pure logic, no DOM. Deterministic: every random decision flows through the
// engine's state rng (engine.withRng). If ./data/events.js is absent or
// malformed the whole system degrades to a no-op so the game still runs.
//
// Integration: registerEvents() dynamically loads the data and registers a
// hook with the engine (engine.registerEvents). The engine's endTurn() calls
// that hook (maybeFireEvent) once per turn after the player's actions are
// resolved — mirroring how ai.js registers via engine.registerAi.

import {
  withRng,
  pushLog,
  ownedBy,
  applyEffects,
  registerEvents as engineRegisterEvents,
} from './engine.js';

// ---- tunable constants ----------------------------------------------------
const EV = {
  BASE_CHANCE: 0.5, // probability an eligible event fires on a given player turn
};

// Loaded event definitions (array). Empty until registerEvents() resolves.
let EVENTS = [];
let LOADED = false;

// ---------------------------------------------------------------------------
// Registration: load data, wire the engine hook. Async so callers (main.js,
// self-tests) can await the dynamic import before the first endTurn. Safe to
// call more than once. Never throws — on any failure the system stays a no-op.
// ---------------------------------------------------------------------------

export async function registerEvents() {
  // Hook the engine immediately so endTurn always finds maybeFireEvent (it
  // simply no-ops while EVENTS is empty).
  engineRegisterEvents({ maybeFireEvent, resolveEvent });
  try {
    const mod = await import('./data/events.js');
    const list = mod && (mod.EVENTS || mod.default);
    EVENTS = Array.isArray(list) ? list : [];
    LOADED = true;
  } catch (_e) {
    EVENTS = [];
    LOADED = false;
  }
  return EVENTS.length;
}

// ---------------------------------------------------------------------------
// Eligibility: interpret an event's declarative `trigger` gate against State
// for the player faction.
//   minTurn, maxTurn          — turn window (inclusive)
//   owns: 'any' | n           — player province count >= n ('any' => >= 1)
//   hasAdenaMin: n            — player adena >= n
//   factionAny: ['orc', ...]  — player faction is in the list
// An event already fired with oncePerGame is filtered out via state.eventsFired.
// ---------------------------------------------------------------------------

function isEligible(state, ev) {
  if (!ev || !ev.id) return false;
  const fired = state.eventsFired || {};
  if (ev.oncePerGame && fired[ev.id]) return false;

  const tr = ev.trigger || {};
  const turn = state.turn | 0;
  if (typeof tr.minTurn === 'number' && turn < tr.minTurn) return false;
  if (typeof tr.maxTurn === 'number' && turn > tr.maxTurn) return false;

  const player = state.playerFaction;
  const owned = ownedBy(state, player).length;

  if (tr.owns != null) {
    const need = tr.owns === 'any' ? 1 : tr.owns | 0;
    if (owned < need) return false;
  }
  if (typeof tr.hasAdenaMin === 'number') {
    const adena = state.factions[player] ? state.factions[player].adena : 0;
    if (adena < tr.hasAdenaMin) return false;
  }
  if (Array.isArray(tr.factionAny)) {
    if (!tr.factionAny.includes(player)) return false;
  }
  return true;
}

// Weighted pick over an eligible list using a single rng draw. Deterministic.
function weightedPick(rng, list) {
  let total = 0;
  for (const ev of list) total += Math.max(0, ev.weight != null ? ev.weight : 1);
  if (total <= 0) return list[0] || null;
  let r = rng() * total;
  for (const ev of list) {
    r -= Math.max(0, ev.weight != null ? ev.weight : 1);
    if (r < 0) return ev;
  }
  return list[list.length - 1] || null;
}

// ---------------------------------------------------------------------------
// maybeFireEvent(state) -> state
// Called once per player turn from endTurn. May set state.pendingEvent. Fires
// at most one event, subject to BASE_CHANCE and weighted eligibility. Honors
// oncePerGame by recording into state.eventsFired only when actually fired.
// ---------------------------------------------------------------------------

export function maybeFireEvent(state) {
  if (!state || state.phase === 'over') return state;
  if (state.pendingEvent) return state; // an event is already awaiting a choice
  if (!EVENTS.length) return state;

  const eligible = EVENTS.filter((ev) => isEligible(state, ev));
  if (eligible.length === 0) return state;

  // One rng draw for the "does an event fire" gate, one for the weighted pick.
  const decided = withRng(state, (rng) => {
    if (rng() >= EV.BASE_CHANCE) return null;
    return weightedPick(rng, eligible);
  });
  if (!decided) return state;

  if (!state.eventsFired) state.eventsFired = {};
  if (decided.oncePerGame) state.eventsFired[decided.id] = true;

  state.pendingEvent = {
    id: decided.id,
    titleKey: decided.titleKey,
    descKey: decided.descKey,
    choices: (decided.choices || []).map((c) => ({ id: c.id, labelKey: c.labelKey })),
  };
  pushLog(state, 'log.event', { id: decided.id });
  return state;
}

// ---------------------------------------------------------------------------
// resolveEvent(state, choiceId) -> state
// Apply the chosen choice's effects (to the PLAYER faction unless an effect
// names a target), clear state.pendingEvent, push a result log. If choiceId is
// unknown the pending event is cleared without effect (defensive).
// ---------------------------------------------------------------------------

export function resolveEvent(state, choiceId) {
  const pending = state.pendingEvent;
  if (!pending) return state;
  const ev = EVENTS.find((e) => e.id === pending.id);
  state.pendingEvent = null;
  if (!ev) return state;

  const choice = (ev.choices || []).find((c) => c.id === choiceId);
  if (!choice) {
    pushLog(state, 'log.eventResolved', { id: ev.id, choice: null });
    return state;
  }

  applyEffects(state, state.playerFaction, choice.effects || []);

  pushLog(state, 'log.eventResolved', {
    id: ev.id,
    choice: choice.id,
    resultKey: choice.resultKey || null,
  });
  return state;
}
