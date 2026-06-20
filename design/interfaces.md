# Interface Contracts — Lineage II: Thrones of Aden

**This file is law.** Every branch-agent builds against these exact signatures, shapes,
and file paths so the modules integrate without changes. Do not rename exports, fields,
or asset files. All modules are native ES modules with **relative** imports (`./x.js`).
Default language is `ru`. Determinism: all randomness goes through `src/rng.js`.

Repo root == Higgsfield deploy bundle root. The zip ships: `logic.js`, `index.html`,
`src/**`, `assets/**`. `design/**`, `README.md`, `LICENSE` are repo-only (not zipped).

---

## A. `src/rng.js`  (owner: core-engine)
```js
export function makeRng(seed)        // -> function rng(): float in [0,1)  (mulberry32)
export function randInt(rng, a, b)   // inclusive integer in [a,b]
export function pick(rng, arr)       // random element
export function shuffle(rng, arr)    // returns a new shuffled array (pure)
```

## B. `src/data/units.js`  (owner: content-lore)
```js
// type: 'inf' | 'arch' | 'cav' | 'mag' | 'heal' | 'undead'
export const UNIT_TYPES = ['inf','arch','cav','mag','heal','undead'];
export const UNITS = {
  knight:    { id:'knight',    nameKey:'unit.knight',    type:'inf',    cost:120, upkeep:8,  hp:60, atk:14, def:18, factions:['human','elf'] },
  gladiator: { id:'gladiator', nameKey:'unit.gladiator', type:'inf',    cost:100, upkeep:7,  hp:48, atk:20, def:9,  factions:['human','orc'] },
  ranger:    { id:'ranger',    nameKey:'unit.ranger',    type:'arch',   cost:110, upkeep:8,  hp:36, atk:22, def:6,  factions:['human','elf'] },
  sorcerer:  { id:'sorcerer',  nameKey:'unit.sorcerer',  type:'mag',    cost:160, upkeep:12, hp:30, atk:30, def:4,  factions:['human','elf'] },
  bishop:    { id:'bishop',    nameKey:'unit.bishop',    type:'heal',   cost:150, upkeep:11, hp:34, atk:6,  def:8,  factions:['human','elf'] },
  destroyer: { id:'destroyer', nameKey:'unit.destroyer', type:'cav',    cost:140, upkeep:10, hp:75, atk:24, def:12, factions:['orc'] },
  // Shilen (AI-only):
  wraith:    { id:'wraith',    nameKey:'unit.wraith',    type:'undead', cost:0,   upkeep:0,  hp:44, atk:18, def:10, factions:['shilen'] },
  bonearcher:{ id:'bonearcher',nameKey:'unit.bonearcher',type:'arch',   cost:0,   upkeep:0,  hp:30, atk:20, def:5,  factions:['shilen'] },
  necromancer:{id:'necromancer',nameKey:'unit.necromancer',type:'mag',  cost:0,   upkeep:0,  hp:34, atk:28, def:6,  factions:['shilen'] },
};
// Render maps each unit -> a token sprite via UNITS[id].sprite (set in render layer):
// inf/cav human-ish -> unit_knight, gladiator/destroyer melee -> unit_orc only for orc, etc.
// Provide a SPRITE_FOR map: export const SPRITE_FOR = { knight:'unit_knight', gladiator:'unit_knight', ranger:'unit_ranger', sorcerer:'unit_mage', bishop:'unit_mage', destroyer:'unit_orc', wraith:'unit_undead', bonearcher:'unit_undead', necromancer:'unit_undead' };
// Non-transitive counter multipliers applied in combat (atk multiplier of A vs B):
export const COUNTER = { /* [attackerType][defenderType] -> number, ~0.8..1.4 */ };
```
Balance numbers are tunable data; keep sources+sinks sane (§9). Tune later, but ship sensible defaults.

## C. `src/data/factions.js`  (owner: content-lore)
```js
export const FACTIONS = {
  human:  { id:'human',  nameKey:'fac.human',  color:'#3b6fd4', accent:'#e8c45a', playable:true,  capital:'aden',        incomeMul:1.15, roster:['knight','gladiator','ranger','sorcerer','bishop'] },
  elf:    { id:'elf',    nameKey:'fac.elf',    color:'#2fa37a', accent:'#d8e8b0', playable:true,  capital:'oren',        rangedBonus:1.15, roster:['knight','ranger','sorcerer','bishop'] },
  orc:    { id:'orc',    nameKey:'fac.orc',    color:'#b5532a', accent:'#e0a04a', playable:true,  capital:'schuttgart',  meleeBonus:1.2, costMul:0.85, roster:['gladiator','destroyer','ranger'] },
  shilen: { id:'shilen', nameKey:'fac.shilen', color:'#7d3fb0', accent:'#bfe0c0', playable:false, capital:null,         roster:['wraith','bonearcher','necromancer'] },
};
export const PLAYABLE = ['human','elf','orc'];
```
`color` = ownership tint on the map; `accent` = secondary UI color. Keep crest order in
`crest_factions.png` = Aden(human) topleft, Elf topright, Orc bottomleft, Shilen bottomright.

## D. `src/data/map.js`  (owner: content-lore)
```js
// x,y normalized 0..1 (responsive). terrain: 'plains'|'forest'|'mountain'|'swamp'|'coast'
// Provinces of Aden. castle:true on the three crowns + regional holds.
export const PROVINCES = [
  { id:'gludio', nameKey:'prov.gludio', x:0.20, y:0.62, terrain:'plains',  castle:true,  neighbors:['dion','giran'] },
  // ... ~14 total, fully connected graph, 3 crown castles: gludio, giran, aden
];
export const START_OWNER = { /* provinceId: factionId at game start; rest 'neutral' or 'shilen' */ };
export const NEUTRAL = 'neutral';
```
Adjacency must be **symmetric** (if A lists B, B lists A). Map must be one connected graph.

## E. `src/engine.js`  (owner: core-engine)  — imports data + rng + combat
```js
export function createGame({ playerFaction, seed }) // -> State
// State (plain serializable object):
// { seed, rngState, turn, phase:'play'|'over', activeFaction, playerFaction,
//   factions: { [id]: { id, adena, alive } },
//   provinces: { [id]: { id, owner, garrison: { [unitId]: count }, fortified:bool } },
//   selected: provinceId|null, log: [ {turn, key, params} ], result: null|{winner} }
export function income(state)                          // -> state (adds Adena; pure-ish, returns new state)
export function canRecruit(state, provId, unitId)      // -> { ok:boolean, reason?:stringKey }
export function recruit(state, provId, unitId, n=1)    // -> state
export function legalMoves(state, provId)              // -> provinceId[]  (adjacent move/attack targets)
export function moveArmy(state, fromId, toId, units)   // units={unitId:count}; if enemy/neutral target -> battle. -> { state, battle?:BattleResult }
export function fortify(state, provId)                 // -> state (defensive bonus, costs Adena)
export function endTurn(state)                          // -> state (runs AI for all non-player factions via ai.js, applies Shilen incursions, income, victory check)
export function checkVictory(state)                    // -> null | { winner: factionId }
export function viewModel(state)                        // -> data the UI/render need (selected info, resource totals, current goal hint)
```
Engine is **pure logic, no DOM, no rendering, no asset access**. Every mutation returns a
new/updated State. RNG only via rng.js, seeded from state. Each significant action pushes a
`log` entry `{turn, key, params}` where `key` is a strings key (UI localizes it).

## F. `src/combat.js`  (owner: core-engine)
```js
export function resolveBattle({ attacker, defender, terrain, defenderFortified, rng })
// attacker/defender = { faction, garrison:{unitId:count} }
// -> { winner:'attacker'|'defender', attackerLosses:{unitId:count}, defenderLosses:{...}, rounds:[...], log:[{key,params}] }
```
Uses UNITS stats + COUNTER triangle + terrain + fortify + numbers; seeded rng; deterministic.

## G. `src/ai.js`  (owner: core-engine)
```js
export function takeFactionTurn(state, factionId)  // -> state  (recruit/move/attack heuristics)
export function shilenIncursion(state)             // -> state  (spawn undead stacks, attack nearest holdings; scales with turn)
```

## H. `src/strings.js`  (owner: content-lore)
```js
export const STR = { ru: { 'app.title':'Lineage II: Троны Адена', ... }, en: { ... } };
export let LANG = 'ru';
export function setLang(l){ LANG = l; }
export function t(key, params){ /* lookup STR[LANG][key], interpolate {params} */ }
```
Every player-visible string lives here (UI labels, unit/faction/province names from nameKeys,
log message templates keyed by combat/engine `log[].key`, tutorial hints). Provide RU + EN.

## I. `src/render.js`  (owner: client-ui)  — imports data, strings; reads engine viewModel
```js
export class Renderer {
  constructor(canvas){...}
  async loadAssets();                       // loads everything in assets/ (see paths below)
  layout(width,height);                     // recompute province pixel positions from normalized x,y
  draw(ctx, state, camera, hoverId);        // top-down map: terrain fills, province borders by owner color,
                                            // connections, castle icons, army tokens (count + sprite), selection ring
}
```
Owner color comes from `FACTIONS[owner].color`; neutral = grey. Army token sprite via
`SPRITE_FOR[unitId]`. Background = `bg_parchment.png`. Uses STYLE FORMULA for any
**procedurally drawn** art (borders, glows) too — match the palette.

## J. `src/ui.js` + `src/main.js`  (owner: client-ui)
- `main.js` = the build-game.md §3 fixed-timestep skeleton, adapted: pointer/touch + keyboard,
  responsive canvas (DPR cap 1.5), pause on blur, `?dev=1` overlay.
- `ui.js`: hit-testing provinces from pointer, selection flow (select own province → tap adjacent
  to move/attack, or open recruit/fortify panel), top resource bar (Adena, turn, faction),
  bottom action panel, end-turn button, battle-result modal, win/lose screen, lang toggle, audio toggle.
- Input → **command objects** `{type:'select'|'move'|'recruit'|'fortify'|'endTurn'|..., ...}` applied via engine fns.
- Touch-first; also mouse + physical-key bindings (Space=end turn, Esc=deselect). No hover-only actions.

## K. Asset paths (owner: assets-visual + assets-audio) — exact filenames
```
assets/bg_parchment.png   assets/tile_terrain.png   assets/icon_castle.png
assets/unit_knight.png  assets/unit_ranger.png  assets/unit_mage.png
assets/unit_orc.png     assets/unit_undead.png  assets/crest_factions.png
assets/audio/theme.mp3  assets/audio/sfx_select.mp3  assets/audio/sfx_battle.mp3  assets/audio/sfx_victory.mp3
```
Sprites/icons keyed to transparent PNG (key-color removed per stylization §5). Background opaque.

## L. `logic.js` (repo root) — required stub for solo deploy (owner: core-engine)
Exactly the build-game.md §1 solo stub (`meta/setup/validateAction/applyAction/isGameOver/viewFor`).

## M. `index.html` (repo root) — owner: client-ui
From build-game.md §3 skeleton: viewport meta, canvas#c, dev div, `<script type="module" src="./src/main.js">`,
dark background, mobile-safe (no overflow, no user-scalable zoom fighting the game).
