import { Bot, InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import { db } from "@workspace/db";
import {
  owlFamilies,
  owlFamilyInvites,
  type OwlFamily,
} from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import {
  getOrCreateUser,
  getFamily,
  createFamily,
  deleteFamily,
  getFamilyUsers,
  createFamilyInvite,
  deleteInvite,
  addFeathers,
  addXP,
  upsertQuestProgress,
} from "../dbHelpers.js";
import { esc, getSkin, formatDuration } from "../format.js";
import { QUESTS } from "../data.js";

const HEIST_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const HEIST_SUCCESS_CHANCE = 0.3;

export function registerFamilyHandlers(bot: Bot<Context>) {
  bot.command(["семья", "semya", "family"], async (ctx) => {
    const mention = ctx.message?.reply_to_message?.from;
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const existingFamily = await getFamily(ctx.from!.id);

    // No target — show own family
    if (!mention) {
      if (!existingFamily) {
        await ctx.reply(
          `🦉 У тебя ещё нет семьи!\n\nОтветь на сообщение игрока командой <code>/семья</code> чтобы предложить союз сов.`,
          { parse_mode: "HTML" },
        );
        return;
      }

      const [u1, u2] = await getFamilyUsers(existingFamily);
      const skin1 = getSkin(u1.owlSkin);
      const skin2 = getSkin(u2.owlSkin);

      await ctx.reply(
        `👨‍👩‍👧 <b>${esc(existingFamily.familyName)}</b>\n\n` +
          `${skin1.emoji} <b>${esc(u1.owlName)}</b>\n` +
          `${skin2.emoji} <b>${esc(u2.owlName)}</b>\n\n` +
          `Союз создан: ${new Date(existingFamily.createdAt).toLocaleDateString("ru")}\n\n` +
          `Команды:\n` +
          `/вылазка — совместная охота (кд 3ч)\n` +
          `/семяимя НовоеИмя — переименовать семью\n` +
          `/расстаться — разорвать союз`,
        { parse_mode: "HTML" },
      );
      return;
    }

    if (existingFamily) {
      await ctx.reply(`❌ Ты уже в семье! Сначала разорви союз командой /расстаться`);
      return;
    }

    const targetTgId = mention.id;
    if (targetTgId === ctx.from!.id) {
      await ctx.reply(`🦉 Нельзя создать семью с самим собой!`);
      return;
    }

    const targetUser = await getOrCreateUser(targetTgId, mention.username);
    const targetFamily = await getFamily(targetTgId);
    if (targetFamily) {
      await ctx.reply(
        `❌ <b>${esc(targetUser.owlName)}</b> уже в семье!`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const invite = await createFamilyInvite(ctx.from!.id, targetTgId, ctx.chat!.id);

    const keyboard = new InlineKeyboard()
      .text("💍 Принять", `family_accept_${invite.id}`)
      .text("❌ Отклонить", `family_decline_${invite.id}`);

    const skin = getSkin(user.owlSkin);
    const targetSkin = getSkin(targetUser.owlSkin);
    const targetName = mention.username ? `@${mention.username}` : mention.first_name;

    await ctx.reply(
      `💌 <b>${esc(user.owlName)}</b> ${skin.emoji} предлагает союз совам!\n\n` +
        `${targetSkin.emoji} <b>${esc(targetUser.owlName)}</b>, ты согласна объединить гнёзда?\n\n` +
        `<i>(Предложение действует 5 минут)</i>`,
      {
        parse_mode: "HTML",
        reply_markup: keyboard,
      },
    );
  });

  bot.callbackQuery(/^family_accept_(\d+)$/, async (ctx) => {
    const inviteId = parseInt(ctx.match![1]!);

    const inviteRows = await db
      .select()
      .from(owlFamilyInvites)
      .where(eq(owlFamilyInvites.id, inviteId))
      .limit(1);
    const invite = inviteRows[0];

    if (!invite) {
      await ctx.answerCallbackQuery("❌ Приглашение устарело!");
      await ctx.editMessageText(`❌ Приглашение устарело!`);
      return;
    }

    if (ctx.from!.id !== invite.toId) {
      await ctx.answerCallbackQuery("Это не тебе!");
      return;
    }

    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      await deleteInvite(inviteId);
      await ctx.answerCallbackQuery("⏰ Приглашение истекло!");
      await ctx.editMessageText(`⏰ Приглашение истекло!`);
      return;
    }

    const existingFamily1 = await getFamily(invite.fromId);
    const existingFamily2 = await getFamily(invite.toId);
    if (existingFamily1 || existingFamily2) {
      await deleteInvite(inviteId);
      await ctx.answerCallbackQuery("❌ Один из игроков уже в семье!");
      await ctx.editMessageText(`❌ Один из игроков уже состоит в семье!`);
      return;
    }

    const u1 = await getOrCreateUser(invite.fromId);
    const u2 = await getOrCreateUser(invite.toId);

    const familyName = `${u1.owlName} & ${u2.owlName}`;
    await createFamily(invite.fromId, invite.toId, familyName);
    await deleteInvite(inviteId);

    const s1 = getSkin(u1.owlSkin);
    const s2 = getSkin(u2.owlSkin);

    await ctx.answerCallbackQuery("💍 Союз заключён!");
    await ctx.editMessageText(
      `🎉 <b>${esc(u1.owlName)}</b> ${s1.emoji} и <b>${esc(u2.owlName)}</b> ${s2.emoji} теперь семья!\n\n` +
        `👨‍👩‍👧 <b>${esc(familyName)}</b>\n\n` +
        `Используйте /вылазка для совместной охоты!`,
      { parse_mode: "HTML" },
    );
  });

  bot.callbackQuery(/^family_decline_(\d+)$/, async (ctx) => {
    const inviteId = parseInt(ctx.match![1]!);

    const inviteRows = await db
      .select()
      .from(owlFamilyInvites)
      .where(eq(owlFamilyInvites.id, inviteId))
      .limit(1);
    const invite = inviteRows[0];

    if (invite && ctx.from!.id !== invite.toId && ctx.from!.id !== invite.fromId) {
      await ctx.answerCallbackQuery("Это не твоё решение!");
      return;
    }

    if (invite) await deleteInvite(inviteId);
    await ctx.answerCallbackQuery("Отклонено");
    await ctx.editMessageText(`💔 Предложение союза отклонено.`);
  });

  bot.command(["расстаться", "rasstat", "divorce"], async (ctx) => {
    const family = await getFamily(ctx.from!.id);
    if (!family) {
      await ctx.reply(`🦉 Ты не состоишь в семье!`);
      return;
    }

    const [u1, u2] = await getFamilyUsers(family);
    const keyboard = new InlineKeyboard()
      .text("💔 Подтвердить", `divorce_${family.id}`)
      .text("Отмена", `divorce_cancel`);

    await ctx.reply(
      `💔 Вы уверены, что хотите разорвать союз <b>${esc(family.familyName)}</b>?\n\n` +
        `${getSkin(u1.owlSkin).emoji} ${esc(u1.owlName)} и ${getSkin(u2.owlSkin).emoji} ${esc(u2.owlName)} разлетятся по разным лесам.`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  bot.callbackQuery(/^divorce_(\d+)$/, async (ctx) => {
    const familyId = parseInt(ctx.match![1]!);

    const famRows = await db
      .select()
      .from(owlFamilies)
      .where(eq(owlFamilies.id, familyId))
      .limit(1);
    const fam = famRows[0];

    if (!fam) {
      await ctx.answerCallbackQuery("❌ Семья не найдена");
      await ctx.editMessageText(`❌ Семья не найдена`);
      return;
    }
    if (ctx.from!.id !== fam.user1Id && ctx.from!.id !== fam.user2Id) {
      await ctx.answerCallbackQuery("Это не твоя семья!");
      return;
    }
    await deleteFamily(familyId);
    await ctx.answerCallbackQuery("💔 Разорвано");
    await ctx.editMessageText(
      `💔 Союз <b>${esc(fam.familyName)}</b> расторгнут.\n\nСовы разлетелись в разные стороны.`,
      { parse_mode: "HTML" },
    );
  });

  bot.callbackQuery("divorce_cancel", async (ctx) => {
    await ctx.answerCallbackQuery("Отменено");
    await ctx.deleteMessage().catch(() => {});
  });

  bot.command(["вылазка", "vylazka", "raid"], async (ctx) => {
    const family = await getFamily(ctx.from!.id);
    if (!family) {
      await ctx.reply(`🦉 Ты не состоишь в семье! Используй /семья для создания союза.`);
      return;
    }

    const lastHeist = family.lastHeistAt
      ? new Date(family.lastHeistAt).getTime()
      : 0;
    const remaining = HEIST_COOLDOWN_MS - (Date.now() - lastHeist);

    if (remaining > 0) {
      await ctx.reply(
        `🦉 Вылазка на перезарядке! Ещё <b>${formatDuration(remaining)}</b>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const [u1, u2] = await getFamilyUsers(family);
    const keyboard = new InlineKeyboard()
      .text("🪶 Украсть фрагмент", `heist_feather_${family.id}`)
      .text("✨ Бонусный опыт", `heist_xp_${family.id}`);

    await ctx.reply(
      `🦉🦉 <b>Семейная вылазка</b>\n\n` +
        `<b>${esc(u1.owlName)}</b> + <b>${esc(u2.owlName)}</b> готовятся к охоте!\n\n` +
        `Что стащить?`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  bot.callbackQuery(/^heist_(feather|xp)_(\d+)$/, async (ctx) => {
    const heistType = ctx.match![1] as "feather" | "xp";
    const familyId = parseInt(ctx.match![2]!);

    const famRows = await db
      .select()
      .from(owlFamilies)
      .where(eq(owlFamilies.id, familyId))
      .limit(1);
    const fam = famRows[0];

    if (!fam) {
      await ctx.answerCallbackQuery("❌ Семья не найдена");
      await ctx.editMessageText("❌ Семья не найдена");
      return;
    }

    if (ctx.from!.id !== fam.user1Id && ctx.from!.id !== fam.user2Id) {
      await ctx.answerCallbackQuery("Это не твоя семья!");
      return;
    }

    const lastHeist = fam.lastHeistAt
      ? new Date(fam.lastHeistAt).getTime()
      : 0;
    if (HEIST_COOLDOWN_MS - (Date.now() - lastHeist) > 0) {
      await ctx.answerCallbackQuery("⏰ Вылазка уже на перезарядке!");
      return;
    }

    const success = Math.random() < HEIST_SUCCESS_CHANCE;

    await db
      .update(owlFamilies)
      .set({ lastHeistAt: new Date() })
      .where(eq(owlFamilies.id, familyId));

    const xpGain = 15;
    await addXP(fam.user1Id, xpGain);
    await addXP(fam.user2Id, xpGain);

    const questIds = ["l27_heist_3", "l41_heist_10"];
    for (const qid of questIds) {
      const quest = QUESTS.find((q) => q.id === qid);
      if (quest) {
        await upsertQuestProgress(fam.user1Id, qid, quest.target, 1);
        await upsertQuestProgress(fam.user2Id, qid, quest.target, 1);
      }
    }

    const [u1, u2] = await getFamilyUsers(fam);
    await ctx.answerCallbackQuery();

    if (success) {
      if (heistType === "feather") {
        await addFeathers(fam.user1Id, 1);
        await addFeathers(fam.user2Id, 1);
        await ctx.editMessageText(
          `🎉 <b>Вылазка удалась!</b>\n\n` +
            `${getSkin(u1.owlSkin).emoji} <b>${esc(u1.owlName)}</b> отвлекала, пока\n` +
            `${getSkin(u2.owlSkin).emoji} <b>${esc(u2.owlName)}</b> тащила добычу!\n\n` +
            `🪶 Каждой +1 фрагмент\n` +
            `✨ +${xpGain} XP каждой`,
          { parse_mode: "HTML" },
        );
      } else {
        await addXP(fam.user1Id, 25);
        await addXP(fam.user2Id, 25);
        await ctx.editMessageText(
          `🎉 <b>Вылазка удалась!</b>\n\n` +
            `Совы тайно подслушали мудрость лесного старца!\n\n` +
            `✨ +25 бонусного XP каждой\n` +
            `✨ +${xpGain} XP за вылазку`,
          { parse_mode: "HTML" },
        );
      }
    } else {
      await ctx.editMessageText(
        `💨 <b>Вылазка провалилась!</b>\n\n` +
          `Совы засветились и были прогнаны. Стыдоба!\n\n` +
          `✨ +${xpGain} XP каждой (зато опыт!)`,
        { parse_mode: "HTML" },
      );
    }
  });

  bot.command(["семяимя", "semyaimya", "familyname"], async (ctx) => {
    const args = ctx.message?.text?.split(" ").slice(1).join(" ").trim();
    if (!args) {
      await ctx.reply(
        `✏️ Напиши новое имя семьи:\n<code>/семяимя НовоеИмя</code>`,
        { parse_mode: "HTML" },
      );
      return;
    }
    if (args.length > 30) {
      await ctx.reply(`❌ Слишком длинное (макс 30 символов)`);
      return;
    }
    const family = await getFamily(ctx.from!.id);
    if (!family) {
      await ctx.reply(`🦉 Ты не состоишь в семье!`);
      return;
    }
    await db
      .update(owlFamilies)
      .set({ familyName: args })
      .where(eq(owlFamilies.id, family.id));
    await ctx.reply(
      `✅ Семья переименована: <b>${esc(args)}</b>`,
      { parse_mode: "HTML" },
    );
  });
}
