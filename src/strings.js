// src/strings.js — contract H (content-lore)
// Native ES module. RU is primary/default; EN complete too.
// Every player-visible string lives here. Log templates use {param} placeholders.

export const STR = {
  ru: {
    // — App —
    'app.title': 'Lineage II: Троны Адена',
    'app.subtitle': 'Стратегия завоевания континента Аден',

    // — Factions —
    'fac.human': 'Королевство Аден',
    'fac.elf': 'Лес Эльмора',
    'fac.orc': 'Клан Шуттгарт',
    'fac.shilen': 'Легион Нежити Шилен',

    // — Units —
    'unit.knight': 'Рыцарь',
    'unit.gladiator': 'Гладиатор',
    'unit.ranger': 'Соколиный Глаз',
    'unit.sorcerer': 'Чародей',
    'unit.bishop': 'Епископ',
    'unit.destroyer': 'Разрушитель',
    'unit.wraith': 'Призрак',
    'unit.bonearcher': 'Костяной Лучник',
    'unit.necromancer': 'Некромант',

    // — Unit types —
    'type.inf': 'Пехота',
    'type.arch': 'Лучники',
    'type.cav': 'Тяжёлая конница',
    'type.mag': 'Маги',
    'type.heal': 'Целители',
    'type.undead': 'Нежить',

    // — Provinces —
    'prov.schuttgart': 'Шуттгарт',
    'prov.innadril': 'Иннадрил',
    'prov.elvenforest': 'Эльфийский Лес',
    'prov.darkelf': 'Деревня Тёмных Эльфов',
    'prov.gludio': 'Глудио',
    'prov.floran': 'Флоран',
    'prov.dion': 'Дион',
    'prov.giran': 'Гиран',
    'prov.oren': 'Орен',
    'prov.aden': 'Аден',
    'prov.hardins': 'Академия Хардина',
    'prov.wastelands': 'Пустоши',
    'prov.goddard': 'Годдард',
    'prov.rune': 'Руна',

    // — Terrain —
    'terrain.plains': 'Равнина',
    'terrain.forest': 'Лес',
    'terrain.mountain': 'Горы',
    'terrain.swamp': 'Болото',
    'terrain.coast': 'Побережье',

    // — Resource bar / HUD —
    'ui.adena': 'Адена',
    'ui.turn': 'Ход',
    'ui.faction': 'Фракция',
    'ui.upkeep': 'Содержание',
    'ui.income': 'Доход',
    'ui.castle': 'Замок',
    'ui.garrison': 'Гарнизон',
    'ui.fortified': 'Укреплён',
    'ui.neutral': 'Нейтральная провинция',
    'ui.goal': 'Цель: захватите три коронных замка — Глудио, Гиран и Аден.',

    // — Actions —
    'ui.recruit': 'Нанять',
    'ui.fortify': 'Укрепить',
    'ui.move': 'Двигаться',
    'ui.attack': 'Атаковать',
    'ui.endTurn': 'Завершить ход',
    'ui.cancel': 'Отмена',
    'ui.confirm': 'Подтвердить',
    'ui.close': 'Закрыть',
    'ui.cost': 'Стоимость',

    // — Recruit panel —
    'ui.recruitTitle': 'Набор войск',
    'ui.recruitCount': 'Количество',
    'ui.notEnoughAdena': 'Недостаточно адены.',
    'ui.notYourProvince': 'Это не ваша провинция.',
    'ui.cannotRecruitHere': 'Здесь нельзя нанять этот отряд.',

    // — Battle result —
    'ui.battleTitle': 'Итог сражения',
    'ui.battleWin': 'Победа!',
    'ui.battleLoss': 'Поражение',
    'ui.attackerLosses': 'Потери атакующих',
    'ui.defenderLosses': 'Потери защитников',
    'ui.rounds': 'Раунды',

    // — Win / lose —
    'ui.victoryTitle': 'Триумф над Аденом',
    'ui.victoryBody': 'Три короны ваши. Аден склоняется перед своим новым владыкой.',
    'ui.defeatTitle': 'Ваш род пал',
    'ui.defeatBody': 'Ваш родовой замок взят. Тьма Шилен поглощает земли.',
    'ui.playAgain': 'Начать заново',

    // — Language / audio toggles —
    'ui.lang': 'Язык',
    'ui.lang.ru': 'Русский',
    'ui.lang.en': 'English',
    'ui.audioOn': 'Звук вкл.',
    'ui.audioOff': 'Звук выкл.',

    // — Help / intro lore —
    'ui.help': 'Помощь',
    'ui.intro.title': 'Хроники Адена',
    'ui.intro.body':
      'Богиня Эйнхасад сотворила мир, но её сестра Шилен, павшая богиня смерти, ' +
      'разверзает могилы Адена. Старый король мёртв, троны пусты, а легионы нежити ' +
      'поднимаются на тёмных окраинах. Соберите клан, возьмите три коронных замка — ' +
      'Глудио, Гиран и Аден — и станьте новым владыкой континента, пока тьма не поглотила всё.',
    'ui.help.body':
      'Выберите свою провинцию, затем соседнюю — чтобы переместить войско или атаковать. ' +
      'Нанимайте отряды за адену, укрепляйте рубежи и завершайте ход. ' +
      'Каждый тип войск превосходит один и уступает другому: пехота бьёт лучников, ' +
      'лучники — конницу, конница — пехоту. Маги сокрушают строй, но хрупки; целители ' +
      'продлевают жизнь отряда.',

    // — Tutorial hints —
    'tut.select': 'Коснитесь своей провинции, чтобы выбрать её.',
    'tut.move': 'Коснитесь соседней провинции, чтобы двинуть войско или атаковать.',
    'tut.recruit': 'Откройте панель найма, чтобы пополнить гарнизон.',
    'tut.endTurn': 'Завершите ход, когда закончите — ривалы и нежить ответят своим ходом.',
    'tut.defend': 'Укрепите пограничные провинции против набегов Шилен.',

    // — Log templates —
    'log.recruit': '{faction}: нанято {count}× {unit} в провинции {province}.',
    'log.move': '{faction}: войско переброшено из {from} в {to}.',
    'log.battle.win': 'Битва за {province}: {faction} побеждает! Враг разбит.',
    'log.battle.loss': 'Битва за {province}: {faction} терпит поражение, отступая.',
    'log.capture': '{faction} захватывает {province}!',
    'log.fortify': '{faction} укрепляет оборону {province}.',
    'log.income': '{faction} получает {amount} адены (ход {turn}).',
    'log.incursion': 'Набег Шилен: нежить хлынула на {province}!',
    'log.victory': '{faction} объединяет короны Адена. Победа!',
    'log.defeat': 'Замок {province} пал. {faction} повержен.',
  },

  en: {
    // — App —
    'app.title': 'Lineage II: Thrones of Aden',
    'app.subtitle': 'A conquest strategy of the Aden continent',

    // — Factions —
    'fac.human': 'Kingdom of Aden',
    'fac.elf': 'Forest of Elmore',
    'fac.orc': 'Clan of Schuttgart',
    'fac.shilen': "Shilen's Undead Legion",

    // — Units —
    'unit.knight': 'Knight',
    'unit.gladiator': 'Gladiator',
    'unit.ranger': 'Hawkeye Ranger',
    'unit.sorcerer': 'Sorcerer',
    'unit.bishop': 'Bishop',
    'unit.destroyer': 'Destroyer',
    'unit.wraith': 'Wraith',
    'unit.bonearcher': 'Bone Archer',
    'unit.necromancer': 'Necromancer',

    // — Unit types —
    'type.inf': 'Infantry',
    'type.arch': 'Archers',
    'type.cav': 'Heavy Cavalry',
    'type.mag': 'Mages',
    'type.heal': 'Healers',
    'type.undead': 'Undead',

    // — Provinces —
    'prov.schuttgart': 'Schuttgart',
    'prov.innadril': 'Innadril',
    'prov.elvenforest': 'Elven Forest',
    'prov.darkelf': 'Dark Elf Village',
    'prov.gludio': 'Gludio',
    'prov.floran': 'Floran',
    'prov.dion': 'Dion',
    'prov.giran': 'Giran',
    'prov.oren': 'Oren',
    'prov.aden': 'Aden',
    'prov.hardins': "Hardin's Academy",
    'prov.wastelands': 'The Wastelands',
    'prov.goddard': 'Goddard',
    'prov.rune': 'Rune',

    // — Terrain —
    'terrain.plains': 'Plains',
    'terrain.forest': 'Forest',
    'terrain.mountain': 'Mountains',
    'terrain.swamp': 'Swamp',
    'terrain.coast': 'Coast',

    // — Resource bar / HUD —
    'ui.adena': 'Adena',
    'ui.turn': 'Turn',
    'ui.faction': 'Faction',
    'ui.upkeep': 'Upkeep',
    'ui.income': 'Income',
    'ui.castle': 'Castle',
    'ui.garrison': 'Garrison',
    'ui.fortified': 'Fortified',
    'ui.neutral': 'Neutral province',
    'ui.goal': 'Goal: seize the three crown castles — Gludio, Giran and Aden.',

    // — Actions —
    'ui.recruit': 'Recruit',
    'ui.fortify': 'Fortify',
    'ui.move': 'Move',
    'ui.attack': 'Attack',
    'ui.endTurn': 'End Turn',
    'ui.cancel': 'Cancel',
    'ui.confirm': 'Confirm',
    'ui.close': 'Close',
    'ui.cost': 'Cost',

    // — Recruit panel —
    'ui.recruitTitle': 'Recruit Troops',
    'ui.recruitCount': 'Count',
    'ui.notEnoughAdena': 'Not enough Adena.',
    'ui.notYourProvince': 'This is not your province.',
    'ui.cannotRecruitHere': 'That unit cannot be recruited here.',

    // — Battle result —
    'ui.battleTitle': 'Battle Result',
    'ui.battleWin': 'Victory!',
    'ui.battleLoss': 'Defeat',
    'ui.attackerLosses': 'Attacker losses',
    'ui.defenderLosses': 'Defender losses',
    'ui.rounds': 'Rounds',

    // — Win / lose —
    'ui.victoryTitle': 'Triumph over Aden',
    'ui.victoryBody': 'The three crowns are yours. Aden bows to its new lord.',
    'ui.defeatTitle': 'Your House Has Fallen',
    'ui.defeatBody': "Your ancestral castle is taken. Shilen's darkness devours the land.",
    'ui.playAgain': 'Play Again',

    // — Language / audio toggles —
    'ui.lang': 'Language',
    'ui.lang.ru': 'Русский',
    'ui.lang.en': 'English',
    'ui.audioOn': 'Sound On',
    'ui.audioOff': 'Sound Off',

    // — Help / intro lore —
    'ui.help': 'Help',
    'ui.intro.title': 'Chronicles of Aden',
    'ui.intro.body':
      'The goddess Einhasad shaped the world, but her sister Shilen — the fallen goddess ' +
      'of death — tears open the graves of Aden. The old king is dead, the thrones stand ' +
      'empty, and legions of undead rise on the dark frontiers. Gather your clan, take the ' +
      'three crown castles — Gludio, Giran and Aden — and become the new lord of the ' +
      'continent before the darkness consumes all.',
    'ui.help.body':
      'Select your province, then a neighbour to move an army or attack. Recruit troops with ' +
      'Adena, fortify your borders, and end your turn. Each troop type beats one and yields to ' +
      'another: infantry breaks archers, archers down cavalry, cavalry overruns infantry. ' +
      'Mages shatter packed ranks but are fragile; healers extend a stack’s life.',

    // — Tutorial hints —
    'tut.select': 'Tap one of your provinces to select it.',
    'tut.move': 'Tap an adjacent province to move an army or attack.',
    'tut.recruit': 'Open the recruit panel to reinforce a garrison.',
    'tut.endTurn': 'End your turn when ready — rivals and the undead answer in kind.',
    'tut.defend': "Fortify your border provinces against Shilen's raids.",

    // — Log templates —
    'log.recruit': '{faction}: recruited {count}× {unit} in {province}.',
    'log.move': '{faction}: army marched from {from} to {to}.',
    'log.battle.win': 'Battle for {province}: {faction} is victorious! The enemy is broken.',
    'log.battle.loss': 'Battle for {province}: {faction} is defeated and falls back.',
    'log.capture': '{faction} captures {province}!',
    'log.fortify': '{faction} fortifies the defenses of {province}.',
    'log.income': '{faction} gains {amount} Adena (turn {turn}).',
    'log.incursion': 'Shilen incursion: the undead pour into {province}!',
    'log.victory': '{faction} unites the crowns of Aden. Victory!',
    'log.defeat': 'The castle of {province} has fallen. {faction} is undone.',
  },
};

export let LANG = 'ru';

export function setLang(l) {
  if (STR[l]) LANG = l;
}

export function t(key, params) {
  const table = STR[LANG] || STR.ru;
  let s = table[key];
  if (s == null) s = (STR.ru && STR.ru[key]) != null ? STR.ru[key] : key;
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (m, p) =>
      Object.prototype.hasOwnProperty.call(params, p) ? String(params[p]) : m
    );
  }
  return s;
}
