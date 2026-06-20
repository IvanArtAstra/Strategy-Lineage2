// src/ai.js — contract G
// Rival lord heuristics + Shilen's undead incursions. Pure logic, seeded RNG
// via the engine's state.rngState (through engine.withRng). Importing this
// module registers it with the engine so endTurn() can drive it.

import { UNITS } from './data/units.js';
import { FACTIONS, PLAYABLE } from './data/factions.js';
import { PROVINCES, NEUTRAL } from './data/map.js';
import {
  CONST,
  registerAi,
  withRng,
  pushLog,
  ownedBy,
  garrisonSize,
  legalMoves,
  recruit,
  moveArmy,
  fortify,
  provinceMeta,
  unitCostFor,
  getCityImpl,
} from './engine.js';
import { randInt, pick, shuffle } from './rng.js';

// ---- tunable AI constants -------------------------------------------------
const AI = {
  RICH_THRESHOLD: 220, // recruit when adena above this
  RECRUITS_PER_TURN: 2, // max units an AI recruits per turn
  ATTACK_POWER_MARGIN: 1.25, // attack only if force >= margin * defender power
  PLAYER_TRUCE_TURN: 8, // before this turn, rival lords expand into NEUTRAL land
                        // only and do not assault other player-factions — gives
                        // every starting position room to establish (fair opening)
  FORTIFY_CHANCE: 0.4, // chance to fortify a frontline province when idle
  // Shilen incursion scaling — a darkness that closes in over time.
  SHILEN_START_TURN: 8, // no incursions before this turn — lets every faction
                        // establish past the opening truce before the dark closes in
  SHILEN_BASE_STACK: 2, // undead per incursion near the start window
  SHILEN_PER_TURN: 0.4, // additional undead per turn elapsed
  SHILEN_MAX_STACK: 16,
  SHILEN_EVERY: 3, // incursions trigger every N turns
  // v3 city development: the order an AI lord tries to build/upgrade buildings.
  // Economy first (townhall + a resource building) to fund growth, then a
  // unit-producing barracks, then walls for defence. The AI builds the FIRST
  // affordable buildable in this list per city per turn (one build per city).
  CITY_BUILD_PRIORITY: ['townhall', 'lumbermill', 'crystalmine', 'barracks', 'walls'],
};

const PROV_BY_ID = {};
for (const p of PROVINCES) PROV_BY_ID[p.id] = p;

// Crude combat power estimate of a garrison (hp*def + atk weighting).
function power(garrison) {
  let p = 0;
  for (const uid in garrison) {
    const u = UNITS[uid];
    if (!u) continue;
    const c = garrison[uid] | 0;
    p += (u.atk + u.hp * 0.4 + u.def * 0.6) * c;
  }
  return p;
}

// Best (cheapest affordable, then highest power) unit an AI faction can build.
function bestRecruit(state, factionId) {
  const fac = FACTIONS[factionId];
  if (!fac || !fac.roster) return null;
  const adena = state.factions[factionId].adena;
  let best = null;
  let bestScore = -1;
  for (const uid of fac.roster) {
    const u = UNITS[uid];
    if (!u) continue;
    const cost = unitCostFor(factionId, uid);
    if (cost > adena) continue;
    const score = (u.atk + u.hp * 0.4 + u.def * 0.6) / cost; // value per Adena
    if (score > bestScore) {
      bestScore = score;
      best = uid;
    }
  }
  return best;
}

// A province is "frontline" if any neighbor is owned by someone else.
function isFrontline(state, provId, factionId) {
  const meta = PROV_BY_ID[provId];
  if (!meta) return false;
  return (meta.neighbors || []).some(
    (n) => state.provinces[n] && state.provinces[n].owner !== factionId
  );
}

// ---------------------------------------------------------------------------
// developCities: for each owned city, queue the first affordable building from
// CITY_BUILD_PRIORITY via the registered city api's startBuild (guarded by
// canBuild). One build per city per turn. Pure no-op when the city api or the
// buildings data is absent, so the game degrades to v2. Deterministic: iterates
// the faction's owned provinces in their fixed order and consults canBuild.
// ---------------------------------------------------------------------------

function developCities(state, factionId, owned) {
  const city = getCityImpl();
  if (!city || typeof city.startBuild !== 'function') return state;
  const canBuild = typeof city.canBuild === 'function' ? city.canBuild : null;
  const hasCity = typeof city.hasCity === 'function' ? city.hasCity : null;

  for (const provId of owned) {
    if (hasCity && !hasCity(provId)) continue;
    for (const buildingId of AI.CITY_BUILD_PRIORITY) {
      let ok = true;
      if (canBuild) {
        const chk = canBuild(state, provId, buildingId);
        ok = !!(chk && chk.ok);
      }
      if (!ok) continue;
      try {
        state = city.startBuild(state, provId, buildingId) || state;
      } catch (_e) {
        /* resilient: a city-api hiccup must never break the AI turn */
      }
      break; // one build per city per turn
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// takeFactionTurn: recruit when rich; attack weakest beatable adjacent
// enemy/neutral; otherwise fortify a frontline holding.
// ---------------------------------------------------------------------------

export function takeFactionTurn(state, factionId) {
  const fac = state.factions[factionId];
  if (!fac || !fac.alive) return state;

  const owned = ownedBy(state, factionId);
  if (owned.length === 0) return state;

  // 0. CITY DEVELOPMENT (v3): for each owned city, start the cheapest sensible
  // affordable building/upgrade (townhall -> resource -> barracks -> walls). The
  // AI spends wood/crystal here too. No-op if the city api is absent.
  state = developCities(state, factionId, owned);

  // 1. RECRUIT when rich — bolster the richest/most exposed province.
  let recruited = 0;
  while (fac.adena >= AI.RICH_THRESHOLD && recruited < AI.RECRUITS_PER_TURN) {
    const uid = bestRecruit(state, factionId);
    if (!uid) break;
    // Prefer to reinforce a frontline province; else the capital/first.
    const target =
      owned.find((id) => isFrontline(state, id, factionId)) || owned[0];
    const before = fac.adena;
    state = recruit(state, target, uid, 1);
    if (state.factions[factionId].adena >= before) break; // recruit failed
    recruited++;
  }

  // 2. ATTACK the weakest beatable adjacent enemy/neutral.
  let attacked = false;
  // Evaluate all (source, target) options; pick the best favorable assault.
  const options = [];
  for (const src of owned) {
    const gar = state.provinces[src].garrison;
    if (garrisonSize(gar) < 2) continue; // keep at least 1 home defender
    const myPower = power(gar);
    for (const tgt of legalMoves(state, src)) {
      const dst = state.provinces[tgt];
      if (dst.owner === factionId) continue;
      // Opening-truce: early on, only push into neutral land, never gang up on
      // another player-faction before they have had time to establish.
      const rivalIsPlayer = dst.owner !== NEUTRAL && dst.owner !== 'shilen';
      if (state.turn < AI.PLAYER_TRUCE_TURN && rivalIsPlayer) continue;
      const meta = PROV_BY_ID[tgt];
      const terrainDef = meta && meta.castle ? 1.25 : 1.0;
      const fortMul = dst.fortified ? 1.3 : 1.0;
      const defPower = power(dst.garrison) * terrainDef * fortMul + 1;
      if (myPower >= defPower * AI.ATTACK_POWER_MARGIN) {
        options.push({ src, tgt, myPower, defPower, ratio: myPower / defPower });
      }
    }
  }
  if (options.length > 0) {
    // Attack the most favorable (highest power ratio), tie-broken by rng.
    options.sort((a, b) => b.ratio - a.ratio);
    const choice = options[0];
    // Send most of the garrison, leaving one unit behind.
    const gar = state.provinces[choice.src].garrison;
    const force = {};
    let leftBehind = false;
    for (const uid in gar) {
      let c = gar[uid] | 0;
      if (!leftBehind && c > 0) {
        c -= 1; // leave one as a home defender
        leftBehind = true;
      }
      if (c > 0) force[uid] = c;
    }
    if (garrisonSize(force) > 0) {
      const r = moveArmy(state, choice.src, choice.tgt, force);
      state = r.state;
      attacked = true;
    }
  }

  // 3. Otherwise FORTIFY a frontline province (probabilistically).
  if (!attacked && fac.adena >= CONST.FORTIFY_COST) {
    const fronts = owned.filter(
      (id) => isFrontline(state, id, factionId) && !state.provinces[id].fortified
    );
    if (fronts.length > 0) {
      const roll = withRng(state, (rng) => ({ go: rng() < AI.FORTIFY_CHANCE, who: pick(rng, fronts) }));
      if (roll.go && roll.who) {
        state = fortify(state, roll.who);
      }
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// shilenIncursion: spawn undead stacks that scale with turn and assault the
// nearest non-shilen holdings. Runs every AI.SHILEN_EVERY turns.
// ---------------------------------------------------------------------------

export function shilenIncursion(state, opts) {
  const force = !!(opts && opts.force);
  // Normal cadence gate; a forced incursion (e.g. an event's spawnIncursion
  // effect) bypasses the start-turn and cadence checks.
  if (!force) {
    if (state.turn < AI.SHILEN_START_TURN) return state;
    if (state.turn % AI.SHILEN_EVERY !== 0) return state;
  }

  // Stack size scales with elapsed turns, capped. A forced early incursion
  // still spawns at least the base stack.
  const size = Math.min(
    AI.SHILEN_MAX_STACK,
    Math.max(AI.SHILEN_BASE_STACK, Math.round(AI.SHILEN_BASE_STACK + state.turn * AI.SHILEN_PER_TURN))
  );
  if (size <= 0) return state;

  // Build an undead stack from the shilen roster (mixed types).
  const stack = buildUndeadStack(state, size);

  // Pick targets: prefer player and rival holdings, weakest first; attack one
  // or two depending on turn.
  const targets = [];
  for (const id in state.provinces) {
    const owner = state.provinces[id].owner;
    if (owner !== NEUTRAL && owner !== 'shilen') targets.push(id);
  }
  if (targets.length === 0) return state;

  // Sort by weakest garrison (easiest to overrun), nudged by rng for variety.
  const ordered = withRng(state, (rng) => {
    const arr = shuffle(rng, targets);
    arr.sort((a, b) => power(state.provinces[a].garrison) - power(state.provinces[b].garrison));
    return arr;
  });

  const numAttacks = state.turn >= 8 ? 2 : 1;
  let attacks = 0;
  for (const tgt of ordered) {
    if (attacks >= numAttacks) break;
    const dst = state.provinces[tgt];
    const meta = PROV_BY_ID[tgt];
    const battle = withRng(state, (rng) =>
      resolveUndead({
        stack: Object.assign({}, stack),
        defender: { faction: dst.owner, garrison: Object.assign({}, dst.garrison) },
        terrain: meta ? meta.terrain : 'plains',
        fortified: !!dst.fortified,
        rng,
      })
    );
    for (const entry of battle.log) pushLog(state, 'log.' + entry.key, entry.params);
    pushLog(state, 'log.incursion', { prov: tgt, owner: dst.owner, size, turn: state.turn });

    if (battle.winner === 'attacker') {
      const prev = dst.owner;
      dst.owner = 'shilen';
      dst.garrison = Object.assign({}, battle.attackerSurvivors);
      dst.fortified = false;
      pushLog(state, 'log.capture', { faction: 'shilen', from: prev, prov: tgt });
    } else {
      dst.garrison = Object.assign({}, battle.defenderSurvivors);
      pushLog(state, 'log.repelled', { faction: dst.owner, attacker: 'shilen', prov: tgt });
    }
    attacks++;
  }

  // Refresh liveness after incursions.
  for (const fid in state.factions) {
    if (fid === 'shilen') continue;
    state.factions[fid].alive = ownedBy(state, fid).length > 0;
  }
  return state;
}

function buildUndeadStack(state, size) {
  const roster = (FACTIONS.shilen && FACTIONS.shilen.roster) || ['wraith'];
  const stack = {};
  // ~60% wraith (frontline), 25% bonearcher, 15% necromancer-ish split.
  return withRng(state, (rng) => {
    for (let i = 0; i < size; i++) {
      const r = rng();
      let uid;
      if (r < 0.6) uid = roster[0];
      else if (r < 0.85) uid = roster[1] || roster[0];
      else uid = roster[2] || roster[0];
      stack[uid] = (stack[uid] | 0) + 1;
    }
    return stack;
  });
}

// Undead combat: reuse the same resolution model as engine combat by calling
// resolveBattle. Imported lazily to keep ai.js self-contained at top.
import { resolveBattle } from './combat.js';
function resolveUndead({ stack, defender, terrain, fortified, rng }) {
  return resolveBattle({
    attacker: { faction: 'shilen', garrison: stack },
    defender,
    terrain,
    defenderFortified: fortified,
    rng,
  });
}

// Register with the engine so endTurn() can drive us.
registerAi({ takeFactionTurn, shilenIncursion });
