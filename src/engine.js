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
};

// ---------------------------------------------------------------------------
// State construction
// ---------------------------------------------------------------------------

export function createGame({ playerFaction, seed }) {
  const pf = PLAYABLE.includes(playerFaction) ? playerFaction : PLAYABLE[0];
  const s = (seed >>> 0) || 1;

  const factions = {};
  for (const id in FACTIONS) {
    factions[id] = { id, adena: id === 'shilen' ? 0 : CONST.STARTING_ADENA, alive: true };
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
  // something.
  for (const p of PROVINCES) {
    if (provinces[p.id].owner === NEUTRAL) {
      provinces[p.id].garrison = { gladiator: p.castle ? 3 : 2 };
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
    selected: null,
    log: [],
    result: null,
  };

  pushLog(state, 'log.gameStart', { faction: pf, seed: s });
  return state;
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
  // static cyclic import between engine.js and ai.js.
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

  // 3. Income for everyone.
  income(state);

  // 4. Victory / defeat.
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

  // 5. Advance turn.
  state.turn += 1;
  refreshAlive(state);
  return state;
}

// AI wiring: ai.js calls registerAi(impl) on import so endTurn can reach it
// without a static cyclic import.
let AI_IMPL = null;
export function registerAi(impl) {
  AI_IMPL = impl;
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
