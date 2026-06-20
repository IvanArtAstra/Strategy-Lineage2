// src/td.js — owner feat/td (NEW)
// Deterministic-ish real-time WAVE DEFENSE simulation (tower defense).
//
// Pure logic, no DOM. The UI (td_ui.js) drives this with fixed/variable dt and
// renders the resulting state; headless tests drive it the same way. All
// randomness flows through a seeded rng (./rng.js) so the same seed + the same
// scripted actions (placeTower/upgradeTower/startNextWave) + the same dt
// sequence reproduce identical state, frame for frame.
//
// Public API (interfaces-v4 §1):
//   createDefense({ faction, provId, seed, difficulty }) -> TDState
//   tdStep(td, dtMs)
//   placeTower(td, slotId, towerId) -> { ok, reason? }
//   upgradeTower(td, slotId) -> { ok, reason? }
//   startNextWave(td) -> { ok, reason? }
//   tdStatus(td) -> { wave, totalWaves, lives, gold, building, over, won }
//   tdReward(td) -> { adena, wood, crystal, units? }

import { makeRng } from './rng.js';
import { TOWERS, TOWERS_BY_ID } from './data/towers.js';
import { MOBS, WAVES } from './data/waves.js';

// ---------------------------------------------------------------------------
// Tuning constants (all deterministic).
// ---------------------------------------------------------------------------
const START_GOLD = 200;        // starting tower budget
const START_LIVES = 20;        // core integrity
const WAVE_STIPEND = 0;        // additional flat stipend per wave (waves carry own reward)
const SLOW_DURATION_MS = 1200; // how long a frost slow lasts after the last hit
const PROJECTILE_SPEED = 420;  // px/sec for visible projectiles
const SIM_DT_CAP = 50;         // clamp a single sub-step (ms) to keep math stable
const DIFFICULTY = {
  easy:   { gold: 1.25, hp: 0.85, lives: 25 },
  normal: { gold: 1.0,  hp: 1.0,  lives: 20 },
  hard:   { gold: 0.85, hp: 1.2,  lives: 15 },
};

// ---------------------------------------------------------------------------
// Path + slot layout.
// A logical coordinate space of 1000 x 600; the UI scales it to the canvas.
// The path is a polyline of waypoints from the spawn (left) to the core
// (right). Tower slots flank the path. Both are deterministic (no rng).
// ---------------------------------------------------------------------------
const FIELD_W = 1000;
const FIELD_H = 600;

const PATH = [
  { x: -30, y: 120 },
  { x: 240, y: 120 },
  { x: 240, y: 360 },
  { x: 520, y: 360 },
  { x: 520, y: 120 },
  { x: 780, y: 120 },
  { x: 780, y: 420 },
  { x: 1030, y: 420 }, // core just off the right edge
];

// Tower slots: fixed buildable pads beside the path.
const SLOTS = [
  { id: 0, x: 130, y: 240 },
  { id: 1, x: 360, y: 230 },
  { id: 2, x: 360, y: 470 },
  { id: 3, x: 630, y: 240 },
  { id: 4, x: 650, y: 470 },
  { id: 5, x: 660, y: 60  },
  { id: 6, x: 890, y: 300 },
  { id: 7, x: 890, y: 540 },
  { id: 8, x: 120, y: 30  },
  { id: 9, x: 430, y: 110 },
];

// Total path length + cumulative segment lengths (for distance->point lookup).
function buildPathMeta(path) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    segs.push({ a, b, len, ux: len ? dx / len : 0, uy: len ? dy / len : 0, start: total });
    total += len;
  }
  return { segs, total };
}

// Map a distance-along-path -> {x,y}. Clamped to [0,total].
function pointAt(meta, dist) {
  const d = dist < 0 ? 0 : dist > meta.total ? meta.total : dist;
  const segs = meta.segs;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (d <= s.start + s.len || i === segs.length - 1) {
      const local = d - s.start;
      return { x: s.a.x + s.ux * local, y: s.a.y + s.uy * local };
    }
  }
  const last = segs[segs.length - 1];
  return { x: last.b.x, y: last.b.y };
}

// ---------------------------------------------------------------------------
// createDefense
// ---------------------------------------------------------------------------
export function createDefense(opts) {
  opts = opts || {};
  const diffKey = (opts.difficulty in DIFFICULTY) ? opts.difficulty : 'normal';
  const diff = DIFFICULTY[diffKey];
  const seed = (typeof opts.seed === 'number' ? opts.seed : 0x5117e2) >>> 0;
  const meta = buildPathMeta(PATH);

  const td = {
    faction: opts.faction || null,
    provId: opts.provId != null ? opts.provId : null,
    difficulty: diffKey,
    seed: seed,
    rng: makeRng(seed),

    fieldW: FIELD_W,
    fieldH: FIELD_H,
    path: PATH.map((p) => ({ x: p.x, y: p.y })),
    pathMeta: meta,
    pathLen: meta.total,
    slots: SLOTS.map((s) => ({ id: s.id, x: s.x, y: s.y, tower: null })),

    lives: diff.lives | 0,
    gold: Math.round(START_GOLD * diff.gold),
    hpMul: diff.hp,

    waveIndex: -1,        // -1 = no wave started yet
    totalWaves: WAVES.length,
    building: true,       // true between waves (player can build); false while a wave is live
    spawnQueue: [],       // pending spawns for the active wave: { type, at, hpMul }
    spawnClock: 0,        // ms accumulated since wave start (drives the queue)

    mobs: [],             // live mobs
    towers: [],           // convenience mirror of slot.tower objects (live towers)
    projectiles: [],      // visible projectiles (cosmetic + delayed splash)

    nextMobId: 1,
    nextProjId: 1,
    clock: 0,             // total sim time (ms)

    over: false,
    won: false,
    wavesCleared: 0,      // fully-cleared waves (for reward scaling)
  };
  return td;
}

// ---------------------------------------------------------------------------
// Wave control
// ---------------------------------------------------------------------------
export function startNextWave(td) {
  if (!td || td.over) return { ok: false, reason: 'over' };
  if (!td.building) return { ok: false, reason: 'wave-active' };
  const next = td.waveIndex + 1;
  if (next >= WAVES.length) return { ok: false, reason: 'no-more-waves' };

  td.waveIndex = next;
  td.building = false;
  td.spawnClock = 0;
  td.spawnQueue = [];

  const wave = WAVES[next];
  const waveHpMul = (wave.hpMul || 1) * td.hpMul;
  let t = 0;
  for (const group of (wave.mobs || [])) {
    const gap = Math.max(1, group.gap | 0);
    for (let i = 0; i < (group.count | 0); i++) {
      td.spawnQueue.push({ type: group.type, at: t, hpMul: waveHpMul });
      t += gap;
    }
  }
  // Sort by spawn time (groups are sequential; stable for equal times).
  td.spawnQueue.sort((a, b) => a.at - b.at);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Build / upgrade
// ---------------------------------------------------------------------------
export function placeTower(td, slotId, towerId) {
  if (!td || td.over) return { ok: false, reason: 'over' };
  const slot = td.slots.find((s) => s.id === slotId);
  if (!slot) return { ok: false, reason: 'no-slot' };
  if (slot.tower) return { ok: false, reason: 'occupied' };
  const def = TOWERS_BY_ID[towerId];
  if (!def) return { ok: false, reason: 'no-tower' };
  if (td.gold < def.cost) return { ok: false, reason: 'gold' };

  td.gold -= def.cost;
  const tower = {
    id: td.nextProjId++,        // unique runtime id (reuse proj counter is fine; distinct namespace)
    slotId: slot.id,
    towerId: def.id,
    level: 0,                   // index into def.levels
    x: slot.x, y: slot.y,
    cooldown: 0,                // ms until it can fire again
    invested: def.cost,         // total gold spent (for sell value)
    angle: 0,                   // facing (cosmetic)
  };
  slot.tower = tower;
  td.towers.push(tower);
  return { ok: true };
}

export function upgradeTower(td, slotId) {
  if (!td || td.over) return { ok: false, reason: 'over' };
  const slot = td.slots.find((s) => s.id === slotId);
  if (!slot || !slot.tower) return { ok: false, reason: 'empty' };
  const tower = slot.tower;
  const def = TOWERS_BY_ID[tower.towerId];
  if (!def) return { ok: false, reason: 'no-tower' };
  const cur = def.levels[tower.level];
  if (!cur || !cur.upgradeCost) return { ok: false, reason: 'max-level' };
  if (td.gold < cur.upgradeCost) return { ok: false, reason: 'gold' };

  td.gold -= cur.upgradeCost;
  tower.invested += cur.upgradeCost;
  tower.level += 1;
  return { ok: true };
}

// Sell a built tower for a fraction of its investment.
export function sellTower(td, slotId) {
  if (!td || td.over) return { ok: false, reason: 'over' };
  const slot = td.slots.find((s) => s.id === slotId);
  if (!slot || !slot.tower) return { ok: false, reason: 'empty' };
  const tower = slot.tower;
  const refund = Math.floor(tower.invested * 0.6);
  td.gold += refund;
  td.towers = td.towers.filter((tw) => tw !== tower);
  slot.tower = null;
  return { ok: true, refund };
}

// ---------------------------------------------------------------------------
// Simulation step
// ---------------------------------------------------------------------------
export function tdStep(td, dtMs) {
  if (!td || td.over) return;
  let remaining = Math.max(0, dtMs | 0);
  // Sub-step so a large dt (tab refocus) doesn't let mobs teleport past towers.
  while (remaining > 0) {
    const step = Math.min(SIM_DT_CAP, remaining);
    subStep(td, step);
    remaining -= step;
    if (td.over) break;
  }
}

function subStep(td, dt) {
  const dtSec = dt / 1000;
  td.clock += dt;

  // 1) Spawn mobs from the queue for the active wave.
  if (!td.building) {
    td.spawnClock += dt;
    while (td.spawnQueue.length && td.spawnQueue[0].at <= td.spawnClock) {
      const spec = td.spawnQueue.shift();
      spawnMob(td, spec);
    }
  }

  // 2) Move mobs along the path; expire slows.
  for (const m of td.mobs) {
    if (m.dead) continue;
    let spd = m.speed;
    if (m.slowUntil > td.clock) spd *= (1 - m.slowFactor);
    m.dist += spd * dtSec;
    const p = pointAt(td.pathMeta, m.dist);
    m.x = p.x; m.y = p.y;
    if (m.dist >= td.pathLen) {
      // Reached the core: costs a life, mob removed.
      m.dead = true;
      m.escaped = true;
      td.lives -= 1;
      if (td.lives <= 0) { td.lives = 0; }
    }
  }

  // 3) Towers acquire targets and fire.
  for (const tw of td.towers) {
    if (tw.cooldown > 0) tw.cooldown -= dt;
    const def = TOWERS_BY_ID[tw.towerId];
    if (!def) continue;
    const lvl = def.levels[tw.level];
    if (!lvl) continue;
    // Acquire: the live, in-range mob furthest along the path (closest to core).
    const target = acquireTarget(td, tw, lvl.range);
    if (target) {
      tw.angle = Math.atan2(target.y - tw.y, target.x - tw.x);
      if (tw.cooldown <= 0) {
        fire(td, tw, def, lvl, target);
        tw.cooldown += 1000 / Math.max(0.05, lvl.fireRate);
      }
    }
  }

  // 4) Advance projectiles (cosmetic travel; damage applied on placement at fire
  //    time for determinism, so projectiles are purely visual here).
  for (const pr of td.projectiles) {
    pr.t += dt;
    const frac = pr.dur > 0 ? Math.min(1, pr.t / pr.dur) : 1;
    pr.x = pr.x0 + (pr.x1 - pr.x0) * frac;
    pr.y = pr.y0 + (pr.y1 - pr.y0) * frac;
    if (frac >= 1) pr.done = true;
  }
  td.projectiles = td.projectiles.filter((p) => !p.done);

  // 5) Reap dead mobs; award bounty for kills (not for escapes).
  if (td.mobs.some((m) => m.dead)) {
    const survivors = [];
    for (const m of td.mobs) {
      if (m.dead) {
        if (!m.escaped && !m.bountyPaid) { td.gold += m.bounty; m.bountyPaid = true; }
        continue;
      }
      survivors.push(m);
    }
    td.mobs = survivors;
  }

  // 6) Check loss.
  if (td.lives <= 0) {
    td.over = true;
    td.won = false;
    return;
  }

  // 7) Wave clear: queue drained AND no live mobs.
  if (!td.building && td.spawnQueue.length === 0 && td.mobs.length === 0) {
    const wave = WAVES[td.waveIndex];
    td.gold += (wave && wave.reward ? wave.reward : 0) + WAVE_STIPEND;
    td.wavesCleared = td.waveIndex + 1;
    if (td.waveIndex + 1 >= WAVES.length) {
      // All waves cleared -> win.
      td.over = true;
      td.won = true;
    } else {
      td.building = true; // back to build phase
    }
  }
}

function spawnMob(td, spec) {
  const base = MOBS[spec.type];
  if (!base) return;
  // Tiny deterministic speed jitter via the seeded rng (keeps the stream
  // advancing identically for identical scripts).
  const jitter = 0.96 + td.rng() * 0.08; // [0.96, 1.04)
  const hp = Math.max(1, Math.round(base.hp * (spec.hpMul || 1)));
  td.mobs.push({
    id: td.nextMobId++,
    type: spec.type,
    sprite: base.sprite,
    nameKey: base.nameKey,
    hpMax: hp,
    hp: hp,
    speed: base.speed * jitter,
    baseSpeed: base.speed,
    bounty: base.bounty,
    dist: 0,
    x: td.path[0].x, y: td.path[0].y,
    slowUntil: 0,
    slowFactor: 0,
    dead: false,
    escaped: false,
    bountyPaid: false,
  });
}

function acquireTarget(td, tw, range) {
  const r2 = range * range;
  let best = null;
  let bestDist = -1;
  for (const m of td.mobs) {
    if (m.dead) continue;
    const dx = m.x - tw.x, dy = m.y - tw.y;
    if (dx * dx + dy * dy <= r2) {
      // Prefer the mob furthest along the path (most dangerous).
      if (m.dist > bestDist) { bestDist = m.dist; best = m; }
    }
  }
  return best;
}

function applyDamage(td, mob, dmg, def) {
  if (!mob || mob.dead) return;
  let d = dmg;
  if (def && def.id === 'holy') {
    // bonusUndead handled by caller via level; nothing extra here.
  }
  mob.hp -= d;
  if (mob.hp <= 0) {
    mob.hp = 0;
    mob.dead = true;
  }
}

function fire(td, tw, def, lvl, target) {
  // Compute damage (holy amplifies vs undead — all mobs are undead).
  let dmg = lvl.damage;
  if (lvl.bonusUndead) dmg = Math.round(dmg * lvl.bonusUndead);

  // Primary hit.
  applyDamage(td, target, dmg, def);

  // Slow (frost): refresh the slow window.
  if (lvl.slow && !target.dead) {
    target.slowFactor = lvl.slow;
    target.slowUntil = td.clock + SLOW_DURATION_MS;
  }

  // Splash (cannon): damage other mobs within splash radius of the target.
  if (lvl.splash) {
    const sr2 = lvl.splash * lvl.splash;
    for (const m of td.mobs) {
      if (m === target || m.dead) continue;
      const dx = m.x - target.x, dy = m.y - target.y;
      if (dx * dx + dy * dy <= sr2) {
        let sd = Math.round(dmg * 0.6);
        applyDamage(td, m, sd, def);
        if (lvl.slow) { m.slowFactor = lvl.slow; m.slowUntil = td.clock + SLOW_DURATION_MS; }
      }
    }
  }

  // Visual projectile.
  const dist = Math.hypot(target.x - tw.x, target.y - tw.y);
  td.projectiles.push({
    id: td.nextProjId++,
    kind: def.id,
    x0: tw.x, y0: tw.y, x: tw.x, y: tw.y,
    x1: target.x, y1: target.y,
    t: 0, dur: Math.max(40, (dist / PROJECTILE_SPEED) * 1000),
    splash: lvl.splash || 0,
    done: false,
  });
}

// ---------------------------------------------------------------------------
// Status + reward
// ---------------------------------------------------------------------------
export function tdStatus(td) {
  if (!td) return { wave: 0, totalWaves: WAVES.length, lives: 0, gold: 0, building: true, over: true, won: false };
  return {
    wave: td.waveIndex + 1,           // 1-based for display (0 before first wave)
    totalWaves: td.totalWaves,
    lives: td.lives,
    gold: td.gold,
    building: td.building,
    over: td.over,
    won: td.won,
    wavesCleared: td.wavesCleared,
  };
}

// Reward scales with waves cleared. Only meaningful when won, but always returns
// a coherent shape (a partial consolation could be wired by the client if desired;
// here non-won returns a zero reward).
export function tdReward(td) {
  if (!td) return { adena: 0, wood: 0, crystal: 0 };
  const cleared = td.wavesCleared | 0;
  const total = WAVES.length;
  if (!td.won) {
    return { adena: 0, wood: 0, crystal: 0 };
  }
  // Base + per-wave scaling. Full clear yields the top tier.
  const adena = 150 + cleared * 60;
  const wood = 40 + cleared * 12;
  const crystal = Math.floor(cleared / 2) * 5; // crystals only from deeper progress
  const reward = { adena, wood, crystal };

  // A small unit bounty for a full clear (or near-full) — Shilen relics raise
  // a few undead defenders for the faction capital. Uses a valid unit id.
  if (cleared >= total) {
    reward.units = { wraith: 3, bonearcher: 2 };
  } else if (cleared >= Math.ceil(total * 0.75)) {
    reward.units = { wraith: 1 };
  }
  return reward;
}

// Re-exports for the UI (so it can import data through one module if convenient).
export { TOWERS, MOBS, WAVES };
export default {
  createDefense, tdStep, placeTower, upgradeTower, sellTower,
  startNextWave, tdStatus, tdReward,
};
