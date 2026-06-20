// src/data/events.js — contract v2 §2 (content-lore, data only)
// Native ES module. Pure data, no imports.
//
// Declarative campaign events. The engine (src/events.js, owner B) interprets the
// trigger gate and applies the chosen choice's effects to the PLAYER faction
// (unless an effect carries its own target — none do here).
//
// Trigger grammar (all optional; ALL present keys must hold):
//   minTurn:n | maxTurn:n | owns:'any'|n (player province count >= n)
//   | hasAdenaMin:n | factionAny:['orc',...] (player faction in list)
// Effect grammar (allowed types ONLY):
//   adena{value}                       — add/subtract player Adena
//   blessIncome{turns,mult}            — temporary income multiplier
//   spawnUnits{unit,count,where}       — where: 'capital' | 'frontline'
//   spawnIncursion                     — Shilen undead stack attacks a player holding
//   fortifyCapital                     — fortify the player's capital for free
//   loseUnits{count}                   — lose units from a holding
//   revealMap                          — reveal the whole map
//   setFlag{flag}                      — set state.flags[flag]=true (v3 §8, drives event chains)
//
// Event-chain triggers (v3 §8, on top of the gate grammar above):
//   requiresFlag:'x'   — eligible only if state.flags.x is truthy
//   forbidsFlag:'x'    — eligible only if state.flags.x is falsy
//
// All title/desc/choice-label/result strings live in src/strings.js (ru+en).

export const EVENTS = [
  {
    id: 'omen_of_shilen',
    weight: 12,
    oncePerGame: true,
    trigger: { minTurn: 3, maxTurn: 40, owns: 'any' },
    titleKey: 'ev.omen.title',
    descKey: 'ev.omen.desc',
    choices: [
      { id: 'pray',   labelKey: 'ev.omen.pray',   effects: [{ type: 'adena', value: -60 }, { type: 'blessIncome', turns: 3, mult: 1.25 }], resultKey: 'ev.omen.pray.r' },
      { id: 'ignore', labelKey: 'ev.omen.ignore', effects: [{ type: 'spawnIncursion' }], resultKey: 'ev.omen.ignore.r' },
    ],
  },
  {
    id: 'einhasad_blessing',
    weight: 10,
    oncePerGame: true,
    trigger: { minTurn: 2, maxTurn: 50 },
    titleKey: 'ev.einhasad.title',
    descKey: 'ev.einhasad.desc',
    choices: [
      { id: 'tithe',  labelKey: 'ev.einhasad.tithe',  effects: [{ type: 'adena', value: -100 }, { type: 'fortifyCapital' }, { type: 'blessIncome', turns: 4, mult: 1.3 }], resultKey: 'ev.einhasad.tithe.r' },
      { id: 'refuse', labelKey: 'ev.einhasad.refuse', effects: [{ type: 'adena', value: 40 }], resultKey: 'ev.einhasad.refuse.r' },
    ],
  },
  {
    id: 'giant_relic',
    weight: 9,
    oncePerGame: true,
    trigger: { minTurn: 5, owns: 3 },
    titleKey: 'ev.relic.title',
    descKey: 'ev.relic.desc',
    choices: [
      { id: 'excavate', labelKey: 'ev.relic.excavate', effects: [{ type: 'adena', value: -80 }, { type: 'adena', value: 220 }], resultKey: 'ev.relic.excavate.r' },
      { id: 'seal',     labelKey: 'ev.relic.seal',     effects: [{ type: 'fortifyCapital' }], resultKey: 'ev.relic.seal.r' },
    ],
  },
  {
    id: 'clan_intrigue',
    weight: 10,
    trigger: { minTurn: 4, owns: 2 },
    titleKey: 'ev.intrigue.title',
    descKey: 'ev.intrigue.desc',
    choices: [
      { id: 'bribe',   labelKey: 'ev.intrigue.bribe',   effects: [{ type: 'adena', value: -90 }, { type: 'blessIncome', turns: 3, mult: 1.2 }], resultKey: 'ev.intrigue.bribe.r' },
      { id: 'purge',   labelKey: 'ev.intrigue.purge',   effects: [{ type: 'loseUnits', count: 2 }, { type: 'fortifyCapital' }], resultKey: 'ev.intrigue.purge.r' },
    ],
  },
  {
    id: 'orc_raid',
    weight: 11,
    trigger: { minTurn: 3, maxTurn: 45 },
    titleKey: 'ev.orcraid.title',
    descKey: 'ev.orcraid.desc',
    choices: [
      { id: 'pay',   labelKey: 'ev.orcraid.pay',   effects: [{ type: 'adena', value: -70 }], resultKey: 'ev.orcraid.pay.r' },
      { id: 'fight', labelKey: 'ev.orcraid.fight', effects: [{ type: 'spawnIncursion' }, { type: 'spawnUnits', unit: 'gladiator', count: 2, where: 'frontline' }], resultKey: 'ev.orcraid.fight.r' },
    ],
  },
  {
    id: 'merchant_caravan',
    weight: 10,
    trigger: { minTurn: 2, hasAdenaMin: 50 },
    titleKey: 'ev.caravan.title',
    descKey: 'ev.caravan.desc',
    choices: [
      { id: 'invest', labelKey: 'ev.caravan.invest', effects: [{ type: 'adena', value: -120 }, { type: 'blessIncome', turns: 5, mult: 1.35 }], resultKey: 'ev.caravan.invest.r' },
      { id: 'escort', labelKey: 'ev.caravan.escort', effects: [{ type: 'adena', value: 90 }], resultKey: 'ev.caravan.escort.r' },
    ],
  },
  {
    id: 'wandering_warsmith',
    weight: 8,
    oncePerGame: true,
    trigger: { minTurn: 6, owns: 2 },
    titleKey: 'ev.warsmith.title',
    descKey: 'ev.warsmith.desc',
    choices: [
      { id: 'commission', labelKey: 'ev.warsmith.commission', effects: [{ type: 'adena', value: -150 }, { type: 'spawnUnits', unit: 'dwarvendefender', count: 2, where: 'capital' }], resultKey: 'ev.warsmith.commission.r' },
      { id: 'dismiss',    labelKey: 'ev.warsmith.dismiss',    effects: [{ type: 'adena', value: 30 }], resultKey: 'ev.warsmith.dismiss.r' },
    ],
  },
  {
    id: 'shilen_plague',
    weight: 9,
    trigger: { minTurn: 8, maxTurn: 60, owns: 'any' },
    titleKey: 'ev.plague.title',
    descKey: 'ev.plague.desc',
    choices: [
      { id: 'quarantine', labelKey: 'ev.plague.quarantine', effects: [{ type: 'adena', value: -110 }, { type: 'fortifyCapital' }], resultKey: 'ev.plague.quarantine.r' },
      { id: 'endure',     labelKey: 'ev.plague.endure',     effects: [{ type: 'loseUnits', count: 3 }], resultKey: 'ev.plague.endure.r' },
    ],
  },
  {
    id: 'kamael_envoy',
    weight: 8,
    oncePerGame: true,
    trigger: { minTurn: 5 },
    titleKey: 'ev.kamael.title',
    descKey: 'ev.kamael.desc',
    choices: [
      { id: 'ally',   labelKey: 'ev.kamael.ally',   effects: [{ type: 'adena', value: -100 }, { type: 'spawnUnits', unit: 'soulsoldier', count: 2, where: 'frontline' }], resultKey: 'ev.kamael.ally.r' },
      { id: 'spurn',  labelKey: 'ev.kamael.spurn',  effects: [{ type: 'revealMap' }], resultKey: 'ev.kamael.spurn.r' },
    ],
  },
  {
    id: 'gracia_expedition',
    weight: 7,
    oncePerGame: true,
    trigger: { minTurn: 10, owns: 4, hasAdenaMin: 100 },
    titleKey: 'ev.gracia.title',
    descKey: 'ev.gracia.desc',
    choices: [
      { id: 'sail',   labelKey: 'ev.gracia.sail',   effects: [{ type: 'adena', value: -160 }, { type: 'revealMap' }, { type: 'blessIncome', turns: 4, mult: 1.25 }], resultKey: 'ev.gracia.sail.r' },
      { id: 'wait',   labelKey: 'ev.gracia.wait',   effects: [{ type: 'fortifyCapital' }], resultKey: 'ev.gracia.wait.r' },
    ],
  },
  {
    id: 'forgotten_temple',
    weight: 9,
    trigger: { minTurn: 4, maxTurn: 50 },
    titleKey: 'ev.temple.title',
    descKey: 'ev.temple.desc',
    choices: [
      { id: 'pray',    labelKey: 'ev.temple.pray',    effects: [{ type: 'blessIncome', turns: 3, mult: 1.2 }], resultKey: 'ev.temple.pray.r' },
      { id: 'plunder', labelKey: 'ev.temple.plunder', effects: [{ type: 'adena', value: 130 }, { type: 'spawnIncursion' }], resultKey: 'ev.temple.plunder.r' },
    ],
  },
  {
    id: 'antharas_stirs',
    weight: 6,
    oncePerGame: true,
    trigger: { minTurn: 14, owns: 4 },
    titleKey: 'ev.antharas.title',
    descKey: 'ev.antharas.desc',
    choices: [
      { id: 'fortify', labelKey: 'ev.antharas.fortify', effects: [{ type: 'adena', value: -140 }, { type: 'fortifyCapital' }, { type: 'spawnUnits', unit: 'knight', count: 3, where: 'capital' }], resultKey: 'ev.antharas.fortify.r' },
      { id: 'appease', labelKey: 'ev.antharas.appease', effects: [{ type: 'adena', value: -200 }, { type: 'blessIncome', turns: 5, mult: 1.4 }], resultKey: 'ev.antharas.appease.r' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LORE EVENT-CHAIN — "Семь Печатей" / "The Seven Seals" (v3 §8)
  //
  // A 3-step chain woven through the campaign. The Seals bind the slumbering
  // power of Shilen beneath Aden. The player chooses, across three revelations,
  // whether to serve the Lords of Dawn (uphold the Seals → a great boon) or the
  // Revolutionaries of Dusk (break the Seals → unleash the undead surge).
  //
  // Flags set / read:
  //   seals_started   — set by step 1 (player engages with the prophecy)
  //   seals_dawn      — set when the player chooses the Dawn (light) path
  //   seals_dusk      — set when the player chooses the Dusk (shadow) path
  //   seals_done      — set by step 3 (chain concluded; prevents re-fire)
  //
  // Step gating:
  //   1 seals_omen        — entry. No flag required; sets seals_started + a path flag.
  //   2 seals_strife      — requiresFlag:'seals_started', forbidsFlag:'seals_done'.
  //                         Branches read seals_dawn/seals_dusk via dedicated choices.
  //   3 seals_judgment    — requiresFlag:'seals_started', forbidsFlag:'seals_done'.
  //                         The culmination: big boon (Dawn) or undead surge (Dusk).
  // Each step is oncePerGame; minTurn spacing keeps them in order.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'seals_omen',
    weight: 14,
    oncePerGame: true,
    trigger: { minTurn: 4, maxTurn: 40, owns: 'any', forbidsFlag: 'seals_started' },
    titleKey: 'ev.seals1.title',
    descKey: 'ev.seals1.desc',
    choices: [
      {
        id: 'dawn',
        labelKey: 'ev.seals1.dawn',
        effects: [{ type: 'adena', value: -80 }, { type: 'setFlag', flag: 'seals_started' }, { type: 'setFlag', flag: 'seals_dawn' }, { type: 'fortifyCapital' }],
        resultKey: 'ev.seals1.dawn.r',
      },
      {
        id: 'dusk',
        labelKey: 'ev.seals1.dusk',
        effects: [{ type: 'adena', value: 120 }, { type: 'setFlag', flag: 'seals_started' }, { type: 'setFlag', flag: 'seals_dusk' }],
        resultKey: 'ev.seals1.dusk.r',
      },
    ],
  },
  {
    id: 'seals_strife',
    weight: 16,
    oncePerGame: true,
    trigger: { minTurn: 8, maxTurn: 55, requiresFlag: 'seals_started', forbidsFlag: 'seals_done' },
    titleKey: 'ev.seals2.title',
    descKey: 'ev.seals2.desc',
    choices: [
      {
        id: 'uphold',
        labelKey: 'ev.seals2.uphold',
        effects: [{ type: 'adena', value: -120 }, { type: 'setFlag', flag: 'seals_dawn' }, { type: 'blessIncome', turns: 4, mult: 1.3 }],
        resultKey: 'ev.seals2.uphold.r',
      },
      {
        id: 'shatter',
        labelKey: 'ev.seals2.shatter',
        effects: [{ type: 'setFlag', flag: 'seals_dusk' }, { type: 'spawnIncursion' }, { type: 'adena', value: 160 }],
        resultKey: 'ev.seals2.shatter.r',
      },
    ],
  },
  {
    id: 'seals_judgment',
    weight: 20,
    oncePerGame: true,
    trigger: { minTurn: 14, maxTurn: 80, requiresFlag: 'seals_started', forbidsFlag: 'seals_done' },
    titleKey: 'ev.seals3.title',
    descKey: 'ev.seals3.desc',
    choices: [
      {
        id: 'crown_dawn',
        labelKey: 'ev.seals3.dawn',
        effects: [{ type: 'setFlag', flag: 'seals_done' }, { type: 'adena', value: 260 }, { type: 'spawnUnits', unit: 'knight', count: 4, where: 'capital' }, { type: 'blessIncome', turns: 6, mult: 1.4 }, { type: 'fortifyCapital' }],
        resultKey: 'ev.seals3.dawn.r',
      },
      {
        id: 'crown_dusk',
        labelKey: 'ev.seals3.dusk',
        effects: [{ type: 'setFlag', flag: 'seals_done' }, { type: 'spawnIncursion' }, { type: 'spawnIncursion' }, { type: 'spawnUnits', unit: 'wraith', count: 4, where: 'frontline' }, { type: 'revealMap' }],
        resultKey: 'ev.seals3.dusk.r',
      },
    ],
  },
];
