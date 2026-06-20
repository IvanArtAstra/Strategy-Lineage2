// src/rts.js — contract v5 §1
// Real-time RTS battle simulation for "Lineage II: Thrones of Aden".
// Pure, deterministic, headless-testable. No DOM, no Three.js, no timers.
//
// Drives the 3D/2D battle screen (rts_ui.js). The player controls the ATTACKER
// team via issueCommand; the DEFENDER is run by a simple built-in AI inside
// rtsStep (advance + engage nearest). When the fight ends, rtsOutcome() returns
// the COMMON battle outcome shape — IDENTICAL to combat.resolveBattle — computed
// from starting vs surviving per-unitId counts, so engine.applyBattleOutcome
// consumes it unchanged.
//
// Determinism: fixed timestep + seeded rng (mulberry32 from ./rng.js). The rng
// counter lives on state.rngState; same seed + same command stream + same dt
// sequence => byte-identical state.

import { UNITS, COUNTER } from './data/units.js';
import { makeRngFromState } from './rng.js';

// ---- tunable balance / sim constants --------------------------------------
const DEFAULT_FIELD_W = 100;
const DEFAULT_FIELD_H = 60;
const TIME_CAP_MS = 90000; // safety time cap (sim time) — guarantees termination

const MELEE_RANGE = 2.2; // logical range for melee types
const RANGED_RANGE = 16; // logical range for ranged types (arch/mag)
const AGGRO_RANGE = 40; // auto-acquire enemies within this distance
const SEPARATION_RADIUS = 2.4; // units push apart inside this radius
const SEPARATION_FORCE = 9; // separation strength (units/sec)

const ATTACK_PERIOD_MS = 900; // base cooldown between attacks
const DAMAGE_VARIANCE = 0.18; // +/- random swing on each hit (mirrors combat.js)
const DAMAGE_SCALE = 0.55; // global tuning so fights last a sensible duration
const DEF_SOAK = 0.5; // fraction of target def subtracted from a hit
const MAGE_CLUSTER_BONUS = 0.4; // extra mage dmg vs a clustered target
const MAGE_CLUSTER_THRESHOLD = 6; // nearby allies of target to count as clustered
const MAGE_CLUSTER_RADIUS = 6; // radius for counting a target's clustered allies

// Terrain multipliers (mirror combat.js): [attacker atk, defender def].
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

function counterMul(attType, defType) {
  if (COUNTER && COUNTER[attType] && typeof COUNTER[attType][defType] === 'number') {
    return COUNTER[attType][defType];
  }
  return 1.0;
}

// Per-unit derived movement speed (logical units / sec). Lighter/faster types
// move quicker; heavy infantry slower. Ranged keep their distance moving steady.
function deriveSpeed(u) {
  switch (u.type) {
    case 'cav': return 12;
    case 'arch': return 9;
    case 'mag': return 8;
    case 'heal': return 8;
    case 'undead': return 8;
    case 'inf': default: return 7;
  }
}

// Per-unit attack range: ranged types reach far, melee short.
function deriveRange(u) {
  if (u.type === 'arch' || u.type === 'mag') return RANGED_RANGE;
  return MELEE_RANGE;
}

// Expand a garrison {unitId:count} into individual Unit entities for `team`,
// laid out in a block formation that fills toward the field centre.
function spawnTeam(state, side, team, ids, originX, dirX) {
  const fieldH = state.field.h;
  // Build a flat list of (unitId) preserving a stable order for determinism.
  const list = [];
  for (const unitId of ids) {
    const c = side.garrison[unitId] | 0;
    for (let i = 0; i < c; i++) list.push(unitId);
  }
  const total = list.length;
  if (total === 0) return;
  // Rows along the field height; columns recede from the edge toward centre.
  const rows = Math.max(1, Math.min(total, Math.round(Math.sqrt(total * (fieldH / 12)))));
  const cols = Math.ceil(total / rows);
  const rowGap = fieldH / (rows + 1);
  const colGap = 3.0;
  for (let k = 0; k < total; k++) {
    const unitId = list[k];
    const u = UNITS[unitId];
    const row = k % rows;
    const col = Math.floor(k / rows);
    const x = originX + dirX * col * colGap;
    const y = rowGap * (row + 1);
    const maxHp = u.hp;
    state.units.push({
      id: state._nextId++,
      team,
      unitId,
      type: u.type,
      x,
      y,
      hp: maxHp,
      maxHp,
      atk: u.atk,
      def: u.def,
      range: deriveRange(u),
      speed: deriveSpeed(u),
      state: 'idle',
      targetId: null,
      moveTo: null,
      cd: 0, // ms until next attack allowed
      facing: dirX >= 0 ? 0 : Math.PI,
    });
  }
}

export function createRtsBattle({ attacker, defender, terrain, seed, fieldW, fieldH }) {
  const w = fieldW || DEFAULT_FIELD_W;
  const h = fieldH || DEFAULT_FIELD_H;
  const state = {
    field: { w, h },
    terrain: terrain || 'plains',
    seed: (seed >>> 0) || 1,
    rngState: (seed >>> 0) || 1,
    time: 0,
    units: [],
    teams: {
      attacker: { faction: attacker.faction, garrison: Object.assign({}, attacker.garrison) },
      defender: { faction: defender.faction, garrison: Object.assign({}, defender.garrison) },
    },
    // Starting counts per unitId (for the outcome diff).
    _attStart: Object.assign({}, attacker.garrison),
    _defStart: Object.assign({}, defender.garrison),
    over: false,
    winner: null,
    _nextId: 1,
  };
  // Deterministic id ordering: sort unitIds so spawn order is stable.
  const attIds = Object.keys(attacker.garrison).sort();
  const defIds = Object.keys(defender.garrison).sort();
  // Attacker on the left edge advancing right (+x); defender on the right edge.
  spawnTeam(state, state.teams.attacker, 'attacker', attIds, w * 0.12, +1);
  spawnTeam(state, state.teams.defender, 'defender', defIds, w * 0.88, -1);
  return state;
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

// Nearest living enemy of `u` within optional max range (squared compare).
function nearestEnemy(state, u, maxRange) {
  let best = null;
  let bestD = maxRange != null ? maxRange * maxRange : Infinity;
  for (const o of state.units) {
    if (o.state === 'dead') continue;
    if (o.team === u.team) continue;
    const d = dist2(u.x, u.y, o.x, o.y);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function findUnit(state, id) {
  for (const o of state.units) if (o.id === id) return o;
  return null;
}

// Count living allies of `target` within MAGE_CLUSTER_RADIUS (for mage bonus).
function clusterCount(state, target) {
  let n = 0;
  const r2 = MAGE_CLUSTER_RADIUS * MAGE_CLUSTER_RADIUS;
  for (const o of state.units) {
    if (o.state === 'dead') continue;
    if (o.team !== target.team) continue;
    if (dist2(target.x, target.y, o.x, o.y) <= r2) n++;
  }
  return n;
}

// One attack from `a` onto `t`. Damage = f(atk, def, COUNTER, terrain, jitter).
function performAttack(state, a, t, tm, rng) {
  let dmg = a.atk * counterMul(a.type, t.type) * DAMAGE_SCALE;
  if (a.team === 'attacker') dmg *= tm.atk; // terrain favours attack/def like combat.js
  // Defender terrain def bonus applies to soak below.
  if (a.type === 'mag') {
    if (clusterCount(state, t) >= MAGE_CLUSTER_THRESHOLD) dmg *= 1 + MAGE_CLUSTER_BONUS;
  }
  // Random swing (seeded).
  dmg *= 1 + (rng() * 2 - 1) * DAMAGE_VARIANCE;
  // Defense soak — scaled by terrain for the defending side.
  const defScale = t.team === 'defender' ? tm.def : 1;
  const soak = t.def * defScale * DEF_SOAK;
  dmg = Math.max(1, dmg - soak);
  t.hp -= dmg;
  if (t.hp <= 0) {
    t.hp = 0;
    t.state = 'dead';
    t.targetId = null;
    t.moveTo = null;
  }
}

// Move a unit toward (tx,ty) by up to its speed*dt, with separation steering.
function steerToward(state, u, tx, ty, dtSec) {
  let vx = 0;
  let vy = 0;
  const dx = tx - u.x;
  const dy = ty - u.y;
  const len = Math.hypot(dx, dy);
  if (len > 1e-4) {
    vx = (dx / len) * u.speed;
    vy = (dy / len) * u.speed;
  }
  // Separation: push away from too-close living neighbours.
  let sx = 0;
  let sy = 0;
  const r2 = SEPARATION_RADIUS * SEPARATION_RADIUS;
  for (const o of state.units) {
    if (o === u || o.state === 'dead') continue;
    const ddx = u.x - o.x;
    const ddy = u.y - o.y;
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 > 0 && d2 < r2) {
      const d = Math.sqrt(d2);
      const push = (SEPARATION_RADIUS - d) / SEPARATION_RADIUS;
      sx += (ddx / d) * push;
      sy += (ddy / d) * push;
    }
  }
  vx += sx * SEPARATION_FORCE;
  vy += sy * SEPARATION_FORCE;
  u.x += vx * dtSec;
  u.y += vy * dtSec;
  // Clamp to field.
  if (u.x < 0) u.x = 0;
  else if (u.x > state.field.w) u.x = state.field.w;
  if (u.y < 0) u.y = 0;
  else if (u.y > state.field.h) u.y = state.field.h;
  if (len > 1e-4) u.facing = Math.atan2(dy, dx);
}

function aliveCounts(state) {
  let a = 0;
  let d = 0;
  for (const o of state.units) {
    if (o.state === 'dead') continue;
    if (o.team === 'attacker') a++;
    else d++;
  }
  return { attacker: a, defender: d };
}

function teamHp(state, team) {
  let hp = 0;
  for (const o of state.units) {
    if (o.state === 'dead' || o.team !== team) continue;
    hp += o.hp;
  }
  return hp;
}

export function rtsStep(state, dtMs) {
  if (state.over) return state;
  const dt = dtMs;
  const dtSec = dt / 1000;
  state.time += dt;
  const tm = terrainMods(state.terrain);
  const rng = makeRngFromState(state.rngState);

  // Iterate in id order (units array is append-stable) for determinism.
  for (const u of state.units) {
    if (u.state === 'dead') continue;
    if (u.cd > 0) u.cd = Math.max(0, u.cd - dt);

    // (a) Validate / acquire target.
    let target = u.targetId != null ? findUnit(state, u.targetId) : null;
    if (target && (target.state === 'dead' || target.team === u.team)) {
      target = null;
      u.targetId = null;
    }
    // Defender AI + idle/attack-move attackers auto-acquire nearest in aggro.
    const wantsAuto = u.team === 'defender' || u.moveTo == null || u._attackMove;
    if (!target && wantsAuto) {
      const near = nearestEnemy(state, u, AGGRO_RANGE);
      if (near) {
        target = near;
        u.targetId = near.id;
      }
    }

    // (b)+(c) Act.
    if (target) {
      const d2 = dist2(u.x, u.y, target.x, target.y);
      const r = u.range;
      if (d2 <= r * r) {
        // In range: stop and attack on cooldown.
        u.state = 'attack';
        if (u.cd <= 0) {
          performAttack(state, u, target, tm, rng);
          u.cd = ATTACK_PERIOD_MS;
        }
      } else {
        // Close in on the target.
        u.state = 'move';
        steerToward(state, u, target.x, target.y, dtSec);
      }
    } else if (u.moveTo) {
      // Player move/attack-move with no enemy acquired: walk to the point.
      u.state = 'move';
      steerToward(state, u, u.moveTo.x, u.moveTo.y, dtSec);
      if (dist2(u.x, u.y, u.moveTo.x, u.moveTo.y) <= 1.0) {
        u.moveTo = null;
        u._attackMove = false;
        u.state = 'idle';
      }
    } else {
      u.state = 'idle';
    }
  }

  // Persist rng counter so the next step resumes bit-exact.
  state.rngState = rng.state >>> 0;

  // Termination: one side wiped, or the time cap reached.
  const alive = aliveCounts(state);
  if (alive.attacker === 0 || alive.defender === 0 || state.time >= TIME_CAP_MS) {
    state.over = true;
    if (alive.attacker > 0 && alive.defender === 0) state.winner = 'attacker';
    else if (alive.defender > 0 && alive.attacker === 0) state.winner = 'defender';
    else if (alive.attacker === 0 && alive.defender === 0) state.winner = 'defender';
    else {
      // Time cap with both alive: more survivors wins; tie-break on remaining HP;
      // final tie favours the defender (they hold the ground), mirroring combat.js.
      if (alive.attacker !== alive.defender) {
        state.winner = alive.attacker > alive.defender ? 'attacker' : 'defender';
      } else {
        const ah = teamHp(state, 'attacker');
        const dh = teamHp(state, 'defender');
        state.winner = ah > dh ? 'attacker' : 'defender';
      }
    }
  }
  return state;
}

export function issueCommand(state, unitIds, cmd) {
  if (!cmd || !unitIds) return state;
  const idSet = new Set(unitIds);
  for (const u of state.units) {
    // Player controls only the attacker team.
    if (u.team !== 'attacker') continue;
    if (u.state === 'dead') continue;
    if (!idSet.has(u.id)) continue;
    switch (cmd.type) {
      case 'move':
        u.moveTo = { x: cmd.x, y: cmd.y };
        u.targetId = null;
        u._attackMove = false;
        u.state = 'move';
        break;
      case 'attackMove':
        u.moveTo = { x: cmd.x, y: cmd.y };
        u.targetId = null;
        u._attackMove = true;
        u.state = 'move';
        break;
      case 'attack': {
        const t = findUnit(state, cmd.targetId);
        if (t && t.team !== u.team && t.state !== 'dead') {
          u.targetId = cmd.targetId;
          u.moveTo = null;
          u._attackMove = false;
          u.state = 'attack';
        }
        break;
      }
      case 'stop':
        u.moveTo = null;
        u.targetId = null;
        u._attackMove = false;
        u.state = 'idle';
        break;
      default:
        break;
    }
  }
  return state;
}

export function rtsStatus(state) {
  const alive = aliveCounts(state);
  let totalA = 0;
  let totalD = 0;
  for (const o of state.units) {
    if (o.team === 'attacker') totalA++;
    else totalD++;
  }
  return {
    over: state.over,
    winner: state.winner,
    time: state.time,
    alive,
    total: { attacker: totalA, defender: totalD },
  };
}

// Count surviving units per unitId for a team.
function survivorsByUnitId(state, team) {
  const out = {};
  for (const o of state.units) {
    if (o.team !== team || o.state === 'dead') continue;
    out[o.unitId] = (out[o.unitId] || 0) + 1;
  }
  return out;
}

function diffCounts(start, end) {
  const out = {};
  for (const id in start) {
    const lost = (start[id] | 0) - (end[id] || 0);
    if (lost > 0) out[id] = lost;
  }
  return out;
}

function stackSize(garrison) {
  let n = 0;
  for (const id in garrison) n += garrison[id] | 0;
  return n;
}

export function rtsOutcome(state) {
  const winner = state.winner || (state.over ? 'defender' : 'defender');
  const attackerSurvivors = survivorsByUnitId(state, 'attacker');
  const defenderSurvivors = survivorsByUnitId(state, 'defender');
  const attackerLosses = diffCounts(state._attStart, attackerSurvivors);
  const defenderLosses = diffCounts(state._defStart, defenderSurvivors);

  const log = [
    {
      key: 'battle.start',
      params: {
        attacker: state.teams.attacker.faction,
        defender: state.teams.defender.faction,
        terrain: state.terrain || 'plains',
        attackerCount: stackSize(state._attStart),
        defenderCount: stackSize(state._defStart),
        fortified: false,
      },
    },
    {
      key: winner === 'attacker' ? 'battle.win' : 'battle.loss',
      params: {
        attacker: state.teams.attacker.faction,
        defender: state.teams.defender.faction,
        rounds: Math.round(state.time / 1000),
        attackerSurvivors: stackSize(attackerSurvivors),
        defenderSurvivors: stackSize(defenderSurvivors),
      },
    },
  ];

  return {
    winner,
    attackerLosses,
    defenderLosses,
    attackerSurvivors,
    defenderSurvivors,
    rounds: [],
    log,
  };
}

export function unitsByTeam(state, team) {
  const out = [];
  for (const o of state.units) if (o.team === team) out.push(o);
  return out;
}
