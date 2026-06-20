// src/siege_ui.js — feat/siege
// Interactive, animated CITY SIEGE screen. Takes over the shared canvas, runs
// an animation+input loop, lets the player issue one command per round
// (Batter the walls / Storm the breach / Hold), shows a WALL INTEGRITY bar and
// both armies, then RESOLVES to an outcome IDENTICAL in shape to
// combat.resolveBattle's return. Falls back to a deterministic safe outcome
// (never throws) so the client's auto-resolve net is rarely needed.
//
// Entry point (interfaces-v4.md §2):
//   export async function openSiege(opts) -> Promise<outcome>
//   opts = { canvas, ctx, attacker:{faction,garrison}, defender:{faction,garrison},
//            wallLevel, terrain, seed, t, assets, lang, sound, requestRedraw }
//
// No imports from engine/ui/render. Pure browser+ESM.

import { UNITS, SPRITE_FOR } from './data/units.js';
import {
  createSiege, siegeStep, resolveSiege, autoResolveSiege,
  stackSize, isEmpty, MAX_ROUNDS,
} from './siege.js';

// ---- localization ---------------------------------------------------------
function makeT(opts) {
  const t = opts && typeof opts.t === 'function' ? opts.t : null;
  const lang = (opts && opts.lang) || 'ru';
  return (key, params) => {
    if (t) {
      try {
        const s = t(key, params);
        if (s && s !== key) return s;
      } catch (_) { /* fall through */ }
    }
    return localLabel(key, lang, params);
  };
}

const LOCAL = {
  ru: {
    'siege.title': 'Осада', 'siege.round': 'Раунд',
    'siege.wall': 'Стена', 'siege.integrity': 'Целостность стены',
    'siege.batter': 'Бить стену', 'siege.storm': 'На прорыв',
    'siege.hold': 'Держать', 'siege.auto': 'Авто', 'siege.next': 'Приказ',
    'siege.breached': 'Стена пробита!', 'siege.standing': 'Стена стоит',
    'siege.attacker': 'Осаждающий', 'siege.defender': 'Гарнизон',
    'battle.victory': 'Город взят', 'battle.defeat': 'Осада отбита',
    'type.inf': 'Пехота', 'type.arch': 'Лучники', 'type.cav': 'Конница',
    'type.mag': 'Маги', 'type.heal': 'Лекари', 'type.undead': 'Нежить',
  },
  en: {
    'siege.title': 'Siege', 'siege.round': 'Round',
    'siege.wall': 'Wall', 'siege.integrity': 'Wall Integrity',
    'siege.batter': 'Batter Walls', 'siege.storm': 'Storm Breach',
    'siege.hold': 'Hold', 'siege.auto': 'Auto', 'siege.next': 'Command',
    'siege.breached': 'Wall breached!', 'siege.standing': 'Wall stands',
    'siege.attacker': 'Besiegers', 'siege.defender': 'Garrison',
    'battle.victory': 'City taken', 'battle.defeat': 'Siege repelled',
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

// Sprite resolution from opts.assets (raw id / SPRITE_FOR / with .png). Null => token.
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

function bgAsset(assets) {
  if (!assets) return null;
  for (const k of ['siege_bg', 'siege_bg.png']) {
    const a = assets[k];
    if (a && (a.width || a instanceof HTMLImageElement || a instanceof HTMLCanvasElement)) return a;
  }
  return null;
}

const FACTION_COLOR = {
  human: '#3b6fd4', elf: '#2fa37a', orc: '#b5532a', shilen: '#7d3fb0',
  darkelf: '#8a4fae', dwarf: '#caa23c', kamael: '#5a8fb0',
};
function factionColor(id) { return FACTION_COLOR[id] || '#9aa4b2'; }

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
// openSiege — the single public entry point.
// ============================================================================
export async function openSiege(opts) {
  opts = opts || {};
  const t = makeT(opts);

  const canvas = opts.canvas;
  const ctx = opts.ctx || (canvas && canvas.getContext && canvas.getContext('2d'));
  const attacker = opts.attacker || { faction: 'human', garrison: {} };
  const defender = opts.defender || { faction: 'shilen', garrison: {} };

  // Build the deterministic model up front (also used for safe fallback).
  function newSiege() {
    return createSiege({
      attacker, defender,
      wallLevel: opts.wallLevel | 0,
      terrain: opts.terrain,
      seed: (opts.seed >>> 0) || 0,
    });
  }

  const safeOutcome = () => {
    try {
      const ss = newSiege();
      autoResolveSiege(ss);
      return resolveSiege(ss);
    } catch (_) {
      return {
        winner: 'defender', attackerLosses: {}, defenderLosses: {},
        attackerSurvivors: Object.assign({}, attacker.garrison),
        defenderSurvivors: Object.assign({}, defender.garrison),
        rounds: [], log: [{ key: 'battle.loss', params: {} }],
      };
    }
  };

  if (!canvas || !ctx) return safeOutcome();
  if (isEmpty(attacker.garrison) || isEmpty(defender.garrison)) return safeOutcome();

  let ss;
  try { ss = newSiege(); } catch (_) { return safeOutcome(); }

  // music
  if (opts.sound) { try { opts.sound('music_siege'); } catch (_) {} }

  // ---- UI state -----------------------------------------------------------
  const state = {
    phase: 'command',        // 'command' | 'anim' | 'done'
    buttons: [],
    anim: null,
    flash: [],
    wallShown: ss.wallHp,    // animated wall bar value
    finished: false,
    raf: 0,
    cleanedUp: false,
    doneAt: 0,
  };

  function canvasW() { return canvas.clientWidth || canvas.width || 360; }
  function canvasH() { return canvas.clientHeight || canvas.height || 640; }

  function localPoint(ev) {
    const rect = canvas.getBoundingClientRect();
    const src = (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]) || ev;
    const sx = rect.width ? canvasW() / rect.width : 1;
    const sy = rect.height ? canvasH() / rect.height : 1;
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
  }

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
    const b = hit(localPoint(ev));
    if (b) handleButton(b);
  }

  function onKey(ev) {
    if (state.cleanedUp) return;
    const k = ev.key;
    if (k === 'b' || k === 'B') doCommand('assault-wall');
    else if (k === 's' || k === 'S' || k === 'Enter' || k === ' ') doCommand('assault-troops');
    else if (k === 'h' || k === 'H') doCommand('hold');
    else if (k === 'a' || k === 'A') runAuto();
  }

  function handleButton(b) {
    if (state.cleanedUp) return;
    switch (b.action) {
      case 'batter': doCommand('assault-wall'); break;
      case 'storm': doCommand('assault-troops'); break;
      case 'hold': doCommand('hold'); break;
      case 'auto': runAuto(); break;
      default: break;
    }
  }

  // ---- round advance / animation ------------------------------------------
  function doCommand(command) {
    if (state.phase !== 'command' || state.finished) return;
    siegeStep(ss, command);
    if (opts.sound) {
      try { opts.sound(command === 'assault-wall' ? 'sfx_battle' : 'sfx_battle'); } catch (_) {}
    }
    const ev = ss.events[ss.events.length - 1];
    spawnAnim(ev);
    if (ss.finished) state.finished = true;
  }

  function runAuto() {
    if (state.finished) return;
    autoResolveSiege(ss);
    state.finished = true;
    state.phase = 'done';
    state.anim = null;
    state.wallShown = ss.wallHp;
  }

  function spawnAnim(ev) {
    state.phase = 'anim';
    state.anim = { tStart: now(), dur: 540, ev };
    const w = canvasW();
    if (!ev) return;
    if (ev.kind === 'clash') {
      if (ev.dmgToDef > 0) state.flash.push({ side: 'def', val: ev.dmgToDef, t0: now(), x: w * 0.74 });
      if (ev.dmgToAtt > 0) state.flash.push({ side: 'att', val: ev.dmgToAtt, t0: now(), x: w * 0.26 });
    } else if (ev.kind === 'wall') {
      if (ev.wallDamage > 0) state.flash.push({ side: 'wall', val: ev.wallDamage, t0: now(), x: w * 0.5 });
      if (ev.dmgToAtt > 0) state.flash.push({ side: 'att', val: ev.dmgToAtt, t0: now(), x: w * 0.26 });
    }
  }

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  // ---- render loop --------------------------------------------------------
  function frame() {
    if (state.cleanedUp) return;
    const tnow = now();

    if (state.phase === 'anim' && state.anim) {
      if (tnow - state.anim.tStart >= state.anim.dur) {
        state.anim = null;
        state.phase = state.finished ? 'done' : 'command';
      }
    }
    // ease the wall bar toward the model value
    state.wallShown += (ss.wallHp - state.wallShown) * 0.25;
    if (Math.abs(state.wallShown - ss.wallHp) < 0.5) state.wallShown = ss.wallHp;

    state.flash = state.flash.filter((f) => tnow - f.t0 < 900);

    try { draw(tnow); } catch (_) { /* never let a draw error break the loop */ }
    if (opts.requestRedraw) { try { opts.requestRedraw(); } catch (_) {} }

    if (state.phase === 'done') {
      if (!state.doneAt) state.doneAt = tnow;
      if (tnow - state.doneAt >= 1200) { finishAndResolve(); return; }
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
    ctx.save();

    // background: siege_bg if present, else procedural castle-gate scene.
    const bg = bgAsset(opts.assets);
    if (bg) {
      try { ctx.drawImage(bg, 0, 0, w, h); } catch (_) { drawProceduralBg(w, h); }
    } else {
      drawProceduralBg(w, h);
    }

    // header
    ctx.fillStyle = '#e8d89a';
    ctx.font = `bold ${Math.round(h * 0.030)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('siege.title'), w / 2, h * 0.05);
    ctx.font = `${Math.round(h * 0.020)}px sans-serif`;
    ctx.fillStyle = '#cbb88a';
    ctx.fillText(`${t('siege.round')} ${Math.max(1, ss.round)}/${MAX_ROUNDS}`, w / 2, h * 0.088);

    // wall integrity bar
    drawWallBar(w, h);

    // armies
    const shake = (state.phase === 'anim' && state.anim) ?
      Math.sin((tnow - state.anim.tStart) / 40) * (1 - (tnow - state.anim.tStart) / state.anim.dur) * 6 : 0;
    drawArmy(ss.attGar, attacker.faction, w * 0.04, h * 0.26, w * 0.40, h * 0.42, 'left', shake);
    drawArmy(ss.defGar, defender.faction, w * 0.56, h * 0.26, w * 0.40, h * 0.42, 'right', -shake);

    // damage flashes
    for (const f of state.flash) {
      const age = (tnow - f.t0) / 900;
      ctx.globalAlpha = clamp(1 - age, 0, 1);
      ctx.fillStyle = f.side === 'def' ? '#ff6b5a' : (f.side === 'wall' ? '#d8c27a' : '#ffd06b');
      ctx.font = `bold ${Math.round(h * 0.03)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('-' + f.val, f.x, h * 0.44 - age * h * 0.08);
      ctx.globalAlpha = 1;
    }

    drawControls(w, h);

    if (state.phase === 'done') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, h * 0.42, w, h * 0.16);
      const win = ss.winner === 'attacker';
      ctx.fillStyle = win ? '#7be08a' : '#ff6b5a';
      ctx.font = `bold ${Math.round(h * 0.044)}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText(win ? t('battle.victory') : t('battle.defeat'), w / 2, h * 0.50);
    }
    ctx.restore();
  }

  function drawProceduralBg(w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a1610');
    g.addColorStop(0.55, '#241c14');
    g.addColorStop(1, '#0e0b08');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // a stylized castle gate + battlements in the center band
    ctx.fillStyle = '#3a342a';
    const gateW = w * 0.30, gateX = (w - gateW) / 2, gateTop = h * 0.16, gateBot = h * 0.70;
    ctx.fillRect(gateX, gateTop, gateW, gateBot - gateTop);
    // crenellations
    ctx.fillStyle = '#4a4234';
    const merlons = 5, mw = gateW / (merlons * 2 - 1);
    for (let i = 0; i < merlons; i++) {
      ctx.fillRect(gateX + i * 2 * mw, gateTop - h * 0.025, mw, h * 0.025);
    }
    // gate arch
    ctx.fillStyle = '#15110c';
    ctx.beginPath();
    ctx.moveTo(gateX + gateW * 0.28, gateBot);
    ctx.lineTo(gateX + gateW * 0.28, gateTop + (gateBot - gateTop) * 0.45);
    ctx.quadraticCurveTo(w / 2, gateTop + (gateBot - gateTop) * 0.18, gateX + gateW * 0.72, gateTop + (gateBot - gateTop) * 0.45);
    ctx.lineTo(gateX + gateW * 0.72, gateBot);
    ctx.closePath();
    ctx.fill();
    // ground
    ctx.fillStyle = '#241f18';
    ctx.fillRect(0, gateBot, w, h - gateBot);
  }

  function drawWallBar(w, h) {
    const bx = w * 0.18, by = h * 0.135, bw = w * 0.64, bh = h * 0.026;
    const frac = ss.wallMax > 0 ? clamp(state.wallShown / ss.wallMax, 0, 1) : 0;
    // label
    ctx.fillStyle = '#cbb88a';
    ctx.font = `${Math.round(h * 0.017)}px sans-serif`;
    ctx.textAlign = 'center';
    const standing = ss.wallHp > 0;
    const lbl = standing
      ? `${t('siege.integrity')}  ${Math.round(state.wallShown)}/${ss.wallMax}`
      : t('siege.breached');
    ctx.fillText(lbl, w / 2, by - h * 0.012);
    // track
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by, bw, bh);
    // fill (green->amber->red as it falls)
    const hue = 110 * frac;
    ctx.fillStyle = standing ? `hsl(${hue},60%,45%)` : '#6a2a2a';
    ctx.fillRect(bx, by, bw * frac, bh);
    // border
    ctx.strokeStyle = '#7a6a48';
    ctx.lineWidth = Math.max(1, h * 0.002);
    ctx.strokeRect(bx, by, bw, bh);
  }

  function drawArmy(garrison, faction, x, y, w, h, align, shake) {
    const rows = rowsFor(garrison);
    const col = factionColor(faction);
    ctx.save();
    ctx.translate(shake, 0);
    ctx.fillStyle = col;
    ctx.font = `bold ${Math.round(h * 0.052)}px sans-serif`;
    ctx.textAlign = align === 'left' ? 'left' : 'right';
    ctx.textBaseline = 'alphabetic';
    const nameX = align === 'left' ? x : x + w;
    ctx.fillText(localFaction(faction) + '  (' + stackSize(garrison) + ')', nameX, y - h * 0.03);

    const maxRows = Math.max(1, rows.length);
    const rowH = Math.min(h * 0.24, (h * 0.94) / maxRows);
    let cy = y + rowH * 0.2;
    ctx.textBaseline = 'middle';
    for (const row of rows) {
      let total = 0;
      for (const u of row.units) total += u.count;
      const id = row.units[0].id;
      const spr = spriteFor(opts.assets, id);
      const iconS = rowH * 0.7;
      const iconX = align === 'left' ? x : x + w - iconS;
      const iconY = cy + (rowH - iconS) / 2;
      if (spr) {
        try { ctx.drawImage(spr, iconX, iconY, iconS, iconS); } catch (_) { drawToken(iconX, iconY, iconS, row.type, col); }
      } else {
        drawToken(iconX, iconY, iconS, row.type, col);
      }
      ctx.fillStyle = '#e6dcc2';
      ctx.font = `${Math.round(rowH * 0.32)}px sans-serif`;
      ctx.textAlign = align === 'left' ? 'left' : 'right';
      const txtX = align === 'left' ? x + iconS + w * 0.04 : x + w - iconS - w * 0.04;
      ctx.fillText(`${t('type.' + row.type)} x${total}`, txtX, cy + rowH * 0.5);
      cy += rowH;
    }
    ctx.restore();
  }

  function drawToken(x, y, s, type, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.font = `bold ${Math.round(s * 0.6)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyph = { inf: 'I', arch: 'A', cav: 'C', mag: 'M', heal: 'H', undead: 'U' }[type] || '?';
    ctx.fillText(glyph, x + s / 2, y + s / 2);
  }

  function drawControls(w, h) {
    const y = h * 0.86, bh = h * 0.085, gap = w * 0.02;
    const labels = [
      { action: 'batter', key: 'siege.batter' },
      { action: 'storm', key: 'siege.storm' },
      { action: 'hold', key: 'siege.hold' },
    ];
    const bw = (w * 0.92 - gap * (labels.length - 1)) / labels.length;
    let bx = w * 0.04;
    const disabled = state.phase !== 'command' || state.finished;
    for (const L of labels) {
      const isBatter = L.action === 'batter';
      const dim = disabled || (isBatter && ss.wallHp <= 0);
      ctx.fillStyle = dim ? 'rgba(60,52,40,0.65)' : 'rgba(120,96,52,0.92)';
      ctx.fillRect(bx, y, bw, bh);
      ctx.strokeStyle = '#7a6a48';
      ctx.lineWidth = Math.max(1, h * 0.002);
      ctx.strokeRect(bx, y, bw, bh);
      ctx.fillStyle = dim ? '#8a8270' : '#f0e6c8';
      ctx.font = `bold ${Math.round(h * 0.020)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t(L.key), bx + bw / 2, y + bh / 2);
      if (!dim) state.buttons.push({ x: bx, y, w: bw, h: bh, action: L.action });
      bx += bw + gap;
    }
    // AUTO button (top-right)
    const aw = w * 0.20, ah = h * 0.05, ax = w - aw - w * 0.04, ay = h * 0.02;
    ctx.fillStyle = state.finished ? 'rgba(60,52,40,0.6)' : 'rgba(90,70,40,0.85)';
    ctx.fillRect(ax, ay, aw, ah);
    ctx.strokeStyle = '#7a6a48';
    ctx.strokeRect(ax, ay, aw, ah);
    ctx.fillStyle = '#f0e6c8';
    ctx.font = `bold ${Math.round(h * 0.018)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('siege.auto'), ax + aw / 2, ay + ah / 2);
    if (!state.finished) state.buttons.push({ x: ax, y: ay, w: aw, h: ah, action: 'auto' });
  }

  function localFaction(id) {
    const tt = t('fac.' + id);
    if (tt && tt !== 'fac.' + id) return tt;
    return id.charAt(0).toUpperCase() + id.slice(1);
  }

  // ---- lifecycle ----------------------------------------------------------
  const pointerEvents = ['pointerdown', 'mousedown', 'touchstart'];
  function addListeners() {
    for (const ev of pointerEvents) canvas.addEventListener(ev, onPointer, { passive: false });
    if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);
  }
  function removeListeners() {
    for (const ev of pointerEvents) canvas.removeEventListener(ev, onPointer);
    if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
  }

  function cleanup() {
    if (state.cleanedUp) return;
    state.cleanedUp = true;
    if (state.raf) cancelRaf(state.raf);
    removeListeners();
    try {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width || canvasW(), canvas.height || canvasH());
      ctx.restore();
    } catch (_) { /* ignore */ }
  }

  function finishAndResolve() {
    let outcome;
    try { outcome = resolveSiege(ss); } catch (_) { outcome = safeOutcome(); }
    cleanup();
    if (opts.sound) {
      try { opts.sound(ss.winner === 'attacker' ? 'sfx_victory' : 'sfx_battle'); } catch (_) {}
    }
    resolveDone(outcome);
  }

  // start
  try {
    addListeners();
    state.raf = raf(frame);
  } catch (_) {
    cleanup();
    return safeOutcome();
  }

  return donePromise;
}

export default { openSiege };
