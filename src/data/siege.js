// src/data/siege.js — feat/siege (data only, no imports)
// Tunable balance data for CITY SIEGES. Pure ES module, no imports.
//
// A siege replaces the open-field tactical battle when the attacker assaults an
// enemy city province whose Walls building level > 0. The defender hides behind
// a standing wall: while the wall has integrity > 0 they fight with a big
// defensive bonus and the attacker cannot decisively storm them. The attacker
// must first chip the wall down (siege weapons / brute force) to open a breach,
// after which the fight resolves like a normal field battle.

// Wall hit-points indexed by the Walls building level (0,1,2). Tunable.
//   level 0 -> no wall (siege degenerates into an ordinary battle)
//   level 1 -> 300 HP, level 2 -> 650 HP.
export const WALL_HP_PER_LEVEL = [0, 300, 650];

// Defender multiplier applied to their effective defense + effective-HP while
// the wall still stands (integrity > 0). Mirrors combat.js's FORTIFY_DEF_BONUS
// philosophy but is stronger — a standing wall is a serious advantage. Once the
// wall is breached this drops to 1.0 and the fight is an even field battle.
export const STANDING_WALL_DEF_BONUS = 1.6;

// Base wall damage a single attacking unit contributes per 'assault-wall' round,
// scaled by its attack stat. Even a unit with no siege gear can batter a gate,
// just slowly. Tunable.
export const BASE_BATTER_PER_UNIT = 1.4;

// How much attacker attrition an 'assault-wall' round costs relative to a full
// troop clash: storming the wall is dangerous but the defenders are busy
// holding it, so the attacker takes only a fraction of a normal round's losses
// and deals none to the garrison (they are hitting stone, not men).
export const WALL_ASSAULT_ATTACKER_RISK = 0.45;

// Siege-weapon / bonus definitions. Units of a matching `type` contribute extra
// wall damage; this lets a balanced army (with heavy infantry / cavalry / mages)
// crack walls faster than pure skirmishers. `mul` multiplies that unit's batter
// contribution; `flat` adds a flat siege-power per such unit. Tunable.
export const SIEGE_WEAPONS = {
  // Battering ram: heavy infantry shove a ram into the gate.
  ram: { id: 'ram', nameKey: 'siege.weapon.ram', appliesTo: ['inf'], mul: 1.6, flat: 2.0 },
  // Catapult: cavalry/heavy crews and siege artillery lob stones over the wall.
  catapult: { id: 'catapult', nameKey: 'siege.weapon.catapult', appliesTo: ['cav'], mul: 2.0, flat: 3.5 },
  // Sappers: mages scorch and crack masonry.
  sapper: { id: 'sapper', nameKey: 'siege.weapon.sapper', appliesTo: ['mag'], mul: 1.8, flat: 2.0 },
};

// Per-unit-type siege-power lookup derived from SIEGE_WEAPONS: { type:{mul,flat} }.
// Types with no entry use {mul:1, flat:0}. Consumed by src/siege.js.
export const SIEGE_POWER_BY_TYPE = (() => {
  const out = {};
  for (const k in SIEGE_WEAPONS) {
    const w = SIEGE_WEAPONS[k];
    for (const ty of w.appliesTo) {
      const cur = out[ty] || { mul: 1, flat: 0 };
      // If multiple weapons map to a type, keep the strongest.
      out[ty] = {
        mul: Math.max(cur.mul, w.mul),
        flat: Math.max(cur.flat, w.flat),
      };
    }
  }
  return out;
})();

export default {
  WALL_HP_PER_LEVEL,
  STANDING_WALL_DEF_BONUS,
  BASE_BATTER_PER_UNIT,
  WALL_ASSAULT_ATTACKER_RISK,
  SIEGE_WEAPONS,
  SIEGE_POWER_BY_TYPE,
};
