// src/data/units.js — contract B (content-lore)
// Native ES module. Pure data, no imports.
//
// Unit archetypes for Lineage II: Thrones of Aden.
// type: 'inf' | 'arch' | 'cav' | 'mag' | 'heal' | 'undead'
//
// Balance intent (non-transitive counters):
//   Infantry  > Archers      (close the gap, shields out)
//   Archers   > Cavalry/Heavy (kite the chargers down)
//   Cavalry   > Infantry     (overrun the shield line)
//   Mages      = glass cannons: shred clustered infantry, melt to anything fast
//   Healers    extend a stack's effective HP, weak on their own
//   Undead     = Shilen's free, attrition-by-numbers tide

export const UNIT_TYPES = ['inf', 'arch', 'cav', 'mag', 'heal', 'undead'];

export const UNITS = {
  knight:     { id: 'knight',     nameKey: 'unit.knight',     type: 'inf',    cost: 120, upkeep: 8,  hp: 62, atk: 14, def: 19, factions: ['human', 'elf'] },
  gladiator:  { id: 'gladiator',  nameKey: 'unit.gladiator',  type: 'inf',    cost: 100, upkeep: 7,  hp: 48, atk: 20, def: 9,  factions: ['human', 'orc'] },
  ranger:     { id: 'ranger',     nameKey: 'unit.ranger',     type: 'arch',   cost: 110, upkeep: 8,  hp: 36, atk: 22, def: 6,  factions: ['human', 'elf'] },
  sorcerer:   { id: 'sorcerer',   nameKey: 'unit.sorcerer',   type: 'mag',    cost: 160, upkeep: 12, hp: 30, atk: 31, def: 4,  factions: ['human', 'elf'] },
  bishop:     { id: 'bishop',     nameKey: 'unit.bishop',     type: 'heal',   cost: 150, upkeep: 11, hp: 34, atk: 6,  def: 8,  factions: ['human', 'elf'] },
  destroyer:  { id: 'destroyer',  nameKey: 'unit.destroyer',  type: 'cav',    cost: 140, upkeep: 10, hp: 76, atk: 24, def: 12, factions: ['orc'] },
  // Dark Elf — Vale of Shadows (glass cannon: high atk, low def):
  shillienknight: { id: 'shillienknight', nameKey: 'unit.shillienknight', type: 'inf',  cost: 125, upkeep: 9,  hp: 54, atk: 21, def: 11, factions: ['darkelf'] },
  phantomranger:  { id: 'phantomranger',  nameKey: 'unit.phantomranger',  type: 'arch', cost: 115, upkeep: 8,  hp: 34, atk: 25, def: 5,  factions: ['darkelf'] },
  spellhowler:    { id: 'spellhowler',    nameKey: 'unit.spellhowler',    type: 'mag',  cost: 165, upkeep: 12, hp: 28, atk: 34, def: 4,  factions: ['darkelf'] },
  // Dwarf — Mountain Guilds (tanky, expensive plate, support smith):
  dwarvendefender: { id: 'dwarvendefender', nameKey: 'unit.dwarvendefender', type: 'inf',  cost: 130, upkeep: 9,  hp: 78, atk: 12, def: 24, factions: ['dwarf'] },
  bountyhunter:    { id: 'bountyhunter',    nameKey: 'unit.bountyhunter',    type: 'cav',  cost: 135, upkeep: 10, hp: 70, atk: 22, def: 14, factions: ['dwarf'] },
  warsmith:        { id: 'warsmith',        nameKey: 'unit.warsmith',        type: 'heal', cost: 145, upkeep: 10, hp: 40, atk: 8,  def: 12, factions: ['dwarf'] },
  // Kamael — Isle of Souls (balanced elites):
  soulsoldier: { id: 'soulsoldier', nameKey: 'unit.soulsoldier', type: 'inf',  cost: 125, upkeep: 9,  hp: 60, atk: 18, def: 16, factions: ['kamael'] },
  soulranger:  { id: 'soulranger',  nameKey: 'unit.soulranger',  type: 'arch', cost: 115, upkeep: 8,  hp: 38, atk: 23, def: 7,  factions: ['kamael'] },
  berserker:   { id: 'berserker',   nameKey: 'unit.berserker',   type: 'cav',  cost: 140, upkeep: 10, hp: 72, atk: 25, def: 11, factions: ['kamael'] },
  // Shilen — Undead Legion (AI-only, free, no upkeep):
  wraith:      { id: 'wraith',      nameKey: 'unit.wraith',      type: 'undead', cost: 0, upkeep: 0, hp: 44, atk: 18, def: 10, factions: ['shilen'] },
  bonearcher:  { id: 'bonearcher',  nameKey: 'unit.bonearcher',  type: 'arch',   cost: 0, upkeep: 0, hp: 30, atk: 20, def: 5,  factions: ['shilen'] },
  necromancer: { id: 'necromancer', nameKey: 'unit.necromancer', type: 'mag',    cost: 0, upkeep: 0, hp: 34, atk: 28, def: 6,  factions: ['shilen'] },
};

// Render token sprite for every unit id. One of:
// unit_knight | unit_ranger | unit_mage | unit_orc | unit_undead
// | unit_darkelf | unit_dwarf | unit_kamael
export const SPRITE_FOR = {
  knight:      'unit_knight',
  gladiator:   'unit_knight',
  ranger:      'unit_ranger',
  sorcerer:    'unit_mage',
  bishop:      'unit_mage',
  destroyer:   'unit_orc',
  // Dark Elf
  shillienknight: 'unit_darkelf',
  phantomranger:  'unit_darkelf',
  spellhowler:    'unit_darkelf',
  // Dwarf
  dwarvendefender: 'unit_dwarf',
  bountyhunter:    'unit_dwarf',
  warsmith:        'unit_dwarf',
  // Kamael
  soulsoldier: 'unit_kamael',
  soulranger:  'unit_kamael',
  berserker:   'unit_kamael',
  // Shilen
  wraith:      'unit_undead',
  bonearcher:  'unit_undead',
  necromancer: 'unit_undead',
};

// Non-transitive counter triangle.
// COUNTER[attackerType][defenderType] -> atk multiplier of attacker vs defender (~0.8..1.4).
// Rows read: "when THIS type attacks each defender type".
export const COUNTER = {
  //          inf    arch   cav    mag    heal   undead
  inf:    { inf: 1.00, arch: 1.35, cav: 0.85, mag: 1.10, heal: 1.20, undead: 1.05 },
  arch:   { inf: 0.85, arch: 1.00, cav: 1.35, mag: 1.15, heal: 1.10, undead: 1.10 },
  cav:    { inf: 1.35, arch: 0.80, cav: 1.00, mag: 1.30, heal: 1.25, undead: 1.00 },
  mag:    { inf: 1.40, arch: 1.05, cav: 0.90, mag: 1.00, heal: 1.15, undead: 1.20 },
  heal:   { inf: 0.85, arch: 0.85, cav: 0.85, mag: 0.90, heal: 1.00, undead: 0.95 },
  undead: { inf: 1.00, arch: 1.05, cav: 1.05, mag: 0.90, heal: 1.15, undead: 1.00 },
};
