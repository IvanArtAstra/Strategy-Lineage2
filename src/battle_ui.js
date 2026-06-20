// src/battle_ui.js — owner C (feat/tactical-battle)
// Interactive (manual + animated) tactical battle screen. Takes over the shared
// canvas, runs an animation+input loop, lets the player issue a few tactical
// commands per round, then RESOLVES to an outcome identical in shape to
// combat.resolveBattle's return. Falls back to a sane outcome (never throws) so
// the client's auto-resolve safety net is rarely needed.
//
// Entry point (v2 §5):
//   export async function runTacticalBattle(opts) -> Promise<outcome>
//   opts = { canvas, ctx, attacker, defender, terrain, fortified,
//            rngState, seed, t, assets, lang, sound }
//
// No imports from engine/ui/render. Pure browser+ESM.

import { makeRng, makeRngFromState } from './rng.js';
import { UNITS, SPRITE_FOR } from './data/units.js';
import {
  createBattle, stepRound, autoResolve, toOutcome, resolveTactical,
  attackerGarrison, stackSize, presentTypes, isEmpty, MAX_ROUNDS,
} from './tactical.js';

// ---- small helpers --------------------------------------------------------

// Derive the seeded rng exactly like the engine would: prefer a serialized
// rngState (bit-exact resume), else seed, else a fixed constant. This is the
// single source of randomness => deterministic outcomes.
function deriveRng(opts) {
  if (opts && typeof opts.rngState === 'number') return makeRngFromState(opts.rngState >>> 0);
  if (opts && typeof opts.seed === 'number') return makeRng(opts.seed >>> 0);
  return makeRng(0x1a2b3c4d);
}

// Localize via opts.t when present; fall back to a built-in EN/RU label.
function makeT(opts) {
  const t = opts && typeof opts.t === 'function' ? opts.t : null;
  const lang = (opts && opts.lang) || 'ru';
  return (key, params) => {
    if (t) {
      try {
        const s = t(key, params);
        if (s && s !== key) return s;
      } catch (_) { /* fall through to local */ }
    }
    return localLabel(key, lang, params);
  };
}

const LOCAL = {
  ru: {
    'tac.title': 'Тактический бой', 'tac.round': 'Раунд', 'tac.focus': 'Фокус',
    'tac.push': 'Натиск', 'tac.hold': 'Оборона', 'tac.commit': 'Резерв',
    'tac.next': 'В бой', 'tac.auto': 'Авто', 'tac.attacker': 'Атакующий',
    'tac.defender': 'Защитник', 'tac.victory': 'Победа', 'tac.defeat': 'Поражение',
    'tac.reserve': 'Резерв', 'tac.done': 'Готово',
    'type.inf': 'Пехота', 'type.arch': 'Лучники', 'type.cav': 'Конница',
    'type.mag': 'Маги', 'type.heal': 'Лекари', 'type.undead': 'Нежить',
  },
  en: {
    'tac.title': 'Tactical Battle', 'tac.round': 'Round', 'tac.focus': 'Focus',
    'tac.push': 'Push', 'tac.hold': 'Hold', 'tac.commit': 'Reserve',
    'tac.next': 'Engage', 'tac.auto': 'Auto', 'tac.attacker': 'Attacker',
    'tac.defender': 'Defender', 'tac.victory': 'Victory', 'tac.defeat': 'Defeat',
    'tac.reserve': 'Reserve', 'tac.done': 'Done',
    'type.inf': 'Infantry', 'type.arch': 'Archers', 'type.cav': 'Cavalry',
    'type.mag': 'Mages', 'type.heal': 'Healers', 'type.undead': 'Undead',
  },
};
function localLabel(key, lang, params) {
  const tbl = LOCAL[lang] || LOCAL.en;
  let s = tbl[key] || (LOCAL.en[key] || key);
  if (params) for (const k in params) s = s.replace('{' + k + '}', params[k]);
  return s;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// Resolve a sprite image for a unit id from opts.assets, trying common key
// shapes (raw id, SPRITE_FOR mapping, with/without .png). Null => token.
function spriteFor(assets, unitId) {
  if (!assets) return null;
  const cands = [];
  const mapped = SPRITE_FOR[unitId];
  if (mapped) { cands.push(mapped, mapped + '.png'); }
  cands.push(unitId, unitId + '.png');
  for (const k of cands) {
    const a = assets[k];
    if (a && (a instanceof HTMLImageElement || a instanceof HTMLCanvasElement ||
              (typeof ImageBitmap !== 'undefined' && a instanceof ImageBitmap) ||
              (a.width && a.height))) return a;
  }
  return null;
}

// Faction tint table (kept local — no import from render/data factions).
const FACTION_COLOR = {
  human: '#3b6fd4', elf: '#2fa37a', orc: '#b5532a', shilen: '#7d3fb0',
  darkelf: '#8a4fae', dwarf: '#caa23c', kamael: '#5a8fb0',
};
function factionColor(id) { return FACTION_COLOR[id] || '#9aa4b2'; }

// Group a garrison into renderable rows by unit type (stable order).
const TYPE_ORDER = ['inf', 'cav', 'arch', 'mag', 'heal', 'undead'];
function rowsFor(garrison) {
  const byType = {};
  for (const id in garrison) {
    const c = garrison[id] | 0;
    if (c <= 0) continue;
    const u = UNITS[id];
    const type = u ? u.type : 'inf';
    (byType[type] || (byType[type] = [])).push({ id, count: c });
  }
  const rows = [];
  for (const ty of TYPE_ORDER) if (byType[ty]) rows.push({ type: ty, units: byType[ty] });
  for (const ty in byType) if (!TYPE_ORDER.includes(ty)) rows.push({ type: ty, units: byType[ty] });
  return rows;
}

// ============================================================================
// runTacticalBattle — the single public entry point.
// ============================================================================
export async function runTacticalBattle(opts) {
  opts = opts || {};
  const rng = deriveRng(opts);
  const t = makeT(opts);

  // ---- guard: if we can't render, resolve deterministically (no throw) ----
  const canvas = opts.canvas;
  const ctx = opts.ctx || (canvas && canvas.getContext && canvas.getContext('2d'));
  const attacker = opts.attacker || { faction: 'human', garrison: {} };
  const defender = opts.defender || { faction: 'shilen', garrison: {} };

  const safeOutcome = () => {
    try {
      return resolveTactical({
        attacker, defender, terrain: opts.terrain, fortified: opts.fortified, rng,
      });
    } catch (_) {
      // last-ditch: a minimal valid outcome (defender holds) — never throw.
      return {
        winner: 'defender', attackerLosses: {}, defenderLosses: {},
        attackerSurvivors: Object.assign({}, attacker.garrison),
        defenderSurvivors: Object.assign({}, defender.garrison),
        rounds: [], log: [{ key: 'battle.loss', params: {} }],
      };
    }
  };

  if (!canvas || !ctx) return safeOutcome();
  // Empty-side edge cases: nothing to fight => resolve instantly.
  if (isEmpty(attacker.garrison) || isEmpty(defender.garrison)) return safeOutcome();

  // ---- build the deterministic model --------------------------------------
  let bs;
  try {
    bs = createBattle({
      attacker, defender, terrain: opts.terrain, fortified: opts.fortified, useReserve: true,
    });
  } catch (_) {
    return safeOutcome();
  }

  // ---- UI state -----------------------------------------------------------
  const state = {
    phase: 'command',           // 'command' | 'anim' | 'done'
    command: { focus: null, stance: null, commit: false },
    buttons: [],                // hit-test rects, rebuilt each frame
    anim: null,                 // active clash animation
    flash: [],                  // floating damage numbers
    finished: false,
    raf: 0,
    cleanedUp: false,
  };

  // dimensions (logical CSS px; we draw in ctx units, assume caller set DPR)
  function dims() {
    const w = canvas.clientWidth || canvas.width || 360;
    const h = canvas.clientHeight || canvas.height || 640;
    return { w, h };
  }

  // ---- input --------------------------------------------------------------
  function localPoint(ev) {
    const rect = canvas.getBoundingClientRect();
    const src = (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]) || ev;
    const sx = rect.width ? canvasW() / rect.width : 1;
    const sy = rect.height ? canvasH() / rect.height : 1;
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
  }
  function canvasW() { return canvas.clientWidth || canvas.width || 360; }
  function canvasH() { return canvas.clientHeight || canvas.height || 640; }

  let resolveDone;
  const donePromise = new Promise((res) => { resolveDone = res; });

  function hit(p) {
    for (let i = state.buttons.length - 1; i >= 0; i--) {
      const b = state.buttons[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
    }
    return null;
  }

  function onPointer(ev) {
    if (state.cleanedUp) return;
    try { ev.preventDefault(); } catch (_) {}
    const p = localPoint(ev);
    const b = hit(p);
    if (!b) return;
    handleButton(b);
  }

  function onKey(ev) {
    if (state.cleanedUp) return;
    const k = ev.key;
    if (k === 'Enter' || k === ' ') { handleButton({ action: 'next' }); }
    else if (k === 'a' || k === 'A') { handleButton({ action: 'auto' }); }
    else if (k === 'p' || k === 'P') { setStance('push'); }
    else if (k === 'h' || k === 'H') { setStance('hold'); }
    else if (k === 'c' || k === 'C') { toggleCommit(); }
  }

  function setStance(s) {
    if (state.phase !== 'command') return;
    state.command.stance = state.command.stance === s ? null : s;
    if (opts.sound) try { opts.sound('sfx_select'); } catch (_) {}
  }
  function setFocus(type) {
    if (state.phase !== 'command') return;
    state.command.focus = state.command.focus === type ? null : type;
    if (opts.sound) try { opts.sound('sfx_select'); } catch (_) {}
  }
  function toggleCommit() {
    if (state.phase !== 'command' || bs.reserveCommitted) return;
    state.command.commit = !state.command.commit;
    if (opts.sound) try { opts.sound('sfx_select'); } catch (_) {}
  }

  function handleButton(b) {
    if (state.cleanedUp) return;
    switch (b.action) {
      case 'focus': setFocus(b.type); break;
      case 'push': setStance('push'); break;
      case 'hold': setStance('hold'); break;
      case 'commit': toggleCommit(); break;
      case 'next': advanceRound(); break;
      case 'auto': runAuto(); break;
      default: break;
    }
  }

  // ---- round advance / animation ------------------------------------------
  function advanceRound() {
    if (state.phase !== 'command' || state.finished) return;
    const cmd = {
      focus: state.command.focus,
      stance: state.command.stance,
      commit: state.command.commit,
    };
    const beforeDef = stackSize(bs.defGar);
    const beforeAtt = stackSize(attackerGarrison(bs));
    stepRound(bs, cmd, rng);
    if (opts.sound) try { opts.sound('sfx_battle'); } catch (_) {}
    const ev = bs.events[bs.events.length - 1];
    spawnClashAnim(ev, beforeAtt, beforeDef);
    // reset per-round command (keep stance is friendlier, but reset commit)
    state.command.commit = false;
    if (bs.finished) state.finished = true;
  }

  function runAuto() {
    if (state.finished) return;
    // resolve the rest instantly using the player's current stance as the
    // standing order; keeps determinism (same rng stream continues).
    const standing = { focus: state.command.focus, stance: state.command.stance };
    const script = [];
    for (let i = 0; i < MAX_ROUNDS + 1; i++) script.push(standing);
    autoResolve(bs, rng, script);
    state.finished = true;
    state.phase = 'done';
    state.anim = null;
  }

  function spawnClashAnim(ev, beforeAtt, beforeDef) {
    state.phase = 'anim';
    state.anim = { tStart: now(), dur: 520, ev };
    // floating damage numbers
    const { w } = dims();
    if (ev && ev.kind === 'clash') {
      if (ev.dmgToDef > 0) state.flash.push({ side: 'def', val: ev.dmgToDef, t0: now(), x: w * 0.72, y: 0 });
      if (ev.dmgToAtt > 0) state.flash.push({ side: 'att', val: ev.dmgToAtt, t0: now(), x: w * 0.28, y: 0 });
    }
  }

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  // ---- render loop --------------------------------------------------------
  function frame() {
    if (state.cleanedUp) return;
    const tnow = now();

    // advance animation -> back to command, or finish.
    if (state.phase === 'anim' && state.anim) {
      if (tnow - state.anim.tStart >= state.anim.dur) {
        state.anim = null;
        state.phase = state.finished ? 'done' : 'command';
      }
    }
    // prune flashes
    state.flash = state.flash.filter((f) => tnow - f.t0 < 900);

    try { draw(tnow); } catch (_) { /* never let a draw error break the loop */ }

    // finish: brief outcome banner, then resolve.
    if (state.phase === 'done') {
      if (!state.doneAt) state.doneAt = tnow;
      if (tnow - state.doneAt >= 1100) { finishAndResolve(); return; }
    }
    state.raf = raf(frame);
  }

  function raf(fn) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
    return setTimeout(() => fn(now()), 16);
  }
  function cancelRaf(id) {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
    else clearTimeout(id);
  }

  // ---- drawing ------------------------------------------------------------
  function draw(tnow) {
    const w = canvasW(), h = canvasH();
    state.buttons = [];

    // backdrop
    ctx.save();
    ctx.fillStyle = '#14110d';
    ctx.fillRect(0, 0, w, h);
    // terrain band
    const tg = ctx.createLinearGradient(0, 0, 0, h);
    tg.addColorStop(0, '#23201a');
    tg.addColorStop(1, '#171511');
    ctx.fillStyle = tg;
    ctx.fillRect(0, h * 0.12, w, h * 0.62);

    // header
    ctx.fillStyle = '#e8d89a';
    ctx.font = `bold ${Math.round(h * 0.030)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('tac.title'), w / 2, h * 0.05);
    ctx.font = `${Math.round(h * 0.022)}px sans-serif`;
    ctx.fillStyle = '#cbb88a';
    const roundLbl = `${t('tac.round')} ${Math.max(1, bs.round)}/${MAX_ROUNDS}`;
    ctx.fillText(roundLbl, w / 2, h * 0.092);

    // armies
    const attG = attackerGarrison(bs);
    const defG = bs.defGar;
    const shake = (state.phase === 'anim' && state.anim) ?
      Math.sin((tnow - state.anim.tStart) / 40) * (1 - (tnow - state.anim.tStart) / state.anim.dur) * 6 : 0;

    drawArmy(attG, attacker.faction, w * 0.04, h * 0.16, w * 0.42, h * 0.50, 'left', shake);
    drawArmy(defG, defender.faction, w * 0.54, h * 0.16, w * 0.42, h * 0.50, 'right', -shake);

    // VS / clash marker
    ctx.fillStyle = '#e0a04a';
    ctx.font = `bold ${Math.round(h * 0.04)}px serif`;
    ctx.fillText('⚔', w / 2, h * 0.42);

    // reserve indicator
    if (!bs.reserveCommitted && stackSize(bs.attReserve) > 0) {
      ctx.fillStyle = '#9ad0e8';
      ctx.font = `${Math.round(h * 0.018)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(`${t('tac.reserve')}: +${stackSize(bs.attReserve)}`, w * 0.05, h * 0.70);
      ctx.textAlign = 'center';
    }

    // damage flashes
    for (const f of state.flash) {
      const age = (tnow - f.t0) / 900;
      ctx.globalAlpha = clamp(1 - age, 0, 1);
      ctx.fillStyle = f.side === 'def' ? '#ff6b5a' : '#ffd06b';
      ctx.font = `bold ${Math.round(h * 0.03)}px sans-serif`;
      ctx.fillText('-' + f.val, f.x, h * 0.40 - age * h * 0.08);
      ctx.globalAlpha = 1;
    }

    // control panel
    drawControls(w, h);

    // outcome banner
    if (state.phase === 'done') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, h * 0.40, w, h * 0.16);
      const win = bs.winner === 'attacker';
      ctx.fillStyle = win ? '#7be08a' : '#ff6b5a';
      ctx.font = `bold ${Math.round(h * 0.045)}px serif`;
      ctx.fillText(win ? t('tac.victory') : t('tac.defeat'), w / 2, h * 0.48);
    }
    ctx.restore();
  }

  function drawArmy(garrison, faction, x, y, w, h, align, shake) {
    const rows = rowsFor(garrison);
    const col = factionColor(faction);
    ctx.save();
    ctx.translate(shake, 0);
    // faction name
    ctx.fillStyle = col;
    ctx.font = `bold ${Math.round(h * 0.05)}px sans-serif`;
    ctx.textAlign = align === 'left' ? 'left' : 'right';
    const nameX = align === 'left' ? x : x + w;
    ctx.fillText(localFaction(faction), nameX, y - h * 0.02);

    const maxRows = Math.max(1, rows.length);
    const rowH = Math.min(h * 0.22, (h * 0.92) / maxRows);
    let cy = y + rowH * 0.2;
    for (const row of rows) {
      drawRow(row, faction, x, cy, w, rowH, align);
      cy += rowH;
    }
    ctx.restore();
    ctx.textAlign = 'center';
  }

  function drawRow(row, faction, x, y, w, rowH, align) {
    const total = row.units.reduce((s, u) => s + u.count, 0);
    const spriteId = row.units[0].id;
    const img = spriteFor(opts.assets, spriteId);
    const sz = Math.min(rowH * 0.7, w * 0.22);
    const sx = align === 'left' ? x : x + w - sz;
    // token / sprite
    if (img) {
      try { ctx.drawImage(img, sx, y, sz, sz); } catch (_) { drawToken(sx, y, sz, faction, row.type); }
    } else {
      drawToken(sx, y, sz, faction, row.type);
    }
    // count + type label
    ctx.fillStyle = '#efe6cf';
    ctx.font = `bold ${Math.round(sz * 0.42)}px sans-serif`;
    ctx.textAlign = align === 'left' ? 'left' : 'right';
    const tx = align === 'left' ? sx + sz + 6 : sx - 6;
    ctx.fillText('×' + total, tx, y + sz * 0.4);
    ctx.font = `${Math.round(sz * 0.30)}px sans-serif`;
    ctx.fillStyle = '#bcae86';
    ctx.fillText(t('type.' + row.type), tx, y + sz * 0.78);

    // HP bar (proportional to current vs a per-type reference; here we show
    // a simple "strength" bar = count fraction of this row's start — purely
    // cosmetic, the model owns the truth).
    const barW = sz, barH = Math.max(3, sz * 0.10);
    const by = y + sz + 2;
    ctx.fillStyle = '#3a342a';
    ctx.fillRect(sx, by, barW, barH);
    const frac = clamp(total / Math.max(total, refCount(faction, row.type)), 0, 1);
    ctx.fillStyle = faction === defender.faction ? '#ff8a6b' : '#7be08a';
    ctx.fillRect(sx, by, barW * frac, barH);
  }

  // reference starting count per (faction,type) for cosmetic HP bars.
  function refCount(faction, type) {
    const start = faction === attacker.faction ? bs.attStart : bs.defStart;
    let n = 0;
    for (const id in start) {
      const u = UNITS[id];
      if (u && u.type === type) n += start[id] | 0;
    }
    return Math.max(1, n);
  }

  function drawToken(x, y, sz, faction, type) {
    ctx.save();
    ctx.fillStyle = factionColor(faction);
    ctx.strokeStyle = '#1a1510';
    ctx.lineWidth = Math.max(1, sz * 0.05);
    ctx.beginPath();
    const r = sz * 0.16;
    roundRect(x, y, sz, sz, r);
    ctx.fill();
    ctx.stroke();
    // type glyph
    ctx.fillStyle = '#0d0b08';
    ctx.font = `bold ${Math.round(sz * 0.5)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(typeGlyph(type), x + sz / 2, y + sz / 2 + sz * 0.04);
    ctx.restore();
    ctx.textBaseline = 'middle';
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function typeGlyph(type) {
    return ({ inf: '⚔', arch: '➹', cav: '⚞', mag: '✦', heal: '✚', undead: '☠' })[type] || '•';
  }

  function drawControls(w, h) {
    const panelY = h * 0.74;
    const panelH = h * 0.26;
    ctx.fillStyle = 'rgba(20,17,13,0.92)';
    ctx.fillRect(0, panelY, w, panelH);
    ctx.strokeStyle = '#3a342a';
    ctx.strokeRect(0, panelY, w, panelH);

    const disabled = state.phase !== 'command';

    // Row 1: FOCUS buttons (one per enemy type present)
    const types = presentTypes(bs.defGar);
    const fbX = w * 0.03;
    const fbW = (w * 0.94) / Math.max(1, types.length);
    const fbY = panelY + h * 0.012;
    const fbH = h * 0.055;
    ctx.font = `${Math.round(h * 0.018)}px sans-serif`;
    for (let i = 0; i < types.length; i++) {
      const ty = types[i];
      const active = state.command.focus === ty;
      btn(`F:${t('type.' + ty)}`, fbX + i * fbW + 2, fbY, fbW - 4, fbH,
        { action: 'focus', type: ty }, active, disabled);
    }

    // Row 2: PUSH / HOLD / COMMIT
    const r2Y = fbY + fbH + h * 0.012;
    const r2H = h * 0.06;
    const thirds = w * 0.94 / 3;
    btn(t('tac.push'), w * 0.03 + 0 * thirds + 2, r2Y, thirds - 4, r2H,
      { action: 'push' }, state.command.stance === 'push', disabled);
    btn(t('tac.hold'), w * 0.03 + 1 * thirds + 2, r2Y, thirds - 4, r2H,
      { action: 'hold' }, state.command.stance === 'hold', disabled);
    const canCommit = !bs.reserveCommitted && stackSize(bs.attReserve) > 0;
    btn(`${t('tac.commit')}${canCommit ? ' +' + stackSize(bs.attReserve) : ''}`,
      w * 0.03 + 2 * thirds + 2, r2Y, thirds - 4, r2H,
      { action: 'commit' }, state.command.commit, disabled || !canCommit);

    // Row 3: ENGAGE (next) + AUTO
    const r3Y = r2Y + r2H + h * 0.012;
    const r3H = h * 0.06;
    btn(t('tac.next'), w * 0.03, r3Y, w * 0.62, r3H, { action: 'next' }, false, disabled, true);
    btn(t('tac.auto'), w * 0.67, r3Y, w * 0.30, r3H, { action: 'auto' }, false, state.finished);
  }

  function btn(label, x, y, w, h, action, active, disabled, primary) {
    ctx.save();
    ctx.globalAlpha = disabled ? 0.4 : 1;
    ctx.fillStyle = active ? '#e0a04a' : (primary ? '#3b6fd4' : '#2c2620');
    roundRect(x, y, w, h, Math.min(8, h * 0.25));
    ctx.fill();
    ctx.strokeStyle = active ? '#ffd06b' : '#4a4234';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = active ? '#1a1510' : '#efe6cf';
    ctx.font = `bold ${Math.round(h * 0.36)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
    ctx.restore();
    ctx.textBaseline = 'middle';
    if (!disabled) state.buttons.push({ x, y, w, h, action: action.action, type: action.type });
  }

  function localFaction(id) {
    const tt = t('fac.' + id);
    if (tt && tt !== 'fac.' + id) return tt;
    return id.charAt(0).toUpperCase() + id.slice(1);
  }

  // ---- lifecycle ----------------------------------------------------------
  const pointerEvents = ['pointerdown', 'mousedown', 'touchstart'];
  function addListeners() {
    for (const ev of pointerEvents) {
      canvas.addEventListener(ev, onPointer, { passive: false });
    }
    if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);
  }
  function removeListeners() {
    for (const ev of pointerEvents) {
      canvas.removeEventListener(ev, onPointer);
    }
    if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
  }

  function cleanup() {
    if (state.cleanedUp) return;
    state.cleanedUp = true;
    if (state.raf) cancelRaf(state.raf);
    removeListeners();
    // leave the canvas cleared so the map loop can resume on a clean surface.
    try {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width || canvasW(), canvas.height || canvasH());
      ctx.restore();
    } catch (_) { /* ignore */ }
  }

  function finishAndResolve() {
    let outcome;
    try { outcome = toOutcome(bs); } catch (_) { outcome = safeOutcome(); }
    cleanup();
    if (opts.sound) {
      try { opts.sound(bs.winner === 'attacker' ? 'sfx_victory' : 'sfx_battle'); } catch (_) {}
    }
    resolveDone(outcome);
  }

  // start
  try {
    addListeners();
    state.raf = raf(frame);
  } catch (_) {
    // if anything in setup fails, resolve safely.
    cleanup();
    return safeOutcome();
  }

  return donePromise;
}

export default { runTacticalBattle };
