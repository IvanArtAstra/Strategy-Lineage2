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
