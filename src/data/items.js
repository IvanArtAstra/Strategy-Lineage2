// src/data/items.js — feat/heroes (content-lore, data only)
// Native ES module. Pure data, no imports.
//
// Equippable ITEMS for hero-commanders. Three slots: a hero may hold at most one
// weapon, one armor and one trinket at a time (equipping a second of a slot
// swaps it out — see heroes.js equipItem). Equipped item stats add to the hero's
// effective atk/def (and hpPct, a battle-bonus amplifier).
//
//   id        — stable item id (also the inventory pool key).
//   nameKey   — strings.js key (`item.<id>`); UI falls back gracefully.
//   icon      — index 0..8 into assets/items_sheet.png, sliced as a 3x3 grid.
//   slot      — 'weapon' | 'armor' | 'trinket'.
//   atk?      — flat attack added to the hero's effective atk when equipped.
//   def?      — flat defense added to the hero's effective def when equipped.
//   hpPct?    — fractional bonus folded into the army battle multiplier (a small
//               extra edge representing the hero bolstering the troops' resilience).
//   dropWeight— relative weight for random drops (grantItem with no id picks
//               weighted by this); higher = more common.
//
// ~9 items spread across the three slots.
export const ITEMS = [
  // --- weapons ---
  { id: 'shortsword',   nameKey: 'item.shortsword',   icon: 0, slot: 'weapon',  atk: 4,  dropWeight: 10 },
  { id: 'warblade',     nameKey: 'item.warblade',     icon: 1, slot: 'weapon',  atk: 9,  dropWeight: 5 },
  { id: 'dragonslayer', nameKey: 'item.dragonslayer', icon: 2, slot: 'weapon',  atk: 16, hpPct: 0.04, dropWeight: 2 },
  // --- armor ---
  { id: 'leatherarmor', nameKey: 'item.leatherarmor', icon: 3, slot: 'armor',   def: 4,  dropWeight: 10 },
  { id: 'platearmor',   nameKey: 'item.platearmor',   icon: 4, slot: 'armor',   def: 9,  hpPct: 0.03, dropWeight: 5 },
  { id: 'bloodedmail',  nameKey: 'item.bloodedmail',  icon: 5, slot: 'armor',   def: 14, hpPct: 0.06, dropWeight: 2 },
  // --- trinkets ---
  { id: 'tigereye',     nameKey: 'item.tigereye',     icon: 6, slot: 'trinket', atk: 3,  def: 3,  dropWeight: 8 },
  { id: 'antharasring', nameKey: 'item.antharasring', icon: 7, slot: 'trinket', atk: 6,  hpPct: 0.05, dropWeight: 3 },
  { id: 'baiumtalisman',nameKey: 'item.baiumtalisman',icon: 8, slot: 'trinket', def: 6,  hpPct: 0.05, dropWeight: 3 },
];

// Convenience lookup by id (built once at module load).
export const ITEMS_BY_ID = {};
for (const it of ITEMS) ITEMS_BY_ID[it.id] = it;

export const ITEM_SLOTS = ['weapon', 'armor', 'trinket'];

export default { ITEMS, ITEMS_BY_ID, ITEM_SLOTS };
