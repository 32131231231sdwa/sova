import { Bot, InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import { getOrCreateUser, updateUser, removeFeathers } from "../dbHelpers.js";
import { esc, getSkin } from "../format.js";
import { SKINS } from "../data.js";

export function registerShopHandlers(bot: Bot<Context>) {
  bot.command(["магазин", "magazin"], async (ctx) => {
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const lines: string[] = [
      `🏪 <b>Магазин скинов Pöllö</b>\n`,
      `У тебя: 🪶 <b>${user.feathers} фрагментов</b>\n`,
    ];

    const keyboard = new InlineKeyboard();
    let rowCount = 0;

    for (const skin of SKINS) {
      if (skin.id === "default") continue;
      const owned = user.ownedSkins.includes(skin.id);
      const isActive = user.owlSkin === skin.id;
      const levelOk = user.level >= skin.levelReq;

      let statusIcon = "";
      if (isActive) statusIcon = "✅";
      else if (owned) statusIcon = "💎";
      else if (!levelOk) statusIcon = "🔒";
      else statusIcon = "🛒";

      lines.push(
        `${statusIcon} ${skin.emoji} <b>${esc(skin.name)}</b>\n` +
          `   📊 Ур. ${skin.levelReq}+ · 🪶 ${skin.featherCost} фрагментов\n` +
          `   <i>${esc(skin.description)}</i>`,
      );

      if (!isActive) {
        const btnText = owned
          ? `${skin.emoji} Надеть`
          : !levelOk
            ? `🔒 Ур.${skin.levelReq}`
            : `${skin.emoji} Купить ${skin.featherCost}🪶`;
        keyboard.text(btnText, `shop_${owned ? "equip" : "buy"}_${skin.id}`);
        rowCount++;
        if (rowCount % 2 === 0) keyboard.row();
      }
    }

    await ctx.reply(lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  bot.callbackQuery(/^shop_buy_(.+)$/, async (ctx) => {
    const skinId = ctx.match![1]!;
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const skin = SKINS.find((s) => s.id === skinId);

    if (!skin) {
      await ctx.answerCallbackQuery("❌ Скин не найден");
      return;
    }

    if (user.ownedSkins.includes(skinId)) {
      await ctx.answerCallbackQuery("У тебя уже есть этот скин!");
      return;
    }

    if (user.level < skin.levelReq) {
      await ctx.answerCallbackQuery({
        text: `🔒 Нужен уровень ${skin.levelReq}!`,
        show_alert: true,
      });
      return;
    }

    const ok = await removeFeathers(ctx.from!.id, skin.featherCost);
    if (!ok) {
      await ctx.answerCallbackQuery({
        text: `❌ Не хватает фрагментов! Нужно ${skin.featherCost} 🪶`,
        show_alert: true,
      });
      return;
    }

    const newSkins = [...user.ownedSkins, skinId];
    await updateUser(ctx.from!.id, {
      ownedSkins: newSkins,
      owlSkin: skinId,
    });

    await ctx.answerCallbackQuery(`✅ Куплено и надето!`);
    await ctx.editMessageText(
      `${skin.emoji} <b>Скин "${esc(skin.name)}" куплен!</b>\n\n` +
        `${skin.art.trim()}\n\n` +
        `<i>${esc(skin.description)}</i>\n\n` +
        `Твоя Pöllö теперь выглядит иначе! 🎉`,
      { parse_mode: "HTML" },
    );
  });

  bot.callbackQuery(/^shop_equip_(.+)$/, async (ctx) => {
    const skinId = ctx.match![1]!;
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const skin = SKINS.find((s) => s.id === skinId);

    if (!skin) {
      await ctx.answerCallbackQuery("❌ Скин не найден");
      return;
    }

    if (!user.ownedSkins.includes(skinId)) {
      await ctx.answerCallbackQuery("У тебя нет этого скина!");
      return;
    }

    await updateUser(ctx.from!.id, { owlSkin: skinId });
    await ctx.answerCallbackQuery(`✅ Скин "${skin.name}" надет!`);
    await ctx.editMessageText(
      `${skin.emoji} <b>Скин "${esc(skin.name)}" надет!</b>\n\n` +
        `<i>${esc(skin.description)}</i>`,
      { parse_mode: "HTML" },
    );
  });
}
