// src/city_ui.js — owner D (feat/city-client)
// Heroes-of-M&M-style CITY screen. A self-contained module the map client opens;
// it takes over the shared canvas, runs its own animation+input loop, lets the
// player inspect/build/upgrade the 9 buildings of a city, and RESOLVES when the
// player leaves. Mirrors battle_ui.js's canvas-takeover + listener-cleanup
// pattern. Pure browser+ESM: it mutates game state ONLY through the city engine
// api (opts.city). No imports from engine/ui/render/data (resilient to absence).
//
// Entry point (interfaces-v3 §6):
//   export async function openCity(opts) -> Promise<void>
//   opts = { canvas, ctx, state, provId, city, t, assets, lang,
//            sound, requestRedraw, onChange }
//     - city = { cityView, canBuild, startBuild, hasCity }  (the city engine api)
//
// Resilient degradation is mandatory: if the city api or its buildings are
// missing/empty, show a styled "no city here" panel with a Leave button and
// never throw. Missing assets (bg_city, buildings_sheet, music_city) fall back
// to procedural art / silent audio.

// ---------------------------------------------------------------------------
// Localization: prefer opts.t, fall back to a tiny built-in RU/EN table so the
// screen is fully localized even if t() is absent. ZERO bare string literals
// reach the canvas except through this layer.
// ---------------------------------------------------------------------------
const LOCAL = {
  ru: {
    'city.title': 'Город', 'city.leave': 'Покинуть город', 'city.build': 'Построить',
    'city.upgrade': 'Улучшить', 'city.queue': 'Очередь строительства', 'city.empty': 'Здесь нет города',
    'city.maxlevel': 'Макс. уровень', 'city.level': 'Ур.', 'city.notbuilt': 'Не построено',
    'city.cost': 'Стоимость', 'city.time': 'Время', 'city.turns': 'ходов', 'city.effect': 'Эффект',
    'city.building': 'Строится', 'city.production': 'Производство', 'city.fortified': 'Укреплён',
    'city.select': 'Выберите здание', 'city.free': 'Бесплатно', 'city.perturn': '/ход',
    'res.adena': 'Адена', 'res.wood': 'Древесина', 'res.crystal': 'Кристаллы',
    'city.eff.produceRes': 'Доход', 'city.eff.produceUnit': 'Юниты', 'city.eff.defense': 'Защита',
    'city.eff.heal': 'Лечение', 'city.eff.unitsEvery': '+{count} {unit} каждые {n} ход.',
    'city.eff.defBonus': '+{pct}% к защите', 'city.eff.healPct': '+{pct}% лечения гарнизона',
    'cant.notowned': 'Город не ваш', 'cant.nocity': 'Здесь нет города', 'cant.maxlevel': 'Макс. уровень',
    'cant.cost': 'Недостаточно ресурсов', 'cant.queued': 'Уже в очереди', 'cant.blocked': 'Недоступно',
    'unit.inf': 'Пехота', 'unit.arch': 'Лучники', 'unit.cav': 'Конница', 'unit.mag': 'Маги',
    'unit.heal': 'Лекари', 'unit.undead': 'Нежить',
  },
  en: {
    'city.title': 'City', 'city.leave': 'Leave city', 'city.build': 'Build',
    'city.upgrade': 'Upgrade', 'city.queue': 'Build queue', 'city.empty': 'No city here',
    'city.maxlevel': 'Max level', 'city.level': 'Lv.', 'city.notbuilt': 'Not built',
    'city.cost': 'Cost', 'city.time': 'Time', 'city.turns': 'turns', 'city.effect': 'Effect',
    'city.building': 'Building', 'city.production': 'Production', 'city.fortified': 'Fortified',
    'city.select': 'Select a building', 'city.free': 'Free', 'city.perturn': '/turn',
    'res.adena': 'Adena', 'res.wood': 'Wood', 'res.crystal': 'Crystal',
    'city.eff.produceRes': 'Income', 'city.eff.produceUnit': 'Units', 'city.eff.defense': 'Defense',
    'city.eff.heal': 'Healing', 'city.eff.unitsEvery': '+{count} {unit} every {n} turns',
    'city.eff.defBonus': '+{pct}% defense', 'city.eff.healPct': '+{pct}% garrison healing',
    'cant.notowned': 'City is not yours', 'cant.nocity': 'No city here', 'cant.maxlevel': 'Max level',
    'cant.cost': 'Not enough resources', 'cant.queued': 'Already in queue', 'cant.blocked': 'Unavailable',
    'unit.inf': 'Infantry', 'unit.arch': 'Archers', 'unit.cav': 'Cavalry', 'unit.mag': 'Mages',
    'unit.heal': 'Healers', 'unit.undead': 'Undead',
  },
};

function localLabel(key, lang, params) {
  const tbl = LOCAL[lang] || LOCAL.en;
  let s = tbl[key];
  if (s == null) s = LOCAL.en[key];
  if (s == null) s = key;
  if (params) for (const k in params) s = s.replace('{' + k + '}', params[k]);
  return s;
}

// Localize via opts.t when present (and when it returns something other than the
// key, i.e. a real hit); otherwise fall back to the built-in table.
function makeT(opts) {
  const t = opts && typeof opts.t === 'function' ? opts.t : null;
  const lang = (opts && opts.lang) || 'ru';
  return (key, params) => {
    if (t) {
      try {
        const s = t(key, params);
        if (s != null && s !== key) return s;
      } catch (_) { /* fall through */ }
    }
    return localLabel(key, lang, params);
  };
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// ---------------------------------------------------------------------------
// Audio: opts.sound may be a callable sound(key), a { play(key), on } object
// (as ui.js passes), or absent. We additionally lazily create our own <Audio>
// for music_city so it loops while open and stops on leave — all in try/catch,
// respecting an `on` toggle when present. Missing files never break anything.
// ---------------------------------------------------------------------------
function makeAudio(opts) {
  const s = opts && opts.sound;
  let ownMusic = null;
  const soundOn = () => {
    if (!s) return false;
    if (typeof s === 'object' && 'on' in s) return !!s.on;
    return true;
  };
  const callKey = (key) => {
    try {
      if (typeof s === 'function') s(key);
      else if (s && typeof s.play === 'function') s.play(key);
    } catch (_) { /* ignore */ }
  };
  return {
    sfx(key) { callKey(key); },
    startMusic() {
      // First let the host play it (it may own a preloaded music_city track).
      callKey('music_city');
      // Then ensure a looping track ourselves as a resilient fallback.
      try {
        if (typeof Audio === 'undefined') return;
        if (!soundOn()) return;
        ownMusic = new Audio();
        ownMusic.src = 'assets/audio/music_city.mp3';
        ownMusic.loop = true;
        ownMusic.volume = 0.35;
        const p = ownMusic.play();
        if (p && p.catch) p.catch(() => {});
      } catch (_) { ownMusic = null; }
    },
    stopMusic() {
      try { if (ownMusic) { ownMusic.pause(); ownMusic.currentTime = 0; } } catch (_) {}
      ownMusic = null;
    },
  };
}

// Faction tint table (kept local — no import from data/factions).
const FACTION_COLOR = {
  human: '#3b6fd4', elf: '#2fa37a', orc: '#b5532a', shilen: '#7d3fb0',
  darkelf: '#8a4fae', dwarf: '#caa23c', kamael: '#5a8fb0', neutral: '#9aa4b2',
};
function factionColor(id) { return FACTION_COLOR[id] || '#9aa4b2'; }

// Resource accent colors for the resource bar / cost chips.
const RES_COLOR = { adena: '#e8c45a', wood: '#9c7a4a', crystal: '#8fc6e8' };
const RES_ORDER = ['adena', 'wood', 'crystal'];

// Resolve the buildings sheet image from opts.assets (try common key shapes).
function sheetImage(assets) {
  if (!assets) return null;
  const cands = ['buildings_sheet', 'buildings_sheet.png', 'buildingsSheet'];
  for (const k of cands) {
    const a = assets[k];
    if (isImage(a)) return a;
  }
  return null;
}
function bgImage(assets) {
  if (!assets) return null;
  const cands = ['bg_city', 'bg_city.png', 'bgCity'];
  for (const k of cands) {
    const a = assets[k];
    if (isImage(a)) return a;
  }
  return null;
}
function isImage(a) {
  if (!a) return false;
  return (typeof HTMLImageElement !== 'undefined' && a instanceof HTMLImageElement) ||
         (typeof HTMLCanvasElement !== 'undefined' && a instanceof HTMLCanvasElement) ||
         (typeof ImageBitmap !== 'undefined' && a instanceof ImageBitmap) ||
         (typeof a.width === 'number' && typeof a.height === 'number' && a.width > 0);
}

// ============================================================================
// openCity — the single public entry point.
// ============================================================================
export async function openCity(opts) {
  opts = opts || {};
  const t = makeT(opts);
  const audio = makeAudio(opts);
  const lang = opts.lang || 'ru';

  const canvas = opts.canvas;
  const ctx = opts.ctx || (canvas && canvas.getContext && canvas.getContext('2d'));
  const city = opts.city || null;
  const provId = opts.provId;

  // ---- promise plumbing ----------------------------------------------------
  let resolveDone;
  const donePromise = new Promise((res) => { resolveDone = res; });

  // If we cannot render at all, resolve immediately (never hang the caller).
  if (!canvas || !ctx) { try { audio.stopMusic(); } catch (_) {} return Promise.resolve(); }

  // ---- screen state --------------------------------------------------------
  const ui = {
    selected: null,      // selected building id (info panel) or null
    buttons: [],         // hit-test rects rebuilt each frame
    slots: [],           // building slot rects rebuilt each frame
    blockMsg: null,      // transient "can't build" reason key
    blockUntil: 0,
    cleanedUp: false,
    raf: 0,
    t0: 0,
  };

  // ---- read the city view (resilient) -------------------------------------
  // The view drives the whole screen; we re-read it after each successful build.
  function readView() {
    if (!city || typeof city.cityView !== 'function') return null;
    try {
      const v = city.cityView(opts.state, provId);
      if (!v || !Array.isArray(v.buildings) || v.buildings.length === 0) return null;
      return v;
    } catch (_) { return null; }
  }
  let view = readView();
  // hasCity is an extra guard but cityView returning a real view is the truth.
  const hasCity = !view ? false : true;

  // ---- dimensions ----------------------------------------------------------
  function cw() { return canvas.clientWidth || canvas.width || 360; }
  function ch() { return canvas.clientHeight || canvas.height || 640; }

  // ---- input ---------------------------------------------------------------
  function localPoint(ev) {
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: cw(), height: ch() };
    const src = (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]) || ev;
    const sx = rect.width ? cw() / rect.width : 1;
    const sy = rect.height ? ch() / rect.height : 1;
    return { x: ((src.clientX || 0) - rect.left) * sx, y: ((src.clientY || 0) - rect.top) * sy };
  }

  function hitButtons(p) {
    for (let i = ui.buttons.length - 1; i >= 0; i--) {
      const b = ui.buttons[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
    }
    return null;
  }
  function hitSlots(p) {
    for (let i = ui.slots.length - 1; i >= 0; i--) {
      const s = ui.slots[i];
      if (p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h) return s;
    }
    return null;
  }

  function onPointer(ev) {
    if (ui.cleanedUp) return;
    try { ev.preventDefault(); } catch (_) {}
    const p = localPoint(ev);
    const b = hitButtons(p);
    if (b) { handleButton(b); return; }
    const s = hitSlots(p);
    if (s) { selectBuilding(s.id); }
  }

  function onKey(ev) {
    if (ui.cleanedUp) return;
    const k = ev.key;
    if (k === 'Escape') { leave(); }
    else if (k === 'Enter' || k === ' ') {
      // Enter confirms a build on the selected building, else leaves.
      if (ui.selected) tryBuild(ui.selected);
    }
  }

  // ---- actions -------------------------------------------------------------
  function selectBuilding(id) {
    ui.selected = ui.selected === id ? null : id;
    audio.sfx('sfx_select');
    redraw();
  }

  function flashBlock(reasonKey) {
    ui.blockMsg = reasonKey;
    ui.blockUntil = now() + 2200;
  }

  // Guard with canBuild, then startBuild, then onChange + re-read view.
  function tryBuild(id) {
    if (!city || typeof city.startBuild !== 'function') { flashBlock('cant.blocked'); return; }
    // Guard FIRST.
    if (typeof city.canBuild === 'function') {
      let res;
      try { res = city.canBuild(opts.state, provId, id); } catch (_) { res = { ok: false }; }
      if (!res || !res.ok) {
        flashBlock((res && res.reason) || 'cant.blocked');
        audio.sfx('sfx_select');
        redraw();
        return;
      }
    }
    // Build.
    try {
      city.startBuild(opts.state, provId, id);
    } catch (_) {
      flashBlock('cant.blocked');
      redraw();
      return;
    }
    audio.sfx('sfx_select');
    // Refresh the map HUD, then re-read the city view to reflect the new queue.
    try { if (typeof opts.onChange === 'function') opts.onChange(); } catch (_) {}
    try { if (typeof opts.requestRedraw === 'function') opts.requestRedraw(); } catch (_) {}
    view = readView() || view;
    ui.blockMsg = null;
    redraw();
  }

  function handleButton(b) {
    if (ui.cleanedUp) return;
    switch (b.action) {
      case 'leave': leave(); break;
      case 'build': tryBuild(b.id); break;
      case 'close': ui.selected = null; redraw(); break;
      default: break;
    }
  }

  function leave() {
    cleanup();
    resolveDone();
  }

  // ---- owner resources -----------------------------------------------------
  function ownerResources() {
    const owner = view && view.owner;
    const f = opts.state && opts.state.factions && owner ? opts.state.factions[owner] : null;
    return {
      adena: f && typeof f.adena === 'number' ? f.adena : 0,
      wood: f && typeof f.wood === 'number' ? f.wood : 0,
      crystal: f && typeof f.crystal === 'number' ? f.crystal : 0,
    };
  }

  // ---- timing / raf --------------------------------------------------------
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function raf(fn) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
    return setTimeout(() => fn(now()), 16);
  }
  function cancelRaf(id) {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
    else clearTimeout(id);
  }
  function redraw() { /* draw happens in the loop; this is a hint for tests */ try { draw(now()); } catch (_) {} }

  // ---- render loop ---------------------------------------------------------
  function frame() {
    if (ui.cleanedUp) return;
    const tnow = now();
    if (ui.blockMsg && tnow > ui.blockUntil) ui.blockMsg = null;
    try { draw(tnow); } catch (_) { /* never let a draw error break the loop */ }
    ui.raf = raf(frame);
  }

  // ========================================================================
  // DRAWING
  // ========================================================================
  function draw(tnow) {
    const w = cw(), h = ch();
    ui.buttons = [];
    ui.slots = [];

    ctx.save();
    drawBackground(w, h, tnow);

    if (!hasCity || !view) {
      drawNoCity(w, h);
      ctx.restore();
      return;
    }

    drawResourceBar(w, h);
    drawTitle(w, h);
    drawGrid(w, h, tnow);
    drawQueue(w, h);

    if (ui.selected) drawInfoPanel(w, h);

    drawLeaveButton(w, h);

    if (ui.blockMsg) drawBlockToast(w, h);
    ctx.restore();
  }

  function drawBackground(w, h, tnow) {
    const img = bgImage(opts.assets);
    if (img) {
      try { ctx.drawImage(img, 0, 0, w, h); ctx.fillStyle = 'rgba(8,10,14,0.35)'; ctx.fillRect(0, 0, w, h); return; }
      catch (_) { /* fall to procedural */ }
    }
    // Procedural slate-stone fallback: a cool vertical gradient + faint masonry.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2b313a');
    g.addColorStop(0.5, '#222730');
    g.addColorStop(1, '#171b22');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // masonry lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const bh = Math.max(22, h * 0.05);
    for (let y = bh; y < h; y += bh) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    let row = 0;
    for (let y = 0; y < h; y += bh, row++) {
      const off = (row % 2) ? bh * 1.5 : 0;
      for (let x = off; x < w; x += bh * 3) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + bh); ctx.stroke();
      }
    }
  }

  function drawTitle(w, h) {
    const owner = view.owner;
    ctx.fillStyle = '#e8d89a';
    ctx.font = `bold ${Math.round(h * 0.030)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // City name via prov.<id> if available, else generic title.
    const provName = t('prov.' + provId);
    const title = (provName && provName !== 'prov.' + provId) ? provName : t('city.title');
    ctx.fillText(title, w / 2, h * 0.105);
    // owner color dot
    ctx.fillStyle = factionColor(owner);
    ctx.beginPath();
    ctx.arc(w / 2 - ctx.measureText(title).width / 2 - h * 0.022, h * 0.105, h * 0.011, 0, Math.PI * 2);
    ctx.fill();
    if (view.fortified) {
      ctx.fillStyle = '#9ad0e8';
      ctx.font = `${Math.round(h * 0.018)}px sans-serif`;
      ctx.fillText('⛨ ' + t('city.fortified'), w / 2, h * 0.135);
    }
  }

  function drawResourceBar(w, h) {
    const res = ownerResources();
    const barH = h * 0.06;
    ctx.fillStyle = 'rgba(12,14,18,0.85)';
    ctx.fillRect(0, 0, w, barH);
    ctx.strokeStyle = '#3a3f48';
    ctx.beginPath(); ctx.moveTo(0, barH); ctx.lineTo(w, barH); ctx.stroke();
    const cellW = w / 3;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < RES_ORDER.length; i++) {
      const key = RES_ORDER[i];
      const cx = cellW * i + cellW * 0.5;
      // chip dot
      ctx.fillStyle = RES_COLOR[key];
      ctx.beginPath(); ctx.arc(cellW * i + cellW * 0.16, barH / 2, barH * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#efe6cf';
      ctx.font = `bold ${Math.round(h * 0.022)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(String(res[key]), cellW * i + cellW * 0.26, barH / 2 - h * 0.006);
      ctx.fillStyle = '#9aa0ab';
      ctx.font = `${Math.round(h * 0.014)}px sans-serif`;
      ctx.fillText(t('res.' + key), cellW * i + cellW * 0.26, barH / 2 + h * 0.013);
    }
    ctx.textAlign = 'center';
  }

  // 3x3 grid of building slots.
  function drawGrid(w, h, tnow) {
    const list = view.buildings.slice(0, 9);
    const gridTop = h * 0.16;
    const gridBottom = h * 0.66;
    const gridH = gridBottom - gridTop;
    const pad = w * 0.03;
    const cellW = (w - pad * 4) / 3;
    const cellH = (gridH - pad * 2) / 3;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const col = i % 3, rowi = (i / 3) | 0;
      const x = pad + col * (cellW + pad);
      const y = gridTop + rowi * (cellH + pad);
      drawSlot(b, x, y, cellW, cellH, tnow);
      ui.slots.push({ x, y, w: cellW, h: cellH, id: b.id });
    }
  }

  function drawSlot(b, x, y, w, h, tnow) {
    const built = (b.level | 0) > 0;
    const selected = ui.selected === b.id;
    // is this building currently in the queue?
    const inQueue = view.queue && view.queue.some((q) => q.id === b.id);
    ctx.save();
    // slot frame
    ctx.globalAlpha = built ? 1 : 0.55; // dim/locked look at level 0
    ctx.fillStyle = built ? 'rgba(34,40,50,0.92)' : 'rgba(20,22,28,0.9)';
    roundRect(x, y, w, h, Math.min(10, h * 0.12));
    ctx.fill();
    ctx.strokeStyle = selected ? '#e0a04a' : (inQueue ? '#9ad0e8' : '#3a3f48');
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.stroke();

    // icon
    const iconSz = Math.min(w * 0.5, h * 0.5);
    const ix = x + (w - iconSz) / 2;
    const iy = y + h * 0.10;
    drawBuildingIcon(b, ix, iy, iconSz);

    // name
    ctx.globalAlpha = built ? 1 : 0.7;
    ctx.fillStyle = '#e8e0c8';
    ctx.font = `bold ${Math.round(h * 0.12)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitText(localName(b), w * 0.9, Math.round(h * 0.12)), x + w / 2, y + h * 0.74);

    // level pips / label
    const lvlY = y + h * 0.90;
    if (built) {
      drawLevelPips(b, x + w / 2, lvlY, w, h);
    } else {
      ctx.fillStyle = '#8c92a0';
      ctx.font = `${Math.round(h * 0.10)}px sans-serif`;
      ctx.fillText(t('city.notbuilt'), x + w / 2, lvlY);
    }

    // queue badge (turnsLeft) on this slot
    if (inQueue) {
      const q = view.queue.find((qq) => qq.id === b.id);
      const badge = Math.min(w, h) * 0.22;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#3b6fd4';
      ctx.beginPath(); ctx.arc(x + w - badge * 0.6, y + badge * 0.6, badge * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(badge * 0.5)}px sans-serif`;
      ctx.fillText(String(q ? q.turnsLeft : ''), x + w - badge * 0.6, y + badge * 0.62);
    }
    ctx.restore();
    ctx.textAlign = 'center';
  }

  // Level shown as pips up to maxLevel, with "Ур.N" text beside for clarity.
  function drawLevelPips(b, cx, y, w, h) {
    const max = Math.max(1, b.maxLevel | 0);
    const lvl = clamp(b.level | 0, 0, max);
    const pipR = Math.min(w, h) * 0.035;
    const gap = pipR * 2.6;
    const totalW = (max - 1) * gap;
    let px = cx - totalW / 2 - w * 0.12;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#cbb88a';
    ctx.font = `${Math.round(h * 0.09)}px sans-serif`;
    ctx.fillText(t('city.level') + lvl, cx - totalW / 2 - w * 0.40, y);
    for (let i = 0; i < max; i++) {
      ctx.beginPath();
      ctx.arc(px, y, pipR, 0, Math.PI * 2);
      ctx.fillStyle = i < lvl ? '#e0a04a' : '#4a4f58';
      ctx.fill();
      px += gap;
    }
    ctx.textAlign = 'center';
  }

  // Slice buildings_sheet.png as a 3x3 grid by b.icon (0..8). Procedural box if absent.
  function drawBuildingIcon(b, x, y, sz) {
    const sheet = sheetImage(opts.assets);
    const idx = clamp(b.icon | 0, 0, 8);
    if (sheet) {
      const sw = sheet.width / 3, sh = sheet.height / 3;
      const sx = (idx % 3) * sw, sy = ((idx / 3) | 0) * sh;
      try {
        ctx.drawImage(sheet, sx, sy, sw, sh, x, y, sz, sz);
        return;
      } catch (_) { /* fall to procedural */ }
    }
    // Procedural labeled box fallback.
    ctx.save();
    ctx.fillStyle = '#39414e';
    roundRect(x, y, sz, sz, sz * 0.14);
    ctx.fill();
    ctx.strokeStyle = '#586375';
    ctx.lineWidth = Math.max(1, sz * 0.04);
    ctx.stroke();
    // a tiny "house" glyph + index-tinted roof so each building looks distinct
    const hue = (idx * 40) % 360;
    ctx.fillStyle = `hsl(${hue},45%,55%)`;
    ctx.beginPath();
    ctx.moveTo(x + sz * 0.2, y + sz * 0.5);
    ctx.lineTo(x + sz * 0.5, y + sz * 0.22);
    ctx.lineTo(x + sz * 0.8, y + sz * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#cdd4df';
    ctx.fillRect(x + sz * 0.28, y + sz * 0.5, sz * 0.44, sz * 0.28);
    // label: first letter of the localized name
    ctx.fillStyle = '#1a1d22';
    ctx.font = `bold ${Math.round(sz * 0.22)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const nm = localName(b);
    ctx.fillText((nm[0] || '?').toUpperCase(), x + sz * 0.5, y + sz * 0.64);
    ctx.restore();
  }

  function drawQueue(w, h) {
    const q = (view.queue || []);
    const top = h * 0.675;
    ctx.fillStyle = '#cbb88a';
    ctx.font = `bold ${Math.round(h * 0.018)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('city.queue') + (q.length ? '' : ' —'), w * 0.04, top);
    if (!q.length) return;
    const iconSz = h * 0.04;
    let x = w * 0.04;
    const y = top + h * 0.035;
    for (let i = 0; i < q.length && i < 6; i++) {
      const item = q[i];
      const b = view.buildings.find((bb) => bb.id === item.id) || { icon: 0, id: item.id };
      drawBuildingIcon(b, x, y, iconSz);
      ctx.fillStyle = '#9ad0e8';
      ctx.font = `bold ${Math.round(h * 0.016)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(item.turnsLeft + ' ' + t('city.turns'), x + iconSz + 4, y + iconSz / 2);
      x += iconSz + h * 0.075;
    }
  }

  // Info panel for the selected building: name/desc, current effect, NEXT cost+time, Build button.
  function drawInfoPanel(w, h) {
    const b = view.buildings.find((bb) => bb.id === ui.selected);
    if (!b) { ui.selected = null; return; }
    const px = w * 0.06, pw = w * 0.88;
    const ph = h * 0.42;
    const py = h * 0.5 - ph / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(14,17,22,0.96)';
    roundRect(px, py, pw, ph, 12);
    ctx.fill();
    ctx.strokeStyle = '#e0a04a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // close (X)
    const xb = px + pw - h * 0.05;
    const yb = py + h * 0.02;
    ctx.fillStyle = '#8c92a0';
    ctx.font = `bold ${Math.round(h * 0.026)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✕', xb + h * 0.02, yb + h * 0.02);
    ui.buttons.push({ x: xb - h * 0.01, y: yb - h * 0.01, w: h * 0.06, h: h * 0.06, action: 'close' });

    // icon + name
    const iSz = h * 0.08;
    drawBuildingIcon(b, px + w * 0.04, py + h * 0.03, iSz);
    ctx.fillStyle = '#e8d89a';
    ctx.font = `bold ${Math.round(h * 0.026)}px sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(localName(b), px + w * 0.04 + iSz + 10, py + h * 0.04);
    ctx.fillStyle = '#9aa0ab';
    ctx.font = `${Math.round(h * 0.016)}px sans-serif`;
    const lvlTxt = (b.level | 0) > 0 ? (t('city.level') + b.level) : t('city.notbuilt');
    ctx.fillText(lvlTxt + ' / ' + (b.maxLevel | 0), px + w * 0.04 + iSz + 10, py + h * 0.075);

    // description (wrapped)
    ctx.fillStyle = '#cdd4df';
    ctx.font = `${Math.round(h * 0.017)}px sans-serif`;
    const desc = localDesc(b);
    let ty = py + h * 0.135;
    ty = wrapText(desc, px + w * 0.04, ty, pw - w * 0.08, h * 0.024);

    // current effect summary
    ctx.fillStyle = '#9ad0e8';
    ctx.font = `bold ${Math.round(h * 0.016)}px sans-serif`;
    ctx.fillText(t('city.effect') + ': ' + currentEffectSummary(b), px + w * 0.04, ty + h * 0.005);
    ty += h * 0.035;

    // NEXT level cost + time, or "max level"
    if (b.next) {
      ctx.fillStyle = '#cbb88a';
      ctx.font = `${Math.round(h * 0.016)}px sans-serif`;
      ctx.fillText(t('city.cost') + ':', px + w * 0.04, ty);
      drawCostChips(b.next.cost, px + w * 0.20, ty - h * 0.006, h);
      ty += h * 0.032;
      ctx.fillStyle = '#cbb88a';
      const turns = (b.next.buildTurns | 0);
      ctx.fillText(t('city.time') + ': ' + turns + ' ' + t('city.turns'), px + w * 0.04, ty);
      ty += h * 0.04;

      // Build/Upgrade button (label depends on whether anything is built yet).
      const label = (b.level | 0) > 0 ? t('city.upgrade') : t('city.build');
      const bw = pw - w * 0.08, bh = h * 0.06;
      const bx = px + w * 0.04, by = py + ph - bh - h * 0.02;
      // affordability hint (purely cosmetic; canBuild is still the gate)
      const affordable = canAfford(b.next.cost) && !inQueueFor(b.id);
      drawButton(label, bx, by, bw, bh, { action: 'build', id: b.id }, affordable);
    } else {
      ctx.fillStyle = '#7be08a';
      ctx.font = `bold ${Math.round(h * 0.02)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(t('city.maxlevel'), px + pw / 2, py + ph - h * 0.05);
      ctx.textAlign = 'left';
    }
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
  }

  function drawCostChips(cost, x, y, h) {
    cost = cost || {};
    let cx = x;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let any = false;
    for (const key of RES_ORDER) {
      const v = cost[key];
      if (!v) continue;
      any = true;
      ctx.fillStyle = RES_COLOR[key];
      ctx.beginPath(); ctx.arc(cx + h * 0.012, y + h * 0.012, h * 0.012, 0, Math.PI * 2); ctx.fill();
      const have = ownerResources()[key];
      ctx.fillStyle = have >= v ? '#e8e0c8' : '#ff8a6b';
      ctx.font = `bold ${Math.round(h * 0.016)}px sans-serif`;
      ctx.fillText(String(v), cx + h * 0.03, y + h * 0.012);
      cx += h * 0.03 + ctx.measureText(String(v)).width + h * 0.025;
    }
    if (!any) {
      ctx.fillStyle = '#7be08a';
      ctx.font = `bold ${Math.round(h * 0.016)}px sans-serif`;
      ctx.fillText(t('city.free'), cx, y + h * 0.012);
    }
  }

  function drawLeaveButton(w, h) {
    const bw = w * 0.5, bh = h * 0.06;
    const bx = w / 2 - bw / 2, by = h * 0.92;
    drawButton(t('city.leave'), bx, by, bw, bh, { action: 'leave' }, true, true);
  }

  function drawNoCity(w, h) {
    const pw = w * 0.8, ph = h * 0.28;
    const px = w / 2 - pw / 2, py = h / 2 - ph / 2;
    ctx.fillStyle = 'rgba(14,17,22,0.96)';
    roundRect(px, py, pw, ph, 12);
    ctx.fill();
    ctx.strokeStyle = '#586375';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#e8d89a';
    ctx.font = `bold ${Math.round(h * 0.026)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t('city.empty'), w / 2, py + ph * 0.35);
    const bw = pw * 0.7, bh = h * 0.06;
    drawButton(t('city.leave'), w / 2 - bw / 2, py + ph * 0.62, bw, bh, { action: 'leave' }, true, true);
  }

  function drawBlockToast(w, h) {
    const msg = t(ui.blockMsg);
    ctx.save();
    ctx.font = `bold ${Math.round(h * 0.02)}px sans-serif`;
    const tw = ctx.measureText(msg).width + w * 0.08;
    const bw = Math.min(w * 0.9, tw);
    const bx = w / 2 - bw / 2, by = h * 0.83, bh = h * 0.05;
    ctx.fillStyle = 'rgba(120,30,30,0.92)';
    roundRect(bx, by, bw, bh, 10);
    ctx.fill();
    ctx.fillStyle = '#ffe0d8';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(msg, w / 2, by + bh / 2);
    ctx.restore();
  }

  // ---- shared button drawer ------------------------------------------------
  function drawButton(label, x, y, w, h, action, enabled, primary) {
    ctx.save();
    ctx.globalAlpha = enabled ? 1 : 0.45;
    ctx.fillStyle = primary ? '#3b6fd4' : '#2c2620';
    roundRect(x, y, w, h, Math.min(8, h * 0.25));
    ctx.fill();
    ctx.strokeStyle = enabled ? '#e0a04a' : '#4a4234';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#efe6cf';
    ctx.font = `bold ${Math.round(h * 0.36)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
    ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // Always hit-testable (canBuild remains the real gate; "disabled" is cosmetic
    // so a tap still surfaces the blocked reason). Leave is always active.
    ui.buttons.push({ x, y, w, h, action: action.action, id: action.id });
  }

  // ---- effect / text helpers ----------------------------------------------
  function currentEffectSummary(b) {
    // Summarize the CURRENT level's effect if built, else the NEXT level's.
    const lvl = b.level | 0;
    const eff = (lvl > 0 && b.current && b.current.effect) ? b.current.effect
      : (b.next ? b.next.effect : null);
    return effectText(eff);
  }
  function effectText(eff) {
    if (!eff) return '—';
    if (eff.type === 'produceRes') {
      const parts = [];
      const r = eff.res || {};
      for (const key of RES_ORDER) if (r[key]) parts.push('+' + r[key] + ' ' + t('res.' + key) + t('city.perturn'));
      return parts.join(', ') || t('city.eff.produceRes');
    }
    if (eff.type === 'produceUnit') {
      return t('city.eff.unitsEvery', {
        count: eff.count || 1,
        unit: t('unit.' + (eff.unitType || 'inf')),
        n: eff.perTurns || 1,
      });
    }
    if (eff.type === 'defense') {
      const pct = Math.round((eff.defBonus || 0) * 100);
      return t('city.eff.defBonus', { pct });
    }
    if (eff.type === 'heal') {
      const pct = Math.round((eff.pct || 0) * 100);
      return t('city.eff.healPct', { pct });
    }
    return '—';
  }

  function canAfford(cost) {
    const res = ownerResources();
    cost = cost || {};
    for (const key of RES_ORDER) if ((cost[key] || 0) > res[key]) return false;
    return true;
  }
  function inQueueFor(id) { return !!(view.queue && view.queue.some((q) => q.id === id)); }

  function localName(b) {
    const k = b.nameKey || ('bld.' + b.id);
    const s = t(k);
    if (s && s !== k) return s;
    return b.id ? (b.id.charAt(0).toUpperCase() + b.id.slice(1)) : '?';
  }
  function localDesc(b) {
    const k = b.descKey || ('bld.' + b.id + '.d');
    const s = t(k);
    if (s && s !== k) return s;
    return '';
  }

  // ---- canvas primitives ---------------------------------------------------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fitText(s, maxW, fontPx) {
    if (!s) return '';
    ctx.font = `bold ${fontPx}px sans-serif`;
    if (ctx.measureText(s).width <= maxW) return s;
    let str = s;
    while (str.length > 1 && ctx.measureText(str + '…').width > maxW) str = str.slice(0, -1);
    return str + '…';
  }
  function wrapText(text, x, y, maxW, lineH) {
    if (!text) return y;
    const words = String(text).split(/\s+/);
    let line = '';
    let cy = y;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, cy);
        line = words[i];
        cy += lineH;
      } else {
        line = test;
      }
    }
    if (line) { ctx.fillText(line, x, cy); cy += lineH; }
    return cy;
  }

  // ---- lifecycle -----------------------------------------------------------
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
    if (ui.cleanedUp) return;
    ui.cleanedUp = true;
    if (ui.raf) cancelRaf(ui.raf);
    removeListeners();
    try { audio.stopMusic(); } catch (_) {}
    // Clear the canvas so the map loop resumes on a clean surface.
    try {
      ctx.save();
      if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width || cw(), canvas.height || ch());
      ctx.restore();
    } catch (_) { /* ignore */ }
  }

  // ---- start ---------------------------------------------------------------
  try {
    audio.startMusic();
    addListeners();
    ui.t0 = now();
    // Draw one frame synchronously so slot/button hit-rects exist immediately
    // (before the first raf tick), then start the animation loop.
    try { draw(ui.t0); } catch (_) {}
    ui.raf = raf(frame);
  } catch (_) {
    cleanup();
    return Promise.resolve();
  }

  return donePromise;
}

export default { openCity };
