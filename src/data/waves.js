// src/data/waves.js — owner feat/td (NEW)
// Pure data, no imports. Mob + wave definitions for the WAVE DEFENSE mini-game.
//
// MOBS: each Shilen-undead type references a sprite in mobs_sheet, sliced as a
//   1x4 grid (skeleton, ghoul, wraith, bonegolem) by its `sprite` index 0..3.
//     nameKey  localization key (fallback `mob.<id>`).
//     sprite   0..3 column in mobs_sheet.
//     hp       hit points at wave 1 (waves may scale this — see hpMul on a wave).
//     speed    px/sec along the path.
//     bounty   gold granted to the player when this mob dies.
//
// WAVES: ~8 escalating waves. Each wave:
//     mobs:   [{ type, count, gap }]  gap = ms between spawns within this group.
//             Groups within a wave spawn sequentially (the next group starts
//             after the previous group's last spawn).
//     reward? optional bonus gold (per-wave stipend) granted when the wave is
//             cleared, on top of bounties. A default stipend also applies.
//     hpMul?  optional multiplier on every mob's hp this wave (escalation).
//   The final wave includes a bonegolem boss.

export const MOBS = {
  skeleton:  { nameKey: 'mob.skeleton',  sprite: 0, hp: 40,  speed: 55, bounty: 12 },
  ghoul:     { nameKey: 'mob.ghoul',     sprite: 1, hp: 75,  speed: 42, bounty: 18 },
  wraith:    { nameKey: 'mob.wraith',    sprite: 2, hp: 55,  speed: 70, bounty: 20 },
  bonegolem: { nameKey: 'mob.bonegolem', sprite: 3, hp: 320, speed: 30, bounty: 80 },
};

export const WAVES = [
  // 1 — introduction: a trickle of skeletons.
  { mobs: [ { type: 'skeleton', count: 6, gap: 900 } ], reward: 20 },
  // 2 — more skeletons, faster cadence.
  { mobs: [ { type: 'skeleton', count: 10, gap: 750 } ], reward: 25 },
  // 3 — ghouls join.
  { mobs: [ { type: 'skeleton', count: 8, gap: 700 }, { type: 'ghoul', count: 4, gap: 1100 } ], reward: 30 },
  // 4 — fast wraiths test coverage.
  { mobs: [ { type: 'wraith', count: 8, gap: 600 }, { type: 'skeleton', count: 6, gap: 650 } ], reward: 35 },
  // 5 — mixed pressure, hp creep.
  { mobs: [ { type: 'ghoul', count: 8, gap: 750 }, { type: 'wraith', count: 6, gap: 550 } ], reward: 40, hpMul: 1.15 },
  // 6 — a single bonegolem flanked by skeletons.
  { mobs: [ { type: 'skeleton', count: 10, gap: 500 }, { type: 'bonegolem', count: 1, gap: 1 }, { type: 'ghoul', count: 6, gap: 700 } ], reward: 50, hpMul: 1.2 },
  // 7 — heavy mixed swarm.
  { mobs: [ { type: 'wraith', count: 10, gap: 480 }, { type: 'ghoul', count: 10, gap: 600 }, { type: 'skeleton', count: 10, gap: 450 } ], reward: 60, hpMul: 1.3 },
  // 8 — BOSS wave: twin bonegolems with an undead honor guard.
  { mobs: [ { type: 'ghoul', count: 8, gap: 500 }, { type: 'wraith', count: 8, gap: 500 }, { type: 'bonegolem', count: 1, gap: 1 }, { type: 'skeleton', count: 12, gap: 350 }, { type: 'bonegolem', count: 1, gap: 1 } ], reward: 120, hpMul: 1.4 },
];

export default { MOBS, WAVES };
