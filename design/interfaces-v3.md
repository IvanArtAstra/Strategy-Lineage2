# Interface Contracts v3 — Cities, Economy, Balance, Events, Audio

Builds on v1 (`design/interfaces.md`) and v2 (`design/interfaces-v2.md`), both still authoritative
for existing modules. This milestone adds: a **Heroes-of-M&M-style city system** (enter your
cities, construct/upgrade buildings over several turns, produce units, gather resources), a
**multi-resource economy** (Adena + Wood + Crystal), **6-faction balance tuning**, a **lore
event-chain**, and **expanded audio**.

ES modules, relative imports, RU default + EN, every visible string via `t()`, determinism via
`src/rng.js` (rng state in State). **Resilient degradation is mandatory:** if the city system (or
any new module/asset) is absent or throws, the game must still play exactly like v2.

## File ownership (NO overlaps — never edit another agent's file)
- **A `feat/content-v3`** → `src/strings.js`, `src/data/units.js`, `src/data/factions.js` (balance), `src/data/events.js` (event-chain content), `src/data/buildings.js` (NEW)
- **B `feat/city-logic`** → `src/city.js` (NEW)
- **C `feat/engine-core`** → `src/engine.js`, `src/ai.js`, `src/events.js`
- **D `feat/city-client`** → `src/city_ui.js` (NEW)
- **E `feat/map-client`** → `src/ui.js`, `src/render.js`, `src/main.js`
- **Assets + integration** → orchestrator (me)

Untouched: combat.js, tactical.js, battle_ui.js, rng.js, skills.js, data/skills.js, data/map.js, logic.js.

---

## 1. RESOURCES (multi-resource economy)
Three resources: `adena` (existing), `wood` (NEW), `crystal` (NEW). Stored on each faction:
- `state.factions[id].adena` stays as-is. ADD `state.factions[id].wood` and `.crystal` (numbers).
- `createGame` (owner C) seeds every faction: `wood: 20, crystal: 5` (adena unchanged at 300).
- Resource names live in `strings.js` (owner A): `res.adena`='Адена', `res.wood`='Древесина', `res.crystal`='Кристаллы' (+en).

## 2. CITIES — where they are
A province has a city iff it is a **castle** (`province.castle === true`) OR a **faction capital**
(`FACTIONS[*].capital`). That is: gludio, giran, aden, goddard, rune (castles) + hardins, oren,
schuttgart, darkelf, dwarvenvillage, isleofsouls (capitals) = **11 cities**. Computed by the engine
from existing data — no map.js change. Owner C exposes `hasCity(provId)`; owner B may re-derive it.

## 3. BUILDINGS — `src/data/buildings.js` (owner A)
```js
export const RESOURCES = ['adena', 'wood', 'crystal'];
// icon = index into assets/buildings_sheet.png, sliced as a 3x3 grid (0..8).
// Each building has levels[] (index 0 = level 1 ... up to maxLevel). A city stores the
// current built level per buildingId (0 = not built). Effects apply each turn once built.
export const BUILDINGS = [
  { id:'townhall',   nameKey:'bld.townhall',   descKey:'bld.townhall.d',   icon:0, levels:[
      { cost:{adena:0},               buildTurns:0, effect:{ type:'produceRes', res:{adena:30} } }, // L1 free starter
      { cost:{adena:240, wood:15},     buildTurns:3, effect:{ type:'produceRes', res:{adena:75} } },
      { cost:{adena:520, wood:35, crystal:6}, buildTurns:4, effect:{ type:'produceRes', res:{adena:140} } } ] },
  { id:'lumbermill', nameKey:'bld.lumbermill', descKey:'bld.lumbermill.d', icon:1, levels:[
      { cost:{adena:120},              buildTurns:2, effect:{ type:'produceRes', res:{wood:8} } },
      { cost:{adena:240, wood:10},      buildTurns:3, effect:{ type:'produceRes', res:{wood:18} } } ] },
  { id:'crystalmine',nameKey:'bld.crystalmine',descKey:'bld.crystalmine.d',icon:2, levels:[
      { cost:{adena:200, wood:10},      buildTurns:3, effect:{ type:'produceRes', res:{crystal:3} } },
      { cost:{adena:380, wood:25},      buildTurns:4, effect:{ type:'produceRes', res:{crystal:7} } } ] },
  { id:'barracks',   nameKey:'bld.barracks',   descKey:'bld.barracks.d',   icon:3, levels:[
      { cost:{adena:160, wood:12},      buildTurns:2, effect:{ type:'produceUnit', unitType:'inf', perTurns:3, count:1 } },
      { cost:{adena:320, wood:24, crystal:4}, buildTurns:3, effect:{ type:'produceUnit', unitType:'inf', perTurns:2, count:1 } } ] },
  { id:'archery',    nameKey:'bld.archery',    descKey:'bld.archery.d',    icon:4, levels:[
      { cost:{adena:170, wood:14},      buildTurns:2, effect:{ type:'produceUnit', unitType:'arch', perTurns:3, count:1 } } ] },
  { id:'magetower',  nameKey:'bld.magetower',  descKey:'bld.magetower.d',  icon:5, levels:[
      { cost:{adena:240, wood:10, crystal:6}, buildTurns:3, effect:{ type:'produceUnit', unitType:'mag', perTurns:4, count:1 } } ] },
  { id:'walls',      nameKey:'bld.walls',      descKey:'bld.walls.d',      icon:6, levels:[
      { cost:{adena:140, wood:20},      buildTurns:2, effect:{ type:'defense', fortify:true, defBonus:0.15 } },
      { cost:{adena:300, wood:40, crystal:5}, buildTurns:3, effect:{ type:'defense', fortify:true, defBonus:0.30 } } ] },
  { id:'market',     nameKey:'bld.market',     descKey:'bld.market.d',     icon:7, levels:[
      { cost:{adena:150},              buildTurns:2, effect:{ type:'produceRes', res:{adena:25} } } ] },
  { id:'temple',     nameKey:'bld.temple',     descKey:'bld.temple.d',     icon:8, levels:[
      { cost:{adena:220, crystal:5},    buildTurns:3, effect:{ type:'heal', pct:0.15 } } ] },
];
```
Numbers are tunable, but keep the shape EXACT. Effect types (the only ones the city engine
interprets): `produceRes{res:{adena?,wood?,crystal?}}`, `produceUnit{unitType,perTurns,count}`
(engine resolves unitType→the owner faction's roster unit of that type), `defense{fortify,defBonus}`,
`heal{pct}` (heals the province garrison each turn). Provide ru+en for every `bld.*` name/desc.

## 4. CITY ENGINE — `src/city.js` (owner B)
```js
export function registerCity();                       // side-effect: wire cityTick into engine.endTurn (mirror registerAi/registerEvents)
export function hasCity(provId);                      // bool (castle || capital)
export function ensureCity(state, provId);            // lazily create state.cities[provId] = { provId, buildings:{}, queue:[] }; returns it
export function cityView(state, provId);              // -> { provId, owner, buildings:[{id,nameKey,descKey,icon,level,maxLevel, next:{cost,buildTurns,effect}|null, building:bool}], queue:[{id,targetLevel,turnsLeft}], production:{adena,wood,crystal, units:[{unit,perTurns}]}, fortified:bool }
export function canBuild(state, provId, buildingId);  // -> { ok:boolean, reason?:stringKey, cost?, buildTurns? }  (checks ownership, hasCity, next level exists, resources, not already queued)
export function startBuild(state, provId, buildingId);// -> state  (charge cost from owner faction resources, push {buildingId, targetLevel, turnsLeft:buildTurns} to the city's queue; if buildTurns===0 finish immediately)
export function cityTick(state);                       // -> state. Called once per turn by the engine for EVERY city of EVERY faction: advance each city's queue head (turnsLeft--), on completion bump building level; then apply per-turn effects of all built buildings — produceRes (add to owner resources), produceUnit (every perTurns turns add count of the resolved unit to the province garrison), defense (mark province fortified), heal (heal garrison). Deterministic.
```
- `state.cities` is created lazily and is JSON-serializable. Pure logic (no DOM). Uses `state` data
  + `./data/buildings.js` + `./data/units.js` + `./data/factions.js` + `./data/map.js`.
- `produceUnit` resolves `unitType` to a unit id via the province owner's `FACTIONS[owner].roster`
  (first roster unit whose `UNITS[id].type === unitType`); if none, skip.
- A faction pays building costs from its own `adena/wood/crystal`. AI uses the same `startBuild`.
- If `data/buildings.js` is absent, all functions no-op (hasCity false / empty views) so the game degrades.

## 5. ENGINE INTEGRATION — `src/engine.js`, `src/ai.js`, `src/events.js` (owner C)
- `createGame`: seed `wood:20, crystal:5` per faction; init `state.cities = {}`. Give each faction's
  capital a free level-1 townhall (so cities start meaningful) — call into the city api if available, else skip.
- `endTurn`: after income + before victory, call the registered `cityTick(state)` (via a `registerCity`
  hook mirroring `registerAi`). City production lands in faction resources/garrisons each turn.
- Keep `income`, `recruit`, `moveArmy`, `planBattle`, `applyBattleOutcome`, events, skills working as v2.
  Recruiting still costs adena (unchanged); cities ADD economy + free unit growth + defense, they don't
  replace the existing recruit flow.
- `ai.js`: each AI turn, for each AI-owned city, build the cheapest sensible affordable building
  (priority: townhall→resource→barracks→walls) via `startBuild`. AI spends wood/crystal too. Keep the
  v2 opening-truce + Shilen onset. Tune any engine balance consts here if needed (see §7).
- `events.js`: add an event-CHAIN mechanism — support a `setFlag{flag}` effect (via the shared
  `applyEffects` in engine.js) and trigger gates `requiresFlag:'x'` / `forbidsFlag:'x'` (checked in
  maybeFireEvent against `state.flags = {}`). This lets data/events.js define multi-step lore chains.
- Expose (for the client facade) any new gameplay fns the UI needs; resources are read from
  `state.factions[playerFaction].{adena,wood,crystal}`.

## 6. CITY CLIENT — `src/city_ui.js` (owner D)
```js
export async function openCity(opts);   // -> Promise<void> (resolves when the player leaves the city)
// opts = { canvas, ctx, state, provId, city, t, assets, lang, sound, requestRedraw, onChange }
//  - city = the city engine api: { cityView, canBuild, startBuild, hasCity } (passed by main.js).
//  - Render a town screen: assets.bg_city background; a grid of the 9 building slots showing each
//    building's icon (slice assets/buildings_sheet.png as 3x3 by building.icon) + current level
//    (e.g. pips or "Ур.2"); tap a slot -> info panel (name/desc, current effect, NEXT level cost in
//    adena/wood/crystal + buildTurns) -> a Build/Upgrade button calling city.startBuild (guarded by
//    city.canBuild; show the reason if blocked). Show the build QUEUE (icon + turnsLeft) and a
//    resource bar (adena/wood/crystal from state.factions[owner]). A clear "Leave city" / back button
//    resolves the promise. Touch-first + mouse + Esc to leave.
//  - After any successful startBuild, call onChange() so the map HUD refreshes. Localize via opts.t.
//  - Deterministic/pure UI: it only mutates state through the city api. If city/buildings are absent,
//    show a graceful "no city" message and a Leave button (never crash).
```
city_ui owns the canvas while open (like battle_ui). Provide procedural fallbacks if assets missing.

## 7. BALANCE (owner A: data; owner C: engine/ai) — the "verify the 6 factions" track
Tune so each of the 6 factions is winnable with sensible play (no faction trivially strongest or
hopeless). Owner A adjusts `data/units.js` stats/costs and `data/factions.js` bonuses; owner C may
adjust engine income/combat consts + AI aggression. Keep changes data-first and conservative; the
existing headless balance probes (Human/Elf/Orc were ~5-6/6) are the reference — extend the same
sensibility to darkelf/dwarf/kamael. Document final bonuses in the return report.

## 8. EVENT-CHAIN (owner A: content in data/events.js; owner C: flag mechanism)
Add at least one multi-step LORE chain (3+ linked events), e.g. "The Seven Seals" or "Antharas
Rises": step 1 fires, its choice `setFlag`s; step 2 `requiresFlag` of step 1; etc., culminating in a
big payoff/threat. Use ONLY the effect/trigger grammar from v2 §2 plus the new `setFlag` /
`requiresFlag` / `forbidsFlag`. Provide ru+en for all chain text. Keep existing 12 events intact.

## 9. AUDIO (assets by orchestrator; wiring by owners D/E)
New tracks (orchestrator generates, placed under assets/audio/): `music_battle.mp3` (tense battle
loop), `music_victory.mp3` (triumphant), `music_city.mp3` (calm town loop), `music_darkelf.mp3`,
`music_orc.mp3` (faction map themes). Wiring (resilient, all wrapped in try/catch, respect the audio
toggle): owner E plays the faction map theme on the campaign map (by chosen faction; default
`theme.mp3`), switches to `music_battle.mp3` when a tactical battle opens (pass via the battle
`sound` hook) and `music_victory.mp3` on a win screen; owner D plays `music_city.mp3` while a city
screen is open. Missing audio files must never break playback.

## 10. CLIENT-MAP — `src/ui.js`, `src/render.js`, `src/main.js` (owner E)
- **Multi-resource HUD**: top bar shows adena + wood + crystal (icons from `assets/resources_sheet.png`,
  sliced 1x3 in order adena,wood,crystal; procedural fallback if missing).
- **Enter city**: when the player selects an OWNED province with a city (`engine.hasCity` /
  `city.hasCity`), show an "Enter city" button (in the province panel); tapping it pauses the map loop
  and calls `openCity({...})` (from `./city_ui.js`), resuming on return. Mirror the battle pause/resume
  wiring. Draw a small city marker on city provinces in render.js.
- **Engine facade**: in main.js merge the city api (`hasCity, cityView, canBuild, startBuild, ensureCity`
  from `./city.js`) and call `registerCity()` (awaited) alongside events/skills; pass the city api into
  the UI and through to `openCity`. Keep the v2 facade (skills/events) intact.
- **Audio wiring** per §9. Keep all new consumers guarded (`typeof fn==='function'`) so absence degrades.

## 11. Verification (all)
`node --check` every file. Owners B/C self-test headlessly with temp stubs under `tools/tmp/`
(gitignored): build a game, build/upgrade buildings across turns, assert resources accrue, units grow,
queues finish on schedule, determinism (same seed+inputs → identical State), 6 factions run, events +
chain fire, and graceful no-op when data files absent. Commit ONLY your files; never `git add -A`.
Push your branch; return a structured integrator report (signatures, new keys, balance numbers,
deviations).
