// Lineage II: Thrones of Aden — top-down map renderer (owner: client-ui)
// Contract I. Imports data + strings; reads engine viewModel/state.
// Robust to missing assets: every image has a procedural fallback in the STYLE palette.

import { PROVINCES, NEUTRAL } from './data/map.js';
import { FACTIONS } from './data/factions.js';
import { UNITS, SPRITE_FOR } from './data/units.js';

// ---- STYLE FORMULA palette (procedural art must honor this) ----
const PALETTE = {
  parchment:   '#2b2417',
  parchment2:  '#1c1810',
  land:        '#3a4239',   // muted slate-green
  landEdge:    '#2a302a',
  stone:       '#6b6a60',   // weathered grey stone
  bronze:      '#7a5a32',   // dark-bronze outline
  bronzeLight: '#caa24a',   // gold-leaf
  royalBlue:   '#3b6fd4',   // player luminous royal-blue
  gold:        '#e8c45a',
  necrotic:    '#7d3fb0',   // Shilen necrotic violet
  necroGlow:   '#b06fe0',
  bone:        '#cfc6b0',
  neutral:     '#7a7a72',
  ink:         '#10100a',
};

const ASSET_FILES = {
  bg_parchment: 'assets/bg_parchment.png',
  tile_terrain: 'assets/tile_terrain.png',
  icon_castle:  'assets/icon_castle.png',
  unit_knight:  'assets/unit_knight.png',
  unit_ranger:  'assets/unit_ranger.png',
  unit_mage:    'assets/unit_mage.png',
  unit_orc:     'assets/unit_orc.png',
  unit_undead:  'assets/unit_undead.png',
  crest_factions: 'assets/crest_factions.png',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.images = {};        // key -> {img, ok}
    this.W = 0; this.H = 0;
    // Map space is a fixed virtual board; provinces laid out within it.
    this.boardW = 1000;
    this.boardH = 1000;
    this.nodes = {};         // provId -> {x,y,r} in board (world) coords
    this.edges = [];         // [ [aId,bId] ]
    this.glowT = 0;
    this._buildGraph();
  }

  _buildGraph() {
    // Build symmetric edge list once from PROVINCES adjacency.
    const seen = new Set();
    this.edges = [];
    for (const p of (PROVINCES || [])) {
      for (const n of (p.neighbors || [])) {
        const key = [p.id, n].sort().join('|');
        if (!seen.has(key)) { seen.add(key); this.edges.push([p.id, n]); }
      }
    }
  }

  async loadAssets() {
    const entries = Object.entries(ASSET_FILES);
    await Promise.all(entries.map(([key, path]) => this._loadImage(key, path)));
    // Background can be its own key too.
    if (!this.images.bg_parchment) await this._loadImage('bg_parchment', ASSET_FILES.bg_parchment);
  }

  _loadImage(key, src) {
    return new Promise((resolve) => {
      const img = new Image();
      let done = false;
      const finish = (ok) => { if (done) return; done = true; this.images[key] = { img, ok }; resolve(); };
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      // Guard against assets dir not existing during isolated dev.
      try { img.src = src; } catch (e) { finish(false); }
      // Safety timeout so a hung request never blocks boot.
      setTimeout(() => finish(false), 4000);
    });
  }

  has(key) { return this.images[key] && this.images[key].ok; }

  // ---- Layout: recompute world->screen scale to fit board to viewport ----
  layout(width, height) {
    this.W = width; this.H = height;
    // Compute node positions (normalized x,y -> board coords) once / on resize.
    const pad = 90;
    const bw = this.boardW, bh = this.boardH;
    this.nodes = {};
    for (const p of (PROVINCES || [])) {
      this.nodes[p.id] = {
        x: pad + p.x * (bw - 2 * pad),
        y: pad + p.y * (bh - 2 * pad),
        r: p.castle ? 30 : 22,
        castle: !!p.castle,
        terrain: p.terrain,
      };
    }
    // Base fit zoom so whole board visible.
    this.fitZoom = Math.min(width / bw, height / bh);
  }

  // ---- Camera math (world == board coords). camera.x/y is world top-left; zoom multiplies.
  worldToScreen(wx, wy, cam) {
    return { x: (wx - cam.x) * cam.zoom, y: (wy - cam.y) * cam.zoom };
  }
  screenToWorld(sx, sy, cam) {
    return { x: sx / cam.zoom + cam.x, y: sy / cam.zoom + cam.y };
  }

  clampCamera(cam, viewW, viewH) {
    const vw = viewW / cam.zoom, vh = viewH / cam.zoom;
    const margin = 120;
    const maxX = this.boardW - vw + margin;
    const maxY = this.boardH - vh + margin;
    if (vw >= this.boardW + margin * 2) {
      cam.x = (this.boardW - vw) / 2;
    } else {
      cam.x = Math.min(Math.max(cam.x, -margin), Math.max(-margin, maxX));
    }
    if (vh >= this.boardH + margin * 2) {
      cam.y = (this.boardH - vh) / 2;
    } else {
      cam.y = Math.min(Math.max(cam.y, -margin), Math.max(-margin, maxY));
    }
  }

  // Hit test a screen point against province nodes. Returns provId or null.
  pickProvince(sx, sy, cam) {
    const w = this.screenToWorld(sx, sy, cam);
    let best = null, bestD = Infinity;
    for (const id in this.nodes) {
      const n = this.nodes[id];
      const d = Math.hypot(w.x - n.x, w.y - n.y);
      const hitR = n.r + 14;
      if (d <= hitR && d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  // ---- Main draw ----
  draw(ctx, state, cam, hoverId) {
    const W = this.W, H = this.H;
    this.glowT += 0.016;
    ctx.fillStyle = PALETTE.parchment2;
    ctx.fillRect(0, 0, W, H);

    // Background parchment (tiled/stretched to fill board area).
    this._drawBackground(ctx, cam, W, H);

    if (!state || !state.provinces) {
      // No game yet (start screen handles its own draw via UI overlay).
      return;
    }

    const owners = state.provinces;
    const selected = state.selected;
    const player = state.playerFaction;

    // Adjacency connections (under nodes).
    ctx.lineWidth = Math.max(2, 3 * cam.zoom);
    ctx.strokeStyle = 'rgba(202,162,74,0.30)';
    for (const [a, b] of this.edges) {
      const na = this.nodes[a], nb = this.nodes[b];
      if (!na || !nb) continue;
      const pa = this.worldToScreen(na.x, na.y, cam);
      const pb = this.worldToScreen(nb.x, nb.y, cam);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }

    // Highlight legal-move connections from selection.
    const legal = state.legalTargets || null;

    // Provinces.
    for (const id in this.nodes) {
      const n = this.nodes[id];
      const prov = owners[id];
      const owner = prov ? prov.owner : NEUTRAL;
      const s = this.worldToScreen(n.x, n.y, cam);
      const r = n.r * cam.zoom;
      this._drawProvince(ctx, s.x, s.y, r, owner, player, n, id === hoverId, id === selected, legal && legal.includes(id));
    }

    // Army tokens (above province nodes).
    for (const id in this.nodes) {
      const prov = owners[id];
      if (!prov || !prov.garrison) continue;
      const n = this.nodes[id];
      const s = this.worldToScreen(n.x, n.y, cam);
      this._drawGarrison(ctx, s.x, s.y, n.r * cam.zoom, prov.garrison, prov.owner, cam.zoom);
    }
  }

  _drawBackground(ctx, cam, W, H) {
    const tl = this.worldToScreen(0, 0, cam);
    const br = this.worldToScreen(this.boardW, this.boardH, cam);
    const bw = br.x - tl.x, bh = br.y - tl.y;
    const bg = this.images.bg_parchment;
    if (bg && bg.ok) {
      ctx.drawImage(bg.img, tl.x, tl.y, bw, bh);
    } else {
      // Procedural parchment: warm dusk gradient + slate vignette.
      const g = ctx.createLinearGradient(tl.x, tl.y, br.x, br.y);
      g.addColorStop(0, PALETTE.parchment);
      g.addColorStop(1, PALETTE.parchment2);
      ctx.fillStyle = g;
      ctx.fillRect(tl.x, tl.y, bw, bh);
      // faint border frame in bronze
      ctx.strokeStyle = 'rgba(122,90,50,0.5)';
      ctx.lineWidth = 6;
      ctx.strokeRect(tl.x + 8, tl.y + 8, bw - 16, bh - 16);
    }
  }

  _terrainTint(terrain) {
    switch (terrain) {
      case 'forest':   return '#34452f';
      case 'mountain': return '#54524a';
      case 'swamp':    return '#3a4030';
      case 'coast':    return '#33464e';
      default:         return PALETTE.land; // plains
    }
  }

  _drawProvince(ctx, x, y, r, owner, player, node, hover, selected, legal) {
    const fac = FACTIONS[owner];
    const ownerColor = (owner === NEUTRAL || !fac) ? PALETTE.neutral : fac.color;

    // Owner glow: royal-blue/gold on player holdings, necrotic-violet on Shilen.
    const pulse = 0.5 + 0.5 * Math.sin(this.glowT * 2);
    if (owner === player && owner !== NEUTRAL) {
      this._glow(ctx, x, y, r * 1.9, PALETTE.royalBlue, 0.28 + 0.12 * pulse);
    } else if (owner === 'shilen') {
      this._glow(ctx, x, y, r * 1.9, PALETTE.necroGlow, 0.30 + 0.14 * pulse);
    }

    // Region fill (terrain-tinted disc).
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = this._terrainTint(node.terrain);
    ctx.fill();

    // Owner color ring.
    ctx.lineWidth = Math.max(2.5, r * 0.16);
    ctx.strokeStyle = ownerColor;
    ctx.stroke();

    // Dark-bronze outline.
    ctx.beginPath(); ctx.arc(x, y, r + ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.strokeStyle = PALETTE.bronze;
    ctx.stroke();

    // Legal-target indicator.
    if (legal) {
      ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2);
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = PALETTE.gold;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Hover ring.
    if (hover && !selected) {
      ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(232,196,90,0.6)';
      ctx.stroke();
    }

    // Selection ring (gold double ring).
    if (selected) {
      ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2);
      ctx.lineWidth = 3.5; ctx.strokeStyle = PALETTE.gold; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r + 13, 0, Math.PI * 2);
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(232,196,90,0.5)'; ctx.stroke();
    }

    // Castle marker.
    if (node.castle) this._drawCastle(ctx, x, y - r - 8, r * 0.7);
  }

  _drawCastle(ctx, x, y, size) {
    const ic = this.images.icon_castle;
    const s = Math.max(16, size * 1.6);
    if (ic && ic.ok) {
      ctx.drawImage(ic.img, x - s / 2, y - s, s, s);
      return;
    }
    // Procedural keep: stone tower with banner.
    ctx.save();
    ctx.translate(x, y);
    const w = s * 0.7, h = s * 0.7;
    ctx.fillStyle = PALETTE.stone;
    ctx.strokeStyle = PALETTE.bronze;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.rect(-w / 2, -h, w, h);
    ctx.fill(); ctx.stroke();
    // crenellations
    ctx.beginPath();
    const cren = 3, cw = w / (cren * 2 - 1);
    for (let i = 0; i < cren; i++) {
      ctx.rect(-w / 2 + i * cw * 2, -h - cw, cw, cw);
    }
    ctx.fillStyle = PALETTE.stone; ctx.fill(); ctx.stroke();
    // banner
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.lineTo(0, -h - cw * 2.2);
    ctx.lineTo(cw * 1.6, -h - cw * 1.7);
    ctx.lineTo(0, -h - cw * 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _glow(ctx, x, y, r, color, alpha) {
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, this._rgba(color, alpha));
    g.addColorStop(1, this._rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  _rgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  }

  // ---- Army tokens with count badge ----
  _drawGarrison(ctx, cx, cy, r, garrison, owner, zoom) {
    const ids = Object.keys(garrison).filter(u => garrison[u] > 0);
    if (!ids.length) return;
    const total = ids.reduce((s, u) => s + garrison[u], 0);
    // Show the dominant unit's sprite as the stack token.
    let topId = ids[0];
    for (const u of ids) if (garrison[u] > garrison[topId]) topId = u;
    const tokenR = Math.max(11, r * 0.62);
    const tx = cx, ty = cy;

    this._drawUnitToken(ctx, tx, ty, tokenR, topId, owner);

    // Count badge (total in stack).
    const bx = cx + tokenR * 0.85, by = cy - tokenR * 0.85;
    const br = Math.max(8, tokenR * 0.5);
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.ink; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = PALETTE.gold; ctx.stroke();
    ctx.fillStyle = PALETTE.bone;
    ctx.font = `bold ${Math.max(9, br * 1.1)}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(total), bx, by + 0.5);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  _drawUnitToken(ctx, x, y, r, unitId, owner) {
    const spriteKey = (SPRITE_FOR && SPRITE_FOR[unitId]) || 'unit_knight';
    const img = this.images[spriteKey];
    // Token base disc (so sprite reads on any terrain).
    const fac = FACTIONS[owner];
    const tint = owner === 'shilen' ? PALETTE.necrotic
               : (fac ? fac.color : PALETTE.neutral);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = this._rgba(PALETTE.ink, 0.85); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = tint; ctx.stroke();

    if (img && img.ok) {
      const s = r * 1.7;
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(img.img, x - s / 2, y - s / 2, s, s);
      ctx.restore();
    } else {
      // Procedural glyph by unit archetype, in palette.
      this._drawUnitGlyph(ctx, x, y, r, unitId, tint, owner);
    }
  }

  _drawUnitGlyph(ctx, x, y, r, unitId, tint, owner) {
    const type = (UNITS && UNITS[unitId] && UNITS[unitId].type) || 'inf';
    const undead = owner === 'shilen' || type === 'undead';
    const main = undead ? PALETTE.bone : tint;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = PALETTE.bronze;
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.fillStyle = main;
    const u = r * 0.55;
    ctx.beginPath();
    switch (type) {
      case 'arch': // bow + arrow
        ctx.arc(0, 0, u, -Math.PI * 0.6, Math.PI * 0.6);
        ctx.moveTo(-u * 0.4, -u); ctx.lineTo(-u * 0.4, u);
        ctx.moveTo(-u * 0.6, 0); ctx.lineTo(u, 0);
        ctx.strokeStyle = main; ctx.stroke();
        break;
      case 'mag': // diamond gem
        ctx.moveTo(0, -u); ctx.lineTo(u * 0.8, 0); ctx.lineTo(0, u); ctx.lineTo(-u * 0.8, 0); ctx.closePath();
        ctx.fill(); ctx.stroke();
        break;
      case 'cav': // chevron / heavy
        ctx.moveTo(-u, u); ctx.lineTo(0, -u); ctx.lineTo(u, u); ctx.lineTo(0, u * 0.3); ctx.closePath();
        ctx.fill(); ctx.stroke();
        break;
      case 'heal': // cross
        ctx.rect(-u * 0.25, -u, u * 0.5, u * 2);
        ctx.rect(-u, -u * 0.25, u * 2, u * 0.5);
        ctx.fill();
        break;
      case 'undead': // skull-ish circle with eyes
        ctx.arc(0, -u * 0.1, u * 0.85, 0, Math.PI * 2);
        ctx.fillStyle = PALETTE.bone; ctx.fill(); ctx.stroke();
        ctx.fillStyle = PALETTE.necrotic;
        ctx.beginPath(); ctx.arc(-u * 0.35, -u * 0.2, u * 0.18, 0, Math.PI * 2);
        ctx.arc(u * 0.35, -u * 0.2, u * 0.18, 0, Math.PI * 2); ctx.fill();
        break;
      default: // inf: shield
        ctx.moveTo(0, -u); ctx.lineTo(u * 0.8, -u * 0.5); ctx.lineTo(u * 0.8, u * 0.4);
        ctx.lineTo(0, u); ctx.lineTo(-u * 0.8, u * 0.4); ctx.lineTo(-u * 0.8, -u * 0.5); ctx.closePath();
        ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // ---- Crest helper for UI (faction crest from sheet or procedural). ----
  drawCrest(ctx, faction, x, y, size) {
    const sheet = this.images.crest_factions;
    const order = { human: [0, 0], elf: [1, 0], orc: [0, 1], shilen: [1, 1] };
    if (sheet && sheet.ok && order[faction]) {
      const iw = sheet.img.width / 2, ih = sheet.img.height / 2;
      const [cx, cy] = order[faction];
      ctx.drawImage(sheet.img, cx * iw, cy * ih, iw, ih, x, y, size, size);
      return;
    }
    // Procedural crest: shield in faction color with accent emblem.
    const fac = FACTIONS[faction];
    const col = fac ? fac.color : PALETTE.neutral;
    const acc = fac ? (fac.accent || PALETTE.gold) : PALETTE.gold;
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    const u = size * 0.42;
    ctx.beginPath();
    ctx.moveTo(0, -u); ctx.lineTo(u, -u * 0.5); ctx.lineTo(u, u * 0.4);
    ctx.lineTo(0, u); ctx.lineTo(-u, u * 0.4); ctx.lineTo(-u, -u * 0.5); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = PALETTE.bronze; ctx.stroke();
    ctx.fillStyle = acc;
    ctx.beginPath(); ctx.arc(0, -u * 0.1, u * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

export { PALETTE };
