// src/data/campaign.js — owner: feat/campaign (interfaces-v4 §4)
// Pure data, native ES module, no imports.
//
// CAMPAIGN: a linked sequence of ~5 lore scenarios across the continent of Aden.
// Each scenario is a constrained skirmish with a fixed start, an objective, a
// reward, and an unlock link to the next chapter. The campaign logic in
// src/campaign.js consumes this; src/campaign_ui.js presents it.
//
// Faithful Lineage II "Thrones of Aden" progression — the Shilen (Undead Legion)
// incursion is pushed back chapter by chapter until the crowns of Aden are reclaimed:
//   1. Оборона Глудио    — hold the SW lowland gate against the first undead tide.
//   2. Возвращение Адена — retake the neutral royal seat of Aden.
//   3. Натиск Орков      — survive the Schuttgart orc-clan onslaught from the NW.
//   4. Тьма Шилен        — break the Undead Legion's eastern footholds (Rune).
//   5. Троны Адена       — the final crown war: hold all three crown castles.
//
// Scenario shape (interfaces-v4 §4):
//   { id, nameKey, descKey, playerFaction, startOwner:{provId:factionId},
//     enemyFactions:[...], objective:{type, target?, turns?}, reward:{adena,wood,crystal},
//     unlocksNext:true }
//
// objective.type ∈ 'holdCrowns' | 'captureProvince' | 'surviveTurns' | 'eliminate'
//   holdCrowns      — own >= target crown castles (gludio/giran/aden) at any check.
//   captureProvince — own province `target` (a provId).
//   surviveTurns    — reach turn `turns` with the player faction still alive.
//   eliminate       — `target` faction has no provinces left (eliminated).
//
// All province ids reference src/data/map.js; all faction ids reference
// src/data/factions.js (kept in sync but NOT imported, so this file stays pure data).

export const CROWN_CASTLES = ['gludio', 'giran', 'aden'];

export const CAMPAIGN = [
  {
    id: 'gludio_defense',
    nameKey: 'camp.gludio_defense.name',
    descKey: 'camp.gludio_defense.desc',
    playerFaction: 'human',
    // The Kingdom holds the Gludio gate + the elven-forest road; Shilen pours in
    // from the dark fringes (darkelf vale + floran lowland turned undead footholds).
    startOwner: {
      gludio: 'human',
      elvenforest: 'human',
      darkelf: 'shilen',
      floran: 'shilen',
    },
    enemyFactions: ['shilen'],
    objective: { type: 'surviveTurns', turns: 8 },
    reward: { adena: 300, wood: 30, crystal: 6 },
    unlocksNext: true,
  },
  {
    id: 'aden_reclaim',
    nameKey: 'camp.aden_reclaim.name',
    descKey: 'camp.aden_reclaim.desc',
    playerFaction: 'human',
    // From Oren and Innadril, march on the neutral royal seat of Aden.
    startOwner: {
      oren: 'human',
      innadril: 'human',
      aden: 'neutral',
      wastelands: 'shilen',
    },
    enemyFactions: ['shilen'],
    objective: { type: 'captureProvince', target: 'aden' },
    reward: { adena: 400, wood: 40, crystal: 10 },
    unlocksNext: true,
  },
  {
    id: 'orc_onslaught',
    nameKey: 'camp.orc_onslaught.name',
    descKey: 'camp.orc_onslaught.desc',
    playerFaction: 'human',
    // The Schuttgart orc clans descend from the NW highlands; hold the line.
    startOwner: {
      aden: 'human',
      innadril: 'human',
      oren: 'human',
      schuttgart: 'orc',
      elvenforest: 'orc',
    },
    enemyFactions: ['orc'],
    objective: { type: 'surviveTurns', turns: 10 },
    reward: { adena: 450, wood: 45, crystal: 12 },
    unlocksNext: true,
  },
  {
    id: 'shilen_dark',
    nameKey: 'camp.shilen_dark.name',
    descKey: 'camp.shilen_dark.desc',
    playerFaction: 'human',
    // Break the Undead Legion's far-SE stronghold at Rune; eliminate Shilen.
    startOwner: {
      giran: 'human',
      goddard: 'human',
      rune: 'shilen',
      isleofsouls: 'shilen',
      aienkrol: 'shilen',
    },
    enemyFactions: ['shilen'],
    objective: { type: 'eliminate', target: 'shilen' },
    reward: { adena: 550, wood: 50, crystal: 16 },
    unlocksNext: true,
  },
  {
    id: 'thrones_of_aden',
    nameKey: 'camp.thrones_of_aden.name',
    descKey: 'camp.thrones_of_aden.desc',
    playerFaction: 'human',
    // The crown war: the three crown castles start divided; unite them all.
    startOwner: {
      gludio: 'human',
      oren: 'human',
      giran: 'darkelf',
      aden: 'neutral',
      goddard: 'orc',
      rune: 'shilen',
    },
    enemyFactions: ['darkelf', 'orc', 'shilen'],
    objective: { type: 'holdCrowns', target: 3 },
    reward: { adena: 800, wood: 80, crystal: 30 },
    unlocksNext: false, // final chapter
  },
];

// Convenience: the ordered list of scenario ids (unlock order).
export const CAMPAIGN_ORDER = CAMPAIGN.map((s) => s.id);
