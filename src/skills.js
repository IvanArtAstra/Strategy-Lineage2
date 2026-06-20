// src/skills.js — contract v2 §3 (engine owner B)
// Clan skill system. Reads skill definitions from ./data/skills.js: each skill
// has an adena cost, a cooldown (in turns), a target mode, and a list of
// declarative effects. Activating a skill charges its cost, sets its cooldown
// in state.skills.cooldowns[id], and applies its effects (via engine.applyEffects).
//
// Pure logic, no DOM. Deterministic: any randomness in effects flows through
// the engine state rng. If ./data/skills.js is absent, skillStatus() returns []
// (the UI hides the panel) and activation is a no-op.
//
// Cooldowns are ticked once per turn by engine.endTurn (via the hook registered
// here with engine.registerSkills).

import {
  pushLog,
  applyEffects,
  ensureSkillsState,
  registerSkills as engineRegisterSkills,
} from './engine.js';

// Loaded skill definitions (array). Empty until registerSkills() resolves.
let SKILLS = [];

// ---------------------------------------------------------------------------
// Registration: load data + wire the cooldown-tick hook into the engine. Async
// so callers can await the dynamic import. Never throws.
// ---------------------------------------------------------------------------

export async function registerSkills() {
  engineRegisterSkills({ tickCooldowns });
  try {
    const mod = await import('./data/skills.js');
    const list = mod && (mod.SKILLS || mod.default);
    SKILLS = Array.isArray(list) ? list : [];
  } catch (_e) {
    SKILLS = [];
  }
  return SKILLS.length;
}

function skillById(id) {
  return SKILLS.find((s) => s.id === id) || null;
}

// ---------------------------------------------------------------------------
// tickCooldowns(state): decrement every active cooldown by 1 (floor at 0).
// Engine calls this once per turn from endTurn.
// ---------------------------------------------------------------------------

export function tickCooldowns(state) {
  const cds = ensureSkillsState(state).cooldowns;
  for (const id in cds) {
    cds[id] = Math.max(0, (cds[id] | 0) - 1);
    if (cds[id] === 0) delete cds[id];
  }
  return state;
}

// ---------------------------------------------------------------------------
// canActivate(state, skillId, targetProvId) -> { ok, reason? }
// Validates: skill exists, not on cooldown, player can afford it, and the
// target province (if the skill needs one) is valid for the skill's target mode:
//   'ownProvince'   — must be owned by the player
//   'enemyProvince' — must be owned by someone other than the player
//   'none'          — no target required
// ---------------------------------------------------------------------------

export function canActivate(state, skillId, targetProvId) {
  const sk = skillById(skillId);
  if (!sk) return { ok: false, reason: 'err.noSkill' };
  if (state.phase === 'over') return { ok: false, reason: 'err.gameOver' };

  const cds = ensureSkillsState(state).cooldowns;
  if ((cds[skillId] | 0) > 0) return { ok: false, reason: 'err.skillCooldown' };

  const player = state.playerFaction;
  const adena = state.factions[player] ? state.factions[player].adena : 0;
  if (adena < (sk.cost | 0)) return { ok: false, reason: 'err.notEnoughAdena' };

  const mode = sk.target || 'none';
  if (mode !== 'none') {
    const prov = targetProvId && state.provinces[targetProvId];
    if (!prov) return { ok: false, reason: 'err.noProvince' };
    if (mode === 'ownProvince' && prov.owner !== player) {
      return { ok: false, reason: 'err.notOwned' };
    }
    if (mode === 'enemyProvince' && prov.owner === player) {
      return { ok: false, reason: 'err.notEnemy' };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// activateSkill(state, skillId, targetProvId) -> state
// Charges cost, sets cooldown, applies effects, logs 'log.skill'. No-op (with a
// failure log) if canActivate rejects.
// ---------------------------------------------------------------------------

export function activateSkill(state, skillId, targetProvId) {
  const chk = canActivate(state, skillId, targetProvId);
  if (!chk.ok) {
    pushLog(state, 'log.skillFail', { skill: skillId, reason: chk.reason });
    return state;
  }
  const sk = skillById(skillId);
  const player = state.playerFaction;

  // Charge cost.
  state.factions[player].adena -= sk.cost | 0;
  // Set cooldown (so it's unavailable for `cooldown` turns; ticked down each turn).
  const cds = ensureSkillsState(state).cooldowns;
  if ((sk.cooldown | 0) > 0) cds[skillId] = sk.cooldown | 0;

  // Apply effects. Skill effects target the chosen province where relevant
  // (healGarrison/smite/summon/fortifyFree), else the player faction (adena/
  // blessIncome). applyEffects honors a per-effect `prov` default of targetProvId.
  applyEffects(state, player, sk.effects || [], targetProvId);

  pushLog(state, 'log.skill', { skill: skillId, prov: targetProvId || null, cost: sk.cost | 0 });
  return state;
}

// ---------------------------------------------------------------------------
// skillStatus(state) -> [{ id, ready, cooldownLeft, affordable }]
// UI consumes this to render the skills panel. Returns [] when no skills loaded.
// ---------------------------------------------------------------------------

export function skillStatus(state) {
  if (!SKILLS.length) return [];
  const cds = ensureSkillsState(state).cooldowns;
  const player = state.playerFaction;
  const adena = state.factions[player] ? state.factions[player].adena : 0;
  return SKILLS.map((sk) => {
    const cooldownLeft = cds[sk.id] | 0;
    const affordable = adena >= (sk.cost | 0);
    return {
      id: sk.id,
      nameKey: sk.nameKey,
      descKey: sk.descKey,
      cost: sk.cost | 0,
      target: sk.target || 'none',
      ready: cooldownLeft === 0 && affordable && state.phase !== 'over',
      cooldownLeft,
      affordable,
    };
  });
}
