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
    'fac.darkelf': 'Долина Тёмных Эльфов',
    'fac.dwarf': 'Гильдии Гномов',
    'fac.kamael': 'Камаэли Острова Душ',
    'fac.shilen': 'Легион Нежити Шилен',

    // — Units —
    'unit.knight': 'Рыцарь',
    'unit.gladiator': 'Гладиатор',
    'unit.ranger': 'Соколиный Глаз',
    'unit.sorcerer': 'Чародей',
    'unit.bishop': 'Епископ',
    'unit.destroyer': 'Разрушитель',
    'unit.shillienknight': 'Рыцарь Шиллен',
    'unit.phantomranger': 'Призрачный Стрелок',
    'unit.spellhowler': 'Заклинатель Тьмы',
    'unit.dwarvendefender': 'Гномий Защитник',
    'unit.bountyhunter': 'Охотник за Головами',
    'unit.warsmith': 'Оружейник',
    'unit.soulsoldier': 'Солдат Душ',
    'unit.soulranger': 'Стрелок Душ',
    'unit.berserker': 'Берсерк',
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
    'prov.dwarvenvillage': 'Деревня Гномов',
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
    'prov.isleofsouls': 'Остров Душ',
    'prov.gracia': 'Грация',
    'prov.seedofdestruction': 'Семя Разрушения',
    'prov.wallofargos': 'Стена Аргоса',
    'prov.aienkrol': 'Айен Крол',

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
    'log.gameStart': 'Начинается борьба за троны Адена. Ваша фракция: {faction}.',
    'log.repelled': '{faction} отражает нападение {attacker} на {province}!',
    'battle.start': 'Битва: {attacker} ({attackerCount}) против {defender} ({defenderCount}).',
    'log.battle.start': 'Битва: {attacker} ({attackerCount}) штурмует {defender} ({defenderCount}).',
    'battle.win': '{attacker} разбивает {defender} за {rounds} р.! Выжило атакующих: {attackerSurvivors}.',
    'battle.loss': '{defender} отражает {attacker} ({rounds} р.). Защитников осталось: {defenderSurvivors}.',
    'log.victory': '{faction} объединяет короны Адена. Победа!',
    'log.defeat': 'Замок {province} пал. {faction} повержен.',

    // — Event / skill log templates —
    'log.event': 'Событие: {title}.',
    'log.event.result': '{title}: {result}',
    'log.skill': '{faction} применяет умение: {skill}.',

    // — Events UI —
    'ui.event': 'Событие',
    'ui.skills': 'Умения',
    'ui.skillsTitle': 'Клановые умения',
    'ui.cooldown': 'Перезарядка',
    'ui.ready': 'Готово',
    'ui.selectTarget': 'Выберите цель умения.',

    // — Campaign events —
    'ev.omen.title': 'Знамение Шилен',
    'ev.omen.desc': 'Луна окрасилась кровью, и мёртвые шепчут под землёй. Жрецы предрекают пробуждение павшей богини.',
    'ev.omen.pray': 'Молиться Эйнхасад (−60 адены)',
    'ev.omen.pray.r': 'Свет Эйнхасад нисходит — казна процветает, а тьма отступает.',
    'ev.omen.ignore': 'Не обращать внимания',
    'ev.omen.ignore.r': 'Знамение сбылось: нежить хлынула на ваши земли.',

    'ev.einhasad.title': 'Благословение Эйнхасад',
    'ev.einhasad.desc': 'Верховный жрец Храма предлагает освятить ваш престол во имя богини-созидательницы.',
    'ev.einhasad.tithe': 'Принести десятину (−100 адены)',
    'ev.einhasad.tithe.r': 'Столица укреплена святой защитой, а торговля расцветает под благословением.',
    'ev.einhasad.refuse': 'Отказать жрецу',
    'ev.einhasad.refuse.r': 'Вы оставляете десятину себе — казна пополняется, но жрецы недовольны.',

    'ev.relic.title': 'Реликвия Гигантов',
    'ev.relic.desc': 'В руинах древней эпохи Гигантов обнаружен запечатанный артефакт неведомой силы.',
    'ev.relic.excavate': 'Раскопать (−80 адены)',
    'ev.relic.excavate.r': 'Реликвия продана коллекционерам Гирана за щедрое золото.',
    'ev.relic.seal': 'Запечатать вновь',
    'ev.relic.seal.r': 'Вы запечатываете реликвию; её сила укрепляет вашу столицу.',

    'ev.intrigue.title': 'Интрига Клана',
    'ev.intrigue.desc': 'Соперничающий дом плетёт заговор против вашего трона. Шпионы доносят о предательстве в гарнизоне.',
    'ev.intrigue.bribe': 'Подкупить заговорщиков (−90 адены)',
    'ev.intrigue.bribe.r': 'Золото покупает верность; недовольные становятся вашими сторонниками.',
    'ev.intrigue.purge': 'Устроить чистку',
    'ev.intrigue.purge.r': 'Предатели казнены — вы теряете воинов, но столица сплочена и укреплена.',

    'ev.orcraid.title': 'Набег Орков',
    'ev.orcraid.desc': 'Орда орков-наёмников спускается с гор, требуя дани за проход через ваши земли.',
    'ev.orcraid.pay': 'Заплатить дань (−70 адены)',
    'ev.orcraid.pay.r': 'Орки уходят, забрав золото и оставив ваши деревни нетронутыми.',
    'ev.orcraid.fight': 'Дать бой',
    'ev.orcraid.fight.r': 'Кровавая стычка: вы теряете рубеж, но добытые гладиаторы пополняют ряды.',

    'ev.caravan.title': 'Торговый Караван',
    'ev.caravan.desc': 'Богатый купеческий караван из Гирана ищет покровительства и предлагает выгодную сделку.',
    'ev.caravan.invest': 'Вложиться в торговлю (−120 адены)',
    'ev.caravan.invest.r': 'Торговые пути расцветают — доход растёт на много ходов вперёд.',
    'ev.caravan.escort': 'Сопроводить за плату',
    'ev.caravan.escort.r': 'Караван доставлен в целости; благодарные купцы щедро платят.',

    'ev.warsmith.title': 'Странствующий Оружейник',
    'ev.warsmith.desc': 'Гном-оружейник предлагает выковать для вас отряд непробиваемых защитников.',
    'ev.warsmith.commission': 'Заказать доспехи (−150 адены)',
    'ev.warsmith.commission.r': 'Гномьи защитники встают на стены вашей столицы.',
    'ev.warsmith.dismiss': 'Отослать оружейника',
    'ev.warsmith.dismiss.r': 'Вы отказываетесь, но гном оставляет малый дар в знак уважения.',

    'ev.plague.title': 'Мор Шилен',
    'ev.plague.desc': 'Некротическая чума расползается с болот, выкашивая гарнизоны и сея ужас.',
    'ev.plague.quarantine': 'Ввести карантин (−110 адены)',
    'ev.plague.quarantine.r': 'Жёсткий карантин сдерживает мор; столица под надёжной защитой.',
    'ev.plague.endure': 'Переждать мор',
    'ev.plague.endure.r': 'Чума собирает свою жатву — многие воины гибнут от некроза.',

    'ev.kamael.title': 'Посланник Камаэлей',
    'ev.kamael.desc': 'Крылатые воины Острова Душ предлагают союз против общей тьмы.',
    'ev.kamael.ally': 'Заключить союз (−100 адены)',
    'ev.kamael.ally.r': 'Солдаты Душ выступают на вашей стороне у переднего рубежа.',
    'ev.kamael.spurn': 'Отвергнуть союз',
    'ev.kamael.spurn.r': 'Камаэли уходят, но делятся картами разведанных земель.',

    'ev.gracia.title': 'Экспедиция в Грацию',
    'ev.gracia.desc': 'За восточным морем лежит загадочный континент Грация. Снарядить флот — дорого, но сулит богатства.',
    'ev.gracia.sail': 'Снарядить флот (−160 адены)',
    'ev.gracia.sail.r': 'Земли Грации раскрыты, а новые торговые пути приносят доход.',
    'ev.gracia.wait': 'Повременить',
    'ev.gracia.wait.r': 'Вы откладываете поход и тратите силы на укрепление столицы.',

    'ev.temple.title': 'Забытый Храм',
    'ev.temple.desc': 'В чаще найден заброшенный храм, полный реликвий — но и древних стражей.',
    'ev.temple.pray': 'Вознести молитву',
    'ev.temple.pray.r': 'Молитва услышана; благодать наполняет ваши земли процветанием.',
    'ev.temple.plunder': 'Разграбить храм',
    'ev.temple.plunder.r': 'Вы забираете золото, но пробуждаете нежить-стражей.',

    'ev.antharas.title': 'Антарас Пробуждается',
    'ev.antharas.desc': 'Земля содрогается: Король Драконов Антарас шевелится в своём логове. Его гнев грозит всему Адену.',
    'ev.antharas.fortify': 'Укрепить оборону (−140 адены)',
    'ev.antharas.fortify.r': 'Столица ощетинивается стенами и рыцарями против драконьей угрозы.',
    'ev.antharas.appease': 'Умилостивить дарами (−200 адены)',
    'ev.antharas.appease.r': 'Драконьи стражи довольны данью; ваша торговля процветает под их благосклонностью.',

    // — Clan skills —
    'sk.einhasad.name': 'Благословение Эйнхасад',
    'sk.einhasad.desc': 'Свет богини исцеляет гарнизон вашей провинции, восстанавливая половину потерь.',
    'sk.smite.name': 'Кара Шилен',
    'sk.smite.desc': 'Тёмная кара поражает вражеский гарнизон, уничтожая треть его сил.',
    'sk.summon.name': 'Призыв Защитников',
    'sk.summon.desc': 'Призывает отряд рыцарей в защиту вашей провинции.',
    'sk.bless.name': 'Благословение Торговли',
    'sk.bless.desc': 'Освящает торговые пути, повышая доход на несколько ходов.',
    'sk.fortify.name': 'Гномий Бастион',
    'sk.fortify.desc': 'Мгновенно укрепляет провинцию без затрат адены.',
    'sk.scry.name': 'Прозрение Сокровищ',
    'sk.scry.desc': 'Магическое прозрение раскрывает скрытые клады, пополняя казну.',

    // — Resources (v3) —
    'res.adena': 'Адена',
    'res.wood': 'Древесина',
    'res.crystal': 'Кристаллы',

    // — Buildings (v3) —
    'bld.townhall': 'Ратуша',
    'bld.townhall.d': 'Сердце города. Управляет провинцией и приносит адену каждый ход.',
    'bld.lumbermill': 'Лесопилка',
    'bld.lumbermill.d': 'Валит лес окрестных чащ, поставляя древесину для построек и осад.',
    'bld.crystalmine': 'Кристальная шахта',
    'bld.crystalmine.d': 'Добывает магические кристаллы из недр — топливо высокой магии и брони.',
    'bld.barracks': 'Казармы',
    'bld.barracks.d': 'Готовит пехоту. Каждые несколько ходов пополняет гарнизон новым отрядом.',
    'bld.archery': 'Стрельбище',
    'bld.archery.d': 'Обучает лучников, время от времени усиливая гарнизон стрелками.',
    'bld.magetower': 'Башня магов',
    'bld.magetower.d': 'Призывает магов, медленно, но верно пополняя гарнизон чародеями.',
    'bld.walls': 'Городские стены',
    'bld.walls.d': 'Каменные укрепления держат провинцию в обороне и придают защиту гарнизону.',
    'bld.market': 'Рынок',
    'bld.market.d': 'Торговые ряды приносят дополнительную адену каждый ход.',
    'bld.temple': 'Храм',
    'bld.temple.d': 'Святилище исцеляет гарнизон провинции, восстанавливая часть потерь каждый ход.',

    // — City UI (v3) —
    'city.enter': 'Войти в город',
    'city.leave': 'Покинуть город',
    'city.build': 'Построить',
    'city.upgrade': 'Улучшить',
    'city.queue': 'Очередь строительства',
    'city.level': 'Уровень',
    'city.cost': 'Стоимость',
    'city.buildTime': 'Время постройки',
    'city.turns': 'ходов',
    'city.produces': 'Производит',
    'city.fortified': 'Укреплён',
    'city.locked': 'Недоступно',
    'city.maxLevel': 'Макс. уровень',
    'city.noCity': 'В этой провинции нет города.',

    // — Event-chain: Семь Печатей (v3) —
    'ev.seals1.title': 'Семь Печатей',
    'ev.seals1.desc': 'Древнее пророчество пробуждается: Семь Печатей, сдерживающих силу Шилен под Аденом, слабеют. Лорды Рассвета зовут хранить их, Революционеры Заката — сорвать.',
    'ev.seals1.dawn': 'Встать на сторону Рассвета (−80 адены)',
    'ev.seals1.dawn.r': 'Вы клянётесь хранить Печати. Жрецы Рассвета укрепляют вашу столицу святыми оберегами.',
    'ev.seals1.dusk': 'Встать на сторону Заката (+120 адены)',
    'ev.seals1.dusk.r': 'Вы принимаете золото культа Заката и тайно начинаете расшатывать Печати.',

    'ev.seals2.title': 'Раздор Печатей',
    'ev.seals2.desc': 'Война за Печати разгорается. Рассвет и Закат сходятся у древних алтарей, и ваш выбор решит судьбу следующей Печати.',
    'ev.seals2.uphold': 'Защитить алтари (−120 адены)',
    'ev.seals2.uphold.r': 'Ваши воины отстаивают алтари Рассвета; благословение хранителей наполняет казну.',
    'ev.seals2.shatter': 'Разбить Печать (+160 адены)',
    'ev.seals2.shatter.r': 'Печать трескается — золото льётся рекой, но из разлома уже сочится нежить.',

    'ev.seals3.title': 'Суд Печатей',
    'ev.seals3.desc': 'Последняя Печать на грани. То, что вы сеяли, принесёт плоды: либо благодать хранителей, либо прорыв легионов Шилен.',
    'ev.seals3.dawn': 'Запечатать навеки во имя Рассвета',
    'ev.seals3.dawn.r': 'Печати сияют и смыкаются навсегда. Аден благословлён: золото, рыцари и процветание венчают ваше правление.',
    'ev.seals3.dusk': 'Сорвать последнюю Печать',
    'ev.seals3.dusk.r': 'Последняя Печать рушится. Легионы нежити Шилен хлынули в мир — пусть весь Аден трепещет пред вашей силой.',

    // ===== v4 =====

    // — Panel / start (v4) —
    'panel.defense': 'Оборона',
    'panel.heroes': 'Герои',
    'start.campaign': 'Поход',
    'start.skirmish': 'Схватка',

    // — Towers (Wave Defense, v4) —
    'tower.arrow': 'Лучная башня',
    'tower.cannon': 'Осадная пушка',
    'tower.frost': 'Башня Стужи',
    'tower.holy': 'Святая башня',
    'tower.ballista': 'Баллиста',
    'tower.poison': 'Чумная башня',

    // — Mobs (Wave Defense, v4) —
    'mob.skeleton': 'Скелет',
    'mob.ghoul': 'Упырь',
    'mob.wraith': 'Призрак',
    'mob.bonegolem': 'Костяной голем',

    // — Tower Defense UI (v4) —
    'td.title': 'Оборона провинции',
    'td.wave': 'Волна',
    'td.lives': 'Жизни',
    'td.gold': 'Золото',
    'td.startWave': 'Начать волну',
    'td.nextWave': 'Следующая волна',
    'td.auto': 'Авто',
    'td.build': 'Построить',
    'td.upgrade': 'Улучшить',
    'td.sell': 'Продать',
    'td.range': 'Радиус',
    'td.damage': 'Урон',
    'td.maxLevel': 'Макс. уровень',
    'td.notEnoughGold': 'Недостаточно золота.',
    'td.slotTaken': 'Это место уже занято.',
    'td.victory': 'Провинция отстояна!',
    'td.victoryBody': 'Легионы Шилен разбиты и отброшены во тьму. Награда ваша.',
    'td.defeat': 'Оборона пала',
    'td.defeatBody': 'Нежить прорвалась к сердцу города. Провинция захлёбывается во тьме.',
    'td.reward': 'Награда',
    'td.wavesCleared': 'Волн отражено',
    'td.leave': 'Покинуть оборону',

    // — Siege (v4) —
    'siege.title': 'Осада замка',
    'siege.wallIntegrity': 'Целостность стен',
    'siege.batter': 'Таранить стены',
    'siege.storm': 'Штурмовать брешь',
    'siege.hold': 'Держать строй',
    'siege.auto': 'Авто-осада',
    'siege.breached': 'Стены пробиты!',
    'siege.wallsStand': 'Стены ещё держатся.',
    'siege.attackers': 'Осаждающие',
    'siege.defenders': 'Защитники',
    'siege.round': 'Раунд осады',
    'siege.victory': 'Замок взят!',
    'siege.defeat': 'Осада отбита',

    // — Heroes UI (v4) —
    'hero.title': 'Герои клана',
    'hero.recruit': 'Нанять',
    'hero.assign': 'Назначить в провинцию',
    'hero.assigned': 'Назначен',
    'hero.unassigned': 'Без назначения',
    'hero.level': 'Уровень',
    'hero.xp': 'Опыт',
    'hero.nextLevel': 'До уровня',
    'hero.equip': 'Снарядить',
    'hero.unequip': 'Снять',
    'hero.inventory': 'Снаряжение',
    'hero.skills': 'Умения героя',
    'hero.stats': 'Характеристики',
    'hero.atk': 'Атака',
    'hero.def': 'Защита',
    'hero.cost': 'Стоимость найма',
    'hero.recruited': 'Нанят',
    'hero.empty': 'Героев пока нет. Наймите своего первого полководца.',
    'hero.back': 'Назад',

    // — Hero names (v4) —
    'hero.knightcommander': 'Командор Рыцарей',
    'hero.rangerlord': 'Владыка Следопытов',
    'hero.warlord': 'Вождь Орков',
    'hero.shillientemplar': 'Храмовник Шиллен',
    'hero.warsmithlord': 'Мастер-Оружейник',
    'hero.soulchampion': 'Поборник Душ',

    // — Hero skills (v4) —
    'skill.hero.rally.name': 'Боевой клич',
    'skill.hero.rally.desc': 'Воодушевляет войско провинции, повышая его атаку в бою.',
    'skill.hero.guard.name': 'Несокрушимый строй',
    'skill.hero.guard.desc': 'Закаляет ряды защитников, усиливая их защиту в бою.',
    'skill.hero.volley.name': 'Залп следопытов',
    'skill.hero.volley.desc': 'Точный залп выкашивает передовые ряды врага перед сечей.',
    'skill.hero.frenzy.name': 'Ярость берсерка',
    'skill.hero.frenzy.desc': 'Жажда крови множит урон войска ценой его защиты.',
    'skill.hero.shadow.name': 'Покров Шиллен',
    'skill.hero.shadow.desc': 'Тёмная завеса Шиллен ослабляет волю врага и его удар.',
    'skill.hero.forge.name': 'Благословение наковальни',
    'skill.hero.forge.desc': 'Гномья ковка крепит броню войска, снижая его потери.',
    'skill.hero.soulburst.name': 'Всплеск душ',
    'skill.hero.soulburst.desc': 'Энергия душ испепеляет врага сокрушительным взрывом.',

    // — Items (v4) —
    'item.sword': 'Меч Аденского рыцаря',
    'item.sword.d': 'Закалённый клинок короны Адена. Заметно повышает атаку героя.',
    'item.axe': 'Боевой топор орков',
    'item.axe.d': 'Тяжёлый топор Шуттгарта. Сокрушительная атака за счёт неуклюжести.',
    'item.bow': 'Лук Эльмора',
    'item.bow.d': 'Эльфийский лук дивной работы. Повышает атаку дальнобойного героя.',
    'item.staff': 'Посох Чародея',
    'item.staff.d': 'Кристальный посох, питаемый магией. Усиливает атаку и сулит мощь.',
    'item.plate': 'Латы Гномов',
    'item.plate.d': 'Несокрушимая гномья ковка. Значительно повышает защиту героя.',
    'item.robe': 'Мантия Жреца',
    'item.robe.d': 'Освящённая мантия Храма. Даёт защиту и крепость духа.',
    'item.shield': 'Башенный щит',
    'item.shield.d': 'Тяжёлый щит замковой стражи. Надёжно прикрывает в бою.',
    'item.ring': 'Кольцо Гигантов',
    'item.ring.d': 'Реликвия эпохи Гигантов. Прибавляет здоровья и стойкости.',
    'item.amulet': 'Амулет Шилен',
    'item.amulet.d': 'Тёмный оберег павшей богини. Дарует силу ценой тревожных снов.',

    // — Campaign UI (v4) —
    'camp.title': 'Поход за Аден',
    'camp.locked': 'Недоступно',
    'camp.completed': 'Пройдено',
    'camp.objective': 'Задача',
    'camp.reward': 'Награда',
    'camp.start': 'Начать сценарий',
    'camp.back': 'Назад',

    // — Campaign scenarios (v4) —
    'camp.gludio.name': 'Оборона Глудио',
    'camp.gludio.desc': 'Нежить Шилен хлынула на пограничный замок Глудио. Удержите рубеж, пока подходит подмога.',
    'camp.gludio.objective': 'Удерживайте Глудио шесть ходов, не дав врагу взять замок.',
    'camp.retakeaden.name': 'Возвращение Адена',
    'camp.retakeaden.desc': 'Столица захвачена узурпатором. Соберите войско и отбейте коронный замок Адена.',
    'camp.retakeaden.objective': 'Захватите провинцию Аден.',
    'camp.orcs.name': 'Отпор Оркам',
    'camp.orcs.desc': 'Орды Шуттгарта спускаются с гор, грабя восточные земли. Разбейте их вторжение.',
    'camp.orcs.objective': 'Уничтожьте все войска орков на ваших землях.',
    'camp.darkness.name': 'Тьма Шилен',
    'camp.darkness.desc': 'Печати слабеют, и легионы павшей богини рвутся в мир. Удержите коронные замки против натиска тьмы.',
    'camp.darkness.objective': 'Удержите все три коронных замка восемь ходов.',
    'camp.thrones.name': 'Троны Адена',
    'camp.thrones.desc': 'Последняя битва за континент. Объедините короны Глудио, Гирана и Адена и станьте владыкой Адена.',
    'camp.thrones.objective': 'Захватите три коронных замка — Глудио, Гиран и Аден.',
  },

  en: {
    // — App —
    'app.title': 'Lineage II: Thrones of Aden',
    'app.subtitle': 'A conquest strategy of the Aden continent',

    // — Factions —
    'fac.human': 'Kingdom of Aden',
    'fac.elf': 'Forest of Elmore',
    'fac.orc': 'Clan of Schuttgart',
    'fac.darkelf': 'Vale of the Dark Elves',
    'fac.dwarf': 'Dwarven Guilds',
    'fac.kamael': 'Kamael of the Isle of Souls',
    'fac.shilen': "Shilen's Undead Legion",

    // — Units —
    'unit.knight': 'Knight',
    'unit.gladiator': 'Gladiator',
    'unit.ranger': 'Hawkeye Ranger',
    'unit.sorcerer': 'Sorcerer',
    'unit.bishop': 'Bishop',
    'unit.destroyer': 'Destroyer',
    'unit.shillienknight': 'Shillien Knight',
    'unit.phantomranger': 'Phantom Ranger',
    'unit.spellhowler': 'Spellhowler',
    'unit.dwarvendefender': 'Dwarven Defender',
    'unit.bountyhunter': 'Bounty Hunter',
    'unit.warsmith': 'Warsmith',
    'unit.soulsoldier': 'Soul Soldier',
    'unit.soulranger': 'Soul Ranger',
    'unit.berserker': 'Berserker',
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
    'prov.dwarvenvillage': 'Dwarven Village',
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
    'prov.isleofsouls': 'Isle of Souls',
    'prov.gracia': 'Gracia',
    'prov.seedofdestruction': 'Seed of Destruction',
    'prov.wallofargos': 'Wall of Argos',
    'prov.aienkrol': 'Aien Krol',

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
    'log.gameStart': 'The struggle for the thrones of Aden begins. Your faction: {faction}.',
    'log.repelled': '{faction} repels {attacker} at {province}!',
    'battle.start': 'Battle: {attacker} ({attackerCount}) vs {defender} ({defenderCount}).',
    'log.battle.start': 'Battle: {attacker} ({attackerCount}) storms {defender} ({defenderCount}).',
    'battle.win': '{attacker} crushes {defender} in {rounds} rounds! Survivors: {attackerSurvivors}.',
    'battle.loss': '{defender} repels {attacker} after {rounds} rounds. Defenders left: {defenderSurvivors}.',
    'log.victory': '{faction} unites the crowns of Aden. Victory!',
    'log.defeat': 'The castle of {province} has fallen. {faction} is undone.',

    // — Event / skill log templates —
    'log.event': 'Event: {title}.',
    'log.event.result': '{title}: {result}',
    'log.skill': '{faction} invokes a skill: {skill}.',

    // — Events UI —
    'ui.event': 'Event',
    'ui.skills': 'Skills',
    'ui.skillsTitle': 'Clan Skills',
    'ui.cooldown': 'Cooldown',
    'ui.ready': 'Ready',
    'ui.selectTarget': 'Choose a target for the skill.',

    // — Campaign events —
    'ev.omen.title': 'Omen of Shilen',
    'ev.omen.desc': 'The moon runs red and the dead whisper beneath the earth. Priests foretell the waking of the fallen goddess.',
    'ev.omen.pray': 'Pray to Einhasad (−60 Adena)',
    'ev.omen.pray.r': "Einhasad's light descends — your treasury prospers and the darkness recedes.",
    'ev.omen.ignore': 'Ignore the omen',
    'ev.omen.ignore.r': 'The omen comes true: the undead pour across your lands.',

    'ev.einhasad.title': "Einhasad's Blessing",
    'ev.einhasad.desc': 'The High Priest of the Temple offers to consecrate your throne in the name of the creator goddess.',
    'ev.einhasad.tithe': 'Pay the tithe (−100 Adena)',
    'ev.einhasad.tithe.r': 'Your capital is warded with holy protection and trade flourishes under the blessing.',
    'ev.einhasad.refuse': 'Refuse the priest',
    'ev.einhasad.refuse.r': 'You keep the tithe — coffers swell, but the priests are displeased.',

    'ev.relic.title': 'Relic of the Giants',
    'ev.relic.desc': 'Amid the ruins of the ancient Giants, a sealed artifact of unknown power is unearthed.',
    'ev.relic.excavate': 'Excavate it (−80 Adena)',
    'ev.relic.excavate.r': "The relic sells to Giran's collectors for a handsome sum of gold.",
    'ev.relic.seal': 'Seal it away',
    'ev.relic.seal.r': 'You seal the relic; its power fortifies your capital.',

    'ev.intrigue.title': 'Clan Intrigue',
    'ev.intrigue.desc': 'A rival house plots against your throne. Spies report treachery within the garrison.',
    'ev.intrigue.bribe': 'Bribe the plotters (−90 Adena)',
    'ev.intrigue.bribe.r': 'Gold buys loyalty; the malcontents become your supporters.',
    'ev.intrigue.purge': 'Stage a purge',
    'ev.intrigue.purge.r': 'Traitors are executed — you lose soldiers, but your capital is united and fortified.',

    'ev.orcraid.title': 'Orc Raid',
    'ev.orcraid.desc': 'A horde of orc mercenaries descends from the mountains, demanding tribute for passage through your lands.',
    'ev.orcraid.pay': 'Pay the tribute (−70 Adena)',
    'ev.orcraid.pay.r': 'The orcs depart, taking the gold and leaving your villages untouched.',
    'ev.orcraid.fight': 'Give battle',
    'ev.orcraid.fight.r': 'A bloody skirmish: you lose ground, but captured gladiators swell your ranks.',

    'ev.caravan.title': 'Merchant Caravan',
    'ev.caravan.desc': 'A rich merchant caravan from Giran seeks your patronage and offers a lucrative deal.',
    'ev.caravan.invest': 'Invest in trade (−120 Adena)',
    'ev.caravan.invest.r': 'Trade routes flourish — income rises for many turns to come.',
    'ev.caravan.escort': 'Escort it for a fee',
    'ev.caravan.escort.r': 'The caravan arrives safely; grateful merchants pay you well.',

    'ev.warsmith.title': 'Wandering Warsmith',
    'ev.warsmith.desc': 'A dwarven warsmith offers to forge you a band of unbreakable defenders.',
    'ev.warsmith.commission': 'Commission the armor (−150 Adena)',
    'ev.warsmith.commission.r': 'Dwarven defenders take their places on your capital walls.',
    'ev.warsmith.dismiss': 'Send the smith away',
    'ev.warsmith.dismiss.r': 'You decline, but the dwarf leaves a small gift as a token of respect.',

    'ev.plague.title': 'Shilen Plague',
    'ev.plague.desc': 'A necrotic plague creeps from the swamps, withering garrisons and sowing terror.',
    'ev.plague.quarantine': 'Impose a quarantine (−110 Adena)',
    'ev.plague.quarantine.r': 'A strict quarantine contains the plague; your capital is well protected.',
    'ev.plague.endure': 'Endure the plague',
    'ev.plague.endure.r': 'The plague reaps its harvest — many soldiers fall to the necrosis.',

    'ev.kamael.title': 'Kamael Envoy',
    'ev.kamael.desc': 'The winged warriors of the Isle of Souls offer an alliance against the common darkness.',
    'ev.kamael.ally': 'Forge the alliance (−100 Adena)',
    'ev.kamael.ally.r': 'Soul Soldiers march to your side along the frontline.',
    'ev.kamael.spurn': 'Spurn the alliance',
    'ev.kamael.spurn.r': 'The Kamael depart, but share their maps of the scouted lands.',

    'ev.gracia.title': 'Gracia Expedition',
    'ev.gracia.desc': 'Beyond the eastern sea lies the mysterious continent of Gracia. To outfit a fleet is costly, but promises riches.',
    'ev.gracia.sail': 'Outfit a fleet (−160 Adena)',
    'ev.gracia.sail.r': 'The lands of Gracia are revealed, and new trade routes bring income.',
    'ev.gracia.wait': 'Bide your time',
    'ev.gracia.wait.r': 'You delay the voyage and spend your strength fortifying the capital.',

    'ev.temple.title': 'Forgotten Temple',
    'ev.temple.desc': 'A derelict temple is found in the thicket, full of relics — and ancient guardians.',
    'ev.temple.pray': 'Offer a prayer',
    'ev.temple.pray.r': 'The prayer is heard; grace fills your lands with prosperity.',
    'ev.temple.plunder': 'Plunder the temple',
    'ev.temple.plunder.r': 'You seize the gold, but wake the undead guardians.',

    'ev.antharas.title': 'Antharas Stirs',
    'ev.antharas.desc': 'The earth shudders: Antharas the Land Dragon stirs in his lair. His wrath threatens all of Aden.',
    'ev.antharas.fortify': 'Fortify your defenses (−140 Adena)',
    'ev.antharas.fortify.r': 'Your capital bristles with walls and knights against the dragon threat.',
    'ev.antharas.appease': 'Appease with offerings (−200 Adena)',
    'ev.antharas.appease.r': "The dragon's wardens are pleased by the tribute; your trade prospers under their favor.",

    // — Clan skills —
    'sk.einhasad.name': "Einhasad's Blessing",
    'sk.einhasad.desc': "The goddess's light heals your province's garrison, restoring half of its losses.",
    'sk.smite.name': 'Shilen Smite',
    'sk.smite.desc': 'A dark smite strikes an enemy garrison, destroying a third of its strength.',
    'sk.summon.name': 'Summon Defenders',
    'sk.summon.desc': 'Summons a band of knights to defend your province.',
    'sk.bless.name': 'Trade Blessing',
    'sk.bless.desc': 'Consecrates your trade routes, raising income for several turns.',
    'sk.fortify.name': 'Dwarven Bulwark',
    'sk.fortify.desc': 'Instantly fortifies a province at no Adena cost.',
    'sk.scry.name': 'Scry for Treasure',
    'sk.scry.desc': 'A magical scrying reveals hidden hoards, filling your treasury.',

    // — Resources (v3) —
    'res.adena': 'Adena',
    'res.wood': 'Wood',
    'res.crystal': 'Crystals',

    // — Buildings (v3) —
    'bld.townhall': 'Town Hall',
    'bld.townhall.d': "The heart of the city. It governs the province and yields Adena each turn.",
    'bld.lumbermill': 'Lumber Mill',
    'bld.lumbermill.d': 'Fells the surrounding forests, supplying wood for buildings and sieges.',
    'bld.crystalmine': 'Crystal Mine',
    'bld.crystalmine.d': 'Mines magical crystals from the depths — fuel for high magic and armor.',
    'bld.barracks': 'Barracks',
    'bld.barracks.d': 'Trains infantry. Every few turns it reinforces the garrison with a fresh band.',
    'bld.archery': 'Archery Range',
    'bld.archery.d': 'Trains archers, bolstering the garrison with marksmen from time to time.',
    'bld.magetower': 'Mage Tower',
    'bld.magetower.d': 'Summons mages, slowly but surely reinforcing the garrison with spellcasters.',
    'bld.walls': 'City Walls',
    'bld.walls.d': 'Stone fortifications keep the province on the defensive and shield its garrison.',
    'bld.market': 'Market',
    'bld.market.d': 'Trade stalls bring in extra Adena each turn.',
    'bld.temple': 'Temple',
    'bld.temple.d': "A sanctuary that heals the province's garrison, restoring some losses each turn.",

    // — City UI (v3) —
    'city.enter': 'Enter city',
    'city.leave': 'Leave city',
    'city.build': 'Build',
    'city.upgrade': 'Upgrade',
    'city.queue': 'Build queue',
    'city.level': 'Level',
    'city.cost': 'Cost',
    'city.buildTime': 'Build time',
    'city.turns': 'turns',
    'city.produces': 'Produces',
    'city.fortified': 'Fortified',
    'city.locked': 'Locked',
    'city.maxLevel': 'Max level',
    'city.noCity': 'This province has no city.',

    // — Event-chain: The Seven Seals (v3) —
    'ev.seals1.title': 'The Seven Seals',
    'ev.seals1.desc': 'An ancient prophecy awakens: the Seven Seals binding Shilen’s power beneath Aden are weakening. The Lords of Dawn call to uphold them; the Revolutionaries of Dusk, to break them.',
    'ev.seals1.dawn': 'Side with the Dawn (−80 Adena)',
    'ev.seals1.dawn.r': 'You vow to keep the Seals. The priests of Dawn ward your capital with holy charms.',
    'ev.seals1.dusk': 'Side with the Dusk (+120 Adena)',
    'ev.seals1.dusk.r': 'You take the cult of Dusk’s gold and secretly begin to loosen the Seals.',

    'ev.seals2.title': 'Strife of the Seals',
    'ev.seals2.desc': 'The war for the Seals flares up. Dawn and Dusk clash at the ancient altars, and your choice will decide the fate of the next Seal.',
    'ev.seals2.uphold': 'Defend the altars (−120 Adena)',
    'ev.seals2.uphold.r': 'Your warriors hold the altars of Dawn; the wardens’ blessing fills your coffers.',
    'ev.seals2.shatter': 'Shatter a Seal (+160 Adena)',
    'ev.seals2.shatter.r': 'The Seal cracks — gold pours forth, but the undead already seep from the rift.',

    'ev.seals3.title': 'Judgment of the Seals',
    'ev.seals3.desc': 'The last Seal is on the brink. What you have sown will bear fruit: either the wardens’ grace, or the breakthrough of Shilen’s legions.',
    'ev.seals3.dawn': 'Seal them forever in the name of Dawn',
    'ev.seals3.dawn.r': 'The Seals blaze and close forever. Aden is blessed: gold, knights, and prosperity crown your reign.',
    'ev.seals3.dusk': 'Tear open the final Seal',
    'ev.seals3.dusk.r': 'The last Seal collapses. Shilen’s undead legions flood the world — let all Aden tremble before your power.',

    // ===== v4 =====

    // — Panel / start (v4) —
    'panel.defense': 'Defense',
    'panel.heroes': 'Heroes',
    'start.campaign': 'Campaign',
    'start.skirmish': 'Skirmish',

    // — Towers (Wave Defense, v4) —
    'tower.arrow': 'Arrow Tower',
    'tower.cannon': 'Siege Cannon',
    'tower.frost': 'Frost Tower',
    'tower.holy': 'Holy Tower',
    'tower.ballista': 'Ballista',
    'tower.poison': 'Plague Tower',

    // — Mobs (Wave Defense, v4) —
    'mob.skeleton': 'Skeleton',
    'mob.ghoul': 'Ghoul',
    'mob.wraith': 'Wraith',
    'mob.bonegolem': 'Bone Golem',

    // — Tower Defense UI (v4) —
    'td.title': 'Province Defense',
    'td.wave': 'Wave',
    'td.lives': 'Lives',
    'td.gold': 'Gold',
    'td.startWave': 'Start Wave',
    'td.nextWave': 'Next Wave',
    'td.auto': 'Auto',
    'td.build': 'Build',
    'td.upgrade': 'Upgrade',
    'td.sell': 'Sell',
    'td.range': 'Range',
    'td.damage': 'Damage',
    'td.maxLevel': 'Max level',
    'td.notEnoughGold': 'Not enough gold.',
    'td.slotTaken': 'That slot is already taken.',
    'td.victory': 'Province Held!',
    'td.victoryBody': 'Shilen’s legions are broken and driven back into the dark. The reward is yours.',
    'td.defeat': 'Defense Fallen',
    'td.defeatBody': 'The undead have broken through to the city’s heart. The province drowns in darkness.',
    'td.reward': 'Reward',
    'td.wavesCleared': 'Waves cleared',
    'td.leave': 'Leave Defense',

    // — Siege (v4) —
    'siege.title': 'Castle Siege',
    'siege.wallIntegrity': 'Wall Integrity',
    'siege.batter': 'Batter the Walls',
    'siege.storm': 'Storm the Breach',
    'siege.hold': 'Hold the Line',
    'siege.auto': 'Auto-Siege',
    'siege.breached': 'The walls are breached!',
    'siege.wallsStand': 'The walls still stand.',
    'siege.attackers': 'Besiegers',
    'siege.defenders': 'Defenders',
    'siege.round': 'Siege round',
    'siege.victory': 'Castle Taken!',
    'siege.defeat': 'Siege Repelled',

    // — Heroes UI (v4) —
    'hero.title': 'Clan Heroes',
    'hero.recruit': 'Recruit',
    'hero.assign': 'Assign to province',
    'hero.assigned': 'Assigned',
    'hero.unassigned': 'Unassigned',
    'hero.level': 'Level',
    'hero.xp': 'XP',
    'hero.nextLevel': 'To level',
    'hero.equip': 'Equip',
    'hero.unequip': 'Unequip',
    'hero.inventory': 'Inventory',
    'hero.skills': 'Hero Skills',
    'hero.stats': 'Stats',
    'hero.atk': 'Attack',
    'hero.def': 'Defense',
    'hero.cost': 'Recruit cost',
    'hero.recruited': 'Recruited',
    'hero.empty': 'No heroes yet. Recruit your first commander.',
    'hero.back': 'Back',

    // — Hero names (v4) —
    'hero.knightcommander': 'Knight-Commander',
    'hero.rangerlord': 'Ranger-Lord',
    'hero.warlord': 'Orc Warlord',
    'hero.shillientemplar': 'Shillien Templar',
    'hero.warsmithlord': 'Warsmith-Lord',
    'hero.soulchampion': 'Soul-Champion',

    // — Hero skills (v4) —
    'skill.hero.rally.name': 'War Cry',
    'skill.hero.rally.desc': 'Rallies the province’s army, raising its attack in battle.',
    'skill.hero.guard.name': 'Unbreakable Line',
    'skill.hero.guard.desc': 'Steels the ranks of defenders, raising their defense in battle.',
    'skill.hero.volley.name': 'Ranger’s Volley',
    'skill.hero.volley.desc': 'A precise volley thins the enemy’s front ranks before the clash.',
    'skill.hero.frenzy.name': 'Berserker’s Fury',
    'skill.hero.frenzy.desc': 'Bloodlust multiplies the army’s damage at the cost of its defense.',
    'skill.hero.shadow.name': 'Veil of Shillen',
    'skill.hero.shadow.desc': 'Shillien’s dark veil saps the enemy’s will and weakens its strike.',
    'skill.hero.forge.name': 'Blessing of the Anvil',
    'skill.hero.forge.desc': 'Dwarven forging hardens the army’s armor, reducing its losses.',
    'skill.hero.soulburst.name': 'Soul Burst',
    'skill.hero.soulburst.desc': 'Soul energy immolates the enemy in a devastating burst.',

    // — Items (v4) —
    'item.sword': 'Aden Knight’s Sword',
    'item.sword.d': 'A tempered blade of the Aden crown. Greatly raises the hero’s attack.',
    'item.axe': 'Orcish War Axe',
    'item.axe.d': 'A heavy axe of Schuttgart. Crushing attack at the cost of finesse.',
    'item.bow': 'Bow of Elmore',
    'item.bow.d': 'An elven bow of fine craft. Raises a ranged hero’s attack.',
    'item.staff': 'Sorcerer’s Staff',
    'item.staff.d': 'A crystal staff fed by magic. Boosts attack and channels power.',
    'item.plate': 'Dwarven Plate',
    'item.plate.d': 'Unbreakable dwarven forging. Greatly raises the hero’s defense.',
    'item.robe': 'Priest’s Robe',
    'item.robe.d': 'A consecrated robe of the Temple. Grants defense and fortitude.',
    'item.shield': 'Tower Shield',
    'item.shield.d': 'A heavy shield of the castle guard. A steadfast guard in battle.',
    'item.ring': 'Ring of the Giants',
    'item.ring.d': 'A relic of the Giants’ age. Adds health and resilience.',
    'item.amulet': 'Amulet of Shilen',
    'item.amulet.d': 'A dark charm of the fallen goddess. Grants power at the price of troubled dreams.',

    // — Campaign UI (v4) —
    'camp.title': 'Campaign for Aden',
    'camp.locked': 'Locked',
    'camp.completed': 'Completed',
    'camp.objective': 'Objective',
    'camp.reward': 'Reward',
    'camp.start': 'Start Scenario',
    'camp.back': 'Back',

    // — Campaign scenarios (v4) —
    'camp.gludio.name': 'The Defense of Gludio',
    'camp.gludio.desc': 'Shilen’s undead pour against the border castle of Gludio. Hold the line until reinforcements arrive.',
    'camp.gludio.objective': 'Hold Gludio for six turns without letting the enemy take the castle.',
    'camp.retakeaden.name': 'The Retaking of Aden',
    'camp.retakeaden.desc': 'The capital has fallen to a usurper. Raise an army and reclaim the crown castle of Aden.',
    'camp.retakeaden.objective': 'Capture the province of Aden.',
    'camp.orcs.name': 'Repel the Orcs',
    'camp.orcs.desc': 'The hordes of Schuttgart descend from the mountains, plundering the eastern lands. Break their invasion.',
    'camp.orcs.objective': 'Eliminate all orc armies on your lands.',
    'camp.darkness.name': 'The Darkness of Shilen',
    'camp.darkness.desc': 'The Seals weaken and the fallen goddess’s legions tear into the world. Hold the crown castles against the onslaught of darkness.',
    'camp.darkness.objective': 'Hold all three crown castles for eight turns.',
    'camp.thrones.name': 'Thrones of Aden',
    'camp.thrones.desc': 'The final battle for the continent. Unite the crowns of Gludio, Giran and Aden and become the lord of Aden.',
    'camp.thrones.objective': 'Seize the three crown castles — Gludio, Giran and Aden.',
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
