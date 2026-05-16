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
  upsertQuestProgress,
} from "../dbHelpers.js";
import {
  formatProfile,
  getEffectiveHunger,
  getEffectiveThirst,
  getEffectiveFun,
  getEffectiveVigor,
  progressBar,
  esc,
  getSkin,
  getLevelXP,
  cardRarityDisplay,
  getProfileBorder,
  formatCooldownRemaining,
} from "../format.js";
import { CARDS, SKINS, OWL_RESPONSES, OWL_WISE_QUOTES, QUESTS } from "../data.js";
import { db } from "@workspace/db";
import { owlUsers } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { OwlUser } from "@workspace/db";

const FEED_COOLDOWN_MS = 30 * 60 * 1000;
const WATER_COOLDOWN_MS = 30 * 60 * 1000;
const BATH_COOLDOWN_MS = 60 * 60 * 1000;
const GAME_COOLDOWN_MS = 30 * 60 * 1000;
const SLEEP_COOLDOWN_MS = 60 * 60 * 1000;

function isFirstUse(lastActionAt: Date | string, createdAt: Date | string): boolean {
  return Math.abs(new Date(lastActionAt).getTime() - new Date(createdAt).getTime()) < 30_000;
}

async function notifyLevelUp(
  ctx: Context,
  user: OwlUser,
  newLevel: number,
  featherReward: number,
) {
  const skin = getSkin(user.owlSkin);
  const border = getProfileBorder(user.owlSkin);
  await ctx.reply(
    `🎉🎊 <b>УРОВЕНЬ ПОВЫШЕН!</b> 🎊🎉\n\n` +
    `${border}\n` +
    `${skin.emoji} <b>${esc(user.owlName)}</b>\n` +
    `📊 Уровень: <b>${newLevel}</b>\n` +
    `${border}\n\n` +
    `🪶 Награда: <b>+${featherReward} фрагментов!</b>\n\n` +
    `<i>Твоя сова становится мудрее и сильнее...</i>`,
    { parse_mode: "HTML" },
  );
}

// Roll for fragment drop
function rollFragmentDrop(chance: number, min: number, max: number): number {
  if (Math.random() < chance) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  return 0;
}

export function registerCommands(bot: Bot<Context>) {
  bot.command("start", async (ctx) => {
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const skin = getSkin(user.owlSkin);
    await ctx.reply(
      `🦉 <b>Добро пожаловать в Взрастить Pöllö!</b>\n\n` +
      `Твоя сова <b>${esc(user.owlName)}</b> (${skin.emoji} ${esc(skin.name)}) ждёт тебя!\n\n` +
      `Корми её, пои, купай, участвуй в дуэлях и развивай свою Pöllö!\n\n` +
      `📋 Напиши <code>/menu</code> чтобы открыть главное меню.`,
      { parse_mode: "HTML" },
    );
  });

  bot.command(["полло", "pollo", "profile"], async (ctx) => {
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const family = await getFamily(ctx.from!.id);
    const isGroup = ctx.chat?.type !== "private";
    const profileText = formatProfile(user, family?.familyName ?? null, isGroup);
    await ctx.reply(profileText, { parse_mode: "HTML" });
  });

  // ── Feed ───────────────────────────────────────────────────────────────────
  bot.command(["кормить", "feed"], async (ctx) => {
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const lastFed = new Date(user.lastFedAt).getTime();
    const now = Date.now();
    const remaining = FEED_COOLDOWN_MS - (now - lastFed);
    const firstTime = isFirstUse(user.lastFedAt, user.createdAt);

    if (!firstTime && remaining > 0) {
      await ctx.reply(
        `🍗 Pöllö ещё не голодна! Подожди ещё <b>${formatCooldownRemaining(remaining)}</b>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const hungerGain = Math.floor(Math.random() * 20) + 20;
    const newHunger = Math.min(100, getEffectiveHunger(user) + hungerGain);
    const xpGain = 5;
    const featherDrop = rollFragmentDrop(0.04, 1, 5);

    await updateUser(ctx.from!.id, { hunger: newHunger, lastFedAt: new Date() });
    if (featherDrop > 0) await addFeathers(ctx.from!.id, featherDrop);
    const { leveledUp, newLevel, featherReward } = await addXP(ctx.from!.id, xpGain);

    const foods = ["🍗 мышку", "🐛 жирного червяка", "🦎 ящерку", "🐟 рыбку", "🌰 желудь"];
    const food = foods[Math.floor(Math.random() * foods.length)];

    await upsertQuestProgress(ctx.from!.id, "l10_feed_10", 10, 1);

    await ctx.reply(
      `${getSkin(user.owlSkin).emoji} <b>${esc(user.owlName)}</b> съела ${food}!\n` +
      `🍗 Голод: ${progressBar(newHunger)} (+${hungerGain})\n` +
      `✨ +${xpGain} XP` +
      (featherDrop > 0 ? `\n🪶 <b>+${featherDrop} фрагментов</b> нашлось в перьях!` : ""),
      { parse_mode: "HTML" },
    );

    if (leveledUp) await notifyLevelUp(ctx, user, newLevel, featherReward);
  });

  // ── Water ──────────────────────────────────────────────────────────────────
  bot.command(["поить", "water"], async (ctx) => {
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const lastWatered = new Date(user.lastWateredAt).getTime();
    const now = Date.now();
    const remaining = WATER_COOLDOWN_MS - (now - lastWatered);
    const firstTime = isFirstUse(user.lastWateredAt, user.createdAt);

    if (!firstTime && remaining > 0) {
      await ctx.reply(
        `💧 Pöllö ещё не хочет пить! Подожди ещё <b>${formatCooldownRemaining(remaining)}</b>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const thirstGain = Math.floor(Math.random() * 20) + 20;
    const newThirst = Math.min(100, getEffectiveThirst(user) + thirstGain);
    const xpGain = 5;
    const featherDrop = rollFragmentDrop(0.04, 1, 5);

    await updateUser(ctx.from!.id, { thirst: newThirst, lastWateredAt: new Date() });
    if (featherDrop > 0) await addFeathers(ctx.from!.id, featherDrop);
    const { leveledUp, newLevel, featherReward } = await addXP(ctx.from!.id, xpGain);

    const drinks = ["🌊 из ручья", "🌧️ дождевой воды", "💦 из лужи", "🧊 ключевой воды"];
    const drink = drinks[Math.floor(Math.random() * drinks.length)];

    await ctx.reply(
      `${getSkin(user.owlSkin).emoji} <b>${esc(user.owlName)}</b> попила ${drink}!\n` +
      `💧 Жажда: ${progressBar(newThirst)} (+${thirstGain})\n` +
      `✨ +${xpGain} XP` +
      (featherDrop > 0 ? `\n🪶 <b>+${featherDrop} фрагментов</b> блеснуло в воде!` : ""),
      { parse_mode: "HTML" },
    );

    if (leveledUp) await notifyLevelUp(ctx, user, newLevel, featherReward);
  });

  // ── Bathe ──────────────────────────────────────────────────────────────────
  bot.command(["купать", "bathe"], async (ctx) => {
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const lastBathed = user.lastBathedAt ? new Date(user.lastBathedAt).getTime() : 0;
    const now = Date.now();
    const remaining = BATH_COOLDOWN_MS - (now - lastBathed);
    const firstTime = !user.lastBathedAt;

    if (!firstTime && remaining > 0) {
      await ctx.reply(
        `🛁 Pöllö только что купалась! Подожди ещё <b>${formatCooldownRemaining(remaining)}</b>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const featherDrop = rollFragmentDrop(0.4, 1, 15);
    const xpGain = 10;

    await updateUser(ctx.from!.id, { lastBathedAt: new Date(), totalBathes: user.totalBathes + 1 });
    if (featherDrop > 0) await addFeathers(ctx.from!.id, featherDrop);
    const { leveledUp, newLevel, featherReward } = await addXP(ctx.from!.id, xpGain);

    const bathQuestIds = ["l13_bathe_5", "l22_bathe_15", "l32_bathe_30"];
    for (const qid of bathQuestIds) {
      const quest = QUESTS.find((q) => q.id === qid);
      if (quest) await upsertQuestProgress(ctx.from!.id, qid, quest.target, 1);
    }

    await ctx.reply(
      featherDrop > 0
        ? `🛁 <b>${esc(user.owlName)}</b> плещется в луже и нашла кое-что!\n\n` +
          `🪶 <b>+${featherDrop} фрагментов!</b>\n` +
          `✨ +${xpGain} XP`
        : `🛁 <b>${esc(user.owlName)}</b> чисто и с удовольствием искупалась.\n\n` +
          `💦 Перья блестят, но ничего не нашла.\n` +
          `✨ +${xpGain} XP`,
      { parse_mode: "HTML" },
    );

    if (leveledUp) await notifyLevelUp(ctx, user, newLevel, featherReward);
  });

  // ── Play ───────────────────────────────────────────────────────────────────
  bot.command(["играть", "game"], async (ctx) => {
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const lastPlayed = user.lastPlayedAt ? new Date(user.lastPlayedAt).getTime() : 0;
    const now = Date.now();
    const remaining = GAME_COOLDOWN_MS - (now - lastPlayed);
    const firstTime = !user.lastPlayedAt;

    if (!firstTime && remaining > 0) {
      await ctx.reply(
        `🎮 Pöllö устала играть! Отдохнёт ещё <b>${formatCooldownRemaining(remaining)}</b>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const funGain = Math.floor(Math.random() * 20) + 20;
    const newFun = Math.min(100, getEffectiveFun(user) + funGain);
    const xpGain = 5;
    const featherDrop = rollFragmentDrop(0.08, 1, 6);

    await updateUser(ctx.from!.id, { fun: newFun, lastPlayedAt: new Date() });
    if (featherDrop > 0) await addFeathers(ctx.from!.id, featherDrop);
    const { leveledUp, newLevel, featherReward } = await addXP(ctx.from!.id, xpGain);

    const games = [
      "🍃 гонялась за листиком", "🌰 катала желудь по полу",
      "🧶 запуталась в клубке", "🦋 охотилась за бабочкой",
      "🪁 прыгала за веточкой", "🌿 шуршала в траве",
    ];
    const game = games[Math.floor(Math.random() * games.length)];

    await ctx.reply(
      `🎮 <b>${esc(user.owlName)}</b> ${game}!\n` +
      `🎮 Веселье: ${progressBar(newFun)} (+${funGain})\n` +
      `✨ +${xpGain} XP` +
      (featherDrop > 0 ? `\n🪶 <b>+${featherDrop} фрагментов</b> нашла во время игры!` : ""),
      { parse_mode: "HTML" },
    );

    if (leveledUp) await notifyLevelUp(ctx, user, newLevel, featherReward);
  });

  // ── Sleep ──────────────────────────────────────────────────────────────────
  bot.command(["спать", "sleep"], async (ctx) => {
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const lastSlept = user.lastSleptAt ? new Date(user.lastSleptAt).getTime() : 0;
    const now = Date.now();
    const remaining = SLEEP_COOLDOWN_MS - (now - lastSlept);
    const firstTime = !user.lastSleptAt;

    if (!firstTime && remaining > 0) {
      await ctx.reply(
        `😴 Pöllö ещё не хочет спать! Подожди ещё <b>${formatCooldownRemaining(remaining)}</b>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const vigorGain = Math.floor(Math.random() * 21) + 40;
    const newVigor = Math.min(100, getEffectiveVigor(user) + vigorGain);
    const xpGain = 5;

    await updateUser(ctx.from!.id, { vigor: newVigor, lastSleptAt: new Date() });
    const { leveledUp, newLevel, featherReward } = await addXP(ctx.from!.id, xpGain);

    const sleepTexts = [
      "задремала на ветке и видела лесные сны...",
      "свернулась в комочек и поспала вволю!",
      "закрыла глаза и унеслась в страну совиных снов...",
      "тихонько засопела, укрывшись крыльями.",
      "уснула прямо в дупле — уютно и тепло.",
    ];
    const sleepText = sleepTexts[Math.floor(Math.random() * sleepTexts.length)];

    await ctx.reply(
      `🌙 <b>${esc(user.owlName)}</b> ${sleepText}\n` +
      `😴 Бодрость: ${progressBar(newVigor)} (+${vigorGain})\n` +
      `✨ +${xpGain} XP`,
      { parse_mode: "HTML" },
    );

    if (leveledUp) await notifyLevelUp(ctx, user, newLevel, featherReward);
  });

  // ── Cards ──────────────────────────────────────────────────────────────────
  bot.command(["карточки", "cards"], async (ctx) => {
    const cards = await getUserCards(ctx.from!.id);
    if (cards.length === 0) {
      await ctx.reply(
        `🃏 У тебя пока нет карточек!\n\nОни выпадают случайно при общении с ботом — шанс 1.2%`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const counts: Record<number, number> = {};
    for (const c of cards) { counts[c.cardId] = (counts[c.cardId] ?? 0) + 1; }

    const lines: string[] = [`🃏 <b>Коллекция карточек</b> (${cards.length} шт.)\n`];
    for (const [cardIdStr, count] of Object.entries(counts)) {
      const card = CARDS.find((c) => c.id === parseInt(cardIdStr));
      if (!card) continue;
      lines.push(`${card.emoji} <b>${esc(card.name)}</b> ${count > 1 ? `×${count}` : ""}\n   ${cardRarityDisplay(card.rarity)}`);
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  // ── Rename ─────────────────────────────────────────────────────────────────
  bot.command(["переименовать", "rename"], async (ctx) => {
    const args = ctx.message?.text?.split(" ").slice(1).join(" ").trim();
    if (!args) {
      await ctx.reply(`✏️ Напиши новое имя совы:\n<code>/rename НовоеИмя</code>`, { parse_mode: "HTML" });
      return;
    }
    if (args.length > 20) { await ctx.reply(`❌ Имя слишком длинное (макс 20 символов)`); return; }
    await updateUser(ctx.from!.id, { owlName: args });
    await ctx.reply(`✅ Теперь твою сову зовут <b>${esc(args)}</b>!`, { parse_mode: "HTML" });
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  bot.command(["стат", "stats"], async (ctx) => {
    const mention = ctx.message?.reply_to_message?.from;
    if (!mention) {
      await ctx.reply(`👁 Ответь на сообщение игрока командой <code>/stats</code>`, { parse_mode: "HTML" });
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
    const displayName = mention.username ? `@${mention.username}` : mention.first_name;

    await ctx.reply(
      `${skin.emoji} <b>${esc(targetUser.owlName)}</b> (${esc(displayName)})\n` +
      `<i>${esc(skin.name)}</i>\n\n` +
      `📊 Уровень: <b>${targetUser.level}</b>\n` +
      (targetUser.level < 50 ? `✨ XP: <b>${targetUser.xp - xpForLevel}/${xpForNext - xpForLevel}</b>\n` : `✨ Максимальный уровень!\n`) +
      `🍗 Голод: <b>${Math.round(hunger)}%</b>\n` +
      `💧 Жажда: <b>${Math.round(thirst)}%</b>\n` +
      `🪶 Фрагменты: <b>${targetUser.feathers}</b>\n` +
      `🃏 Карточек: <b>${uniqueCards}</b> уникальных\n` +
      `⚔️ Дуэли: <b>${targetUser.totalDuelsWon}W / ${targetUser.totalDuelsLost}L</b>\n` +
      (family ? `👨‍👩‍👧 Семья: <b>${esc(family.familyName)}</b>\n` : ""),
      { parse_mode: "HTML" },
    );
  });

  // ── Top ────────────────────────────────────────────────────────────────────
  bot.command(["топ", "top"], async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text("✨ По XP", "top_xp")
      .text("🪶 По фрагментам", "top_feathers")
      .row()
      .text("📊 По уровню", "top_level");
    await ctx.reply(`🏆 <b>Топ игроков</b>\n\nВыбери категорию:`, { parse_mode: "HTML", reply_markup: keyboard });
  });

  // ── Help ───────────────────────────────────────────────────────────────────
  bot.command(["помощь", "help"], async (ctx) => {
    await ctx.reply(
      `🦉 <b>Взрастить Pöllö — Справка</b>\n\n` +
      `<b>Меню:</b>\n/menu — открыть главное меню с кнопками\n\n` +
      `<b>Профиль и уход:</b>\n` +
      `/profile — профиль совы\n` +
      `/feed — покормить (кд 30 мин)\n` +
      `/water — напоить (кд 30 мин)\n` +
      `/bathe — искупать (кд 1 ч) · шанс 40% найти 🪶\n` +
      `/game — поиграть (кд 30 мин) · +веселье\n` +
      `/sleep — поспать (кд 1 ч) · +бодрость\n` +
      `/rename — переименовать сову\n\n` +
      `<b>Фрагменты 🪶 выпадают:</b>\n` +
      `• После кормёжки/питья: 4% шанс (1-5)\n` +
      `• При купании: 40% шанс (1-15)\n` +
      `• При игре: 8% шанс (1-6)\n` +
      `• При повышении уровня: большой бонус!\n\n` +
      `<b>Дуэли:</b>\n/duel @username — вызвать на дуэль\n\n` +
      `<b>Магазин и гардероб:</b>\n/shop — купить скин\n/wardrobe — сменить скин\n\n` +
      `<b>Семья:</b>\n/family · /raid · /divorce\n\n` +
      `<b>Прочее:</b>\n/cards · /top · /stats · /quests`,
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
