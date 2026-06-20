// src/data/factions.js — contract C (content-lore)
// Native ES module. Pure data, no imports.
//
// color  = ownership tint on the map.
// accent = secondary UI color.
// Crest order in crest_factions.png: Aden(human) topleft, Elf topright,
//   Orc bottomleft, Shilen bottomright.

export const FACTIONS = {
  human: {
    id: 'human',
    nameKey: 'fac.human',
    color: '#3b6fd4',
    accent: '#e8c45a',
    playable: true,
    capital: 'hardins', // royal seat of Aden is now a NEUTRAL crown objective; the
                        //   Kingdom rules from Hardin's Academy on the road to the throne
    incomeMul: 1.15,
    roster: ['knight', 'gladiator', 'ranger', 'sorcerer', 'bishop'],
  },
  elf: {
    id: 'elf',
    nameKey: 'fac.elf',
    color: '#2fa37a',
    accent: '#d8e8b0',
    playable: true,
    capital: 'oren',
    incomeMul: 1.35, // no crown-castle start: Elmore's trade compensates the income gap
    rangedBonus: 1.15,
    roster: ['knight', 'ranger', 'sorcerer', 'bishop'],
  },
  orc: {
    id: 'orc',
    nameKey: 'fac.orc',
    color: '#b5532a',
    accent: '#e0a04a',
    playable: true,
    capital: 'schuttgart',
    incomeMul: 1.25, // harsh mountain home, no crown: war-spoils offset the lean land
    meleeBonus: 1.2,
    costMul: 0.85,
    roster: ['gladiator', 'destroyer', 'ranger'],
  },
  darkelf: {
    id: 'darkelf',
    nameKey: 'fac.darkelf',
    color: '#8a4fae',
    accent: '#caa6e0',
    playable: true,
    capital: 'darkelf',
    incomeMul: 1.28, // swamp home, no crown: shadow-trade compensates a 3-unit roster with no healer
    meleeBonus: 1.15, // glass cannon: hits hard in melee...
    magicBonus: 1.2, //                 ...and harder with shadow magic, but fragile
    roster: ['shillienknight', 'phantomranger', 'spellhowler'],
  },
  dwarf: {
    id: 'dwarf',
    nameKey: 'fac.dwarf',
    color: '#caa23c',
    accent: '#e8d89a',
    playable: true,
    capital: 'dwarvenvillage',
    incomeMul: 1.35, // master traders & smiths — strong but no longer the runaway economy
    defBonus: 1.18, // tanky: dwarven plate and stubborn shield walls
    roster: ['dwarvendefender', 'bountyhunter', 'warsmith'],
  },
  kamael: {
    id: 'kamael',
    nameKey: 'fac.kamael',
    color: '#5a8fb0',
    accent: '#bcdce8',
    playable: true,
    capital: 'isleofsouls',
    incomeMul: 1.25, // isolated isle, no crown: war-honed efficiency offsets the lean land
    eliteBonus: 1.2, // the winged soldiers of the Isle of Souls — few but elite
    roster: ['soulsoldier', 'soulranger', 'berserker'],
  },
  shilen: {
    id: 'shilen',
    nameKey: 'fac.shilen',
    color: '#7d3fb0',
    accent: '#bfe0c0',
    playable: false,
    capital: null,
    roster: ['wraith', 'bonearcher', 'necromancer'],
  },
};

// Fixed pick order (crest_all.png is sliced as a 3×2 grid in this order).
export const PLAYABLE = ['human', 'elf', 'orc', 'darkelf', 'dwarf', 'kamael'];
