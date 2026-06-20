// src/tactical.js — owner C (feat/tactical-battle)
// Deterministic battle MODEL for the interactive tactical screen.
//
// Mirrors src/combat.js's resolution so balance stays consistent: each round
// both sides deal pooled, COUNTER/terrain/fortify/numbers-modified damage and
// take attrition until one side is destroyed or a round cap is hit. The ONLY
// difference is that per-round PLAYER COMMANDS bias the round within a bounded
// band — good play shifts the result, but a hopeless fight stays hopeless.
//
// Determinism: the model owns no rng; battle_ui derives a seeded rng (rng.js)
// from opts.rngState/opts.seed and threads it in. Identical start + identical
// command sequence + identical rng => identical outcome. The outcome object is
// byte-shape-identical to combat.resolveBattle's return so the engine's
// applyBattleOutcome consumes it unchanged.
//
// No imports from engine/ui/render. Pure browser+ESM.

import { UNITS, COUNTER } from './data/units.js';

// ---- tunable constants (kept aligned with combat.js) ---------------------
export const MAX_ROUNDS = 12;
const FORTIFY_DEF_BONUS = 1.30;
const ATTACKER_PENALTY = 0.95;
const BASE_VARIANCE = 0.18;
const HEALER_HP_FACTOR = 1.6;
const MAGE_CLUSTER_BONUS = 0.4;
const MAGE_CLUSTER_THRESHOLD = 8;
const NUMBERS_EXP = 0.25;

// Player-command tuning. These are deliberately MODEST so a side that is
// outmatched on raw power cannot win on commands alone — they only swing the
// outcome inside the variance band combat.js already tolerates.
const FOCUS_BONUS = 0.18;      // extra dmg the player deals to the focused type
const FOCUS_SPREAD = 0.06;     // small dmg lost on non-focused types (focus cost)
const PUSH_ATK = 1.12;         // PUSH: more outgoing dmg ...
const PUSH_DEF = 0.90;         // ... but you soak more (lower own defense)
const HOLD_ATK = 0.90;         // HOLD: less outgoing dmg ...
const HOLD_DEF = 1.15;         // ... but you take less
const COMMAND_CAP = 1.35;      // hard ceiling on the combined player atk multiplier
const COMMAND_FLOOR = 0.70;    // hard floor on the combined own-defense multiplier

// "Reserve": a fraction of the player's army held back at the start. It deals
// no damage and takes no damage until COMMITTED, after which it fights fully.
const RESERVE_FRACTION = 0.30;

// ---- garrison helpers (same semantics as combat.js) ----------------------

export function stackSize(garrison) {
  let n = 0;
  for (const id in garrison) n += garrison[id] | 0;
  return n;
}

function cloneGarrison(g) {
  const out = {};
  for (const id in g) {
    const c = g[id] | 0;
    if (c > 0) out[id] = c;
  }
  return out;
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

// Distinct unit TYPES present in a garrison (UI uses this for FOCUS buttons).
export function presentTypes(garrison) {
  const seen = [];
  for (const id in garrison) {
    if ((garrison[id] | 0) <= 0) continue;
    const u = UNITS[id];
    if (!u) continue;
    if (!seen.includes(u.type)) seen.push(u.type);
  }
  return seen;
}

// Outgoing damage of `side` vs `foe`. `focusType` (optional) biases damage
// toward units of that type in the foe and slightly away from the rest.
function sidePower(side, foe, focusType) {
  const foeDominant = dominantType(foe);
  const foeSize = stackSize(foe);
  // Fraction of the foe that is the focused type (so focus on a tiny sliver of
  // the enemy yields little — you can't overfocus a near-absent type).
  let focusShare = 0;
  if (focusType && foeSize > 0) {
    let f = 0;
    for (const id in foe) {
      const u = UNITS[id];
      if (u && u.type === focusType) f += foe[id] | 0;
    }
    focusShare = f / foeSize;
  }
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
  if (focusType && focusShare > 0) {
    // Net: + on the focused portion, - on the rest. Scaled by share so the
    // bonus is real when the target type is meaningful and small otherwise.
    dmg *= 1 + FOCUS_BONUS * focusShare - FOCUS_SPREAD * (1 - focusShare);
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

function mergeInto(target, extra) {
  const out = Object.assign({}, target);
  for (const id in extra) {
    const c = extra[id] | 0;
    if (c > 0) out[id] = (out[id] | 0) + c;
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

// Split a garrison into [front, reserve] by holding back ~RESERVE_FRACTION of
// each stack (deterministic, count-based; at least 1 stays in front).
function splitReserve(garrison) {
  const front = {};
  const reserve = {};
  for (const id in garrison) {
    const c = garrison[id] | 0;
    if (c <= 0) continue;
    let res = Math.floor(c * RESERVE_FRACTION);
    if (res >= c) res = c - 1;       // never reserve the whole stack
    if (res < 0) res = 0;
    const f = c - res;
    if (f > 0) front[id] = f;
    if (res > 0) reserve[id] = res;
  }
  return [front, reserve];
}

// ---- battle state machine -------------------------------------------------
// The model is a small state machine the UI drives one round at a time, OR
// runs to completion (AUTO). The PLAYER is always the ATTACKER in this screen
// (the engine only opens a manual battle for the human's own attack); the
// defender uses a fixed deterministic policy so AUTO == manual-with-no-input
// stays reproducible.

// Create the initial battle state. `commandReserve` true means the player
// starts with a held reserve they can COMMIT later.
export function createBattle({ attacker, defender, terrain, fortified, useReserve = true }) {
  const attGar = cloneGarrison(attacker.garrison);
  const defGar = cloneGarrison(defender.garrison);
  let front = attGar;
  let reserve = {};
  if (useReserve && stackSize(attGar) >= 4) {
    [front, reserve] = splitReserve(attGar);
  }
  return {
    attackerFaction: attacker.faction,
    defenderFaction: defender.faction,
    terrain: terrain || 'plains',
    fortified: !!fortified,
    attStart: cloneGarrison(attGar),
    defStart: cloneGarrison(defGar),
    attFront: front,
    attReserve: reserve,
    reserveCommitted: stackSize(reserve) === 0,
    defGar,
    round: 0,
    finished: false,
    rounds: [],     // per-round detail for the engine outcome
    events: [],     // per-round UI detail (dmg numbers, etc.)
    log: [{
      key: 'battle.start',
      params: {
        attacker: attacker.faction,
        defender: defender.faction,
        terrain: terrain || 'plains',
        attackerCount: stackSize(attGar),
        defenderCount: stackSize(defGar),
        fortified: !!fortified,
      },
    }],
  };
}

// The full attacker garrison currently on the map (front + uncommitted reserve).
export function attackerGarrison(bs) {
  return mergeInto(bs.attFront, bs.reserveCommitted ? {} : bs.attReserve);
}

// Commit the held reserve into the front line (idempotent).
export function commitReserve(bs) {
  if (bs.reserveCommitted) return bs;
  bs.attFront = mergeInto(bs.attFront, bs.attReserve);
  bs.attReserve = {};
  bs.reserveCommitted = true;
  bs.events.push({ kind: 'commit', round: bs.round });
  return bs;
}

// Normalize a player command object into the multipliers we apply this round.
// command = { focus?: type, stance?: 'push'|'hold', commit?: bool }
function normalizeCommand(cmd) {
  const c = cmd || {};
  let atkMul = 1;
  let ownDefMul = 1;
  if (c.stance === 'push') { atkMul *= PUSH_ATK; ownDefMul *= PUSH_DEF; }
  else if (c.stance === 'hold') { atkMul *= HOLD_ATK; ownDefMul *= HOLD_DEF; }
  // clamp so commands stay within a band
  atkMul = Math.min(COMMAND_CAP, Math.max(1 / COMMAND_CAP, atkMul));
  ownDefMul = Math.max(COMMAND_FLOOR, Math.min(1 / COMMAND_FLOOR, ownDefMul));
  return { atkMul, ownDefMul, focus: c.focus || null };
}

// Resolve exactly ONE round given the player's command for it. Mutates and
// returns `bs`. Safe to call after finished (no-op). rng must be the seeded
// rng.js function.
export function stepRound(bs, command, rng) {
  if (bs.finished) return bs;
  if (command && command.commit) commitReserve(bs);

  const att = attackerGarrison(bs);
  const def = bs.defGar;
  if (isEmpty(att) || isEmpty(def) || bs.round >= MAX_ROUNDS) {
    return finishBattle(bs);
  }

  bs.round++;
  const { atkMul, ownDefMul, focus } = normalizeCommand(command);

  const attSize = stackSize(att);
  const defSize = stackSize(def);

  const attNumbers = Math.pow(attSize / Math.max(1, defSize), NUMBERS_EXP);
  const defNumbers = Math.pow(defSize / Math.max(1, attSize), NUMBERS_EXP);
  const fortMul = bs.fortified ? FORTIFY_DEF_BONUS : 1;
  const tm = terrainMods(bs.terrain);

  // Attacker (player) power: combat.js baseline + player FOCUS + stance atk.
  let attPower = sidePower(att, def, focus) * tm.atk * ATTACKER_PENALTY * attNumbers * atkMul;
  // Defender power: combat.js baseline, deterministic policy (no focus).
  let defPower = sidePower(def, att, null) * defNumbers;

  attPower *= 1 + (rng() * 2 - 1) * BASE_VARIANCE;
  defPower *= 1 + (rng() * 2 - 1) * BASE_VARIANCE;

  const defDefense = avgDef(def) * tm.def * fortMul;
  // Player stance changes ONLY their own incoming-damage soak (ownDefMul).
  const attDefense = avgDef(att) * ownDefMul;

  const dmgToDef = Math.max(0, attPower - defDefense * defSize * 0.5);
  const dmgToAtt = Math.max(0, defPower - attDefense * attSize * 0.5);

  const defLosses = applyDamage(def, dmgToDef, rng);
  // Damage to attacker only hits the FRONT line (reserve is held back safe).
  const attLosses = applyDamage(bs.attFront, dmgToAtt, rng);

  bs.defGar = subtract(def, defLosses);
  bs.attFront = subtract(bs.attFront, attLosses);

  const roundRec = {
    round: bs.round,
    attackerLosses: attLosses,
    defenderLosses: defLosses,
    attackerLeft: stackSize(attackerGarrison(bs)),
    defenderLeft: stackSize(bs.defGar),
  };
  bs.rounds.push(roundRec);
  bs.events.push({
    kind: 'clash',
    round: bs.round,
    dmgToDef: Math.round(dmgToDef),
    dmgToAtt: Math.round(dmgToAtt),
    attackerLosses: attLosses,
    defenderLosses: defLosses,
    focus: focus || null,
  });

  if (isEmpty(attackerGarrison(bs)) || isEmpty(bs.defGar) || bs.round >= MAX_ROUNDS) {
    finishBattle(bs);
  }
  return bs;
}

// Run every remaining round with a (possibly empty) scripted command list,
// then any further rounds with a default command. Used by AUTO/SKIP and by the
// headless self-test. Deterministic given the same rng + script.
export function autoResolve(bs, rng, script) {
  let i = 0;
  while (!bs.finished) {
    const cmd = script && i < script.length ? script[i] : {};
    stepRound(bs, cmd, rng);
    i++;
    // safety: stepRound always advances round or finishes; guard anyway.
    if (i > MAX_ROUNDS + 2) { finishBattle(bs); break; }
  }
  return bs;
}

function finishBattle(bs) {
  if (bs.finished) return bs;
  bs.finished = true;

  const att = attackerGarrison(bs);
  const def = bs.defGar;
  const attEmpty = isEmpty(att);
  const defEmpty = isEmpty(def);

  let winner;
  if (defEmpty && !attEmpty) winner = 'attacker';
  else if (attEmpty && !defEmpty) winner = 'defender';
  else if (attEmpty && defEmpty) winner = 'defender'; // mutual: defender holds
  else {
    const attHp = effectiveHp(att);
    const defHp = effectiveHp(def) * (bs.fortified ? FORTIFY_DEF_BONUS : 1);
    winner = attHp > defHp ? 'attacker' : 'defender';
  }
  bs.winner = winner;
  bs.log.push({
    key: winner === 'attacker' ? 'battle.win' : 'battle.loss',
    params: {
      attacker: bs.attackerFaction,
      defender: bs.defenderFaction,
      rounds: bs.round,
      attackerSurvivors: stackSize(att),
      defenderSurvivors: stackSize(def),
    },
  });
  return bs;
}

// Build the engine-facing outcome — IDENTICAL shape to combat.resolveBattle.
export function toOutcome(bs) {
  if (!bs.finished) finishBattle(bs);
  const attSurv = attackerGarrison(bs);
  const defSurv = bs.defGar;
  return {
    winner: bs.winner,
    attackerLosses: diffCounts(bs.attStart, attSurv),
    defenderLosses: diffCounts(bs.defStart, defSurv),
    attackerSurvivors: cloneGarrison(attSurv),
    defenderSurvivors: cloneGarrison(defSurv),
    rounds: bs.rounds,
    log: bs.log,
  };
}

// One-shot convenience: create + auto-resolve + outcome. Used as a safe
// fallback if the UI loop cannot run (still deterministic, still in-band).
export function resolveTactical({ attacker, defender, terrain, fortified, rng }, script) {
  const bs = createBattle({ attacker, defender, terrain, fortified, useReserve: false });
  autoResolve(bs, rng, script);
  return toOutcome(bs);
}

// Terrain table mirrors combat.js exactly.
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
