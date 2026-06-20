// src/siege.js — feat/siege
// Deterministic CITY SIEGE model. Mirrors src/combat.js / src/tactical.js so
// balance stays consistent: troop clashes use the SAME pooled-damage,
// COUNTER/terrain/numbers attrition math. The siege difference is the WALL:
// while wall integrity > 0 the defender fights with a big standing-wall bonus
// and the attacker cannot decisively storm them; 'assault-wall' rounds chip the
// wall via the attacker army's siege power until it breaches, after which the
// fight resolves like an ordinary field battle.
//
// resolveSiege(ss) returns an outcome IDENTICAL in shape to
// combat.resolveBattle's return so engine.applyBattleOutcome consumes it
// unchanged: { winner, attackerLosses, defenderLosses, attackerSurvivors,
//              defenderSurvivors, rounds, log:[{key,params}] }.
//
// Determinism: the model owns no rng — the caller derives a seeded rng (rng.js)
// from seed and threads it via createSiege. Identical start + identical command
// sequence => identical outcome.
//
// No imports from engine/ui/render. Pure browser+ESM.

import { UNITS, COUNTER } from './data/units.js';
import {
  WALL_HP_PER_LEVEL,
  STANDING_WALL_DEF_BONUS,
  BASE_BATTER_PER_UNIT,
  WALL_ASSAULT_ATTACKER_RISK,
  SIEGE_POWER_BY_TYPE,
} from './data/siege.js';
import { makeRng } from './rng.js';

// ---- tunable constants (kept aligned with combat.js / tactical.js) --------
export const MAX_ROUNDS = 12;
const ATTACKER_PENALTY = 0.95;
const BASE_VARIANCE = 0.18;
const HEALER_HP_FACTOR = 1.6;
const MAGE_CLUSTER_BONUS = 0.4;
const MAGE_CLUSTER_THRESHOLD = 8;
const NUMBERS_EXP = 0.25;

// Terrain table — mirrors combat.js exactly.
const TERRAIN = {
  plains: { atk: 1.0, def: 1.0 },
  forest: { atk: 0.9, def: 1.15 },
  mountain: { atk: 0.85, def: 1.25 },
  swamp: { atk: 0.9, def: 1.05 },
  coast: { atk: 1.05, def: 0.95 },
};
function terrainMods(terrain) {
  return TERRAIN[terrain] || TERRAIN.plains;
}

// ---- garrison helpers (same semantics as combat.js) -----------------------
function cloneGarrison(g) {
  const out = {};
  for (const id in g) {
    const c = g[id] | 0;
    if (c > 0) out[id] = c;
  }
  return out;
}

export function stackSize(garrison) {
  let n = 0;
  for (const id in garrison) n += garrison[id] | 0;
  return n;
}

export function isEmpty(garrison) {
  for (const id in garrison) if ((garrison[id] | 0) > 0) return false;
  return true;
}

function counterMul(attType, defType) {
  if (COUNTER && COUNTER[attType] && typeof COUNTER[attType][defType] === 'number') {
    return COUNTER[attType][defType];
  }
  return 1.0;
}

function effectiveHp(garrison) {
  let hp = 0;
  for (const id in garrison) {
    const u = UNITS[id];
    if (!u) continue;
    const c = garrison[id] | 0;
    if (c <= 0) continue;
    const factor = u.type === 'heal' ? HEALER_HP_FACTOR : 1;
    hp += u.hp * c * factor;
  }
  return hp;
}

function dominantType(garrison) {
  const byType = {};
  for (const id in garrison) {
    const u = UNITS[id];
    if (!u) continue;
    byType[u.type] = (byType[u.type] || 0) + (garrison[id] | 0);
  }
  let best = 'inf';
  let bestN = -1;
  for (const t in byType) {
    if (byType[t] > bestN) {
      bestN = byType[t];
      best = t;
    }
  }
  return best;
}

function avgDef(garrison) {
  let sumDef = 0;
  let n = 0;
  for (const id in garrison) {
    const u = UNITS[id];
    if (!u) continue;
    const c = garrison[id] | 0;
    sumDef += u.def * c;
    n += c;
  }
  return n > 0 ? sumDef / n : 0;
}

// Outgoing pooled damage of `side` vs `foe` — identical to combat.js sidePower.
function sidePower(side, foe) {
  const foeDominant = dominantType(foe);
  const foeSize = stackSize(foe);
  let dmg = 0;
  for (const id in side) {
    const u = UNITS[id];
    if (!u) continue;
    const c = side[id] | 0;
    if (c <= 0) continue;
    let atk = u.atk * c;
    atk *= counterMul(u.type, foeDominant);
    if (u.type === 'mag' && foeSize >= MAGE_CLUSTER_THRESHOLD) {
      atk *= 1 + MAGE_CLUSTER_BONUS;
    }
    dmg += atk;
  }
  return dmg;
}

// Distribute `damage` (effective-HP loss) across a garrison -> losses map.
// Identical algorithm to combat.js so casualty distribution matches.
function applyDamage(garrison, damage, rng) {
  const losses = {};
  if (damage <= 0) return losses;
  const ids = Object.keys(garrison).filter((id) => (garrison[id] | 0) > 0 && UNITS[id]);
  ids.sort((a, b) => {
    const ua = UNITS[a];
    const ub = UNITS[b];
    return ua.hp + ua.def - (ub.hp + ub.def);
  });
  let remaining = damage;
  for (const id of ids) {
    if (remaining <= 0) break;
    const u = UNITS[id];
    const have = garrison[id] | 0;
    const perUnit = Math.max(1, u.hp);
    let kills = Math.floor(remaining / perUnit);
    const frac = remaining / perUnit - kills;
    if (frac > 0 && rng() < frac) kills += 1;
    if (kills > have) kills = have;
    if (kills > 0) {
      losses[id] = (losses[id] || 0) + kills;
      remaining -= kills * perUnit;
    }
  }
  return losses;
}

function subtract(garrison, losses) {
  const out = {};
  for (const id in garrison) {
    const left = (garrison[id] | 0) - (losses[id] || 0);
    if (left > 0) out[id] = left;
  }
  return out;
}

function diffCounts(start, end) {
  const out = {};
  for (const id in start) {
    const lost = (start[id] | 0) - (end[id] | 0);
    if (lost > 0) out[id] = lost;
  }
  return out;
}

// ---- siege-specific math --------------------------------------------------

// Total siege power of an attacking army against a wall: each unit contributes
// BASE_BATTER_PER_UNIT scaled by its attack, then boosted by its type's
// siege-weapon multiplier/flat bonus (rams for infantry, catapults for cavalry,
// sappers for mages). Returned value is raw wall-HP damage before variance.
export function siegePower(garrison) {
  let power = 0;
  for (const id in garrison) {
    const u = UNITS[id];
    if (!u) continue;
    const c = garrison[id] | 0;
    if (c <= 0) continue;
    const sp = SIEGE_POWER_BY_TYPE[u.type] || { mul: 1, flat: 0 };
    const perUnit = BASE_BATTER_PER_UNIT * (u.atk / 14) * sp.mul + sp.flat;
    power += perUnit * c;
  }
  return power;
}

// The active standing-wall defensive multiplier (1.0 once breached).
function wallBonus(ss) {
  return ss.wallHp > 0 ? STANDING_WALL_DEF_BONUS : 1.0;
}

// ---- public model ---------------------------------------------------------

// createSiege -> SiegeState. Owns its own seeded rng so a state + command
// sequence reproduces bit-exact (siege_ui may also derive its own rng, but the
// model is self-contained for headless use / determinism tests).
export function createSiege({ attacker, defender, wallLevel, terrain, seed }) {
  const attGar = cloneGarrison((attacker && attacker.garrison) || {});
  const defGar = cloneGarrison((defender && defender.garrison) || {});
  const lvl = Math.max(0, Math.min(WALL_HP_PER_LEVEL.length - 1, wallLevel | 0));
  const wallMax = WALL_HP_PER_LEVEL[lvl] || 0;

  return {
    attackerFaction: (attacker && attacker.faction) || 'human',
    defenderFaction: (defender && defender.faction) || 'shilen',
    terrain: terrain || 'plains',
    wallLevel: lvl,
    wallMax,
    wallHp: wallMax,
    seed: (seed >>> 0) || 0,
    rng: makeRng((seed >>> 0) || 0x51e6e),
    attStart: cloneGarrison(attGar),
    defStart: cloneGarrison(defGar),
    attGar,
    defGar,
    round: 0,
    finished: false,
    winner: null,
    rounds: [],   // per-round detail for the engine outcome
    events: [],   // per-round UI detail (dmg numbers, wall chips, etc.)
    log: [{
      key: 'siege.start',
      params: {
        attacker: (attacker && attacker.faction) || 'human',
        defender: (defender && defender.faction) || 'shilen',
        terrain: terrain || 'plains',
        wallLevel: lvl,
        wallHp: wallMax,
        attackerCount: stackSize(attGar),
        defenderCount: stackSize(defGar),
      },
    }],
  };
}

// Whether the siege should end (a side wiped or the round cap reached).
function shouldFinish(ss) {
  return isEmpty(ss.attGar) || isEmpty(ss.defGar) || ss.round >= MAX_ROUNDS;
}

// Advance ONE round. command:
//   'assault-wall'   -> chip the wall via siege power; attacker takes a small
//                       amount of attrition from defenders on the ramparts;
//                       garrison takes no losses (you are hitting stone).
//   'assault-troops' -> a full troop clash; defenders are buffed by the
//                       standing-wall bonus WHILE the wall stands, normal once
//                       breached. Identical attrition math to combat.js.
//   'hold'           -> no clash; attacker regroups (a wasted round, but the
//                       defender deals no damage either). Advances the counter.
// Mutates and returns ss. No-op after finished.
export function siegeStep(ss, command) {
  if (ss.finished) return ss;
  const cmd = command || 'assault-troops';
  if (shouldFinish(ss)) return finishSiege(ss);

  ss.round++;
  const rng = ss.rng;
  const tm = terrainMods(ss.terrain);

  if (cmd === 'hold') {
    // Regroup: no damage either way. Recorded so the UI/log can show it.
    const rec = {
      round: ss.round,
      command: 'hold',
      attackerLosses: {},
      defenderLosses: {},
      wallDamage: 0,
      wallHp: ss.wallHp,
      attackerLeft: stackSize(ss.attGar),
      defenderLeft: stackSize(ss.defGar),
    };
    ss.rounds.push(rec);
    ss.events.push({ kind: 'hold', round: ss.round });
    if (shouldFinish(ss)) finishSiege(ss);
    return ss;
  }

  if (cmd === 'assault-wall') {
    if (ss.wallHp <= 0) {
      // No wall to batter — fall through to a troop clash instead so the round
      // is never wasted on a breached wall.
      ss.round--; // un-count; reissue as a troop clash
      return siegeStep(ss, 'assault-troops');
    }
    // Wall damage = siege power * variance. The wall cannot be over-killed below 0.
    let wallDmg = siegePower(ss.attGar) * (1 + (rng() * 2 - 1) * BASE_VARIANCE);
    if (wallDmg < 0) wallDmg = 0;
    const before = ss.wallHp;
    ss.wallHp = Math.max(0, ss.wallHp - wallDmg);
    const applied = before - ss.wallHp;
    const breached = before > 0 && ss.wallHp <= 0;

    // Attacker takes light attrition while exposed at the wall — defenders on
    // the ramparts shoot down. Scaled by WALL_ASSAULT_ATTACKER_RISK; the
    // garrison takes none (they are manning the wall, not in the field).
    const attSize = stackSize(ss.attGar);
    const defSize = stackSize(ss.defGar);
    const defNumbers = Math.pow(defSize / Math.max(1, attSize), NUMBERS_EXP);
    let defPower = sidePower(ss.defGar, ss.attGar, null) * defNumbers * wallBonus(ss);
    defPower *= 1 + (rng() * 2 - 1) * BASE_VARIANCE;
    const attDefense = avgDef(ss.attGar);
    const dmgToAtt = Math.max(0, defPower - attDefense * attSize * 0.5) * WALL_ASSAULT_ATTACKER_RISK;
    const attLosses = applyDamage(ss.attGar, dmgToAtt, rng);
    ss.attGar = subtract(ss.attGar, attLosses);

    const rec = {
      round: ss.round,
      command: 'assault-wall',
      attackerLosses: attLosses,
      defenderLosses: {},
      wallDamage: applied,
      wallHp: ss.wallHp,
      attackerLeft: stackSize(ss.attGar),
      defenderLeft: stackSize(ss.defGar),
    };
    ss.rounds.push(rec);
    ss.events.push({
      kind: 'wall',
      round: ss.round,
      wallDamage: Math.round(applied),
      wallHp: Math.round(ss.wallHp),
      breached,
      dmgToAtt: Math.round(dmgToAtt),
      attackerLosses: attLosses,
    });
    if (breached) ss.log.push({ key: 'siege.breach', params: { round: ss.round } });
    if (shouldFinish(ss)) finishSiege(ss);
    return ss;
  }

  // ---- default: 'assault-troops' — a full clash (combat.js math) ----------
  const att = ss.attGar;
  const def = ss.defGar;
  const attSize = stackSize(att);
  const defSize = stackSize(def);

  const attNumbers = Math.pow(attSize / Math.max(1, defSize), NUMBERS_EXP);
  const defNumbers = Math.pow(defSize / Math.max(1, attSize), NUMBERS_EXP);
  const wb = wallBonus(ss); // defender standing-wall bonus while wall stands

  let attPower = sidePower(att, def) * tm.atk * ATTACKER_PENALTY * attNumbers;
  let defPower = sidePower(def, att) * defNumbers;

  attPower *= 1 + (rng() * 2 - 1) * BASE_VARIANCE;
  defPower *= 1 + (rng() * 2 - 1) * BASE_VARIANCE;

  // Defender defense scaled by terrain AND the standing-wall bonus.
  const defDefense = avgDef(def) * tm.def * wb;
  const attDefense = avgDef(att);

  const dmgToDef = Math.max(0, attPower - defDefense * defSize * 0.5);
  const dmgToAtt = Math.max(0, defPower - attDefense * attSize * 0.5);

  const defLosses = applyDamage(def, dmgToDef, rng);
  const attLosses = applyDamage(att, dmgToAtt, rng);

  ss.attGar = subtract(att, attLosses);
  ss.defGar = subtract(def, defLosses);

  const rec = {
    round: ss.round,
    command: 'assault-troops',
    attackerLosses: attLosses,
    defenderLosses: defLosses,
    wallDamage: 0,
    wallHp: ss.wallHp,
    attackerLeft: stackSize(ss.attGar),
    defenderLeft: stackSize(ss.defGar),
  };
  ss.rounds.push(rec);
  ss.events.push({
    kind: 'clash',
    round: ss.round,
    dmgToDef: Math.round(dmgToDef),
    dmgToAtt: Math.round(dmgToAtt),
    wallStanding: ss.wallHp > 0,
    attackerLosses: attLosses,
    defenderLosses: defLosses,
  });

  if (shouldFinish(ss)) finishSiege(ss);
  return ss;
}

function finishSiege(ss) {
  if (ss.finished) return ss;
  ss.finished = true;

  const att = ss.attGar;
  const def = ss.defGar;
  const attEmpty = isEmpty(att);
  const defEmpty = isEmpty(def);

  let winner;
  if (defEmpty && !attEmpty) winner = 'attacker';
  else if (attEmpty && !defEmpty) winner = 'defender';
  else if (attEmpty && defEmpty) winner = 'defender'; // mutual: defender holds
  else {
    // Round cap reached with both alive: higher remaining effective HP wins;
    // the defender keeps the standing-wall bonus if the wall never fell. Ties
    // favor the defender (they hold the ground).
    const attHp = effectiveHp(att);
    const defHp = effectiveHp(def) * (ss.wallHp > 0 ? STANDING_WALL_DEF_BONUS : 1);
    winner = attHp > defHp ? 'attacker' : 'defender';
  }
  ss.winner = winner;
  ss.log.push({
    key: winner === 'attacker' ? 'battle.win' : 'battle.loss',
    params: {
      attacker: ss.attackerFaction,
      defender: ss.defenderFaction,
      rounds: ss.round,
      attackerSurvivors: stackSize(att),
      defenderSurvivors: stackSize(def),
    },
  });
  return ss;
}

// resolveSiege -> the COMMON battle outcome (IDENTICAL shape to
// combat.resolveBattle's return). Finishes the siege first if still running.
export function resolveSiege(ss) {
  if (!ss.finished) finishSiege(ss);
  const attSurv = cloneGarrison(ss.attGar);
  const defSurv = cloneGarrison(ss.defGar);
  return {
    winner: ss.winner,
    attackerLosses: diffCounts(ss.attStart, attSurv),
    defenderLosses: diffCounts(ss.defStart, defSurv),
    attackerSurvivors: attSurv,
    defenderSurvivors: defSurv,
    rounds: ss.rounds,
    log: ss.log,
  };
}

// One-shot convenience: create + auto-run a (possibly empty) command script
// (default 'assault-troops' once the script runs out) + outcome. Used by the UI
// AUTO control and the headless self-test. Deterministic given the same seed.
export function autoResolveSiege(ss, script) {
  let i = 0;
  while (!ss.finished) {
    let cmd = script && i < script.length ? script[i] : null;
    if (!cmd) {
      // Default smart policy: batter the wall while it stands, then storm.
      cmd = ss.wallHp > 0 ? 'assault-wall' : 'assault-troops';
    }
    siegeStep(ss, cmd);
    i++;
    if (i > MAX_ROUNDS + 4) { finishSiege(ss); break; }
  }
  return ss;
}

export default {
  createSiege,
  siegeStep,
  resolveSiege,
  autoResolveSiege,
  siegePower,
  stackSize,
  isEmpty,
  MAX_ROUNDS,
};
