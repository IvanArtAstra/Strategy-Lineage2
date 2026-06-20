// src/combat.js — contract F
// Pure, deterministic army-vs-army resolution.
//
// resolveBattle({ attacker, defender, terrain, defenderFortified, rng })
//   attacker/defender = { faction, garrison:{ unitId:count } }
//   -> { winner:'attacker'|'defender',
//        attackerLosses:{unitId:count}, defenderLosses:{unitId:count},
//        rounds:[...], log:[{key,params}] }
//
// Model: each side's stacks deal pooled damage per round, modified by the
// non-transitive COUNTER triangle, terrain, fortify and numbers. Healers
// add effective HP. Mages amplify vs. clustered (large) enemy stacks but are
// fragile (handled via their low hp in UNITS). Multi-round attrition until
// one side is destroyed or a round cap is hit (then higher remaining power
// wins). All randomness is via the injected seeded `rng`.

import { UNITS, COUNTER } from './data/units.js';

// ---- tunable balance constants -------------------------------------------
const MAX_ROUNDS = 12;
const FORTIFY_DEF_BONUS = 1.30; // defender def/effHP multiplier when fortified
const ATTACKER_PENALTY = 0.95; // slight edge to defender (besieging is hard)
const BASE_VARIANCE = 0.18; // +/- random swing on each round's damage
const HEALER_HP_FACTOR = 1.6; // healer hp counts this much toward effective HP
const MAGE_CLUSTER_BONUS = 0.4; // extra mage atk vs a clustered enemy stack
const MAGE_CLUSTER_THRESHOLD = 8; // enemy stack size that counts as "clustered"
const NUMBERS_EXP = 0.25; // diminishing bonus for the larger army

// Terrain multipliers: [attackerAtkMul, defenderDefMul]
const TERRAIN = {
  plains: { atk: 1.0, def: 1.0 },
  forest: { atk: 0.9, def: 1.15 }, // cover favors the defender
  mountain: { atk: 0.85, def: 1.25 }, // hard to assault
  swamp: { atk: 0.9, def: 1.05 },
  coast: { atk: 1.05, def: 0.95 },
};

function terrainMods(terrain) {
  return TERRAIN[terrain] || TERRAIN.plains;
}

function counterMul(attType, defType) {
  if (COUNTER && COUNTER[attType] && typeof COUNTER[attType][defType] === 'number') {
    return COUNTER[attType][defType];
  }
  return 1.0;
}

// Total living units in a garrison.
function stackSize(garrison) {
  let n = 0;
  for (const id in garrison) n += garrison[id] | 0;
  return n;
}

// Effective hit-point pool for a side (sum hp*count, healers boosted).
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

// Raw outgoing damage of `side` against `foe`, before terrain/fortify/numbers.
// Applies COUNTER triangle per stack vs the foe's dominant type, plus the
// mage-vs-cluster bonus.
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

// The enemy's most-numerous unit type (what your counters resolve against).
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

// Average defense rating of a garrison (used to soak incoming damage).
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

// Distribute `damage` of effective-HP loss across a garrison, returning a
// losses map {unitId:count}. Tougher (high hp+def) units die last. Uses rng
// to break ties on partial casualties deterministically.
function applyDamage(garrison, damage, rng) {
  const losses = {};
  if (damage <= 0) return losses;
  // Order ids: cheaper/frailer first (lower hp+def fall first).
  const ids = Object.keys(garrison).filter((id) => (garrison[id] | 0) > 0);
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
    // Fractional leftover kills a unit probabilistically (deterministic via rng).
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

function isEmpty(garrison) {
  for (const id in garrison) if ((garrison[id] | 0) > 0) return false;
  return true;
}

export function resolveBattle({ attacker, defender, terrain, defenderFortified, rng }) {
  const tm = terrainMods(terrain);
  // Working copies of each garrison (we mutate these across rounds).
  let attGar = Object.assign({}, attacker.garrison);
  let defGar = Object.assign({}, defender.garrison);
  const attStart = Object.assign({}, attGar);
  const defStart = Object.assign({}, defGar);

  const rounds = [];
  const log = [];

  log.push({
    key: 'battle.start',
    params: {
      attacker: attacker.faction,
      defender: defender.faction,
      terrain: terrain || 'plains',
      attackerCount: stackSize(attGar),
      defenderCount: stackSize(defGar),
      fortified: !!defenderFortified,
    },
  });

  let round = 0;
  while (round < MAX_ROUNDS && !isEmpty(attGar) && !isEmpty(defGar)) {
    round++;
    const attSize = stackSize(attGar);
    const defSize = stackSize(defGar);

    // Numbers advantage (diminishing): larger army hits a bit harder.
    const attNumbers = Math.pow(attSize / Math.max(1, defSize), NUMBERS_EXP);
    const defNumbers = Math.pow(defSize / Math.max(1, attSize), NUMBERS_EXP);

    const fortMul = defenderFortified ? FORTIFY_DEF_BONUS : 1;

    // Raw power.
    let attPower = sidePower(attGar, defGar) * tm.atk * ATTACKER_PENALTY * attNumbers;
    let defPower = sidePower(defGar, attGar) * defNumbers;

    // Random swing per side.
    attPower *= 1 + (rng() * 2 - 1) * BASE_VARIANCE;
    defPower *= 1 + (rng() * 2 - 1) * BASE_VARIANCE;

    // Defense soak: average def reduces incoming damage, scaled by terrain
    // (defender) and fortify.
    const defDefense = avgDef(defGar) * tm.def * fortMul;
    const attDefense = avgDef(attGar);

    const dmgToDef = Math.max(0, attPower - defDefense * defSize * 0.5);
    const dmgToAtt = Math.max(0, defPower - attDefense * attSize * 0.5);

    const defLosses = applyDamage(defGar, dmgToDef, rng);
    const attLosses = applyDamage(attGar, dmgToAtt, rng);

    attGar = subtract(attGar, attLosses);
    defGar = subtract(defGar, defLosses);

    rounds.push({
      round,
      attackerLosses: attLosses,
      defenderLosses: defLosses,
      attackerLeft: stackSize(attGar),
      defenderLeft: stackSize(defGar),
    });
  }

  // Decide winner.
  let winner;
  const attEmpty = isEmpty(attGar);
  const defEmpty = isEmpty(defGar);
  if (defEmpty && !attEmpty) winner = 'attacker';
  else if (attEmpty && !defEmpty) winner = 'defender';
  else if (attEmpty && defEmpty) winner = 'defender'; // mutual destruction: defender holds
  else {
    // Round cap reached with both alive: higher remaining effective HP wins;
    // ties favor the defender (they hold the ground).
    const attHp = effectiveHp(attGar);
    const defHp = effectiveHp(defGar) * (defenderFortified ? FORTIFY_DEF_BONUS : 1);
    winner = attHp > defHp ? 'attacker' : 'defender';
  }

  // Total losses = start minus survivors.
  const attackerLosses = diffCounts(attStart, attGar);
  const defenderLosses = diffCounts(defStart, defGar);

  log.push({
    key: winner === 'attacker' ? 'battle.win' : 'battle.loss',
    params: {
      attacker: attacker.faction,
      defender: defender.faction,
      rounds: round,
      attackerSurvivors: stackSize(attGar),
      defenderSurvivors: stackSize(defGar),
    },
  });

  return {
    winner,
    attackerLosses,
    defenderLosses,
    // surviving garrisons exposed for the engine to occupy/keep.
    attackerSurvivors: attGar,
    defenderSurvivors: defGar,
    rounds,
    log,
  };
}

function diffCounts(start, end) {
  const out = {};
  for (const id in start) {
    const lost = (start[id] | 0) - (end[id] | 0);
    if (lost > 0) out[id] = lost;
  }
  return out;
}
