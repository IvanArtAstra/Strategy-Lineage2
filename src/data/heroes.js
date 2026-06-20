// src/data/heroes.js — feat/heroes (content-lore, data only)
// Native ES module. Pure data, no imports.
//
// Recruitable HERO-COMMANDERS for "Lineage II: Thrones of Aden". Each hero
// belongs to a faction, leads a province's army (granting an atk/def multiplier
// in battle), levels up, and learns skills.
//
//   id        — stable hero id (also the key under state.heroes)
//   nameKey   — strings.js key (`hero.<id>`); UI falls back gracefully.
//   faction   — owning faction id (matches data/factions.js); a hero may only be
//               recruited by a province owned by this faction.
//   portrait  — index 0..5 into assets/heroes_sheet.png, sliced as a 3x2 grid.
//   cost      — Adena charged on recruit (deducted from the faction treasury).
//   baseAtk   — base attack rating (contributes to the army atk multiplier).
//   baseDef   — base defense rating (contributes to the army def multiplier).
//   skillKeys — ordered hero-skill string keys (`skill.hero.*`). The hero knows
//               skillKeys[0] from level 1; later skills unlock at level-up
//               thresholds (see heroes.js SKILL_UNLOCK_LEVELS).
//
// ~6 lore commanders, one per playable faction.
export const HEROES = [
  {
    id: 'knightcommander',
    nameKey: 'hero.knightcommander',
    faction: 'human',
    portrait: 0,
    cost: 320,
    baseAtk: 16,
    baseDef: 18,
    skillKeys: ['skill.hero.rally', 'skill.hero.aegis', 'skill.hero.valor'],
  },
  {
    id: 'rangerlord',
    nameKey: 'hero.rangerlord',
    faction: 'elf',
    portrait: 1,
    cost: 300,
    baseAtk: 20,
    baseDef: 12,
    skillKeys: ['skill.hero.volley', 'skill.hero.windwalk', 'skill.hero.eagleeye'],
  },
  {
    id: 'warlord',
    nameKey: 'hero.warlord',
    faction: 'orc',
    portrait: 2,
    cost: 300,
    baseAtk: 22,
    baseDef: 14,
    skillKeys: ['skill.hero.frenzy', 'skill.hero.warcry', 'skill.hero.bloodlust'],
  },
  {
    id: 'shillientemplar',
    nameKey: 'hero.shillientemplar',
    faction: 'darkelf',
    portrait: 3,
    cost: 310,
    baseAtk: 19,
    baseDef: 15,
    skillKeys: ['skill.hero.shadowstrike', 'skill.hero.drain', 'skill.hero.curse'],
  },
  {
    id: 'warsmithlord',
    nameKey: 'hero.warsmithlord',
    faction: 'dwarf',
    portrait: 4,
    cost: 290,
    baseAtk: 14,
    baseDef: 22,
    skillKeys: ['skill.hero.bulwark', 'skill.hero.ironwill', 'skill.hero.siegecraft'],
  },
  {
    id: 'soulchampion',
    nameKey: 'hero.soulchampion',
    faction: 'kamael',
    portrait: 5,
    cost: 330,
    baseAtk: 21,
    baseDef: 17,
    skillKeys: ['skill.hero.soulblade', 'skill.hero.wings', 'skill.hero.harvest'],
  },
];

// Convenience lookup by id (built once at module load).
export const HEROES_BY_ID = {};
for (const h of HEROES) HEROES_BY_ID[h.id] = h;

export default { HEROES, HEROES_BY_ID };
