// src/data/map.js — contract D (content-lore)
// Native ES module. Pure data, no imports.
//
// Province graph of the continent of Aden.
// x,y normalized 0..1 (responsive). Origin top-left.
// terrain: 'plains' | 'forest' | 'mountain' | 'swamp' | 'coast'
// castle:true on the three crowns (gludio, giran, aden) + regional holds (goddard, rune).
//
// Layout loosely mirrors the L2 Aden continent:
//   Schuttgart NW highlands, Innadril/Heine NW coast, Elven Forest & Dark Elf Vale W,
//   Gludio/Dion/Floran SW lowlands, Giran central-east coast, Oren heartland,
//   Aden royal seat N-center, Hardin's academy NE, Wastelands E, Goddard SE highlands,
//   Rune far SE swamps.
//
// Adjacency is SYMMETRIC and the whole map is ONE connected graph.

export const PROVINCES = [
  { id: 'schuttgart',  nameKey: 'prov.schuttgart',  x: 0.16, y: 0.16, terrain: 'mountain', castle: false, neighbors: ['innadril', 'elvenforest'] },
  { id: 'innadril',    nameKey: 'prov.innadril',    x: 0.30, y: 0.10, terrain: 'coast',    castle: false, neighbors: ['schuttgart', 'aden', 'elvenforest'] },
  { id: 'elvenforest', nameKey: 'prov.elvenforest', x: 0.12, y: 0.40, terrain: 'forest',   castle: false, neighbors: ['schuttgart', 'innadril', 'darkelf', 'gludio'] },
  { id: 'darkelf',     nameKey: 'prov.darkelf',     x: 0.14, y: 0.66, terrain: 'swamp',    castle: false, neighbors: ['elvenforest', 'gludio', 'floran'] },
  { id: 'gludio',      nameKey: 'prov.gludio',      x: 0.30, y: 0.56, terrain: 'plains',   castle: true,  neighbors: ['elvenforest', 'darkelf', 'floran', 'dion', 'oren'] },
  { id: 'floran',      nameKey: 'prov.floran',      x: 0.30, y: 0.80, terrain: 'plains',   castle: false, neighbors: ['darkelf', 'gludio', 'dion'] },
  { id: 'dion',        nameKey: 'prov.dion',        x: 0.46, y: 0.72, terrain: 'plains',   castle: false, neighbors: ['gludio', 'floran', 'giran', 'oren'] },
  { id: 'giran',       nameKey: 'prov.giran',       x: 0.60, y: 0.62, terrain: 'coast',    castle: true,  neighbors: ['dion', 'oren', 'goddard', 'rune'] },
  { id: 'oren',        nameKey: 'prov.oren',        x: 0.50, y: 0.44, terrain: 'plains',   castle: false, neighbors: ['gludio', 'dion', 'giran', 'aden', 'wastelands'] },
  { id: 'aden',        nameKey: 'prov.aden',        x: 0.50, y: 0.24, terrain: 'plains',   castle: true,  neighbors: ['innadril', 'oren', 'hardins', 'wastelands'] },
  { id: 'hardins',     nameKey: 'prov.hardins',     x: 0.68, y: 0.18, terrain: 'mountain', castle: false, neighbors: ['aden', 'wastelands'] },
  { id: 'wastelands',  nameKey: 'prov.wastelands',  x: 0.74, y: 0.40, terrain: 'mountain', castle: false, neighbors: ['aden', 'oren', 'hardins', 'goddard'] },
  { id: 'goddard',     nameKey: 'prov.goddard',     x: 0.80, y: 0.62, terrain: 'mountain', castle: true,  neighbors: ['giran', 'wastelands', 'rune'] },
  { id: 'rune',        nameKey: 'prov.rune',        x: 0.78, y: 0.82, terrain: 'swamp',    castle: true,  neighbors: ['giran', 'goddard'] },
];

// Game-start ownership. Playable capitals + 1-2 starting provinces each;
// 1-2 edge provinces seeded to Shilen; the rest neutral.
export const START_OWNER = {
  // Human — Kingdom of Aden (royal heartland)
  aden: 'human',
  hardins: 'human',
  // Elf — Forest of Elmore (central woods, capital Oren)
  oren: 'elf',
  innadril: 'elf',
  // Orc — Clan of Schuttgart (NW highlands)
  schuttgart: 'orc',
  elvenforest: 'orc',
  // Shilen — Undead Legion incursion footholds on the dark fringes
  rune: 'shilen',
  darkelf: 'shilen',
  // (everything else defaults to NEUTRAL in the engine)
};

export const NEUTRAL = 'neutral';
