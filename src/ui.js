// Lineage II: Thrones of Aden — UI layer (owner: client-ui)
// Contract J. Hit-testing, selection flow, HUD panels, modals, command objects.
// Touch-first; also mouse + keyboard. Every visible string via t() — zero literals.

import { PALETTE } from './render.js';
import { PROVINCES, NEUTRAL } from './data/map.js';
import { FACTIONS, PLAYABLE } from './data/factions.js';
import { UNITS } from './data/units.js';

// ---- Fallbacks if strings.js isn't present during isolated dev. ----
// We still route EVERY string through t(); this is just a safety net so the
// client renders rather than crashing when strings.js is on another branch.
const FALLBACK_STR = {
  ru: {
    'app.title': 'Lineage II: Троны Адена',
    'start.choose': 'Выберите фракцию',
    'start.begin': 'Начать поход',
    'hud.turn': 'Ход',
    'hud.adena': 'Адена',
    'hud.endTurn': 'Конец хода',
    'panel.recruit': 'Нанять',
    'panel.fortify': 'Укрепить',
    'panel.move': 'Нажмите соседнюю провинцию для перемещения/атаки',
    'panel.garrison': 'Гарнизон',
    'panel.empty': 'Пусто',
    'panel.cost': 'Цена',
    'panel.close': 'Закрыть',
    'confirm.attack': 'Атаковать провинцию?',
    'confirm.move': 'Переместить войска?',
    'confirm.yes': 'Да',
    'confirm.no': 'Нет',
    'battle.title': 'Итог битвы',
    'battle.victory': 'Победа атакующего',
    'battle.defeat': 'Оборона выстояла',
    'battle.continue': 'Продолжить',
    'over.victory': 'Победа!',
    'over.defeat': 'Поражение',
    'over.restart': 'Заново',
    'audio.on': 'Звук: вкл', 'audio.off': 'Звук: выкл',
    'lang.toggle': 'EN',
    'fac.human': 'Люди', 'fac.elf': 'Эльфы', 'fac.orc': 'Орки', 'fac.shilen': 'Шилен',
  },
  en: {
    'app.title': 'Lineage II: Thrones of Aden',
    'start.choose': 'Choose your faction',
    'start.begin': 'Begin campaign',
    'hud.turn': 'Turn',
    'hud.adena': 'Adena',
    'hud.endTurn': 'End Turn',
    'panel.recruit': 'Recruit',
    'panel.fortify': 'Fortify',
    'panel.move': 'Tap an adjacent province to move / attack',
    'panel.garrison': 'Garrison',
    'panel.empty': 'Empty',
    'panel.cost': 'Cost',
    'panel.close': 'Close',
    'confirm.attack': 'Attack this province?',
    'confirm.move': 'Move troops?',
    'confirm.yes': 'Yes',
    'confirm.no': 'No',
    'battle.title': 'Battle Result',
    'battle.victory': 'Attacker prevails',
    'battle.defeat': 'Defenders hold',
    'battle.continue': 'Continue',
    'over.victory': 'Victory!',
    'over.defeat': 'Defeat',
    'over.restart': 'Restart',
    'audio.on': 'Sound: on', 'audio.off': 'Sound: off',
    'lang.toggle': 'RU',
    'fac.human': 'Humans', 'fac.elf': 'Elves', 'fac.orc': 'Orcs', 'fac.shilen': 'Shilen',
  },
};

export class UI {
  constructor({ renderer, engine, strings, camera, requestRedraw, centerOn }) {
    this.renderer = renderer;
    this.engine = engine;
    this.strings = strings;
    this.camera = camera;
    this.requestRedraw = requestRedraw || (() => {});
    this.centerOn = centerOn || (() => {});

    this.W = 0; this.H = 0;
    this.state = null;             // engine State
    this.vm = null;                // viewModel cache
    this.screen = 'start';         // 'start' | 'play' | 'over'
    this.selectedId = null;
    this._hoverId = null;
    this.modal = null;             // {kind:'battle'|'confirm', ...}
    this.lang = (strings && strings.LANG) || 'ru';
    this.audioOn = false;
    this.seed = (Date.now() & 0xffffffff) >>> 0;
    this.startChoice = (PLAYABLE && PLAYABLE[0]) || 'human';

    this.buttons = [];             // current frame hit-test rects: {id, x,y,w,h, cmd}
    this._anim = 0;
    this._audio = {};
    this._pressed = null;
  }

  async init() {
    await this._initAudio();
  }

  // ---- localization wrapper: always go through strings.t when available. ----
  t(key, params) {
    if (this.strings && typeof this.strings.t === 'function') {
      const v = this.strings.t(key, params);
      if (v != null && v !== key) return v;
    }
    const tbl = FALLBACK_STR[this.lang] || FALLBACK_STR.ru;
    let s = (tbl && tbl[key]) != null ? tbl[key] : key;
    if (params) for (const k in params) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
    return s;
  }

  setLang(l) {
    this.lang = l;
    if (this.strings && typeof this.strings.setLang === 'function') this.strings.setLang(l);
    this.requestRedraw();
  }

  // ---- audio (try/catch, off until first gesture) ----
  async _initAudio() {
    const files = {
      theme: 'assets/audio/theme.mp3',
      sfx_select: 'assets/audio/sfx_select.mp3',
      sfx_battle: 'assets/audio/sfx_battle.mp3',
      sfx_victory: 'assets/audio/sfx_victory.mp3',
    };
    for (const [k, src] of Object.entries(files)) {
      try {
        const a = new Audio();
        a.src = src;
        a.preload = 'none';
        if (k === 'theme') { a.loop = true; a.volume = 0.4; }
        else a.volume = 0.6;
        this._audio[k] = a;
      } catch (e) { /* ignore missing audio */ }
    }
  }

  _play(key) {
    if (!this.audioOn) return;
    const a = this._audio[key];
    if (!a) return;
    try {
      if (key !== 'theme') { a.currentTime = 0; }
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  }

  toggleAudio() {
    this.audioOn = !this.audioOn;
    if (this.audioOn) this._play('theme');
    else { try { this._audio.theme && this._audio.theme.pause(); } catch (e) {} }
    this.requestRedraw();
  }

  // ---- lifecycle hooks called by main.js ----
  onResize(w, h) { this.W = w; this.H = h; }
  getState() { return this.screen === 'play' ? this.state : null; }
  get hoverId() { return this._hoverId; }
  set hoverId(v) { this._hoverId = v; }

  isModal() { return !!this.modal || this.screen !== 'play'; }
  animating() { return this.screen === 'play'; } // glow pulse needs redraws on map
  update(dt) { this._anim += dt; return false; }

  // ---- command objects: the single entry to mutate game via engine ----
  dispatch(cmd) {
    switch (cmd.type) {
      case 'startGame':   return this._cmdStart(cmd);
      case 'select':      return this._cmdSelect(cmd);
      case 'deselect':    this.selectedId = null; this._syncSelected(); this.requestRedraw(); return;
      case 'move':        return this._cmdMove(cmd);
      case 'recruit':     return this._cmdRecruit(cmd);
      case 'fortify':     return this._cmdFortify(cmd);
      case 'endTurn':     return this._cmdEndTurn(cmd);
      case 'confirmYes':  return this._cmdConfirmYes();
      case 'confirmNo':   this.modal = null; this.requestRedraw(); return;
      case 'closeModal':  this.modal = null; this.requestRedraw(); return;
      case 'toggleAudio': return this.toggleAudio();
      case 'toggleLang':  return this.setLang(this.lang === 'ru' ? 'en' : 'ru');
      case 'restart':     this.screen = 'start'; this.state = null; this.selectedId = null; this.requestRedraw(); return;
      default: return;
    }
  }

  _cmdStart(cmd) {
    const fac = cmd.faction || this.startChoice;
    if (!this.engine || typeof this.engine.createGame !== 'function') {
      console.warn('[ui] engine.createGame unavailable');
      return;
    }
    this.state = this.engine.createGame({ playerFaction: fac, seed: this.seed });
    this.screen = 'play';
    this.selectedId = null;
    this._refreshVM();
    this._centerOnCapital(fac);
    this._play('sfx_select');
    this.requestRedraw();
  }

  _cmdSelect(cmd) {
    this.selectedId = cmd.provId;
    this._syncSelected();
    this._play('sfx_select');
    this.requestRedraw();
  }

  _cmdMove(cmd) {
    if (!this.engine || typeof this.engine.moveArmy !== 'function') return;
    const { fromId, toId } = cmd;
    const fromProv = this.state.provinces[fromId];
    const units = (fromProv && fromProv.garrison) ? { ...fromProv.garrison } : {};
    const res = this.engine.moveArmy(this.state, fromId, toId, units);
    // moveArmy returns { state, battle? }
    if (res && res.state) {
      this.state = res.state;
      if (res.battle) { this._showBattle(res.battle); this._play('sfx_battle'); }
    }
    this.selectedId = toId;
    this._afterAction();
  }

  _cmdRecruit(cmd) {
    if (!this.engine || typeof this.engine.recruit !== 'function') return;
    if (typeof this.engine.canRecruit === 'function') {
      const ok = this.engine.canRecruit(this.state, cmd.provId, cmd.unitId);
      if (ok && ok.ok === false) { this.requestRedraw(); return; }
    }
    this.state = this.engine.recruit(this.state, cmd.provId, cmd.unitId, cmd.n || 1) || this.state;
    this._play('sfx_select');
    this._afterAction();
  }

  _cmdFortify(cmd) {
    if (!this.engine || typeof this.engine.fortify !== 'function') return;
    this.state = this.engine.fortify(this.state, cmd.provId) || this.state;
    this._play('sfx_select');
    this._afterAction();
  }

  _cmdEndTurn() {
    if (this.screen !== 'play' || this.modal) return;
    if (!this.engine || typeof this.engine.endTurn !== 'function') return;
    this.state = this.engine.endTurn(this.state) || this.state;
    this._afterAction();
    this._checkOver();
  }

  _cmdConfirmYes() {
    const m = this.modal;
    this.modal = null;
    if (m && m.kind === 'confirm' && m.action) this.dispatch(m.action);
    else this.requestRedraw();
  }

  _afterAction() {
    this._refreshVM();
    this._syncSelected();
    this._checkOver();
    this.requestRedraw();
  }

  _checkOver() {
    let result = this.state && this.state.result;
    if (!result && this.engine && typeof this.engine.checkVictory === 'function') {
      result = this.engine.checkVictory(this.state);
    }
    if (result && result.winner) {
      this.state.result = result;
      this.screen = 'over';
      this._play(result.winner === this.state.playerFaction ? 'sfx_victory' : 'sfx_battle');
      this.requestRedraw();
    }
  }

  _refreshVM() {
    if (this.engine && typeof this.engine.viewModel === 'function') {
      try { this.vm = this.engine.viewModel(this.state); } catch (e) { this.vm = null; }
    }
  }

  // Annotate state with legal targets for the renderer's highlight.
  _syncSelected() {
    if (this.state) {
      this.state.selected = this.selectedId;
      this.state.legalTargets = this._legalTargets(this.selectedId);
    }
  }

  _legalTargets(provId) {
    if (!provId || !this.state) return null;
    if (this.engine && typeof this.engine.legalMoves === 'function') {
      try { return this.engine.legalMoves(this.state, provId) || []; } catch (e) {}
    }
    // fallback: adjacency from map data
    const p = (PROVINCES || []).find(x => x.id === provId);
    return p ? (p.neighbors || []) : [];
  }

  _centerOnCapital(faction) {
    const fac = FACTIONS[faction];
    const capId = fac && fac.capital;
    const node = capId && this.renderer.nodes[capId];
    if (node) { this.camera.zoom = 1.4; this.centerOn(node.x, node.y); }
  }

  // ---- pointer plumbing from main.js. Returns true if consumed (HUD chrome). ----
  onPointerDown(p) {
    // Modal / screen buttons take priority.
    const hit = this._hitButton(p);
    if (hit) { this._pressed = hit; return true; }
    if (this.isModal()) return true; // swallow world drags while a modal/start screen is up
    return false;
  }
  onPointerMove(p) {
    if (this.screen === 'play' && !this.modal) {
      this._hoverId = this.renderer.pickProvince(p.x, p.y, this.camera);
    }
    return false;
  }
  onPointerUp(p) {
    const pressed = this._pressed;
    this._pressed = null;
    if (pressed) {
      const hit = this._hitButton(p);
      if (hit && hit.id === pressed.id) {
        // Start-screen faction cards mutate local choice, not the engine.
        if (pressed.cmd && pressed.cmd.type === '_pickFaction') {
          this.startChoice = pressed.cmd.faction;
          this.requestRedraw();
        } else {
          this.dispatch(pressed.cmd);
        }
        return true;
      }
      return true;
    }
    return false;
  }

  // World tap (called only when not consumed by HUD and gesture was a tap).
  onTap(p) {
    if (this.screen !== 'play' || this.modal) return;
    const provId = this.renderer.pickProvince(p.x, p.y, this.camera);
    if (!provId) { this.dispatch({ type: 'deselect' }); return; }
    this._handleProvinceTap(provId);
  }

  _handleProvinceTap(provId) {
    const player = this.state.playerFaction;
    const prov = this.state.provinces[provId];
    const owner = prov ? prov.owner : NEUTRAL;

    // No selection yet, or tapping same province.
    if (!this.selectedId) {
      this.dispatch({ type: 'select', provId });
      return;
    }
    if (provId === this.selectedId) {
      // re-tap own province -> keep panel open (toggle off if not yours)
      if (owner !== player) this.dispatch({ type: 'deselect' });
      return;
    }

    const legal = this._legalTargets(this.selectedId) || [];
    const fromProv = this.state.provinces[this.selectedId];
    const fromOwner = fromProv ? fromProv.owner : NEUTRAL;

    // Selected own province, tapping an adjacent legal target -> move/attack.
    if (fromOwner === player && legal.includes(provId)) {
      if (owner === player) {
        // friendly move
        this.modal = { kind: 'confirm', textKey: 'confirm.move',
          action: { type: 'move', fromId: this.selectedId, toId: provId } };
      } else {
        // enemy/neutral -> battle, confirm
        this.modal = { kind: 'confirm', textKey: 'confirm.attack',
          action: { type: 'move', fromId: this.selectedId, toId: provId } };
      }
      this.requestRedraw();
      return;
    }
    // Otherwise just reselect.
    this.dispatch({ type: 'select', provId });
  }

  _showBattle(battle) {
    this.modal = { kind: 'battle', battle };
    this.requestRedraw();
  }

  // ---- DRAW (HUD + overlays). Renderer drew the map already. ----
  draw(ctx, W, H) {
    this.W = W; this.H = H;
    this.buttons = [];
    if (this.screen === 'start') { this._drawStart(ctx, W, H); return; }

    this._drawTopBar(ctx, W, H);
    this._drawToolbar(ctx, W, H);
    if (this.screen === 'play') {
      if (this.selectedId) this._drawActionPanel(ctx, W, H);
      this._drawEndTurn(ctx, W, H);
    }
    if (this.modal) {
      if (this.modal.kind === 'battle') this._drawBattleModal(ctx, W, H);
      else if (this.modal.kind === 'confirm') this._drawConfirm(ctx, W, H);
    }
    if (this.screen === 'over') this._drawOver(ctx, W, H);
  }

  // ---- button helper: registers a hit rect + draws it ----
  _btn(ctx, id, x, y, w, h, label, cmd, opts = {}) {
    this.buttons.push({ id, x, y, w, h, cmd });
    const pressed = this._pressed && this._pressed.id === id;
    ctx.fillStyle = opts.fill || (pressed ? PALETTE.bronze : 'rgba(20,18,12,0.9)');
    this._roundRect(ctx, x, y, w, h, opts.r || 8);
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = opts.stroke || PALETTE.bronzeLight;
    this._roundRect(ctx, x, y, w, h, opts.r || 8);
    ctx.stroke();
    ctx.fillStyle = opts.color || PALETTE.gold;
    ctx.font = opts.font || `bold ${Math.round(h * 0.4)}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  _hitButton(p) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
    }
    return null;
  }

  _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  _panel(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(16,14,9,0.92)';
    this._roundRect(ctx, x, y, w, h, 10); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = PALETTE.bronze;
    this._roundRect(ctx, x, y, w, h, 10); ctx.stroke();
  }

  // ---- Start screen: faction select ----
  _drawStart(ctx, W, H) {
    ctx.fillStyle = '#0f1117'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H * 0.4, Math.max(W, H));
    g.addColorStop(0, '#241d2e'); g.addColorStop(1, '#0c0a10');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold ${Math.min(34, W * 0.06)}px "Trebuchet MS", serif`;
    ctx.textAlign = 'center';
    ctx.fillText(this.t('app.title'), W / 2, H * 0.16);
    ctx.fillStyle = PALETTE.bone;
    ctx.font = `${Math.min(18, W * 0.04)}px "Trebuchet MS", sans-serif`;
    ctx.fillText(this.t('start.choose'), W / 2, H * 0.24);
    ctx.textAlign = 'start';

    const facs = (PLAYABLE && PLAYABLE.length ? PLAYABLE : ['human', 'elf', 'orc']);
    const cardW = Math.min(150, (W - 60) / facs.length - 12);
    const cardH = cardW * 1.15;
    const gap = 14;
    const totalW = facs.length * cardW + (facs.length - 1) * gap;
    let cx = (W - totalW) / 2;
    const cy = H * 0.34;
    for (const f of facs) {
      const fac = FACTIONS[f] || {};
      const selected = this.startChoice === f;
      this.buttons.push({ id: 'fac_' + f, x: cx, y: cy, w: cardW, h: cardH,
        cmd: { type: '_pickFaction', faction: f } });
      ctx.fillStyle = selected ? 'rgba(59,111,212,0.20)' : 'rgba(20,18,12,0.85)';
      this._roundRect(ctx, cx, cy, cardW, cardH, 10); ctx.fill();
      ctx.lineWidth = selected ? 3 : 1.6;
      ctx.strokeStyle = selected ? PALETTE.gold : PALETTE.bronze;
      this._roundRect(ctx, cx, cy, cardW, cardH, 10); ctx.stroke();
      this.renderer.drawCrest(ctx, f, cx + cardW / 2 - cardW * 0.3, cy + 16, cardW * 0.6);
      ctx.fillStyle = fac.color || PALETTE.bone;
      ctx.font = `bold ${Math.round(cardW * 0.14)}px "Trebuchet MS", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(this.t((fac.nameKey) || ('fac.' + f)), cx + cardW / 2, cy + cardH - 16);
      ctx.textAlign = 'start';
      cx += cardW + gap;
    }
    // Begin button
    const bw = Math.min(220, W * 0.6), bh = 48;
    this._btn(ctx, 'begin', (W - bw) / 2, H * 0.78, bw, bh, this.t('start.begin'),
      { type: 'startGame', faction: this.startChoice },
      { fill: 'rgba(59,111,212,0.85)', color: '#fff', stroke: PALETTE.gold });

    // lang + audio toggles
    this._drawToolbar(ctx, W, H);
  }

  // ---- Top resource bar ----
  _drawTopBar(ctx, W, H) {
    const h = 46;
    ctx.fillStyle = 'rgba(12,10,7,0.9)';
    ctx.fillRect(0, 0, W, h);
    ctx.fillStyle = PALETTE.bronze; ctx.fillRect(0, h - 2, W, 2);

    const player = this.state.playerFaction;
    const fac = FACTIONS[player] || {};
    // crest
    this.renderer.drawCrest(ctx, player, 6, 5, h - 12);
    ctx.fillStyle = fac.color || PALETTE.gold;
    ctx.font = `bold 15px "Trebuchet MS", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(this.t(fac.nameKey || ('fac.' + player)), h, h / 2);

    // adena
    const adena = (this.state.factions && this.state.factions[player] && this.state.factions[player].adena) || 0;
    ctx.textAlign = 'right'; ctx.fillStyle = PALETTE.gold;
    ctx.fillText(`${this.t('hud.adena')}: ${adena}`, W - 12, h / 2);
    // turn
    ctx.textAlign = 'center'; ctx.fillStyle = PALETTE.bone;
    ctx.fillText(`${this.t('hud.turn')} ${this.state.turn || 1}`, W / 2, h / 2);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  // ---- bottom-left toolbar (lang + audio) ----
  _drawToolbar(ctx, W, H) {
    const bw = 64, bh = 30, pad = 8;
    const y = H - bh - pad;
    this._btn(ctx, 'lang', pad, y, bw, bh, this.t('lang.toggle'),
      { type: 'toggleLang' }, { r: 6, font: 'bold 13px sans-serif' });
    this._btn(ctx, 'audio', pad + bw + 6, y, bw + 24, bh,
      this.t(this.audioOn ? 'audio.on' : 'audio.off'),
      { type: 'toggleAudio' }, { r: 6, font: '12px sans-serif',
        color: this.audioOn ? PALETTE.gold : PALETTE.neutral });
  }

  // ---- bottom action panel for the selected province ----
  _drawActionPanel(ctx, W, H) {
    const prov = this.state.provinces[this.selectedId];
    if (!prov) return;
    const owner = prov.owner;
    const player = this.state.playerFaction;
    const own = owner === player;

    const panelH = own ? Math.min(190, H * 0.42) : 86;
    const x = 8, w = W - 16, y = H - panelH - 46;
    this._panel(ctx, x, y, w, panelH);

    // header: province name + garrison summary
    const prdata = (PROVINCES || []).find(p => p.id === this.selectedId) || {};
    ctx.fillStyle = (FACTIONS[owner] && FACTIONS[owner].color) || PALETTE.neutral;
    ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
    ctx.fillText(this.t(prdata.nameKey || ('prov.' + this.selectedId)), x + 12, y + 22);

    // garrison line
    ctx.fillStyle = PALETTE.bone; ctx.font = '12px sans-serif';
    const gar = prov.garrison || {};
    const garKeys = Object.keys(gar).filter(u => gar[u] > 0);
    const garStr = garKeys.length
      ? garKeys.map(u => `${this.t((UNITS[u] && UNITS[u].nameKey) || ('unit.' + u))} ${gar[u]}`).join('  ')
      : this.t('panel.empty');
    ctx.fillText(`${this.t('panel.garrison')}: ${garStr}`, x + 12, y + 40);

    if (!own) {
      ctx.fillStyle = PALETTE.gold; ctx.font = '12px sans-serif';
      ctx.fillText(this.t('panel.move'), x + 12, y + 64);
      return;
    }

    // recruit buttons (faction roster intersected with province availability)
    const roster = (FACTIONS[player] && FACTIONS[player].roster) || Object.keys(UNITS);
    const recruitable = roster.filter(u => UNITS[u] && (!UNITS[u].factions || UNITS[u].factions.includes(player)));
    const adena = (this.state.factions[player] && this.state.factions[player].adena) || 0;
    const cols = 3;
    const bw = (w - 24 - (cols - 1) * 8) / cols;
    const bh = 40;
    let bx = x + 12, by = y + 52;
    let col = 0;
    for (const u of recruitable) {
      const unit = UNITS[u];
      const cost = this._unitCost(unit, player);
      const affordable = adena >= cost;
      // custom two-line button (name + cost)
      this.buttons.push({ id: 'recruit_' + u, x: bx, y: by, w: bw, h: bh,
        cmd: { type: 'recruit', provId: this.selectedId, unitId: u, n: 1 } });
      const pressed = this._pressed && this._pressed.id === 'recruit_' + u;
      ctx.fillStyle = pressed ? PALETTE.bronze : (affordable ? 'rgba(20,18,12,0.92)' : 'rgba(40,30,30,0.6)');
      this._roundRect(ctx, bx, by, bw, bh, 7); ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = affordable ? PALETTE.bronzeLight : PALETTE.neutral;
      this._roundRect(ctx, bx, by, bw, bh, 7); ctx.stroke();
      ctx.fillStyle = affordable ? PALETTE.gold : PALETTE.neutral;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
      ctx.fillText(this.t(unit.nameKey || ('unit.' + u)), bx + bw / 2, by + bh * 0.34);
      ctx.font = '10px sans-serif';
      ctx.fillStyle = PALETTE.bone;
      ctx.fillText(`${this.t('panel.cost')} ${cost}`, bx + bw / 2, by + bh * 0.72);
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      col++;
      if (col >= cols) { col = 0; bx = x + 12; by += bh + 6; }
      else bx += bw + 8;
    }
    if (col !== 0) by += bh + 6;

    // Fortify + move hint row
    const fy = y + panelH - 38;
    const fortLabel = this.t('panel.fortify') + (prov.fortified ? ' ✓' : '');
    this._btn(ctx, 'fortify', x + 12, fy, (w - 24) * 0.4, 30, fortLabel,
      { type: 'fortify', provId: this.selectedId }, { r: 6, font: 'bold 12px sans-serif' });
    ctx.fillStyle = PALETTE.gold; ctx.font = '11px sans-serif';
    ctx.fillText(this.t('panel.move'), x + 12 + (w - 24) * 0.42, fy + 20);
  }

  _unitCost(unit, faction) {
    let cost = unit.cost || 0;
    const fac = FACTIONS[faction];
    if (fac && fac.costMul) cost = Math.round(cost * fac.costMul);
    return cost;
  }

  _drawEndTurn(ctx, W, H) {
    const bw = 130, bh = 38;
    const x = W - bw - 8, y = H - bh - 8;
    this._btn(ctx, 'endTurn', x, y, bw, bh, this.t('hud.endTurn'),
      { type: 'endTurn' }, { fill: 'rgba(59,111,212,0.85)', color: '#fff', stroke: PALETTE.gold, r: 8 });
  }

  // ---- battle result modal (localizes engine log via t) ----
  _drawBattleModal(ctx, W, H) {
    this._dim(ctx, W, H);
    const w = Math.min(360, W - 32), h = Math.min(420, H - 80);
    const x = (W - w) / 2, y = (H - h) / 2;
    this._panel(ctx, x, y, w, h);
    const b = this.modal.battle || {};
    const win = b.winner === 'attacker';
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold; ctx.font = 'bold 20px "Trebuchet MS", serif';
    ctx.fillText(this.t('battle.title'), x + w / 2, y + 30);
    ctx.fillStyle = win ? PALETTE.royalBlue : PALETTE.necroGlow;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(this.t(win ? 'battle.victory' : 'battle.defeat'), x + w / 2, y + 56);
    ctx.textAlign = 'left';

    // log lines (localized via t with key+params)
    ctx.font = '12px sans-serif'; ctx.fillStyle = PALETTE.bone;
    const log = b.log || [];
    let ly = y + 82;
    const maxLines = Math.floor((h - 130) / 17);
    for (let i = 0; i < Math.min(log.length, maxLines); i++) {
      const entry = log[i];
      const line = entry && entry.key ? this.t(entry.key, entry.params) : String(entry);
      ctx.fillText(this._truncate(ctx, line, w - 28), x + 14, ly);
      ly += 17;
    }
    // losses summary
    ly = y + h - 70;
    ctx.fillStyle = PALETTE.gold; ctx.font = 'bold 12px sans-serif';
    if (b.attackerLosses) ctx.fillText('-' + this._lossStr(b.attackerLosses), x + 14, ly);
    if (b.defenderLosses) ctx.fillText('-' + this._lossStr(b.defenderLosses), x + w / 2 + 4, ly);

    const bw = w - 40, bh = 40;
    this._btn(ctx, 'battleContinue', x + 20, y + h - 50, bw, bh, this.t('battle.continue'),
      { type: 'closeModal' }, { fill: 'rgba(59,111,212,0.85)', color: '#fff', stroke: PALETTE.gold });
    ctx.textAlign = 'start';
  }

  _lossStr(losses) {
    return Object.keys(losses).filter(u => losses[u] > 0)
      .map(u => `${this.t((UNITS[u] && UNITS[u].nameKey) || ('unit.' + u))} ${losses[u]}`).join(', ') || '0';
  }

  _truncate(ctx, s, maxW) {
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  // ---- confirm modal ----
  _drawConfirm(ctx, W, H) {
    this._dim(ctx, W, H);
    const w = Math.min(300, W - 40), h = 150;
    const x = (W - w) / 2, y = (H - h) / 2;
    this._panel(ctx, x, y, w, h);
    ctx.fillStyle = PALETTE.bone; ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.t(this.modal.textKey), x + w / 2, y + 44);
    ctx.textAlign = 'start';
    const bw = (w - 36) / 2, bh = 42, by = y + h - 56;
    this._btn(ctx, 'confirmYes', x + 12, by, bw, bh, this.t('confirm.yes'),
      { type: 'confirmYes' }, { fill: 'rgba(59,111,212,0.85)', color: '#fff', stroke: PALETTE.gold });
    this._btn(ctx, 'confirmNo', x + 24 + bw, by, bw, bh, this.t('confirm.no'),
      { type: 'confirmNo' });
  }

  // ---- victory / defeat screen ----
  _drawOver(ctx, W, H) {
    this._dim(ctx, W, H, 0.82);
    const win = this.state.result && this.state.result.winner === this.state.playerFaction;
    ctx.textAlign = 'center';
    ctx.fillStyle = win ? PALETTE.gold : PALETTE.necroGlow;
    ctx.font = `bold ${Math.min(46, W * 0.1)}px "Trebuchet MS", serif`;
    ctx.fillText(this.t(win ? 'over.victory' : 'over.defeat'), W / 2, H * 0.4);
    ctx.textAlign = 'start';
    const bw = Math.min(200, W * 0.6), bh = 48;
    this._btn(ctx, 'restart', (W - bw) / 2, H * 0.55, bw, bh, this.t('over.restart'),
      { type: 'restart' }, { fill: 'rgba(59,111,212,0.85)', color: '#fff', stroke: PALETTE.gold });
  }

  _dim(ctx, W, H, a = 0.6) {
    ctx.fillStyle = `rgba(6,5,9,${a})`;
    ctx.fillRect(0, 0, W, H);
  }
}
