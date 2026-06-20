# Lineage II: Thrones of Aden

A turn-based conquest strategy set in the **Lineage 2** world (continent of Aden),
built for mobile + desktop browsers and deployed via Higgsfield's game engine.

Command a clan, collect Adena, recruit Knights, Rangers, Sorcerers and Orc Destroyers,
expand across the provinces of Aden, lay siege to the crown castles — and hold the line
against the undead incursions of the fallen goddess **Shilen**.

- Turn-based, single-player vs AI rival lords + Shilen's Undead Legion
- Touch-first (mobile) + mouse + keyboard
- RU / EN
- Deterministic, seeded simulation

## Structure
```
logic.js          Higgsfield solo deploy stub (game runs client-side)
index.html        client entry (canvas)
src/              engine, combat, ai, data (units/factions/map), render, ui, strings
assets/           generated art + audio (see design/assets.csv)
design/           GDD (plan.md), asset manifest, interface contracts
```

## Run locally
```
python3 -m http.server 8000   # then open http://localhost:8000
```
ES modules require a server (not file://).

## Development
Work is split across feature branches (one concern each); see `design/interfaces.md`
for the module contracts and `design/plan.md` for the design.

Built with Claude Code + Higgsfield. Lineage 2 is a trademark of NCSoft; this is a
fan-made, non-commercial tribute project.
