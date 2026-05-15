import { Bot, InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import {
  getOrCreateUser,
  updateUser,
  addXP,
  addFeathers,
  getUserCards,
  getFamily,
  getTopByXP,
  getTopByFeathers,
  getTopByLevel,
} from "../dbHelpers.js";
import {
  formatProfile,
  getEffectiveHunger,
  getEffectiveThirst,
  progressBar,
  esc,
  getSkin,
  getLevelXP,
  cardRarityDisplay,
} from "../format.js";
import { CARDS, SKINS, OWL_RESPONSES, QUESTS } from "../data.js";
import { upsertQuestProgress } from "../dbHelpers.js";
import { db } from "@workspace/db";
import { owlUsers } from "@workspace/db";
import { eq } from "drizzle-orm";

const FEED_COOLDOWN_MS = 30 * 60 * 1000;
const WATER_COOLDOWN_MS = 30 * 60 * 1000;
const BATH_COOLDOWN_MS = 60 * 60 * 1000;

export function registerCommands(bot: Bot<Context>) {
  bot.command("start", async (ctx) => {
    const user = await getOrCreateUser(
      ctx.from!.id,
      ctx.from!.username,
    );
    const skin = getSkin(user.owlSkin);
    await ctx.reply(
      `🦉 <b>Добро пожаловать в Взрастить Pöllö!</b>\n\n` +
        `Твоя сова <b>${esc(user.owlName)}</b> (${skin.emoji} ${esc(skin.name)}) ждёт тебя!\n\n` +
        `Корми её, пои, купай, участвуй в дуэлях и развивай свою Pöllö!\n\n` +
        `Напиши <code>/полло</code> для просмотра профиля или используй команды из меню.`,
      { parse_mode: "HTML" },
    );
  });

  bot.command(["полло", "pollo", "profile", "pfollo", "pöllö"], async (ctx) => {
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const family = await getFamily(ctx.from!.id);
    const isGroup = ctx.chat?.type !== "private";
    const profileText = formatProfile(user, family?.familyName ?? null, isGroup);
    await ctx.reply(profileText, { parse_mode: "HTML" });
  });

  bot.command(["кормить", "kormit"], async (ctx) => {
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const lastFed = new Date(user.lastFedAt).getTime();
    const now = Date.now();
    const remaining = FEED_COOLDOWN_MS - (now - lastFed);

    if (remaining > 0) {
      const mins = Math.ceil(remaining / 60000);
      await ctx.reply(
        `🍗 Pöllö ещё не голодна! Подожди ещё <b>${mins} мин.</b>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const hungerGain = Math.floor(Math.random() * 20) + 20;
    const currentHunger = getEffectiveHunger(user);
    const newHunger = Math.min(100, currentHunger + hungerGain);
    const xpGain = 5;

    await updateUser(ctx.from!.id, {
      hunger: newHunger,
      lastFedAt: new Date(),
    });
    await addXP(ctx.from!.id, xpGain);
    await upsertQuestProgress(ctx.from!.id, `l10_feed_10`, 10, 1);
    await upsertQuestProgress(ctx.from!.id, `l10_feed_10`, 10, 0);

    const questIds = ["l10_feed_10"];
    for (const qid of questIds) {
      await upsertQuestProgress(ctx.from!.id, qid, 10, 1);
    }

    const foods = ["🍗 мышку", "🐛 жирного червяка", "🦎 ящерку", "🐟 рыбку", "🌰 желудь"];
    const food = foods[Math.floor(Math.random() * foods.length)];

    await ctx.reply(
      `${getSkin(user.owlSkin).emoji} <b>${esc(user.owlName)}</b> съела ${food}!\n` +
        `🍗 Голод: ${progressBar(newHunger)} (+${hungerGain})\n` +
        `✨ +${xpGain} XP`,
      { parse_mode: "HTML" },
    );
  });

  bot.command(["поить", "poit"], async (ctx) => {
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const lastWatered = new Date(user.lastWateredAt).getTime();
    const now = Date.now();
    const remaining = WATER_COOLDOWN_MS - (now - lastWatered);

    if (remaining > 0) {
      const mins = Math.ceil(remaining / 60000);
      await ctx.reply(
        `💧 Pöllö ещё не хочет пить! Подожди ещё <b>${mins} мин.</b>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const thirstGain = Math.floor(Math.random() * 20) + 20;
    const currentThirst = getEffectiveThirst(user);
    const newThirst = Math.min(100, currentThirst + thirstGain);
    const xpGain = 5;

    await updateUser(ctx.from!.id, {
      thirst: newThirst,
      lastWateredAt: new Date(),
    });
    await addXP(ctx.from!.id, xpGain);

    const drinks = ["🌊 из ручья", "🌧️ дождевой воды", "💦 из лужи", "🧊 ключевой воды"];
    const drink = drinks[Math.floor(Math.random() * drinks.length)];

    await ctx.reply(
      `${getSkin(user.owlSkin).emoji} <b>${esc(user.owlName)}</b> попила ${drink}!\n` +
        `💧 Жажда: ${progressBar(newThirst)} (+${thirstGain})\n` +
        `✨ +${xpGain} XP`,
      { parse_mode: "HTML" },
    );
  });

  bot.command(["купать", "kupat"], async (ctx) => {
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const lastBathed = user.lastBathedAt ? new Date(user.lastBathedAt).getTime() : 0;
    const now = Date.now();
    const remaining = BATH_COOLDOWN_MS - (now - lastBathed);

    if (remaining > 0) {
      const mins = Math.ceil(remaining / 60000);
      await ctx.reply(
        `🛁 Pöllö только что купалась! Подожди ещё <b>${mins} мин.</b>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const foundFeathers = Math.random() < 0.2;
    const featherCount = foundFeathers ? Math.floor(Math.random() * 8) + 1 : 0;
    const xpGain = 10;

    await updateUser(ctx.from!.id, {
      lastBathedAt: new Date(),
      totalBathes: user.totalBathes + 1,
    });
    await addXP(ctx.from!.id, xpGain);

    const bathQuestIds = ["l13_bathe_5", "l22_bathe_15", "l32_bathe_30"];
    for (const qid of bathQuestIds) {
      const quest = QUESTS.find((q) => q.id === qid);
      if (quest) await upsertQuestProgress(ctx.from!.id, qid, quest.target, 1);
    }

    if (foundFeathers) {
      await addFeathers(ctx.from!.id, featherCount);
      await ctx.reply(
        `🛁 <b>${esc(user.owlName)}</b> плещется в луже и нашла кое-что!\n\n` +
          `🪶 <b>+${featherCount} фрагментов!</b>\n` +
          `✨ +${xpGain} XP`,
        { parse_mode: "HTML" },
      );
    } else {
      await ctx.reply(
        `🛁 <b>${esc(user.owlName)}</b> чисто и с удовольствием искупалась.\n\n` +
          `💦 Перья блестят, но ничего не нашла.\n` +
          `✨ +${xpGain} XP`,
        { parse_mode: "HTML" },
      );
    }
  });

  bot.command(["карточки", "kartochki"], async (ctx) => {
    const cards = await getUserCards(ctx.from!.id);
    if (cards.length === 0) {
      await ctx.reply(
        `🃏 У тебя пока нет карточек!\n\nОни выпадают случайно при общении с ботом — шанс 1.2%`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const counts: Record<number, number> = {};
    for (const c of cards) {
      counts[c.cardId] = (counts[c.cardId] ?? 0) + 1;
    }

    const lines: string[] = [`🃏 <b>Коллекция карточек</b> (${cards.length} шт.)\n`];
    for (const [cardIdStr, count] of Object.entries(counts)) {
      const cardId = parseInt(cardIdStr);
      const card = CARDS.find((c) => c.id === cardId);
      if (!card) continue;
      const rarityStr = cardRarityDisplay(card.rarity);
      lines.push(
        `${card.emoji} <b>${esc(card.name)}</b> ${count > 1 ? `×${count}` : ""}\n` +
          `   ${rarityStr}`,
      );
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command(["переименовать", "pereimenovat"], async (ctx) => {
    const args = ctx.message?.text?.split(" ").slice(1).join(" ").trim();
    if (!args) {
      await ctx.reply(
        `✏️ Напиши новое имя совы:\n<code>/переименовать НовоеИмя</code>`,
        { parse_mode: "HTML" },
      );
      return;
    }
    if (args.length > 20) {
      await ctx.reply(`❌ Имя слишком длинное (макс 20 символов)`);
      return;
    }
    await updateUser(ctx.from!.id, { owlName: args });
    await ctx.reply(
      `✅ Теперь твою сову зовут <b>${esc(args)}</b>!`,
      { parse_mode: "HTML" },
    );
  });

  bot.command(["топ", "top"], async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text("✨ По XP", "top_xp")
      .text("🪶 По фрагментам", "top_feathers")
      .row()
      .text("📊 По уровню", "top_level");

    await ctx.reply(`🏆 <b>Топ игроков</b>\n\nВыбери категорию:`, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  bot.command(["стат", "stat"], async (ctx) => {
    const mention = ctx.message?.reply_to_message?.from;
    if (!mention) {
      await ctx.reply(
        `👁 Ответь на сообщение игрока командой <code>/стат</code>, чтобы посмотреть его сову.`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const targetUser = await getOrCreateUser(mention.id, mention.username);
    const family = await getFamily(mention.id);
    const cards = await getUserCards(mention.id);
    const skin = getSkin(targetUser.owlSkin);
    const hunger = getEffectiveHunger(targetUser);
    const thirst = getEffectiveThirst(targetUser);
    const xpForLevel = getLevelXP(targetUser.level);
    const xpForNext = targetUser.level < 50 ? getLevelXP(targetUser.level + 1) : 0;
    const uniqueCards = new Set(cards.map((c) => c.cardId)).size;

    const displayName = mention.username
      ? `@${mention.username}`
      : mention.first_name;

    await ctx.reply(
      `${skin.emoji} <b>${esc(targetUser.owlName)}</b> (@${esc(displayName)})\n` +
        `<i>${esc(skin.name)}</i>\n\n` +
        `📊 Уровень: <b>${targetUser.level}</b>\n` +
        (targetUser.level < 50
          ? `✨ XP: <b>${targetUser.xp - xpForLevel}/${xpForNext - xpForLevel}</b>\n`
          : `✨ Максимальный уровень!\n`) +
        `🍗 Голод: <b>${Math.round(hunger)}%</b>\n` +
        `💧 Жажда: <b>${Math.round(thirst)}%</b>\n` +
        `🪶 Фрагменты: <b>${targetUser.feathers}</b>\n` +
        `🃏 Карточек: <b>${uniqueCards}</b> уникальных\n` +
        `⚔️ Дуэли: <b>${targetUser.totalDuelsWon}W / ${targetUser.totalDuelsLost}L</b>\n` +
        (family ? `👨‍👩‍👧 Семья: <b>${esc(family.familyName)}</b>\n` : ""),
      { parse_mode: "HTML" },
    );
  });

  bot.command(["помощь", "pomosh", "help"], async (ctx) => {
    await ctx.reply(
      `🦉 <b>Взрастить Pöllö — Справка</b>\n\n` +
        `<b>Основные команды:</b>\n` +
        `/полло — профиль совы\n` +
        `/кормить — покормить Pöllö\n` +
        `/поить — напоить Pöllö\n` +
        `/купать — искупать (шанс найти фрагменты)\n` +
        `/переименовать — дать имя своей сове\n` +
        `/карточки — твоя коллекция карточек\n\n` +
        `<b>Игры:</b>\n` +
        `/дуэль @игрок — вызвать на дуэль\n\n` +
        `<b>Магазин:</b>\n` +
        `/магазин — купить скин\n\n` +
        `<b>Семья:</b>\n` +
        `/семья @игрок — предложить союз\n` +
        `/расстаться — разорвать семейный союз\n` +
        `/вылазка — семейная вылазка\n` +
        `/семяимя НовоеИмя — переименовать семью\n\n` +
        `<b>Рейтинги:</b>\n` +
        `/топ — таблицы лидеров\n` +
        `/стат — (ответить на сообщение) статистика игрока\n\n` +
        `<b>Задания:</b>\n` +
        `/задания — прогресс квестов\n\n` +
        `💡 Карточки выпадают случайно при сообщениях (1.2% шанс)!\n` +
        `💡 Назови сову по имени — она откликнется!`,
      { parse_mode: "HTML" },
    );
  });
}

export function registerTopCallbacks(bot: Bot<Context>) {
  bot.callbackQuery("top_xp", async (ctx) => {
    await ctx.answerCallbackQuery();
    const users = await getTopByXP(10);
    let text = `🏆 <b>Топ по опыту (XP)</b>\n\n`;
    users.forEach((u, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      const name = u.username ? `@${u.username}` : u.owlName;
      text += `${medal} <b>${esc(u.owlName)}</b> (${esc(name)}) — ✨ ${u.xp} XP\n`;
    });
    await ctx.editMessageText(text, { parse_mode: "HTML" });
  });

  bot.callbackQuery("top_feathers", async (ctx) => {
    await ctx.answerCallbackQuery();
    const users = await getTopByFeathers(10);
    let text = `🏆 <b>Топ по фрагментам 🪶</b>\n\n`;
    users.forEach((u, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      const name = u.username ? `@${u.username}` : u.owlName;
      text += `${medal} <b>${esc(u.owlName)}</b> (${esc(name)}) — 🪶 ${u.feathers}\n`;
    });
    await ctx.editMessageText(text, { parse_mode: "HTML" });
  });

  bot.callbackQuery("top_level", async (ctx) => {
    await ctx.answerCallbackQuery();
    const users = await getTopByLevel(10);
    let text = `🏆 <b>Топ по уровню</b>\n\n`;
    users.forEach((u, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      const name = u.username ? `@${u.username}` : u.owlName;
      text += `${medal} <b>${esc(u.owlName)}</b> (${esc(name)}) — 📊 Ур. ${u.level}\n`;
    });
    await ctx.editMessageText(text, { parse_mode: "HTML" });
  });
}
