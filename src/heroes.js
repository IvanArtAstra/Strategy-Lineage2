// src/heroes.js — feat/heroes (hero logic; pure, no DOM)
//
// Recruitable HERO-COMMANDERS. Heroes lead a province's army (granting an
// atk/def multiplier in battle), level up by gaining XP, learn skills at level
// thresholds, and equip items from a shared inventory pool. All state lives under
// `state.heroes` (JSON-serializable, lazily created). Every function is pure
// logic — no rendering, no timers — and deterministic.
//
// State shape (lazily created):
//   state.heroes = {
//     roster: {                       // recruited heroes, keyed by hero id
//       <heroId>: { id, level, xp, items:[itemId,...], provId|null }
//     },
//     inventory: { <itemId>: count }, // un-equipped item pool (counts)
//   }
//
// Engine integration: heroBattleBonus(state, provId) returns the {atkMul,defMul}
// the engine multiplies into a province's army strength in planBattle/combat.
// gainHeroXp is called on a battle win. registerHeroes() is an OPTIONAL engine
// hook (mirrors registerAi); it is a harmless no-op if the engine exposes no
// matching registrar, so the module degrades cleanly.

import { HEROES_BY_ID } from './data/heroes.js';
import { ITEMS_BY_ID, ITEM_SLOTS } from './data/items.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

// XP needed to REACH the next level, indexed by current level (1-based):
//   level 1 -> 2 needs LEVEL_XP[1], etc. Beyond the table heroes are max level.
// Cumulative thresholds are derived from these per-level deltas.
export const LEVEL_XP = [0, 100, 240, 440, 720, 1100];
export const MAX_LEVEL = LEVEL_XP.length; // 6

// Stat gain applied at each level-up (added to base on top of the previous level).
export const PER_LEVEL_ATK = 3;
export const PER_LEVEL_DEF = 3;

// Hero skills unlock as the hero reaches these levels (skillKeys[0] is known at
// level 1, skillKeys[1] at level 3, skillKeys[2] at level 5).
export const SKILL_UNLOCK_LEVELS = [1, 3, 5];

// How strongly hero stats translate into the army battle multiplier. Each point
// of effective atk/def adds this fraction; hpPct from items is added directly.
export const STAT_TO_MUL = 0.01;
// Cap the multiplier so a maxed hero is a strong edge, not an auto-win.
export const MAX_MUL = 2.5;

// ---------------------------------------------------------------------------
// Optional engine registration (mirrors registerAi). Resilient no-op when the
// engine exposes no hero registrar — the module still works fully on its own.
// ---------------------------------------------------------------------------
export function registerHeroes(engine) {
  try {
    const impl = {
      heroBattleBonus,
      heroAt,
      gainHeroXp,
      heroesRoster,
    };
    if (engine && typeof engine.registerHeroes === 'function') {
      engine.registerHeroes(impl);
      return impl;
    }
    // No engine passed / no registrar: harmless. The map client merges these
    // functions onto its engine facade directly (interfaces-v4 §6).
    return impl;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

// Lazily create + return the heroes substate. JSON-serializable.
export function ensureHeroState(state) {
  if (!state) return null;
  if (!state.heroes || typeof state.heroes !== 'object') {
    state.heroes = { roster: {}, inventory: {} };
  }
  if (!state.heroes.roster || typeof state.heroes.roster !== 'object') {
    state.heroes.roster = {};
  }
  if (!state.heroes.inventory || typeof state.heroes.inventory !== 'object') {
    state.heroes.inventory = {};
  }
  return state.heroes;
}

function provinceOwner(state, provId) {
  const p = state && state.provinces && state.provinces[provId];
  return p ? p.owner : null;
}

function factionAdena(state, faction) {
  const f = state && state.factions && state.factions[faction];
  return f && typeof f.adena === 'number' ? f.adena : 0;
}

// ---------------------------------------------------------------------------
// Recruiting / assignment
// ---------------------------------------------------------------------------

// Recruit a hero to a province. Charges the hero's adena cost from the
// province-owning faction and places the hero at the province. No-op (returns
// state unchanged) if the hero is unknown, already recruited, the province isn't
// owned by the hero's faction, or the faction can't afford it.
export function recruitHero(state, heroId, provId) {
  const hs = ensureHeroState(state);
  if (!hs) return state;
  const def = HEROES_BY_ID[heroId];
  if (!def) return state;
  if (hs.roster[heroId]) return state; // already recruited
  const owner = provinceOwner(state, provId);
  if (!owner || owner !== def.faction) return state; // wrong faction / unowned
  const cost = def.cost | 0;
  if (factionAdena(state, owner) < cost) return state; // can't afford
  state.factions[owner].adena -= cost;
  hs.roster[heroId] = { id: heroId, level: 1, xp: 0, items: [], provId: provId };
  return state;
}

// Move an already-recruited hero to a province owned by its faction. Ignored if
// the hero isn't recruited or the target isn't owned by the hero's faction.
export function assignHero(state, heroId, provId) {
  const hs = ensureHeroState(state);
  if (!hs) return state;
  const h = hs.roster[heroId];
  const def = HEROES_BY_ID[heroId];
  if (!h || !def) return state;
  if (provId == null) { h.provId = null; return state; } // unassign
  const owner = provinceOwner(state, provId);
  if (owner !== def.faction) return state;
  h.provId = provId;
  return state;
}

// ---------------------------------------------------------------------------
// Inventory / equipment
// ---------------------------------------------------------------------------

// Add an item to the shared inventory pool. With no itemId, picks one at random
// by dropWeight using the engine rng if available (kept deterministic), else the
// first item — but the common path passes an explicit id.
export function grantItem(state, itemId) {
  const hs = ensureHeroState(state);
  if (!hs) return state;
  let id = itemId;
  if (!id || !ITEMS_BY_ID[id]) {
    id = pickWeightedItem(state);
  }
  if (!id || !ITEMS_BY_ID[id]) return state;
  hs.inventory[id] = (hs.inventory[id] | 0) + 1;
  return state;
}

// Deterministic weighted pick over ITEMS by dropWeight. Uses a counter on the
// hero state so repeated calls without rng remain deterministic.
function pickWeightedItem(state) {
  const ids = Object.keys(ITEMS_BY_ID);
  if (ids.length === 0) return null;
  let total = 0;
  for (const id of ids) total += Math.max(0, ITEMS_BY_ID[id].dropWeight | 0);
  if (total <= 0) return ids[0];
  const hs = state.heroes;
  hs._dropCtr = ((hs._dropCtr | 0) * 1103515245 + 12345) >>> 0;
  let roll = hs._dropCtr % total;
  for (const id of ids) {
    roll -= Math.max(0, ITEMS_BY_ID[id].dropWeight | 0);
    if (roll < 0) return id;
  }
  return ids[ids.length - 1];
}

// Equip an item onto a hero (slot-based). The item must be available in the
// inventory pool. Equipping a second item of the same slot swaps the previous
// one back into inventory. No-op if hero/item unknown or item not in inventory.
export function equipItem(state, heroId, itemId) {
  const hs = ensureHeroState(state);
  if (!hs) return state;
  const h = hs.roster[heroId];
  const item = ITEMS_BY_ID[itemId];
  if (!h || !item) return state;
  if ((hs.inventory[itemId] | 0) <= 0) return state; // not available
  // Remove any currently-equipped item of the same slot (return it to pool).
  for (let i = h.items.length - 1; i >= 0; i--) {
    const cur = ITEMS_BY_ID[h.items[i]];
    if (cur && cur.slot === item.slot) {
      hs.inventory[cur.id] = (hs.inventory[cur.id] | 0) + 1;
      h.items.splice(i, 1);
    }
  }
  // Consume from inventory and equip.
  hs.inventory[itemId] -= 1;
  if (hs.inventory[itemId] <= 0) delete hs.inventory[itemId];
  h.items.push(itemId);
  return state;
}

// Unequip an item from a hero, returning it to the inventory pool. No-op if not
// equipped. (Exported as a convenience; the UI uses it for unequip.)
export function unequipItem(state, heroId, itemId) {
  const hs = ensureHeroState(state);
  if (!hs) return state;
  const h = hs.roster[heroId];
  if (!h) return state;
  const idx = h.items.indexOf(itemId);
  if (idx < 0) return state;
  h.items.splice(idx, 1);
  hs.inventory[itemId] = (hs.inventory[itemId] | 0) + 1;
  return state;
}

// ---------------------------------------------------------------------------
// Stats / leveling
// ---------------------------------------------------------------------------

// Sum of equipped-item bonuses for a hero record.
function itemBonuses(h) {
  let atk = 0, def = 0, hpPct = 0;
  for (const itemId of h.items || []) {
    const it = ITEMS_BY_ID[itemId];
    if (!it) continue;
    atk += it.atk || 0;
    def += it.def || 0;
    hpPct += it.hpPct || 0;
  }
  return { atk, def, hpPct };
}

// Effective stats for a recruited hero record: base + level growth + items.
function effectiveStats(h) {
  const def = HEROES_BY_ID[h.id];
  if (!def) return { atk: 0, def: 0, hpPct: 0 };
  const levels = Math.max(0, (h.level | 0) - 1);
  const ib = itemBonuses(h);
  return {
    atk: (def.baseAtk | 0) + levels * PER_LEVEL_ATK + ib.atk,
    def: (def.baseDef | 0) + levels * PER_LEVEL_DEF + ib.def,
    hpPct: ib.hpPct,
  };
}

// Cumulative XP required to have REACHED a given level (level 1 -> 0).
function xpForLevel(level) {
  let sum = 0;
  for (let i = 1; i < level && i < LEVEL_XP.length; i++) sum += LEVEL_XP[i];
  return sum;
}

// XP threshold (cumulative) for the NEXT level, or null at max.
function nextLevelXp(level) {
  if (level >= MAX_LEVEL) return null;
  return xpForLevel(level + 1);
}

// Skills currently known by a hero (by level), as the subset of skillKeys.
function knownSkills(h) {
  const def = HEROES_BY_ID[h.id];
  if (!def || !Array.isArray(def.skillKeys)) return [];
  const out = [];
  for (let i = 0; i < def.skillKeys.length; i++) {
    const unlockLvl = SKILL_UNLOCK_LEVELS[i] != null ? SKILL_UNLOCK_LEVELS[i] : (i * 2 + 1);
    if ((h.level | 0) >= unlockLvl) out.push(def.skillKeys[i]);
  }
  return out;
}

// Grant XP to the hero assigned at a province; level up across thresholds,
// adding stats (and implicitly unlocking skills). No-op if no hero there.
export function gainHeroXp(state, provId, amount) {
  const hs = ensureHeroState(state);
  if (!hs) return state;
  const h = heroRecordAt(state, provId);
  if (!h) return state;
  const add = Math.max(0, amount | 0);
  if (add <= 0) return state;
  h.xp = (h.xp | 0) + add;
  // Level up while the cumulative threshold for the next level is met.
  while (h.level < MAX_LEVEL) {
    const need = nextLevelXp(h.level);
    if (need == null || h.xp < need) break;
    h.level += 1;
  }
  // Cap stored xp at the max-level threshold so nextXp reads cleanly.
  if (h.level >= MAX_LEVEL) {
    const capped = xpForLevel(MAX_LEVEL);
    if (h.xp > capped) h.xp = capped;
  }
  return state;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

// Internal: the hero RECORD assigned to a province (or null).
function heroRecordAt(state, provId) {
  const hs = state && state.heroes;
  if (!hs || !hs.roster) return null;
  for (const id in hs.roster) {
    if (hs.roster[id] && hs.roster[id].provId === provId) return hs.roster[id];
  }
  return null;
}

// Public: a UI-friendly snapshot of the hero assigned at a province, or null.
export function heroAt(state, provId) {
  const h = heroRecordAt(state, provId);
  if (!h) return null;
  return describeHero(h);
}

// Battle bonus a province's army gets from its assigned hero: {atkMul,defMul}.
// Derived from base + level growth + equipped items; hpPct widens both. Returns
// {atkMul:1, defMul:1} when no hero leads the province.
export function heroBattleBonus(state, provId) {
  const h = heroRecordAt(state, provId);
  if (!h) return { atkMul: 1, defMul: 1 };
  const s = effectiveStats(h);
  let atkMul = 1 + s.atk * STAT_TO_MUL + s.hpPct;
  let defMul = 1 + s.def * STAT_TO_MUL + s.hpPct;
  if (atkMul > MAX_MUL) atkMul = MAX_MUL;
  if (defMul > MAX_MUL) defMul = MAX_MUL;
  if (atkMul < 1) atkMul = 1;
  if (defMul < 1) defMul = 1;
  return { atkMul, defMul };
}

// Full roster snapshot for the UI.
export function heroesRoster(state) {
  const hs = ensureHeroState(state);
  if (!hs) return [];
  const out = [];
  for (const id in hs.roster) {
    if (hs.roster[id]) out.push(describeHero(hs.roster[id]));
  }
  // Stable order: by hero def order if known, else id.
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

// Shared hero-snapshot builder used by heroAt + heroesRoster.
function describeHero(h) {
  const def = HEROES_BY_ID[h.id] || {};
  const stats = effectiveStats(h);
  return {
    id: h.id,
    nameKey: def.nameKey || ('hero.' + h.id),
    faction: def.faction || null,
    portrait: def.portrait | 0,
    level: h.level | 0,
    xp: h.xp | 0,
    nextXp: nextLevelXp(h.level | 0),
    provId: h.provId != null ? h.provId : null,
    stats: { atk: stats.atk, def: stats.def, hpPct: stats.hpPct },
    items: (h.items || []).slice(),
    skills: knownSkills(h),
  };
}

export default {
  registerHeroes,
  ensureHeroState,
  recruitHero,
  assignHero,
  equipItem,
  unequipItem,
  grantItem,
  heroAt,
  heroBattleBonus,
  gainHeroXp,
  heroesRoster,
};
