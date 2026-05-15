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
import { eq, ilike } from "drizzle-orm";

const WIN_COOLDOWN_MS = 3 * 60 * 1000;
const LOSE_COOLDOWN_MS = 10 * 60 * 1000;

// ── pending force-reply state ─────────────────────────────────────────────────
// When user types /duel without a target we send ForceReply and remember the msg id
const pendingDuelPrompt = new Map<number, { promptMsgId: number; chatId: number }>();

// ── helpers ───────────────────────────────────────────────────────────────────

function hpBar(hp: number) {
  return hp >= 2 ? "❤️❤️" : hp === 1 ? "❤️🖤" : "🖤🖤";
}

function stakeLabel(stakeType: string, stakeAmount: number): string {
  if (stakeType === "none") return "просто так 🤝";
  if (stakeType === "feathers") return `🪶 ${stakeAmount} фрагментов`;
  return `✨ ${stakeAmount} XP`;
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
  const winner = await getOrCreateUser(winnerId);
  const loser = await getOrCreateUser(loserId);

  if (stakeType === "feathers" && stakeAmount > 0) {
    await removeFeathers(loserId, Math.min(stakeAmount, loser.feathers));
    await addFeathers(winnerId, stakeAmount);
  } else if (stakeType === "xp" && stakeAmount > 0) {
    await addXP(winnerId, stakeAmount);
    await addXP(loserId, 5);
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
    .text("🪶 Игра перьев", `dtype_${duelId}_feather`)
    .row()
    .text("🌿 Крестики-нолики", `dtype_${duelId}_tictactoe`)
    .row()
    .text("🎲 Кубик удачи", `dtype_${duelId}_dice`)
    .row()
    .text("⚔️ Поединок", `dtype_${duelId}_battle`)
    .row()
    .text("❌ Отменить", `duel_cancel_${duelId}`);
}

function stakeKeyboard(duelId: number) {
  return new InlineKeyboard()
    .text("🪶 10 фрагментов", `dstake_${duelId}_feathers_10`)
    .text("🪶 50 фрагментов", `dstake_${duelId}_feathers_50`)
    .row()
    .text("✨ 30 XP", `dstake_${duelId}_xp_30`)
    .row()
    .text("🤝 Просто так", `dstake_${duelId}_none_0`)
    .row()
    .text("↩️ Назад", `duel_back_type_${duelId}`);
}

function acceptKeyboard(duelId: number) {
  return new InlineKeyboard()
    .text("✅ Принять вызов!", `duel_accept_${duelId}`)
    .row()
    .text("❌ Отклонить", `duel_decline_${duelId}`);
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

// ── core: create duel and show type-select to challenger ──────────────────────

async function startDuelFlow(
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
    await ctx.reply(`⚔️ Один из игроков уже в дуэли!`);
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
    `⚔️ <i>Поединок</i> — до двух ударов`,
    { parse_mode: "HTML", reply_markup: typeKeyboard(duel.id) },
  );
}

// ── main handler ──────────────────────────────────────────────────────────────

export function registerDuelHandlers(bot: Bot<Context>) {

  // ── /duel command ───────────────────────────────────────────────────────────
  bot.command(["дуэль", "duel"], async (ctx) => {
    const from = ctx.from!;

    // 1. Try reply_to_message.from
    const replyFrom = ctx.message?.reply_to_message?.from;
    if (replyFrom && !replyFrom.is_bot && replyFrom.id !== from.id) {
      pendingDuelPrompt.delete(from.id);
      await startDuelFlow(ctx, from.id, from.username, replyFrom.id, replyFrom.username, replyFrom.username ? `@${replyFrom.username}` : replyFrom.first_name);
      return;
    }

    // 2. Try @mention or text_mention in command text
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
        if (!found) {
          await ctx.reply(`❌ Игрок @${username} ещё не зарегистрирован — пусть напишет боту хотя бы раз.`);
          return;
        }
        break;
      }
      if (entity.type === "text_mention" && entity.user && entity.user.id !== from.id) {
        const u = entity.user;
        pendingDuelPrompt.delete(from.id);
        await startDuelFlow(ctx, from.id, from.username, u.id, u.username, u.username ? `@${u.username}` : u.first_name);
        return;
      }
    }

    // 3. No target found — send ForceReply prompt
    const sent = await ctx.reply(
      `⚔️ <b>Кого вызываешь на дуэль?</b>\n\nНапиши <code>@username</code> в ответ на это сообщение:`,
      {
        parse_mode: "HTML",
        reply_markup: { force_reply: true, selective: true },
      },
    );
    pendingDuelPrompt.set(from.id, { promptMsgId: sent.message_id, chatId: ctx.chat!.id });
  });

  // ── catch reply to force-reply prompt ───────────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    const from = ctx.from;
    if (!from || from.is_bot) return next();

    const pending = pendingDuelPrompt.get(from.id);
    if (!pending) return next();

    const replyToId = ctx.message.reply_to_message?.message_id;
    if (replyToId !== pending.promptMsgId) return next();

    // This message is a reply to our ForceReply prompt
    pendingDuelPrompt.delete(from.id);

    const text = ctx.message.text.trim();
    const entities = ctx.message.entities ?? [];

    // Try mention entity first
    for (const entity of entities) {
      if (entity.type === "mention") {
        const username = text.slice(entity.offset + 1, entity.offset + entity.length);
        const [found] = await db.select().from(owlUsers).where(ilike(owlUsers.username, username)).limit(1);
        if (!found) {
          await ctx.reply(`❌ Игрок @${username} ещё не зарегистрирован — пусть напишет боту хотя бы раз.\n\nПопробуй ещё: /duel`);
          return;
        }
        if (found.telegramId === from.id) {
          await ctx.reply(`🦉 Нельзя вызвать самого себя!`);
          return;
        }
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

    // Fallback: try parsing @username from raw text
    const match = text.match(/@(\w+)/);
    if (match) {
      const username = match[1]!;
      const [found] = await db.select().from(owlUsers).where(ilike(owlUsers.username, username)).limit(1);
      if (!found) {
        await ctx.reply(`❌ Игрок @${username} ещё не зарегистрирован.\n\nПопробуй ещё: /duel`);
        return;
      }
      if (found.telegramId === from.id) { await ctx.reply(`🦉 Нельзя вызвать самого себя!`); return; }
      await startDuelFlow(ctx, from.id, from.username, found.telegramId, found.username ?? undefined, `@${username}`);
      return;
    }

    await ctx.reply(`❌ Не нашла @username. Напиши, например: <code>@sam</code>\n\nЕщё раз: /duel`, { parse_mode: "HTML" });
  });

  // ── type selection (challenger only) ────────────────────────────────────────
  bot.callbackQuery(/^dtype_(\d+)_(feather|tictactoe|dice|battle)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const duelType = ctx.match![2]!;
    const duel = await getDuel(duelId);
    if (!duel || duel.state !== "challenger_type") { await ctx.answerCallbackQuery("Дуэль уже неактивна"); return; }
    if (ctx.from!.id !== duel.challengerId) { await ctx.answerCallbackQuery("Это твой выбор, не чужой!"); return; }

    await updateDuel(duelId, { duelType, state: "challenger_stake" });
    await ctx.answerCallbackQuery();

    const challenger = await getOrCreateUser(duel.challengerId);
    const challenged = await getOrCreateUser(duel.challengedId);
    const cSkin = getSkin(challenger.owlSkin);
    const cdSkin = getSkin(challenged.owlSkin);

    await ctx.editMessageText(
      `🌲 <b>${esc(challenger.owlName)}</b> ${cSkin.emoji} vs ${cdSkin.emoji} <b>${esc(challenged.owlName)}</b>\n\n` +
      `Тип: <b>${TYPE_NAMES[duelType]}</b>\n` +
      `<i>${TYPE_DESCS[duelType]}</i>\n\n` +
      `<b>На что играете?</b>`,
      { parse_mode: "HTML", reply_markup: stakeKeyboard(duelId) },
    );
  });

  // back to type
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
      `🌲 <b>${esc(challenger.owlName)}</b> ${cSkin.emoji} vs ${cdSkin.emoji} <b>${esc(challenged.owlName)}</b>\n\n` +
      `<b>Выбери тип дуэли:</b>`,
      { parse_mode: "HTML", reply_markup: typeKeyboard(duelId) },
    );
  });

  // ── stake selection → send challenge ────────────────────────────────────────
  bot.callbackQuery(/^dstake_(\d+)_(feathers|xp|none)_(\d+)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const stakeType = ctx.match![2]!;
    const stakeAmount = parseInt(ctx.match![3]!);
    const duel = await getDuel(duelId);
    if (!duel || duel.state !== "challenger_stake") { await ctx.answerCallbackQuery("Дуэль уже неактивна"); return; }
    if (ctx.from!.id !== duel.challengerId) { await ctx.answerCallbackQuery("Это не твой выбор!"); return; }

    const challenger = await getOrCreateUser(duel.challengerId);
    const challenged = await getOrCreateUser(duel.challengedId);

    if (stakeType === "feathers" && stakeAmount > 0 && challenger.feathers < stakeAmount) {
      await ctx.answerCallbackQuery({ text: `У тебя только ${challenger.feathers} фрагментов!`, show_alert: true });
      return;
    }

    await updateDuel(duelId, { stakeType, stakeAmount, state: "pending" });
    await ctx.answerCallbackQuery();

    const cSkin = getSkin(challenger.owlSkin);
    const cdSkin = getSkin(challenged.owlSkin);
    const targetMention = challenged.username ? `@${challenged.username}` : challenged.owlName;

    await ctx.editMessageText(
      `🌲 <b>Вызов на дуэль!</b>\n\n` +
      `${cSkin.emoji} <b>${esc(challenger.owlName)}</b> бросает вызов ${cdSkin.emoji} <b>${esc(challenged.owlName)}</b>!\n\n` +
      `⚔️ Тип: <b>${TYPE_NAMES[duel.duelType] ?? duel.duelType}</b>\n` +
      `<i>${TYPE_DESCS[duel.duelType] ?? ""}</i>\n\n` +
      `💰 Ставка: <b>${stakeLabel(stakeType, stakeAmount)}</b>\n\n` +
      `${targetMention}, принимаешь вызов? 🦉`,
      { parse_mode: "HTML", reply_markup: acceptKeyboard(duelId) },
    );
  });

  // ── cancel ──────────────────────────────────────────────────────────────────
  bot.callbackQuery(/^duel_cancel_(\d+)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const duel = await getDuel(duelId);
    if (!duel) { await ctx.answerCallbackQuery(); return; }
    if (ctx.from!.id !== duel.challengerId) { await ctx.answerCallbackQuery("Только вызывающий может отменить"); return; }
    await updateDuel(duelId, { state: "done" });
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`🕊️ Вызов отменён. Совы разошлись по ветвям.`);
  });

  // ── decline ─────────────────────────────────────────────────────────────────
  bot.callbackQuery(/^duel_decline_(\d+)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const duel = await getDuel(duelId);
    if (!duel) { await ctx.answerCallbackQuery(); return; }
    if (ctx.from!.id !== duel.challengedId && ctx.from!.id !== duel.challengerId) {
      await ctx.answerCallbackQuery("Это не твоё решение!"); return;
    }
    await updateDuel(duelId, { state: "done" });
    await ctx.answerCallbackQuery();
    const decliner = await getOrCreateUser(ctx.from!.id);
    await ctx.editMessageText(`🕊️ <b>${esc(decliner.owlName)}</b> отклонила вызов. Совы разошлись по ветвям.`, { parse_mode: "HTML" });
  });

  // ── accept → start game ──────────────────────────────────────────────────────
  bot.callbackQuery(/^duel_accept_(\d+)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const duel = await getDuel(duelId);
    if (!duel || duel.state !== "pending") { await ctx.answerCallbackQuery("Дуэль уже недействительна"); return; }
    if (ctx.from!.id !== duel.challengedId) { await ctx.answerCallbackQuery("Это тебя не касается!"); return; }

    const canCd = canDuel(await getOrCreateUser(duel.challengedId));
    if (!canCd.ok) { await ctx.answerCallbackQuery({ text: canCd.reason!, show_alert: true }); return; }

    await ctx.answerCallbackQuery();
    await updateDuel(duelId, { state: "active" });

    const challenger = await getOrCreateUser(duel.challengerId);
    const challenged = await getOrCreateUser(duel.challengedId);
    const cSkin = getSkin(challenger.owlSkin);
    const cdSkin = getSkin(challenged.owlSkin);
    const stakeStr = stakeLabel(duel.stakeType, duel.stakeAmount);

    if (duel.duelType === "feather") {
      const gs = initFeatherGame(duel.challengerId, duel.challengedId);
      await updateDuel(duelId, { gameState: gs as any, currentTurn: gs.currentTurn });
      const turnUser = gs.currentTurn === duel.challengerId ? challenger : challenged;

      await ctx.editMessageText(
        `🪶 <b>Игра перьев!</b>\n` +
        `<i>Пять перьев лежат на пне. Одно из них — отравлено чёрным ядом...</i>\n\n` +
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
        `🌿 <b>Крестики-нолики</b>\n` +
        `<i>Совы нашли старый дуб и начали выцарапывать знаки когтями...</i>\n\n` +
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
          `🎲 <b>Кубик удачи</b>\n` +
          `<i>Обе совы бросают шишки одновременно...</i>\n\n` +
          `${cSkin.emoji} <b>${esc(challenger.owlName)}</b>: ${d[roll1]} (${roll1})\n` +
          `${cdSkin.emoji} <b>${esc(challenged.owlName)}</b>: ${d[roll2]} (${roll2})\n\n` +
          `🤝 <b>Ничья!</b> Шишки упали одинаково — совы разошлись с честью.`,
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
        `🎲 <b>Кубик удачи</b>\n` +
        `<i>Совы бросают шишки — камень решает всё!</i>\n\n` +
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
        `⚔️ <b>Поединок!</b>\n` +
        `<i>Совы встают на ветку напротив. Когти наточены, взгляды суровы...</i>\n\n` +
        `${cSkin.emoji} <b>${esc(challenger.owlName)}</b> ${hpBar(2)} vs ${hpBar(2)} <b>${esc(challenged.owlName)}</b> ${cdSkin.emoji}\n` +
        `💰 Ставка: <b>${stakeStr}</b>\n\n` +
        `Ход: ${getSkin(turnUser.owlSkin).emoji} <b>${esc(turnUser.owlName)}</b>`,
        { parse_mode: "HTML", reply_markup: battleKeyboard(duelId) },
      );
    }
  });

  bot.callbackQuery("noop", async (ctx) => { await ctx.answerCallbackQuery(); });

  // ── feather pick ─────────────────────────────────────────────────────────────
  bot.callbackQuery(/^feather_pick_(\d+)_(\d+)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const index = parseInt(ctx.match![2]!);
    const duel = await getDuel(duelId);
    if (!duel || duel.state !== "active" || duel.duelType !== "feather") {
      await ctx.answerCallbackQuery("Дуэль недействительна"); return;
    }
    if (ctx.from!.id !== duel.currentTurn) {
      await ctx.answerCallbackQuery("Сейчас не твой ход! 🦉"); return;
    }
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
        `🪶 <b>Игра перьев</b>\n\n` +
        `${renderFeatherBoard(newState)}\n\n` +
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
        `${getSkin(currentUser.owlSkin).emoji} <b>${esc(currentUser.owlName)}</b> вытянула перо #${index + 1} — чистое!\n` +
        `<i>Выдохнула... ход переходит.</i>\n\n` +
        `Ход: ${getSkin(nextUser.owlSkin).emoji} <b>${esc(nextUser.owlName)}</b>`,
        { parse_mode: "HTML", reply_markup: featherKeyboard(duelId, newState) },
      );
    }
  });

  // ── tic-tac-toe ──────────────────────────────────────────────────────────────
  bot.callbackQuery(/^ttt_(\d+)_(\d+)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const index = parseInt(ctx.match![2]!);
    const duel = await getDuel(duelId);
    if (!duel || duel.state !== "active" || duel.duelType !== "tictactoe") {
      await ctx.answerCallbackQuery("Дуэль недействительна"); return;
    }
    if (ctx.from!.id !== duel.currentTurn) {
      await ctx.answerCallbackQuery("Сейчас не твой ход! 🦉"); return;
    }
    await ctx.answerCallbackQuery();

    const state = duel.gameState as unknown as TicTacToeState;
    const challenger = await getOrCreateUser(duel.challengerId);
    const challenged = await getOrCreateUser(duel.challengedId);
    const cSkin = getSkin(challenger.owlSkin);
    const cdSkin = getSkin(challenged.owlSkin);

    const { valid, winner, draw, state: newState } = makeTicTacToeMove(state, ctx.from!.id, index);
    if (!valid) { await ctx.answerCallbackQuery("Это место уже занято!"); return; }

    const nextTurn = ctx.from!.id === newState.xPlayer ? newState.oPlayer : newState.xPlayer;
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
        `<i>Победные царапины навсегда останутся на коре дуба...</i>\n` +
        (duel.stakeType !== "none" ? `💰 Приз: <b>${stakeLabel(duel.stakeType, duel.stakeAmount)}</b>\n` : ``) +
        `✨ +30 XP победителю · +10 XP проигравшему`,
        { parse_mode: "HTML" },
      );
    } else if (draw) {
      await updateDuel(duelId, { state: "done" });
      await ctx.editMessageText(
        `🌿 <b>Крестики-нолики</b>\n\n` + boardText + `\n\n` +
        `🤝 <b>Ничья!</b> Вся кора занята — ни одна сова не победила.`,
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

  // ── battle ───────────────────────────────────────────────────────────────────
  bot.callbackQuery(/^battle_(attack|dodge)_(\d+)$/, async (ctx) => {
    const action = ctx.match![1] as "attack" | "dodge";
    const duelId = parseInt(ctx.match![2]!);
    const duel = await getDuel(duelId);
    if (!duel || duel.state !== "active" || duel.duelType !== "battle") {
      await ctx.answerCallbackQuery("Дуэль недействительна"); return;
    }
    if (ctx.from!.id !== duel.currentTurn) {
      await ctx.answerCallbackQuery("Сейчас не твой ход! 🦉"); return;
    }
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
        `🏆 <b>${esc(winnerUser.owlName)}</b> победила в поединке!\n` +
        `<i>Победный клич разнёсся по лесу...</i>\n` +
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
