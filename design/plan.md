# Lineage II: Thrones of Aden — Game Design Doc

A turn-based conquest strategy set in the Lineage 2 world (continent of Aden),
built for **mobile + desktop browsers** and deployed via Higgsfield.

## 1. Profile
- **Time:** turn-based
- **Space:** discrete (province graph map of Aden)
- **Agency:** disembodied hand — a Lord commanding a clan/kingdom
- **Conflict:** vs system — rival AI lords + Shilen's undead incursions
- **Content:** authored map of Aden + procedural battle/event outcomes
- **Outcome:** win = hold all three crown castles (Gludio, Giran, Aden) or eliminate rivals; lose = your home castle falls
- **Players:** solo
- **Session:** minutes (short turns, mobile-friendly)
- **Engagement:** calculation (strategy) + accumulation (grow clan, economy, army)
- **Delivery:** desktop + mobile browsers + gamepad-friendly; touch-first; strings external (RU default, EN), physical key codes.

## 2. Experience formula
The player feels like a rising warlord carving a throne out of a dangerous fantasy
world, because the game constantly forces expansion-vs-defense decisions where every
conquered province strengthens you but stretches you thinner against a closing darkness
(Shilen's undead tide).

## 3. Core loop (one turn)
1. **Income** — each owned province yields Adena (castles yield more).
2. **Recruit / upgrade** — spend Adena on units in provinces; pay upkeep.
3. **Move armies** — along province adjacency; moving into an enemy/neutral province triggers a **battle**.
4. **Battle** — auto-resolved with tactical modifiers (unit-type counters, terrain, castle walls, numbers), shown as a result + log.
5. **End turn** — rival AI lords act; **Shilen incursions** spawn undead stacks that attack the nearest holdings.

Win/lose checked each turn. Seeded RNG → deterministic, replayable.

## 4. Lore & factions (Lineage 2)
World: continent of **Aden**, under the gods **Einhasad** (creation) and the fallen
**Shilen** (death). Provinces named for L2 regions.

Playable factions (pick one at start; rivals are AI):
- **Humans — Kingdom of Aden** (balanced; bonus Adena income). Capital: Aden.
- **Elves — Forest of Elmore** (strong ranged/healing). Capital: Oren.
- **Orcs — Clan of Schuttgart** (strong melee, cheap units). Capital: Schuttgart.
Antagonist (always AI, aggressive neutral): **Shilen's Undead Legion** — spawns incursions.

Unit roster (shared archetypes with faction flavor — see `src/data/units.js`):
Knight (inf/tank), Gladiator (inf/dps), Hawkeye-Ranger (archer), Sorcerer (mage),
Orc Destroyer (heavy inf), Bishop (healer/support), plus undead: Wraith, Bone Archer, Necromancer.

Type counter triangle (non-transitive, §9.1): **Infantry > Archers > Cavalry/Heavy > Infantry**;
**Mages** strong vs clustered infantry but fragile; **Healers** extend a stack's effective HP.

## 5. Map of Aden (provinces)
~14 provinces with adjacency, three crown **castles** (Gludio, Giran, Aden) plus regional
holds. Terrain types (plains, forest, mountain, swamp, coast) modify battle + income.
Full data in `src/data/map.js`. Positions stored normalized (0..1) for responsive layout.

## 6. STYLE FORMULA (approved contract — byte-identical into every asset prompt)
> rich hand-painted high-fantasy digital illustration with soft painterly brushwork and fine gold-leaf detailing, ornate medieval silhouettes with strong readable shapes and thin dark-bronze outlines, terrain in muted slate-green and weathered grey stone, the player's holdings and heroes in luminous royal-blue and warm gold that pop against the land while Shilen's undead are marked with a cold necrotic violet-and-bone glow, somber epic dusk atmosphere lit by warm torchlight and pale moonlight, high contrast between units and terrain with clean readable silhouettes and a consistent top-down map perspective across all assets

STYLE TOKEN (compressed): `hand-painted high-fantasy, muted slate-stone terrain, royal-blue and gold heroes, necrotic-violet undead, somber torchlit dusk, dark-bronze outlines`

## 7. Architecture (solo → client-side game, stub logic.js)
Per Higgsfield build rules, a solo game ships a **stub `logic.js`** and runs entirely in the
client. Modules (relative ES imports), see `design/interfaces.md`:
- `src/engine.js` — state, turn engine, economy, victory
- `src/combat.js` — battle resolution
- `src/ai.js` — rival lords + Shilen incursions
- `src/rng.js` — seeded RNG (determinism §12)
- `src/data/{factions,units,map}.js` — content
- `src/strings.js` — RU/EN strings (no UI literals in code)
- `src/render.js` — canvas top-down map renderer
- `src/ui.js` — touch/click/keyboard input → command objects; HUD/panels
- `src/main.js` — wires loop (from build-game.md §3 skeleton)
- `assets/…` — art + audio per `design/assets.csv`

## 8. Scope (first deliverable)
14 provinces, 3 playable factions + Shilen, ~9 unit types, auto-resolved battles with
modifiers, economy with sources+sinks, castle sieges, win/lose, RU+EN, music + SFX.
Stretch (later): campaign events, clan skills, animated battle view.

## 9. Limits (honest)
Battle is auto-resolved (no real-time tactical control) in the first deliverable; animation
feel and music polish are pipeline-limited (game-design-system §13).
