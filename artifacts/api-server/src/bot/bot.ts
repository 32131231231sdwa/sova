import { Bot } from "grammy";
import type { Context } from "grammy";
import { registerCommands, registerTopCallbacks } from "./handlers/commands.js";
import { registerShopHandlers } from "./handlers/shop.js";
import { registerDuelHandlers } from "./handlers/duel.js";
import { registerFamilyHandlers } from "./handlers/family.js";
import { registerQuestHandlers } from "./handlers/quests.js";
import { registerMessageHandler } from "./handlers/messages.js";
import { logger } from "../lib/logger.js";

export function createBot(): Bot<Context> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const bot = new Bot<Context>(token);

  // Error handler
  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx?.update }, "Bot error");
  });

  // Register all handlers
  registerCommands(bot);
  registerTopCallbacks(bot);
  registerShopHandlers(bot);
  registerDuelHandlers(bot);
  registerFamilyHandlers(bot);
  registerQuestHandlers(bot);
  registerMessageHandler(bot);

  // Set bot commands list (shown in / menu)
  // Telegram requires ASCII commands for the menu — Russian aliases still work too
  bot.api
    .setMyCommands([
      { command: "profile", description: "Профиль твоей совы Pöllö" },
      { command: "feed", description: "Покормить Pöllö" },
      { command: "water", description: "Напоить Pöllö" },
      { command: "bathe", description: "Искупать (шанс найти фрагменты)" },
      { command: "game", description: "Поиграть с Pöllö (поднимает веселье)" },
      { command: "shop", description: "Магазин скинов — покупай за фрагменты" },
      { command: "cards", description: "Твоя коллекция карточек" },
      { command: "duel", description: "Дуэль — ответь на сообщение игрока" },
      { command: "family", description: "Семья сов — создать или просмотреть союз" },
      { command: "raid", description: "Семейная вылазка (кд 3 ч)" },
      { command: "quests", description: "Квесты и задания для повышения уровня" },
      { command: "top", description: "Таблица лидеров — XP, фрагменты, уровень" },
      { command: "stats", description: "Статистика игрока — ответь на его сообщение" },
      { command: "rename", description: "Переименовать свою сову" },
      { command: "familyname", description: "Переименовать семью" },
      { command: "divorce", description: "Разорвать семейный союз" },
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
