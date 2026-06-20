# Interface Contracts v5 — Real-time RTS Battle + 3D models

Builds on v1–v4 (all authoritative). Adds a **real-time RTS battle mode** rendered in **3D**
(Three.js + generated GLB character models) with a **2D top-down fallback**. ES modules, relative
imports, RU default + EN via `t()`, determinism for the sim. **Resilient degradation mandatory:**
if Three.js/WebGL/models or any new module is absent, the battle falls back (3D→2D canvas→the
existing tactical/auto battle) and the rest of the game is unchanged.

## File ownership (NO overlaps)
- **RTS-logic `feat/rts-logic`** → `src/rts.js` (NEW) — the real-time battle simulation (pure, headless-testable).
- **RTS-3D `feat/rts-3d`** → `src/rts_ui.js` (NEW) — the battle screen: dual render backend (Three.js/WebGL 3D, else 2D top-down canvas) + input; resolves to the battle outcome.
- **Orchestrator (me)** → Three.js vendoring (`src/vendor/*`), 3D models (`assets/models/*.glb`), the import map in `index.html`, integration edits in `src/ui.js`/`src/main.js`, and strings in `src/strings.js`.

Untouched by agents: everything else.

## Vendored libs + import map (already set up by the orchestrator)
- `src/vendor/three.module.min.js`, `src/vendor/GLTFLoader.js`, `src/vendor/BufferGeometryUtils.js`.
- `index.html` has `<script type="importmap">{"imports":{"three":"./src/vendor/three.module.min.js"}}</script>`.
- In `rts_ui.js`: `import * as THREE from 'three'` and `import { GLTFLoader } from './vendor/GLTFLoader.js'`.
  Wrap these in a dynamic `import()` inside a try/catch so a load failure degrades to the 2D backend.

## 3D models
- `assets/models/<key>.glb` per unit archetype. Keys map from `SPRITE_FOR`-style archetypes:
  `knight, ranger, mage, orc, undead` (orchestrator generates these; more may be added). Each GLB is
  textured + auto-rigged with an **idle** animation clip (name may vary — play `gltf.animations[0]`).
- `rts_ui.js` MODEL_FOR maps a unit id → a model key (reuse the v1 SPRITE_FOR mapping: knight/gladiator→knight,
  ranger/bonearcher→ranger, sorcerer/necromancer→mage, destroyer→orc, wraith→undead, etc.). Unknown →
  nearest archetype or a colored primitive. Always fall back to a colored capsule/box if a GLB is missing.

## 1. RTS SIMULATION — `src/rts.js` (owner: RTS-logic)
```js
export function createRtsBattle({ attacker, defender, terrain, seed, fieldW?, fieldH? });
//  attacker/defender = { faction, garrison:{unitId:count} }. Expands each count into individual UNIT
//  entities placed in formation on opposite sides of a field (default 100x60 logical units).
//  -> RtsState { field:{w,h}, seed, rngState, time, units:[ Unit ], teams:{attacker,defender}, over, winner }
//  Unit = { id, team:'attacker'|'defender', unitId, type, x, y, hp, maxHp, atk, def, range, speed,
//           state:'idle'|'move'|'attack'|'dead', targetId|null, moveTo:{x,y}|null, cd, facing }
//  Stats come from data/units.js (UNITS[unitId]); ranged units (type 'arch'/'mag') get a larger range,
//  melee a short range; keep balance roughly consistent with combat.js outcomes over a full fight.
export function rtsStep(state, dtMs);  // fixed-step advance: each unit acquires the nearest enemy in
//  aggro range, moves toward its moveTo or its target (separation/steering so units don't fully overlap),
//  attacks when in range off cooldown (damage = f(atk, target.def) with the COUNTER triangle), applies
//  deaths; sets state.over + state.winner when one team has no living units (or a time cap is hit).
export function issueCommand(state, unitIds, cmd);
//  cmd = { type:'move', x, y } | { type:'attackMove', x, y } | { type:'attack', targetId } | { type:'stop' }
//  Sets moveTo/target/state on the listed (player-side) units. Returns state.
export function rtsStatus(state);   // -> { over, winner, time, alive:{attacker:n, defender:n}, total:{...} }
export function rtsOutcome(state);  // -> the COMMON battle outcome (winner:'attacker'|'defender',
//  attackerLosses, defenderLosses, attackerSurvivors, defenderSurvivors, rounds:[], log:[{key,params}])
//  computed from starting vs surviving per-unitId counts — IDENTICAL shape to combat.resolveBattle so
//  engine.applyBattleOutcome consumes it unchanged. (winner by last team standing / more survivors on time cap.)
export function unitsByTeam(state, team); // -> Unit[] (for the renderer)
```
Deterministic: fixed timestep, seeded rng from `./rng.js` for any jitter; same seed + same command
stream + same dt sequence → identical state. Pure logic, no DOM, no Three.js. Imports `./data/units.js`,
`./rng.js` (+ COUNTER from units). A safety **time cap** (e.g. 90s sim time) guarantees termination.

## 2. RTS BATTLE SCREEN — `src/rts_ui.js` (owner: RTS-3D)
```js
export async function openRtsBattle(opts); // -> Promise<outcome>  (outcome = rts.js rtsOutcome shape)
// opts = { hostCanvas, attacker, defender, terrain, seed, assets, t, lang, sound, requestRedraw }
```
- Creates its OWN full-window `<canvas>` overlay (absolutely positioned over the page) for rendering —
  do NOT reuse the 2D map canvas's context (a canvas can't be both 2d and webgl). Remove the overlay +
  all listeners on resolve. (hostCanvas is just for sizing reference; you may also accept a `mount` node.)
- **Backend pick:** try to create a WebGL renderer (`import('three')` + a WebGLRenderingContext probe).
  - **3D backend:** Three.js scene — ground plane (terrain-tinted), angled RTS camera (pan with drag,
    zoom with wheel/pinch), one mesh per unit: load `assets/models/<MODEL_FOR[unitId]>.glb` via GLTFLoader
    (cache per key), clone the scene, play `gltf.animations[0]` (idle) on an AnimationMixer; tint/scale
    per team (attacker = player faction color, defender = enemy/necrotic). Procedural attack lunge +
    death fade. HP bars as sprites/billboards. Raycast for click-select; drag = box-select; click ground =
    move command, click enemy = attack command. If `import('three')` throws or WebGL is unavailable → 2D.
  - **2D fallback backend:** a plain 2D canvas top-down view of the SAME sim — units as colored discs
    (team color + a type glyph) with HP arcs, selection ring, move/attack click handling, HUD. This path
    MUST be fully playable (it is what runs where WebGL is unavailable, including the dev/test browser).
- Drive `rts.js`: fixed-timestep `rtsStep`; translate input → `issueCommand` on the player's (attacker)
  units; a "Select all" + "Attack-move" + auto-battle/skip control; a top HUD (your count vs enemy count,
  timer). When `rtsStatus().over`, show a result banner, then resolve `rtsOutcome(state)`.
- Player is the **attacker**; the defender is AI (simple: advance + attack nearest). Localize via opts.t
  (keys `rts.*`; built-in RU/EN fallback). Plays `opts.sound('music_battle')`. Never throw — on any
  failure resolve a deterministic sane outcome (or signal the caller to use the tactical fallback).

## 3. INTEGRATION (orchestrator: `src/ui.js`, `src/main.js`, `src/strings.js`)
- `main.js`: dynamic import `./rts_ui.js`; pass `openRtsBattle` into the UI (like openSiege/openDefense).
- `ui.js`: in the attack flow, for a **field** battle (siegeInfo says not a siege) prefer
  `openRtsBattle({...})` when available → `engine.applyBattleOutcome`; fall back to the v2 tactical
  battle, then `engine.moveArmy`. Add a `rtsBusy` guard mirroring `battleBusy`/`siegeBusy` (pause map
  loop, resume after). Keep everything guarded so absence degrades to v4.
- `strings.js`: add `rts.*` (title, yourArmy, enemy, selectAll, attackMove, auto, victory, defeat, leave, hint).

## 4. Verification
`node --check` all. RTS-logic self-tests headlessly (tools/tmp/, gitignored): expand garrisons → units;
rtsStep advances, units move/acquire/attack/die; a battle terminates (and within the time cap); rtsOutcome
matches the combat.resolveBattle shape and conserves unit counts; determinism (same seed+commands+dt →
identical state); a stronger army reliably wins. RTS-3D: `node --check` (Three.js code won't run in node);
the **2D fallback** must be exercisable in a no-WebGL browser. The orchestrator verifies the 2D backend in
the headless browser (WebGL is unavailable there) and ships the 3D path for the user to confirm visually.
