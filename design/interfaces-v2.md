# Interface Contracts v2 — Expansion (Thrones of Aden)

Builds on `design/interfaces.md` (v1, still authoritative for existing modules). This file
specifies the **new milestone**: 3 new playable factions, lore campaign events, clan skills,
and an interactive (manual + animated) tactical battle. **Disjoint file ownership — do not
edit files owned by another branch.** All ES modules, relative imports, RU default + EN, every
visible string via `t()`, determinism via `src/rng.js` (seed/rngState in State).

## File ownership (no overlaps)
- **A `feat/content-expansion`** → `src/data/factions.js`, `src/data/units.js`, `src/data/map.js`, `src/strings.js` (edit, additive), `src/data/events.js` (new), `src/data/skills.js` (new)
- **B `feat/engine-systems`** → `src/engine.js`, `src/ai.js`, `src/events.js` (new), `src/skills.js` (new)
- **C `feat/tactical-battle`** → `src/tactical.js` (new), `src/battle_ui.js` (new)
- **D `feat/client-features`** → `src/ui.js`, `src/render.js`, `src/main.js`
- **Assets + integration** → me (orchestrator)

Everything degrades gracefully: if a new system/module is missing or throws, the game must
still run (auto-resolve battles, no events, no skills). Mirror v1's resilient dynamic imports.

---

## 1. NEW FACTIONS (owner A; assets by orchestrator)
Add to `FACTIONS` (playable:true) and `PLAYABLE` (now 6, order fixed):
`['human','elf','orc','darkelf','dwarf','kamael']`.
- **darkelf** — Dark Elves of the swamp/Shadow. color `#8a4fae`, accent `#caa6e0`, capital `darkelf`. Bonus: `meleeBonus`+`magicBonus` (glass-cannon flavour). Roster: dark-elf units below.
- **dwarf** — Dwarven Guild (mountain forges). color `#caa23c`, accent `#e8d89a`, capital `dwarvenvillage`. Bonus: high `incomeMul` (~1.4, traders), tanky. Roster: dwarf units.
- **kamael** — Kamael of the Isle of Souls. color `#5a8fb0`, accent `#bcdce8`, capital `isleofsouls`. Bonus: balanced, `eliteBonus`. Roster: kamael units.

`UNITS` — add ~2-3 per faction (keep the v1 `type` set inf|arch|cav|mag|heal|undead; keep
fields id,nameKey,type,cost,upkeep,hp,atk,def,factions). Suggested:
- Dark Elf: `shillienknight`(inf), `phantomranger`(arch), `spellhowler`(mag).
- Dwarf: `dwarvendefender`(inf,tanky), `bountyhunter`(cav), `warsmith`(heal/support).
- Kamael: `soulsoldier`(inf), `soulranger`(arch), `berserker`(cav).
Extend `SPRITE_FOR`: dark-elf units → `unit_darkelf`, dwarf units → `unit_dwarf`, kamael units
→ `unit_kamael`. Extend `COUNTER` only if you add types (don't). Keep balance sane (v1 ranges).

`map.js` — expand to ~18-20 provinces so 6 factions + Shilen aren't overcrowded. Add at least:
`darkelf` already exists (make it the Dark Elf capital, NOT a Shilen foothold now), plus new
`dwarvenvillage` (mountain), `isleofsouls` (coast/island), and 2-4 link provinces (e.g. Gracia
regions: `gracia`, `aienkrol`/`seedofdestruction`, `wallofargos`). Keep adjacency **symmetric**
and the graph **one connected component**. Update `START_OWNER`: each of the 6 factions gets a
capital + 1 province; keep Shilen footholds on 1-2 fringe provinces (move them off `darkelf`).
Keep the 3 crown castles (`gludio`,`giran`,`aden`) NEUTRAL+`castle:true` as the shared objective.

`strings.js` — add ru+en for: new `fac.*`, `unit.*`, `prov.*`, plus ALL event and skill strings
(see §2/§3), and any new UI labels (see §4). RU primary, both complete.

## 2. CAMPAIGN EVENTS (data owner A: `src/data/events.js`; engine owner B: `src/events.js`)
`data/events.js`:
```js
export const EVENTS = [{
  id: 'omen_of_shilen',
  weight: 10,                       // relative pick weight among eligible
  oncePerGame: true,                // optional; default false
  trigger: { minTurn: 3, maxTurn: 40, owns: 'any' }, // simple declarative gate; see below
  titleKey: 'ev.omen.title', descKey: 'ev.omen.desc',
  choices: [
    { id: 'pray',  labelKey: 'ev.omen.pray',  effects: [{ type:'adena', value:-60 }, { type:'blessIncome', turns:3, mult:1.25 }], resultKey:'ev.omen.pray.r' },
    { id: 'ignore',labelKey: 'ev.omen.ignore',effects: [{ type:'spawnIncursion' }], resultKey:'ev.omen.ignore.r' },
  ],
}, /* ~12 lore events total */ ];
```
Trigger grammar (keep declarative; engine B interprets): `minTurn`,`maxTurn`,`owns:'any'|n`
(player province count ≥ n), `hasAdenaMin`, `factionAny:['orc',...]` (player faction in list).
Effect grammar (engine B applies to the PLAYER faction unless `target`): `adena{value}`,
`blessIncome{turns,mult}`, `spawnUnits{unit,count,where:'capital'|'frontline'}`,
`spawnIncursion`, `fortifyCapital`, `loseUnits{count}`, `revealMap`. Add new effect types only
if both A and B agree here first. Provide ru+en for every title/desc/choice/result key.

`engine/events.js` (owner B):
```js
export function registerEvents();              // side-effect: engine calls maybeFireEvent in endTurn
export function maybeFireEvent(state);         // -> state, may set state.pendingEvent = { id, choices:[{id,labelKey}] , titleKey, descKey }
export function resolveEvent(state, choiceId); // -> state (apply chosen effects, clear pendingEvent, push log 'log.event*')
```
Fire at most one event per player turn, gated by a tunable chance + eligibility + weight; honor
`oncePerGame`. Deterministic via state rng. If `data/events.js` is absent, no-op.

## 3. CLAN SKILLS (data owner A: `src/data/skills.js`; engine owner B: `src/skills.js`)
`data/skills.js`:
```js
export const SKILLS = [{
  id:'einhasad_blessing', nameKey:'sk.einhasad.name', descKey:'sk.einhasad.desc',
  cost:120, cooldown:4, target:'ownProvince',     // 'ownProvince'|'enemyProvince'|'none'
  effects:[{ type:'healGarrison', pct:0.5 }],
}, /* ~6 skills: heal, smite enemy garrison, summon defenders, bless income, fortify, scry */ ];
```
Effect grammar (engine C... no — owner B applies): `healGarrison{pct}`, `smite{frac}` (kill a
fraction of target enemy garrison), `summon{unit,count}`, `blessIncome{turns,mult}`,
`fortifyFree`, `adena{value}`. ru+en for name/desc.

`engine/skills.js` (owner B):
```js
export function registerSkills();
export function canActivate(state, skillId, targetProvId); // -> {ok, reason?}
export function activateSkill(state, skillId, targetProvId); // -> state (charge cost, set cooldown in state.skills.cooldowns[skillId], apply effects, log 'log.skill')
export function skillStatus(state);  // -> [{id, ready:bool, cooldownLeft, affordable}]  (UI consumes)
```
Cooldowns + a per-game state slot `state.skills = { cooldowns:{} }` created lazily. Deterministic.
If `data/skills.js` absent, `skillStatus` returns [] and the panel hides.

## 4. ENGINE HOOKS for manual battle (owner B: `src/engine.js`)
Keep `moveArmy` as the auto path (fallback). ADD, without breaking v1 signatures:
```js
export function planBattle(state, fromId, toId, units);
//  -> { battle:false, state }                       when target is own/empty (just moved)
//  -> { battle:true, attacker:{faction,garrison}, defender:{faction,garrison}, terrain, fortified, rngState }
//     (does NOT mutate ownership; returns the inputs the tactical screen needs)
export function applyBattleOutcome(state, fromId, toId, units, outcome);
//  -> { state }   apply a battle outcome (same shape combat.resolveBattle returns) to the map:
//     deduct losses, on attacker win transfer province + move survivors in, push log, advance rng
```
`outcome` shape MUST equal `combat.resolveBattle`'s return (winner, attackerLosses,
defenderLosses, attackerSurvivors, defenderSurvivors, rounds, log[{key,params}]). This lets the
client run a manual battle and apply it, OR fall back to `moveArmy` (auto). `endTurn` must also
call event firing (registerEvents) and tick skill cooldowns. Setup/victory must handle 6 factions.

## 5. TACTICAL BATTLE (owner C: `src/tactical.js` + `src/battle_ui.js`)
Self-contained, invoked by the client; takes over the shared canvas while active, returns an
outcome the engine applies. Single entry point:
```js
// battle_ui.js
export async function runTacticalBattle(opts) /* -> Promise<outcome> */;
// opts = { canvas, ctx, attacker:{faction,garrison}, defender:{faction,garrison}, terrain,
//          fortified, rngState, seed, t, assets, lang, sound }
//  - attacker/defender garrisons = { unitId: count }; unit stats come from data/units.js (import).
//  - Run an internal animation+input loop on (canvas,ctx). Player issues a few tactical commands
//    per round (e.g. FOCUS target type, PUSH vs HOLD, COMMIT reserve) via on-screen buttons +
//    touch/click; each biases the round resolution. Show clashing unit sprites + HP bars + dmg.
//  - DETERMINISTIC core: derive rng from rngState/seed; identical inputs -> identical outcome.
//  - On finish, RESOLVE to an `outcome` object IDENTICAL in shape to combat.resolveBattle's
//    return (winner,'attacker'|'defender'; attackerLosses; defenderLosses; attackerSurvivors;
//    defenderSurvivors; rounds; log:[{key,params}]). Clean up its own listeners before resolving.
```
`tactical.js` holds the battle model/resolution; `battle_ui.js` the render+input loop and
`runTacticalBattle`. Keep balance consistent with `combat.js` (player skill shifts the result
within a band; a hopeless fight stays mostly hopeless). Provide an internal AUTO-FINISH (skip)
control that resolves remaining rounds instantly. Load sprites from `assets/unit_*.png` (pass via
`opts.assets`); fall back to colored tokens if absent. If this module throws, the client falls
back to auto-resolve — so never leave the canvas in a broken state.

## 6. CLIENT (owner D: `src/ui.js`, `src/render.js`, `src/main.js`)
- **Faction select**: 6 cards now (slice `assets/crest_all.png` as a **3×2 grid**, order =
  `PLAYABLE` = human,elf,orc,darkelf,dwarf,kamael). Scrolling/wrapping layout that fits a phone.
- **Attack flow → manual battle**: when a player move triggers combat, call
  `engine.planBattle`; if `battle:true`, `await runTacticalBattle({...})` then
  `engine.applyBattleOutcome(...)`. Wrap in try/catch → on any failure use `engine.moveArmy`
  (auto). Pause the map loop while the battle screen owns the canvas; resume after.
- **Event modal**: after `endTurn`, if `state.pendingEvent`, show a modal (title/desc + choice
  buttons via `t()`); on choice call `engine.resolveEvent(state, choiceId)` and show the result.
- **Skills panel**: a button opens a panel listing `engine.skillStatus(state)` (name, cost,
  cooldownLeft, ready); tapping a ready skill enters target mode if `target!=='none'`, then
  `engine.activateSkill`. Show skill VFX in `render.js`.
- **render.js**: 6 faction colors (from `FACTIONS[id].color`), skill VFX, crest slicing 3×2,
  new provinces are data-driven (no hardcoding). 
- **main.js**: dynamic side-effect imports of `./events.js`, `./skills.js` (registers) and
  `./battle_ui.js`/`./tactical.js`; keep the v1 ai.js import. All resilient (try/catch).
- Every new string via `t()`; no literals. Keyboard: `K`=skills panel, Enter=confirm modal.

## 7. Determinism & verification (all)
Same seed + same inputs ⇒ identical State (events/skills/battle use state rng only). Each owner
`node --check`s their files and self-tests against this contract using temp stubs under
`tools/tmp/` (gitignored); do NOT commit files outside your ownership. Commit only your files,
push your branch, return a structured integrator report (APIs, new keys, deviations).
