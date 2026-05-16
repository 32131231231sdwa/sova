import { Bot, InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import {
  getOrCreateUser,
  updateUser,
  addXP,
  addFeathers,
  getFamily,
  getUserCards,
  getTopByXP,
  getTopByFeathers,
  getTopByLevel,
  getAllUserQuests,
  getRecentActiveUsers,
  upsertQuestProgress,
} from "../dbHelpers.js";
import {
  getEffectiveHunger,
  getEffectiveThirst,
  getEffectiveFun,
  getEffectiveVigor,
  miniBar,
  esc,
  getSkin,
  getLevelXP,
  getProfileBorder,
  formatCooldownRemaining,
  cardRarityDisplay,
} from "../format.js";
import { SKINS, CARDS, QUESTS } from "../data.js";
import type { OwlUser } from "@workspace/db";
import { startDuelFlow } from "./duel.js";

// ── Cooldown constants ────────────────────────────────────────────────────────
const FEED_CD = 30 * 60 * 1000;
const WATER_CD = 30 * 60 * 1000;
const BATH_CD = 60 * 60 * 1000;
const GAME_CD = 30 * 60 * 1000;
const SLEEP_CD = 60 * 60 * 1000;

// ── Menu message tracker ──────────────────────────────────────────────────────
// userId → { chatId, messageId } of the current menu message
const menuMessages = new Map<number, { chatId: number; messageId: number }>();

function isFirstUse(lastAt: Date | string, createdAt: Date | string): boolean {
  return Math.abs(new Date(lastAt).getTime() - new Date(createdAt).getTime()) < 30_000;
}

function rollDrop(chance: number, min: number, max: number): number {
  return Math.random() < chance ? Math.floor(Math.random() * (max - min + 1)) + min : 0;
}

// ── Screen renderers ──────────────────────────────────────────────────────────

function renderMain(user: OwlUser): { text: string; keyboard: InlineKeyboard } {
  const skin = getSkin(user.owlSkin);
  const border = getProfileBorder(user.owlSkin);
  const hunger = getEffectiveHunger(user);
  const thirst = getEffectiveThirst(user);

  const text = [
    border,
    `${skin.emoji} <b>${esc(user.owlName)}</b>  Ур. <b>${user.level}</b>  🪶 <b>${user.feathers}</b>`,
    `🍗 ${Math.round(hunger)}%  💧 ${Math.round(thirst)}%`,
    border,
    `<i>Выбери раздел:</i>`,
  ].join("\n");

  const keyboard = new InlineKeyboard()
    .text("👤 Профиль", "menu_profile")
    .text("⚔️ Дуэль", "menu_duel").row()
    .text("🏪 Магазин", "menu_shop")
    .text("👗 Гардероб", "menu_wardrobe").row()
    .text("🃏 Карточки", "menu_cards")
    .text("📜 Квесты", "menu_quests").row()
    .text("🏆 Рейтинг", "menu_top_xp");

  return { text, keyboard };
}

function renderProfile(user: OwlUser, familyName: string | null): { text: string; keyboard: InlineKeyboard } {
  const skin = getSkin(user.owlSkin);
  const border = getProfileBorder(user.owlSkin);
  const hunger = getEffectiveHunger(user);
  const thirst = getEffectiveThirst(user);
  const fun = getEffectiveFun(user);
  const vigor = getEffectiveVigor(user);
  const xpForNext = user.level < 50 ? getLevelXP(user.level + 1) - getLevelXP(user.level) : 0;
  const xpProgress = user.level < 50 ? user.xp - getLevelXP(user.level) : 0;

  const text = [
    border,
    `${skin.emoji} <b>${esc(user.owlName)}</b>  <i>${esc(skin.name)}</i>`,
    `📊 Ур. <b>${user.level}</b>  ✨ ${user.level < 50 ? `<b>${xpProgress}/${xpForNext}</b> XP` : "<b>МАКС</b>"}`,
    border,
    `🍗 Голод:     ${miniBar(hunger)} <b>${Math.round(hunger)}%</b>`,
    `💧 Жажда:    ${miniBar(thirst)} <b>${Math.round(thirst)}%</b>`,
    `🎮 Веселье:  ${miniBar(fun)} <b>${Math.round(fun)}%</b>`,
    `😴 Бодрость: ${miniBar(vigor)} <b>${Math.round(vigor)}%</b>`,
    border,
    `🪶 <b>${user.feathers}</b> фрагментов` + (familyName ? `  👨‍👩‍👧 <i>${esc(familyName)}</i>` : ""),
  ].join("\n");

  const keyboard = new InlineKeyboard()
    .text("🍗", "menu_act_feed")
    .text("💧", "menu_act_water")
    .text("🛁", "menu_act_bathe")
    .text("🎮", "menu_act_play")
    .text("😴", "menu_act_sleep")
    .row()
    .text("⬅️ Меню", "menu_main");

  return { text, keyboard };
}

async function renderShop(userId: number): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const user = await getOrCreateUser(userId);
  const lines: string[] = [`🏪 <b>Магазин скинов</b>\n🪶 У тебя: <b>${user.feathers} фрагментов</b>\n`];
  const keyboard = new InlineKeyboard();
  let row = 0;

  for (const skin of SKINS) {
    if (skin.id === "default") continue;
    const owned = user.ownedSkins.includes(skin.id);
    const isActive = user.owlSkin === skin.id;
    const levelOk = user.level >= skin.levelReq;
    const canAfford = user.feathers >= skin.featherCost;

    let status = "";
    if (isActive) status = "✅ ";
    else if (owned) status = "💎 ";
    else if (!levelOk) status = "🔒 ";
    else status = "";

    lines.push(`${status}${skin.emoji} <b>${esc(skin.name)}</b> — Ур.${skin.levelReq} · 🪶${skin.featherCost}\n<i>${esc(skin.description)}</i>`);

    if (!isActive) {
      if (owned) {
        keyboard.text(`${skin.emoji} Надеть`, `menu_shop_equip_${skin.id}`);
      } else if (!levelOk) {
        keyboard.text(`🔒 Ур.${skin.levelReq}`, "noop_shop");
      } else {
        keyboard.text(`${skin.emoji} ${skin.featherCost}🪶`, `menu_shop_buy_${skin.id}`);
      }
      row++;
      if (row % 2 === 0) keyboard.row();
    }
  }

  keyboard.row().text("⬅️ Меню", "menu_main");
  return { text: lines.join("\n"), keyboard };
}

async function renderWardrobe(userId: number): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const user = await getOrCreateUser(userId);
  const activeSkin = getSkin(user.owlSkin);

  const lines: string[] = [
    `👗 <b>Гардероб</b>\n`,
    `Активный: ${activeSkin.emoji} <b>${esc(activeSkin.name)}</b>\n`,
    `<b>Твои скины:</b>`,
  ];

  const keyboard = new InlineKeyboard();
  let count = 0;

  for (const skinId of user.ownedSkins) {
    const skin = getSkin(skinId);
    const isActive = skinId === user.owlSkin;
    lines.push(`${isActive ? "✅" : "  "} ${skin.emoji} ${esc(skin.name)}`);
    if (!isActive) {
      keyboard.text(`${skin.emoji} Надеть`, `wardrobe_equip_${skinId}`);
      count++;
      if (count % 2 === 0) keyboard.row();
    }
  }

  if (user.owlSkin !== "default") {
    keyboard.row().text("🦉 Снять скин (обычный)", "wardrobe_equip_default");
  }

  keyboard.row().text("⬅️ Меню", "menu_main");
  return { text: lines.join("\n"), keyboard };
}

async function renderCards(userId: number): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const cards = await getUserCards(userId);
  const keyboard = new InlineKeyboard().text("⬅️ Меню", "menu_main");

  if (cards.length === 0) {
    return {
      text: `🃏 <b>Коллекция карточек</b>\n\nУ тебя пока нет карточек!\nОни выпадают случайно при общении с ботом.`,
      keyboard,
    };
  }

  const counts: Record<number, number> = {};
  for (const c of cards) counts[c.cardId] = (counts[c.cardId] ?? 0) + 1;

  const lines: string[] = [`🃏 <b>Коллекция</b> (${cards.length} шт.)\n`];
  for (const [idStr, count] of Object.entries(counts)) {
    const card = CARDS.find((c) => c.id === parseInt(idStr));
    if (!card) continue;
    lines.push(`${card.emoji} <b>${esc(card.name)}</b>${count > 1 ? ` ×${count}` : ""} — ${cardRarityDisplay(card.rarity)}`);
  }

  // Truncate if too long
  const text = lines.join("\n").slice(0, 3500);
  return { text, keyboard };
}

async function renderTop(cat: "xp" | "feathers" | "level"): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const users =
    cat === "xp" ? await getTopByXP(8) :
    cat === "feathers" ? await getTopByFeathers(8) :
    await getTopByLevel(8);

  const title = cat === "xp" ? "🏆 Топ по XP" : cat === "feathers" ? "🏆 Топ по фрагментам 🪶" : "🏆 Топ по уровню";
  const lines = [title + "\n"];
  users.forEach((u, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    const name = u.username ? `@${u.username}` : u.owlName;
    const stat = cat === "xp" ? `✨ ${u.xp}` : cat === "feathers" ? `🪶 ${u.feathers}` : `📊 Ур.${u.level}`;
    lines.push(`${medal} <b>${esc(u.owlName)}</b> (${esc(name)}) — ${stat}`);
  });

  const keyboard = new InlineKeyboard()
    .text(cat === "xp" ? "✨ XP ✓" : "✨ XP", "menu_top_xp")
    .text(cat === "feathers" ? "🪶 Фрагм. ✓" : "🪶 Фрагм.", "menu_top_feathers")
    .row()
    .text(cat === "level" ? "📊 Уровень ✓" : "📊 Уровень", "menu_top_level")
    .row()
    .text("⬅️ Меню", "menu_main");

  return { text: lines.join("\n"), keyboard };
}

async function renderQuests(userId: number): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const user = await getOrCreateUser(userId);
  const userQuests = await getAllUserQuests(userId);
  const progressMap = new Map(userQuests.map((q) => [q.questId, q]));

  const thisLevelQuests = QUESTS.filter((q) => q.forLevel <= user.level + 2);
  const upcoming = thisLevelQuests.slice(-6); // Show up to 6 most relevant quests

  const lines: string[] = [`📜 <b>Квесты</b> (Ур. ${user.level})\n`];
  for (const q of upcoming) {
    const progress = progressMap.get(q.id);
    const done = progress?.completed ?? false;
    const curr = progress?.progress ?? 0;
    const icon = done ? "✅" : curr > 0 ? "🔄" : "⬜";
    const forLvl = q.forLevel > user.level ? ` <i>(для Ур.${q.forLevel})</i>` : "";
    lines.push(`${icon} ${esc(q.description)}${forLvl}\n   ${curr}/${q.target}`);
  }

  if (lines.length === 1) lines.push("<i>Нет активных квестов</i>");

  const keyboard = new InlineKeyboard().text("⬅️ Меню", "menu_main");
  return { text: lines.join("\n"), keyboard };
}

async function renderDuel(userId: number): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const recent = await getRecentActiveUsers(8);
  const others = recent.filter((u) => u.telegramId !== userId).slice(0, 6);

  const lines = [
    `⚔️ <b>Дуэли</b>\n`,
    `Напиши <code>/duel @username</code> для вызова.\n`,
    `<b>Недавние игроки:</b>`,
  ];

  const keyboard = new InlineKeyboard();
  let count = 0;
  for (const u of others) {
    const displayName = u.username ? `@${u.username}` : esc(u.owlName);
    lines.push(`${getSkin(u.owlSkin).emoji} ${displayName} (Ур.${u.level})`);
    keyboard.text(`⚔️ ${getSkin(u.owlSkin).emoji} ${u.username ?? u.owlName}`, `menu_duel_challenge_${u.telegramId}`);
    count++;
    if (count % 2 === 0) keyboard.row();
  }

  if (others.length === 0) lines.push("<i>Пока никого нет...</i>");

  keyboard.row().text("⬅️ Меню", "menu_main");
  return { text: lines.join("\n"), keyboard };
}

// ── Show/update menu ──────────────────────────────────────────────────────────

async function editMenu(
  ctx: Context,
  render: { text: string; keyboard: InlineKeyboard },
) {
  try {
    await ctx.editMessageText(render.text, { parse_mode: "HTML", reply_markup: render.keyboard });
  } catch {}
}

async function sendMenu(ctx: Context, render: { text: string; keyboard: InlineKeyboard }, userId: number) {
  const msg = await ctx.reply(render.text, { parse_mode: "HTML", reply_markup: render.keyboard });
  menuMessages.set(userId, { chatId: msg.chat.id, messageId: msg.message_id });
}

// ── Level-up notification (sends new message) ─────────────────────────────────

async function notifyLevelUp(ctx: Context, user: OwlUser, newLevel: number, featherReward: number) {
  const skin = getSkin(user.owlSkin);
  const border = getProfileBorder(user.owlSkin);
  await ctx.reply(
    `🎉🎊 <b>УРОВЕНЬ ПОВЫШЕН!</b> 🎊🎉\n\n` +
    `${border}\n${skin.emoji} <b>${esc(user.owlName)}</b>\n📊 Уровень: <b>${newLevel}</b>\n${border}\n\n` +
    `🪶 Награда: <b>+${featherReward} фрагментов!</b>`,
    { parse_mode: "HTML" },
  );
}

// ── Handler registration ──────────────────────────────────────────────────────

export function registerMenuHandlers(bot: Bot<Context>) {

  // /menu command
  bot.command(["menu", "меню", "m"], async (ctx) => {
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const render = renderMain(user);
    await sendMenu(ctx, render, ctx.from!.id);
  });

  // /wardrobe command
  bot.command(["wardrobe", "гардероб"], async (ctx) => {
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const render = await renderWardrobe(ctx.from!.id);
    const msg = await ctx.reply(render.text, { parse_mode: "HTML", reply_markup: render.keyboard });
    menuMessages.set(ctx.from!.id, { chatId: msg.chat.id, messageId: msg.message_id });
  });

  // ── Navigation callbacks ────────────────────────────────────────────────────

  bot.callbackQuery("menu_main", async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
    await editMenu(ctx, renderMain(user));
  });

  bot.callbackQuery("menu_profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
    const family = await getFamily(ctx.from.id);
    await editMenu(ctx, renderProfile(user, family?.familyName ?? null));
  });

  bot.callbackQuery("menu_shop", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenu(ctx, await renderShop(ctx.from.id));
  });

  bot.callbackQuery("menu_wardrobe", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenu(ctx, await renderWardrobe(ctx.from.id));
  });

  bot.callbackQuery("menu_cards", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenu(ctx, await renderCards(ctx.from.id));
  });

  bot.callbackQuery("menu_top_xp", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenu(ctx, await renderTop("xp"));
  });

  bot.callbackQuery("menu_top_feathers", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenu(ctx, await renderTop("feathers"));
  });

  bot.callbackQuery("menu_top_level", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenu(ctx, await renderTop("level"));
  });

  bot.callbackQuery("menu_quests", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenu(ctx, await renderQuests(ctx.from.id));
  });

  bot.callbackQuery("menu_duel", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenu(ctx, await renderDuel(ctx.from.id));
  });

  bot.callbackQuery("noop_shop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // ── Shop actions ────────────────────────────────────────────────────────────

  bot.callbackQuery(/^menu_shop_buy_(.+)$/, async (ctx) => {
    const skinId = ctx.match![1]!;
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
    const skin = SKINS.find((s) => s.id === skinId);
    if (!skin) { await ctx.answerCallbackQuery("Скин не найден"); return; }
    if (user.ownedSkins.includes(skinId)) { await ctx.answerCallbackQuery("Уже куплен!"); return; }
    if (user.level < skin.levelReq) {
      await ctx.answerCallbackQuery({ text: `🔒 Нужен уровень ${skin.levelReq}!`, show_alert: true }); return;
    }
    if (user.feathers < skin.featherCost) {
      await ctx.answerCallbackQuery({ text: `❌ Не хватает фрагментов! Нужно ${skin.featherCost} 🪶`, show_alert: true }); return;
    }

    const newSkins = [...user.ownedSkins, skinId];
    await Promise.all([
      import("../dbHelpers.js").then(({ removeFeathers }) => removeFeathers(ctx.from.id, skin.featherCost)),
      import("../dbHelpers.js").then(({ updateUser }) => updateUser(ctx.from.id, { ownedSkins: newSkins, owlSkin: skinId })),
    ]);

    await ctx.answerCallbackQuery(`✅ ${skin.emoji} Куплено и надето!`);
    await editMenu(ctx, await renderShop(ctx.from.id));
  });

  bot.callbackQuery(/^menu_shop_equip_(.+)$/, async (ctx) => {
    const skinId = ctx.match![1]!;
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
    if (!user.ownedSkins.includes(skinId)) { await ctx.answerCallbackQuery("Нет такого скина!"); return; }
    const skin = SKINS.find((s) => s.id === skinId);
    await import("../dbHelpers.js").then(({ updateUser }) => updateUser(ctx.from.id, { owlSkin: skinId }));
    await ctx.answerCallbackQuery(`✅ ${skin?.emoji ?? ""} Скин надет!`);
    await editMenu(ctx, await renderShop(ctx.from.id));
  });

  // ── Wardrobe actions ────────────────────────────────────────────────────────

  bot.callbackQuery(/^wardrobe_equip_(.+)$/, async (ctx) => {
    const skinId = ctx.match![1]!;
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
    if (!user.ownedSkins.includes(skinId)) { await ctx.answerCallbackQuery("Нет такого скина!"); return; }
    const skin = SKINS.find((s) => s.id === skinId);
    await import("../dbHelpers.js").then(({ updateUser }) => updateUser(ctx.from.id, { owlSkin: skinId }));
    await ctx.answerCallbackQuery(`✅ ${skin?.emoji ?? "🦉"} Надет!`);
    await editMenu(ctx, await renderWardrobe(ctx.from.id));
  });

  // ── Duel from menu — challenge a player ─────────────────────────────────────

  bot.callbackQuery(/^menu_duel_challenge_(\d+)$/, async (ctx) => {
    const targetId = parseInt(ctx.match![1]!);
    if (targetId === ctx.from.id) { await ctx.answerCallbackQuery("Нельзя вызвать себя!"); return; }
    await ctx.answerCallbackQuery();
    const target = await getOrCreateUser(targetId);
    await startDuelFlow(
      ctx,
      ctx.from.id,
      ctx.from.username,
      targetId,
      target.username ?? undefined,
      target.username ? `@${target.username}` : target.owlName,
    );
  });

  // ── Profile action callbacks ────────────────────────────────────────────────

  async function refreshProfile(ctx: Context) {
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const family = await getFamily(ctx.from!.id);
    await editMenu(ctx, renderProfile(user, family?.familyName ?? null));
  }

  // 🍗 Feed
  bot.callbackQuery("menu_act_feed", async (ctx) => {
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
    const remaining = FEED_CD - (Date.now() - new Date(user.lastFedAt).getTime());
    const firstTime = isFirstUse(user.lastFedAt, user.createdAt);

    if (!firstTime && remaining > 0) {
      await ctx.answerCallbackQuery({ text: `🍗 Ещё не голодна! Подожди ${formatCooldownRemaining(remaining)}`, show_alert: false });
      return;
    }

    const gain = Math.floor(Math.random() * 20) + 20;
    const newHunger = Math.min(100, getEffectiveHunger(user) + gain);
    const drop = rollDrop(0.04, 1, 5);
    const foods = ["🍗 мышку", "🐛 червяка", "🦎 ящерку", "🐟 рыбку", "🌰 желудь"];
    const food = foods[Math.floor(Math.random() * foods.length)];

    await updateUser(ctx.from.id, { hunger: newHunger, lastFedAt: new Date() });
    if (drop > 0) await addFeathers(ctx.from.id, drop);
    const { leveledUp, newLevel, featherReward } = await addXP(ctx.from.id, 5);
    await upsertQuestProgress(ctx.from.id, "l10_feed_10", 10, 1);

    let toast = `${getSkin(user.owlSkin).emoji} Съела ${food}! 🍗${Math.round(newHunger)}% ✨+5`;
    if (drop > 0) toast += ` 🪶+${drop}`;
    await ctx.answerCallbackQuery({ text: toast });
    await refreshProfile(ctx);
    if (leveledUp) await notifyLevelUp(ctx, user, newLevel, featherReward);
  });

  // 💧 Water
  bot.callbackQuery("menu_act_water", async (ctx) => {
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
    const remaining = WATER_CD - (Date.now() - new Date(user.lastWateredAt).getTime());
    const firstTime = isFirstUse(user.lastWateredAt, user.createdAt);

    if (!firstTime && remaining > 0) {
      await ctx.answerCallbackQuery({ text: `💧 Ещё не хочет пить! Подожди ${formatCooldownRemaining(remaining)}`, show_alert: false });
      return;
    }

    const gain = Math.floor(Math.random() * 20) + 20;
    const newThirst = Math.min(100, getEffectiveThirst(user) + gain);
    const drop = rollDrop(0.04, 1, 5);
    const drinks = ["🌊 из ручья", "💦 из лужи", "🧊 ключевой воды"];
    const drink = drinks[Math.floor(Math.random() * drinks.length)];

    await updateUser(ctx.from.id, { thirst: newThirst, lastWateredAt: new Date() });
    if (drop > 0) await addFeathers(ctx.from.id, drop);
    const { leveledUp, newLevel, featherReward } = await addXP(ctx.from.id, 5);

    let toast = `Попила ${drink}! 💧${Math.round(newThirst)}% ✨+5`;
    if (drop > 0) toast += ` 🪶+${drop}`;
    await ctx.answerCallbackQuery({ text: toast });
    await refreshProfile(ctx);
    if (leveledUp) await notifyLevelUp(ctx, user, newLevel, featherReward);
  });

  // 🛁 Bathe
  bot.callbackQuery("menu_act_bathe", async (ctx) => {
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
    const lastBathed = user.lastBathedAt ? new Date(user.lastBathedAt).getTime() : 0;
    const remaining = BATH_CD - (Date.now() - lastBathed);
    const firstTime = !user.lastBathedAt;

    if (!firstTime && remaining > 0) {
      await ctx.answerCallbackQuery({ text: `🛁 Только что купалась! Подожди ${formatCooldownRemaining(remaining)}`, show_alert: false });
      return;
    }

    const drop = rollDrop(0.4, 1, 15);
    await updateUser(ctx.from.id, { lastBathedAt: new Date(), totalBathes: user.totalBathes + 1 });
    if (drop > 0) await addFeathers(ctx.from.id, drop);
    const { leveledUp, newLevel, featherReward } = await addXP(ctx.from.id, 10);

    for (const qid of ["l13_bathe_5", "l22_bathe_15", "l32_bathe_30"]) {
      const q = QUESTS.find((x) => x.id === qid);
      if (q) await upsertQuestProgress(ctx.from.id, qid, q.target, 1);
    }

    let toast = drop > 0 ? `🛁 Плескалась и нашла 🪶+${drop}! ✨+10` : `🛁 Искупалась! Блестящие перья ✨+10`;
    await ctx.answerCallbackQuery({ text: toast });
    await refreshProfile(ctx);
    if (leveledUp) await notifyLevelUp(ctx, user, newLevel, featherReward);
  });

  // 🎮 Play
  bot.callbackQuery("menu_act_play", async (ctx) => {
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
    const lastPlayed = user.lastPlayedAt ? new Date(user.lastPlayedAt).getTime() : 0;
    const remaining = GAME_CD - (Date.now() - lastPlayed);
    const firstTime = !user.lastPlayedAt;

    if (!firstTime && remaining > 0) {
      await ctx.answerCallbackQuery({ text: `🎮 Устала играть! Подожди ${formatCooldownRemaining(remaining)}`, show_alert: false });
      return;
    }

    const gain = Math.floor(Math.random() * 20) + 20;
    const newFun = Math.min(100, getEffectiveFun(user) + gain);
    const drop = rollDrop(0.08, 1, 6);
    const games = ["🍃 гонялась за листиком", "🌰 катала желудь", "🦋 охотилась за бабочкой", "🌿 шуршала в траве"];
    const game = games[Math.floor(Math.random() * games.length)];

    await updateUser(ctx.from.id, { fun: newFun, lastPlayedAt: new Date() });
    if (drop > 0) await addFeathers(ctx.from.id, drop);
    const { leveledUp, newLevel, featherReward } = await addXP(ctx.from.id, 5);

    let toast = `${game}! 🎮${Math.round(newFun)}% ✨+5`;
    if (drop > 0) toast += ` 🪶+${drop}`;
    await ctx.answerCallbackQuery({ text: toast });
    await refreshProfile(ctx);
    if (leveledUp) await notifyLevelUp(ctx, user, newLevel, featherReward);
  });

  // 😴 Sleep
  bot.callbackQuery("menu_act_sleep", async (ctx) => {
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
    const lastSlept = user.lastSleptAt ? new Date(user.lastSleptAt).getTime() : 0;
    const remaining = SLEEP_CD - (Date.now() - lastSlept);
    const firstTime = !user.lastSleptAt;

    if (!firstTime && remaining > 0) {
      await ctx.answerCallbackQuery({ text: `😴 Ещё не хочет спать! Подожди ${formatCooldownRemaining(remaining)}`, show_alert: false });
      return;
    }

    const gain = Math.floor(Math.random() * 21) + 40;
    const newVigor = Math.min(100, getEffectiveVigor(user) + gain);

    await updateUser(ctx.from.id, { vigor: newVigor, lastSleptAt: new Date() });
    const { leveledUp, newLevel, featherReward } = await addXP(ctx.from.id, 5);

    const sleepTexts = ["задремала на ветке 🌙", "поспала в дупле 😴", "видела совиные сны 🌙"];
    const text = sleepTexts[Math.floor(Math.random() * sleepTexts.length)];

    await ctx.answerCallbackQuery({ text: `${getSkin(user.owlSkin).emoji} ${text}! 😴${Math.round(newVigor)}% ✨+5` });
    await refreshProfile(ctx);
    if (leveledUp) await notifyLevelUp(ctx, user, newLevel, featherReward);
  });
}
