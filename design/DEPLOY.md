# Deployment

**Live game:** https://regal-rose-396.higgsfield.gg/
**Marketplace:** published on Higgsfield Games
**game_id:** `bc302920-615c-4e48-a8ab-749c68a15f5d`  (deploy mode: `rules`)

## Updating the live game (keeps the same URL)
1. Re-zip the bundle root: `zip -rq thrones-of-aden.zip logic.js index.html src assets`
2. `media_upload` the zip → PUT bytes → `media_confirm` (type `file`) → permanent url
3. `deploy_game` with the SAME `game_id` above (passing game_id updates in place;
   omitting it creates a separate new game).

Card images (cover 16:9 + favicon 1:1) are generated assets; regenerate via
`generate_image` if changing the branding.

## Update — Expansion (2026-06-21)
Redeployed in place (same game_id / same URL). Expansion adds: 3 new factions
(Dark Elves, Dwarves, Kamael → 6 playable), 20 provinces (Aden + Gracia), interactive
tactical battles, lore campaign events, and clan skills. New design contract:
`design/interfaces-v2.md`. Built across branches feat/content-expansion, feat/engine-systems,
feat/tactical-battle, feat/client-features, feat/assets-v2.

## Update — Cities & Economy (2026-06-21)
Redeployed in place (same game_id / same URL). Adds a Heroes-of-M&M-style city system
(11 cities on castles + capitals; build/upgrade 9 building types over multiple turns; new
Wood + Crystal resources; resource + unit production; AI city development), the "Seven Seals"
lore event-chain, a 6-faction balance pass, and 5 new music tracks (battle/victory/city/darkelf/orc).
New design contract: `design/interfaces-v3.md`. Built across branches feat/content-v3,
feat/city-logic, feat/engine-core, feat/city-client, feat/map-client, feat/assets-v3.

## Update — Defense, Sieges, Heroes, Campaign (2026-06-21)
Redeployed in place (same game_id / same URL). Adds: a real-time WAVE-DEFENSE (tower-defense)
mode (5 towers, 8 waves, bone-golem boss, bonus rewards), CITY SIEGES (wall integrity by Walls
level, batter/storm/hold), HERO-COMMANDERS (6 heroes, items/inventory, leveling, battle bonuses),
and a 5-mission CAMPAIGN. New contract: design/interfaces-v4.md. Built across branches feat/td,
feat/siege, feat/heroes, feat/campaign, feat/engine-v4, feat/map-v4, feat/content-v4, feat/assets-v4.

## Update — Real-time 3D RTS battles (2026-06-21)
Redeployed in place (same game_id / same URL). Field battles now play out in a real-time
RTS arena rendered in 3D (Three.js + 5 rigged GLB character models from image_to_3d), with unit
selection + move/attack commands, auto-resolve, and a 2D top-down fallback for no-WebGL devices.
New contract: design/interfaces-v5.md. Branches: feat/rts-logic, feat/rts-3d. Three.js + GLTFLoader
+ SkeletonUtils vendored under src/vendor/ (import map in index.html); models under assets/models/.
Integrator fixes: SkeletonUtils.clone (skinned-mesh clone), fixed model scale, portrait camera framing.
