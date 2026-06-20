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
    capital: 'aden',
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

export const PLAYABLE = ['human', 'elf', 'orc'];
