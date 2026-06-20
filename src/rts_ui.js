// src/rts_ui.js — owner: feat/rts-3d (RTS-3D)
// Real-time RTS battle screen with a DUAL render backend driving ONE sim (src/rts.js):
//   - 3D backend (Three.js + GLB models) when WebGL is available,
//   - 2D top-down canvas fallback otherwise (must be fully playable).
//
// Entry point (interfaces-v5 §2):
//   export async function openRtsBattle(opts) -> Promise<outcome>
//   opts = { hostCanvas, attacker, defender, terrain, seed, assets, t, lang,
//            sound, requestRedraw, mount? }
//   outcome = the rts.js rtsOutcome() shape (identical to combat.resolveBattle),
//   so engine.applyBattleOutcome consumes it unchanged.
//
// Creates its OWN full-window <canvas> overlay (a canvas cannot be both 2d and
// webgl, so we never reuse the map's 2D context). Removes the overlay + all
// listeners on resolve. NEVER throws: any fatal error resolves a deterministic
// sane outcome so the caller can proceed to the tactical fallback.

// ----------------------------------------------------------------------------
// MODEL_FOR: unit id -> GLB model key (reuses the v1 SPRITE_FOR archetypes).
// Unknown / missing GLB -> a colored team-tinted primitive (capsule/box).
// ----------------------------------------------------------------------------
export const MODEL_FOR = {
  knight: 'knight', gladiator: 'knight', bishop: 'knight',
  ranger: 'ranger', bonearcher: 'ranger',
  sorcerer: 'mage', necromancer: 'mage',
  destroyer: 'orc',
  wraith: 'undead',
  shillienknight: 'knight', phantomranger: 'ranger', spellhowler: 'mage',
  dwarvendefender: 'knight', soulsoldier: 'knight',
  bountyhunter: 'orc', berserker: 'orc',
  soulranger: 'ranger', warsmith: 'knight',
};
function modelKeyFor(unitId) { return MODEL_FOR[unitId] || 'knight'; }

// One-letter glyph per archetype for the 2D discs.
const GLYPH = {
  knight: 'K', ranger: 'R', mage: 'M', orc: 'O', undead: 'U',
};
function glyphFor(unitId) { return GLYPH[modelKeyFor(unitId)] || '?'; }

// ----------------------------------------------------------------------------
// Localization: prefer opts.t, fall back to a built-in RU/EN table (keys rts.*).
// ----------------------------------------------------------------------------
const LOCAL = {
  ru: {
    'rts.title': 'Битва', 'rts.yourArmy': 'Ваши', 'rts.enemy': 'Враг',
    'rts.selectAll': 'Выделить всех', 'rts.attackMove': 'В атаку',
    'rts.auto': 'Авто', 'rts.leave': 'Покинуть бой',
    'rts.victory': 'Победа', 'rts.defeat': 'Поражение', 'rts.draw': 'Ничья',
    'rts.hint': 'Тапните юнита — выбор. Тап по земле — движение, по врагу — атака.',
    'rts.time': 'Время', 'rts.loading': 'Загрузка…',
  },
  en: {
    'rts.title': 'Battle', 'rts.yourArmy': 'Yours', 'rts.enemy': 'Enemy',
    'rts.selectAll': 'Select all', 'rts.attackMove': 'Attack-move',
    'rts.auto': 'Auto', 'rts.leave': 'Leave battle',
    'rts.victory': 'Victory', 'rts.defeat': 'Defeat', 'rts.draw': 'Draw',
    'rts.hint': 'Tap a unit to select. Tap ground to move, tap an enemy to attack.',
    'rts.time': 'Time', 'rts.loading': 'Loading…',
  },
};
function makeT(opts) {
  const ext = opts && typeof opts.t === 'function' ? opts.t : null;
  const lang = (opts && opts.lang) || 'ru';
  return (key, params) => {
    if (ext) {
      try { const s = ext(key, params); if (s && s !== key) return s; } catch (_) {}
    }
    const tbl = LOCAL[lang] || LOCAL.en;
    let s = tbl[key] || LOCAL.en[key] || key;
    if (params) for (const k in params) s = String(s).replace('{' + k + '}', params[k]);
    return s;
  };
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function safeSound(opts, key) { if (opts && opts.sound) { try { opts.sound(key); } catch (_) {} } }

// Team colors: attacker = player (blue/gold), defender = enemy (necrotic violet).
const TEAM_COLOR = {
  attacker: { css: '#5aa0ff', hex: 0x5aa0ff, emissive: 0x1b3a6b },
  defender: { css: '#b25cff', hex: 0xb25cff, emissive: 0x3a1b5b },
};

// A deterministic, sane fallback outcome — used only if the sim is unavailable
// or a fatal error occurs before we can compute a real rtsOutcome.
function fallbackOutcome(opts, winner) {
  const w = winner || 'defender';
  const garr = (side) => (opts && opts[side] && opts[side].garrison) || {};
  const att = garr('attacker'), def = garr('defender');
  return {
    winner: w,
    attackerLosses: w === 'defender' ? { ...att } : {},
    defenderLosses: w === 'attacker' ? { ...def } : {},
    attackerSurvivors: w === 'attacker' ? { ...att } : {},
    defenderSurvivors: w === 'defender' ? { ...def } : {},
    rounds: [],
    log: [{ key: 'rts.log.fallback', params: { winner: w } }],
  };
}

// ----------------------------------------------------------------------------
// Public entry point.
// ----------------------------------------------------------------------------
export async function openRtsBattle(opts) {
  opts = opts || {};
  const t = makeT(opts);

  // Load the sim. If it cannot load, degrade to a deterministic outcome.
  let RTS;
  try {
    RTS = await import('./rts.js');
  } catch (_) {
    return fallbackOutcome(opts, 'defender');
  }

  // Create the battle state.
  let state;
  try {
    state = RTS.createRtsBattle({
      attacker: opts.attacker,
      defender: opts.defender,
      terrain: opts.terrain,
      seed: (opts.seed >>> 0) || 0,
    });
  } catch (_) {
    return fallbackOutcome(opts, 'defender');
  }
  const field = (state && state.field) || { w: 100, h: 60 };

  // Build the full-window overlay + a render canvas.
  const dom = buildOverlay(opts, t);
  safeSound(opts, 'music_battle');

  // Pick a backend: try 3D (Three.js + WebGL), else 2D.
  let backend = null;
  try {
    backend = await create3DBackend(dom.canvas, opts, field, state, RTS);
  } catch (_) {
    backend = null;
  }
  if (!backend) {
    try {
      backend = create2DBackend(dom.canvas, opts, field, state, RTS);
    } catch (_) {
      backend = null;
    }
  }
  if (!backend) {
    // Could not render at all — auto-resolve in the background.
    let out;
    try {
      out = autoResolveSim(RTS, state) || RTS.rtsOutcome(state);
    } catch (_) { out = fallbackOutcome(opts, 'defender'); }
    dom.destroy();
    return out;
  }

  // ----- shared driver: sim loop + input + HUD -----------------------------
  return driveBattle({ opts, t, dom, backend, state, RTS, field });
}

// ----------------------------------------------------------------------------
// DOM overlay: full-window container, render canvas, HUD, buttons.
// ----------------------------------------------------------------------------
function buildOverlay(opts, t) {
  const doc = (typeof document !== 'undefined') ? document : null;
  if (!doc) {
    // Headless: synthesize a minimal stub so logic tests can run.
    const canvas = (opts && opts._stubCanvas) || null;
    return {
      container: null, canvas, hud: null, banner: null,
      buttons: {}, listeners: [],
      destroy() {},
      setHud() {}, showBanner() {},
    };
  }
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

  const container = doc.createElement('div');
  container.setAttribute('data-rts', '1');
  Object.assign(container.style, {
    position: 'fixed', left: '0', top: '0', right: '0', bottom: '0',
    width: '100%', height: '100%', zIndex: '99999',
    background: '#05060a', overflow: 'hidden', touchAction: 'none',
    userSelect: 'none', webkitUserSelect: 'none',
    fontFamily: 'system-ui, sans-serif',
  });

  const canvas = doc.createElement('canvas');
  Object.assign(canvas.style, {
    position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
    display: 'block', touchAction: 'none',
  });
  container.appendChild(canvas);

  // Top HUD.
  const hud = doc.createElement('div');
  Object.assign(hud.style, {
    position: 'absolute', left: '0', top: '0', width: '100%',
    padding: '10px 14px', boxSizing: 'border-box',
    color: '#e8ecf4', fontSize: '15px', fontWeight: '600',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'linear-gradient(#000a, #0000)', pointerEvents: 'none',
  });
  const hudLeft = doc.createElement('span');
  const hudMid = doc.createElement('span');
  const hudRight = doc.createElement('span');
  hudMid.style.opacity = '0.85';
  hud.appendChild(hudLeft); hud.appendChild(hudMid); hud.appendChild(hudRight);
  container.appendChild(hud);

  // Hint line.
  const hint = doc.createElement('div');
  Object.assign(hint.style, {
    position: 'absolute', left: '0', top: '40px', width: '100%',
    textAlign: 'center', color: '#aab4c8', fontSize: '12px',
    pointerEvents: 'none', textShadow: '0 1px 2px #000',
  });
  hint.textContent = t('rts.hint');
  container.appendChild(hint);

  // Bottom button bar.
  const bar = doc.createElement('div');
  Object.assign(bar.style, {
    position: 'absolute', left: '0', bottom: '0', width: '100%',
    padding: '10px', boxSizing: 'border-box',
    display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap',
    background: 'linear-gradient(#0000, #000c)',
  });
  function mkBtn(label, accent) {
    const b = doc.createElement('button');
    b.textContent = label;
    Object.assign(b.style, {
      padding: '10px 14px', borderRadius: '10px', border: '1px solid #2a3346',
      background: accent ? '#7a2230' : '#161c28', color: '#e8ecf4',
      fontSize: '14px', fontWeight: '600', cursor: 'pointer', touchAction: 'manipulation',
    });
    bar.appendChild(b);
    return b;
  }
  const buttons = {
    selectAll: mkBtn(t('rts.selectAll')),
    attackMove: mkBtn(t('rts.attackMove')),
    auto: mkBtn(t('rts.auto')),
    leave: mkBtn(t('rts.leave'), true),
  };
  container.appendChild(bar);

  // Result banner (hidden initially).
  const banner = doc.createElement('div');
  Object.assign(banner.style, {
    position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%,-50%)',
    padding: '18px 34px', borderRadius: '14px', background: '#0a0e16e6',
    border: '1px solid #2a3346', color: '#fff', fontSize: '34px', fontWeight: '800',
    textAlign: 'center', display: 'none', pointerEvents: 'none',
    textShadow: '0 2px 10px #000',
  });
  container.appendChild(banner);

  doc.body.appendChild(container);

  // Size the canvas to the window with devicePixelRatio.
  function resize() {
    const w = container.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 800);
    const h = container.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 600);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
  }
  resize();

  const listeners = [];
  function on(target, ev, fn, optsArg) {
    target.addEventListener(ev, fn, optsArg);
    listeners.push([target, ev, fn, optsArg]);
  }
  if (typeof window !== 'undefined') on(window, 'resize', resize);

  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const [tgt, ev, fn, oa] of listeners) {
      try { tgt.removeEventListener(ev, fn, oa); } catch (_) {}
    }
    listeners.length = 0;
    try { if (container.parentNode) container.parentNode.removeChild(container); } catch (_) {}
  }

  return {
    container, canvas, hud, banner, buttons, dpr,
    on, listeners, destroy, resize,
    setHud(yours, enemy, time) {
      hudLeft.textContent = t('rts.yourArmy') + ': ' + yours;
      hudMid.textContent = t('rts.title');
      hudRight.textContent = t('rts.enemy') + ': ' + enemy + '   ' +
        t('rts.time') + ' ' + (time | 0) + 's';
    },
    showBanner(text, color) {
      banner.textContent = text;
      banner.style.color = color || '#fff';
      banner.style.display = 'block';
    },
    setHint(s) { hint.textContent = s; },
  };
}

// ----------------------------------------------------------------------------
// Shared battle driver: fixed-step sim, input -> issueCommand, HUD, resolve.
// ----------------------------------------------------------------------------
function driveBattle({ opts, t, dom, backend, state, RTS, field }) {
  return new Promise((resolve) => {
    let done = false;
    let raf = 0;
    let lastTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    let acc = 0;
    let auto = false;
    const STEP = 1000 / 30; // fixed sim timestep (ms)
    const now = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());

    // Selection set (attacker unit ids).
    const selected = new Set();

    function aliveUnits(team) {
      try { return RTS.unitsByTeam(state, team).filter(u => u.state !== 'dead' && u.hp > 0); }
      catch (_) { return []; }
    }
    function statusSafe() {
      try { return RTS.rtsStatus(state); } catch (_) { return { over: false, time: 0, alive: { attacker: 0, defender: 0 } }; }
    }

    // ----- input -> commands (provided by the backend's picker) -----
    backend.onSelect = (ids, additive) => {
      if (!additive) selected.clear();
      for (const id of ids) selected.add(id);
      backend.setSelected(selected);
      safeSound(opts, 'sfx_select');
    };
    backend.onMove = (x, y) => {
      if (!selected.size) return;
      try { RTS.issueCommand(state, [...selected], { type: 'move', x, y }); } catch (_) {}
      safeSound(opts, 'sfx_select');
    };
    backend.onAttack = (targetId) => {
      if (!selected.size) return;
      try { RTS.issueCommand(state, [...selected], { type: 'attack', targetId }); } catch (_) {}
      safeSound(opts, 'sfx_battle');
    };

    // ----- buttons -----
    function attackMoveAll() {
      const ids = selected.size ? [...selected] : aliveUnits('attacker').map(u => u.id);
      const enemies = aliveUnits('defender');
      if (!ids.length || !enemies.length) return;
      // Aim at the centroid of enemy forces.
      let cx = 0, cy = 0;
      for (const e of enemies) { cx += e.x; cy += e.y; }
      cx /= enemies.length; cy /= enemies.length;
      try { RTS.issueCommand(state, ids, { type: 'attackMove', x: cx, y: cy }); } catch (_) {}
      safeSound(opts, 'sfx_battle');
    }
    function selectAll() {
      selected.clear();
      for (const u of aliveUnits('attacker')) selected.add(u.id);
      backend.setSelected(selected);
      safeSound(opts, 'sfx_select');
    }

    if (dom.on && dom.buttons.selectAll) {
      dom.on(dom.buttons.selectAll, 'click', selectAll);
      dom.on(dom.buttons.attackMove, 'click', attackMoveAll);
      dom.on(dom.buttons.auto, 'click', () => { auto = !auto; dom.buttons.auto.style.background = auto ? '#2a5a2a' : '#161c28'; });
      dom.on(dom.buttons.leave, 'click', () => finish(true));
    }

    // ----- the loop -----
    function step(realDt) {
      // When in auto mode, let the player units attack-move continuously.
      if (auto) {
        const enemies = aliveUnits('defender');
        if (enemies.length) {
          let cx = 0, cy = 0;
          for (const e of enemies) { cx += e.x; cy += e.y; }
          cx /= enemies.length; cy /= enemies.length;
          const idle = aliveUnits('attacker').filter(u => u.state === 'idle' || !u.targetId);
          if (idle.length) {
            try { RTS.issueCommand(state, idle.map(u => u.id), { type: 'attackMove', x: cx, y: cy }); } catch (_) {}
          }
        }
      }
      acc += realDt;
      let guard = 0;
      while (acc >= STEP && guard < 12) {
        try { RTS.rtsStep(state, STEP); } catch (_) {}
        acc -= STEP; guard++;
        if (statusSafe().over) break;
      }
    }

    function frame() {
      if (done) return;
      const ts = now();
      let dt = ts - lastTs;
      lastTs = ts;
      if (dt > 250) dt = 250; // clamp tab-switch hitches
      // In auto mode, fast-forward the sim for a quick resolution.
      const passes = auto ? 6 : 1;
      for (let i = 0; i < passes; i++) step(dt / passes);

      const st = statusSafe();
      // prune dead from selection
      const liveIds = new Set(aliveUnits('attacker').map(u => u.id));
      for (const id of [...selected]) if (!liveIds.has(id)) selected.delete(id);

      try { backend.render(dt); } catch (_) {}
      if (dom.setHud) dom.setHud(st.alive ? st.alive.attacker : aliveUnits('attacker').length,
        st.alive ? st.alive.defender : aliveUnits('defender').length, st.time || 0);
      if (opts.requestRedraw) { try { opts.requestRedraw(); } catch (_) {} }

      if (st.over) { finish(false); return; }
      raf = requestRaf(frame);
    }

    function computeOutcome() {
      try { return RTS.rtsOutcome(state); } catch (_) { return fallbackOutcome(opts, 'defender'); }
    }

    function finish(leftEarly) {
      if (done) return;
      done = true;
      if (raf) cancelRaf(raf);
      let outcome;
      if (leftEarly && !statusSafe().over) {
        // Resolve the CURRENT standing as the outcome.
        outcome = computeOutcome();
      } else {
        outcome = computeOutcome();
      }
      const win = outcome && outcome.winner;
      const txt = win === 'attacker' ? t('rts.victory') : win === 'defender' ? t('rts.defeat') : t('rts.draw');
      const col = win === 'attacker' ? '#7ad27a' : '#ff7a7a';
      if (dom.showBanner) dom.showBanner(txt, col);
      safeSound(opts, win === 'attacker' ? 'sfx_victory' : 'sfx_battle');

      const cleanupAndResolve = () => {
        try { if (backend.dispose) backend.dispose(); } catch (_) {}
        dom.destroy();
        resolve(outcome);
      };
      // Brief banner, then tear down.
      if (typeof setTimeout !== 'undefined') setTimeout(cleanupAndResolve, leftEarly ? 50 : 1100);
      else cleanupAndResolve();
    }

    function requestRaf(fn) {
      if (typeof requestAnimationFrame !== 'undefined') return requestAnimationFrame(fn);
      return (typeof setTimeout !== 'undefined') ? setTimeout(() => fn(now()), 16) : 0;
    }
    function cancelRaf(h) {
      if (typeof cancelAnimationFrame !== 'undefined') { try { cancelAnimationFrame(h); } catch (_) {} }
      else if (typeof clearTimeout !== 'undefined') { try { clearTimeout(h); } catch (_) {} }
    }

    // expose for tests
    driveBattle._last = { selectAll, attackMoveAll, finish, frame, selected };

    // kick off
    raf = requestRaf(frame);
  });
}

// Auto-resolve the sim to completion headlessly (used when no backend renders).
function autoResolveSim(RTS, state) {
  try {
    let guard = 0;
    while (!RTS.rtsStatus(state).over && guard < 6000) {
      RTS.rtsStep(state, 1000 / 30);
      guard++;
    }
    return RTS.rtsOutcome(state);
  } catch (_) { return null; }
}

// ----------------------------------------------------------------------------
// 2D FALLBACK BACKEND — plain top-down canvas. Fully playable.
// ----------------------------------------------------------------------------
function create2DBackend(canvas, opts, field, state, RTS) {
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

  // Camera: map field (logical) -> screen pixels, with pan + zoom.
  const cam = { zoom: 1, panX: 0, panY: 0 };
  let selectedSet = new Set();

  // terrain tint
  const terrainColor = terrainTint(opts.terrain);

  function fit() {
    // Scale so the whole field fits with some margin; then apply zoom/pan.
    const W = canvas.width, H = canvas.height;
    const margin = 0.08;
    const sx = (W * (1 - margin)) / field.w;
    const sy = (H * (1 - margin)) / field.h;
    return Math.min(sx, sy);
  }
  function worldToScreen(x, y) {
    const base = fit() * cam.zoom;
    const W = canvas.width, H = canvas.height;
    const ox = W / 2 + cam.panX;
    const oy = H / 2 + cam.panY;
    return { sx: ox + (x - field.w / 2) * base, sy: oy + (y - field.h / 2) * base, base };
  }
  function screenToWorld(px, py) {
    const base = fit() * cam.zoom;
    const W = canvas.width, H = canvas.height;
    const ox = W / 2 + cam.panX;
    const oy = H / 2 + cam.panY;
    return { x: field.w / 2 + (px - ox) / base, y: field.h / 2 + (py - oy) / base };
  }

  const backend = { onSelect: null, onMove: null, onAttack: null };

  backend.setSelected = (set) => { selectedSet = set; };

  backend.render = () => {
    const W = canvas.width, H = canvas.height;
    // field background
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, W, H);
    // ground rect
    const tl = worldToScreen(0, 0), br = worldToScreen(field.w, field.h);
    ctx.fillStyle = terrainColor;
    ctx.fillRect(tl.sx, tl.sy, br.sx - tl.sx, br.sy - tl.sy);
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const grid = 10;
    for (let gx = 0; gx <= field.w; gx += grid) {
      const a = worldToScreen(gx, 0), b = worldToScreen(gx, field.h);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    for (let gy = 0; gy <= field.h; gy += grid) {
      const a = worldToScreen(0, gy), b = worldToScreen(field.w, gy);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }

    let units = [];
    try { units = (RTS.unitsByTeam(state, 'attacker') || []).concat(RTS.unitsByTeam(state, 'defender') || []); }
    catch (_) { units = []; }
    const r = Math.max(5, fit() * cam.zoom * 0.9);

    for (const u of units) {
      const p = worldToScreen(u.x, u.y);
      const dead = u.state === 'dead' || u.hp <= 0;
      const col = TEAM_COLOR[u.team] ? TEAM_COLOR[u.team].css : '#888';
      ctx.globalAlpha = dead ? 0.25 : 1;
      // disc
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.stroke();
      // attack flash
      if (u.state === 'attack' && u.targetId) {
        const tgt = units.find(z => z.id === u.targetId);
        if (tgt) {
          const tp = worldToScreen(tgt.x, tgt.y);
          ctx.strokeStyle = 'rgba(255,230,120,0.65)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(tp.sx, tp.sy); ctx.stroke();
        }
      }
      // selection ring (attacker only)
      if (selectedSet && selectedSet.has(u.id)) {
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffd86b';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      // glyph
      if (!dead) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0b0d12';
        ctx.font = 'bold ' + Math.round(r * 1.1) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(glyphFor(u.unitId), p.sx, p.sy + 0.5);
        // HP arc
        const frac = clamp(u.hp / (u.maxHp || u.hp || 1), 0, 1);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.strokeStyle = frac > 0.5 ? '#7ad27a' : frac > 0.25 ? '#e8c14a' : '#e85a5a';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // drag box
    if (drag.active && drag.box) {
      ctx.strokeStyle = '#ffd86b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(drag.box.x0, drag.box.y0, drag.box.x1 - drag.box.x0, drag.box.y1 - drag.box.y0);
      ctx.setLineDash([]);
    }
  };

  // ----- input -----
  const drag = { active: false, moved: false, sx0: 0, sy0: 0, box: null, downId: -1 };
  function evtPos(e) {
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect()
      : { left: 0, top: 0, width: canvas.width, height: canvas.height };
    const cx = (e.touches && e.touches[0]) ? e.touches[0].clientX : (e.clientX != null ? e.clientX : 0);
    const cy = (e.touches && e.touches[0]) ? e.touches[0].clientY : (e.clientY != null ? e.clientY : 0);
    const scaleX = canvas.width / (rect.width || canvas.width);
    const scaleY = canvas.height / (rect.height || canvas.height);
    return { px: (cx - rect.left) * scaleX, py: (cy - rect.top) * scaleY };
  }
  function unitAt(px, py, team) {
    const r = Math.max(8, fit() * cam.zoom * 1.1);
    let best = null, bestD = r * r;
    let units = [];
    try { units = RTS.unitsByTeam(state, team) || []; } catch (_) { units = []; }
    for (const u of units) {
      if (u.state === 'dead' || u.hp <= 0) continue;
      const p = worldToScreen(u.x, u.y);
      const d = (p.sx - px) * (p.sx - px) + (p.sy - py) * (p.sy - py);
      if (d <= bestD) { bestD = d; best = u; }
    }
    return best;
  }

  function onDown(e) {
    if (e.cancelable) e.preventDefault();
    const { px, py } = evtPos(e);
    drag.active = true; drag.moved = false; drag.sx0 = px; drag.sy0 = py;
    drag.box = { x0: px, y0: py, x1: px, y1: py };
  }
  function onMoveEvt(e) {
    if (!drag.active) return;
    if (e.cancelable) e.preventDefault();
    const { px, py } = evtPos(e);
    if (Math.abs(px - drag.sx0) + Math.abs(py - drag.sy0) > 8) drag.moved = true;
    drag.box = { x0: drag.sx0, y0: drag.sy0, x1: px, y1: py };
  }
  function onUp(e) {
    if (!drag.active) return;
    if (e.cancelable) e.preventDefault();
    const { px, py } = evtPos(e);
    drag.active = false;
    if (drag.moved) {
      // box-select friendly units inside the box
      const x0 = Math.min(drag.sx0, px), x1 = Math.max(drag.sx0, px);
      const y0 = Math.min(drag.sy0, py), y1 = Math.max(drag.sy0, py);
      const ids = [];
      let units = [];
      try { units = RTS.unitsByTeam(state, 'attacker') || []; } catch (_) {}
      for (const u of units) {
        if (u.state === 'dead' || u.hp <= 0) continue;
        const p = worldToScreen(u.x, u.y);
        if (p.sx >= x0 && p.sx <= x1 && p.sy >= y0 && p.sy <= y1) ids.push(u.id);
      }
      drag.box = null;
      if (ids.length && backend.onSelect) backend.onSelect(ids, false);
      return;
    }
    drag.box = null;
    // tap: friendly -> select; enemy (with selection) -> attack; ground -> move
    const friendly = unitAt(px, py, 'attacker');
    if (friendly) { if (backend.onSelect) backend.onSelect([friendly.id], !!(e.shiftKey)); return; }
    const enemy = unitAt(px, py, 'defender');
    if (enemy) { if (backend.onAttack) backend.onAttack(enemy.id); return; }
    const w = screenToWorld(px, py);
    if (backend.onMove) backend.onMove(clamp(w.x, 0, field.w), clamp(w.y, 0, field.h));
  }
  function onWheel(e) {
    if (e.cancelable) e.preventDefault();
    const f = e.deltaY < 0 ? 1.12 : 0.89;
    cam.zoom = clamp(cam.zoom * f, 0.5, 4);
  }

  if (opts && opts.mount) { /* no-op */ }
  const reg = [];
  function on(ev, fn, o) { canvas.addEventListener(ev, fn, o); reg.push([ev, fn, o]); }
  on('pointerdown', onDown, { passive: false });
  on('pointermove', onMoveEvt, { passive: false });
  on('pointerup', onUp, { passive: false });
  on('pointercancel', () => { drag.active = false; drag.box = null; });
  on('wheel', onWheel, { passive: false });
  // touch fallback for browsers without pointer events
  on('touchstart', onDown, { passive: false });
  on('touchmove', onMoveEvt, { passive: false });
  on('touchend', onUp, { passive: false });

  backend.dispose = () => { for (const [ev, fn, o] of reg) { try { canvas.removeEventListener(ev, fn, o); } catch (_) {} } };
  backend._test = { onDown, onUp, screenToWorld, worldToScreen, unitAt };

  return backend;
}

// terrain -> tint (css string for 2D)
function terrainTint(terrain) {
  const map = {
    plains: '#2b3a22', forest: '#1d2e1c', mountain: '#3a3530',
    desert: '#4a3f24', swamp: '#22302a', snow: '#2c3540', water: '#16283a',
  };
  const key = (terrain && (terrain.type || terrain.id || terrain)) || 'plains';
  return map[key] || '#26301f';
}
// terrain -> tint (hex for 3D)
function terrainHex(terrain) {
  const css = terrainTint(terrain);
  return parseInt(css.slice(1), 16);
}

// ----------------------------------------------------------------------------
// 3D BACKEND (Three.js). All THREE usage lives here behind a dynamic import so
// the module still parses under `node --check`. Returns null on ANY failure.
// ----------------------------------------------------------------------------
async function create3DBackend(canvas, opts, field, state, RTS) {
  // Probe WebGL first — cheapest gate.
  let gl = null;
  try {
    gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  } catch (_) { gl = null; }
  if (!gl) return null;

  // Dynamically import Three.js + the GLTFLoader (page import map resolves 'three').
  let THREE, GLTFLoader;
  try {
    THREE = await import('three');
    ({ GLTFLoader } = await import('./vendor/GLTFLoader.js'));
  } catch (_) {
    return null;
  }
  if (!THREE || !GLTFLoader) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setSize(canvas.width, canvas.height, false);
    if (renderer.outputColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace;
  } catch (_) { return null; }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060a);

  // Ground plane, terrain-tinted.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(field.w * 1.4, field.h * 1.4),
    new THREE.MeshStandardMaterial({ color: terrainHex(opts.terrain), roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(field.w / 2, 0, field.h / 2);
  scene.add(ground);
  // subtle field border
  const grid = new THREE.GridHelper(Math.max(field.w, field.h), 20, 0x223044, 0x1a2433);
  grid.position.set(field.w / 2, 0.02, field.h / 2);
  scene.add(grid);

  // Lights.
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x202028, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(field.w * 0.6, field.h, field.h * 0.4);
  scene.add(dir);

  // Camera: angled RTS view, drag-pan + wheel/pinch zoom (clamped).
  const camera = new THREE.PerspectiveCamera(50, canvas.width / canvas.height, 0.1, 2000);
  const camTarget = new THREE.Vector3(field.w / 2, 0, field.h / 2);
  const camCtl = { dist: Math.max(field.w, field.h) * 0.9, yaw: 0, pitch: 0.95, minDist: 20, maxDist: Math.max(field.w, field.h) * 1.8 };
  function updateCamera() {
    const d = camCtl.dist;
    const cx = camTarget.x + Math.sin(camCtl.yaw) * d * Math.cos(camCtl.pitch);
    const cy = Math.sin(camCtl.pitch) * d;
    const cz = camTarget.z + Math.cos(camCtl.yaw) * d * Math.cos(camCtl.pitch);
    camera.position.set(cx, cy, cz);
    camera.lookAt(camTarget);
  }
  updateCamera();

  // ----- model cache + loader -----
  const loader = new GLTFLoader();
  const modelCache = new Map();   // key -> Promise<{scene, animations}>
  function baseUrl() {
    const a = opts.assets;
    if (a && typeof a.modelBase === 'string') return a.modelBase;
    return 'assets/models/';
  }
  function loadModel(key) {
    if (modelCache.has(key)) return modelCache.get(key);
    const url = baseUrl() + key + '.glb';
    const p = new Promise((res) => {
      loader.load(url, (gltf) => res(gltf), undefined, () => res(null));
    });
    modelCache.set(key, p);
    return p;
  }
  // SkeletonUtils-style deep clone fallback: scene.clone(true) preserves the
  // hierarchy; skinned meshes still animate off a fresh mixer in practice for
  // these generated idle clips.
  function cloneScene(src) {
    try { return src.clone(true); } catch (_) { return src.clone(); }
  }

  // Primitive (team-tinted) fallback mesh so a missing GLB never breaks.
  function primitiveFor(team) {
    const c = TEAM_COLOR[team] || TEAM_COLOR.attacker;
    let geo;
    try { geo = new THREE.CapsuleGeometry(0.7, 1.4, 4, 8); }
    catch (_) { geo = new THREE.BoxGeometry(1.2, 2.4, 1.2); }
    const mat = new THREE.MeshStandardMaterial({ color: c.hex, emissive: c.emissive, emissiveIntensity: 0.5, roughness: 0.7 });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = 1.4;
    const wrap = new THREE.Group();
    wrap.add(m);
    return wrap;
  }

  // Team-color ground ring per unit.
  function teamRing(team) {
    const c = TEAM_COLOR[team] || TEAM_COLOR.attacker;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.25, 24),
      new THREE.MeshBasicMaterial({ color: c.hex, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    return ring;
  }

  // Billboarded HP bar (sprite-like quad).
  function hpBar() {
    const grp = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.28),
      new THREE.MeshBasicMaterial({ color: 0x101418 }));
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.2),
      new THREE.MeshBasicMaterial({ color: 0x7ad27a }));
    fg.position.z = 0.01;
    grp.add(bg); grp.add(fg);
    grp.position.y = 3.4;
    grp.userData.fg = fg;
    return grp;
  }

  // Per-unit visual records.
  const visuals = new Map(); // unitId -> { group, mixer, ring, hp, mesh, lunge, fading }
  const clock = new THREE.Clock();
  let selectedSet = new Set();

  function allUnits() {
    let u = [];
    try { u = (RTS.unitsByTeam(state, 'attacker') || []).concat(RTS.unitsByTeam(state, 'defender') || []); }
    catch (_) { u = []; }
    return u;
  }

  // Build a visual lazily (async model load) — show a primitive immediately,
  // then swap in the GLB when it resolves.
  function ensureVisual(u) {
    if (visuals.has(u.id)) return visuals.get(u.id);
    const group = new THREE.Group();
    group.position.set(u.x, 0, u.y);
    const ring = teamRing(u.team);
    group.add(ring);
    const hp = hpBar();
    group.add(hp);
    // immediate primitive
    let meshHolder = primitiveFor(u.team);
    group.add(meshHolder);
    const rec = { group, ring, hp, mesh: meshHolder, mixer: null, lunge: 0, fading: 0, scaleY: 1 };
    visuals.set(u.id, rec);
    scene.add(group);

    // async swap to GLB
    loadModel(modelKeyFor(u.unitId)).then((gltf) => {
      if (!gltf || !gltf.scene || rec.disposed) return;
      const inst = cloneScene(gltf.scene);
      // scale to a sensible height (~2.4 units)
      try {
        const box = new THREE.Box3().setFromObject(inst);
        const h = Math.max(0.001, box.max.y - box.min.y);
        const s = 2.4 / h;
        inst.scale.setScalar(s);
        inst.position.y = -box.min.y * s;
      } catch (_) {}
      // tint by team via emissive on standard materials
      const c = TEAM_COLOR[u.team] || TEAM_COLOR.attacker;
      inst.traverse((o) => {
        if (o.isMesh && o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (m && m.emissive) { try { m.emissive.setHex(c.emissive); m.emissiveIntensity = 0.45; } catch (_) {} }
          }
        }
      });
      group.remove(rec.mesh);
      group.add(inst);
      rec.mesh = inst;
      if (gltf.animations && gltf.animations.length) {
        try {
          rec.mixer = new THREE.AnimationMixer(inst);
          rec.mixer.clipAction(gltf.animations[0]).play();
        } catch (_) { rec.mixer = null; }
      }
    }).catch(() => {});
    return rec;
  }

  const backend = { onSelect: null, onMove: null, onAttack: null };
  backend.setSelected = (set) => { selectedSet = set; };

  backend.render = (dtMs) => {
    if (renderer.domElement && (renderer.domElement.width !== canvas.width || renderer.domElement.height !== canvas.height)) {
      renderer.setSize(canvas.width, canvas.height, false);
      camera.aspect = canvas.width / canvas.height;
      camera.updateProjectionMatrix();
    }
    const delta = clock.getDelta();
    const units = allUnits();
    const live = new Set();
    for (const u of units) {
      live.add(u.id);
      const rec = ensureVisual(u);
      // position / facing (sim x,y -> world x,z; smooth-follow)
      rec.group.position.x += (u.x - rec.group.position.x) * 0.4;
      rec.group.position.z += (u.y - rec.group.position.z) * 0.4;
      if (typeof u.facing === 'number') rec.group.rotation.y = -u.facing + Math.PI / 2;
      // attack lunge
      if (u.state === 'attack') rec.lunge = Math.min(1, rec.lunge + delta * 6);
      else rec.lunge = Math.max(0, rec.lunge - delta * 4);
      if (rec.mesh) rec.mesh.position.z = Math.sin(rec.lunge * Math.PI) * 0.5;
      // dead: sink + fade
      const dead = u.state === 'dead' || u.hp <= 0;
      if (dead) {
        rec.fading = Math.min(1, rec.fading + delta * 1.5);
        rec.group.position.y = -rec.fading * 1.5;
        rec.group.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.opacity = 1 - rec.fading; } });
      }
      // HP bar
      const frac = clamp(u.hp / (u.maxHp || u.hp || 1), 0, 1);
      if (rec.hp && rec.hp.userData.fg) {
        rec.hp.userData.fg.scale.x = Math.max(0.001, frac);
        rec.hp.userData.fg.position.x = -(1 - frac) * 0.95;
        rec.hp.userData.fg.material.color.setHex(frac > 0.5 ? 0x7ad27a : frac > 0.25 ? 0xe8c14a : 0xe85a5a);
        rec.hp.visible = !dead;
        rec.hp.quaternion.copy(camera.quaternion); // billboard
      }
      // selection ring color
      if (rec.ring) rec.ring.material.opacity = (selectedSet && selectedSet.has(u.id)) ? 1 : 0.5;
      // mixer
      if (rec.mixer) { try { rec.mixer.update(delta); } catch (_) {} }
    }
    // remove visuals for vanished units (none expected — sim keeps dead units)
    try { renderer.render(scene, camera); } catch (_) {}
  };

  // ----- input: raycast select, drag pan/box, wheel/pinch zoom -----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function evtPos(e) {
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: canvas.width, height: canvas.height };
    const cx = (e.touches && e.touches[0]) ? e.touches[0].clientX : (e.clientX != null ? e.clientX : 0);
    const cy = (e.touches && e.touches[0]) ? e.touches[0].clientY : (e.clientY != null ? e.clientY : 0);
    return { px: cx - rect.left, py: cy - rect.top, rw: rect.width || canvas.width, rh: rect.height || canvas.height };
  }
  function setNdc(px, py, rw, rh) { ndc.x = (px / rw) * 2 - 1; ndc.y = -(py / rh) * 2 + 1; }

  // pick the nearest unit of a team under the cursor (by screen distance of group origin)
  function pickUnit(px, py, rw, rh, team) {
    let best = null, bestD = Infinity;
    const v = new THREE.Vector3();
    for (const u of allUnits()) {
      if (u.team !== team) continue;
      if (u.state === 'dead' || u.hp <= 0) continue;
      v.set(u.x, 1, u.y).project(camera);
      const sx = (v.x * 0.5 + 0.5) * rw, sy = (-v.y * 0.5 + 0.5) * rh;
      const d = (sx - px) * (sx - px) + (sy - py) * (sy - py);
      if (d < bestD) { bestD = d; best = u; }
    }
    // accept within ~40px
    return (best && bestD < 40 * 40) ? best : null;
  }
  function groundPoint(px, py, rw, rh) {
    setNdc(px, py, rw, rh);
    raycaster.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, hit)) return { x: hit.x, y: hit.z };
    return null;
  }

  const drag = { active: false, moved: false, sx0: 0, sy0: 0, lastX: 0, lastY: 0, box: null };
  let pinchDist = 0;

  function onDown(e) {
    if (e.cancelable) e.preventDefault();
    if (e.touches && e.touches.length === 2) {
      pinchDist = touchDist(e); return;
    }
    const { px, py } = evtPos(e);
    drag.active = true; drag.moved = false; drag.sx0 = px; drag.sy0 = py; drag.lastX = px; drag.lastY = py;
  }
  function onMoveEvt(e) {
    if (e.touches && e.touches.length === 2) {
      const d = touchDist(e);
      if (pinchDist) camCtl.dist = clamp(camCtl.dist * (pinchDist / d), camCtl.minDist, camCtl.maxDist);
      pinchDist = d; updateCamera(); return;
    }
    if (!drag.active) return;
    if (e.cancelable) e.preventDefault();
    const { px, py } = evtPos(e);
    if (Math.abs(px - drag.sx0) + Math.abs(py - drag.sy0) > 8) drag.moved = true;
    // pan the camera target along ground
    const dx = px - drag.lastX, dy = py - drag.lastY;
    drag.lastX = px; drag.lastY = py;
    const panScale = camCtl.dist * 0.0016;
    camTarget.x = clamp(camTarget.x - (dx * Math.cos(camCtl.yaw) + dy * Math.sin(camCtl.yaw)) * panScale, -field.w, field.w * 2);
    camTarget.z = clamp(camTarget.z - (dy * Math.cos(camCtl.yaw) - dx * Math.sin(camCtl.yaw)) * panScale, -field.h, field.h * 2);
    updateCamera();
  }
  function onUp(e) {
    if (!drag.active) { pinchDist = 0; return; }
    if (e.cancelable) e.preventDefault();
    const { px, py, rw, rh } = lastEvtRect(e);
    const wasDrag = drag.moved;
    drag.active = false; pinchDist = 0;
    if (wasDrag) return; // drag = camera pan, not a command (box-select via long-press omitted for simplicity in 3D; pan is primary)
    // tap: friendly select -> enemy attack -> ground move
    const fr = pickUnit(px, py, rw, rh, 'attacker');
    if (fr) { if (backend.onSelect) backend.onSelect([fr.id], !!(e.shiftKey)); return; }
    const en = pickUnit(px, py, rw, rh, 'defender');
    if (en) { if (backend.onAttack) backend.onAttack(en.id); return; }
    const g = groundPoint(px, py, rw, rh);
    if (g && backend.onMove) backend.onMove(clamp(g.x, 0, field.w), clamp(g.y, 0, field.h));
  }
  function lastEvtRect(e) {
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: canvas.width, height: canvas.height };
    const cx = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientX : (e.clientX != null ? e.clientX : drag.lastX);
    const cy = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : (e.clientY != null ? e.clientY : drag.lastY);
    return { px: cx - rect.left, py: cy - rect.top, rw: rect.width || canvas.width, rh: rect.height || canvas.height };
  }
  function touchDist(e) {
    const a = e.touches[0], b = e.touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
  function onWheel(e) {
    if (e.cancelable) e.preventDefault();
    const f = e.deltaY < 0 ? 0.9 : 1.11;
    camCtl.dist = clamp(camCtl.dist * f, camCtl.minDist, camCtl.maxDist);
    updateCamera();
  }

  const reg = [];
  function on(ev, fn, o) { canvas.addEventListener(ev, fn, o); reg.push([ev, fn, o]); }
  on('pointerdown', onDown, { passive: false });
  on('pointermove', onMoveEvt, { passive: false });
  on('pointerup', onUp, { passive: false });
  on('pointercancel', () => { drag.active = false; pinchDist = 0; });
  on('wheel', onWheel, { passive: false });
  on('touchstart', onDown, { passive: false });
  on('touchmove', onMoveEvt, { passive: false });
  on('touchend', onUp, { passive: false });

  backend.dispose = () => {
    for (const [ev, fn, o] of reg) { try { canvas.removeEventListener(ev, fn, o); } catch (_) {} }
    try { for (const rec of visuals.values()) { rec.disposed = true; } } catch (_) {}
    try { renderer.dispose(); } catch (_) {}
    try {
      scene.traverse((o) => {
        if (o.geometry) try { o.geometry.dispose(); } catch (_) {}
        if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach(x => { try { x.dispose(); } catch (_) {} }); }
      });
    } catch (_) {}
  };

  return backend;
}
