// src/data/map.js — contract D (content-lore)
// Native ES module. Pure data, no imports.
//
// Province graph of the continent of Aden (+ the Isle of Souls & the Gracia marches).
// x,y normalized 0..1 (responsive). Origin top-left.
// terrain: 'plains' | 'forest' | 'mountain' | 'swamp' | 'coast'
// castle:true on the three crowns (gludio, giran, aden) + regional holds (goddard, rune).
//
// Layout loosely mirrors the L2 world:
//   Schuttgart NW highlands, Innadril/Heine NW coast, Elven Forest W, Dark Elf Vale (capital) SW,
//   Dwarven Village in the W mountains, Gludio/Dion/Floran SW lowlands, Giran central-east coast,
//   Oren heartland, Aden royal seat N-center, Hardin's academy NE, Wastelands E,
//   Goddard SE highlands, Rune far SE swamps, the Isle of Souls (Kamael) off the SE coast,
//   and the Gracia marches (Gracia / Seed of Destruction / Wall of Argos / Aien Krol) to the far E.
//
// Adjacency is SYMMETRIC and the whole map is ONE connected graph.

export const PROVINCES = [
  { id: 'schuttgart',      nameKey: 'prov.schuttgart',      x: 0.16, y: 0.16, terrain: 'mountain', castle: false, neighbors: ['innadril', 'elvenforest'] },
  { id: 'innadril',        nameKey: 'prov.innadril',        x: 0.30, y: 0.10, terrain: 'coast',    castle: false, neighbors: ['schuttgart', 'aden', 'elvenforest'] },
  { id: 'elvenforest',     nameKey: 'prov.elvenforest',     x: 0.12, y: 0.38, terrain: 'forest',   castle: false, neighbors: ['schuttgart', 'innadril', 'darkelf', 'dwarvenvillage', 'gludio'] },
  { id: 'dwarvenvillage',  nameKey: 'prov.dwarvenvillage',  x: 0.06, y: 0.54, terrain: 'mountain', castle: false, neighbors: ['elvenforest', 'darkelf'] },
  { id: 'darkelf',         nameKey: 'prov.darkelf',         x: 0.14, y: 0.66, terrain: 'swamp',    castle: false, neighbors: ['elvenforest', 'dwarvenvillage', 'gludio', 'floran'] },
  { id: 'gludio',          nameKey: 'prov.gludio',          x: 0.30, y: 0.56, terrain: 'plains',   castle: true,  neighbors: ['elvenforest', 'darkelf', 'floran', 'dion', 'oren'] },
  { id: 'floran',          nameKey: 'prov.floran',          x: 0.30, y: 0.80, terrain: 'plains',   castle: false, neighbors: ['darkelf', 'gludio', 'dion', 'isleofsouls'] },
  { id: 'dion',            nameKey: 'prov.dion',            x: 0.46, y: 0.72, terrain: 'plains',   castle: false, neighbors: ['gludio', 'floran', 'giran', 'oren'] },
  { id: 'giran',           nameKey: 'prov.giran',           x: 0.60, y: 0.62, terrain: 'coast',    castle: true,  neighbors: ['dion', 'oren', 'goddard', 'rune'] },
  { id: 'oren',            nameKey: 'prov.oren',            x: 0.50, y: 0.44, terrain: 'plains',   castle: false, neighbors: ['gludio', 'dion', 'giran', 'aden', 'wastelands'] },
  { id: 'aden',            nameKey: 'prov.aden',            x: 0.50, y: 0.24, terrain: 'plains',   castle: true,  neighbors: ['innadril', 'oren', 'hardins', 'wastelands'] },
  { id: 'hardins',         nameKey: 'prov.hardins',         x: 0.68, y: 0.18, terrain: 'mountain', castle: false, neighbors: ['aden', 'wastelands'] },
  { id: 'wastelands',      nameKey: 'prov.wastelands',      x: 0.74, y: 0.40, terrain: 'mountain', castle: false, neighbors: ['aden', 'oren', 'hardins', 'goddard', 'gracia'] },
  { id: 'goddard',         nameKey: 'prov.goddard',         x: 0.80, y: 0.62, terrain: 'mountain', castle: true,  neighbors: ['giran', 'wastelands', 'rune', 'gracia'] },
  { id: 'rune',            nameKey: 'prov.rune',            x: 0.74, y: 0.82, terrain: 'swamp',    castle: true,  neighbors: ['giran', 'goddard', 'isleofsouls'] },
  { id: 'isleofsouls',     nameKey: 'prov.isleofsouls',     x: 0.58, y: 0.90, terrain: 'coast',    castle: false, neighbors: ['rune', 'floran'] },
  // — Gracia marches (eastern continent, reached via the Wastelands/Goddard) —
  { id: 'gracia',          nameKey: 'prov.gracia',          x: 0.90, y: 0.50, terrain: 'plains',   castle: false, neighbors: ['wastelands', 'goddard', 'seedofdestruction', 'wallofargos'] },
  { id: 'seedofdestruction', nameKey: 'prov.seedofdestruction', x: 0.96, y: 0.30, terrain: 'mountain', castle: false, neighbors: ['gracia', 'aienkrol'] },
  { id: 'wallofargos',     nameKey: 'prov.wallofargos',     x: 0.94, y: 0.70, terrain: 'mountain', castle: false, neighbors: ['gracia', 'aienkrol'] },
  { id: 'aienkrol',        nameKey: 'prov.aienkrol',        x: 0.99, y: 0.50, terrain: 'forest',   castle: false, neighbors: ['seedofdestruction', 'wallofargos'] },
];

// Game-start ownership. Each of the 6 playable factions gets capital + 1 province;
// 1-2 fringe provinces seeded to Shilen; the rest neutral (incl. the 3 crown castles).
export const START_OWNER = {
  // Human — Kingdom of Aden (capital Hardin's Academy + the Wastelands road; the
  //   crown seat of Aden itself is a NEUTRAL objective)
  hardins: 'human',
  wastelands: 'human',
  // Elf — Forest of Elmore (capital Oren + Innadril)
  oren: 'elf',
  innadril: 'elf',
  // Orc — Clan of Schuttgart (NW highlands + the Elven Forest marches)
  schuttgart: 'orc',
  elvenforest: 'orc',
  // Dark Elf — Vale of Shadows (capital darkelf + Floran lowland)
  darkelf: 'darkelf',
  floran: 'darkelf',
  // Dwarf — Mountain Guilds (capital Dwarven Village + Gracia trade road)
  dwarvenvillage: 'dwarf',
  gracia: 'dwarf',
  // Kamael — Isle of Souls (capital isleofsouls + Wall of Argos foothold)
  isleofsouls: 'kamael',
  wallofargos: 'kamael',
  // Shilen — Undead Legion incursion footholds on the dark fringes
  rune: 'shilen',
  aienkrol: 'shilen',
  // (everything else — incl. crown castles gludio/giran/aden — defaults to NEUTRAL)
};

export const NEUTRAL = 'neutral';
