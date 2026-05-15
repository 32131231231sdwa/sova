export interface Card {
  id: number;
  name: string;
  emoji: string;
  art: string;
  description: string;
  rarity: "common" | "rare" | "epic" | "legendary";
}

export const CARDS: Card[] = [
  {
    id: 1,
    name: "Добрый Pöllö",
    emoji: "🌸",
    art: `
    (ó,ò)
   {♡"'♡}
    -"-"-`,
    description: "Мягкий и тёплый — угукает тихо, как колыбельная.",
    rarity: "common",
  },
  {
    id: 2,
    name: "Злой Pöllö",
    emoji: "😤",
    art: `
    (>_<)
   {!"'"!}
    -!-!-`,
    description: "Когти заточены, взгляд пронзительный. Лучше не злить.",
    rarity: "common",
  },
  {
    id: 3,
    name: "Сонный Pöllö",
    emoji: "😴",
    art: `
    (-,-) 
   {z"z"z}
    ~z~z~`,
    description: "Задремал прямо на ветке. Клюв открыт — хр-р-р.",
    rarity: "common",
  },
  {
    id: 4,
    name: "Голодный Pöllö",
    emoji: "🍗",
    art: `
    (°u°)
   {~"'"~}
    -u-u-`,
    description: "Живот урчит. Смотрит на тебя как на мышь.",
    rarity: "common",
  },
  {
    id: 5,
    name: "Мудрый Pöllö",
    emoji: "📜",
    art: `
    (ö,ö)
   {|"'"|}
    =--=-`,
    description: "Видел рассветы сотни лет. Знает больше, чем скажет.",
    rarity: "rare",
  },
  {
    id: 6,
    name: "Дикий Pöllö",
    emoji: "🌿",
    art: `
    (O,O)
   {/"'"/}
    /"/"/`,
    description: "Вырос в чаще, дичится людей. Но доверяет тебе.",
    rarity: "common",
  },
  {
    id: 7,
    name: "Нежный Pöllö",
    emoji: "🌷",
    art: `
    (^,^)
   {♥"'♥}
    -♥-♥-`,
    description: "Гладит тебя крылом. Угукает нежно.",
    rarity: "common",
  },
  {
    id: 8,
    name: "Хитрый Pöllö",
    emoji: "🎩",
    art: `
    (;,;)
   {~"'~}
    -~-~-`,
    description: "Всегда знает, где лучшая добыча. И молчит об этом.",
    rarity: "rare",
  },
  {
    id: 9,
    name: "Удачливый Pöllö",
    emoji: "🍀",
    art: `
    (*,*)
   {+"+"+}
    -+-+-`,
    description: "Никогда не выбирает отравленное перо. Случайно.",
    rarity: "rare",
  },
  {
    id: 10,
    name: "Грустный Pöllö",
    emoji: "🌧",
    art: `
    (;_;)
   {."'.}
    .'.'.`,
    description: "Сидит под дождём и смотрит в никуда.",
    rarity: "common",
  },
  {
    id: 11,
    name: "Весёлый Pöllö",
    emoji: "🎉",
    art: `
    (^o^)
   {!"'!"}
    !-!-!`,
    description: "Прыгает по веткам, теряя перья от радости.",
    rarity: "common",
  },
  {
    id: 12,
    name: "Гордый Pöllö",
    emoji: "👑",
    art: `
    (^,^)
   {|"^"|} 
    ══════`,
    description: "Расправил крылья во всю ширь. Смотрит сверху вниз.",
    rarity: "rare",
  },
  {
    id: 13,
    name: "Тайный Pöllö",
    emoji: "🌑",
    art: `
    (·,·)
   {?"'?"}
    -?-?-`,
    description: "Появляется ниоткуда. Исчезает без следа.",
    rarity: "epic",
  },
  {
    id: 14,
    name: "Древний Pöllö",
    emoji: "🏛",
    art: `
    (Ö,Ö)
   {#"'#"}
    ══════`,
    description: "Его перья помнят времена до первого леса.",
    rarity: "epic",
  },
  {
    id: 15,
    name: "Лунный Pöllö",
    emoji: "🌙",
    art: `
    (ó,ò)
   {)"'(}
    ~-~-~`,
    description: "Летит только при луне. Оперение светится серебром.",
    rarity: "rare",
  },
  {
    id: 16,
    name: "Огненный Pöllö",
    emoji: "🔥",
    art: `
    (ö,ö)
   {!"'!"}
    ≈≈≈≈≈`,
    description: "Перья как угли. Не трогай — обожжёт.",
    rarity: "epic",
  },
  {
    id: 17,
    name: "Ледяной Pöllö",
    emoji: "❄️",
    art: `
    (o,o)
   {*"'*"}
    *-*-*`,
    description: "Холодный взгляд. Дыхание — туман.",
    rarity: "epic",
  },
  {
    id: 18,
    name: "Грозовой Pöllö",
    emoji: "⚡",
    art: `
    (Ó,Ó)
   {="'="}
    ~=~=~`,
    description: "Садится на провода и молчит. Всё молчит.",
    rarity: "rare",
  },
  {
    id: 19,
    name: "Лесной Pöllö",
    emoji: "🌲",
    art: `
    (o,o)
   {/"'/"}
    /|/|/`,
    description: "Сросся с деревом. Вылетает только ночью.",
    rarity: "common",
  },
  {
    id: 20,
    name: "Призрачный Pöllö",
    emoji: "👻",
    art: `
    (◦,◦)
   {?"'?"}
    ·-·-·`,
    description: "Полупрозрачный. Угукает из пустоты.",
    rarity: "epic",
  },
  {
    id: 21,
    name: "Боевой Pöllö",
    emoji: "⚔️",
    art: `
    (>,<)
   {!"'!"}
    ═╗═╗═`,
    description: "Шрам через весь лоб. Победитель пяти дуэлей.",
    rarity: "rare",
  },
  {
    id: 22,
    name: "Нордический Pöllö",
    emoji: "🏔",
    art: `
    (o,o)
   {#"'#"}
    ▲-▲-▲`,
    description: "Пришёл с севера. Перья белее снега.",
    rarity: "rare",
  },
  {
    id: 23,
    name: "Рябиновый Pöllö",
    emoji: "🔴",
    art: `
    (o,o)
   {o"'o"}
    o-o-o`,
    description: "Живёт в рябиновой роще. Ягоды — его монета.",
    rarity: "common",
  },
  {
    id: 24,
    name: "Заботливый Pöllö",
    emoji: "🤗",
    art: `
    (^,^)
   {+"'+"}
    -+-+-`,
    description: "Приносит мышей к чужим гнёздам. Просто так.",
    rarity: "common",
  },
  {
    id: 25,
    name: "Дерзкий Pöllö",
    emoji: "😏",
    art: `
    (>,·)
   {!"'~"}
    -!-~-`,
    description: "Сидит вверх ногами и доволен.",
    rarity: "common",
  },
  {
    id: 26,
    name: "Мечтательный Pöllö",
    emoji: "💭",
    art: `
    (o,·)
   {~"'~"}
    ~·~·~`,
    description: "Смотрит на звёзды и забывает есть.",
    rarity: "rare",
  },
  {
    id: 27,
    name: "Стражник Pöllö",
    emoji: "🛡",
    art: `
    (|,|)
   {|"'|"}
    |=|=|`,
    description: "Не спит всю ночь. Охраняет гнездо.",
    rarity: "rare",
  },
  {
    id: 28,
    name: "Охотник Pöllö",
    emoji: "🎯",
    art: `
    (>,<)
   {x"'x"}
    -x-x-`,
    description: "Мышь в 200 метрах? Уже летит.",
    rarity: "rare",
  },
  {
    id: 29,
    name: "Волшебный Pöllö",
    emoji: "✨",
    art: `
    (*,*)
   {✦"'✦}
    ✦-✦-✦`,
    description: "Оставляет искры при каждом взмахе крыла.",
    rarity: "epic",
  },
  {
    id: 30,
    name: "Легендарный Pöllö",
    emoji: "🏆",
    art: `
    (Ö,Ö)
   {★"'★}
    ★═★═★`,
    description: "О нём слагают легенды. Говорят, видели его дважды.",
    rarity: "legendary",
  },
];

export interface Skin {
  id: string;
  name: string;
  emoji: string;
  art: string;
  levelReq: number;
  featherCost: number;
  frameStyle: string;
  description: string;
}

export const SKINS: Skin[] = [
  {
    id: "default",
    name: "Обычная Pöllö",
    emoji: "🦉",
    art: `
   (o,o)
  {{"'"{}}
   -"-"-`,
    levelReq: 0,
    featherCost: 0,
    frameStyle: "╔═╗║╚═╝",
    description: "Обычная, но любимая.",
  },
  {
    id: "snow",
    name: "Снежная Pöllö",
    emoji: "🤍",
    art: `
   (o,o)
  {*"'*}
   *-*-*`,
    levelReq: 3,
    featherCost: 50,
    frameStyle: "┌─┐│└─┘",
    description: "Белая как первый снег.",
  },
  {
    id: "ash",
    name: "Пепельная Pöllö",
    emoji: "🌫️",
    art: `
   (·,·)
  {~"'~}
   ~-~-~`,
    levelReq: 5,
    featherCost: 80,
    frameStyle: "╔═╗║╚═╝",
    description: "Серая и незаметная, пока не захочет.",
  },
  {
    id: "golden",
    name: "Золотая Pöllö",
    emoji: "🌟",
    art: `
   (★,★)
  {★"'★}
   ★-★-★`,
    levelReq: 8,
    featherCost: 150,
    frameStyle: "╔═╗║╚═╝",
    description: "Блестит в лунном свете.",
  },
  {
    id: "polar",
    name: "Полярная Pöllö",
    emoji: "❄️",
    art: `
   (o,o)
  {❄"'❄}
   ❄-❄-❄`,
    levelReq: 10,
    featherCost: 200,
    frameStyle: "┌─┐│└─┘",
    description: "Из вечной мерзлоты.",
  },
  {
    id: "moon",
    name: "Лунная Pöllö",
    emoji: "🌙",
    art: `
   (ó,ò)
  {)"'(}
   ~-~-~`,
    levelReq: 12,
    featherCost: 250,
    frameStyle: "╔═╗║╚═╝",
    description: "Летает только ночью.",
  },
  {
    id: "bald",
    name: "Лысая Сова",
    emoji: "🥚",
    art: `
   (o,o)
  { "'  }
   -"-"-`,
    levelReq: 12,
    featherCost: 150,
    frameStyle: "╔═╗║╚═╝",
    description: "Потеряла все перья. Зато характер остался.",
  },
  {
    id: "fire",
    name: "Огненная Pöllö",
    emoji: "🔥",
    art: `
   (ö,ö)
  {🔥"'🔥}
   ≈≈≈≈≈`,
    levelReq: 15,
    featherCost: 300,
    frameStyle: "╔═╗║╚═╝",
    description: "Жжёт всё, что касается.",
  },
  {
    id: "emerald",
    name: "Изумрудная Pöllö",
    emoji: "💚",
    art: `
   (o,o)
  {◆"'◆}
   ◆-◆-◆`,
    levelReq: 18,
    featherCost: 400,
    frameStyle: "┌─┐│└─┘",
    description: "Цвета густого леса.",
  },
  {
    id: "dark",
    name: "Тёмная Pöllö",
    emoji: "🖤",
    art: `
   (◦,◦)
  {▪"'▪}
   ▪-▪-▪`,
    levelReq: 20,
    featherCost: 500,
    frameStyle: "╔═╗║╚═╝",
    description: "Растворяется в темноте.",
  },
  {
    id: "royal",
    name: "Королевская Pöllö",
    emoji: "👑",
    art: `
   (^,^)
  {★"'★}
   ══════`,
    levelReq: 25,
    featherCost: 600,
    frameStyle: "╔═╗║╚═╝",
    description: "Правит лесом с незапамятных времён.",
  },
  {
    id: "ghost",
    name: "Призрачная Pöllö",
    emoji: "👻",
    art: `
   (◦,◦)
  {?"'?}
   ·-·-·`,
    levelReq: 30,
    featherCost: 800,
    frameStyle: "┌─┐│└─┘",
    description: "Видна только при определённом освещении.",
  },
  {
    id: "sky",
    name: "Небесная Pöllö",
    emoji: "☁️",
    art: `
   (o,o)
  {☁"'☁}
   ~☁~☁~`,
    levelReq: 35,
    featherCost: 1000,
    frameStyle: "╔═╗║╚═╝",
    description: "Живёт выше облаков.",
  },
  {
    id: "rainbow",
    name: "Радужная Pöllö",
    emoji: "🌈",
    art: `
   (*,*)
  {🌈"'🌈}
   🌈-🌈-🌈`,
    levelReq: 40,
    featherCost: 1200,
    frameStyle: "╔═╗║╚═╝",
    description: "Появляется после дождя.",
  },
  {
    id: "legend",
    name: "Легендарная Pöllö",
    emoji: "⭐",
    art: `
   (Ö,Ö)
  {★"'★}
   ★═★═★`,
    levelReq: 50,
    featherCost: 2000,
    frameStyle: "╔═╗║╚═╝",
    description: "Один из рода. Никто больше не видел такой.",
  },
];

export interface QuestDef {
  id: string;
  forLevel: number;
  description: string;
  target: number;
  type:
    | "duel_win"
    | "duel_win_feather"
    | "duel_win_battle"
    | "duel_win_tictactoe"
    | "duel_win_dice"
    | "collect_feathers"
    | "feed_owl"
    | "water_owl"
    | "bathe_owl"
    | "send_messages"
    | "duel_total"
    | "get_cards"
    | "level_reached"
    | "family_heist";
}

export const QUESTS: QuestDef[] = [
  // Level 6
  {
    id: "l6_feather_duel",
    forLevel: 6,
    description: "Победи в дуэли с пером 🪶",
    target: 1,
    type: "duel_win_feather",
  },
  // Level 7
  {
    id: "l7_battle_duel",
    forLevel: 7,
    description: "Победи в поединке ⚔️",
    target: 1,
    type: "duel_win_battle",
  },
  // Level 8
  {
    id: "l8_collect_feathers",
    forLevel: 8,
    description: "Собери 30 фрагментов 🪶",
    target: 30,
    type: "collect_feathers",
  },
  // Level 9
  {
    id: "l9_win_3duels",
    forLevel: 9,
    description: "Победи в 3 дуэлях",
    target: 3,
    type: "duel_win",
  },
  // Level 10
  {
    id: "l10_feed_10",
    forLevel: 10,
    description: "Покорми Pöllö 10 раз 🍖",
    target: 10,
    type: "feed_owl",
  },
  // Level 11
  {
    id: "l11_tictactoe",
    forLevel: 11,
    description: "Победи в крестики-нолики",
    target: 2,
    type: "duel_win_tictactoe",
  },
  // Level 12
  {
    id: "l12_feathers_100",
    forLevel: 12,
    description: "Собери 100 фрагментов 🪶",
    target: 100,
    type: "collect_feathers",
  },
  // Level 13
  {
    id: "l13_bathe_5",
    forLevel: 13,
    description: "Искупай Pöllö 5 раз 🛁",
    target: 5,
    type: "bathe_owl",
  },
  // Level 14
  {
    id: "l14_messages_50",
    forLevel: 14,
    description: "Отправь 50 сообщений боту",
    target: 50,
    type: "send_messages",
  },
  // Level 15
  {
    id: "l15_win_5duels",
    forLevel: 15,
    description: "Одержи 5 побед в дуэлях",
    target: 5,
    type: "duel_win",
  },
  // Level 16
  {
    id: "l16_feathers_200",
    forLevel: 16,
    description: "Собери 200 фрагментов 🪶",
    target: 200,
    type: "collect_feathers",
  },
  // Level 17
  {
    id: "l17_cards_5",
    forLevel: 17,
    description: "Получи 5 карточек 🃏",
    target: 5,
    type: "get_cards",
  },
  // Level 18
  {
    id: "l18_battle_3",
    forLevel: 18,
    description: "Победи в 3 поединках ⚔️",
    target: 3,
    type: "duel_win_battle",
  },
  // Level 19
  {
    id: "l19_water_20",
    forLevel: 19,
    description: "Напои Pöllö 20 раз 💧",
    target: 20,
    type: "water_owl",
  },
  // Level 20
  {
    id: "l20_feathers_300",
    forLevel: 20,
    description: "Собери 300 фрагментов 🪶",
    target: 300,
    type: "collect_feathers",
  },
  // Level 21
  {
    id: "l21_win_10duels",
    forLevel: 21,
    description: "Одержи 10 побед в дуэлях",
    target: 10,
    type: "duel_win",
  },
  // Level 22
  {
    id: "l22_bathe_15",
    forLevel: 22,
    description: "Искупай Pöllö 15 раз 🛁",
    target: 15,
    type: "bathe_owl",
  },
  // Level 23
  {
    id: "l23_cards_10",
    forLevel: 23,
    description: "Получи 10 карточек 🃏",
    target: 10,
    type: "get_cards",
  },
  // Level 24
  {
    id: "l24_feathers_500",
    forLevel: 24,
    description: "Собери 500 фрагментов 🪶",
    target: 500,
    type: "collect_feathers",
  },
  // Level 25
  {
    id: "l25_feather_duel_5",
    forLevel: 25,
    description: "Победи в 5 дуэлях с пером 🪶",
    target: 5,
    type: "duel_win_feather",
  },
  // Level 26
  {
    id: "l26_messages_200",
    forLevel: 26,
    description: "Отправь 200 сообщений",
    target: 200,
    type: "send_messages",
  },
  // Level 27
  {
    id: "l27_heist_3",
    forLevel: 27,
    description: "Совершите 3 семейных вылазки 👨‍👩‍👧",
    target: 3,
    type: "family_heist",
  },
  // Level 28
  {
    id: "l28_win_20duels",
    forLevel: 28,
    description: "Одержи 20 побед в дуэлях",
    target: 20,
    type: "duel_win",
  },
  // Level 29
  {
    id: "l29_feathers_800",
    forLevel: 29,
    description: "Собери 800 фрагментов 🪶",
    target: 800,
    type: "collect_feathers",
  },
  // Level 30
  {
    id: "l30_cards_20",
    forLevel: 30,
    description: "Получи 20 карточек 🃏",
    target: 20,
    type: "get_cards",
  },
  // Level 31
  {
    id: "l31_battle_10",
    forLevel: 31,
    description: "Победи в 10 поединках ⚔️",
    target: 10,
    type: "duel_win_battle",
  },
  // Level 32
  {
    id: "l32_bathe_30",
    forLevel: 32,
    description: "Искупай Pöllö 30 раз 🛁",
    target: 30,
    type: "bathe_owl",
  },
  // Level 33
  {
    id: "l33_feathers_1200",
    forLevel: 33,
    description: "Собери 1200 фрагментов 🪶",
    target: 1200,
    type: "collect_feathers",
  },
  // Level 34
  {
    id: "l34_messages_500",
    forLevel: 34,
    description: "Отправь 500 сообщений",
    target: 500,
    type: "send_messages",
  },
  // Level 35
  {
    id: "l35_win_30duels",
    forLevel: 35,
    description: "Одержи 30 побед в дуэлях",
    target: 30,
    type: "duel_win",
  },
  // Level 36
  {
    id: "l36_feathers_1500",
    forLevel: 36,
    description: "Собери 1500 фрагментов 🪶",
    target: 1500,
    type: "collect_feathers",
  },
  // Level 37
  {
    id: "l37_cards_30",
    forLevel: 37,
    description: "Получи 30 карточек 🃏",
    target: 30,
    type: "get_cards",
  },
  // Level 38
  {
    id: "l38_tictactoe_10",
    forLevel: 38,
    description: "Победи в 10 крестиках-ноликах",
    target: 10,
    type: "duel_win_tictactoe",
  },
  // Level 39
  {
    id: "l39_feathers_2000",
    forLevel: 39,
    description: "Собери 2000 фрагментов 🪶",
    target: 2000,
    type: "collect_feathers",
  },
  // Level 40
  {
    id: "l40_win_50duels",
    forLevel: 40,
    description: "Одержи 50 побед в дуэлях",
    target: 50,
    type: "duel_win",
  },
  // Level 41
  {
    id: "l41_heist_10",
    forLevel: 41,
    description: "Совершите 10 семейных вылазок 👨‍👩‍👧",
    target: 10,
    type: "family_heist",
  },
  // Level 42
  {
    id: "l42_feathers_3000",
    forLevel: 42,
    description: "Собери 3000 фрагментов 🪶",
    target: 3000,
    type: "collect_feathers",
  },
  // Level 43
  {
    id: "l43_messages_1000",
    forLevel: 43,
    description: "Отправь 1000 сообщений",
    target: 1000,
    type: "send_messages",
  },
  // Level 44
  {
    id: "l44_win_70duels",
    forLevel: 44,
    description: "Одержи 70 побед в дуэлях",
    target: 70,
    type: "duel_win",
  },
  // Level 45
  {
    id: "l45_feathers_5000",
    forLevel: 45,
    description: "Собери 5000 фрагментов 🪶",
    target: 5000,
    type: "collect_feathers",
  },
  // Level 46
  {
    id: "l46_battle_30",
    forLevel: 46,
    description: "Победи в 30 поединках ⚔️",
    target: 30,
    type: "duel_win_battle",
  },
  // Level 47
  {
    id: "l47_cards_50",
    forLevel: 47,
    description: "Получи 50 карточек 🃏",
    target: 50,
    type: "get_cards",
  },
  // Level 48
  {
    id: "l48_feathers_8000",
    forLevel: 48,
    description: "Собери 8000 фрагментов 🪶",
    target: 8000,
    type: "collect_feathers",
  },
  // Level 49
  {
    id: "l49_win_100duels",
    forLevel: 49,
    description: "Одержи 100 побед в дуэлях",
    target: 100,
    type: "duel_win",
  },
  // Level 50
  {
    id: "l50_legend",
    forLevel: 50,
    description: "Собери 10000 фрагментов 🪶",
    target: 10000,
    type: "collect_feathers",
  },
];

export const LEVEL_XP: number[] = [
  0, 0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 3900, 5000, 6300, 7800,
  9500, 11500, 14000, 17000, 20500, 24500, 29000, 34000, 40000, 47000, 55000,
  64000, 74000, 85000, 97000, 110000, 125000, 142000, 161000, 182000, 205000,
  231000, 260000, 292000, 327000, 366000, 409000, 456000, 508000, 565000,
  628000, 697000, 773000, 856000, 947000, 1047000, 1156000,
];

export const OWL_RESPONSES = [
  "🦉 *широко расправляет крылья*",
  "🦉 *угукает и моргает*",
  "🦉 *хлопает крыльями с шумом*",
  "🦉 *вертит головой на 180°*",
  "🦉 *пищит и топает лапами*",
  "🦉 *встряхивает перьями*",
  "🦉 *уставился немигающим взглядом*",
  "🦉 *угу-угу!*",
  "🦉 *щёлкает клювом*",
  "🦉 *надувается и кивает*",
  "🦉 *переступает с лапы на лапу*",
  "🦉 *пыхтит и вздыхает*",
];

export const RARITY_LABELS: Record<string, string> = {
  common: "Обычная",
  rare: "Редкая",
  epic: "Эпическая",
  legendary: "Легендарная",
};

export const RARITY_EMOJI: Record<string, string> = {
  common: "⚪",
  rare: "🔵",
  epic: "🟣",
  legendary: "🟡",
};
