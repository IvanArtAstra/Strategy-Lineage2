// Lineage II: Thrones of Aden — client entry point (owner: client-ui)
// Fixed-timestep loop + responsive canvas + input -> command objects (contract J/M).
// Consumes engine.js, data/*, strings.js against the interface contract.

import { Renderer } from './render.js';
import { UI } from './ui.js';

// ---- Resilient module loading (engine/data/strings live on other branches) ----
// We import them dynamically so a missing module during isolated development
// degrades gracefully instead of crashing the page at parse time.
let engine = null, strings = null, battleUi = null;
let eventsMod = null, skillsMod = null;   // event/skill engines (own modules)
let cityMod = null, cityUiMod = null;     // v3: city engine (city.js) + city screen (city_ui.js)
// v4 feature modules (all optional; absent -> the feature button hides, base game intact).
let tdMod = null, tdUiMod = null;         // wave defense: sim (td.js) + screen (td_ui.js)
let siegeMod = null, siegeUiMod = null;   // city sieges: model (siege.js) + screen (siege_ui.js)
let heroesMod = null, heroUiMod = null;   // heroes: engine (heroes.js) + roster screen (hero_ui.js)
let campaignMod = null, campaignUiMod = null; // campaign: logic (campaign.js) + screen (campaign_ui.js)
let dataReady = false;

// Try a side-effect registration import; never let a missing sibling crash boot.
async function tryRegister(path, registerFns) {
  try {
    const mod = await import(path);
    // Call any of the named register* exports if present (engine wires the system).
    for (const fn of registerFns) {
      if (mod && typeof mod[fn] === 'function') {
        // registerEvents/registerSkills are async (they dynamic-import their data
        // and wire into the engine) — AWAIT so registration completes before the
        // first endTurn can fire an event / read skill status.
        try { await mod[fn](engine); } catch (e) { /* registration is best-effort */ }
        break; // one register entry-point per module
      }
    }
    return mod;
  } catch (e) {
    console.warn(`[main] ${path} not available yet:`, e.message);
    return null;
  }
}

async function loadModules() {
  try {
    engine = await import('./engine.js');
    // Side-effect import: ai.js registers itself with the engine (registerAi)
    // so endTurn can drive rival factions + Shilen incursions. Must run once.
    await import('./ai.js');
  } catch (e) {
    console.warn('[main] engine.js not available yet:', e.message);
  }
  try {
    strings = await import('./strings.js');
  } catch (e) {
    console.warn('[main] strings.js not available yet:', e.message);
  }
  // v2 side-effect registrations: events + skills engines. Resilient; if the
  // module is absent the engine simply has no events/skills and the UI hides them.
  eventsMod = await tryRegister('./events.js', ['registerEvents', 'register', 'default']);
  skillsMod = await tryRegister('./skills.js', ['registerSkills', 'register', 'default']);
  // v3 side-effect registration: city engine (city.js). registerCity() wires the
  // per-turn cityTick into endTurn (mirrors registerEvents/registerSkills). The
  // module namespace is kept so its query/mutation fns can be merged onto the
  // engine facade below. Absent module -> no cities, the map plays exactly as v2.
  cityMod = await tryRegister('./city.js', ['registerCity', 'register', 'default']);
  // v2 tactical battle UI module (owns the canvas during a manual battle).
  // tactical.js is its dependency; importing battle_ui.js pulls it in, but we
  // also try a bare import so a standalone tactical.js still registers cleanly.
  try { await import('./tactical.js'); } catch (e) { /* optional dep */ }
  try {
    battleUi = await import('./battle_ui.js');
  } catch (e) {
    console.warn('[main] battle_ui.js not available yet:', e.message);
    battleUi = null;
  }
  // v3 city screen module (owns the canvas while a city is open, like battle_ui).
  // Resilient: absent -> the UI hides the "Enter city" button and the map stays v2.
  try {
    cityUiMod = await import('./city_ui.js');
  } catch (e) {
    console.warn('[main] city_ui.js not available yet:', e.message);
    cityUiMod = null;
  }

  // ---- v4 feature modules (all OPTIONAL; mirror the v2/v3 resilient pattern) ----
  // Heroes engine registers via registerHeroes(engine) (like registerCity) so the
  // engine's planBattle can read hero bonuses; AWAIT it so registration completes
  // before the first battle. Its query/mutation fns are merged onto the facade below.
  heroesMod = await tryRegister('./heroes.js', ['registerHeroes', 'register', 'default']);
  // The sim/model modules (td.js, siege.js) have no register hook — they're consumed
  // by their UIs, but we import them so a missing core degrades the whole feature.
  try { tdMod = await import('./td.js'); } catch (e) { tdMod = null; }
  try { siegeMod = await import('./siege.js'); } catch (e) { siegeMod = null; }
  // campaign.js exposes the list/start/check helpers the map client feeds to the UI.
  try { campaignMod = await import('./campaign.js'); } catch (e) { campaignMod = null; }
  // v4 feature SCREENS (each owns the canvas while open, exactly like battle_ui/city_ui).
  try { tdUiMod = await import('./td_ui.js'); } catch (e) { tdUiMod = null; }
  try { siegeUiMod = await import('./siege_ui.js'); } catch (e) { siegeUiMod = null; }
  try { heroUiMod = await import('./hero_ui.js'); } catch (e) { heroUiMod = null; }
  try { campaignUiMod = await import('./campaign_ui.js'); } catch (e) { campaignUiMod = null; }

  dataReady = true;
}

// ---- Globals ----
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
const devEl = document.getElementById('dev');
const DEV = new URLSearchParams(location.search).has('dev');
if (DEV) devEl.style.display = 'block';

const STEP = 1000 / 60;          // fixed timestep (ms)
const DPR_CAP = 1.5;

let viewW = 0, viewH = 0, dpr = 1;
let running = true;
let battlePaused = false;        // true while the tactical battle owns the canvas/loop
let needsRedraw = true;          // redraw-only-on-change flag (perf)

// Camera: pan + zoom, clamped to map bounds by the renderer.
const camera = { x: 0, y: 0, zoom: 1, minZoom: 0.6, maxZoom: 3 };

let renderer, ui;

// ---- Canvas sizing (responsive, DPR capped) ----
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  viewW = Math.max(1, window.innerWidth);
  viewH = Math.max(1, window.innerHeight);
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  canvas.style.width = viewW + 'px';
  canvas.style.height = viewH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (renderer) renderer.layout(viewW, viewH);
  if (ui) ui.onResize(viewW, viewH);
  needsRedraw = true;
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 60));

// ---- Pause on blur/focus (Higgsfield solo skeleton) ----
window.addEventListener('blur', () => { running = false; });
window.addEventListener('focus', () => {
  if (battlePaused) return;        // battle screen owns the loop; don't resume the map
  running = true; lastTime = performance.now(); acc = 0;
});
document.addEventListener('visibilitychange', () => {
  if (battlePaused) return;        // leave map paused while a tactical battle runs
  running = document.visibilityState === 'visible';
  if (running) { lastTime = performance.now(); acc = 0; }
});

// ---- Input -> command objects -----------------------------------------------
// Pointer handling (touch + mouse unified). Supports tap, drag-pan, pinch/wheel zoom.
const pointers = new Map();
let dragging = false, dragMoved = false;
let lastPan = null;
let pinchPrevDist = 0;
const TAP_SLOP = 8; // px

function pointerPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function onPointerDown(e) {
  canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  const p = pointerPos(e);
  pointers.set(e.pointerId, p);
  // Let UI consume a press on HUD chrome first (buttons/panels).
  if (ui && ui.onPointerDown(p)) { needsRedraw = true; return; }
  if (pointers.size === 1) {
    dragging = true; dragMoved = false;
    lastPan = p;
  } else if (pointers.size === 2) {
    dragging = false;
    pinchPrevDist = pinchDistance();
  }
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId)) return;
  const p = pointerPos(e);
  pointers.set(e.pointerId, p);
  if (ui && ui.onPointerMove(p)) { needsRedraw = true; }
  if (pointers.size >= 2) {
    const d = pinchDistance();
    if (pinchPrevDist > 0) {
      const center = pinchCenter();
      zoomAt(center.x, center.y, d / pinchPrevDist);
    }
    pinchPrevDist = d;
    needsRedraw = true;
    return;
  }
  if (dragging && lastPan) {
    const dx = p.x - lastPan.x, dy = p.y - lastPan.y;
    if (Math.abs(dx) + Math.abs(dy) > TAP_SLOP) dragMoved = true;
    // Faction-select screen: vertical drag scrolls the card grid.
    if (ui && ui.screen === 'start') {
      if (ui.onScroll) { ui.onScroll(-dy); needsRedraw = true; }
    } else if (!ui || !ui.isModal()) {
      // Only pan the world when not interacting with HUD and a world point is grabbed.
      camera.x -= dx / camera.zoom;
      camera.y -= dy / camera.zoom;
      clampCamera();
      needsRedraw = true;
    }
    lastPan = p;
  }
}

function onPointerUp(e) {
  const p = pointers.get(e.pointerId) || pointerPos(e);
  const wasTap = dragging && !dragMoved && pointers.size === 1;
  pointers.delete(e.pointerId);
  canvas.releasePointerCapture && canvas.releasePointerCapture(e.pointerId);
  if (ui && ui.onPointerUp(p)) { needsRedraw = true; resetGesture(); return; }
  if (wasTap) handleTap(p);
  resetGesture();
}

function resetGesture() {
  dragging = pointers.size === 1;
  dragMoved = false;
  lastPan = pointers.size === 1 ? pointers.values().next().value : null;
  pinchPrevDist = pointers.size === 2 ? pinchDistance() : 0;
}

function pinchDistance() {
  const a = [...pointers.values()];
  if (a.length < 2) return 0;
  return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
}
function pinchCenter() {
  const a = [...pointers.values()];
  return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
}

function zoomAt(sx, sy, factor) {
  const before = renderer ? renderer.screenToWorld(sx, sy, camera) : { x: sx, y: sy };
  camera.zoom = clamp(camera.zoom * factor, camera.minZoom, camera.maxZoom);
  if (renderer) {
    const after = renderer.screenToWorld(sx, sy, camera);
    camera.x += before.x - after.x;
    camera.y += before.y - after.y;
  }
  clampCamera();
}

function clampCamera() {
  if (renderer && renderer.clampCamera) renderer.clampCamera(camera, viewW, viewH);
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// A tap dispatches to the UI, which turns it into a command object and applies it.
function handleTap(p) {
  if (!ui) return;
  ui.onTap(p);
  needsRedraw = true;
}

canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  // On the faction-select screen, the wheel scrolls the card grid.
  if (ui && ui.onScroll && ui.onScroll(e.deltaY)) { needsRedraw = true; return; }
  const p = pointerPos(e);
  zoomAt(p.x, p.y, e.deltaY < 0 ? 1.1 : 0.9);
  needsRedraw = true;
}, { passive: false });

// ---- Keyboard (event.code bindings) ----
window.addEventListener('keydown', (e) => {
  if (!ui) return;
  let handled = true;
  switch (e.code) {
    case 'Space':   ui.dispatch({ type: 'endTurn' }); break;
    case 'Escape':
      // Esc backs out of skill target-pick / open panel / event-result first.
      if (ui.skillTarget) ui.dispatch({ type: 'cancelSkill' });
      else if (ui.skillsOpen) ui.dispatch({ type: 'toggleSkills' });
      else ui.dispatch({ type: 'deselect' });
      break;
    case 'KeyM':    ui.dispatch({ type: 'toggleAudio' }); break;
    case 'KeyL':    ui.dispatch({ type: 'toggleLang' }); break;
    case 'KeyK':    ui.dispatch({ type: 'toggleSkills' }); break;  // skills panel
    case 'Enter':
    case 'NumpadEnter':
      // Confirm the active modal: confirm dialog, event continue, or battle close.
      if (ui.modal && ui.modal.kind === 'confirm') ui.dispatch({ type: 'confirmYes' });
      else if (ui.modal && ui.modal.kind === 'event') {
        if (ui.modal.result) ui.dispatch({ type: 'closeEvent' });
        // (event choices need an explicit pick; Enter only advances the result)
        else handled = false;
      }
      else if (ui.modal && ui.modal.kind === 'battle') ui.dispatch({ type: 'closeModal' });
      else handled = false;
      break;
    default: handled = false;
  }
  if (handled) { e.preventDefault(); needsRedraw = true; }
});

// ---- Fixed-timestep loop ----
let lastTime = performance.now();
let acc = 0;
let fps = 0, frames = 0, fpsT = 0;

function update(dt) {
  // dt in ms. Animations (glows, modal transitions) advance here; game logic is
  // event-driven via commands. UI returns true if it wants a redraw this frame.
  if (ui && ui.update(dt)) needsRedraw = true;
}

function render() {
  // While a tactical battle owns the canvas, do not draw the map/HUD over it.
  if (ui && ui.ownsCanvas && ui.ownsCanvas()) return;
  if (renderer && ui) {
    renderer.draw(ctx, ui.getState(), camera, ui.hoverId);
    ui.draw(ctx, viewW, viewH);
  } else {
    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, 0, viewW, viewH);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min(now - lastTime, 250);
  lastTime = now;
  if (running) {
    acc += elapsed;
    let steps = 0;
    while (acc >= STEP && steps < 5) { update(STEP); acc -= STEP; steps++; }
  }
  if (needsRedraw || (ui && ui.animating()) || (renderer && renderer.hasFx && renderer.hasFx())) {
    render();
    needsRedraw = false;
  }
  if (DEV) {
    frames++; fpsT += elapsed;
    if (fpsT >= 500) { fps = Math.round(frames * 1000 / fpsT); frames = 0; fpsT = 0; }
    devEl.textContent =
      `fps ${fps}\nzoom ${camera.zoom.toFixed(2)}\ncam ${camera.x.toFixed(0)},${camera.y.toFixed(0)}` +
      (ui ? `\nsel ${ui.selectedId || '-'}` : '');
  }
}

// ---- Boot ----
async function boot() {
  await loadModules();
  // Combined engine facade: the event/skill gameplay functions live in their own
  // modules (events.js / skills.js), but the UI calls them as engine.* — merge them
  // onto a plain facade so engine.skillStatus / activateSkill / canActivate /
  // resolveEvent resolve. Module namespaces are read-only, hence a fresh object.
  const engineApi = engine ? Object.assign({}, engine) : {};
  if (eventsMod) for (const k of ['maybeFireEvent', 'resolveEvent'])
    if (typeof eventsMod[k] === 'function') engineApi[k] = eventsMod[k];
  if (skillsMod) for (const k of ['skillStatus', 'canActivate', 'activateSkill'])
    if (typeof skillsMod[k] === 'function') engineApi[k] = skillsMod[k];
  // v3: merge the city engine fns onto the same facade so the UI calls them as
  // engine.hasCity / engine.cityView / engine.canBuild / engine.startBuild /
  // engine.ensureCity. If city.js is absent these stay undefined and the UI's
  // typeof-guards hide the "Enter city" button (game degrades to v2).
  if (cityMod) for (const k of ['hasCity', 'cityView', 'canBuild', 'startBuild', 'ensureCity'])
    if (typeof cityMod[k] === 'function') engineApi[k] = cityMod[k];
  // v4: merge the heroes engine fns onto the same facade so the UI / engine can
  // call them as engine.recruitHero / engine.heroBattleBonus / engine.gainHeroXp /
  // engine.heroAt / etc. Absent heroes.js -> these stay undefined and the UI's
  // typeof-guards hide the "Герои" button + the hero pennant + the on-win XP grant.
  const HERO_FNS = ['recruitHero', 'assignHero', 'equipItem', 'grantItem', 'heroAt',
                    'heroBattleBonus', 'gainHeroXp', 'heroesRoster'];
  if (heroesMod) for (const k of HERO_FNS)
    if (typeof heroesMod[k] === 'function') engineApi[k] = heroesMod[k];
  // v4: merge the engine-v4 helpers (siegeInfo, applyReward). These live on
  // engine.js itself (feat/engine-v4); Object.assign already copied them, but we
  // re-assert from the engine namespace for clarity + so a late-bound export wins.
  if (engine) for (const k of ['siegeInfo', 'applyReward'])
    if (typeof engine[k] === 'function') engineApi[k] = engine[k];
  engine = engineApi;
  // Build a stand-alone city api object (the subset openCity expects as `city`),
  // sourced from the merged facade so it tracks whatever city.js actually exports.
  const cityApi = {};
  for (const k of ['hasCity', 'cityView', 'canBuild', 'startBuild', 'ensureCity'])
    if (typeof engine[k] === 'function') cityApi[k] = engine[k];
  const hasCityApi = typeof cityApi.hasCity === 'function';
  const openCity = (cityUiMod && typeof cityUiMod.openCity === 'function')
    ? cityUiMod.openCity : null;

  // ---- v4: stand-alone hero api (the subset openHeroes expects as `heroApi`),
  // sourced from the merged facade so it tracks whatever heroes.js actually exports.
  // The hero_ui mutates state ONLY through these fns.
  const heroApi = {};
  for (const k of HERO_FNS) if (typeof engine[k] === 'function') heroApi[k] = engine[k];
  // The hero screen reads heroApi.HEROES / heroApi.ITEMS for the recruitable list
  // and item metadata; heroes.js doesn't re-export them, so forward the data here.
  try {
    const hd = await import('./data/heroes.js');
    const id = await import('./data/items.js');
    if (hd && hd.HEROES) heroApi.HEROES = hd.HEROES;
    if (id && id.ITEMS) heroApi.ITEMS = id.ITEMS;
  } catch (e) { /* data on another branch / absent -> recruit list just empty */ }
  const hasHeroApi = typeof heroApi.heroBattleBonus === 'function'
                  || typeof heroApi.heroesRoster === 'function'
                  || typeof heroApi.recruitHero === 'function';
  // v4: campaign api (list/start/check/complete) for the campaign screen.
  const campaignApi = {};
  if (campaignMod) for (const k of ['campaignList', 'startScenario', 'checkObjective', 'completeScenario'])
    if (typeof campaignMod[k] === 'function') campaignApi[k] = campaignMod[k];

  // ---- v4: the four feature entry points. Each may be null on an isolated
  // branch; the UI typeof-guards every one so the matching button stays hidden
  // and the base v3 game is fully intact when a feature is absent.
  const openDefense = (tdUiMod && typeof tdUiMod.openDefense === 'function')
    ? tdUiMod.openDefense : null;
  const openSiege = (siegeUiMod && typeof siegeUiMod.openSiege === 'function')
    ? siegeUiMod.openSiege : null;
  const openHeroes = (heroUiMod && typeof heroUiMod.openHeroes === 'function')
    ? heroUiMod.openHeroes : null;
  const openCampaign = (campaignUiMod && typeof campaignUiMod.openCampaign === 'function')
    ? campaignUiMod.openCampaign : null;

  renderer = new Renderer(canvas);
  ui = new UI({
    renderer,
    engine,
    strings,
    camera,
    canvas,
    ctx,
    battleUi,
    // v3 city screen: the city api subset + openCity entry-point. Both may be
    // null/empty on isolated branches; the UI guards every call (typeof) so the
    // "Enter city" button only appears when city.hasCity + openCity both exist.
    cityApi: hasCityApi ? cityApi : null,
    openCity,
    // v4 feature wiring: the four launchers + the hero/campaign apis. All may be
    // null; the UI guards each (typeof) so absent features hide their buttons.
    openDefense,
    openSiege,
    openHeroes,
    openCampaign,
    heroApi: hasHeroApi ? heroApi : null,
    campaignApi: Object.keys(campaignApi).length ? campaignApi : null,
    requestRedraw: () => { needsRedraw = true; },
    centerOn: (worldX, worldY) => { centerCamera(worldX, worldY); },
    // Hand the canvas + loop to the tactical battle screen, then take it back.
    // The SAME pause/resume hooks are reused for the city screen (city_ui owns
    // the canvas exactly like battle_ui).
    pauseLoop: () => { battlePaused = true; running = false; },
    resumeLoop: () => {
      battlePaused = false; running = true;
      lastTime = performance.now(); acc = 0; needsRedraw = true;
      // The battle/city screen drew over our canvas; re-fit our layout on return.
      if (renderer) renderer.layout(viewW, viewH);
    },
  });
  // v3: give the renderer a hasCity predicate so it can draw a city marker on
  // city provinces (data-driven). Guarded; absent -> renderer falls back to its
  // own capital/castle derivation and never crashes.
  if (renderer && typeof renderer.setCityPredicate === 'function') {
    renderer.setCityPredicate(typeof cityApi.hasCity === 'function' ? cityApi.hasCity : null);
  }
  // v4: give the renderer the heroAt predicate so it can draw a hero pennant on
  // provinces with an assigned hero. Guarded; absent -> no pennant, base map intact.
  if (renderer && typeof renderer.setHeroPredicate === 'function') {
    renderer.setHeroPredicate(typeof heroApi.heroAt === 'function' ? heroApi.heroAt : null);
  }
  await renderer.loadAssets();
  await ui.init();
  resize();
  requestAnimationFrame(frame);
}

function centerCamera(wx, wy) {
  camera.x = wx - (viewW / camera.zoom) / 2;
  camera.y = wy - (viewH / camera.zoom) / 2;
  clampCamera();
  needsRedraw = true;
}

boot();
