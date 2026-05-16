import { Bot } from "grammy";
import type { Context } from "grammy";
import { registerCommands, registerTopCallbacks } from "./handlers/commands.js";
import { registerShopHandlers } from "./handlers/shop.js";
import { registerDuelHandlers } from "./handlers/duel.js";
import { registerFamilyHandlers } from "./handlers/family.js";
import { registerQuestHandlers } from "./handlers/quests.js";
import { registerMessageHandler } from "./handlers/messages.js";
import { registerMenuHandlers } from "./handlers/menu.js";
import { logger } from "../lib/logger.js";

export function createBot(): Bot<Context> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const bot = new Bot<Context>(token);

  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx?.update }, "Bot error");
  });

  // Order matters: duel text handler checks ForceReply states before passing to next()
  registerMenuHandlers(bot);     // /menu, /wardrobe + inline menu callbacks
  registerCommands(bot);         // /feed, /water, /bathe, /game, /sleep, /profile, etc.
  registerTopCallbacks(bot);     // top_xp / top_feathers / top_level inline callbacks
  registerShopHandlers(bot);     // /shop + shop_* callbacks
  registerDuelHandlers(bot);     // /duel + all duel callbacks + ForceReply text handler
  registerFamilyHandlers(bot);   // /family, /raid, /divorce + family callbacks
  registerQuestHandlers(bot);    // /quests + quest callbacks
  registerMessageHandler(bot);   // general message handler (card drops, owl name, reactions)

  bot.api
    .setMyCommands([
      { command: "menu", description: "🦉 Главное меню — всё в одном месте" },
      { command: "profile", description: "Профиль твоей совы Pöllö" },
      { command: "feed", description: "Покормить Pöllö (кд 30 мин)" },
      { command: "water", description: "Напоить Pöllö (кд 30 мин)" },
      { command: "bathe", description: "Искупать — шанс 40% найти фрагменты" },
      { command: "game", description: "Поиграть с Pöllö (кд 30 мин, +веселье)" },
      { command: "sleep", description: "Поспать (кд 1 ч, +бодрость)" },
      { command: "duel", description: "Дуэль — ответь на сообщение игрока" },
      { command: "shop", description: "Магазин скинов — покупай за фрагменты" },
      { command: "wardrobe", description: "Гардероб — надень скин" },
      { command: "cards", description: "Твоя коллекция карточек" },
      { command: "family", description: "Семья сов — создать или просмотреть" },
      { command: "raid", description: "Семейная вылазка (кд 3 ч)" },
      { command: "quests", description: "Квесты для повышения уровня" },
      { command: "top", description: "Таблица лидеров — XP, фрагменты, уровень" },
      { command: "stats", description: "Статистика — ответь на сообщение игрока" },
      { command: "rename", description: "Переименовать свою сову" },
      { command: "help", description: "Полная справка по командам" },
    ])
    .then(() => logger.info("Bot commands set"))
    .catch((err) => logger.error({ err }, "Failed to set bot commands"));

  return bot;
}

export async function startBot(): Promise<void> {
  const bot = createBot();
  logger.info("Starting Telegram bot (Взрастить Pöllö)...");
  await bot.start({
    onStart(info) {
      logger.info({ username: info.username }, "Bot started");
    },
  });
}
