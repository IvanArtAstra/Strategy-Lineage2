// src/data/towers.js — owner feat/td (NEW)
// Pure data, no imports. Tower definitions for the WAVE DEFENSE mini-game.
//
// Each tower:
//   id          stable string id (also localization fallback `tower.<id>`).
//   nameKey     localization key resolved via opts.t.
//   icon        0..5 sprite index into towers_sheet sliced as a 3x2 grid
//               (column = icon % 3, row = floor(icon / 3)).
//   cost        gold to place the tower at level 1.
//   levels      array; index = current level. Each level:
//               { damage, range, fireRate (shots/sec), upgradeCost (0 = max),
//                 splash?  (AoE radius applied to nearby mobs),
//                 slow?    (0..1 movement multiplier reduction for a moment),
//                 bonusUndead? (damage multiplier vs undead mobs — all TD mobs
//                               are Shilen undead, so this is a flat amplifier) }.
//
// Determinism: nothing random here; the sim seeds rng for spawn jitter only.

export const TOWERS = [
  {
    id: 'arrow', nameKey: 'tower.arrow', icon: 0, cost: 40,
    levels: [
      { damage: 8,  range: 120, fireRate: 1.2, upgradeCost: 30 },
      { damage: 16, range: 140, fireRate: 1.4, upgradeCost: 60 },
      { damage: 30, range: 160, fireRate: 1.6, upgradeCost: 0 },
    ],
  },
  {
    id: 'cannon', nameKey: 'tower.cannon', icon: 1, cost: 70,
    levels: [
      { damage: 24, range: 90,  fireRate: 0.6, splash: 30, upgradeCost: 60 },
      { damage: 46, range: 100, fireRate: 0.7, splash: 40, upgradeCost: 0 },
    ],
  },
  {
    id: 'frost', nameKey: 'tower.frost', icon: 2, cost: 60,
    levels: [
      { damage: 6,  range: 110, fireRate: 1.0, slow: 0.4,  upgradeCost: 55 },
      { damage: 12, range: 120, fireRate: 1.1, slow: 0.55, upgradeCost: 0 },
    ],
  },
  {
    id: 'holy', nameKey: 'tower.holy', icon: 3, cost: 90,
    levels: [
      { damage: 20, range: 130, fireRate: 1.0, bonusUndead: 1.5, upgradeCost: 70 },
      { damage: 36, range: 150, fireRate: 1.1, bonusUndead: 1.75, upgradeCost: 0 },
    ],
  },
  {
    id: 'ballista', nameKey: 'tower.ballista', icon: 4, cost: 110,
    levels: [
      { damage: 60,  range: 180, fireRate: 0.4, upgradeCost: 90 },
      { damage: 100, range: 200, fireRate: 0.45, upgradeCost: 0 },
    ],
  },
];

// Lookup by id (UI/sim convenience).
export const TOWERS_BY_ID = TOWERS.reduce((m, t) => { m[t.id] = t; return m; }, {});

export default TOWERS;
