import { Bot, InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import {
  getOrCreateUser,
  updateUser,
  addXP,
  addFeathers,
  removeFeathers,
  getActiveDuel,
  createDuel,
  getDuel,
  updateDuel,
  upsertQuestProgress,
} from "../dbHelpers.js";
import { esc, getSkin, canDuel } from "../format.js";
import {
  initFeatherGame,
  pickFeather,
  renderFeatherBoard,
  initTicTacToe,
  makeTicTacToeMove,
  initBattle,
  battleAction,
  type FeatherGameState,
  type TicTacToeState,
  type BattleState,
} from "../games.js";
import { QUESTS } from "../data.js";
import { db, owlUsers } from "@workspace/db";
import { ilike } from "drizzle-orm";

const WIN_COOLDOWN_MS = 3 * 60 * 1000;
const LOSE_COOLDOWN_MS = 10 * 60 * 1000;
const DUEL_TIMEOUT_MS = 3 * 60 * 1000;

// ── in-memory state (cleared on restart) ─────────────────────────────────────

/** Waiting for user to reply with @username after /duel with no target */
const pendingDuelPrompt = new Map<number, { promptMsgId: number; chatId: number }>();

/** Waiting for user to enter stake amount via ForceReply */
const pendingStakeInput = new Map<
  number,
  { duelId: number; stakeType: "feathers" | "xp"; promptMsgId: number; chatId: number }
>();

/** Timeout handles for pending duels */
const duelTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

// ── helpers ───────────────────────────────────────────────────────────────────

function hpBar(hp: number) {
  return hp >= 2 ? "❤️❤️" : hp === 1 ? "❤️🖤" : "🖤🖤";
}

function stakeLabel(stakeType: string, stakeAmount: number): string {
  if (stakeType === "none") return "просто так 🤝";
  if (stakeType === "feathers") return `🪶 ${stakeAmount} фрагментов`;
  return `✨ ${stakeAmount} XP`;
}

function cancelDuelTimeout(duelId: number) {
  const id = duelTimeouts.get(duelId);
  if (id !== undefined) {
    clearTimeout(id);
    duelTimeouts.delete(duelId);
  }
}

const TYPE_NAMES: Record<string, string> = {
  feather: "🪶 Игра перьев",
  tictactoe: "🌿 Крестики-нолики",
  dice: "🎲 Кубик удачи",
  battle: "⚔️ Поединок",
};

const TYPE_DESCS: Record<string, string> = {
  feather: "Пять перьев на пне, одно отравлено. По очереди тянут — кто вытащит яд, проиграл.",
  tictactoe: "Совы выцарапывают знаки когтями на коре старого дуба. Три в ряд — победа.",
  dice: "Каждая сова бросает дубовую шишку. У кого число больше — тот победил.",
  battle: "Поединок когтей и крыльев. Бьёшь или уворачиваешься. Два попадания — и противник повержен.",
};

// ── apply duel result ─────────────────────────────────────────────────────────

async function applyDuelResult(
  winnerId: number,
  loserId: number,
  stakeType: string,
  stakeAmount: number,
  duelType: string,
) {
  const loser = await getOrCreateUser(loserId);
  const winner = await getOrCreateUser(winnerId);

  if (stakeType === "feathers" && stakeAmount > 0) {
    await removeFeathers(loserId, Math.min(stakeAmount, loser.feathers));
    await addFeathers(winnerId, stakeAmount);
  } else if (stakeType === "xp" && stakeAmount > 0) {
    await addXP(winnerId, stakeAmount);
    // loser still gets base xp below
  }

  await addXP(winnerId, 30);
  await addXP(loserId, 10);

  await updateUser(winnerId, {
    duelWinCooldown: new Date(Date.now() + WIN_COOLDOWN_MS),
    totalDuelsWon: winner.totalDuelsWon + 1,
  });
  await updateUser(loserId, {
    duelLoseCooldown: new Date(Date.now() + LOSE_COOLDOWN_MS),
    totalDuelsLost: loser.totalDuelsLost + 1,
  });

  const winQuestIds = [
    "l9_win_3duels", "l15_win_5duels", "l21_win_10duels",
    "l28_win_20duels", "l35_win_30duels", "l40_win_50duels",
    "l44_win_70duels", "l49_win_100duels",
  ];
  for (const qid of winQuestIds) {
    const q = QUESTS.find((x) => x.id === qid);
    if (q) await upsertQuestProgress(winnerId, qid, q.target, 1);
  }
  if (duelType === "feather") {
    for (const qid of ["l6_feather_duel", "l25_feather_duel_5"]) {
      const q = QUESTS.find((x) => x.id === qid);
      if (q) await upsertQuestProgress(winnerId, qid, q.target, 1);
    }
  }
  if (duelType === "tictactoe") {
    for (const qid of ["l11_tictactoe", "l38_tictactoe_10"]) {
      const q = QUESTS.find((x) => x.id === qid);
      if (q) await upsertQuestProgress(winnerId, qid, q.target, 1);
    }
  }
  if (duelType === "battle") {
    for (const qid of ["l7_battle_duel", "l18_battle_3", "l31_battle_10", "l46_battle_30"]) {
      const q = QUESTS.find((x) => x.id === qid);
      if (q) await upsertQuestProgress(winnerId, qid, q.target, 1);
    }
  }
}

// ── keyboards ─────────────────────────────────────────────────────────────────

function typeKeyboard(duelId: number) {
  return new InlineKeyboard()
    .text("🪶 Игра перьев", `dtype_${duelId}_feather`).row()
    .text("🌿 Крестики-нолики", `dtype_${duelId}_tictactoe`).row()
    .text("🎲 Кубик удачи", `dtype_${duelId}_dice`).row()
    .text("⚔️ Поединок", `dtype_${duelId}_battle`).row()
    .text("❌ Отменить", `duel_cancel_${duelId}`);
}

function stakeKeyboard(duelId: number) {
  return new InlineKeyboard()
    .text("🪶 Фрагменты", `dstake_type_${duelId}_feathers`)
    .text("✨ XP", `dstake_type_${duelId}_xp`).row()
    .text("🤝 Просто так", `dstake_type_${duelId}_none`).row()
    .text("↩️ Назад", `duel_back_type_${duelId}`);
}

function acceptKeyboard(duelId: number) {
  return new InlineKeyboard()
    .text("✅ Принять вызов!", `duel_accept_${duelId}`).row()
    .text("❌ Отклонить / Отменить", `duel_decline_${duelId}`);
}

function featherKeyboard(duelId: number, state: FeatherGameState) {
  const kb = new InlineKeyboard();
  for (let i = 0; i < 5; i++) {
    if (!state.picked.includes(i)) kb.text(`🪶 ${i + 1}`, `feather_pick_${duelId}_${i}`);
    else kb.text("·", "noop");
  }
  return kb;
}

function tttKeyboard(duelId: number, board: (string | null)[]) {
  const kb = new InlineKeyboard();
  const empty = ["🌿", "🌿", "🌿", "🌿", "🌿", "🌿", "🌿", "🌿", "🌿"];
  for (let i = 0; i < 9; i++) {
    kb.text(board[i] ?? empty[i]!, board[i] ? "noop" : `ttt_${duelId}_${i}`);
    if (i === 2 || i === 5) kb.row();
  }
  return kb;
}

function battleKeyboard(duelId: number) {
  return new InlineKeyboard()
    .text("⚔️ Атаковать", `battle_attack_${duelId}`)
    .text("🌀 Уклониться", `battle_dodge_${duelId}`);
}

// ── exported: starts the duel flow (type selection) ───────────────────────────

export async function startDuelFlow(
  ctx: Context,
  challengerId: number,
  challengerUsername: string | undefined,
  targetId: number,
  targetUsername: string | undefined,
  targetDisplayName: string,
) {
  const challenger = await getOrCreateUser(challengerId, challengerUsername);
  const challenged = await getOrCreateUser(targetId, targetUsername);

  const canC = canDuel(challenger);
  if (!canC.ok) {
    await ctx.reply(`❌ ${canC.reason}`, { parse_mode: "HTML" });
    return;
  }

  const existingC = await getActiveDuel(challengerId);
  const existingCd = await getActiveDuel(targetId);
  if (existingC || existingCd) {
    await ctx.reply(`⚔️ Один из игроков уже участвует в дуэли!`);
    return;
  }

  const chatId = ctx.chat!.id;
  const duel = await createDuel(challengerId, targetId, chatId);
  await updateDuel(duel.id, { state: "challenger_type" });

  const cSkin = getSkin(challenger.owlSkin);
  const cdSkin = getSkin(challenged.owlSkin);

  await ctx.reply(
    `🌲 <b>${esc(challenger.owlName)}</b> ${cSkin.emoji} бросает вызов ${cdSkin.emoji} <b>${esc(challenged.owlName)}</b> (${targetDisplayName})!\n\n` +
    `<b>Выбери тип дуэли:</b>\n\n` +
    `🪶 <i>Игра перьев</i> — пять перьев, одно отравлено\n` +
    `🌿 <i>Крестики-нолики</i> — на коре дуба\n` +
    `🎲 <i>Кубик удачи</i> — шишка всё решит\n` +
    `⚔️ <i>Поединок</i> — до двух попаданий`,
    { parse_mode: "HTML", reply_markup: typeKeyboard(duel.id) },
  );
}

// ── main handler registration ─────────────────────────────────────────────────

export function registerDuelHandlers(bot: Bot<Context>) {

  // Schedule a timeout to cancel a pending duel after 3 minutes
  function scheduleDuelTimeout(duelId: number, chatId: number, msgId: number) {
    cancelDuelTimeout(duelId);
    const id = setTimeout(async () => {
      duelTimeouts.delete(duelId);
      try {
        const duel = await getDuel(duelId);
        if (!duel || duel.state !== "pending") return;
        await updateDuel(duelId, { state: "done" });
        await bot.api.editMessageText(
          chatId, msgId,
          `⏰ <b>Время истекло!</b>\n\nСоперник не ответил за 3 минуты — вызов отменён.`,
          { parse_mode: "HTML" },
        );
      } catch {}
    }, DUEL_TIMEOUT_MS);
    duelTimeouts.set(duelId, id);
  }

  // Helper: send the challenge message and set timeout
  async function sendChallenge(
    ctx: Context,
    duelId: number,
    stakeType: string,
    stakeAmount: number,
    chatId: number,
  ) {
    const duel = await getDuel(duelId);
    if (!duel) return;
    const challenger = await getOrCreateUser(duel.challengerId);
    const challenged = await getOrCreateUser(duel.challengedId);
    const cSkin = getSkin(challenger.owlSkin);
    const cdSkin = getSkin(challenged.owlSkin);
    const targetMention = challenged.username ? `@${challenged.username}` : esc(challenged.owlName);
    const stakeStr = stakeLabel(stakeType, stakeAmount);

    const sent = await ctx.reply(
      `🌲 <b>Вызов на дуэль!</b>\n\n` +
      `${cSkin.emoji} <b>${esc(challenger.owlName)}</b> против ${cdSkin.emoji} <b>${esc(challenged.owlName)}</b>!\n\n` +
      `⚔️ Тип: <b>${TYPE_NAMES[duel.duelType] ?? duel.duelType}</b>\n` +
      `<i>${TYPE_DESCS[duel.duelType] ?? ""}</i>\n\n` +
      `💰 Ставка: <b>${stakeStr}</b>\n` +
      `⏰ Ответ в течение 3 минут\n\n` +
      `${targetMention}, принимаешь вызов? 🦉`,
      { parse_mode: "HTML", reply_markup: acceptKeyboard(duelId) },
    );

    await updateDuel(duelId, {
      stakeType,
      stakeAmount,
      state: "pending",
      messageId: sent.message_id,
      duelExpiresAt: new Date(Date.now() + DUEL_TIMEOUT_MS),
    });

    scheduleDuelTimeout(duelId, chatId, sent.message_id);
  }

  // ── /duel command ───────────────────────────────────────────────────────────
  bot.command(["дуэль", "duel"], async (ctx) => {
    const from = ctx.from!;

    const replyFrom = ctx.message?.reply_to_message?.from;
    if (replyFrom && !replyFrom.is_bot && replyFrom.id !== from.id) {
      pendingDuelPrompt.delete(from.id);
      await startDuelFlow(ctx, from.id, from.username, replyFrom.id, replyFrom.username, replyFrom.username ? `@${replyFrom.username}` : replyFrom.first_name);
      return;
    }

    const entities = ctx.message?.entities ?? [];
    const text = ctx.message?.text ?? "";
    for (const entity of entities) {
      if (entity.type === "mention") {
        const username = text.slice(entity.offset + 1, entity.offset + entity.length);
        const [found] = await db.select().from(owlUsers).where(ilike(owlUsers.username, username)).limit(1);
        if (found && found.telegramId !== from.id) {
          pendingDuelPrompt.delete(from.id);
          await startDuelFlow(ctx, from.id, from.username, found.telegramId, found.username ?? undefined, `@${username}`);
          return;
        }
        if (!found) { await ctx.reply(`❌ Игрок @${username} ещё не зарегистрирован.`); return; }
        break;
      }
      if (entity.type === "text_mention" && entity.user && entity.user.id !== from.id) {
        const u = entity.user;
        pendingDuelPrompt.delete(from.id);
        await startDuelFlow(ctx, from.id, from.username, u.id, u.username, u.username ? `@${u.username}` : u.first_name);
        return;
      }
    }

    const sent = await ctx.reply(
      `⚔️ <b>Кого вызываешь на дуэль?</b>\n\nНапиши <code>@username</code> в ответ:`,
      { parse_mode: "HTML", reply_markup: { force_reply: true, selective: true } },
    );
    pendingDuelPrompt.set(from.id, { promptMsgId: sent.message_id, chatId: ctx.chat!.id });
  });

  // ── combined text handler: stake amount + opponent selection ─────────────────
  bot.on("message:text", async (ctx, next) => {
    const from = ctx.from;
    if (!from || from.is_bot) return next();

    const replyToId = ctx.message.reply_to_message?.message_id;

    // 1. Check stake amount input (takes priority)
    const si = pendingStakeInput.get(from.id);
    if (si && replyToId === si.promptMsgId) {
      pendingStakeInput.delete(from.id);

      const raw = ctx.message.text.trim();
      const amount = parseInt(raw);
      if (isNaN(amount) || amount < 0) {
        await ctx.reply(`❌ Введи корректное число. Попробуй снова: /duel`);
        const duel = await getDuel(si.duelId);
        if (duel) await updateDuel(si.duelId, { state: "done" });
        return;
      }

      const duel = await getDuel(si.duelId);
      if (!duel || duel.state !== "challenger_stake") {
        await ctx.reply(`❌ Дуэль уже недействительна.`);
        return;
      }

      const challenger = await getOrCreateUser(from.id, from.username);
      if (si.stakeType === "feathers" && amount > 0 && challenger.feathers < amount) {
        await ctx.reply(`❌ У тебя только <b>${challenger.feathers}</b> фрагментов. Попробуй ещё раз: /duel`, { parse_mode: "HTML" });
        await updateDuel(si.duelId, { state: "done" });
        return;
      }
      if (si.stakeType === "xp" && amount > 0 && challenger.xp < amount) {
        await ctx.reply(`❌ У тебя только <b>${challenger.xp}</b> XP. Попробуй ещё раз: /duel`, { parse_mode: "HTML" });
        await updateDuel(si.duelId, { state: "done" });
        return;
      }

      await sendChallenge(ctx, si.duelId, si.stakeType, amount, si.chatId);
      return;
    }

    // 2. Check opponent selection
    const pending = pendingDuelPrompt.get(from.id);
    if (pending && replyToId === pending.promptMsgId) {
      pendingDuelPrompt.delete(from.id);

      const text = ctx.message.text.trim();
      const entities = ctx.message.entities ?? [];

      for (const entity of entities) {
        if (entity.type === "mention") {
          const username = text.slice(entity.offset + 1, entity.offset + entity.length);
          const [found] = await db.select().from(owlUsers).where(ilike(owlUsers.username, username)).limit(1);
          if (!found) { await ctx.reply(`❌ Игрок @${username} не найден. /duel`); return; }
          if (found.telegramId === from.id) { await ctx.reply(`🦉 Нельзя вызвать самого себя!`); return; }
          await startDuelFlow(ctx, from.id, from.username, found.telegramId, found.username ?? undefined, `@${username}`);
          return;
        }
        if (entity.type === "text_mention" && entity.user) {
          const u = entity.user;
          if (u.id === from.id) { await ctx.reply(`🦉 Нельзя вызвать самого себя!`); return; }
          await startDuelFlow(ctx, from.id, from.username, u.id, u.username, u.username ? `@${u.username}` : u.first_name);
          return;
        }
      }

      const match = text.match(/@(\w+)/);
      if (match) {
        const username = match[1]!;
        const [found] = await db.select().from(owlUsers).where(ilike(owlUsers.username, username)).limit(1);
        if (!found) { await ctx.reply(`❌ Игрок @${username} не найден. /duel`); return; }
        if (found.telegramId === from.id) { await ctx.reply(`🦉 Нельзя вызвать самого себя!`); return; }
        await startDuelFlow(ctx, from.id, from.username, found.telegramId, found.username ?? undefined, `@${username}`);
        return;
      }

      await ctx.reply(`❌ Не нашла @username. Напиши, например: <code>@sam</code>\n\nЕщё раз: /duel`, { parse_mode: "HTML" });
      return;
    }

    return next();
  });

  // ── type selection ───────────────────────────────────────────────────────────
  bot.callbackQuery(/^dtype_(\d+)_(feather|tictactoe|dice|battle)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const duelType = ctx.match![2]!;
    const duel = await getDuel(duelId);
    if (!duel || duel.state !== "challenger_type") { await ctx.answerCallbackQuery("Дуэль уже неактивна"); return; }
    if (ctx.from!.id !== duel.challengerId) { await ctx.answerCallbackQuery("Только вызывающий выбирает тип!"); return; }

    await updateDuel(duelId, { duelType, state: "challenger_stake" });
    await ctx.answerCallbackQuery();

    const challenger = await getOrCreateUser(duel.challengerId);
    const challenged = await getOrCreateUser(duel.challengedId);
    const cSkin = getSkin(challenger.owlSkin);
    const cdSkin = getSkin(challenged.owlSkin);

    await ctx.editMessageText(
      `🌲 <b>${esc(challenger.owlName)}</b> ${cSkin.emoji} vs ${cdSkin.emoji} <b>${esc(challenged.owlName)}</b>\n\n` +
      `Тип: <b>${TYPE_NAMES[duelType]}</b>\n<i>${TYPE_DESCS[duelType]}</i>\n\n` +
      `<b>На что играете?</b>`,
      { parse_mode: "HTML", reply_markup: stakeKeyboard(duelId) },
    );
  });

  // back to type selection
  bot.callbackQuery(/^duel_back_type_(\d+)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const duel = await getDuel(duelId);
    if (!duel || duel.state !== "challenger_stake") { await ctx.answerCallbackQuery(); return; }
    if (ctx.from!.id !== duel.challengerId) { await ctx.answerCallbackQuery("Это не твой выбор!"); return; }
    await updateDuel(duelId, { state: "challenger_type" });
    await ctx.answerCallbackQuery();
    const challenger = await getOrCreateUser(duel.challengerId);
    const challenged = await getOrCreateUser(duel.challengedId);
    const cSkin = getSkin(challenger.owlSkin);
    const cdSkin = getSkin(challenged.owlSkin);
    await ctx.editMessageText(
      `🌲 <b>${esc(challenger.owlName)}</b> ${cSkin.emoji} vs ${cdSkin.emoji} <b>${esc(challenged.owlName)}</b>\n\n<b>Выбери тип дуэли:</b>`,
      { parse_mode: "HTML", reply_markup: typeKeyboard(duelId) },
    );
  });

  // ── stake type selection → ForceReply or direct challenge ────────────────────
  bot.callbackQuery(/^dstake_type_(\d+)_(feathers|xp|none)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const stakeType = ctx.match![2] as "feathers" | "xp" | "none";
    const duel = await getDuel(duelId);
    if (!duel || duel.state !== "challenger_stake") { await ctx.answerCallbackQuery("Дуэль уже неактивна"); return; }
    if (ctx.from!.id !== duel.challengerId) { await ctx.answerCallbackQuery("Только вызывающий выбирает ставку!"); return; }

    const challenger = await getOrCreateUser(duel.challengerId);

    if (stakeType === "none") {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `🤝 Ставка: <b>просто так</b> — честь важнее!\n\n<i>Ищем соперника...</i>`,
        { parse_mode: "HTML" },
      );
      await sendChallenge(ctx, duelId, "none", 0, duel.chatId);
      return;
    }

    await ctx.answerCallbackQuery();

    const label = stakeType === "feathers"
      ? `🪶 Сколько фрагментов ставишь?\n<i>У тебя: ${challenger.feathers}</i>\n\n0 = просто так`
      : `✨ Сколько XP ставишь?\n<i>У тебя: ${challenger.xp} XP</i>\n\n0 = просто так`;

    const prompt = await ctx.reply(label, {
      parse_mode: "HTML",
      reply_markup: { force_reply: true, selective: true },
    });

    pendingStakeInput.set(ctx.from!.id, {
      duelId,
      stakeType,
      promptMsgId: prompt.message_id,
      chatId: duel.chatId,
    });
  });

  // ── cancel ───────────────────────────────────────────────────────────────────
  bot.callbackQuery(/^duel_cancel_(\d+)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const duel = await getDuel(duelId);
    if (!duel) { await ctx.answerCallbackQuery(); return; }
    if (ctx.from!.id !== duel.challengerId) { await ctx.answerCallbackQuery("Только вызывающий может отменить"); return; }
    cancelDuelTimeout(duelId);
    await updateDuel(duelId, { state: "done" });
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`🕊️ Вызов отменён. Совы разошлись по ветвям.`);
  });

  // ── decline / cancel from pending ────────────────────────────────────────────
  bot.callbackQuery(/^duel_decline_(\d+)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const duel = await getDuel(duelId);
    if (!duel) { await ctx.answerCallbackQuery(); return; }

    const fromId = ctx.from!.id;
    if (fromId !== duel.challengedId && fromId !== duel.challengerId) {
      await ctx.answerCallbackQuery("Это не твоё решение!"); return;
    }

    cancelDuelTimeout(duelId);
    await updateDuel(duelId, { state: "done" });
    await ctx.answerCallbackQuery();

    const who = await getOrCreateUser(fromId);
    const isChallenger = fromId === duel.challengerId;
    const action = isChallenger ? "отменила вызов" : "отклонила вызов";
    await ctx.editMessageText(
      `🕊️ <b>${esc(who.owlName)}</b> ${action}. Совы разошлись по ветвям.`,
      { parse_mode: "HTML" },
    );
  });

  // ── accept → start game ───────────────────────────────────────────────────────
  bot.callbackQuery(/^duel_accept_(\d+)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const duel = await getDuel(duelId);
    if (!duel || duel.state !== "pending") { await ctx.answerCallbackQuery("Дуэль уже недействительна"); return; }
    if (ctx.from!.id !== duel.challengedId) { await ctx.answerCallbackQuery("Это тебя не касается!"); return; }

    const challenged = await getOrCreateUser(duel.challengedId);
    const canCd = canDuel(challenged);
    if (!canCd.ok) { await ctx.answerCallbackQuery({ text: canCd.reason!, show_alert: true }); return; }

    cancelDuelTimeout(duelId);
    await ctx.answerCallbackQuery();
    await updateDuel(duelId, { state: "active" });

    const challenger = await getOrCreateUser(duel.challengerId);
    const cSkin = getSkin(challenger.owlSkin);
    const cdSkin = getSkin(challenged.owlSkin);
    const stakeStr = stakeLabel(duel.stakeType, duel.stakeAmount);

    if (duel.duelType === "feather") {
      const gs = initFeatherGame(duel.challengerId, duel.challengedId);
      await updateDuel(duelId, { gameState: gs as any, currentTurn: gs.currentTurn });
      const turnUser = gs.currentTurn === duel.challengerId ? challenger : challenged;

      await ctx.editMessageText(
        `🪶 <b>Игра перьев!</b>\n<i>Пять перьев на пне. Одно — отравлено...</i>\n\n` +
        `${cSkin.emoji} <b>${esc(challenger.owlName)}</b> vs ${cdSkin.emoji} <b>${esc(challenged.owlName)}</b>\n` +
        `💰 Ставка: <b>${stakeStr}</b>\n\n` +
        `${renderFeatherBoard(gs)}\n\n` +
        `Ход: ${getSkin(turnUser.owlSkin).emoji} <b>${esc(turnUser.owlName)}</b> — тяни перо!`,
        { parse_mode: "HTML", reply_markup: featherKeyboard(duelId, gs) },
      );

    } else if (duel.duelType === "tictactoe") {
      const gs = initTicTacToe(duel.challengerId, duel.challengedId);
      await updateDuel(duelId, { gameState: gs as any, currentTurn: gs.xPlayer });
      const turnUser = gs.xPlayer === duel.challengerId ? challenger : challenged;

      await ctx.editMessageText(
        `🌿 <b>Крестики-нолики</b>\n<i>Совы нашли старый дуб и выцарапывают знаки...</i>\n\n` +
        `${cSkin.emoji} <b>${esc(challenger.owlName)}</b> ❌ vs ⭕ <b>${esc(challenged.owlName)}</b> ${cdSkin.emoji}\n` +
        `💰 Ставка: <b>${stakeStr}</b>\n\n` +
        `Ход: <b>${esc(turnUser.owlName)}</b>`,
        { parse_mode: "HTML", reply_markup: tttKeyboard(duelId, gs.board) },
      );

    } else if (duel.duelType === "dice") {
      const roll1 = Math.floor(Math.random() * 6) + 1;
      const roll2 = Math.floor(Math.random() * 6) + 1;
      const d: Record<number, string> = { 1: "⚀", 2: "⚁", 3: "⚂", 4: "⚃", 5: "⚄", 6: "⚅" };

      if (roll1 === roll2) {
        await updateDuel(duelId, { state: "done" });
        await ctx.editMessageText(
          `🎲 <b>Кубик удачи</b>\n\n` +
          `${cSkin.emoji} <b>${esc(challenger.owlName)}</b>: ${d[roll1]} (${roll1})\n` +
          `${cdSkin.emoji} <b>${esc(challenged.owlName)}</b>: ${d[roll2]} (${roll2})\n\n` +
          `🤝 <b>Ничья!</b> Шишки упали одинаково.`,
          { parse_mode: "HTML" },
        );
        return;
      }

      const winnerId = roll1 > roll2 ? duel.challengerId : duel.challengedId;
      const loserId = roll1 > roll2 ? duel.challengedId : duel.challengerId;
      const winnerUser = winnerId === duel.challengerId ? challenger : challenged;
      await applyDuelResult(winnerId, loserId, duel.stakeType, duel.stakeAmount, "dice");
      await updateDuel(duelId, { state: "done", winnerId });

      await ctx.editMessageText(
        `🎲 <b>Кубик удачи</b>\n\n` +
        `${cSkin.emoji} <b>${esc(challenger.owlName)}</b>: ${d[roll1]!} (${roll1})\n` +
        `${cdSkin.emoji} <b>${esc(challenged.owlName)}</b>: ${d[roll2]!} (${roll2})\n\n` +
        `🏆 <b>${esc(winnerUser.owlName)}</b> победила!\n` +
        (duel.stakeType !== "none" ? `💰 Выигрыш: <b>${stakeStr}</b>\n` : ``) +
        `✨ +30 XP победителю · +10 XP проигравшему`,
        { parse_mode: "HTML" },
      );

    } else if (duel.duelType === "battle") {
      const gs = initBattle(duel.challengerId, duel.challengedId);
      await updateDuel(duelId, { gameState: gs as any, currentTurn: gs.currentTurn });
      const turnUser = gs.currentTurn === duel.challengerId ? challenger : challenged;

      await ctx.editMessageText(
        `⚔️ <b>Поединок!</b>\n<i>Совы встают напротив. Когти наточены...</i>\n\n` +
        `${cSkin.emoji} <b>${esc(challenger.owlName)}</b> ${hpBar(2)} vs ${hpBar(2)} <b>${esc(challenged.owlName)}</b> ${cdSkin.emoji}\n` +
        `💰 Ставка: <b>${stakeStr}</b>\n\n` +
        `Ход: ${getSkin(turnUser.owlSkin).emoji} <b>${esc(turnUser.owlName)}</b>`,
        { parse_mode: "HTML", reply_markup: battleKeyboard(duelId) },
      );
    }
  });

  bot.callbackQuery("noop", async (ctx) => { await ctx.answerCallbackQuery(); });

  // ── feather pick ──────────────────────────────────────────────────────────────
  bot.callbackQuery(/^feather_pick_(\d+)_(\d+)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const index = parseInt(ctx.match![2]!);
    const duel = await getDuel(duelId);
    if (!duel || duel.state !== "active" || duel.duelType !== "feather") { await ctx.answerCallbackQuery("Дуэль недействительна"); return; }
    if (ctx.from!.id !== duel.currentTurn) { await ctx.answerCallbackQuery("Сейчас не твой ход! 🦉"); return; }
    await ctx.answerCallbackQuery();

    const state = duel.gameState as unknown as FeatherGameState;
    const challenger = await getOrCreateUser(duel.challengerId);
    const challenged = await getOrCreateUser(duel.challengedId);
    const cSkin = getSkin(challenger.owlSkin);
    const cdSkin = getSkin(challenged.owlSkin);
    const currentUser = ctx.from!.id === duel.challengerId ? challenger : challenged;

    const { poisoned, loser, nextTurn, state: newState } = pickFeather(state, ctx.from!.id, index);
    await updateDuel(duelId, { gameState: newState as any });

    if (poisoned) {
      const winnerId = loser === duel.challengerId ? duel.challengedId : duel.challengerId;
      const loserUser = loser === duel.challengerId ? challenger : challenged;
      const winnerUser = winnerId === duel.challengerId ? challenger : challenged;
      await applyDuelResult(winnerId, loser, duel.stakeType, duel.stakeAmount, "feather");
      await updateDuel(duelId, { state: "done", winnerId });

      await ctx.editMessageText(
        `🪶 <b>Игра перьев</b>\n\n${renderFeatherBoard(newState)}\n\n` +
        `☠️ <b>${esc(loserUser.owlName)}</b> вытянула отравленное перо #${index + 1}!\n` +
        `<i>Чёрный яд — коготки подкосились...</i>\n\n` +
        `🏆 <b>${esc(winnerUser.owlName)}</b> победила!\n` +
        (duel.stakeType !== "none" ? `💰 Приз: <b>${stakeLabel(duel.stakeType, duel.stakeAmount)}</b>\n` : ``) +
        `✨ +30 XP победителю · +10 XP проигравшему`,
        { parse_mode: "HTML" },
      );
    } else {
      const nextUser = nextTurn === duel.challengerId ? challenger : challenged;
      await updateDuel(duelId, { currentTurn: nextTurn });

      await ctx.editMessageText(
        `🪶 <b>Игра перьев</b>\n\n` +
        `${cSkin.emoji} <b>${esc(challenger.owlName)}</b> vs ${cdSkin.emoji} <b>${esc(challenged.owlName)}</b>\n\n` +
        `${renderFeatherBoard(newState)}\n\n` +
        `${getSkin(currentUser.owlSkin).emoji} <b>${esc(currentUser.owlName)}</b> вытянула #${index + 1} — чистое!\n` +
        `<i>Выдохнула... ход переходит.</i>\n\n` +
        `Ход: ${getSkin(nextUser.owlSkin).emoji} <b>${esc(nextUser.owlName)}</b>`,
        { parse_mode: "HTML", reply_markup: featherKeyboard(duelId, newState) },
      );
    }
  });

  // ── tic-tac-toe ───────────────────────────────────────────────────────────────
  bot.callbackQuery(/^ttt_(\d+)_(\d+)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const index = parseInt(ctx.match![2]!);
    const duel = await getDuel(duelId);
    if (!duel || duel.state !== "active" || duel.duelType !== "tictactoe") { await ctx.answerCallbackQuery("Дуэль недействительна"); return; }
    if (ctx.from!.id !== duel.currentTurn) { await ctx.answerCallbackQuery("Сейчас не твой ход! 🦉"); return; }
    await ctx.answerCallbackQuery();

    const state = duel.gameState as unknown as TicTacToeState;
    const challenger = await getOrCreateUser(duel.challengerId);
    const challenged = await getOrCreateUser(duel.challengedId);
    const cSkin = getSkin(challenger.owlSkin);
    const cdSkin = getSkin(challenged.owlSkin);

    // Use nextTurn from the result — xPlayer/oPlayer are immutable role assignments
    const { valid, winner, draw, nextTurn, state: newState } = makeTicTacToeMove(state, ctx.from!.id, index);
    if (!valid) { await ctx.answerCallbackQuery("Это место уже занято!"); return; }

    await updateDuel(duelId, { gameState: newState as any, currentTurn: nextTurn });

    const boardText = `<code>${newState.board
      .map((c, i) => c ?? (i + 1).toString())
      .reduce((acc, v, i) => acc + v + (i % 3 === 2 && i < 8 ? "\n" : i % 3 < 2 ? " " : ""), "")}</code>`;

    if (winner) {
      const winnerUser = winner === duel.challengerId ? challenger : challenged;
      const loserId = winner === duel.challengerId ? duel.challengedId : duel.challengerId;
      await applyDuelResult(winner, loserId, duel.stakeType, duel.stakeAmount, "tictactoe");
      await updateDuel(duelId, { state: "done", winnerId: winner });

      await ctx.editMessageText(
        `🌿 <b>Крестики-нолики</b>\n` +
        `${cSkin.emoji} ${esc(challenger.owlName)} ❌ vs ⭕ ${esc(challenged.owlName)} ${cdSkin.emoji}\n\n` +
        boardText + `\n\n` +
        `🏆 <b>${esc(winnerUser.owlName)}</b> выцарапала три в ряд!\n` +
        (duel.stakeType !== "none" ? `💰 Приз: <b>${stakeLabel(duel.stakeType, duel.stakeAmount)}</b>\n` : ``) +
        `✨ +30 XP победителю · +10 XP проигравшему`,
        { parse_mode: "HTML" },
      );
    } else if (draw) {
      await updateDuel(duelId, { state: "done" });
      await ctx.editMessageText(
        `🌿 <b>Крестики-нолики</b>\n\n` + boardText + `\n\n🤝 <b>Ничья!</b> Вся кора занята.`,
        { parse_mode: "HTML" },
      );
    } else {
      const nextUser = nextTurn === duel.challengerId ? challenger : challenged;
      await ctx.editMessageText(
        `🌿 <b>Крестики-нолики</b>\n` +
        `${cSkin.emoji} ${esc(challenger.owlName)} ❌ vs ⭕ ${esc(challenged.owlName)} ${cdSkin.emoji}\n\n` +
        boardText + `\n\nХод: <b>${esc(nextUser.owlName)}</b>`,
        { parse_mode: "HTML", reply_markup: tttKeyboard(duelId, newState.board) },
      );
    }
  });

  // ── battle ────────────────────────────────────────────────────────────────────
  bot.callbackQuery(/^battle_(attack|dodge)_(\d+)$/, async (ctx) => {
    const action = ctx.match![1] as "attack" | "dodge";
    const duelId = parseInt(ctx.match![2]!);
    const duel = await getDuel(duelId);
    if (!duel || duel.state !== "active" || duel.duelType !== "battle") { await ctx.answerCallbackQuery("Дуэль недействительна"); return; }
    if (ctx.from!.id !== duel.currentTurn) { await ctx.answerCallbackQuery("Сейчас не твой ход! 🦉"); return; }
    await ctx.answerCallbackQuery();

    const state = duel.gameState as unknown as BattleState;
    const challenger = await getOrCreateUser(duel.challengerId);
    const challenged = await getOrCreateUser(duel.challengedId);
    const cSkin = getSkin(challenger.owlSkin);
    const cdSkin = getSkin(challenged.owlSkin);
    const currentUser = ctx.from!.id === duel.challengerId ? challenger : challenged;
    const actionText = action === "attack" ? "⚔️ бросается в атаку" : "🌀 пытается уклониться";

    const { result, winner, state: newState } = battleAction(state, ctx.from!.id, action);
    const nextTurn = newState.currentTurn;
    await updateDuel(duelId, { gameState: newState as any, currentTurn: nextTurn });

    const cHp = hpBar(newState.challengerHp);
    const cdHp = hpBar(newState.challengedHp);

    if (winner) {
      const winnerUser = winner === duel.challengerId ? challenger : challenged;
      const loserId = winner === duel.challengerId ? duel.challengedId : duel.challengerId;
      await applyDuelResult(winner, loserId, duel.stakeType, duel.stakeAmount, "battle");
      await updateDuel(duelId, { state: "done", winnerId: winner });

      await ctx.editMessageText(
        `⚔️ <b>Поединок завершён!</b>\n\n` +
        `${cSkin.emoji} <b>${esc(challenger.owlName)}</b> ${cHp}\n` +
        `${cdSkin.emoji} <b>${esc(challenged.owlName)}</b> ${cdHp}\n\n` +
        `${getSkin(currentUser.owlSkin).emoji} <b>${esc(currentUser.owlName)}</b> ${actionText} — ${result}\n\n` +
        `🏆 <b>${esc(winnerUser.owlName)}</b> победила!\n` +
        (duel.stakeType !== "none" ? `💰 Приз: <b>${stakeLabel(duel.stakeType, duel.stakeAmount)}</b>\n` : ``) +
        `✨ +30 XP победителю · +10 XP проигравшему`,
        { parse_mode: "HTML" },
      );
    } else {
      const nextUser = nextTurn === duel.challengerId ? challenger : challenged;
      await ctx.editMessageText(
        `⚔️ <b>Поединок</b>\n\n` +
        `${cSkin.emoji} <b>${esc(challenger.owlName)}</b> ${cHp}\n` +
        `${cdSkin.emoji} <b>${esc(challenged.owlName)}</b> ${cdHp}\n\n` +
        `${getSkin(currentUser.owlSkin).emoji} <b>${esc(currentUser.owlName)}</b> ${actionText} — ${result}\n\n` +
        `Ход: ${getSkin(nextUser.owlSkin).emoji} <b>${esc(nextUser.owlName)}</b>`,
        { parse_mode: "HTML", reply_markup: battleKeyboard(duelId) },
      );
    }
  });
}
