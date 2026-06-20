// src/engine.js — contract E
// Pure turn-based engine: economy, recruiting, movement/siege, fortify,
// end-of-turn AI + Shilen incursions, victory checks, view model.
//
// No DOM, no rendering, no asset access, no timers, no network. Every
// significant action pushes a log entry { turn, key, params } (UI localizes
// the key). All randomness goes through rng.js, seeded from State.rngState,
// so a serialized game reproduces bit-for-bit.

import { UNITS } from './data/units.js';
import { FACTIONS, PLAYABLE } from './data/factions.js';
import { PROVINCES, START_OWNER, NEUTRAL } from './data/map.js';
import { makeRngFromState, randInt, pick, shuffle } from './rng.js';
import { resolveBattle } from './combat.js';
// ai.js is imported lazily inside endTurn to avoid a cyclic import at module
// init (ai.js imports this engine's helpers).

// ---- tunable balance constants -------------------------------------------
export const CONST = {
  STARTING_ADENA: 300,
  PROVINCE_INCOME: 40, // base Adena per owned province per turn
  CASTLE_INCOME: 90, // crown/regional castle income per turn
  TERRAIN_INCOME: {
    plains: 1.0,
    coast: 1.1, // trade ports
    forest: 0.9,
    swamp: 0.8,
    mountain: 0.85,
  },
  FORTIFY_COST: 80, // Adena to fortify a province
  MIN_UPKEEP_FLOOR: 0, // adena can't go negative; bankruptcy disbands units
  CROWN_CASTLES: ['gludio', 'giran', 'aden'],
  STARTING_GARRISON: 6, // each owned home province starts with this many units
  STARTING_WOOD: 20, // v3 multi-resource economy: starting wood per faction
  STARTING_CRYSTAL: 5, // v3 multi-resource economy: starting crystal per faction
};

// ---------------------------------------------------------------------------
// State construction
// ---------------------------------------------------------------------------

export function createGame({ playerFaction, seed }) {
  const pf = PLAYABLE.includes(playerFaction) ? playerFaction : PLAYABLE[0];
  const s = (seed >>> 0) || 1;

  const factions = {};
  for (const id in FACTIONS) {
    // Multi-resource economy (v3): every non-shilen faction also holds wood +
    // crystal. Adena is unchanged. Shilen (AI-only) carries no economy.
    factions[id] = {
      id,
      adena: id === 'shilen' ? 0 : CONST.STARTING_ADENA,
      wood: id === 'shilen' ? 0 : CONST.STARTING_WOOD,
      crystal: id === 'shilen' ? 0 : CONST.STARTING_CRYSTAL,
      alive: true,
    };
  }

  const provinces = {};
  for (const p of PROVINCES) {
    const owner = (START_OWNER && START_OWNER[p.id]) || NEUTRAL;
    provinces[p.id] = { id: p.id, owner, garrison: {}, fortified: false };
  }

  // Seed each non-neutral owner's home with a small garrison so the game has
  // pieces in play from turn 1.
  for (const id in provinces) {
    const owner = provinces[id].owner;
    if (owner === NEUTRAL || !FACTIONS[owner]) continue;
    const basic = basicUnitFor(owner);
    if (basic) provinces[id].garrison[basic] = CONST.STARTING_GARRISON;
  }
  // Neutral provinces get a light defensive garrison so early expansion costs
  // something. Use a generic militia unit (gladiator if present, else the first
  // non-shilen unit) so this stays valid across content packs.
  const neutralUnit = UNITS.gladiator
    ? 'gladiator'
    : Object.keys(UNITS).find((uid) => !(UNITS[uid].factions || []).includes('shilen'));
  if (neutralUnit) {
    for (const p of PROVINCES) {
      if (provinces[p.id].owner === NEUTRAL) {
        provinces[p.id].garrison = { [neutralUnit]: p.castle ? 3 : 2 };
      }
    }
  }

  const state = {
    seed: s,
    rngState: s, // mulberry32 counter; advanced as rng is consumed
    turn: 1,
    phase: 'play',
    activeFaction: pf,
    playerFaction: pf,
    factions,
    provinces,
    cities: {}, // v3: lazily populated city state (owner B's city.js)
    flags: {}, // v3: event-chain flags (setFlag effect / requiresFlag gates)
    selected: null,
    log: [],
    result: null,
  };

  // v3: if a city api is registered, give each faction's capital a free
  // level-1 townhall so cities start meaningful. Degrade silently if the city
  // system is absent (CITY_IMPL null) — the game still plays exactly like v2.
  seedCapitalTownhalls(state);

  pushLog(state, 'log.gameStart', { faction: pf, seed: s });
  return state;
}

// Give every non-shilen faction's owned capital a free level-1 townhall via the
// registered city api. No-op when no city api is registered, when buildings
// data is absent, or when a capital isn't actually owned by its faction.
function seedCapitalTownhalls(state) {
  if (!CITY_IMPL || typeof CITY_IMPL.startBuild !== 'function') return;
  const hasCity = CITY_IMPL.hasCity;
  for (const fid in FACTIONS) {
    if (fid === 'shilen') continue;
    const capId = FACTIONS[fid].capital;
    if (!capId) continue;
    const prov = state.provinces[capId];
    if (!prov || prov.owner !== fid) continue;
    if (typeof hasCity === 'function' && !hasCity(capId)) continue;
    try {
      // A level-1 townhall has buildTurns 0 in the contract data, so startBuild
      // finishes it immediately. Guarded so any city-api hiccup can't break setup.
      if (typeof CITY_IMPL.canBuild === 'function') {
        const chk = CITY_IMPL.canBuild(state, capId, 'townhall');
        if (!chk || !chk.ok) continue;
      }
      CITY_IMPL.startBuild(state, capId, 'townhall');
    } catch (_e) {
      /* resilient: a failed seed must never break createGame */
    }
  }
}

// Cheapest infantry unit a faction can field (for starting/neutral garrisons).
function basicUnitFor(factionId) {
  const fac = FACTIONS[factionId];
  if (!fac || !fac.roster) return null;
  let best = null;
  for (const uid of fac.roster) {
    const u = UNITS[uid];
    if (!u) continue;
    if (!best || u.cost < UNITS[best].cost) best = uid;
  }
  return best;
}

// ---------------------------------------------------------------------------
// RNG threading: borrow an rng from state, run fn, write the advanced counter
// back into state.rngState. Keeps determinism across serialization.
// ---------------------------------------------------------------------------

export function withRng(state, fn) {
  const rng = makeRngFromState(state.rngState);
  const out = fn(rng);
  state.rngState = rng.state >>> 0;
  return out;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export function pushLog(state, key, params) {
  state.log.push({ turn: state.turn, key, params: params || {} });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROV_BY_ID = {};
for (const p of PROVINCES) PROV_BY_ID[p.id] = p;

export function provinceMeta(id) {
  return PROV_BY_ID[id];
}

export function ownedBy(state, factionId) {
  const out = [];
  for (const id in state.provinces) {
    if (state.provinces[id].owner === factionId) out.push(id);
  }
  return out;
}

export function garrisonSize(garrison) {
  let n = 0;
  for (const id in garrison) n += garrison[id] | 0;
  return n;
}

export function totalUpkeep(state, factionId) {
  let up = 0;
  for (const id in state.provinces) {
    const prov = state.provinces[id];
    if (prov.owner !== factionId) continue;
    for (const uid in prov.garrison) {
      const u = UNITS[uid];
      if (u) up += u.upkeep * (prov.garrison[uid] | 0);
    }
  }
  return up;
}

function unitCostFor(factionId, unitId) {
  const u = UNITS[unitId];
  if (!u) return Infinity;
  const fac = FACTIONS[factionId];
  const mul = (fac && fac.costMul) || 1;
  return Math.round(u.cost * mul);
}

// ---------------------------------------------------------------------------
// Income (per faction, returns the same state mutated). Castles richer.
// Upkeep is the sink; bankrupt factions auto-disband units.
// ---------------------------------------------------------------------------

export function income(state) {
  for (const fid in state.factions) {
    if (fid === 'shilen') continue;
    const fac = state.factions[fid];
    if (!fac.alive) continue;
    let gross = 0;
    for (const id of ownedBy(state, fid)) {
      gross += provinceIncome(id);
    }
    const incomeMul = (FACTIONS[fid] && FACTIONS[fid].incomeMul) || 1;
    gross = Math.round(gross * incomeMul);
    // Temporary income blessing (from events/skills): multiply gross while
    // active, then tick its remaining turns down.
    const bless = fac.blessIncome;
    if (bless && (bless.turns | 0) > 0) {
      gross = Math.round(gross * (bless.mult || 1));
      bless.turns = (bless.turns | 0) - 1;
      if (bless.turns <= 0) fac.blessIncome = null;
    }
    const upkeep = totalUpkeep(state, fid);
    const net = gross - upkeep;
    fac.adena += net;
    if (fid === state.playerFaction) {
      pushLog(state, 'log.income', { faction: fid, gross, upkeep, net });
    }
    if (fac.adena < 0) {
      // Bankruptcy: disband cheapest-upkeep units until solvent.
      handleBankruptcy(state, fid);
    }
  }
  return state;
}

function provinceIncome(provId) {
  const meta = PROV_BY_ID[provId];
  const base = meta && meta.castle ? CONST.CASTLE_INCOME : CONST.PROVINCE_INCOME;
  const tMul = (meta && CONST.TERRAIN_INCOME[meta.terrain]) || 1;
  return Math.round(base * tMul);
}

function handleBankruptcy(state, factionId) {
  const fac = state.factions[factionId];
  // Gather all units of this faction with their upkeep, disband highest-upkeep
  // first until adena >= 0.
  while (fac.adena < 0) {
    let target = null; // {provId, unitId, upkeep}
    for (const id in state.provinces) {
      const prov = state.provinces[id];
      if (prov.owner !== factionId) continue;
      for (const uid in prov.garrison) {
        if ((prov.garrison[uid] | 0) <= 0) continue;
        const u = UNITS[uid];
        if (!u) continue;
        if (!target || u.upkeep > target.upkeep) {
          target = { provId: id, unitId: uid, upkeep: u.upkeep };
        }
      }
    }
    if (!target) break; // nothing left to disband
    const g = state.provinces[target.provId].garrison;
    g[target.unitId] -= 1;
    if (g[target.unitId] <= 0) delete g[target.unitId];
    fac.adena += target.upkeep; // upkeep relief next turn approximated immediately
    pushLog(state, 'log.disband', { faction: factionId, unit: target.unitId });
  }
  if (fac.adena < 0) fac.adena = 0;
}

// ---------------------------------------------------------------------------
// Recruiting
// ---------------------------------------------------------------------------

export function canRecruit(state, provId, unitId) {
  const prov = state.provinces[provId];
  if (!prov) return { ok: false, reason: 'err.noProvince' };
  const fid = prov.owner;
  if (fid === NEUTRAL || fid === 'shilen') return { ok: false, reason: 'err.notOwned' };
  const u = UNITS[unitId];
  if (!u) return { ok: false, reason: 'err.noUnit' };
  const fac = FACTIONS[fid];
  if (!fac || !fac.roster || !fac.roster.includes(unitId)) {
    return { ok: false, reason: 'err.notInRoster' };
  }
  const cost = unitCostFor(fid, unitId);
  if (state.factions[fid].adena < cost) return { ok: false, reason: 'err.notEnoughAdena' };
  return { ok: true, cost };
}

export function recruit(state, provId, unitId, n = 1) {
  for (let i = 0; i < n; i++) {
    const chk = canRecruit(state, provId, unitId);
    if (!chk.ok) {
      if (i === 0) pushLog(state, 'log.recruitFail', { unit: unitId, reason: chk.reason });
      break;
    }
    const prov = state.provinces[provId];
    const fid = prov.owner;
    state.factions[fid].adena -= chk.cost;
    prov.garrison[unitId] = (prov.garrison[unitId] | 0) + 1;
    pushLog(state, 'log.recruit', { faction: fid, unit: unitId, prov: provId, cost: chk.cost });
  }
  return state;
}

// ---------------------------------------------------------------------------
// Movement / sieges
// ---------------------------------------------------------------------------

export function legalMoves(state, provId) {
  const meta = PROV_BY_ID[provId];
  if (!meta) return [];
  return (meta.neighbors || []).filter((n) => state.provinces[n]);
}

// units = { unitId:count } subset of from's garrison to move.
// Friendly target -> reinforce. Enemy/neutral -> battle.
// Returns { state, battle?:BattleResult }.
export function moveArmy(state, fromId, toId, units) {
  const from = state.provinces[fromId];
  const to = state.provinces[toId];
  if (!from || !to) return { state };
  if (!legalMoves(state, fromId).includes(toId)) return { state };

  // Validate & extract the moving force.
  const moving = {};
  for (const uid in units) {
    const want = units[uid] | 0;
    const have = from.garrison[uid] | 0;
    const take = Math.min(want, have);
    if (take > 0) moving[uid] = take;
  }
  if (garrisonSize(moving) === 0) return { state };

  // Remove from source.
  for (const uid in moving) {
    from.garrison[uid] -= moving[uid];
    if (from.garrison[uid] <= 0) delete from.garrison[uid];
  }

  const mover = from.owner;

  if (to.owner === mover) {
    // Reinforce.
    for (const uid in moving) to.garrison[uid] = (to.garrison[uid] | 0) + moving[uid];
    pushLog(state, 'log.move', { faction: mover, from: fromId, to: toId, count: garrisonSize(moving) });
    return { state };
  }

  // Battle (enemy or neutral).
  const meta = PROV_BY_ID[toId];
  const battle = withRng(state, (rng) =>
    resolveBattle({
      attacker: { faction: mover, garrison: moving },
      defender: { faction: to.owner, garrison: Object.assign({}, to.garrison) },
      terrain: meta ? meta.terrain : 'plains',
      defenderFortified: !!to.fortified,
      rng,
    })
  );

  // Bubble battle log into state log.
  for (const entry of battle.log) pushLog(state, 'log.' + entry.key, entry.params);

  if (battle.winner === 'attacker') {
    const prevOwner = to.owner;
    to.owner = mover;
    to.garrison = Object.assign({}, battle.attackerSurvivors);
    to.fortified = false; // walls fall on capture
    pushLog(state, 'log.capture', { faction: mover, from: prevOwner, prov: toId });
  } else {
    // Defender holds; survivors remain. Attacker's force is lost (or remnants
    // retreat back to source).
    to.garrison = Object.assign({}, battle.defenderSurvivors);
    const remnants = battle.attackerSurvivors;
    for (const uid in remnants) {
      from.garrison[uid] = (from.garrison[uid] | 0) + (remnants[uid] | 0);
    }
    pushLog(state, 'log.repelled', { faction: to.owner, attacker: mover, prov: toId });
  }

  refreshAlive(state);
  return { state, battle };
}

// ---------------------------------------------------------------------------
// Fortify
// ---------------------------------------------------------------------------

export function fortify(state, provId) {
  const prov = state.provinces[provId];
  if (!prov) return state;
  const fid = prov.owner;
  if (fid === NEUTRAL || fid === 'shilen') return state;
  if (prov.fortified) {
    pushLog(state, 'log.fortifyFail', { prov: provId, reason: 'err.alreadyFortified' });
    return state;
  }
  if (state.factions[fid].adena < CONST.FORTIFY_COST) {
    pushLog(state, 'log.fortifyFail', { prov: provId, reason: 'err.notEnoughAdena' });
    return state;
  }
  state.factions[fid].adena -= CONST.FORTIFY_COST;
  prov.fortified = true;
  pushLog(state, 'log.fortify', { faction: fid, prov: provId, cost: CONST.FORTIFY_COST });
  return state;
}

// ---------------------------------------------------------------------------
// Faction liveness / victory
// ---------------------------------------------------------------------------

export function refreshAlive(state) {
  for (const fid in state.factions) {
    if (fid === 'shilen') continue;
    state.factions[fid].alive = ownedBy(state, fid).length > 0;
  }
}

export function checkVictory(state) {
  refreshAlive(state);
  const player = state.playerFaction;

  // Defeat: player owns zero provinces.
  if (ownedBy(state, player).length === 0) {
    return { winner: null, loser: player };
  }

  // Victory A: player holds all three crown castles.
  const holdsCrowns = CONST.CROWN_CASTLES.every(
    (c) => state.provinces[c] && state.provinces[c].owner === player
  );
  if (holdsCrowns) return { winner: player };

  // Victory B: player is the last non-shilen faction with provinces.
  const rivals = PLAYABLE.filter(
    (fid) => fid !== player && ownedBy(state, fid).length > 0
  );
  if (rivals.length === 0) return { winner: player };

  return null;
}

// ---------------------------------------------------------------------------
// End of turn: AI for each non-player faction, Shilen incursion, income,
// victory check, advance turn.
// ---------------------------------------------------------------------------

export function endTurn(state) {
  if (state.phase === 'over') return state;

  // AI is wired in via registerAi() (ai.js calls it on import), avoiding a
  // static cyclic import between engine.js and ai.js. Events/skills wire in the
  // same way (events.js -> registerEvents, skills.js -> registerSkills).
  const ai = AI_IMPL;

  // 1. Rival AI factions act (deterministic order).
  for (const fid of PLAYABLE) {
    if (fid === state.playerFaction) continue;
    if (!state.factions[fid] || !state.factions[fid].alive) continue;
    if (ai && ai.takeFactionTurn) {
      state = ai.takeFactionTurn(state, fid);
    }
  }

  // 2. Shilen incursion.
  if (ai && ai.shilenIncursion) {
    state = ai.shilenIncursion(state);
  }

  // 3. Income for everyone (also ticks income blessings).
  income(state);

  // 3b. City tick (v3): advance every city's build queue and apply per-turn
  // building effects (produceRes / produceUnit / defense / heal). Wired in via
  // registerCity() (mirroring registerAi/registerEvents). Runs after income so
  // city production lands in faction resources/garrisons each turn, before the
  // victory check. No-op (and the game plays like v2) when no city api is set.
  if (CITY_IMPL && typeof CITY_IMPL.cityTick === 'function') {
    state = CITY_IMPL.cityTick(state) || state;
  }

  // 4. Tick clan-skill cooldowns down by one turn.
  if (SKILLS_IMPL && SKILLS_IMPL.tickCooldowns) {
    state = SKILLS_IMPL.tickCooldowns(state);
  }

  // 5. Victory / defeat.
  const result = checkVictory(state);
  if (result) {
    state.phase = 'over';
    state.result = result;
    if (result.winner === state.playerFaction) {
      pushLog(state, 'log.victory', { faction: state.playerFaction });
    } else if (result.loser === state.playerFaction || result.winner == null) {
      pushLog(state, 'log.defeat', { faction: state.playerFaction });
    } else {
      pushLog(state, 'log.victory', { faction: result.winner });
    }
    return state;
  }

  // 6. Advance turn.
  state.turn += 1;
  refreshAlive(state);

  // 7. Campaign events: at most one may fire for the player this turn. Sets
  // state.pendingEvent for the client to resolve via resolveEvent().
  if (EVENTS_IMPL && EVENTS_IMPL.maybeFireEvent) {
    state = EVENTS_IMPL.maybeFireEvent(state);
  }

  return state;
}

// AI wiring: ai.js calls registerAi(impl) on import so endTurn can reach it
// without a static cyclic import.
let AI_IMPL = null;
export function registerAi(impl) {
  AI_IMPL = impl;
}

// Events wiring: events.js calls registerEvents(impl) so endTurn can fire
// campaign events. impl = { maybeFireEvent, resolveEvent }.
let EVENTS_IMPL = null;
export function registerEvents(impl) {
  EVENTS_IMPL = impl;
}

// Skills wiring: skills.js calls registerSkills(impl) so endTurn can tick
// cooldowns. impl = { tickCooldowns }.
let SKILLS_IMPL = null;
export function registerSkills(impl) {
  SKILLS_IMPL = impl;
}

// City wiring (v3): city.js calls registerCity(impl) on import so endTurn can
// drive city production and createGame can seed capital townhalls, all without a
// static cyclic import (mirrors registerAi/registerEvents/registerSkills).
// impl = { cityTick, hasCity?, canBuild?, startBuild?, ensureCity?, ... }.
let CITY_IMPL = null;
export function registerCity(impl) {
  CITY_IMPL = impl;
}
// Accessor so other engine-core modules (ai.js) can reach the registered city
// api (startBuild/canBuild/hasCity/...) without a static import of city.js,
// which lives on another branch. Returns null when no city api is wired in.
export function getCityImpl() {
  return CITY_IMPL;
}

// Lazily create the per-game clan-skill slot. Used by skills.js.
export function ensureSkillsState(state) {
  if (!state.skills) state.skills = { cooldowns: {} };
  if (!state.skills.cooldowns) state.skills.cooldowns = {};
  return state.skills;
}

// ---------------------------------------------------------------------------
// Declarative effect application (shared by events.js and skills.js).
//
// Effects apply to `faction` (the acting/player faction) unless an effect
// names a `target` faction. Province-scoped effects default their province to
// `defaultProv` (the chosen target province for a skill / event), and honor an
// explicit `where` ('capital' | 'frontline') for spawn placement.
//
// Supported effect types (must match interfaces-v2.md §2 + §3 exactly):
//   adena        { value }                         — add/subtract adena
//   blessIncome  { turns, mult }                   — temporary income multiplier
//   spawnUnits   { unit, count, where }            — add units to a province
//   spawnIncursion {}                              — trigger a Shilen incursion now
//   fortifyCapital {}                              — fortify the faction capital free
//   loseUnits    { count }                         — remove N units (frontline-weighted)
//   revealMap    {}                                — set state.revealed flag
//   healGarrison { pct }                           — +pct of target garrison (resurrect)
//   smite        { frac }                          — kill frac of target enemy garrison
//   summon       { unit, count }                   — add units to the target province
//   fortifyFree  {}                                — fortify the target province free
//   setFlag      { flag }                          — set state.flags[flag]=true (v3 event-chain)
// ---------------------------------------------------------------------------

export function applyEffects(state, faction, effects, defaultProv) {
  for (const eff of effects || []) {
    if (!eff || !eff.type) continue;
    const fid = eff.target || faction;
    applyOneEffect(state, fid, eff, defaultProv);
  }
  refreshAlive(state);
  return state;
}

function applyOneEffect(state, fid, eff, defaultProv) {
  switch (eff.type) {
    case 'adena': {
      const fac = state.factions[fid];
      if (fac) {
        fac.adena = Math.max(0, (fac.adena | 0) + (eff.value | 0));
        pushLog(state, 'log.effect.adena', { faction: fid, value: eff.value | 0 });
      }
      break;
    }
    case 'blessIncome': {
      const fac = state.factions[fid];
      if (fac) {
        fac.blessIncome = { turns: eff.turns | 0, mult: eff.mult || 1 };
        pushLog(state, 'log.effect.blessIncome', { faction: fid, turns: eff.turns | 0, mult: eff.mult || 1 });
      }
      break;
    }
    case 'spawnUnits': {
      const prov = pickSpawnProvince(state, fid, eff.where || 'capital', defaultProv);
      if (prov) {
        const uid = resolveUnitFor(fid, eff.unit);
        if (uid) {
          prov.garrison[uid] = (prov.garrison[uid] | 0) + (eff.count | 0 || 1);
          pushLog(state, 'log.effect.spawnUnits', { faction: fid, unit: uid, count: eff.count | 0 || 1, prov: prov.id });
        }
      }
      break;
    }
    case 'summon': {
      const prov = defaultProv ? state.provinces[defaultProv] : pickSpawnProvince(state, fid, 'capital', null);
      if (prov && prov.owner === fid) {
        const uid = resolveUnitFor(fid, eff.unit);
        if (uid) {
          prov.garrison[uid] = (prov.garrison[uid] | 0) + (eff.count | 0 || 1);
          pushLog(state, 'log.effect.summon', { faction: fid, unit: uid, count: eff.count | 0 || 1, prov: prov.id });
        }
      }
      break;
    }
    case 'spawnIncursion': {
      // Fire a Shilen incursion immediately if the AI is wired in.
      if (AI_IMPL && AI_IMPL.shilenIncursion) {
        // Force the incursion regardless of cadence by temporarily marking it.
        state = AI_IMPL.shilenIncursion(state, { force: true });
      }
      pushLog(state, 'log.effect.spawnIncursion', { trigger: fid });
      break;
    }
    case 'fortifyCapital': {
      const capId = FACTIONS[fid] && FACTIONS[fid].capital;
      const prov = capId && state.provinces[capId];
      if (prov && prov.owner === fid && !prov.fortified) {
        prov.fortified = true;
        pushLog(state, 'log.effect.fortifyCapital', { faction: fid, prov: capId });
      }
      break;
    }
    case 'fortifyFree': {
      const prov = defaultProv ? state.provinces[defaultProv] : null;
      if (prov && prov.owner === fid && !prov.fortified) {
        prov.fortified = true;
        pushLog(state, 'log.effect.fortifyFree', { faction: fid, prov: prov.id });
      }
      break;
    }
    case 'loseUnits': {
      removeUnits(state, fid, eff.count | 0 || 1);
      pushLog(state, 'log.effect.loseUnits', { faction: fid, count: eff.count | 0 || 1 });
      break;
    }
    case 'revealMap': {
      state.revealed = true;
      pushLog(state, 'log.effect.revealMap', { faction: fid });
      break;
    }
    case 'setFlag': {
      // v3 event-chain: persist a named flag on the State so later events can
      // gate on it via trigger.requiresFlag / forbidsFlag (see events.js).
      if (eff.flag) {
        if (!state.flags) state.flags = {};
        state.flags[eff.flag] = true;
        pushLog(state, 'log.effect.setFlag', { faction: fid, flag: eff.flag });
      }
      break;
    }
    case 'healGarrison': {
      const prov = defaultProv ? state.provinces[defaultProv] : null;
      if (prov) {
        const pct = eff.pct || 0;
        let added = 0;
        for (const uid in prov.garrison) {
          const cur = prov.garrison[uid] | 0;
          const extra = Math.round(cur * pct);
          if (extra > 0) {
            prov.garrison[uid] = cur + extra;
            added += extra;
          }
        }
        pushLog(state, 'log.effect.healGarrison', { faction: prov.owner, prov: prov.id, added, pct });
      }
      break;
    }
    case 'smite': {
      const prov = defaultProv ? state.provinces[defaultProv] : null;
      if (prov) {
        const frac = eff.frac || 0;
        let killed = 0;
        for (const uid in prov.garrison) {
          const cur = prov.garrison[uid] | 0;
          const dead = Math.floor(cur * frac);
          if (dead > 0) {
            prov.garrison[uid] = cur - dead;
            if (prov.garrison[uid] <= 0) delete prov.garrison[uid];
            killed += dead;
          }
        }
        pushLog(state, 'log.effect.smite', { prov: prov.id, owner: prov.owner, killed, frac });
      }
      break;
    }
    default:
      // Unknown effect type: ignore (forward-compatible).
      break;
  }
}

// Pick a province to spawn units into for `faction`, per `where`.
//   'capital'   — the faction capital if owned, else the first owned province.
//   'frontline' — an owned province adjacent to a non-owned one, else capital.
// If a defaultProv (owned by faction) is supplied it is preferred.
function pickSpawnProvince(state, faction, where, defaultProv) {
  if (defaultProv) {
    const p = state.provinces[defaultProv];
    if (p && p.owner === faction) return p;
  }
  const owned = ownedBy(state, faction);
  if (owned.length === 0) return null;
  const capId = FACTIONS[faction] && FACTIONS[faction].capital;
  if (where === 'frontline') {
    for (const id of owned) {
      const meta = PROV_BY_ID[id];
      if (meta && (meta.neighbors || []).some((n) => state.provinces[n] && state.provinces[n].owner !== faction)) {
        return state.provinces[id];
      }
    }
  }
  if (capId && state.provinces[capId] && state.provinces[capId].owner === faction) {
    return state.provinces[capId];
  }
  return state.provinces[owned[0]];
}

// Resolve a unit id for a faction: use the requested unit if it is in the
// roster, else fall back to the faction's cheapest unit. Returns null if none.
function resolveUnitFor(faction, requested) {
  const fac = FACTIONS[faction];
  if (fac && fac.roster && requested && fac.roster.includes(requested) && UNITS[requested]) {
    return requested;
  }
  if (requested && UNITS[requested]) return requested; // off-roster but valid (e.g. summoned guardians)
  return basicUnitFor(faction);
}

// Remove `count` units from a faction, frontline provinces first.
function removeUnits(state, faction, count) {
  let remaining = count;
  const owned = ownedBy(state, faction).sort((a, b) => {
    const fa = (PROV_BY_ID[a].neighbors || []).some((n) => state.provinces[n] && state.provinces[n].owner !== faction) ? 0 : 1;
    const fb = (PROV_BY_ID[b].neighbors || []).some((n) => state.provinces[n] && state.provinces[n].owner !== faction) ? 0 : 1;
    return fa - fb;
  });
  for (const id of owned) {
    if (remaining <= 0) break;
    const g = state.provinces[id].garrison;
    for (const uid in g) {
      if (remaining <= 0) break;
      const take = Math.min(g[uid] | 0, remaining);
      g[uid] -= take;
      remaining -= take;
      if (g[uid] <= 0) delete g[uid];
    }
  }
}

// ---------------------------------------------------------------------------
// Manual-battle hooks (contract v2 §4). planBattle gathers the inputs the
// tactical screen needs WITHOUT mutating ownership; applyBattleOutcome applies
// a resolved outcome (same shape as combat.resolveBattle's return) to the map.
// The client uses these for the interactive battle, falling back to moveArmy.
// ---------------------------------------------------------------------------

// planBattle(state, fromId, toId, units)
//  -> { battle:false, state }  when the move is a reinforce/no-op (no fight)
//  -> { battle:true, attacker, defender, terrain, fortified, rngState, from, to, units }
// Does NOT mutate ownership or garrisons; only validates and snapshots inputs.
export function planBattle(state, fromId, toId, units) {
  const from = state.provinces[fromId];
  const to = state.provinces[toId];
  if (!from || !to) return { battle: false, state };
  if (!legalMoves(state, fromId).includes(toId)) return { battle: false, state };

  // Validate the moving force against the source garrison.
  const moving = {};
  for (const uid in units) {
    const take = Math.min(units[uid] | 0, from.garrison[uid] | 0);
    if (take > 0) moving[uid] = take;
  }
  if (garrisonSize(moving) === 0) return { battle: false, state };

  // Friendly or empty target -> no battle (caller should just moveArmy).
  if (to.owner === from.owner) return { battle: false, state };

  const meta = PROV_BY_ID[toId];
  return {
    battle: true,
    attacker: { faction: from.owner, garrison: Object.assign({}, moving) },
    defender: { faction: to.owner, garrison: Object.assign({}, to.garrison) },
    terrain: meta ? meta.terrain : 'plains',
    fortified: !!to.fortified,
    rngState: state.rngState,
    from: fromId,
    to: toId,
    units: Object.assign({}, moving),
  };
}

// applyBattleOutcome(state, fromId, toId, units, outcome) -> { state }
// `outcome` MUST equal combat.resolveBattle's return shape (winner,
// attackerLosses, defenderLosses, attackerSurvivors, defenderSurvivors, rounds,
// log). Deducts the moving force from the source, applies losses, and on an
// attacker win transfers the province + moves survivors in. Advances rng so a
// manual battle leaves the same rng footprint as the auto path.
export function applyBattleOutcome(state, fromId, toId, units, outcome) {
  const from = state.provinces[fromId];
  const to = state.provinces[toId];
  if (!from || !to || !outcome) return { state };

  // Recompute & deduct the actual moving force from the source (the units that
  // marched out — they are not in `from` anymore regardless of the result).
  const moving = {};
  for (const uid in units) {
    const take = Math.min(units[uid] | 0, from.garrison[uid] | 0);
    if (take > 0) moving[uid] = take;
  }
  for (const uid in moving) {
    from.garrison[uid] -= moving[uid];
    if (from.garrison[uid] <= 0) delete from.garrison[uid];
  }

  const mover = from.owner;

  // Bubble the battle log into the state log (same prefixing as moveArmy).
  for (const entry of outcome.log || []) pushLog(state, 'log.' + entry.key, entry.params);

  if (outcome.winner === 'attacker') {
    const prevOwner = to.owner;
    to.owner = mover;
    to.garrison = Object.assign({}, outcome.attackerSurvivors || {});
    to.fortified = false;
    pushLog(state, 'log.capture', { faction: mover, from: prevOwner, prov: toId });
  } else {
    to.garrison = Object.assign({}, outcome.defenderSurvivors || {});
    const remnants = outcome.attackerSurvivors || {};
    for (const uid in remnants) {
      from.garrison[uid] = (from.garrison[uid] | 0) + (remnants[uid] | 0);
    }
    pushLog(state, 'log.repelled', { faction: to.owner, attacker: mover, prov: toId });
  }

  // Advance the rng by the number of rounds resolved so determinism/state
  // progression mirror the auto path (the manual screen consumed its own rng
  // off a snapshot; here we move the canonical counter forward).
  const rounds = (outcome.rounds && outcome.rounds.length) || 0;
  withRng(state, (rng) => {
    for (let i = 0; i < rounds; i++) rng();
    return null;
  });

  refreshAlive(state);
  return { state };
}

// ---------------------------------------------------------------------------
// View model for UI / render
// ---------------------------------------------------------------------------

export function viewModel(state) {
  const player = state.playerFaction;
  const playerProvinces = ownedBy(state, player);
  const provinces = {};
  for (const id in state.provinces) {
    const p = state.provinces[id];
    provinces[id] = {
      id,
      owner: p.owner,
      garrison: Object.assign({}, p.garrison),
      garrisonSize: garrisonSize(p.garrison),
      fortified: p.fortified,
      castle: !!(PROV_BY_ID[id] && PROV_BY_ID[id].castle),
      terrain: PROV_BY_ID[id] ? PROV_BY_ID[id].terrain : 'plains',
    };
  }

  const selected = state.selected && state.provinces[state.selected]
    ? {
        id: state.selected,
        owner: state.provinces[state.selected].owner,
        garrison: Object.assign({}, state.provinces[state.selected].garrison),
        fortified: state.provinces[state.selected].fortified,
        moves: legalMoves(state, state.selected),
      }
    : null;

  const crownsHeld = CONST.CROWN_CASTLES.filter(
    (c) => state.provinces[c] && state.provinces[c].owner === player
  );

  return {
    turn: state.turn,
    phase: state.phase,
    playerFaction: player,
    activeFaction: state.activeFaction,
    adena: state.factions[player] ? state.factions[player].adena : 0,
    upkeep: totalUpkeep(state, player),
    provincesOwned: playerProvinces.length,
    crownsHeld,
    crownsNeeded: CONST.CROWN_CASTLES.length,
    goalHint: crownsHeld.length === CONST.CROWN_CASTLES.length ? 'goal.done' : 'goal.crowns',
    provinces,
    selected,
    result: state.result,
    factions: Object.assign({}, state.factions),
  };
}

// Re-export utilities the AI module relies on.
export { randInt, pick, shuffle, unitCostFor };
