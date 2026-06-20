// src/data/buildings.js — contract v3 §3 (content-lore, data only)
// Native ES module. Pure data, no imports.
//
// Multi-resource economy + Heroes-of-M&M-style city buildings.
//
// RESOURCES: the three economy resources stored per faction.
//   adena (existing) | wood (NEW) | crystal (NEW)
//
// BUILDINGS: 9 city buildings. Each has levels[] (index 0 = level 1 ... up to maxLevel).
//   A city stores the current built level per buildingId (0 = not built). Once built,
//   a building's level effect applies each turn (resolved by the city engine, owner B).
//
// Each level shape (EXACT — keep this contract):
//   { cost:{adena?,wood?,crystal?}, buildTurns:int, effect:{ ... } }
//
// Effect types — the ONLY ones the city engine interprets:
//   produceRes  { type:'produceRes',  res:{adena?,wood?,crystal?} }   — add to owner resources each turn
//   produceUnit { type:'produceUnit', unitType, perTurns, count }     — every perTurns turns, add count of the
//                                                                        owner faction's roster unit of unitType
//   defense     { type:'defense',     fortify:bool, defBonus:float }  — mark province fortified / def bonus
//   heal        { type:'heal',        pct:float }                     — heal the province garrison each turn
//
// icon = index into assets/buildings_sheet.png, sliced as a 3x3 grid (0..8).
// Numbers are tunable; the SHAPE is fixed by the contract. ru+en for every bld.* name/desc in strings.js.

export const RESOURCES = ['adena', 'wood', 'crystal'];

export const BUILDINGS = [
  {
    id: 'townhall', nameKey: 'bld.townhall', descKey: 'bld.townhall.d', icon: 0,
    levels: [
      { cost: { adena: 0 },                          buildTurns: 0, effect: { type: 'produceRes', res: { adena: 30 } } }, // L1 free starter
      { cost: { adena: 240, wood: 15 },              buildTurns: 3, effect: { type: 'produceRes', res: { adena: 75 } } },
      { cost: { adena: 520, wood: 35, crystal: 6 },  buildTurns: 4, effect: { type: 'produceRes', res: { adena: 140 } } },
    ],
  },
  {
    id: 'lumbermill', nameKey: 'bld.lumbermill', descKey: 'bld.lumbermill.d', icon: 1,
    levels: [
      { cost: { adena: 120 },                        buildTurns: 2, effect: { type: 'produceRes', res: { wood: 8 } } },
      { cost: { adena: 240, wood: 10 },              buildTurns: 3, effect: { type: 'produceRes', res: { wood: 18 } } },
    ],
  },
  {
    id: 'crystalmine', nameKey: 'bld.crystalmine', descKey: 'bld.crystalmine.d', icon: 2,
    levels: [
      { cost: { adena: 200, wood: 10 },              buildTurns: 3, effect: { type: 'produceRes', res: { crystal: 3 } } },
      { cost: { adena: 380, wood: 25 },              buildTurns: 4, effect: { type: 'produceRes', res: { crystal: 7 } } },
    ],
  },
  {
    id: 'barracks', nameKey: 'bld.barracks', descKey: 'bld.barracks.d', icon: 3,
    levels: [
      { cost: { adena: 160, wood: 12 },              buildTurns: 2, effect: { type: 'produceUnit', unitType: 'inf', perTurns: 3, count: 1 } },
      { cost: { adena: 320, wood: 24, crystal: 4 },  buildTurns: 3, effect: { type: 'produceUnit', unitType: 'inf', perTurns: 2, count: 1 } },
    ],
  },
  {
    id: 'archery', nameKey: 'bld.archery', descKey: 'bld.archery.d', icon: 4,
    levels: [
      { cost: { adena: 170, wood: 14 },              buildTurns: 2, effect: { type: 'produceUnit', unitType: 'arch', perTurns: 3, count: 1 } },
    ],
  },
  {
    id: 'magetower', nameKey: 'bld.magetower', descKey: 'bld.magetower.d', icon: 5,
    levels: [
      { cost: { adena: 240, wood: 10, crystal: 6 },  buildTurns: 3, effect: { type: 'produceUnit', unitType: 'mag', perTurns: 4, count: 1 } },
    ],
  },
  {
    id: 'walls', nameKey: 'bld.walls', descKey: 'bld.walls.d', icon: 6,
    levels: [
      { cost: { adena: 140, wood: 20 },              buildTurns: 2, effect: { type: 'defense', fortify: true, defBonus: 0.15 } },
      { cost: { adena: 300, wood: 40, crystal: 5 },  buildTurns: 3, effect: { type: 'defense', fortify: true, defBonus: 0.30 } },
    ],
  },
  {
    id: 'market', nameKey: 'bld.market', descKey: 'bld.market.d', icon: 7,
    levels: [
      { cost: { adena: 150 },                        buildTurns: 2, effect: { type: 'produceRes', res: { adena: 25 } } },
    ],
  },
  {
    id: 'temple', nameKey: 'bld.temple', descKey: 'bld.temple.d', icon: 8,
    levels: [
      { cost: { adena: 220, crystal: 5 },            buildTurns: 3, effect: { type: 'heal', pct: 0.15 } },
    ],
  },
];
