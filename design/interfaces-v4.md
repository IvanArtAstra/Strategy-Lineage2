# Interface Contracts v4 — Wave Defense, Sieges, Heroes, Campaign

Builds on v1/v2/v3 (all still authoritative). Adds four self-contained, OPTIONAL features.
ES modules, relative imports, RU default + EN, every visible string via `t()`, determinism via
`src/rng.js` (seeded). **Resilient degradation is mandatory:** if any new module/asset is absent
or throws, the game plays exactly as v3. Each feature "screen" takes over the canvas while open
(mirror `battle_ui.js`/`city_ui.js`): host pauses its loop, feature runs its own loop, cleans up
all listeners + clears canvas before resolving its Promise.

## File ownership (NO overlaps)
- **TD `feat/td`** → `src/td.js`, `src/td_ui.js`, `src/data/towers.js`, `src/data/waves.js` (NEW)
- **Siege `feat/siege`** → `src/siege.js`, `src/siege_ui.js`, `src/data/siege.js` (NEW)
- **Heroes `feat/heroes`** → `src/heroes.js`, `src/hero_ui.js`, `src/data/heroes.js`, `src/data/items.js` (NEW)
- **Campaign `feat/campaign`** → `src/campaign.js`, `src/campaign_ui.js`, `src/data/campaign.js` (NEW)
- **Engine `feat/engine-v4`** → `src/engine.js`, `src/ai.js`
- **Map `feat/map-v4`** → `src/ui.js`, `src/render.js`, `src/main.js`
- **Content `feat/content-v4`** → `src/strings.js` (all new strings)
- **Assets + integration** → orchestrator

Untouched: combat.js, tactical.js, battle_ui.js, city.js, city_ui.js, events.js, skills.js, rng.js,
data/{units,factions,map,buildings,events,skills}.js, logic.js.

Common outcome shape reused below (`combat.resolveBattle`'s return):
`{ winner:'attacker'|'defender', attackerLosses, defenderLosses, attackerSurvivors, defenderSurvivors, rounds, log:[{key,params}] }`.

---

## 1. WAVE DEFENSE (Tower Defense) — `feat/td`
A real-time mini-game: defend a city from waves of Shilen undead by building/upgrading towers.
Launched from an owned **city** province ("Оборона" button). Bonus rewards on victory.

`src/data/towers.js`
```js
export const TOWERS = [
  { id:'arrow',  nameKey:'tower.arrow',  icon:0, cost:40,  levels:[ {damage:8, range:120, fireRate:1.2, upgradeCost:30}, {damage:16,range:140,fireRate:1.4,upgradeCost:60}, {damage:30,range:160,fireRate:1.6,upgradeCost:0} ] },
  { id:'cannon', nameKey:'tower.cannon', icon:1, cost:70,  levels:[ {damage:24,range:90, fireRate:0.6, splash:30, upgradeCost:60}, {damage:46,range:100,fireRate:0.7,splash:40,upgradeCost:0} ] },
  { id:'frost',  nameKey:'tower.frost',  icon:2, cost:60,  levels:[ {damage:6, range:110, fireRate:1.0, slow:0.4, upgradeCost:55}, {damage:12,range:120,fireRate:1.1,slow:0.55,upgradeCost:0} ] },
  { id:'holy',   nameKey:'tower.holy',   icon:3, cost:90,  levels:[ {damage:20,range:130, fireRate:1.0, bonusUndead:1.5, upgradeCost:0} ] },
  { id:'ballista',nameKey:'tower.ballista',icon:4,cost:110, levels:[ {damage:60,range:180, fireRate:0.4, upgradeCost:0} ] },
];
```
`src/data/waves.js`
```js
// Mob types reference sprites in mobs_sheet (1x4: skeleton,ghoul,wraith,bonegolem).
export const MOBS = { skeleton:{nameKey:'mob.skeleton',sprite:0,hp:40,speed:55,bounty:12}, ghoul:{nameKey:'mob.ghoul',sprite:1,hp:75,speed:42,bounty:18}, wraith:{nameKey:'mob.wraith',sprite:2,hp:55,speed:70,bounty:20}, bonegolem:{nameKey:'mob.bonegolem',sprite:3,hp:320,speed:30,bounty:80} };
export const WAVES = [ /* ~8 waves; each: {mobs:[{type,count,gap}], reward?} scaling up, last has a bonegolem boss */ ];
```
`src/td.js` — pure-ish sim (seeded rng; dt-driven):
```js
export function createDefense({ faction, provId, seed, difficulty }); // -> TDState (path waypoints, slots, lives, gold, waveIndex, mobs:[], towers:[])
export function tdStep(td, dtMs);          // advance sim: move mobs along path, towers acquire+fire, apply damage/slow/splash, collect bounty, lose a life per mob reaching the core
export function placeTower(td, slotId, towerId);   // -> {ok,reason?}  spend gold
export function upgradeTower(td, slotId);          // -> {ok,reason?}
export function startNextWave(td);                 // begin spawning the next wave
export function tdStatus(td);                       // -> {wave, totalWaves, lives, gold, building, over, won}
export function tdReward(td);                        // -> {adena,wood,crystal, units?:{unitId:count}} (scales with waves cleared); only meaningful when won
```
Starting gold = a slice of the faction's adena (e.g. 200) or a fixed pool; bounties + a per-wave
stipend fund more towers. Lose when lives hit 0; win when all waves cleared.
`src/td_ui.js`
```js
export async function openDefense(opts); // -> Promise<{result:'win'|'lose'|'quit', wavesCleared, reward}>
// opts = { canvas, ctx, faction, provId, seed, assets, t, lang, sound, requestRedraw }
//  Real-time loop on the canvas: draws td_bg + the path, tower slots, towers (towers_sheet 3x2 by tower.icon),
//  mobs (mobs_sheet 1x4 by mob.sprite) with HP bars, projectiles, a HUD (wave/lives/gold), a build palette
//  (tap a slot -> choose a tower from affordable TOWERS; tap a built tower -> upgrade/sell), a "Start wave"
//  button (and auto-advance), and an end screen showing the reward. Touch + mouse; "Leave" resolves 'quit'.
//  Plays sound 'music_defense' while open. Procedural fallbacks if assets missing. Deterministic core via td.js.
```
The map client applies `reward` to the faction on a win (engine helper, §5).

## 2. CITY SIEGES — `feat/siege`
When the player attacks an **enemy city province whose Walls building level > 0**, run an assault
instead of the open-field tactical battle. Resolves to the common battle `outcome`.

`src/data/siege.js`: `WALL_HP_PER_LEVEL = [0, 300, 650]` (index by Walls level); siege-weapon/bonus
defs (ram, catapult); the standing-wall defender bonus (e.g. defenders ×1.6 while wall integrity>0).
`src/siege.js` — deterministic model:
```js
export function createSiege({ attacker, defender, wallLevel, terrain, seed }); // -> SiegeState (wallHp, rounds, phase)
export function siegeStep(ss, command);   // one round: 'assault-wall' chips wall (siege power), 'assault-troops' fights (defenders buffed while wall stands); returns updated state
export function resolveSiege(ss);          // finish -> the common battle `outcome` (winner/losses/survivors/rounds/log)
```
`src/siege_ui.js`
```js
export async function openSiege(opts);   // -> Promise<outcome>  (same shape as combat.resolveBattle)
// opts = { canvas, ctx, attacker:{faction,garrison}, defender:{faction,garrison}, wallLevel, terrain, seed, t, assets, lang, sound, requestRedraw }
//  Shows siege_bg (castle gate), a WALL INTEGRITY bar, both armies, per-round commands (Batter the
//  walls / Storm the breach / Hold), animated; AUTO to resolve. Returns the outcome the engine applies.
//  Procedural fallback; deterministic; cleans up. Plays 'music_siege'.
```

## 3. HEROES — `feat/heroes`
Recruitable commanders who lead a province's army, level up, learn skills, and equip items.

`src/data/heroes.js`: `HEROES = [{ id, nameKey, faction, portrait(icon into heroes_sheet 3x2), cost, baseAtk, baseDef, skillKeys:[...] }]` (~6, lore names: e.g. a human Knight-Commander, an Orc Warlord, a Dark Elf Shillien Templar…).
`src/data/items.js`: `ITEMS = [{ id, nameKey, icon(into items_sheet 3x3), slot:'weapon'|'armor'|'trinket', atk?,def?,hpPct?, dropWeight }]` (~9).
`src/heroes.js`:
```js
export function registerHeroes();                  // optional engine hook (mirror registerAi) if needed
export function recruitHero(state, heroId, provId);// -> state (charge adena; place hero at province; state.heroes[id]={level:1,xp:0,items:[],provId})
export function assignHero(state, heroId, provId);  // -> state
export function equipItem(state, heroId, itemId);   // -> state (slot-based)
export function grantItem(state, itemId);           // -> state (add to inventory pool)
export function heroAt(state, provId);              // -> hero|null
export function heroBattleBonus(state, provId);     // -> { atkMul, defMul } applied to a province's army in battle (1,1 if none)
export function gainHeroXp(state, provId, amount);  // -> state (level up: thresholds, +stats, maybe unlock skill)
export function heroesRoster(state);                // -> [{id,level,xp,nextXp,provId,stats,items,skills}] for the UI
```
`src/hero_ui.js`: `export async function openHeroes(opts)` — roster + detail screen (portrait, stats,
skills, inventory equip/unequip, recruit, assign-to-province). opts={canvas,ctx,state,engine/heroApi,t,assets,lang,sound,requestRedraw,onChange}. Mutates state only via the hero api. Returns on close.
Engine applies `heroBattleBonus` to a province's side in `planBattle`/combat (§5); `gainHeroXp` on a win.

## 4. CAMPAIGN — `feat/campaign`
A linked sequence of scenarios (constrained skirmishes with objectives + rewards + unlocks).

`src/data/campaign.js`: `CAMPAIGN = [{ id, nameKey, descKey, playerFaction, startOwner:{prov:fac}, enemyFactions:[...], objective:{type:'holdCrowns'|'captureProvince'|'surviveTurns'|'eliminate', target?, turns?}, reward:{adena,wood,crystal}, unlocksNext:true }]` (~5 lore scenarios across Aden).
`src/campaign.js`:
```js
export function campaignList(state);                 // -> [{id,nameKey,descKey,locked,completed}]
export function startScenario(id);                   // -> a createGame config { playerFaction, seed, startOwnerOverride?, objectiveOverride? } (the engine consumes it)
export function checkObjective(state);               // -> { done:bool, won:bool, failed:bool } evaluated against state.campaignObjective
export function completeScenario(state, id);         // -> updates persisted progress (in state.campaign or localStorage), grants reward, unlocks next
```
`src/campaign_ui.js`: `export async function openCampaign(opts)` — scenario list (locked/unlocked/
completed, descriptions, objectives, rewards); selecting one resolves with `{action:'start', config}`
which the map client feeds into `engine.createGame`. opts={canvas,ctx,campaign,t,assets,lang,sound,requestRedraw}.

## 5. ENGINE INTEGRATION — `src/engine.js`, `src/ai.js` (`feat/engine-v4`)
Add, without breaking any v1–v3 export:
- `siegeInfo(state, fromId, toId)` → `{ siege:true, wallLevel }` when the move target is an enemy
  city province with Walls level>0 (uses the registered city api `cityView` to read Walls level),
  else `{ siege:false }`. The client calls this alongside `planBattle` to decide siege vs tactical.
- `applyReward(state, faction, reward)` → state. Adds `reward.{adena,wood,crystal}` to the faction and,
  if `reward.units`, into the faction capital garrison. Used for TD victory + campaign rewards.
- `createGame` accepts an optional `startOwnerOverride` (map of provId→faction) and
  `objective` (stored as `state.campaignObjective`) so campaign scenarios can configure the start;
  defaults reproduce v3 behavior when omitted.
- Battle hooks: in `planBattle`, multiply each side's effective garrison strength by the registered
  hero bonus for that province (`heroBattleBonus`) if a hero api is registered (mirror registerCity);
  expose enough that the outcome reflects heroes. Add `registerHeroes(impl)` if the heroes module
  registers (optional). On a player battle win, the client (or engine) grants hero XP via the hero api.
- `ai.js`: optionally let AI recruit a hero when rich and defend with TD-less auto-resolve (unchanged);
  keep all v2/v3 AI behavior. No hard dependency on the new modules (all guarded).

## 6. MAP CLIENT — `src/ui.js`, `src/render.js`, `src/main.js` (`feat/map-v4`)
- **main.js**: resilient dynamic imports of `./td_ui.js`, `./siege_ui.js`, `./heroes.js`,
  `./hero_ui.js`, `./campaign.js`, `./campaign_ui.js`, `./td.js`, `./siege.js`; merge hero/city/etc
  query fns onto the engine facade; `await` any `register*()`. Load new assets (td_bg, towers_sheet,
  mobs_sheet, heroes_sheet, items_sheet, siege_bg) + audio (music_defense, music_siege). Pass the
  feature entry points + a pause/resume into the UI. Keep ALL v3 wiring intact.
- **ui.js**:
  - Province panel for an owned **city**: add an **"Оборона"** (Defense) button → pause loop →
    `await openDefense({...})` → on `result==='win'` call `engine.applyReward(state, faction, reward)`;
    resume. (Alongside the existing "Войти".)
  - Attack flow: before opening the tactical battle, call `engine.siegeInfo`; if `siege:true` and
    `openSiege` exists → `await openSiege({...})` → `engine.applyBattleOutcome`; else the v2 manual
    battle path. try/catch → fall back to `engine.moveArmy`.
  - A **"Герои"** (Heroes) button (HUD) → `await openHeroes({...})`.
  - Start screen: add a **"Поход"** (Campaign) choice next to faction select → `openCampaign` →
    on `{action:'start', config}` call `engine.createGame(config)` and begin.
  - All new launchers guarded (`typeof === 'function'`); absent feature → button hidden, base game intact.
- **render.js**: optional small hero pennant on provinces that have an assigned hero; keep v3 rendering.

## 7. CONTENT — `src/strings.js` (`feat/content-v4`)
Add ru+en (RU primary, key-identical) for ALL new content/UI keys: `tower.*`, `mob.*`, `td.*` (defense
UI: start wave, lives, gold, build, upgrade, sell, victory, defeat, reward, leave), `siege.*` (wall
integrity, batter, storm, hold), `hero.*` (+ each hero name), `skill.hero.*`, `item.*` (+ each item),
`camp.*` (+ each scenario name/desc/objective), and any new `ui.*`/`panel.*` (panel.defense,
panel.heroes, start.campaign, start.skirmish). Keep all existing keys. Feature UIs also keep their own
FALLBACK_STR for chrome, so missing keys never crash — but provide canonical text here.

## 8. Verification (all)
`node --check` every file. Feature logic owners (td/siege/heroes/campaign/engine) self-test headlessly
with temp stubs under `tools/tmp/` (gitignored): deterministic sims, correct outcome/return shapes,
reward scaling, hero bonus math, siege wall reduction, campaign objective checks, and graceful no-op
when data/siblings absent. Commit ONLY your files (never `git add -A`). Push your branch; return a
structured integrator report (signatures, new string keys, data shapes, deviations).
