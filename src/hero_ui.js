// src/hero_ui.js — feat/heroes (hero client)
// HERO-COMMANDERS screen. A self-contained module the map client opens; it takes
// over the shared canvas, runs its own animation+input loop, lets the player
// inspect the roster, recruit heroes, equip/unequip items, and assign a hero to
// a province, and RESOLVES when the player leaves. Mirrors city_ui.js's
// canvas-takeover + listener-cleanup pattern. Pure browser+ESM: it mutates game
// state ONLY through the hero engine api (opts.heroApi). No imports from
// engine/ui/render/data, so it is resilient to their absence.
//
// Entry point (interfaces-v4 §3):
//   export async function openHeroes(opts) -> Promise<void>
//   opts = { canvas, ctx, state, heroApi, t, assets, lang, sound,
//            requestRedraw, onChange }
//     heroApi = { recruitHero, assignHero, equipItem, grantItem, unequipItem?,
//                 heroAt, heroBattleBonus, gainHeroXp, heroesRoster,
//                 HEROES?, ITEMS? }  (the hero engine api; data lists optional)
//
// Resilient degradation: if heroApi is missing, show a styled "no heroes" panel
// with a Leave button and never throw. Missing assets (heroes_sheet, items_sheet)
// fall back to procedural art.

// ---------------------------------------------------------------------------
// Localization: prefer opts.t, fall back to a tiny built-in RU/EN table so the
// screen is fully localized even if t() is absent.
// ---------------------------------------------------------------------------
const LOCAL = {
  ru: {
    'hero.title': 'Герои', 'hero.leave': 'Назад', 'hero.recruit': 'Нанять',
    'hero.recruited': 'Нанят', 'hero.assign': 'Назначить', 'hero.assigned': 'Провинция',
    'hero.unassigned': 'Не назначен', 'hero.level': 'Ур.', 'hero.xp': 'Опыт',
    'hero.max': 'Макс', 'hero.atk': 'Атака', 'hero.def': 'Защита', 'hero.skills': 'Навыки',
    'hero.inventory': 'Инвентарь', 'hero.equipped': 'Снаряжение', 'hero.equip': 'Надеть',
    'hero.unequip': 'Снять', 'hero.empty': 'Герои недоступны', 'hero.cost': 'Цена',
    'hero.roster': 'Командиры', 'hero.detail': 'Командир', 'hero.none': 'Нет героев',
    'hero.slot.weapon': 'Оружие', 'hero.slot.armor': 'Броня', 'hero.slot.trinket': 'Амулет',
    'hero.bonus': 'Бонус армии', 'hero.pickprov': 'Выберите провинцию', 'hero.close': 'Закрыть',
    'hero.cant.adena': 'Недостаточно адены', 'hero.cant.faction': 'Не та фракция',
    'hero.cant.owned': 'Провинция не ваша', 'hero.invFull': 'Инвентарь пуст',
    'res.adena': 'Адена',
  },
  en: {
    'hero.title': 'Heroes', 'hero.leave': 'Back', 'hero.recruit': 'Recruit',
    'hero.recruited': 'Recruited', 'hero.assign': 'Assign', 'hero.assigned': 'Province',
    'hero.unassigned': 'Unassigned', 'hero.level': 'Lv.', 'hero.xp': 'XP',
    'hero.max': 'Max', 'hero.atk': 'Atk', 'hero.def': 'Def', 'hero.skills': 'Skills',
    'hero.inventory': 'Inventory', 'hero.equipped': 'Equipped', 'hero.equip': 'Equip',
    'hero.unequip': 'Unequip', 'hero.empty': 'Heroes unavailable', 'hero.cost': 'Cost',
    'hero.roster': 'Commanders', 'hero.detail': 'Commander', 'hero.none': 'No heroes',
    'hero.slot.weapon': 'Weapon', 'hero.slot.armor': 'Armor', 'hero.slot.trinket': 'Trinket',
    'hero.bonus': 'Army bonus', 'hero.pickprov': 'Choose a province', 'hero.close': 'Close',
    'hero.cant.adena': 'Not enough adena', 'hero.cant.faction': 'Wrong faction',
    'hero.cant.owned': 'Province not yours', 'hero.invFull': 'Inventory empty',
    'res.adena': 'Adena',
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
// Audio (callable sound(key) or {play,on} or absent). All wrapped in try/catch.
// ---------------------------------------------------------------------------
function makeAudio(opts) {
  const s = opts && opts.sound;
  const callKey = (key) => {
    try {
      if (typeof s === 'function') s(key);
      else if (s && typeof s.play === 'function') s.play(key);
    } catch (_) { /* ignore */ }
  };
  return { sfx(key) { callKey(key); } };
}

// Faction tint table (kept local — no import from data/factions).
const FACTION_COLOR = {
  human: '#3b6fd4', elf: '#2fa37a', orc: '#b5532a', shilen: '#7d3fb0',
  darkelf: '#8a4fae', dwarf: '#caa23c', kamael: '#5a8fb0', neutral: '#9aa4b2',
};
function factionColor(id) { return FACTION_COLOR[id] || '#9aa4b2'; }

const SLOT_ORDER = ['weapon', 'armor', 'trinket'];

function isImage(a) {
  if (!a) return false;
  return (typeof HTMLImageElement !== 'undefined' && a instanceof HTMLImageElement) ||
         (typeof HTMLCanvasElement !== 'undefined' && a instanceof HTMLCanvasElement) ||
         (typeof ImageBitmap !== 'undefined' && a instanceof ImageBitmap) ||
         (typeof a.width === 'number' && typeof a.height === 'number' && a.width > 0);
}
function findImage(assets, cands) {
  if (!assets) return null;
  for (const k of cands) { if (isImage(assets[k])) return assets[k]; }
  return null;
}
function heroesSheet(assets) { return findImage(assets, ['heroes_sheet', 'heroes_sheet.png', 'heroesSheet']); }
function itemsSheet(assets) { return findImage(assets, ['items_sheet', 'items_sheet.png', 'itemsSheet']); }

// ============================================================================
// openHeroes — the single public entry point.
// ============================================================================
export async function openHeroes(opts) {
  opts = opts || {};
  const t = makeT(opts);
  const audio = makeAudio(opts);
  const lang = opts.lang || 'ru';

  const canvas = opts.canvas;
  const ctx = opts.ctx || (canvas && canvas.getContext && canvas.getContext('2d'));
  const api = opts.heroApi || opts.engine || null;

  let resolveDone;
  const donePromise = new Promise((res) => { resolveDone = res; });
  if (!canvas || !ctx) return Promise.resolve();

  // ---- static data lists (from the api if it forwards them, else best-effort) -
  // HEROES/ITEMS are used only to enumerate recruitable heroes + item metadata.
  const HEROES = (api && (api.HEROES || api.heroes)) || [];
  const ITEMS_BY_ID = buildItemsById(api);

  // ---- screen state --------------------------------------------------------
  const ui = {
    view: 'roster',     // 'roster' | 'detail'
    selectedHero: null, // hero id for detail view
    picking: false,     // assign-province picker overlay
    buttons: [],
    cards: [],
    blockMsg: null,
    blockUntil: 0,
    cleanedUp: false,
    raf: 0,
    scroll: 0,
  };

  function cw() { return canvas.clientWidth || canvas.width || 360; }
  function ch() { return canvas.clientHeight || canvas.height || 640; }
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  // ---- data reads (resilient) ---------------------------------------------
  function roster() {
    if (!api || typeof api.heroesRoster !== 'function') return [];
    try { return api.heroesRoster(opts.state) || []; } catch (_) { return []; }
  }
  function rosterById(id) { return roster().find((h) => h.id === id) || null; }
  function isRecruited(id) { return !!rosterById(id); }
  function inventory() {
    const hs = opts.state && opts.state.heroes;
    return (hs && hs.inventory) ? hs.inventory : {};
  }
  function playerFaction() {
    return (opts.state && opts.state.playerFaction) || null;
  }
  function playerAdena() {
    const pf = playerFaction();
    const f = pf && opts.state && opts.state.factions && opts.state.factions[pf];
    return f && typeof f.adena === 'number' ? f.adena : 0;
  }
  // Provinces owned by the player (for the assign picker + recruit gating).
  function ownedProvinces() {
    const out = [];
    const st = opts.state;
    const pf = playerFaction();
    if (!st || !st.provinces || !pf) return out;
    for (const id in st.provinces) {
      if (st.provinces[id] && st.provinces[id].owner === pf) out.push(id);
    }
    return out;
  }
  // The hero definitions a recruitable list should show: those whose faction is
  // the player's (so the roster screen is faction-relevant), else all.
  function recruitableHeroes() {
    const pf = playerFaction();
    const list = Array.isArray(HEROES) ? HEROES : [];
    if (!pf) return list;
    const mine = list.filter((h) => h.faction === pf);
    return mine.length ? mine : list;
  }

  // ---- input ---------------------------------------------------------------
  function localPoint(ev) {
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: cw(), height: ch() };
    const src = (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]) || ev;
    const sx = rect.width ? cw() / rect.width : 1;
    const sy = rect.height ? ch() / rect.height : 1;
    return { x: ((src.clientX || 0) - rect.left) * sx, y: ((src.clientY || 0) - rect.top) * sy };
  }
  function hit(list, p) {
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
    }
    return null;
  }
  function onPointer(ev) {
    if (ui.cleanedUp) return;
    try { ev.preventDefault(); } catch (_) {}
    const p = localPoint(ev);
    const b = hit(ui.buttons, p);
    if (b) { handleButton(b); return; }
    const c = hit(ui.cards, p);
    if (c) { handleCard(c); }
  }
  function onKey(ev) {
    if (ui.cleanedUp) return;
    if (ev.key === 'Escape') {
      if (ui.picking) { ui.picking = false; redraw(); return; }
      if (ui.view === 'detail') { ui.view = 'roster'; ui.selectedHero = null; redraw(); return; }
      leave();
    }
  }

  // ---- actions -------------------------------------------------------------
  function flashBlock(key) { ui.blockMsg = key; ui.blockUntil = now() + 2000; }
  function changed() {
    try { if (typeof opts.onChange === 'function') opts.onChange(); } catch (_) {}
    try { if (typeof opts.requestRedraw === 'function') opts.requestRedraw(); } catch (_) {}
  }

  function doRecruit(heroId) {
    const def = (Array.isArray(HEROES) ? HEROES : []).find((h) => h.id === heroId);
    if (!def) { flashBlock('hero.empty'); return; }
    if (def.faction !== playerFaction()) { flashBlock('hero.cant.faction'); return; }
    if (playerAdena() < (def.cost | 0)) { flashBlock('hero.cant.adena'); return; }
    // A recruit needs a target province owned by the hero's faction.
    const owned = ownedProvinces();
    if (owned.length === 0) { flashBlock('hero.cant.owned'); return; }
    if (api && typeof api.recruitHero === 'function') {
      try { api.recruitHero(opts.state, heroId, owned[0]); } catch (_) {}
    }
    audio.sfx('sfx_select');
    changed();
    ui.selectedHero = heroId; ui.view = 'detail';
    redraw();
  }

  function doEquip(heroId, itemId) {
    if (api && typeof api.equipItem === 'function') {
      try { api.equipItem(opts.state, heroId, itemId); } catch (_) {}
    }
    audio.sfx('sfx_select'); changed(); redraw();
  }
  function doUnequip(heroId, itemId) {
    if (api && typeof api.unequipItem === 'function') {
      try { api.unequipItem(opts.state, heroId, itemId); } catch (_) {}
    } else if (api && typeof api.equipItem === 'function') {
      // No unequip exposed: best-effort no-op (degrade gracefully).
    }
    audio.sfx('sfx_select'); changed(); redraw();
  }
  function doAssign(heroId, provId) {
    if (api && typeof api.assignHero === 'function') {
      try { api.assignHero(opts.state, heroId, provId); } catch (_) {}
    }
    ui.picking = false;
    audio.sfx('sfx_select'); changed(); redraw();
  }

  function handleButton(b) {
    if (ui.cleanedUp) return;
    switch (b.action) {
      case 'leave': leave(); break;
      case 'back': ui.view = 'roster'; ui.selectedHero = null; ui.picking = false; redraw(); break;
      case 'recruit': doRecruit(b.id); break;
      case 'equip': doEquip(ui.selectedHero, b.id); break;
      case 'unequip': doUnequip(ui.selectedHero, b.id); break;
      case 'assign': ui.picking = true; redraw(); break;
      case 'pickprov': doAssign(ui.selectedHero, b.id); break;
      case 'unassign': doAssign(ui.selectedHero, null); break;
      case 'closepick': ui.picking = false; redraw(); break;
      default: break;
    }
  }
  function handleCard(c) {
    if (c.kind === 'hero') { ui.selectedHero = c.id; ui.view = 'detail'; audio.sfx('sfx_select'); redraw(); }
  }

  function leave() { cleanup(); resolveDone(); }

  // ---- timing / raf --------------------------------------------------------
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
    const tnow = now();
    if (ui.blockMsg && tnow > ui.blockUntil) ui.blockMsg = null;
    try { draw(tnow); } catch (_) {}
    ui.raf = raf(frame);
  }

  // ========================================================================
  // DRAWING
  // ========================================================================
  function draw(tnow) {
    const w = cw(), h = ch();
    ui.buttons = [];
    ui.cards = [];
    ctx.save();
    drawBackground(w, h);

    if (!api || typeof api.heroesRoster !== 'function') {
      drawNoHeroes(w, h);
      ctx.restore();
      return;
    }

    if (ui.view === 'detail' && ui.selectedHero) drawDetail(w, h, tnow);
    else drawRoster(w, h, tnow);

    if (ui.picking) drawProvincePicker(w, h);
    if (ui.blockMsg) drawBlockToast(w, h);
    ctx.restore();
  }

  function drawBackground(w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#221b2a');
    g.addColorStop(0.5, '#1c1822');
    g.addColorStop(1, '#141118');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // faint heraldic chevrons
    ctx.strokeStyle = 'rgba(224,160,74,0.05)';
    ctx.lineWidth = 1;
    const step = Math.max(40, h * 0.09);
    for (let y = -step; y < h + step; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w / 2, y + step * 0.5); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  function drawTitleBar(w, h, title) {
    const barH = h * 0.07;
    ctx.fillStyle = 'rgba(12,10,16,0.9)';
    ctx.fillRect(0, 0, w, barH);
    ctx.strokeStyle = '#3a3142'; ctx.beginPath(); ctx.moveTo(0, barH); ctx.lineTo(w, barH); ctx.stroke();
    ctx.fillStyle = '#e8d89a';
    ctx.font = `bold ${Math.round(h * 0.028)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(title, w / 2, barH / 2);
    // adena readout (right)
    ctx.fillStyle = '#e8c45a';
    ctx.font = `bold ${Math.round(h * 0.02)}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(t('res.adena') + ': ' + playerAdena(), w - w * 0.04, barH / 2);
    ctx.textAlign = 'center';
  }

  // ---- ROSTER VIEW ---------------------------------------------------------
  function drawRoster(w, h, tnow) {
    drawTitleBar(w, h, t('hero.title'));
    const list = recruitableHeroes();
    if (!list.length) {
      ctx.fillStyle = '#9aa0ab';
      ctx.font = `${Math.round(h * 0.022)}px sans-serif`;
      ctx.fillText(t('hero.none'), w / 2, h * 0.5);
      drawLeaveButton(w, h);
      return;
    }
    const top = h * 0.10;
    const cardH = h * 0.13;
    const pad = w * 0.04;
    const cardW = w - pad * 2;
    let y = top;
    for (let i = 0; i < list.length; i++) {
      const def = list[i];
      drawHeroCard(def, pad, y, cardW, cardH);
      ui.cards.push({ x: pad, y, w: cardW, h: cardH, kind: 'hero', id: def.id });
      y += cardH + h * 0.012;
    }
    drawLeaveButton(w, h);
  }

  function drawHeroCard(def, x, y, w, h) {
    const recruited = isRecruited(def.id);
    const rec = recruited ? rosterById(def.id) : null;
    ctx.save();
    ctx.fillStyle = 'rgba(34,28,42,0.92)';
    roundRect(x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = factionColor(def.faction); ctx.lineWidth = 1.5; ctx.stroke();
    // portrait
    const pSz = h * 0.78;
    const px = x + h * 0.11, py = y + (h - pSz) / 2;
    drawPortrait(def.portrait, px, py, pSz);
    // name + faction dot
    const tx = px + pSz + w * 0.03;
    ctx.fillStyle = '#e8e0c8';
    ctx.font = `bold ${Math.round(h * 0.22)}px sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(heroName(def), tx, y + h * 0.16);
    ctx.fillStyle = '#9aa0ab';
    ctx.font = `${Math.round(h * 0.16)}px sans-serif`;
    if (recruited) {
      const provTxt = rec.provId ? (t('prov.' + rec.provId) !== 'prov.' + rec.provId ? t('prov.' + rec.provId) : rec.provId) : t('hero.unassigned');
      ctx.fillText(t('hero.level') + (rec.level | 0) + '  ·  ' + provTxt, tx, y + h * 0.52);
    } else {
      ctx.fillStyle = '#e8c45a';
      ctx.fillText(t('hero.cost') + ': ' + (def.cost | 0), tx, y + h * 0.52);
    }
    // right-side state chip
    ctx.textAlign = 'right';
    if (recruited) {
      ctx.fillStyle = '#7be08a';
      ctx.font = `bold ${Math.round(h * 0.15)}px sans-serif`;
      ctx.fillText(t('hero.recruited'), x + w - w * 0.03, y + h / 2);
    } else {
      ctx.fillStyle = '#cbb88a';
      ctx.font = `${Math.round(h * 0.15)}px sans-serif`;
      ctx.fillText('›', x + w - w * 0.03, y + h / 2);
    }
    ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  }

  // ---- DETAIL VIEW ---------------------------------------------------------
  function drawDetail(w, h, tnow) {
    const id = ui.selectedHero;
    const def = (Array.isArray(HEROES) ? HEROES : []).find((x) => x.id === id);
    const rec = rosterById(id);
    drawTitleBar(w, h, def ? heroName(def) : t('hero.detail'));
    // back button (top-left)
    drawButton('‹ ' + t('hero.leave'), w * 0.03, h * 0.085, w * 0.26, h * 0.05, { action: 'back' }, true);

    if (!def) { drawLeaveButton(w, h); return; }

    // portrait + faction
    const pSz = h * 0.16;
    const px = w * 0.06, py = h * 0.16;
    drawPortrait(def.portrait, px, py, pSz);
    ctx.fillStyle = factionColor(def.faction);
    ctx.beginPath(); ctx.arc(px + pSz - 6, py + 6, 6, 0, Math.PI * 2); ctx.fill();

    // stats column
    const sx = px + pSz + w * 0.05;
    let sy = py;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (rec) {
      const next = rec.nextXp;
      ctx.fillStyle = '#e8d89a';
      ctx.font = `bold ${Math.round(h * 0.024)}px sans-serif`;
      ctx.fillText(t('hero.level') + (rec.level | 0), sx, sy); sy += h * 0.035;
      ctx.fillStyle = '#cdd4df';
      ctx.font = `${Math.round(h * 0.018)}px sans-serif`;
      const xpTxt = next == null ? (t('hero.xp') + ': ' + (rec.xp | 0) + ' (' + t('hero.max') + ')') : (t('hero.xp') + ': ' + (rec.xp | 0) + ' / ' + next);
      ctx.fillText(xpTxt, sx, sy); sy += h * 0.028;
      ctx.fillStyle = '#ff9f6b';
      ctx.fillText(t('hero.atk') + ': ' + (rec.stats.atk | 0), sx, sy); sy += h * 0.026;
      ctx.fillStyle = '#7fb8ff';
      ctx.fillText(t('hero.def') + ': ' + (rec.stats.def | 0), sx, sy); sy += h * 0.026;
      // battle bonus
      const bonus = (api && typeof api.heroBattleBonus === 'function' && rec.provId)
        ? safeBonus(rec.provId) : null;
      if (bonus) {
        ctx.fillStyle = '#9ad0e8';
        ctx.fillText(t('hero.bonus') + ': ×' + bonus.atkMul.toFixed(2) + ' / ×' + bonus.defMul.toFixed(2), sx, sy);
      }
    } else {
      ctx.fillStyle = '#e8c45a';
      ctx.font = `bold ${Math.round(h * 0.022)}px sans-serif`;
      ctx.fillText(t('hero.cost') + ': ' + (def.cost | 0), sx, sy); sy += h * 0.04;
      drawButton(t('hero.recruit'), sx, sy, w * 0.4, h * 0.055, { action: 'recruit', id: def.id }, playerAdena() >= (def.cost | 0), true);
    }

    // skills row
    let ry = py + pSz + h * 0.02;
    ctx.fillStyle = '#cbb88a'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = `bold ${Math.round(h * 0.018)}px sans-serif`;
    ctx.fillText(t('hero.skills') + ':', w * 0.06, ry); ry += h * 0.026;
    const skills = rec ? rec.skills : [];
    ctx.font = `${Math.round(h * 0.016)}px sans-serif`;
    const allSkills = Array.isArray(def.skillKeys) ? def.skillKeys : [];
    for (let i = 0; i < allSkills.length; i++) {
      const known = skills.indexOf(allSkills[i]) >= 0;
      ctx.fillStyle = known ? '#d8c89a' : '#5a5560';
      const nm = t(allSkills[i]);
      ctx.fillText((known ? '◆ ' : '◇ ') + (nm !== allSkills[i] ? nm : allSkills[i].split('.').pop()), w * 0.08, ry);
      ry += h * 0.024;
    }

    if (rec) {
      // assign button + current assignment
      const provTxt = rec.provId ? (t('prov.' + rec.provId) !== 'prov.' + rec.provId ? t('prov.' + rec.provId) : rec.provId) : t('hero.unassigned');
      ctx.fillStyle = '#9aa0ab';
      ctx.font = `${Math.round(h * 0.016)}px sans-serif`;
      ctx.fillText(t('hero.assigned') + ': ' + provTxt, w * 0.06, ry); ry += h * 0.03;
      drawButton(t('hero.assign'), w * 0.06, ry, w * 0.42, h * 0.05, { action: 'assign' }, true);
      if (rec.provId) drawButton(t('hero.unassigned'), w * 0.52, ry, w * 0.42, h * 0.05, { action: 'unassign' }, true);
      ry += h * 0.065;

      drawEquipment(w, h, ry, rec);
      drawInventoryGrid(w, h, rec);
    }
    drawLeaveButton(w, h);
  }

  // Equipped slots (weapon/armor/trinket) with unequip buttons.
  function drawEquipment(w, h, top, rec) {
    ctx.fillStyle = '#cbb88a'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = `bold ${Math.round(h * 0.018)}px sans-serif`;
    ctx.fillText(t('hero.equipped') + ':', w * 0.06, top);
    const y = top + h * 0.026;
    const slotW = (w * 0.88) / 3;
    const equipBySlot = {};
    for (const itemId of rec.items || []) {
      const it = ITEMS_BY_ID[itemId];
      if (it) equipBySlot[it.slot] = itemId;
    }
    for (let i = 0; i < SLOT_ORDER.length; i++) {
      const slot = SLOT_ORDER[i];
      const x = w * 0.06 + i * slotW;
      ctx.fillStyle = '#8c92a0';
      ctx.font = `${Math.round(h * 0.013)}px sans-serif`;
      ctx.fillText(t('hero.slot.' + slot), x, y);
      const iconSz = h * 0.05;
      const ix = x, iy = y + h * 0.02;
      const equippedId = equipBySlot[slot];
      if (equippedId) {
        drawItemIcon(ITEMS_BY_ID[equippedId].icon, ix, iy, iconSz);
        // unequip on tap of the icon
        ui.buttons.push({ x: ix, y: iy, w: iconSz, h: iconSz, action: 'unequip', id: equippedId });
      } else {
        ctx.strokeStyle = '#3a3142'; ctx.lineWidth = 1;
        roundRect(ix, iy, iconSz, iconSz, 6); ctx.stroke();
      }
    }
  }

  // Inventory pool as a tappable grid; tap to equip onto the selected hero.
  function drawInventoryGrid(w, h, rec) {
    const inv = inventory();
    const ids = Object.keys(inv).filter((id) => (inv[id] | 0) > 0 && ITEMS_BY_ID[id]);
    const top = h * 0.78;
    ctx.fillStyle = '#cbb88a'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = `bold ${Math.round(h * 0.018)}px sans-serif`;
    ctx.fillText(t('hero.inventory') + ':', w * 0.06, top - h * 0.026);
    if (!ids.length) {
      ctx.fillStyle = '#6a6570';
      ctx.font = `${Math.round(h * 0.015)}px sans-serif`;
      ctx.fillText(t('hero.invFull'), w * 0.06, top);
      return;
    }
    const cols = 6;
    const cell = (w * 0.88) / cols;
    const iconSz = cell * 0.78;
    for (let i = 0; i < ids.length && i < cols * 2; i++) {
      const id = ids[i];
      const col = i % cols, row = (i / cols) | 0;
      const x = w * 0.06 + col * cell;
      const y = top + row * cell;
      drawItemIcon(ITEMS_BY_ID[id].icon, x, y, iconSz);
      // count badge
      const cnt = inv[id] | 0;
      if (cnt > 1) {
        ctx.fillStyle = '#e0a04a';
        ctx.font = `bold ${Math.round(iconSz * 0.3)}px sans-serif`;
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText('×' + cnt, x + iconSz, y + iconSz);
      }
      ui.buttons.push({ x, y, w: iconSz, h: iconSz, action: 'equip', id });
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  }

  // ---- province picker overlay --------------------------------------------
  function drawProvincePicker(w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(8,6,12,0.72)';
    ctx.fillRect(0, 0, w, h);
    const pw = w * 0.84, ph = h * 0.6;
    const px = w / 2 - pw / 2, py = h / 2 - ph / 2;
    ctx.fillStyle = 'rgba(24,20,30,0.98)';
    roundRect(px, py, pw, ph, 12); ctx.fill();
    ctx.strokeStyle = '#e0a04a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#e8d89a';
    ctx.font = `bold ${Math.round(h * 0.022)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t('hero.pickprov'), w / 2, py + h * 0.04);
    const owned = ownedProvinces();
    const rowH = h * 0.05;
    let y = py + h * 0.08;
    for (let i = 0; i < owned.length && y < py + ph - rowH * 1.4; i++) {
      const id = owned[i];
      const label = t('prov.' + id) !== 'prov.' + id ? t('prov.' + id) : id;
      drawButton(label, px + pw * 0.1, y, pw * 0.8, rowH * 0.9, { action: 'pickprov', id }, true);
      y += rowH;
    }
    drawButton(t('hero.close'), px + pw * 0.25, py + ph - rowH * 1.1, pw * 0.5, rowH, { action: 'closepick' }, true, true);
    ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  }

  // ---- portrait / item icon drawing ---------------------------------------
  // heroes_sheet is a 3x2 grid; portrait index 0..5.
  function drawPortrait(idx, x, y, sz) {
    idx = clamp(idx | 0, 0, 5);
    const sheet = heroesSheet(opts.assets);
    if (sheet) {
      const sw = sheet.width / 3, sh = sheet.height / 2;
      const sx = (idx % 3) * sw, sy = ((idx / 3) | 0) * sh;
      try { ctx.drawImage(sheet, sx, sy, sw, sh, x, y, sz, sz); return; } catch (_) {}
    }
    // Procedural portrait: tinted shield with a helm glyph.
    ctx.save();
    const hue = (idx * 55) % 360;
    ctx.fillStyle = `hsl(${hue},35%,30%)`;
    roundRect(x, y, sz, sz, sz * 0.12); ctx.fill();
    ctx.strokeStyle = '#5a5560'; ctx.lineWidth = Math.max(1, sz * 0.03); ctx.stroke();
    ctx.fillStyle = `hsl(${hue},45%,62%)`;
    ctx.beginPath();
    ctx.arc(x + sz * 0.5, y + sz * 0.42, sz * 0.2, Math.PI, 0); // helm dome
    ctx.fill();
    ctx.fillRect(x + sz * 0.3, y + sz * 0.42, sz * 0.4, sz * 0.32);
    ctx.fillStyle = '#1a1620';
    ctx.fillRect(x + sz * 0.42, y + sz * 0.46, sz * 0.04, sz * 0.18); // nasal bar
    ctx.restore();
  }

  // items_sheet is a 3x3 grid; icon index 0..8.
  function drawItemIcon(idx, x, y, sz) {
    idx = clamp(idx | 0, 0, 8);
    const sheet = itemsSheet(opts.assets);
    if (sheet) {
      const sw = sheet.width / 3, sh = sheet.height / 3;
      const sx = (idx % 3) * sw, sy = ((idx / 3) | 0) * sh;
      try { ctx.drawImage(sheet, sx, sy, sw, sh, x, y, sz, sz); return; } catch (_) {}
    }
    ctx.save();
    ctx.fillStyle = 'rgba(40,34,50,0.95)';
    roundRect(x, y, sz, sz, sz * 0.16); ctx.fill();
    ctx.strokeStyle = '#6a6478'; ctx.lineWidth = Math.max(1, sz * 0.05); ctx.stroke();
    const hue = (idx * 40) % 360;
    ctx.fillStyle = `hsl(${hue},55%,58%)`;
    ctx.beginPath();
    ctx.moveTo(x + sz * 0.5, y + sz * 0.2);
    ctx.lineTo(x + sz * 0.7, y + sz * 0.8);
    ctx.lineTo(x + sz * 0.3, y + sz * 0.8);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ---- shared chrome -------------------------------------------------------
  function drawLeaveButton(w, h) {
    const bw = w * 0.5, bh = h * 0.055;
    drawButton(t('hero.leave'), w / 2 - bw / 2, h * 0.935, bw, bh, { action: 'leave' }, true, true);
  }
  function drawNoHeroes(w, h) {
    const pw = w * 0.8, ph = h * 0.26;
    const px = w / 2 - pw / 2, py = h / 2 - ph / 2;
    ctx.fillStyle = 'rgba(24,20,30,0.96)';
    roundRect(px, py, pw, ph, 12); ctx.fill();
    ctx.strokeStyle = '#586375'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#e8d89a';
    ctx.font = `bold ${Math.round(h * 0.026)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t('hero.empty'), w / 2, py + ph * 0.35);
    const bw = pw * 0.7, bh = h * 0.06;
    drawButton(t('hero.leave'), w / 2 - bw / 2, py + ph * 0.62, bw, bh, { action: 'leave' }, true, true);
  }
  function drawBlockToast(w, h) {
    const msg = t(ui.blockMsg);
    ctx.save();
    ctx.font = `bold ${Math.round(h * 0.02)}px sans-serif`;
    const tw = ctx.measureText(msg).width + w * 0.08;
    const bw = Math.min(w * 0.9, tw);
    const bx = w / 2 - bw / 2, by = h * 0.86, bh = h * 0.05;
    ctx.fillStyle = 'rgba(120,30,30,0.92)';
    roundRect(bx, by, bw, bh, 10); ctx.fill();
    ctx.fillStyle = '#ffe0d8';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(msg, w / 2, by + bh / 2);
    ctx.restore();
  }

  function drawButton(label, x, y, w, h, action, enabled, primary) {
    ctx.save();
    ctx.globalAlpha = enabled ? 1 : 0.45;
    ctx.fillStyle = primary ? '#6a4fae' : '#2c2630';
    roundRect(x, y, w, h, Math.min(8, h * 0.25)); ctx.fill();
    ctx.strokeStyle = enabled ? '#e0a04a' : '#4a4234';
    ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#efe6cf';
    ctx.font = `bold ${Math.round(h * 0.42)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
    ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ui.buttons.push({ x, y, w, h, action: action.action, id: action.id });
  }

  // ---- helpers -------------------------------------------------------------
  function heroName(def) {
    const k = def.nameKey || ('hero.' + def.id);
    const s = t(k);
    if (s && s !== k) return s;
    return def.id ? (def.id.charAt(0).toUpperCase() + def.id.slice(1)) : '?';
  }
  function safeBonus(provId) {
    try { return api.heroBattleBonus(opts.state, provId); } catch (_) { return null; }
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

  // ---- lifecycle -----------------------------------------------------------
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
    try {
      ctx.save();
      if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width || cw(), canvas.height || ch());
      ctx.restore();
    } catch (_) {}
  }

  // ---- start ---------------------------------------------------------------
  try {
    addListeners();
    try { draw(now()); } catch (_) {}
    ui.raf = raf(frame);
  } catch (_) {
    cleanup();
    return Promise.resolve();
  }
  return donePromise;
}

// Build an items-by-id map from whatever the api forwards (or empty).
function buildItemsById(api) {
  const out = {};
  const list = api && (api.ITEMS || api.items);
  if (Array.isArray(list)) {
    for (const it of list) if (it && it.id) out[it.id] = it;
  }
  return out;
}

export default { openHeroes };
