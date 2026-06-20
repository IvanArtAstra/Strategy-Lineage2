// src/campaign_ui.js — owner: feat/campaign (interfaces-v4 §4)
// The CAMPAIGN screen: a self-contained canvas-takeover module the map client
// opens from the start screen. It lists the campaign scenarios (locked /
// unlocked / completed) with name, description, objective and reward, lets the
// player pick an UNLOCKED one, and RESOLVES with the createGame config the client
// feeds into engine.createGame. A back/close resolves a cancel.
//
// Mirrors city_ui.js / battle_ui.js: owns the canvas, runs its own loop, handles
// touch + mouse + keyboard, cleans up all listeners and clears the canvas before
// resolving its Promise. Procedural parchment fallback if assets are absent.
//
// Entry point (interfaces-v4 §4):
//   export async function openCampaign(opts) ->
//     Promise<{action:'start', config} | {action:'cancel'}>
//   opts = { canvas, ctx, campaign, t, assets, lang, sound, requestRedraw }
//     - campaign = the campaign logic api
//         { campaignList, startScenario }  (passed by main.js from ./campaign.js)
//
// Resilient degradation: if the campaign api is missing/empty, show a styled
// "no campaign" panel with a Back button and never throw.

// ---------------------------------------------------------------------------
// Localization: prefer opts.t, fall back to a built-in RU/EN table so the screen
// is fully localized even if t() is absent. No bare string literals reach the
// canvas except through this layer. Scenario name/desc/objective keys come from
// data/strings (camp.*) via opts.t; chrome keys live here too as a safety net.
// ---------------------------------------------------------------------------
const LOCAL = {
  ru: {
    'camp.title': 'Поход', 'camp.back': 'Назад', 'camp.start': 'В бой',
    'camp.locked': 'Закрыто', 'camp.completed': 'Пройдено', 'camp.empty': 'Поход недоступен',
    'camp.objective': 'Задача', 'camp.reward': 'Награда', 'camp.select': 'Выберите сценарий',
    'camp.lockedHint': 'Завершите предыдущий сценарий',
    'camp.obj.holdCrowns': 'Удержать {n} коронных замка',
    'camp.obj.captureProvince': 'Захватить: {prov}',
    'camp.obj.surviveTurns': 'Продержаться {n} ходов',
    'camp.obj.eliminate': 'Уничтожить: {fac}',
    'res.adena': 'Адена', 'res.wood': 'Древесина', 'res.crystal': 'Кристаллы',
    // scenario name/desc fallbacks (canonical text lives in strings.js)
    'camp.gludio_defense.name': 'Оборона Глудио',
    'camp.gludio_defense.desc': 'Первая волна Нежити обрушилась на юго-западные земли. Удержите врата Глудио.',
    'camp.aden_reclaim.name': 'Возвращение Адена',
    'camp.aden_reclaim.desc': 'Королевский престол Адена пустует. Верните корону Королевству.',
    'camp.orc_onslaught.name': 'Натиск Орков',
    'camp.orc_onslaught.desc': 'Кланы Шуттгарта спускаются с гор. Выстойте против орочьего вала.',
    'camp.shilen_dark.name': 'Тьма Шилен',
    'camp.shilen_dark.desc': 'Легион Нежити укрылся на болотах Руны. Сотрите его с лица Адена.',
    'camp.thrones_of_aden.name': 'Троны Адена',
    'camp.thrones_of_aden.desc': 'Три короны разделены войной. Объедините все коронные замки под одним знаменем.',
    'fac.human': 'Люди', 'fac.elf': 'Эльфы', 'fac.orc': 'Орки',
    'fac.darkelf': 'Тёмные эльфы', 'fac.dwarf': 'Гномы', 'fac.kamael': 'Камаэль', 'fac.shilen': 'Нежить',
    'prov.aden': 'Аден', 'prov.gludio': 'Глудио', 'prov.giran': 'Гиран',
  },
  en: {
    'camp.title': 'Campaign', 'camp.back': 'Back', 'camp.start': 'To battle',
    'camp.locked': 'Locked', 'camp.completed': 'Completed', 'camp.empty': 'Campaign unavailable',
    'camp.objective': 'Objective', 'camp.reward': 'Reward', 'camp.select': 'Select a scenario',
    'camp.lockedHint': 'Finish the previous scenario',
    'camp.obj.holdCrowns': 'Hold {n} crown castles',
    'camp.obj.captureProvince': 'Capture: {prov}',
    'camp.obj.surviveTurns': 'Survive {n} turns',
    'camp.obj.eliminate': 'Eliminate: {fac}',
    'res.adena': 'Adena', 'res.wood': 'Wood', 'res.crystal': 'Crystal',
    'camp.gludio_defense.name': 'Defense of Gludio',
    'camp.gludio_defense.desc': 'The first undead tide breaks on the south-west lowlands. Hold the gate of Gludio.',
    'camp.aden_reclaim.name': 'Reclaiming Aden',
    'camp.aden_reclaim.desc': 'The royal seat of Aden stands empty. Return the crown to the Kingdom.',
    'camp.orc_onslaught.name': 'Orc Onslaught',
    'camp.orc_onslaught.desc': 'The clans of Schuttgart descend from the highlands. Stand against the orc wave.',
    'camp.shilen_dark.name': 'Darkness of Shilen',
    'camp.shilen_dark.desc': 'The Undead Legion hides in the swamps of Rune. Wipe it from the face of Aden.',
    'camp.thrones_of_aden.name': 'Thrones of Aden',
    'camp.thrones_of_aden.desc': 'Three crowns are divided by war. Unite every crown castle under one banner.',
    'fac.human': 'Humans', 'fac.elf': 'Elves', 'fac.orc': 'Orcs',
    'fac.darkelf': 'Dark Elves', 'fac.dwarf': 'Dwarves', 'fac.kamael': 'Kamael', 'fac.shilen': 'Undead',
    'prov.aden': 'Aden', 'prov.gludio': 'Gludio', 'prov.giran': 'Giran',
  },
};

function localLabel(key, lang, params) {
  const tbl = LOCAL[lang] || LOCAL.en;
  let s = tbl[key];
  if (s == null) s = LOCAL.en[key];
  if (s == null) s = LOCAL.ru[key];
  if (s == null) s = key;
  if (params) for (const k in params) s = String(s).replace('{' + k + '}', params[k]);
  return s;
}
function makeT(opts) {
  const t = opts && typeof opts.t === 'function' ? opts.t : null;
  const lang = (opts && opts.lang) || 'ru';
  return (key, params) => {
    if (t) {
      try { const s = t(key, params); if (s != null && s !== key) return s; } catch (_) {}
    }
    return localLabel(key, lang, params);
  };
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// Audio (mirror city_ui): opts.sound may be a function or { play, on }. Best-effort.
function makeAudio(opts) {
  const s = opts && opts.sound;
  const callKey = (key) => {
    try {
      if (typeof s === 'function') s(key);
      else if (s && typeof s.play === 'function') s.play(key);
    } catch (_) {}
  };
  return { sfx(key) { callKey(key); } };
}

function isImage(a) {
  if (!a) return false;
  return (typeof HTMLImageElement !== 'undefined' && a instanceof HTMLImageElement) ||
         (typeof HTMLCanvasElement !== 'undefined' && a instanceof HTMLCanvasElement) ||
         (typeof ImageBitmap !== 'undefined' && a instanceof ImageBitmap) ||
         (typeof a.width === 'number' && typeof a.height === 'number' && a.width > 0);
}
function bgImage(assets) {
  if (!assets) return null;
  for (const k of ['bg_parchment', 'bg_parchment.png', 'bgParchment', 'bg_city']) {
    if (isImage(assets[k])) return assets[k];
  }
  return null;
}

// Objective -> a human label, localized. Mirrors campaign data objective shape.
function objectiveLabel(t, obj) {
  if (!obj || !obj.type) return '';
  switch (obj.type) {
    case 'holdCrowns':
      return t('camp.obj.holdCrowns', { n: obj.target != null ? obj.target : 3 });
    case 'captureProvince':
      return t('camp.obj.captureProvince', { prov: t('prov.' + obj.target) });
    case 'surviveTurns':
      return t('camp.obj.surviveTurns', { n: obj.turns != null ? obj.turns : 0 });
    case 'eliminate':
      return t('camp.obj.eliminate', { fac: t('fac.' + obj.target) });
    default:
      return '';
  }
}
function rewardLabel(t, reward) {
  if (!reward) return '';
  const parts = [];
  if (reward.adena) parts.push(reward.adena + ' ' + t('res.adena'));
  if (reward.wood) parts.push(reward.wood + ' ' + t('res.wood'));
  if (reward.crystal) parts.push(reward.crystal + ' ' + t('res.crystal'));
  return parts.join('  ·  ');
}

// ============================================================================
// openCampaign — the single public entry point.
// ============================================================================
export async function openCampaign(opts) {
  opts = opts || {};
  const t = makeT(opts);
  const audio = makeAudio(opts);

  const canvas = opts.canvas;
  const ctx = opts.ctx || (canvas && canvas.getContext && canvas.getContext('2d'));
  const api = opts.campaign || null;

  let resolveDone;
  const donePromise = new Promise((res) => { resolveDone = res; });

  // Cannot render -> resolve a cancel immediately (never hang the caller).
  if (!canvas || !ctx) return Promise.resolve({ action: 'cancel' });

  // ---- read the scenario list (resilient) ---------------------------------
  function readList() {
    if (!api || typeof api.campaignList !== 'function') return [];
    try {
      const l = api.campaignList(opts.state);
      return Array.isArray(l) ? l : [];
    } catch (_) { return []; }
  }
  const list = readList();

  // ---- screen state -------------------------------------------------------
  const ui = {
    selected: null,    // selected scenario id
    rows: [],          // hit-test rects for scenario rows
    buttons: [],       // hit-test rects for buttons
    scroll: 0,
    cleanedUp: false,
    raf: 0,
  };
  // Default-select the first unlocked, not-completed scenario (else first unlocked).
  {
    const firstUnlocked = list.find((s) => !s.locked && !s.completed) || list.find((s) => !s.locked);
    ui.selected = firstUnlocked ? firstUnlocked.id : null;
  }

  function cw() { return canvas.clientWidth || canvas.width || 360; }
  function ch() { return canvas.clientHeight || canvas.height || 640; }

  // ---- input --------------------------------------------------------------
  function localPoint(ev) {
    const rect = canvas.getBoundingClientRect
      ? canvas.getBoundingClientRect()
      : { left: 0, top: 0, width: cw(), height: ch() };
    const src = (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]) || ev;
    const sx = rect.width ? cw() / rect.width : 1;
    const sy = rect.height ? ch() / rect.height : 1;
    return { x: ((src.clientX || 0) - rect.left) * sx, y: ((src.clientY || 0) - rect.top) * sy };
  }
  function hitRect(arr, p) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const b = arr[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
    }
    return null;
  }
  function onPointer(ev) {
    if (ui.cleanedUp) return;
    try { ev.preventDefault(); } catch (_) {}
    const p = localPoint(ev);
    const b = hitRect(ui.buttons, p);
    if (b) { handleButton(b); return; }
    const r = hitRect(ui.rows, p);
    if (r) { selectRow(r.id); }
  }
  function onKey(ev) {
    if (ui.cleanedUp) return;
    const k = ev.key;
    if (k === 'Escape') { cancel(); }
    else if (k === 'Enter' || k === ' ') { startSelected(); }
    else if (k === 'ArrowDown' || k === 'ArrowUp') {
      const open = list.filter((s) => !s.locked);
      if (!open.length) return;
      let idx = open.findIndex((s) => s.id === ui.selected);
      if (idx < 0) idx = 0;
      idx = clamp(idx + (k === 'ArrowDown' ? 1 : -1), 0, open.length - 1);
      ui.selected = open[idx].id;
      audio.sfx('sfx_select');
      redraw();
    }
  }

  // ---- actions ------------------------------------------------------------
  function selectRow(id) {
    const row = list.find((s) => s.id === id);
    if (!row || row.locked) { audio.sfx('sfx_select'); redraw(); return; }
    ui.selected = id;
    audio.sfx('sfx_select');
    redraw();
  }
  function handleButton(b) {
    if (ui.cleanedUp) return;
    if (b.action === 'back') cancel();
    else if (b.action === 'start') startSelected();
  }
  function startSelected() {
    const row = list.find((s) => s.id === ui.selected);
    if (!row || row.locked) { audio.sfx('sfx_select'); redraw(); return; }
    if (!api || typeof api.startScenario !== 'function') { cancel(); return; }
    let config = null;
    try { config = api.startScenario(row.id); } catch (_) { config = null; }
    if (!config) { cancel(); return; }
    audio.sfx('sfx_select');
    cleanup();
    resolveDone({ action: 'start', config });
  }
  function cancel() {
    cleanup();
    resolveDone({ action: 'cancel' });
  }

  // ---- timing / raf -------------------------------------------------------
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function raf(fn) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
    return setTimeout(() => fn(now()), 16);
  }
  function cancelRaf(id) {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
    else clearTimeout(id);
  }
  function redraw() { try { draw(now()); } catch (_) {} }
  function frame() {
    if (ui.cleanedUp) return;
    try { draw(now()); } catch (_) {}
    ui.raf = raf(frame);
  }

  // ========================================================================
  // DRAWING — parchment look (procedural fallback if no bg asset).
  // ========================================================================
  const INK = '#2a1f12';
  const GOLD = '#b8932f';
  const PARCH_A = '#efe2c2';
  const PARCH_B = '#d8c79a';

  function draw(tnow) {
    const w = cw(), h = ch();
    ui.rows = [];
    ui.buttons = [];

    ctx.save();
    drawBackground(w, h);
    drawTitle(w, h);

    if (!list.length) {
      drawEmpty(w, h);
      drawBackButton(w, h);
      ctx.restore();
      return;
    }

    drawList(w, h, tnow);
    drawFooter(w, h);
    ctx.restore();
  }

  function drawBackground(w, h) {
    const img = bgImage(opts.assets);
    if (img) {
      try { ctx.drawImage(img, 0, 0, w, h); } catch (_) { fillParchment(w, h); }
      // darken a touch so text reads
      ctx.fillStyle = 'rgba(20,14,6,0.10)';
      ctx.fillRect(0, 0, w, h);
    } else {
      fillParchment(w, h);
    }
  }
  function fillParchment(w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, PARCH_A);
    g.addColorStop(1, PARCH_B);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // subtle vignette
    ctx.strokeStyle = 'rgba(80,55,20,0.35)';
    ctx.lineWidth = Math.max(3, w * 0.012);
    ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
  }
  function drawTitle(w, h) {
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = clamp(w * 0.07, 20, 40);
    ctx.font = '700 ' + fs + 'px Georgia, "Times New Roman", serif';
    ctx.fillText(t('camp.title'), w / 2, h * 0.08);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.2, h * 0.13);
    ctx.lineTo(w * 0.8, h * 0.13);
    ctx.stroke();
  }
  function drawEmpty(w, h) {
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 ' + clamp(w * 0.045, 14, 22) + 'px Georgia, serif';
    ctx.fillText(t('camp.empty'), w / 2, h * 0.45);
  }

  function drawList(w, h, tnow) {
    const top = h * 0.17;
    const bottom = h * 0.86;
    const pad = w * 0.05;
    const n = list.length;
    const gap = h * 0.018;
    const rowH = clamp((bottom - top - gap * (n - 1)) / n, h * 0.10, h * 0.18);

    let y = top;
    for (const s of list) {
      const x = pad;
      const rw = w - pad * 2;
      drawRow(s, x, y, rw, rowH, tnow);
      ui.rows.push({ id: s.id, x, y, w: rw, h: rowH });
      y += rowH + gap;
    }
  }

  function drawRow(s, x, y, w, h, tnow) {
    const selected = s.id === ui.selected;
    const locked = s.locked;
    const completed = s.completed;

    // card background
    ctx.fillStyle = locked ? 'rgba(60,50,35,0.18)' : (selected ? 'rgba(184,147,47,0.28)' : 'rgba(255,250,235,0.55)');
    roundRect(x, y, w, h, Math.min(12, h * 0.18));
    ctx.fill();
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.strokeStyle = selected ? GOLD : 'rgba(80,55,20,0.5)';
    ctx.stroke();

    const ipad = w * 0.035;
    const titleY = y + h * 0.28;
    const descY = y + h * 0.55;
    const metaY = y + h * 0.82;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // title
    ctx.fillStyle = locked ? 'rgba(42,31,18,0.45)' : INK;
    ctx.font = '700 ' + clamp(h * 0.24, 13, 22) + 'px Georgia, serif';
    const title = t(s.nameKey);
    ctx.fillText(clip(title, w - ipad * 2 - h), x + ipad, titleY);

    // status badge (right)
    ctx.textAlign = 'right';
    ctx.font = '600 ' + clamp(h * 0.18, 10, 15) + 'px Georgia, serif';
    if (completed) { ctx.fillStyle = '#3a7d3a'; ctx.fillText('✓ ' + t('camp.completed'), x + w - ipad, titleY); }
    else if (locked) { ctx.fillStyle = '#7a6a55'; ctx.fillText('🔒 ' + t('camp.locked'), x + w - ipad, titleY); }

    // description
    ctx.textAlign = 'left';
    ctx.fillStyle = locked ? 'rgba(42,31,18,0.40)' : 'rgba(42,31,18,0.82)';
    ctx.font = '400 ' + clamp(h * 0.16, 10, 15) + 'px Georgia, serif';
    ctx.fillText(clip(t(s.descKey), w - ipad * 2), x + ipad, descY);

    // objective + reward meta line
    ctx.font = '600 ' + clamp(h * 0.15, 9, 13) + 'px Georgia, serif';
    ctx.fillStyle = locked ? 'rgba(42,31,18,0.35)' : '#5a4520';
    const objTxt = t('camp.objective') + ': ' + objectiveLabel(t, s.objective);
    ctx.fillText(clip(objTxt, (w - ipad * 2) * 0.62), x + ipad, metaY);
    ctx.textAlign = 'right';
    ctx.fillStyle = locked ? 'rgba(42,31,18,0.35)' : '#7a5a1a';
    ctx.fillText(clip(rewardLabel(t, s.reward), (w - ipad * 2) * 0.55), x + w - ipad, metaY);
  }

  function drawFooter(w, h) {
    const sel = list.find((s) => s.id === ui.selected);
    const canStart = sel && !sel.locked;
    // Start button (only enabled when an unlocked scenario is selected)
    const bw = w * 0.42, bh = h * 0.07;
    const sx = w * 0.54, sy = h * 0.90;
    drawButton('start', canStart ? t('camp.start') : t('camp.select'), sx, sy, bw, bh, canStart, true);
    drawBackButton(w, h);
  }
  function drawBackButton(w, h) {
    const bw = w * 0.42, bh = h * 0.07;
    drawButton('back', t('camp.back'), w * 0.04, h * 0.90, bw, bh, true, false);
  }
  function drawButton(action, label, x, y, w, h, enabled, primary) {
    ctx.fillStyle = !enabled ? 'rgba(120,105,80,0.30)' : (primary ? GOLD : 'rgba(90,69,32,0.22)');
    roundRect(x, y, w, h, Math.min(10, h * 0.3));
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = enabled ? '#5a4520' : 'rgba(90,69,32,0.4)';
    ctx.stroke();
    ctx.fillStyle = !enabled ? 'rgba(42,31,18,0.45)' : (primary ? '#2a1f0a' : INK);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + clamp(h * 0.42, 12, 20) + 'px Georgia, serif';
    ctx.fillText(label, x + w / 2, y + h / 2);
    if (enabled) ui.buttons.push({ action, x, y, w, h });
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // clip text to a pixel width (ellipsis)
  function clip(text, maxW) {
    text = String(text == null ? '' : text);
    if (ctx.measureText(text).width <= maxW) return text;
    const ell = '…';
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(text.slice(0, mid) + ell).width <= maxW) lo = mid;
      else hi = mid - 1;
    }
    return text.slice(0, lo) + ell;
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
    // Clear the canvas so the map loop resumes on a clean surface.
    try {
      ctx.save();
      if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width || cw(), canvas.height || ch());
      ctx.restore();
    } catch (_) {}
  }

  // ---- start --------------------------------------------------------------
  try {
    addListeners();
    draw(now());           // one synchronous frame so hit-rects exist immediately
    ui.raf = raf(frame);
  } catch (_) {
    cleanup();
    return Promise.resolve({ action: 'cancel' });
  }

  return donePromise;
}
