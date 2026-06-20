// src/td_ui.js — owner feat/td (NEW)
// Real-time WAVE DEFENSE screen. Takes over the shared canvas (mirrors
// battle_ui.js / city_ui.js): host pauses its loop, this runs its own rAF loop,
// then cleans up ALL listeners + clears the canvas before resolving its Promise.
//
// Entry point (interfaces-v4 §1):
//   export async function openDefense(opts) -> Promise<{result, wavesCleared, reward}>
//   opts = { canvas, ctx, faction, provId, seed, assets, t, lang, sound, requestRedraw }
//
// Draws td_bg + the path, tower slots, towers (towers_sheet 3x2 by tower.icon),
// mobs (mobs_sheet 1x4 by mob.sprite) with HP bars, projectiles, a HUD
// (wave/lives/gold), a build palette, a Start-wave/auto button, and an end
// screen with the reward. Touch + mouse. Procedural fallbacks if assets missing.
// Plays opts.sound('music_defense'). Zero string literals in chrome (via opts.t
// with a built-in RU/EN fallback). Deterministic core via td.js.

import {
  createDefense, tdStep, placeTower, upgradeTower, sellTower,
  startNextWave, tdStatus, tdReward,
} from './td.js';
import { TOWERS } from './data/towers.js';
import { MOBS } from './data/waves.js';

// ---- localization ---------------------------------------------------------
const FALLBACK_STR = {
  ru: {
    'td.title': 'Оборона', 'td.wave': 'Волна', 'td.lives': 'Жизни',
    'td.gold': 'Золото', 'td.start': 'Начать волну', 'td.auto': 'Авто',
    'td.build': 'Строить', 'td.upgrade': 'Улучшить', 'td.sell': 'Продать',
    'td.max': 'Макс', 'td.leave': 'Выйти', 'td.victory': 'Победа',
    'td.defeat': 'Поражение', 'td.reward': 'Награда', 'td.cleared': 'Волн пройдено',
    'td.dmg': 'Урон', 'td.range': 'Радиус', 'td.rate': 'Скор.', 'td.lvl': 'Ур.',
    'td.cost': 'Цена', 'td.cancel': 'Отмена', 'td.continue': 'Продолжить',
    'td.core': 'Ядро', 'td.adena': 'Адена', 'td.wood': 'Дерево', 'td.crystal': 'Кристаллы',
    'tower.arrow': 'Лучная башня', 'tower.cannon': 'Пушка', 'tower.frost': 'Морозная башня',
    'tower.holy': 'Святилище', 'tower.ballista': 'Баллиста',
    'mob.skeleton': 'Скелет', 'mob.ghoul': 'Упырь', 'mob.wraith': 'Призрак',
    'mob.bonegolem': 'Костяной голем',
  },
  en: {
    'td.title': 'Defense', 'td.wave': 'Wave', 'td.lives': 'Lives',
    'td.gold': 'Gold', 'td.start': 'Start wave', 'td.auto': 'Auto',
    'td.build': 'Build', 'td.upgrade': 'Upgrade', 'td.sell': 'Sell',
    'td.max': 'Max', 'td.leave': 'Leave', 'td.victory': 'Victory',
    'td.defeat': 'Defeat', 'td.reward': 'Reward', 'td.cleared': 'Waves cleared',
    'td.dmg': 'DMG', 'td.range': 'Range', 'td.rate': 'Rate', 'td.lvl': 'Lv',
    'td.cost': 'Cost', 'td.cancel': 'Cancel', 'td.continue': 'Continue',
    'td.core': 'Core', 'td.adena': 'Adena', 'td.wood': 'Wood', 'td.crystal': 'Crystal',
    'tower.arrow': 'Arrow Tower', 'tower.cannon': 'Cannon', 'tower.frost': 'Frost Tower',
    'tower.holy': 'Holy Shrine', 'tower.ballista': 'Ballista',
    'mob.skeleton': 'Skeleton', 'mob.ghoul': 'Ghoul', 'mob.wraith': 'Wraith',
    'mob.bonegolem': 'Bone Golem',
  },
};

function makeT(opts) {
  const t = opts && typeof opts.t === 'function' ? opts.t : null;
  const lang = (opts && opts.lang) || 'ru';
  return (key, params) => {
    if (t) {
      try { const s = t(key, params); if (s && s !== key) return s; } catch (_) {}
    }
    const tbl = FALLBACK_STR[lang] || FALLBACK_STR.en;
    let s = tbl[key] != null ? tbl[key] : (FALLBACK_STR.en[key] != null ? FALLBACK_STR.en[key] : key);
    if (params) for (const k in params) s = s.replace('{' + k + '}', params[k]);
    return s;
  };
}

// ---- asset helpers --------------------------------------------------------
function isImage(a) {
  return a && (a instanceof Object) && (
    (typeof HTMLImageElement !== 'undefined' && a instanceof HTMLImageElement) ||
    (typeof HTMLCanvasElement !== 'undefined' && a instanceof HTMLCanvasElement) ||
    (typeof ImageBitmap !== 'undefined' && a instanceof ImageBitmap) ||
    (a.width && a.height)
  );
}
function asset(assets, ...keys) {
  if (!assets) return null;
  for (const k of keys) { const a = assets[k]; if (isImage(a)) return a; }
  return null;
}

function now() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// Tower tint by id (procedural fallback colors).
const TOWER_COLOR = {
  arrow: '#7bd08a', cannon: '#c9742e', frost: '#5fb4e0',
  holy: '#e8d06b', ballista: '#b06bd0',
};
const MOB_COLOR = {
  skeleton: '#d8d2c0', ghoul: '#9fb06b', wraith: '#8fb0d8', bonegolem: '#b0a088',
};

// ============================================================================
export async function openDefense(opts) {
  opts = opts || {};
  const t = makeT(opts);
  const canvas = opts.canvas;
  const ctx = opts.ctx || (canvas && canvas.getContext && canvas.getContext('2d'));

  // Build the deterministic sim.
  const td = createDefense({
    faction: opts.faction, provId: opts.provId,
    seed: typeof opts.seed === 'number' ? opts.seed : 12345,
    difficulty: opts.difficulty,
  });

  // No canvas -> resolve a safe quit immediately (resilient degradation).
  if (!canvas || !ctx) {
    return { result: 'quit', wavesCleared: 0, reward: tdReward(td) };
  }

  // ---- UI state -----------------------------------------------------------
  const ui = {
    buttons: [],            // hit-test rects rebuilt each frame
    selectedSlot: null,     // slot id whose menu is open
    paletteOpen: false,     // build palette for an empty slot
    auto: false,            // auto-advance waves
    lastT: now(),
    raf: 0,
    cleanedUp: false,
    endShown: false,
    endAt: 0,
  };

  let resolveDone;
  const donePromise = new Promise((res) => { resolveDone = res; });

  // ---- dimensions / coordinate mapping ------------------------------------
  function cw() { return canvas.clientWidth || canvas.width || 360; }
  function ch() { return canvas.clientHeight || canvas.height || 640; }

  // The play field occupies the top portion; HUD top, control bar bottom.
  function fieldRect() {
    const w = cw(), h = ch();
    const top = h * 0.07;
    const bottom = h * 0.14;
    return { x: 0, y: top, w, h: h - top - bottom };
  }
  // Map logical field coords (0..1000, 0..600) into the field rect.
  function fx(lx, fr) { return fr.x + (lx / td.fieldW) * fr.w; }
  function fy(ly, fr) { return fr.y + (ly / td.fieldH) * fr.h; }
  function fscale(fr) { return Math.min(fr.w / td.fieldW, fr.h / td.fieldH); }

  // ---- input --------------------------------------------------------------
  function localPoint(ev) {
    const rect = canvas.getBoundingClientRect();
    const src = (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]) || ev;
    const sx = rect.width ? cw() / rect.width : 1;
    const sy = rect.height ? ch() / rect.height : 1;
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
  }
  function hitButton(p) {
    for (let i = ui.buttons.length - 1; i >= 0; i--) {
      const b = ui.buttons[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
    }
    return null;
  }
  function hitSlot(p) {
    const fr = fieldRect();
    const sc = fscale(fr);
    const r = Math.max(14, 26 * sc);
    for (const s of td.slots) {
      const sx = fx(s.x, fr), sy = fy(s.y, fr);
      if (Math.hypot(p.x - sx, p.y - sy) <= r) return s;
    }
    return null;
  }

  function onPointer(ev) {
    if (ui.cleanedUp) return;
    try { ev.preventDefault(); } catch (_) {}
    const p = localPoint(ev);

    // End screen swallows input -> resolve.
    if (td.over && ui.endShown) { finishAndResolve(); return; }

    // Buttons take priority (palette/menu/HUD).
    const b = hitButton(p);
    if (b) { handleButton(b); return; }

    // Tapping a slot toggles its menu / palette.
    const slot = hitSlot(p);
    if (slot) {
      if (slot.tower) { ui.selectedSlot = slot.id; ui.paletteOpen = false; }
      else { ui.selectedSlot = slot.id; ui.paletteOpen = true; }
      beep();
      return;
    }
    // Tap empty space -> close menus.
    ui.selectedSlot = null; ui.paletteOpen = false;
  }

  function onKey(ev) {
    if (ui.cleanedUp) return;
    const k = ev.key;
    if (k === 'Enter' || k === ' ') {
      if (td.over) { finishAndResolve(); return; }
      if (tdStatus(td).building) startNextWave(td);
    } else if (k === 'a' || k === 'A') { ui.auto = !ui.auto; }
    else if (k === 'Escape') { if (!ui.selectedSlot && !ui.paletteOpen) finishAndResolve(); ui.selectedSlot = null; ui.paletteOpen = false; }
  }

  function beep() { if (opts.sound) { try { opts.sound('sfx_select'); } catch (_) {} } }

  function handleButton(b) {
    switch (b.action) {
      case 'start':
        if (tdStatus(td).building && !td.over) startNextWave(td);
        beep();
        break;
      case 'auto': ui.auto = !ui.auto; beep(); break;
      case 'leave': finishAndResolve(); break;
      case 'build': {
        const r = placeTower(td, b.slotId, b.towerId);
        if (r.ok) { ui.paletteOpen = false; ui.selectedSlot = null; beep(); }
        break;
      }
      case 'upgrade': { upgradeTower(td, b.slotId); beep(); break; }
      case 'sell': { sellTower(td, b.slotId); ui.selectedSlot = null; beep(); break; }
      case 'close': ui.selectedSlot = null; ui.paletteOpen = false; beep(); break;
      case 'end': finishAndResolve(); break;
      default: break;
    }
  }

  // ---- main loop ----------------------------------------------------------
  function frame() {
    if (ui.cleanedUp) return;
    const tnow = now();
    let dt = tnow - ui.lastT;
    ui.lastT = tnow;
    if (dt < 0) dt = 0;
    if (dt > 250) dt = 250; // clamp huge gaps (tab switch)

    const st = tdStatus(td);
    if (!st.over) {
      // Auto-advance: when in build phase and auto is on, start the next wave.
      if (ui.auto && st.building) startNextWave(td);
      tdStep(td, dt);
    }

    try { draw(tnow); } catch (_) {}

    if (td.over) {
      if (!ui.endShown) { ui.endShown = true; ui.endAt = tnow; }
    }
    ui.raf = raf(frame);
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
    const w = cw(), h = ch();
    ui.buttons = [];
    ctx.save();

    // Background.
    const bg = asset(opts.assets, 'td_bg', 'td_bg.png');
    if (bg) { try { ctx.drawImage(bg, 0, 0, w, h); } catch (_) { drawBgProc(w, h); } }
    else drawBgProc(w, h);

    const fr = fieldRect();
    drawPath(fr);
    drawSlots(fr);
    drawProjectiles(fr);
    drawMobs(fr, tnow);
    drawTowers(fr, tnow);
    drawHud(w, h);
    drawControls(w, h);

    if (ui.paletteOpen && ui.selectedSlot != null) drawPalette(w, h);
    else if (ui.selectedSlot != null) drawTowerMenu(w, h);

    if (td.over) drawEndScreen(w, h);

    ctx.restore();
  }

  function drawBgProc(w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a2230'); g.addColorStop(1, '#0e1118');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  function drawPath(fr) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const sc = fscale(fr);
    // road body
    ctx.strokeStyle = '#3a3326';
    ctx.lineWidth = Math.max(10, 44 * sc);
    pathStroke(fr);
    // road inner
    ctx.strokeStyle = '#564a35';
    ctx.lineWidth = Math.max(6, 34 * sc);
    pathStroke(fr);
    ctx.restore();

    // Core marker at the end.
    const last = td.path[td.path.length - 1];
    const cx = fx(Math.min(last.x, td.fieldW), fr), cy = fy(last.y, fr);
    ctx.save();
    ctx.fillStyle = '#c44'; ctx.strokeStyle = '#e8d89a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx - 6, cy, Math.max(8, 16 * sc), 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function pathStroke(fr) {
    ctx.beginPath();
    for (let i = 0; i < td.path.length; i++) {
      const px = fx(td.path[i].x, fr), py = fy(td.path[i].y, fr);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  function drawSlots(fr) {
    const sc = fscale(fr);
    const r = Math.max(12, 22 * sc);
    for (const s of td.slots) {
      if (s.tower) continue; // built towers drawn separately
      const sx = fx(s.x, fr), sy = fy(s.y, fr);
      ctx.save();
      ctx.fillStyle = (ui.selectedSlot === s.id) ? 'rgba(232,200,90,0.35)' : 'rgba(120,130,150,0.18)';
      ctx.strokeStyle = 'rgba(200,210,230,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(220,228,240,0.7)';
      ctx.font = `bold ${Math.round(r)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+', sx, sy + 1);
      ctx.restore();
    }
  }

  // towers_sheet sliced 3x2 by tower.icon (col = icon%3, row = floor(icon/3)).
  function towerSpriteRect(sheet, icon) {
    const cols = 3, rows = 2;
    const cw_ = sheet.width / cols, ch_ = sheet.height / rows;
    const col = icon % cols, row = Math.floor(icon / cols);
    return { sx: col * cw_, sy: row * ch_, sw: cw_, sh: ch_ };
  }

  function drawTowers(fr, tnow) {
    const sc = fscale(fr);
    const sheet = asset(opts.assets, 'towers_sheet', 'towers_sheet.png');
    const sz = Math.max(22, 40 * sc);
    for (const tw of td.towers) {
      const def = TOWERS.find((d) => d.id === tw.towerId);
      const sx = fx(tw.x, fr), sy = fy(tw.y, fr);
      // range ring when selected
      if (ui.selectedSlot === tw.slotId && def) {
        const lvl = def.levels[tw.level];
        if (lvl) {
          ctx.save();
          ctx.strokeStyle = 'rgba(232,200,90,0.5)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(sx, sy, lvl.range * sc, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
      }
      ctx.save();
      ctx.translate(sx, sy);
      if (sheet && def) {
        const r = towerSpriteRect(sheet, def.icon);
        try { ctx.drawImage(sheet, r.sx, r.sy, r.sw, r.sh, -sz / 2, -sz / 2, sz, sz); }
        catch (_) { drawTowerProc(tw, def, sz); }
      } else drawTowerProc(tw, def, sz);
      // level pips
      ctx.fillStyle = '#e8d06b';
      const pip = Math.max(2, sz * 0.08);
      for (let i = 0; i <= tw.level; i++) {
        ctx.beginPath(); ctx.arc(-sz / 2 + 4 + i * (pip * 2 + 2), sz / 2 - 3, pip, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
  function drawTowerProc(tw, def, sz) {
    ctx.fillStyle = (def && TOWER_COLOR[def.id]) || '#8aa';
    ctx.strokeStyle = '#1a1510'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, sz * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // barrel
    ctx.save(); ctx.rotate(tw.angle || 0);
    ctx.fillStyle = '#2a2620'; ctx.fillRect(0, -sz * 0.08, sz * 0.5, sz * 0.16);
    ctx.restore();
  }

  // mobs_sheet sliced 1x4 by mob.sprite (4 columns, 1 row).
  function mobSpriteRect(sheet, sprite) {
    const cols = 4;
    const cw_ = sheet.width / cols, ch_ = sheet.height;
    return { sx: sprite * cw_, sy: 0, sw: cw_, sh: ch_ };
  }

  function drawMobs(fr, tnow) {
    const sc = fscale(fr);
    const sheet = asset(opts.assets, 'mobs_sheet', 'mobs_sheet.png');
    for (const m of td.mobs) {
      const sx = fx(m.x, fr), sy = fy(m.y, fr);
      const big = m.type === 'bonegolem';
      const sz = Math.max(16, (big ? 52 : 30) * sc);
      ctx.save();
      ctx.translate(sx, sy);
      if (sheet) {
        const r = mobSpriteRect(sheet, m.sprite);
        try { ctx.drawImage(sheet, r.sx, r.sy, r.sw, r.sh, -sz / 2, -sz / 2, sz, sz); }
        catch (_) { drawMobProc(m, sz); }
      } else drawMobProc(m, sz);
      // slow tint
      if (m.slowUntil > td.clock) {
        ctx.fillStyle = 'rgba(95,180,224,0.35)';
        ctx.beginPath(); ctx.arc(0, 0, sz * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      // HP bar
      const bw = sz * 0.9, bh = Math.max(3, sz * 0.10);
      const bx = sx - bw / 2, by = sy - sz / 2 - bh - 2;
      ctx.fillStyle = '#000'; ctx.globalAlpha = 0.5; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2); ctx.globalAlpha = 1;
      ctx.fillStyle = '#3a2020'; ctx.fillRect(bx, by, bw, bh);
      const frac = clamp(m.hp / Math.max(1, m.hpMax), 0, 1);
      ctx.fillStyle = frac > 0.5 ? '#7be08a' : frac > 0.25 ? '#e8d06b' : '#ff6b5a';
      ctx.fillRect(bx, by, bw * frac, bh);
    }
  }
  function drawMobProc(m, sz) {
    ctx.fillStyle = MOB_COLOR[m.type] || '#aaa';
    ctx.strokeStyle = '#1a1510'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, sz * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a1510';
    ctx.font = `${Math.round(sz * 0.5)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('☠', 0, sz * 0.04);
  }

  function drawProjectiles(fr) {
    const sc = fscale(fr);
    for (const pr of td.projectiles) {
      const x = fx(pr.x, fr), y = fy(pr.y, fr);
      ctx.save();
      if (pr.kind === 'frost') ctx.fillStyle = '#9fdcff';
      else if (pr.kind === 'cannon' || pr.kind === 'ballista') ctx.fillStyle = '#e0a060';
      else if (pr.kind === 'holy') ctx.fillStyle = '#fff0a0';
      else ctx.fillStyle = '#e8e0c0';
      const r = Math.max(2, (pr.kind === 'ballista' ? 5 : 3) * sc);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // ---- HUD ----------------------------------------------------------------
  function drawHud(w, h) {
    const st = tdStatus(td);
    ctx.save();
    ctx.fillStyle = 'rgba(15,18,24,0.85)';
    ctx.fillRect(0, 0, w, h * 0.07);
    ctx.textBaseline = 'middle';
    const fs = Math.round(h * 0.026);
    ctx.font = `bold ${fs}px sans-serif`;
    const midY = h * 0.035;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8d89a';
    const waveNo = Math.max(1, st.wave || 1);
    ctx.fillText(`${t('td.wave')} ${st.over ? st.wavesCleared : waveNo}/${st.totalWaves}`, w * 0.03, midY);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff8a6b';
    ctx.fillText(`♥ ${st.lives}`, w * 0.5, midY);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#f2d96b';
    ctx.fillText(`⛁ ${st.gold}`, w * 0.97, midY);
    ctx.restore();
  }

  // ---- bottom control bar -------------------------------------------------
  function drawControls(w, h) {
    const st = tdStatus(td);
    const barY = h * 0.86, barH = h * 0.14;
    ctx.save();
    ctx.fillStyle = 'rgba(15,18,24,0.92)';
    ctx.fillRect(0, barY, w, barH);
    ctx.strokeStyle = '#2a3242'; ctx.strokeRect(0, barY, w, barH);
    ctx.restore();

    const pad = w * 0.025;
    const bh = barH * 0.62;
    const by = barY + (barH - bh) / 2;

    // Start wave (disabled while a wave is live or game over).
    const startDis = !st.building || st.over;
    btn(t('td.start'), pad, by, w * 0.40, bh, { action: 'start' }, false, startDis, true);
    // Auto toggle.
    btn(t('td.auto'), pad + w * 0.42, by, w * 0.26, bh, { action: 'auto' }, ui.auto, st.over);
    // Leave.
    btn(t('td.leave'), pad + w * 0.70, by, w * 0.275, bh, { action: 'leave' }, false, false);
  }

  // ---- build palette (empty slot) -----------------------------------------
  function drawPalette(w, h) {
    const st = tdStatus(td);
    const slotId = ui.selectedSlot;
    const px = w * 0.06, pw = w * 0.88;
    const rowH = h * 0.072;
    const ph = rowH * (TOWERS.length + 1) + h * 0.02;
    const py = h * 0.86 - ph - h * 0.01;
    panelBox(px, py, pw, ph);

    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = '#e8d89a'; ctx.font = `bold ${Math.round(h * 0.024)}px sans-serif`;
    ctx.fillText(t('td.build'), px + 12, py + rowH * 0.5);
    // close
    btn('×', px + pw - rowH, py + rowH * 0.12, rowH * 0.76, rowH * 0.76, { action: 'close' }, false, false);

    let y = py + rowH;
    for (const def of TOWERS) {
      const affordable = st.gold >= def.cost;
      const rx = px + 8, rw = pw - 16, rh = rowH - 6;
      // row button
      btn('', rx, y, rw, rh, { action: 'build', slotId, towerId: def.id }, false, !affordable, false, true);
      // icon swatch
      ctx.save();
      ctx.fillStyle = TOWER_COLOR[def.id] || '#8aa';
      ctx.beginPath(); ctx.arc(rx + rh * 0.5, y + rh * 0.5, rh * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // name + cost + stats
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = affordable ? '#efe6cf' : '#7a7264';
      ctx.font = `bold ${Math.round(h * 0.022)}px sans-serif`;
      ctx.fillText(towerName(def), rx + rh + 6, y + rh * 0.36);
      const l0 = def.levels[0];
      ctx.font = `${Math.round(h * 0.016)}px sans-serif`;
      ctx.fillStyle = affordable ? '#bcae86' : '#6a6254';
      ctx.fillText(`${t('td.dmg')} ${l0.damage}  ${t('td.range')} ${l0.range}  ${t('td.rate')} ${l0.fireRate}`, rx + rh + 6, y + rh * 0.72);
      // cost
      ctx.textAlign = 'right';
      ctx.fillStyle = affordable ? '#f2d96b' : '#7a6a3a';
      ctx.font = `bold ${Math.round(h * 0.022)}px sans-serif`;
      ctx.fillText(`⛁ ${def.cost}`, rx + rw - 10, y + rh * 0.5);
      y += rowH;
    }
  }

  // ---- tower menu (built slot) --------------------------------------------
  function drawTowerMenu(w, h) {
    const st = tdStatus(td);
    const slot = td.slots.find((s) => s.id === ui.selectedSlot);
    if (!slot || !slot.tower) { ui.selectedSlot = null; return; }
    const tw = slot.tower;
    const def = TOWERS.find((d) => d.id === tw.towerId);
    if (!def) return;
    const lvl = def.levels[tw.level];
    const nextCost = lvl ? lvl.upgradeCost : 0;
    const isMax = !nextCost;

    const pw = w * 0.7, ph = h * 0.2;
    const px = w * 0.15, py = h * 0.86 - ph - h * 0.01;
    panelBox(px, py, pw, ph);

    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = '#e8d89a'; ctx.font = `bold ${Math.round(h * 0.024)}px sans-serif`;
    ctx.fillText(`${towerName(def)} · ${t('td.lvl')}${tw.level + 1}`, px + 12, py + ph * 0.18);
    ctx.fillStyle = '#bcae86'; ctx.font = `${Math.round(h * 0.018)}px sans-serif`;
    if (lvl) ctx.fillText(`${t('td.dmg')} ${lvl.damage}  ${t('td.range')} ${lvl.range}  ${t('td.rate')} ${lvl.fireRate}`, px + 12, py + ph * 0.42);

    const bh = ph * 0.32, by = py + ph - bh - 8;
    const upLabel = isMax ? t('td.max') : `${t('td.upgrade')} ⛁${nextCost}`;
    const upDis = isMax || st.gold < nextCost || st.over;
    btn(upLabel, px + 10, by, pw * 0.5 - 14, bh, { action: 'upgrade', slotId: slot.id }, false, upDis, true);
    const refund = Math.floor(tw.invested * 0.6);
    btn(`${t('td.sell')} ⛁${refund}`, px + pw * 0.5 + 4, by, pw * 0.5 - 14, bh, { action: 'sell', slotId: slot.id }, false, st.over);
    // close X
    btn('×', px + pw - bh - 6, py + 6, bh, bh, { action: 'close' }, false, false);
  }

  // ---- end screen ---------------------------------------------------------
  function drawEndScreen(w, h) {
    const st = tdStatus(td);
    const reward = tdReward(td);
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,14,0.82)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = st.won ? '#7be08a' : '#ff6b5a';
    ctx.font = `bold ${Math.round(h * 0.06)}px serif`;
    ctx.fillText(st.won ? t('td.victory') : t('td.defeat'), w / 2, h * 0.24);

    ctx.fillStyle = '#e8d89a'; ctx.font = `${Math.round(h * 0.028)}px sans-serif`;
    ctx.fillText(`${t('td.cleared')}: ${st.wavesCleared}/${st.totalWaves}`, w / 2, h * 0.34);

    if (st.won) {
      ctx.fillStyle = '#f2d96b'; ctx.font = `bold ${Math.round(h * 0.03)}px sans-serif`;
      ctx.fillText(t('td.reward'), w / 2, h * 0.44);
      ctx.fillStyle = '#efe6cf'; ctx.font = `${Math.round(h * 0.025)}px sans-serif`;
      let line = `${t('td.adena')} ${reward.adena}  ·  ${t('td.wood')} ${reward.wood}  ·  ${t('td.crystal')} ${reward.crystal}`;
      ctx.fillText(line, w / 2, h * 0.51);
      if (reward.units) {
        const parts = Object.keys(reward.units).map((u) => `${unitName(u)} ×${reward.units[u]}`);
        ctx.fillStyle = '#bcae86'; ctx.font = `${Math.round(h * 0.022)}px sans-serif`;
        ctx.fillText(parts.join('   '), w / 2, h * 0.57);
      }
    }

    const bw = w * 0.5, bh = h * 0.07, bx = (w - bw) / 2, by = h * 0.68;
    btn(t('td.continue'), bx, by, bw, bh, { action: 'end' }, false, false, true);
    ctx.restore();
  }

  // ---- shared widgets -----------------------------------------------------
  function panelBox(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(18,22,30,0.96)';
    roundRect(x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = '#3a4456'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }

  function btn(label, x, y, w, h, action, active, disabled, primary, transparent) {
    ctx.save();
    ctx.globalAlpha = disabled ? 0.4 : 1;
    if (!transparent) {
      ctx.fillStyle = active ? '#e0a04a' : (primary ? '#2f6fb0' : '#262e3a');
      roundRect(x, y, w, h, Math.min(8, h * 0.25)); ctx.fill();
      ctx.strokeStyle = active ? '#ffd06b' : '#3a4456'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (label) {
      ctx.fillStyle = active ? '#1a1510' : '#efe6cf';
      ctx.font = `bold ${Math.round(h * 0.4)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, y + h / 2);
    }
    ctx.restore();
    ctx.textBaseline = 'middle';
    if (!disabled) ui.buttons.push({ x, y, w, h, action: action.action, slotId: action.slotId, towerId: action.towerId });
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

  function towerName(def) {
    const n = t(def.nameKey);
    if (n && n !== def.nameKey) return n;
    const f = t('tower.' + def.id);
    return (f && f !== 'tower.' + def.id) ? f : def.id;
  }
  function unitName(id) {
    const n = t('unit.' + id);
    return (n && n !== 'unit.' + id) ? n : id;
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
    if (ui.cleanedUp) return;
    ui.cleanedUp = true;
    if (ui.raf) cancelRaf(ui.raf);
    removeListeners();
    if (opts.sound) { try { opts.sound('music_defense', { stop: true }); } catch (_) {} }
    try {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width || cw(), canvas.height || ch());
      ctx.restore();
    } catch (_) {}
  }

  function finishAndResolve() {
    const st = tdStatus(td);
    const result = st.over ? (st.won ? 'win' : 'lose') : 'quit';
    const reward = (result === 'win') ? tdReward(td) : { adena: 0, wood: 0, crystal: 0 };
    cleanup();
    resolveDone({ result, wavesCleared: st.wavesCleared, reward });
  }

  // ---- start --------------------------------------------------------------
  try {
    if (opts.sound) { try { opts.sound('music_defense'); } catch (_) {} }
    addListeners();
    ui.lastT = now();
    ui.raf = raf(frame);
  } catch (_) {
    cleanup();
    return { result: 'quit', wavesCleared: tdStatus(td).wavesCleared, reward: { adena: 0, wood: 0, crystal: 0 } };
  }

  return donePromise;
}

export default { openDefense };
