// Lineage II: Thrones of Aden — client entry point (owner: client-ui)
// Fixed-timestep loop + responsive canvas + input -> command objects (contract J/M).
// Consumes engine.js, data/*, strings.js against the interface contract.

import { Renderer } from './render.js';
import { UI } from './ui.js';

// ---- Resilient module loading (engine/data/strings live on other branches) ----
// We import them dynamically so a missing module during isolated development
// degrades gracefully instead of crashing the page at parse time.
let engine = null, strings = null;
let dataReady = false;

async function loadModules() {
  try {
    engine = await import('./engine.js');
  } catch (e) {
    console.warn('[main] engine.js not available yet:', e.message);
  }
  try {
    strings = await import('./strings.js');
  } catch (e) {
    console.warn('[main] strings.js not available yet:', e.message);
  }
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
window.addEventListener('focus', () => { running = true; lastTime = performance.now(); acc = 0; });
document.addEventListener('visibilitychange', () => {
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
    // Only pan the world when not interacting with HUD and a world point is grabbed.
    if (!ui || !ui.isModal()) {
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
    case 'Escape':  ui.dispatch({ type: 'deselect' }); break;
    case 'KeyM':    ui.dispatch({ type: 'toggleAudio' }); break;
    case 'KeyL':    ui.dispatch({ type: 'toggleLang' }); break;
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
  if (needsRedraw || (ui && ui.animating())) {
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
  renderer = new Renderer(canvas);
  ui = new UI({
    renderer,
    engine,
    strings,
    camera,
    requestRedraw: () => { needsRedraw = true; },
    centerOn: (worldX, worldY) => { centerCamera(worldX, worldY); },
  });
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
