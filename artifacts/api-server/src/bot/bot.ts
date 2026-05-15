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
      { command: "profile", description: "Your Pollo owl profile" },
      { command: "feed", description: "Feed your Pollo" },
      { command: "water", description: "Give water to your Pollo" },
      { command: "bathe", description: "Bathe Pollo (chance to find feathers)" },
      { command: "shop", description: "Skin shop — buy with feather fragments" },
      { command: "cards", description: "Your card collection" },
      { command: "duel", description: "Challenge someone (reply to their message)" },
      { command: "family", description: "Owl family — create or view union" },
      { command: "raid", description: "Family raid — steal fragments (3h cooldown)" },
      { command: "quests", description: "Quests and level-up tasks" },
      { command: "top", description: "Leaderboards — XP, feathers, level" },
      { command: "stats", description: "View another player (reply to their message)" },
      { command: "rename", description: "Rename your owl" },
      { command: "familyname", description: "Rename your family" },
      { command: "divorce", description: "Break the family union" },
      { command: "help", description: "Full command guide" },
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
