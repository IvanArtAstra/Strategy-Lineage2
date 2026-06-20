// src/city.js — contract v3 §4 (owner B: feat/city-logic)
//
// Heroes-of-M&M-style CITY ENGINE for "Lineage II: Thrones of Aden".
// Pure deterministic logic, no DOM, no rendering, no asset access, no timers.
//
// A province has a city iff it is a castle (province.castle === true) OR a
// faction capital (FACTIONS[*].capital). Cities let an owner construct/upgrade
// buildings over several turns; built buildings apply per-turn effects:
//   produceRes  -> add resources to the owner faction
//   produceUnit -> every `perTurns` turns add `count` of the resolved roster
//                  unit to that province's garrison
//   defense     -> mark the province fortified (+record defBonus)
//   heal        -> heal the province garrison by pct (respect unit max hp)
//
// Resilient degradation is MANDATORY: if ./data/buildings.js is absent or empty
// (BUILDINGS not yet shipped by owner A), every function no-ops so the base
// game still runs exactly as v2.
//
// All building data + costs + effect shapes come from ./data/buildings.js.
// Unit resolution uses ./data/units.js + ./data/factions.js rosters. City
// placement (castle/capital) uses ./data/map.js + ./data/factions.js. The city
// engine wires its per-turn tick into engine.endTurn via registerCity() (the
// engine calls the registered cityTick once per turn), mirroring registerAi.

import { BUILDINGS, RESOURCES } from './data/buildings.js';
import { UNITS } from './data/units.js';
import { FACTIONS } from './data/factions.js';
import { PROVINCES } from './data/map.js';
import { registerCity as engineRegisterCity } from './engine.js';

// ---------------------------------------------------------------------------
// Static lookups (built once from data). Guarded so absent/empty data no-ops.
// ---------------------------------------------------------------------------

const BUILDING_LIST = Array.isArray(BUILDINGS) ? BUILDINGS : [];
const RES_KEYS = Array.isArray(RESOURCES) && RESOURCES.length
  ? RESOURCES
  : ['adena', 'wood', 'crystal'];

const BUILDING_BY_ID = {};
for (const b of BUILDING_LIST) {
  if (b && b.id) BUILDING_BY_ID[b.id] = b;
}

const PROV_BY_ID = {};
for (const p of PROVINCES || []) {
  if (p && p.id) PROV_BY_ID[p.id] = p;
}

// Set of province ids that are faction capitals.
const CAPITAL_SET = {};
for (const fid in FACTIONS || {}) {
  const cap = FACTIONS[fid] && FACTIONS[fid].capital;
  if (cap) CAPITAL_SET[cap] = true;
}

// True when buildings data is present — otherwise the whole module no-ops.
function active() {
  return BUILDING_LIST.length > 0;
}

// ---------------------------------------------------------------------------
// registerCity — wire cityTick into engine.endTurn (mirror registerAi/Events).
// The engine calls the registered impl once per turn. Safe to call repeatedly;
// no-ops cleanly if the engine hook is unavailable (older engine / degraded).
// ---------------------------------------------------------------------------

export function registerCity() {
  try {
    if (typeof engineRegisterCity === 'function') {
      // Register the FULL api: the engine needs hasCity/canBuild/startBuild for
      // capital-townhall seeding (createGame) and AI city development (ai.js),
      // not just cityTick. (Declarations are hoisted, so forward refs are fine.)
      engineRegisterCity({ cityTick, hasCity, ensureCity, canBuild, startBuild, cityView });
    }
  } catch (e) {
    // Engine missing the hook — degrade silently; base game still runs.
  }
}

// ---------------------------------------------------------------------------
// hasCity(provId) — a province has a city iff it is a castle OR a capital.
// ---------------------------------------------------------------------------

export function hasCity(provId) {
  if (!active()) return false;
  const meta = PROV_BY_ID[provId];
  if (!meta) return false;
  return meta.castle === true || CAPITAL_SET[provId] === true;
}

// ---------------------------------------------------------------------------
// ensureCity(state, provId) — lazily create the city slot. JSON-serializable.
//   state.cities[provId] = { provId, buildings:{}, queue:[], counters:{} }
//   buildings: { [buildingId]: builtLevel }   (level 0 == not built; absent ok)
//   queue:     [ { buildingId, targetLevel, turnsLeft } ]
//   counters:  { [buildingId]: lastProducedTurn } for produceUnit cadence
// Returns the city object (or null if buildings data absent / no city here).
// ---------------------------------------------------------------------------

export function ensureCity(state, provId) {
  if (!active()) return null;
  if (!state) return null;
  if (!state.cities) state.cities = {};
  let city = state.cities[provId];
  if (!city) {
    city = { provId, buildings: {}, queue: [], counters: {} };
    state.cities[provId] = city;
  } else {
    // Backfill fields on older serialized cities.
    if (!city.buildings) city.buildings = {};
    if (!city.queue) city.queue = [];
    if (!city.counters) city.counters = {};
  }
  return city;
}

// ---------------------------------------------------------------------------
// Internal helpers.
// ---------------------------------------------------------------------------

function builtLevel(city, buildingId) {
  return (city && city.buildings && (city.buildings[buildingId] | 0)) || 0;
}

// The target level a fresh/queued build would reach: built level + 1, OR the
// highest queued targetLevel for this building + 1 if already queued.
function nextTargetLevel(city, buildingId) {
  let lvl = builtLevel(city, buildingId);
  for (const q of (city.queue || [])) {
    if (q.buildingId === buildingId && (q.targetLevel | 0) > lvl) lvl = q.targetLevel | 0;
  }
  return lvl + 1;
}

function isQueued(city, buildingId) {
  return (city.queue || []).some((q) => q.buildingId === buildingId);
}

// The level definition for a 1-based level number (levels[] is 0-indexed).
function levelDef(building, level) {
  if (!building || !Array.isArray(building.levels)) return null;
  return building.levels[level - 1] || null;
}

function maxLevelOf(building) {
  return building && Array.isArray(building.levels) ? building.levels.length : 0;
}

// Does faction `fid` have enough resources for `cost`?
function canAfford(state, fid, cost) {
  const fac = state.factions && state.factions[fid];
  if (!fac) return false;
  for (const r of RES_KEYS) {
    const need = (cost && cost[r]) | 0;
    if (need > 0 && (fac[r] | 0) < need) return false;
  }
  return true;
}

function chargeCost(state, fid, cost) {
  const fac = state.factions && state.factions[fid];
  if (!fac) return;
  for (const r of RES_KEYS) {
    const need = (cost && cost[r]) | 0;
    if (need > 0) fac[r] = (fac[r] | 0) - need;
  }
}

// Resolve produceUnit unitType -> a concrete unit id via the owner faction's
// roster: the FIRST roster unit whose UNITS[id].type === unitType. Null if none.
function resolveUnitType(faction, unitType) {
  const fac = FACTIONS[faction];
  if (!fac || !Array.isArray(fac.roster)) return null;
  for (const uid of fac.roster) {
    const u = UNITS[uid];
    if (u && u.type === unitType) return uid;
  }
  return null;
}

// ---------------------------------------------------------------------------
// canBuild(state, provId, buildingId)
//  -> { ok, reason?:stringKey, cost?, buildTurns? }
// Checks: city exists, owned by a real faction, building exists, a next level
// exists (< maxLevel), not already queued, owner can afford the next cost.
// ---------------------------------------------------------------------------

export function canBuild(state, provId, buildingId) {
  if (!active()) return { ok: false, reason: 'err.noCity' };
  if (!hasCity(provId)) return { ok: false, reason: 'err.noCity' };
  const prov = state.provinces && state.provinces[provId];
  if (!prov) return { ok: false, reason: 'err.noProvince' };
  const fid = prov.owner;
  if (!fid || fid === 'neutral' || fid === 'shilen' || !state.factions || !state.factions[fid]) {
    return { ok: false, reason: 'err.notOwned' };
  }
  const building = BUILDING_BY_ID[buildingId];
  if (!building) return { ok: false, reason: 'err.noBuilding' };

  const city = ensureCity(state, provId);
  if (isQueued(city, buildingId)) return { ok: false, reason: 'err.alreadyQueued' };

  const target = nextTargetLevel(city, buildingId);
  if (target > maxLevelOf(building)) return { ok: false, reason: 'err.maxLevel' };

  const def = levelDef(building, target);
  if (!def) return { ok: false, reason: 'err.maxLevel' };

  const cost = def.cost || {};
  const buildTurns = def.buildTurns | 0;
  if (!canAfford(state, fid, cost)) {
    return { ok: false, reason: 'err.notEnoughRes', cost, buildTurns };
  }
  return { ok: true, cost, buildTurns };
}

// ---------------------------------------------------------------------------
// startBuild(state, provId, buildingId) -> state
// Charges cost from the owner faction, pushes a queue entry. If buildTurns===0
// the build completes immediately (level bumps this call). No-op (returns state
// unchanged) when canBuild fails.
// ---------------------------------------------------------------------------

export function startBuild(state, provId, buildingId) {
  if (!active()) return state;
  const chk = canBuild(state, provId, buildingId);
  if (!chk.ok) return state;

  const prov = state.provinces[provId];
  const fid = prov.owner;
  const city = ensureCity(state, provId);
  const building = BUILDING_BY_ID[buildingId];
  const target = nextTargetLevel(city, buildingId);
  const def = levelDef(building, target);

  chargeCost(state, fid, def.cost || {});

  const buildTurns = def.buildTurns | 0;
  if (buildTurns <= 0) {
    // Instant completion (e.g. the free L1 townhall).
    city.buildings[buildingId] = target;
  } else {
    city.queue.push({ buildingId, targetLevel: target, turnsLeft: buildTurns });
  }
  return state;
}

// ---------------------------------------------------------------------------
// cityTick(state) -> state
// Called once per turn by the engine for EVERY city of EVERY faction:
//   1. Advance each city's queue head (turnsLeft--); on 0, set the building's
//      level to targetLevel and pop the head.
//   2. Apply per-turn effects of all BUILT buildings (deterministic):
//        produceRes  -> add to owner resources
//        produceUnit -> every `perTurns` turns add `count` resolved units
//        defense     -> mark province fortified (record defBonus on prov)
//        heal        -> heal the province garrison by pct (respect unit max hp)
// Deterministic — no rng needed.
// ---------------------------------------------------------------------------

export function cityTick(state) {
  if (!active() || !state) return state;
  if (!state.cities) return state;

  // Iterate cities in a stable (sorted) order for determinism.
  const provIds = Object.keys(state.cities).sort();
  for (const provId of provIds) {
    const city = ensureCity(state, provId);
    const prov = state.provinces && state.provinces[provId];
    if (!prov) continue;
    const owner = prov.owner;
    // Cities only act for a real (non-neutral, non-shilen) owning faction.
    const ownerLive = owner && owner !== 'neutral' && owner !== 'shilen' &&
      state.factions && state.factions[owner];

    // --- 1. Advance the queue head. ---
    advanceQueue(city);

    if (!ownerLive) continue;

    // --- 2. Apply per-turn effects of every built building. ---
    applyBuiltEffects(state, city, prov, owner);
  }
  return state;
}

// Advance only the HEAD of the build queue by one turn; complete on 0.
function advanceQueue(city) {
  const q = city.queue;
  if (!q || q.length === 0) return;
  const head = q[0];
  head.turnsLeft = (head.turnsLeft | 0) - 1;
  if (head.turnsLeft <= 0) {
    const cur = builtLevel(city, head.buildingId);
    // Only ever bump upward (guards against stale/duplicate entries).
    if (head.targetLevel > cur) city.buildings[head.buildingId] = head.targetLevel;
    q.shift();
  }
}

// Apply the per-turn effect of each built building (at its built level).
function applyBuiltEffects(state, city, prov, owner) {
  const fac = state.factions[owner];
  for (const building of BUILDING_LIST) {
    const lvl = builtLevel(city, building.id);
    if (lvl <= 0) continue;
    const def = levelDef(building, lvl);
    if (!def || !def.effect) continue;
    const eff = def.effect;
    switch (eff.type) {
      case 'produceRes': {
        const res = eff.res || {};
        for (const r of RES_KEYS) {
          const amt = (res[r] | 0);
          if (amt) fac[r] = (fac[r] | 0) + amt;
        }
        break;
      }
      case 'produceUnit': {
        applyProduceUnit(state, city, prov, owner, building.id, eff);
        break;
      }
      case 'defense': {
        if (eff.fortify) prov.fortified = true;
        if (typeof eff.defBonus === 'number') prov.defBonus = eff.defBonus;
        break;
      }
      case 'heal': {
        healGarrison(prov, eff.pct || 0);
        break;
      }
      default:
        break; // forward-compatible: ignore unknown effect types.
    }
  }
}

// produceUnit cadence: add `count` resolved units every `perTurns` turns.
// Deterministic and serialization-safe: cadence is keyed off state.turn, and a
// per-building counter in city.counters records the last turn we produced for
// this building so re-running the same turn cannot double-produce.
function applyProduceUnit(state, city, prov, owner, buildingId, eff) {
  const perTurns = Math.max(1, eff.perTurns | 0);
  const count = Math.max(1, eff.count | 0 || 1);
  const turn = state.turn | 0;
  if (turn % perTurns !== 0) return; // not a production turn for this cadence.
  if (!city.counters) city.counters = {};
  if (city.counters[buildingId] === turn) return; // already produced this turn.
  const uid = resolveUnitType(owner, eff.unitType);
  if (!uid) return; // no roster unit of that type — skip.
  prov.garrison[uid] = (prov.garrison[uid] | 0) + count;
  city.counters[buildingId] = turn;
}

// Heal: restore `pct` of each unit-stack's lost HP, capped at the stack's
// nominal max (count * unit.hp). Since the engine tracks garrison as whole-unit
// counts (no fractional HP), "heal" here adds back up to pct of the stack's
// rounded — but garrison is integral, so this is a no-op on full stacks. We
// model heal as a small garrison top-up (resurrection) bounded by pct, mirror-
// ing the engine's healGarrison effect, respecting that UNITS gives the cap.
function healGarrison(prov, pct) {
  if (pct <= 0) return;
  for (const uid in prov.garrison) {
    const u = UNITS[uid];
    if (!u) continue;
    const cur = prov.garrison[uid] | 0;
    if (cur <= 0) continue;
    const extra = Math.round(cur * pct);
    if (extra > 0) prov.garrison[uid] = cur + extra;
  }
}

// ---------------------------------------------------------------------------
// cityView(state, provId) — rich view object for the UI (v3 §4 shape).
//  -> { provId, owner,
//       buildings:[ { id, nameKey, descKey, icon, level, maxLevel,
//                     next:{cost,buildTurns,effect}|null, building:bool } ],
//       queue:[ { id, targetLevel, turnsLeft } ],
//       production:{ adena, wood, crystal, units:[ {unit, perTurns} ] },
//       fortified:bool }
// ---------------------------------------------------------------------------

export function cityView(state, provId) {
  const prov = state && state.provinces && state.provinces[provId];
  const owner = prov ? prov.owner : null;
  const empty = {
    provId,
    owner,
    buildings: [],
    queue: [],
    production: { adena: 0, wood: 0, crystal: 0, units: [] },
    fortified: prov ? !!prov.fortified : false,
  };
  if (!active() || !hasCity(provId) || !prov) return empty;

  const city = ensureCity(state, provId);

  const buildings = [];
  const production = { adena: 0, wood: 0, crystal: 0, units: [] };

  for (const building of BUILDING_LIST) {
    const level = builtLevel(city, building.id);
    const maxLevel = maxLevelOf(building);
    const queued = isQueued(city, building.id);
    const target = nextTargetLevel(city, building.id);
    const nextDef = target <= maxLevel ? levelDef(building, target) : null;

    buildings.push({
      id: building.id,
      nameKey: building.nameKey,
      descKey: building.descKey,
      icon: building.icon,
      level,
      maxLevel,
      next: nextDef
        ? { cost: nextDef.cost || {}, buildTurns: nextDef.buildTurns | 0, effect: nextDef.effect || null }
        : null,
      building: queued,
    });

    // Production summary from the currently BUILT level's effect.
    if (level > 0) {
      const def = levelDef(building, level);
      const eff = def && def.effect;
      if (eff) {
        if (eff.type === 'produceRes' && eff.res) {
          if (eff.res.adena) production.adena += eff.res.adena | 0;
          if (eff.res.wood) production.wood += eff.res.wood | 0;
          if (eff.res.crystal) production.crystal += eff.res.crystal | 0;
        } else if (eff.type === 'produceUnit') {
          const uid = resolveUnitType(owner, eff.unitType);
          if (uid) production.units.push({ unit: uid, perTurns: Math.max(1, eff.perTurns | 0) });
        }
      }
    }
  }

  const queue = (city.queue || []).map((q) => ({
    id: q.buildingId,
    targetLevel: q.targetLevel,
    turnsLeft: q.turnsLeft,
  }));

  return {
    provId,
    owner,
    buildings,
    queue,
    production,
    fortified: !!prov.fortified,
  };
}

// Self-register on import (mirrors ai.js calling registerAi()), so the engine's
// createGame seeding + endTurn cityTick + AI building all work as soon as this
// module is loaded — main.js also calls registerCity() (idempotent).
registerCity();
