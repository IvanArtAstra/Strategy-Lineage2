// src/data/skills.js — contract v2 §3 (content-lore, data only)
// Native ES module. Pure data, no imports.
//
// Clan skills the player activates (engine: src/skills.js, owner B applies effects,
// charges cost, sets cooldown). target: 'ownProvince' | 'enemyProvince' | 'none'.
//
// Effect grammar (allowed types ONLY):
//   healGarrison{pct}            — heal a fraction of a garrison's losses/HP
//   smite{frac}                  — kill a fraction of a target enemy garrison
//   summon{unit,count}           — summon defenders into the target province
//   blessIncome{turns,mult}      — temporary income multiplier
//   fortifyFree                  — fortify the target province at no cost
//   adena{value}                 — gain Adena (treasury / scry-for-spoils)
//
// All name/desc strings live in src/strings.js (ru+en).

export const SKILLS = [
  {
    id: 'einhasad_blessing',
    nameKey: 'sk.einhasad.name',
    descKey: 'sk.einhasad.desc',
    cost: 120,
    cooldown: 4,
    target: 'ownProvince',
    effects: [{ type: 'healGarrison', pct: 0.5 }],
  },
  {
    id: 'shilen_smite',
    nameKey: 'sk.smite.name',
    descKey: 'sk.smite.desc',
    cost: 160,
    cooldown: 5,
    target: 'enemyProvince',
    effects: [{ type: 'smite', frac: 0.3 }],
  },
  {
    id: 'summon_defenders',
    nameKey: 'sk.summon.name',
    descKey: 'sk.summon.desc',
    cost: 140,
    cooldown: 4,
    target: 'ownProvince',
    effects: [{ type: 'summon', unit: 'knight', count: 3 }],
  },
  {
    id: 'trade_blessing',
    nameKey: 'sk.bless.name',
    descKey: 'sk.bless.desc',
    cost: 100,
    cooldown: 5,
    target: 'none',
    effects: [{ type: 'blessIncome', turns: 4, mult: 1.3 }],
  },
  {
    id: 'dwarven_bulwark',
    nameKey: 'sk.fortify.name',
    descKey: 'sk.fortify.desc',
    cost: 90,
    cooldown: 3,
    target: 'ownProvince',
    effects: [{ type: 'fortifyFree' }],
  },
  {
    id: 'scry_treasury',
    nameKey: 'sk.scry.name',
    descKey: 'sk.scry.desc',
    cost: 60,
    cooldown: 3,
    target: 'none',
    effects: [{ type: 'adena', value: 150 }],
  },
];
