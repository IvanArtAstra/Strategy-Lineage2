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
    'fac.darkelf': 'Тёмные эльфы', 'fac.dwarf': 'Гномы', 'fac.kamael': 'Камаэль',
    // v2: skills panel
    'hud.skills': 'Умения',
    'skills.title': 'Умения клана',
    'skills.empty': 'Нет доступных умений',
    'skills.cooldown': 'Откат',
    'skills.ready': 'Готово',
    'skills.cost': 'Цена',
    'skills.pickTarget': 'Выберите цель умения',
    'skills.cancel': 'Отмена',
    // v2: campaign events
    'event.choose': 'Ваше решение',
    'event.result': 'Итог',
    'event.continue': 'Продолжить',
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
    'fac.darkelf': 'Dark Elves', 'fac.dwarf': 'Dwarves', 'fac.kamael': 'Kamael',
    // v2: skills panel
    'hud.skills': 'Skills',
    'skills.title': 'Clan Skills',
    'skills.empty': 'No skills available',
    'skills.cooldown': 'Cooldown',
    'skills.ready': 'Ready',
    'skills.cost': 'Cost',
    'skills.pickTarget': 'Choose a target for the skill',
    'skills.cancel': 'Cancel',
    // v2: campaign events
    'event.choose': 'Your decision',
    'event.result': 'Outcome',
    'event.continue': 'Continue',
  },
};

export class UI {
  constructor({ renderer, engine, strings, camera, requestRedraw, centerOn,
                canvas, ctx, battleUi, pauseLoop, resumeLoop }) {
    this.renderer = renderer;
    this.engine = engine;
    this.strings = strings;
    this.camera = camera;
    this.requestRedraw = requestRedraw || (() => {});
    this.centerOn = centerOn || (() => {});
    // Canvas/ctx + the tactical-battle module (battle_ui.js) are passed by main.js.
    // They may be absent on isolated branches -> we degrade to auto-resolve.
    this.canvas = canvas || (renderer && renderer.canvas) || null;
    this.ctx = ctx || (this.canvas && this.canvas.getContext && this.canvas.getContext('2d')) || null;
    this.battleUi = battleUi || null;        // module namespace with runTacticalBattle
    this.pauseLoop = pauseLoop || (() => {}); // hand the canvas to the battle screen
    this.resumeLoop = resumeLoop || (() => {});

    this.W = 0; this.H = 0;
    this.state = null;             // engine State
    this.vm = null;                // viewModel cache
    this.screen = 'start';         // 'start' | 'play' | 'over'
    this.selectedId = null;
    this._hoverId = null;
    this.modal = null;             // {kind:'battle'|'confirm'|'event', ...}
    this.lang = (strings && strings.LANG) || 'ru';
    this.audioOn = false;
    this.seed = (Date.now() & 0xffffffff) >>> 0;
    this.startChoice = (PLAYABLE && PLAYABLE[0]) || 'human';

    this.buttons = [];             // current frame hit-test rects: {id, x,y,w,h, cmd}
    this._anim = 0;
    this._audio = {};
    this._pressed = null;

    // v2 state
    this.battleBusy = false;       // true while a tactical battle owns the canvas
    this.skillsOpen = false;       // skills panel visibility
    this.startScroll = 0;          // faction-select vertical scroll offset
    this._startMaxScroll = 0;
    this.skillTarget = null;       // {skillId, target} pending target-pick mode
  }

  // Allow main.js to wire battle/canvas hooks after construction if needed.
  setBattleHooks({ canvas, ctx, battleUi, pauseLoop, resumeLoop } = {}) {
    if (canvas) this.canvas = canvas;
    if (ctx) this.ctx = ctx;
    if (battleUi) this.battleUi = battleUi;
    if (pauseLoop) this.pauseLoop = pauseLoop;
    if (resumeLoop) this.resumeLoop = resumeLoop;
  }

  async init() {
    await this._initAudio();
    await this._loadSkillData();
  }

  // Resilient: data/skills.js is owned by another branch and may be absent.
  // We use it only to enrich skill rows (nameKey/cost/target) that skillStatus()
  // doesn't carry. A static import would crash the UI module if the file is
  // missing, so we import it lazily and tolerate failure.
  async _loadSkillData() {
    this._skillData = {};
    try {
      const mod = await import('./data/skills.js');
      const list = (mod && (mod.SKILLS || mod.default)) || [];
      for (const s of list) if (s && s.id) this._skillData[s.id] = s;
    } catch (e) { /* no skill data -> rows fall back to status fields + keys */ }
  }

  // Merge engine status with static skill data (target/cost/nameKey/descKey).
  _skillMeta(id) {
    return (this._skillData && this._skillData[id]) || {};
  }

  // Resolve a name-key (e.g. 'fac.human') to its localized name, else the raw id.
  _name(nsKey, fallbackId) {
    if (this.strings && typeof this.strings.t === 'function') {
      const v = this.strings.t(nsKey);
      if (v != null && v !== nsKey) return v;
    }
    return fallbackId;
  }

  // Replace id-valued params (faction/province/unit/terrain ids) with localized
  // names so log/battle lines read "Аден", not "aden"; alias prov<->province.
  _resolveParams(params) {
    const NS = {
      attacker: 'fac.', defender: 'fac.', faction: 'fac.', winner: 'fac.',
      loser: 'fac.', owner: 'fac.', mover: 'fac.',
      prov: 'prov.', province: 'prov.', from: 'prov.', to: 'prov.', target: 'prov.',
      unit: 'unit.', terrain: 'terrain.',
    };
    const out = {};
    for (const k in params) {
      const v = params[k], ns = NS[k];
      out[k] = (ns && typeof v === 'string') ? this._name(ns + v, v) : v;
    }
    if (out.prov != null && out.province == null) out.province = out.prov;
    if (out.province != null && out.prov == null) out.prov = out.province;
    return out;
  }

  // ---- localization wrapper: always go through strings.t when available. ----
  t(key, params) {
    const p = params ? this._resolveParams(params) : params;
    if (this.strings && typeof this.strings.t === 'function') {
      const v = this.strings.t(key, p);
      if (v != null && v !== key) return v;
    }
    const tbl = FALLBACK_STR[this.lang] || FALLBACK_STR.ru;
    let s = (tbl && tbl[key]) != null ? tbl[key] : key;
    if (p) for (const k in p) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), p[k]);
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

  // Scroll the faction-select grid (wheel / vertical drag on the start screen).
  // Returns true if it consumed the gesture (so main.js doesn't pan the map).
  onScroll(dy) {
    if (this.screen !== 'start' || this._startMaxScroll <= 0) return false;
    this.startScroll = Math.max(0, Math.min(this.startScroll + dy, this._startMaxScroll));
    this.requestRedraw();
    return true;
  }
  getState() { return this.screen === 'play' ? this.state : null; }
  get hoverId() { return this._hoverId; }
  set hoverId(v) { this._hoverId = v; }

  isModal() { return !!this.modal || this.battleBusy || this.screen !== 'play'; }
  animating() { return this.screen === 'play' && !this.battleBusy; } // glow pulse needs redraws on map
  // True while the tactical battle module owns the canvas; main.js skips its own draw.
  ownsCanvas() { return this.battleBusy; }
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
      case 'restart':     this.screen = 'start'; this.state = null; this.selectedId = null; this.skillsOpen = false; this.skillTarget = null; this.startScroll = 0; this.requestRedraw(); return;
      // v2 ---------------------------------------------------------------
      case 'toggleSkills':  return this._cmdToggleSkills();
      case 'pickSkill':     return this._cmdPickSkill(cmd);
      case 'cancelSkill':   this.skillTarget = null; this.requestRedraw(); return;
      case 'resolveEvent':  return this._cmdResolveEvent(cmd);
      case 'closeEvent':    return this._cmdCloseEvent();
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
    if (this.battleBusy) return;
    const { fromId, toId } = cmd;
    const fromProv = this.state.provinces[fromId];
    const units = (fromProv && fromProv.garrison) ? { ...fromProv.garrison } : {};
    // Try the v2 MANUAL battle path; on any miss/failure fall back to auto moveArmy.
    this._runMove(fromId, toId, units);
  }

  // Auto-resolve fallback: the v1 path. Always available when engine.moveArmy is.
  _autoMove(fromId, toId, units) {
    if (!this.engine || typeof this.engine.moveArmy !== 'function') return false;
    const res = this.engine.moveArmy(this.state, fromId, toId, units);
    if (res && res.state) {
      this.state = res.state;
      if (res.battle) { this._showBattle(res.battle); this._play('sfx_battle'); }
    }
    this.selectedId = toId;
    this._afterAction();
    return true;
  }

  // Manual-battle move: plan -> (if battle) run tactical screen -> apply outcome.
  // Every external call is guarded; ANY failure degrades to _autoMove.
  async _runMove(fromId, toId, units) {
    const eng = this.engine;
    // If planBattle / battle_ui / applyBattleOutcome aren't all present, go auto.
    const canPlan = eng && typeof eng.planBattle === 'function';
    const canApply = eng && typeof eng.applyBattleOutcome === 'function';
    const runBattle = this.battleUi && typeof this.battleUi.runTacticalBattle === 'function';
    if (!canPlan || !canApply || !runBattle) { this._autoMove(fromId, toId, units); return; }

    let plan;
    try { plan = eng.planBattle(this.state, fromId, toId, units); }
    catch (e) { console.warn('[ui] planBattle failed -> auto', e && e.message); this._autoMove(fromId, toId, units); return; }

    // No fight (own/empty target): planBattle already moved -> just adopt state.
    if (!plan || plan.battle !== true) {
      if (plan && plan.state) { this.state = plan.state; this.selectedId = toId; this._afterAction(); }
      else { this._autoMove(fromId, toId, units); }
      return;
    }

    // ---- MANUAL battle owns the canvas. Pause the map loop. ----
    this.battleBusy = true;
    this.modal = null;
    let pausedOk = false;
    try { this.pauseLoop(); pausedOk = true; } catch (e) { /* keep going */ }
    this._play('sfx_battle');

    let outcome = null;
    try {
      outcome = await this.battleUi.runTacticalBattle({
        canvas: this.canvas,
        ctx: this.ctx,
        attacker: plan.attacker,
        defender: plan.defender,
        terrain: plan.terrain,
        fortified: plan.fortified,
        rngState: plan.rngState,
        seed: this.state && this.state.seed,
        t: (key, params) => this.t(key, params),
        assets: this.renderer && this.renderer.images,
        lang: this.lang,
        sound: { play: (k) => this._play(k), on: this.audioOn },
      });
    } catch (e) {
      console.warn('[ui] runTacticalBattle threw -> auto-resolve', e && e.message);
      outcome = null;
    } finally {
      this.battleBusy = false;
      try { if (pausedOk) this.resumeLoop(); } catch (e) {}
    }

    if (!outcome) { this._autoMove(fromId, toId, units); return; }

    // Apply the (manual) outcome to the map via the engine.
    try {
      const res = eng.applyBattleOutcome(this.state, fromId, toId, units, outcome);
      if (res && res.state) this.state = res.state;
      this._showBattle(outcome);
    } catch (e) {
      console.warn('[ui] applyBattleOutcome failed -> auto-resolve', e && e.message);
      this._autoMove(fromId, toId, units);
      return;
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
    if (this.screen !== 'play' || this.modal || this.battleBusy) return;
    if (!this.engine || typeof this.engine.endTurn !== 'function') return;
    this.state = this.engine.endTurn(this.state) || this.state;
    this._afterAction();
    this._maybeShowEvent();
    this._checkOver();
  }

  // v2: a campaign event may have fired during endTurn. Show it as a modal.
  _maybeShowEvent() {
    const ev = this.state && this.state.pendingEvent;
    if (!ev) return;
    // Expected shape: { id, titleKey, descKey, choices:[{id, labelKey}] }
    this.modal = { kind: 'event', event: ev, result: null };
    this._play('sfx_select');
    this.requestRedraw();
  }

  _cmdResolveEvent(cmd) {
    const m = this.modal;
    if (!m || m.kind !== 'event') return;
    if (this.engine && typeof this.engine.resolveEvent === 'function') {
      try {
        this.state = this.engine.resolveEvent(this.state, cmd.choiceId) || this.state;
      } catch (e) { console.warn('[ui] resolveEvent failed', e && e.message); }
    }
    // Show the chosen result line (from the just-applied choice), then a Continue.
    const ev = m.event || {};
    const choice = (ev.choices || []).find(c => c.id === cmd.choiceId);
    m.result = (choice && choice.resultKey) || null;
    // Engine clears state.pendingEvent on resolve; keep modal until user dismisses.
    this._refreshVM();
    this.requestRedraw();
  }

  _cmdCloseEvent() {
    this.modal = null;
    if (this.state) this.state.pendingEvent = null;
    this._afterAction();
    this._checkOver();
  }

  _cmdConfirmYes() {
    const m = this.modal;
    this.modal = null;
    if (m && m.kind === 'confirm' && m.action) this.dispatch(m.action);
    else this.requestRedraw();
  }

  // ---- v2: clan skills -------------------------------------------------
  // Returns the engine's skill status list, or [] (panel hides) when absent.
  _skillStatus() {
    if (!this.engine || typeof this.engine.skillStatus !== 'function') return [];
    try {
      const list = this.engine.skillStatus(this.state);
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  // Whether the skills feature exists at all (drives the HUD button visibility).
  _hasSkills() { return this._skillStatus().length > 0; }

  _cmdToggleSkills() {
    if (this.screen !== 'play' || this.battleBusy) return;
    if (!this._hasSkills()) { this.skillsOpen = false; this.requestRedraw(); return; }
    this.skillsOpen = !this.skillsOpen;
    this.skillTarget = null;
    this.requestRedraw();
  }

  _cmdPickSkill(cmd) {
    const list = this._skillStatus();
    const st = list.find(s => s.id === cmd.skillId);
    if (!st || !st.ready) { this.requestRedraw(); return; }
    // Determine target requirement: command -> status -> data/skills.js meta.
    const target = cmd.target || (st && st.target) || this._skillMeta(cmd.skillId).target || 'none';
    if (target && target !== 'none') {
      // Enter target-pick mode; the next province tap supplies the target.
      this.skillTarget = { skillId: cmd.skillId, target };
      this.skillsOpen = false;
      this.requestRedraw();
      return;
    }
    this._activateSkill(cmd.skillId, null);
  }

  _activateSkill(skillId, targetProvId) {
    if (!this.engine || typeof this.engine.activateSkill !== 'function') {
      this.skillTarget = null; this.requestRedraw(); return;
    }
    try {
      this.state = this.engine.activateSkill(this.state, skillId, targetProvId) || this.state;
      // Skill VFX on the affected province (target, else player capital).
      const fx = targetProvId || this._playerCapitalId();
      const color = this._playerAccent();
      if (this.renderer && typeof this.renderer.spawnSkillFx === 'function') {
        this.renderer.spawnSkillFx(fx, this._skillFxKind(skillId), color);
      }
      this._play('sfx_select');
    } catch (e) { console.warn('[ui] activateSkill failed', e && e.message); }
    this.skillTarget = null;
    this.skillsOpen = false;
    this._afterAction();
    this._checkOver();
  }

  _skillFxKind(skillId) {
    const s = String(skillId || '');
    if (s.includes('smite') || s.includes('strike')) return 'smite';
    if (s.includes('heal') || s.includes('bless')) return 'heal';
    if (s.includes('summon')) return 'summon';
    if (s.includes('fortify')) return 'fortify';
    if (s.includes('scry') || s.includes('reveal')) return 'scry';
    return 'generic';
  }

  _playerCapitalId() {
    const fac = this.state && FACTIONS[this.state.playerFaction];
    return (fac && fac.capital) || this.selectedId || null;
  }

  _playerAccent() {
    const fac = this.state && FACTIONS[this.state.playerFaction];
    return (fac && (fac.accent || fac.color)) || PALETTE.gold;
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
    // Start screen: let the background become draggable so the card grid scrolls.
    if (this.screen === 'start') return this._startMaxScroll <= 0;
    if (this.screen === 'over') return true; // game-over: swallow background drags
    if (this.modal || this.battleBusy) return true; // swallow world drags under a modal/battle
    if (this.skillsOpen) return true; // swallow background taps under the skills panel
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
    if (this.screen !== 'play' || this.modal || this.battleBusy) return;
    const provId = this.renderer.pickProvince(p.x, p.y, this.camera);

    // Skill target-pick mode: the tap chooses the skill's target province.
    if (this.skillTarget) {
      if (!provId) { return; } // tap empty space = keep waiting (cancel via button)
      const valid = this._skillTargetValid(provId, this.skillTarget.target);
      if (valid) { this._activateSkill(this.skillTarget.skillId, provId); }
      return;
    }

    if (!provId) { this.dispatch({ type: 'deselect' }); return; }
    this._handleProvinceTap(provId);
  }

  // Validate a tapped province against a skill's target requirement.
  _skillTargetValid(provId, target) {
    const prov = this.state && this.state.provinces[provId];
    if (!prov) return false;
    const player = this.state.playerFaction;
    if (target === 'ownProvince') return prov.owner === player;
    if (target === 'enemyProvince') return prov.owner !== player && prov.owner !== NEUTRAL;
    return true; // 'any' / unknown -> accept
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

    // While the tactical battle owns the canvas, draw no HUD (it has its own).
    if (this.battleBusy) return;

    this._drawTopBar(ctx, W, H);
    this._drawToolbar(ctx, W, H);
    if (this.screen === 'play') {
      if (this.skillTarget) this._drawSkillTargetBanner(ctx, W, H);
      else if (this.selectedId) this._drawActionPanel(ctx, W, H);
      this._drawEndTurn(ctx, W, H);
      this._drawSkillsButton(ctx, W, H);
      if (this.skillsOpen) this._drawSkillsPanel(ctx, W, H);
    }
    if (this.modal) {
      if (this.modal.kind === 'battle') this._drawBattleModal(ctx, W, H);
      else if (this.modal.kind === 'confirm') this._drawConfirm(ctx, W, H);
      else if (this.modal.kind === 'event') this._drawEventModal(ctx, W, H);
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
    // Responsive grid: up to 3 columns, wraps to as many rows as needed (6 -> 3x2).
    const gridTop = H * 0.30;
    const beginH = 48;
    const gridBottom = H * 0.86 - beginH - 14;   // leave room for Begin button + toolbar
    const cols = Math.max(1, Math.min(3, facs.length, Math.floor((W - 24) / 110)));
    const gap = 12;
    const sidePad = 16;
    const cardW = Math.min(150, (W - sidePad * 2 - (cols - 1) * gap) / cols);
    const cardH = cardW * 1.15;
    const rows = Math.ceil(facs.length / cols);
    const gridW = cols * cardW + (cols - 1) * gap;
    const x0 = (W - gridW) / 2;
    const fullGridH = rows * cardH + (rows - 1) * gap;
    const viewH = Math.max(cardH, gridBottom - gridTop);
    // Vertical scroll when the grid overflows the available band (phone-friendly).
    this._startMaxScroll = Math.max(0, fullGridH - viewH);
    this.startScroll = Math.max(0, Math.min(this.startScroll, this._startMaxScroll));
    const scroll = this.startScroll;

    // Clip the scrollable card region.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, gridTop, W, viewH);
    ctx.clip();
    for (let i = 0; i < facs.length; i++) {
      const f = facs[i];
      const col = i % cols, row = Math.floor(i / cols);
      const cx = x0 + col * (cardW + gap);
      const cy = gridTop + row * (cardH + gap) - scroll;
      // cull fully-offscreen cards but still register hit rects in-band
      const fac = FACTIONS[f] || {};
      const selected = this.startChoice === f;
      // Only register hittable cards whose center is within the visible band.
      const centerY = cy + cardH / 2;
      if (centerY > gridTop - cardH && centerY < gridTop + viewH + cardH) {
        this.buttons.push({ id: 'fac_' + f, x: cx, y: cy, w: cardW, h: cardH,
          cmd: { type: '_pickFaction', faction: f } });
      }
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
    }
    ctx.restore();

    // Scroll affordance arrows when content overflows.
    if (this._startMaxScroll > 0) {
      ctx.fillStyle = PALETTE.gold; ctx.textAlign = 'center';
      ctx.font = 'bold 16px sans-serif';
      if (scroll > 1) ctx.fillText('▲', W / 2, gridTop - 4);
      if (scroll < this._startMaxScroll - 1) ctx.fillText('▼', W / 2, gridTop + viewH + 14);
      ctx.textAlign = 'start';
    }

    // Begin button
    const bw = Math.min(220, W * 0.6), bh = beginH;
    this._btn(ctx, 'begin', (W - bw) / 2, H * 0.86 - bh, bw, bh, this.t('start.begin'),
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

  // ---- v2: Skills HUD button (hidden when the skills system is absent) ----
  _drawSkillsButton(ctx, W, H) {
    if (!this._hasSkills()) return; // gracefully hide if no skills
    const bw = 110, bh = 38;
    const x = W - bw - 8, y = H - bh - 8 - 38 - 8; // above end-turn
    this._btn(ctx, 'skills', x, y, bw, bh, this.t('hud.skills'),
      { type: 'toggleSkills' },
      { fill: this.skillsOpen ? 'rgba(125,63,176,0.9)' : 'rgba(20,18,12,0.9)',
        color: PALETTE.gold, stroke: PALETTE.bronzeLight, r: 8 });
  }

  // ---- v2: Skills panel: lists skillStatus() with cost/cooldown/ready ----
  _drawSkillsPanel(ctx, W, H) {
    const list = this._skillStatus();
    if (!list.length) { this.skillsOpen = false; return; }
    const rowH = 50, headH = 36, pad = 10;
    const w = Math.min(360, W - 24);
    const h = Math.min(H - 100, headH + list.length * (rowH + 6) + pad * 2);
    const x = (W - w) / 2, y = (H - h) / 2;
    this._panel(ctx, x, y, w, h);
    ctx.fillStyle = PALETTE.gold; ctx.font = 'bold 16px "Trebuchet MS", serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.t('skills.title'), x + w / 2, y + 24);
    ctx.textAlign = 'start';

    let ry = y + headH + pad;
    const rw = w - pad * 2;
    for (const s of list) {
      const meta = this._skillMeta(s.id);
      const target = s.target || meta.target || 'none';
      const cost = (s.cost != null) ? s.cost : meta.cost;
      const nameKey = s.nameKey || meta.nameKey || ('sk.' + s.id + '.name');
      const rx = x + pad;
      const ready = !!s.ready && (s.affordable !== false);
      this.buttons.push({ id: 'skill_' + s.id, x: rx, y: ry, w: rw, h: rowH,
        cmd: { type: 'pickSkill', skillId: s.id, target } });
      const pressed = this._pressed && this._pressed.id === 'skill_' + s.id;
      ctx.fillStyle = pressed ? PALETTE.bronze
        : (ready ? 'rgba(40,30,55,0.92)' : 'rgba(34,30,26,0.7)');
      this._roundRect(ctx, rx, ry, rw, rowH, 8); ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = ready ? PALETTE.necroGlow : PALETTE.neutral;
      this._roundRect(ctx, rx, ry, rw, rowH, 8); ctx.stroke();

      // name
      ctx.fillStyle = ready ? PALETTE.gold : PALETTE.neutral;
      ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
      ctx.fillText(this.t(nameKey), rx + 12, ry + 20);
      // cost + status sub-line
      ctx.fillStyle = PALETTE.bone; ctx.font = '11px sans-serif';
      const cd = (s.cooldownLeft || 0);
      const statusTxt = ready
        ? this.t('skills.ready')
        : (cd > 0 ? `${this.t('skills.cooldown')} ${cd}` : this.t('skills.cost'));
      const costTxt = (cost != null) ? `${this.t('skills.cost')} ${cost}` : '';
      ctx.fillText(`${costTxt}   ${statusTxt}`, rx + 12, ry + 38);
      // ready pip
      ctx.beginPath(); ctx.arc(rx + rw - 16, ry + rowH / 2, 5, 0, Math.PI * 2);
      ctx.fillStyle = ready ? PALETTE.royalBlue : PALETTE.neutral; ctx.fill();
      ry += rowH + 6;
    }

    // close button
    const cw = w - pad * 2, ch = 34;
    if (ry + ch + pad <= y + h) {
      this._btn(ctx, 'skillsClose', x + pad, y + h - ch - pad, cw, ch,
        this.t('panel.close'), { type: 'toggleSkills' }, { r: 6, font: 'bold 12px sans-serif' });
    } else {
      this._btn(ctx, 'skillsClose', x + pad, y + h - ch - 4, cw, ch,
        this.t('panel.close'), { type: 'toggleSkills' }, { r: 6, font: 'bold 12px sans-serif' });
    }
  }

  // ---- v2: target-pick banner shown while waiting for a skill target tap ----
  _drawSkillTargetBanner(ctx, W, H) {
    const h = 56, y = H - h - 54, x = 8, w = W - 16;
    this._panel(ctx, x, y, w, h);
    ctx.fillStyle = PALETTE.gold; ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
    ctx.fillText(this.t('skills.pickTarget'), x + 12, y + 24);
    const bw = 110, bh = 30;
    this._btn(ctx, 'skillCancel', x + w - bw - 12, y + (h - bh) / 2, bw, bh,
      this.t('skills.cancel'), { type: 'cancelSkill' }, { r: 6, font: 'bold 12px sans-serif' });
  }

  // ---- v2: campaign event modal (title/desc + choices, then result) ----
  _drawEventModal(ctx, W, H) {
    this._dim(ctx, W, H, 0.7);
    const m = this.modal, ev = m.event || {};
    const w = Math.min(380, W - 28), h = Math.min(440, H - 70);
    const x = (W - w) / 2, y = (H - h) / 2;
    this._panel(ctx, x, y, w, h);

    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold; ctx.font = 'bold 18px "Trebuchet MS", serif';
    ctx.fillText(this.t(ev.titleKey || ('ev.' + (ev.id || 'unknown') + '.title')), x + w / 2, y + 30);
    ctx.textAlign = 'left';

    // description (wrapped)
    ctx.fillStyle = PALETTE.bone; ctx.font = '13px sans-serif';
    const desc = this.t(ev.descKey || ('ev.' + (ev.id || 'unknown') + '.desc'));
    let ly = y + 56;
    ly = this._wrapText(ctx, desc, x + 16, ly, w - 32, 18);

    if (!m.result) {
      // choice buttons
      ctx.fillStyle = PALETTE.gold; ctx.font = 'bold 12px sans-serif';
      ctx.fillText(this.t('event.choose'), x + 16, ly + 8);
      let by = ly + 18;
      const bw = w - 32, bh = 40;
      for (const c of (ev.choices || [])) {
        if (by + bh > y + h - 10) break;
        this._btn(ctx, 'evChoice_' + c.id, x + 16, by, bw, bh,
          this.t(c.labelKey || ('ev.' + (ev.id || '?') + '.' + c.id)),
          { type: 'resolveEvent', choiceId: c.id },
          { fill: 'rgba(40,30,55,0.92)', color: PALETTE.gold, stroke: PALETTE.necroGlow, r: 7,
            font: 'bold 12px sans-serif' });
        by += bh + 8;
      }
    } else {
      // result line + continue
      ctx.fillStyle = PALETTE.royalBlue; ctx.font = 'bold 13px sans-serif';
      ctx.fillText(this.t('event.result'), x + 16, ly + 8);
      ctx.fillStyle = PALETTE.bone; ctx.font = '13px sans-serif';
      this._wrapText(ctx, this.t(m.result), x + 16, ly + 28, w - 32, 18);
      const bw = w - 32, bh = 42;
      this._btn(ctx, 'evContinue', x + 16, y + h - bh - 12, bw, bh,
        this.t('event.continue'), { type: 'closeEvent' },
        { fill: 'rgba(59,111,212,0.85)', color: '#fff', stroke: PALETTE.gold });
    }
    ctx.textAlign = 'start';
  }

  // Word-wrap helper; returns the y after the last line.
  _wrapText(ctx, text, x, y, maxW, lineH) {
    const words = String(text).split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y); y += lineH; line = word;
      } else line = test;
    }
    if (line) { ctx.fillText(line, x, y); y += lineH; }
    return y;
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
