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
import {
  esc,
  getSkin,
  canDuel,
  formatDuration,
} from "../format.js";
import {
  initFeatherGame,
  pickFeather,
  renderFeatherBoard,
  initTicTacToe,
  makeTicTacToeMove,
  renderTicTacToe,
  initBattle,
  battleAction,
  type FeatherGameState,
  type TicTacToeState,
  type BattleState,
} from "../games.js";
import { QUESTS } from "../data.js";

const WIN_COOLDOWN_MS = 3 * 60 * 1000;
const LOSE_COOLDOWN_MS = 10 * 60 * 1000;

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
    const transferXp = Math.min(stakeAmount, 20);
    await addXP(winnerId, stakeAmount + 20);
    await addXP(loserId, 5);
  }

  const xpWin = 30;
  const xpLose = 10;
  await addXP(winnerId, xpWin);
  await addXP(loserId, xpLose);

  await updateUser(winnerId, {
    duelWinCooldown: new Date(Date.now() + WIN_COOLDOWN_MS),
    totalDuelsWon: winner.totalDuelsWon + 1,
  });
  await updateUser(loserId, {
    duelLoseCooldown: new Date(Date.now() + LOSE_COOLDOWN_MS),
    totalDuelsLost: loser.totalDuelsLost + 1,
  });

  // Quest progress
  const winQuestIds = ["l9_win_3duels", "l15_win_5duels", "l21_win_10duels", "l28_win_20duels", "l35_win_30duels", "l40_win_50duels", "l44_win_70duels", "l49_win_100duels"];
  for (const qid of winQuestIds) {
    const q = QUESTS.find((x) => x.id === qid);
    if (q) await upsertQuestProgress(winnerId, qid, q.target, 1);
  }

  if (duelType === "feather") {
    const q = QUESTS.find((x) => x.id === "l6_feather_duel");
    if (q) await upsertQuestProgress(winnerId, "l6_feather_duel", q.target, 1);
    const q25 = QUESTS.find((x) => x.id === "l25_feather_duel_5");
    if (q25) await upsertQuestProgress(winnerId, "l25_feather_duel_5", q25.target, 1);
  }
  if (duelType === "battle") {
    const q = QUESTS.find((x) => x.id === "l7_battle_duel");
    if (q) await upsertQuestProgress(winnerId, "l7_battle_duel", q.target, 1);
    const q3 = QUESTS.find((x) => x.id === "l18_battle_3");
    if (q3) await upsertQuestProgress(winnerId, "l18_battle_3", q3.target, 1);
    const q10 = QUESTS.find((x) => x.id === "l31_battle_10");
    if (q10) await upsertQuestProgress(winnerId, "l31_battle_10", q10.target, 1);
    const q30 = QUESTS.find((x) => x.id === "l46_battle_30");
    if (q30) await upsertQuestProgress(winnerId, "l46_battle_30", q30.target, 1);
  }
  if (duelType === "tictactoe") {
    const q = QUESTS.find((x) => x.id === "l11_tictactoe");
    if (q) await upsertQuestProgress(winnerId, "l11_tictactoe", q.target, 1);
    const q10 = QUESTS.find((x) => x.id === "l38_tictactoe_10");
    if (q10) await upsertQuestProgress(winnerId, "l38_tictactoe_10", q10.target, 1);
  }
}

function featherGameKeyboard(duelId: number, state: FeatherGameState): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let i = 0; i < 5; i++) {
    if (!state.picked.includes(i)) {
      kb.text(`🪶 ${i + 1}`, `feather_pick_${duelId}_${i}`);
    } else {
      kb.text(`✂️`, `noop`);
    }
  }
  return kb;
}

function tttKeyboard(duelId: number, board: (string | null)[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  const symbols = ["🌿", "🌿", "🌿", "🌿", "🌿", "🌿", "🌿", "🌿", "🌿"];
  for (let i = 0; i < 9; i++) {
    kb.text(board[i] ?? symbols[i]!, board[i] ? "noop" : `ttt_${duelId}_${i}`);
    if (i === 2 || i === 5) kb.row();
  }
  return kb;
}

function battleKeyboard(duelId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("⚔️ Ударить", `battle_attack_${duelId}`)
    .text("🌀 Уклониться", `battle_dodge_${duelId}`);
}

export function registerDuelHandlers(bot: Bot<Context>) {
  bot.command(["дуэль", "duel"], async (ctx) => {  // "duel" already English
    const mention = ctx.message?.reply_to_message?.from;
    if (!mention) {
      await ctx.reply(
        `⚔️ Ответь на сообщение игрока командой <code>/дуэль</code> для вызова!`,
        { parse_mode: "HTML" },
      );
      return;
    }
    if (mention.id === ctx.from!.id) {
      await ctx.reply(`🦉 Нельзя вызвать на дуэль самого себя!`);
      return;
    }
    if (mention.is_bot) {
      await ctx.reply(`🤖 Боты не дерутся!`);
      return;
    }

    const challenger = await getOrCreateUser(ctx.from!.id, ctx.from!.username);
    const challenged = await getOrCreateUser(mention.id, mention.username);

    const canC = canDuel(challenger);
    if (!canC.ok) {
      await ctx.reply(`❌ ${canC.reason}`, { parse_mode: "HTML" });
      return;
    }
    const canCd = canDuel(challenged);
    if (!canCd.ok) {
      const targetName = mention.username ? `@${mention.username}` : mention.first_name;
      await ctx.reply(`❌ ${targetName}: ${canCd.reason}`, { parse_mode: "HTML" });
      return;
    }

    const existingC = await getActiveDuel(ctx.from!.id);
    const existingCd = await getActiveDuel(mention.id);
    if (existingC || existingCd) {
      await ctx.reply(`⚔️ Один из игроков уже в дуэли!`);
      return;
    }

    const duel = await createDuel(ctx.from!.id, mention.id, ctx.chat!.id);
    const cSkin = getSkin(challenger.owlSkin);
    const cdSkin = getSkin(challenged.owlSkin);
    const targetName = mention.username ? `@${mention.username}` : mention.first_name;

    const keyboard = new InlineKeyboard()
      .text("⚔️ Принять вызов!", `duel_accept_${duel.id}`)
      .row()
      .text("❌ Отказаться", `duel_decline_${duel.id}`);

    await ctx.reply(
      `🌲 <b>Вызов на дуэль!</b>\n\n` +
        `${cSkin.emoji} <b>${esc(challenger.owlName)}</b> вызывает ${cdSkin.emoji} <b>${esc(challenged.owlName)}</b> на поединок!\n\n` +
        `<i>Совы расправили крылья и смотрят друг другу в глаза...</i>\n\n` +
        `${targetName}, принимаешь вызов?`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  bot.callbackQuery(/^duel_accept_(\d+)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const duel = await getDuel(duelId);
    if (!duel || duel.state !== "pending") {
      await ctx.answerCallbackQuery("Дуэль уже недействительна");
      return;
    }
    if (ctx.from!.id !== duel.challengedId) {
      await ctx.answerCallbackQuery("Это не тебе!");
      return;
    }
    await ctx.answerCallbackQuery();
    await updateDuel(duelId, { state: "type_select" });

    const keyboard = new InlineKeyboard()
      .text("🪶 Игра перьев", `dtype_${duelId}_feather`)
      .row()
      .text("🌿 Крестики-нолики", `dtype_${duelId}_tictactoe`)
      .row()
      .text("🎲 Удача кубика", `dtype_${duelId}_dice`)
      .row()
      .text("⚔️ Поединок", `dtype_${duelId}_battle`);

    await ctx.editMessageText(
      `⚔️ <b>Дуэль принята!</b>\n\nВыберите тип поединка:\n\n` +
        `🪶 <b>Игра перьев</b> — выбирай перо, одно отравлено\n` +
        `🌿 <b>Крестики-нолики</b> — классика на коре дерева\n` +
        `🎲 <b>Удача кубика</b> — кто выше бросит\n` +
        `⚔️ <b>Поединок</b> — бой до двух ударов`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  bot.callbackQuery(/^duel_decline_(\d+)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const duel = await getDuel(duelId);
    if (!duel) { await ctx.answerCallbackQuery(); return; }
    if (ctx.from!.id !== duel.challengedId && ctx.from!.id !== duel.challengerId) {
      await ctx.answerCallbackQuery("Это не твоё решение!"); return;
    }
    await updateDuel(duelId, { state: "done" });
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`🕊️ Дуэль отменена. Совы разошлись по ветвям.`);
  });

  bot.callbackQuery("noop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // Duel type selection
  bot.callbackQuery(/^dtype_(\d+)_(feather|tictactoe|dice|battle)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const duelType = ctx.match![2]!;
    const duel = await getDuel(duelId);
    if (!duel || duel.state !== "type_select") {
      await ctx.answerCallbackQuery("Дуэль недействительна"); return;
    }
    if (ctx.from!.id !== duel.challengerId && ctx.from!.id !== duel.challengedId) {
      await ctx.answerCallbackQuery("Это не твоя дуэль!"); return;
    }
    await ctx.answerCallbackQuery();
    await updateDuel(duelId, { duelType, state: "stake_select" });

    const typeNames: Record<string, string> = {
      feather: "🪶 Игра перьев",
      tictactoe: "🌿 Крестики-нолики",
      dice: "🎲 Удача кубика",
      battle: "⚔️ Поединок",
    };
    const challenger = await getOrCreateUser(duel.challengerId);
    const challenged = await getOrCreateUser(duel.challengedId);

    const keyboard = new InlineKeyboard()
      .text(`🪶 10 фрагментов`, `dstake_${duelId}_feathers_10`)
      .text(`🪶 50 фрагментов`, `dstake_${duelId}_feathers_50`)
      .row()
      .text(`✨ XP`, `dstake_${duelId}_xp_50`)
      .text(`🤝 Без ставки`, `dstake_${duelId}_none_0`);

    await ctx.editMessageText(
      `⚔️ <b>${typeNames[duelType]}</b>\n\n` +
        `${getSkin(challenger.owlSkin).emoji} <b>${esc(challenger.owlName)}</b> vs ` +
        `${getSkin(challenged.owlSkin).emoji} <b>${esc(challenged.owlName)}</b>\n\n` +
        `На что играем?`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  // Stake selection
  bot.callbackQuery(/^dstake_(\d+)_(feathers|xp|none)_(\d+)$/, async (ctx) => {
    const duelId = parseInt(ctx.match![1]!);
    const stakeType = ctx.match![2]!;
    const stakeAmount = parseInt(ctx.match![3]!);
    const duel = await getDuel(duelId);
    if (!duel || duel.state !== "stake_select") {
      await ctx.answerCallbackQuery("Дуэль недействительна"); return;
    }
    if (ctx.from!.id !== duel.challengerId && ctx.from!.id !== duel.challengedId) {
      await ctx.answerCallbackQuery("Это не твоя дуэль!"); return;
    }
    await ctx.answerCallbackQuery();

    const challenger = await getOrCreateUser(duel.challengerId);
    const challenged = await getOrCreateUser(duel.challengedId);

    // Check feathers
    if (stakeType === "feathers") {
      if (challenger.feathers < stakeAmount) {
        await ctx.answerCallbackQuery({ text: `У ${challenger.owlName} не хватает фрагментов!`, show_alert: true });
        return;
      }
      if (challenged.feathers < stakeAmount) {
        await ctx.answerCallbackQuery({ text: `У ${challenged.owlName} не хватает фрагментов!`, show_alert: true });
        return;
      }
    }

    await updateDuel(duelId, { stakeType, stakeAmount, state: "active" });

    const cSkin = getSkin(challenger.owlSkin);
    const cdSkin = getSkin(challenged.owlSkin);
    const stakeStr = stakeType === "none" ? "без ставки" : stakeType === "feathers" ? `${stakeAmount} 🪶` : `${stakeAmount} XP`;

    // Start the game
    if (duel.duelType === "feather") {
      const gameState = initFeatherGame(duel.challengerId, duel.challengedId);
      await updateDuel(duelId, {
        gameState: gameState as unknown as Record<string, unknown>,
        currentTurn: gameState.currentTurn,
      });
      const currentUser = gameState.currentTurn === duel.challengerId ? challenger : challenged;
      const kb = featherGameKeyboard(duelId, gameState);

      await ctx.editMessageText(
        `🪶 <b>Игра перьев!</b>\n` +
          `<i>Перед вами 5 перьев. Одно — отравлено...</i>\n\n` +
          `${cSkin.emoji} <b>${esc(challenger.owlName)}</b> vs ${cdSkin.emoji} <b>${esc(challenged.owlName)}</b>\n` +
          `Ставка: <b>${stakeStr}</b>\n\n` +
          `${renderFeatherBoard(gameState)}\n\n` +
          `Ход: ${getSkin(currentUser.owlSkin).emoji} <b>${esc(currentUser.owlName)}</b>`,
        { parse_mode: "HTML", reply_markup: kb },
      );

    } else if (duel.duelType === "tictactoe") {
      const gameState = initTicTacToe(duel.challengerId, duel.challengedId);
      await updateDuel(duelId, {
        gameState: gameState as unknown as Record<string, unknown>,
        currentTurn: gameState.xPlayer,
      });
      const currentUser = gameState.xPlayer === duel.challengerId ? challenger : challenged;
      const kb = tttKeyboard(duelId, gameState.board);

      await ctx.editMessageText(
        `🌿 <b>Крестики-нолики</b>\n` +
          `<i>Совы выцарапывают знаки на коре старого дуба...</i>\n\n` +
          `${cSkin.emoji} <b>${esc(challenger.owlName)}</b> (❌) vs ${cdSkin.emoji} <b>${esc(challenged.owlName)}</b> (⭕)\n` +
          `Ставка: <b>${stakeStr}</b>\n\n` +
          `Ход: ${getSkin(currentUser.owlSkin).emoji} <b>${esc(currentUser.owlName)}</b>`,
        { parse_mode: "HTML", reply_markup: kb },
      );

    } else if (duel.duelType === "dice") {
      // Dice is instant
      const roll1 = Math.floor(Math.random() * 6) + 1;
      const roll2 = Math.floor(Math.random() * 6) + 1;
      const diceEmoji: Record<number, string> = { 1: "⚀", 2: "⚁", 3: "⚂", 4: "⚃", 5: "⚄", 6: "⚅" };

      let winnerId: number;
      let loserId: number;
      let resultText: string;

      if (roll1 > roll2) {
        winnerId = duel.challengerId;
        loserId = duel.challengedId;
        resultText = `🎉 <b>${esc(challenger.owlName)}</b> побеждает!`;
      } else if (roll2 > roll1) {
        winnerId = duel.challengedId;
        loserId = duel.challengerId;
        resultText = `🎉 <b>${esc(challenged.owlName)}</b> побеждает!`;
      } else {
        // Tie — no winner
        await updateDuel(duelId, { state: "done" });
        await ctx.editMessageText(
          `🎲 <b>Удача кубика</b>\n\n` +
            `${cSkin.emoji} <b>${esc(challenger.owlName)}</b>: ${diceEmoji[roll1]} (${roll1})\n` +
            `${cdSkin.emoji} <b>${esc(challenged.owlName)}</b>: ${diceEmoji[roll2]} (${roll2})\n\n` +
            `🤝 Ничья! Совы расходятся, похлопав крыльями.`,
          { parse_mode: "HTML" },
        );
        return;
      }

      const winnerUser = winnerId === duel.challengerId ? challenger : challenged;
      const loserUser = loserId === duel.challengerId ? challenger : challenged;
      await applyDuelResult(winnerId, loserId, stakeType, stakeAmount, "dice");
      await updateDuel(duelId, { state: "done", winnerId });

      await ctx.editMessageText(
        `🎲 <b>Удача кубика</b>\n\n` +
          `${cSkin.emoji} <b>${esc(challenger.owlName)}</b>: ${diceEmoji[roll1]!} (${roll1})\n` +
          `${cdSkin.emoji} <b>${esc(challenged.owlName)}</b>: ${diceEmoji[roll2]!} (${roll2})\n\n` +
          `${resultText}\n` +
          (stakeType !== "none" ? `🏆 Выигрыш: <b>${stakeStr}</b>\n` : "") +
          `✨ +30 XP победителю · +10 XP проигравшему`,
        { parse_mode: "HTML" },
      );

    } else if (duel.duelType === "battle") {
      const gameState = initBattle(duel.challengerId, duel.challengedId);
      await updateDuel(duelId, {
        gameState: gameState as unknown as Record<string, unknown>,
        currentTurn: gameState.currentTurn,
      });
      const currentUser = gameState.currentTurn === duel.challengerId ? challenger : challenged;
      const kb = battleKeyboard(duelId);

      await ctx.editMessageText(
        `⚔️ <b>Поединок!</b>\n` +
          `<i>Совы выходят на ветку — морды суровые, когти наточены...</i>\n\n` +
          `${cSkin.emoji} <b>${esc(challenger.owlName)}</b> ❤️❤️ vs ${cdSkin.emoji} <b>${esc(challenged.owlName)}</b> ❤️❤️\n` +
          `Ставка: <b>${stakeStr}</b>\n\n` +
          `Ход: ${getSkin(currentUser.owlSkin).emoji} <b>${esc(currentUser.owlName)}</b>`,
        { parse_mode: "HTML", reply_markup: kb },
      );
    }
  });

  // Feather pick
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

    await updateDuel(duelId, {
      gameState: newState as unknown as Record<string, unknown>,
    });

    if (poisoned) {
      const winnerId = loser === duel.challengerId ? duel.challengedId : duel.challengerId;
      const loserUser = loser === duel.challengerId ? challenger : challenged;
      const winnerUser = winnerId === duel.challengerId ? challenger : challenged;

      await applyDuelResult(winnerId, loser, duel.stakeType, duel.stakeAmount, "feather");
      await updateDuel(duelId, { state: "done", winnerId });
      const stakeStr = duel.stakeType === "none" ? "" : duel.stakeType === "feathers" ? `🪶 ${duel.stakeAmount}` : `✨ ${duel.stakeAmount} XP`;

      await ctx.editMessageText(
        `🪶 <b>Игра перьев</b>\n\n` +
          `${renderFeatherBoard(newState)}\n\n` +
          `☠️ <b>${esc(loserUser.owlName)}</b> выбрала отравленное перо ${index + 1}!\n\n` +
          `🎉 <b>${esc(winnerUser.owlName)}</b> побеждает!\n` +
          (stakeStr ? `🏆 ${stakeStr}\n` : "") +
          `✨ +30 XP победителю · +10 XP проигравшему`,
        { parse_mode: "HTML" },
      );
    } else {
      const nextUser = nextTurn === duel.challengerId ? challenger : challenged;
      await updateDuel(duelId, { currentTurn: nextTurn });
      const kb = featherGameKeyboard(duelId, newState);

      await ctx.editMessageText(
        `🪶 <b>Игра перьев</b>\n\n` +
          `${cSkin.emoji} <b>${esc(challenger.owlName)}</b> vs ${cdSkin.emoji} <b>${esc(challenged.owlName)}</b>\n\n` +
          `${renderFeatherBoard(newState)}\n\n` +
          `${getSkin(currentUser.owlSkin).emoji} <b>${esc(currentUser.owlName)}</b> выбрала перо ${index + 1} — не отравленное!\n\n` +
          `Ход: ${getSkin(nextUser.owlSkin).emoji} <b>${esc(nextUser.owlName)}</b>`,
        { parse_mode: "HTML", reply_markup: kb },
      );
    }
  });

  // Tic-tac-toe move
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
    if (!valid) { await ctx.answerCallbackQuery("Это место занято!"); return; }

    const nextTurn = ctx.from!.id === newState.xPlayer ? newState.oPlayer : newState.xPlayer;
    await updateDuel(duelId, {
      gameState: newState as unknown as Record<string, unknown>,
      currentTurn: nextTurn,
    });

    const stakeStr = duel.stakeType === "none" ? "" : duel.stakeType === "feathers" ? `🪶 ${duel.stakeAmount}` : `✨ ${duel.stakeAmount} XP`;
    const boardText = `<code>${newState.board.map((c, i) => {
      const s = c ?? (i + 1).toString();
      return s;
    }).reduce((acc, val, i) => acc + val + (i % 3 === 2 && i < 8 ? "\n" : i % 3 < 2 ? " " : ""), "")}</code>`;

    if (winner) {
      const winnerUser = winner === duel.challengerId ? challenger : challenged;
      const loserId = winner === duel.challengerId ? duel.challengedId : duel.challengerId;
      await applyDuelResult(winner, loserId, duel.stakeType, duel.stakeAmount, "tictactoe");
      await updateDuel(duelId, { state: "done", winnerId: winner });

      await ctx.editMessageText(
        `🌿 <b>Крестики-нолики</b>\n\n` +
          `${cSkin.emoji} ${esc(challenger.owlName)} (❌) vs ${cdSkin.emoji} ${esc(challenged.owlName)} (⭕)\n\n` +
          boardText + `\n\n` +
          `🎉 <b>${esc(winnerUser.owlName)}</b> выцарапала три в ряд!\n` +
          (stakeStr ? `🏆 ${stakeStr}\n` : "") +
          `✨ +30 XP победителю · +10 XP проигравшему`,
        { parse_mode: "HTML" },
      );
    } else if (draw) {
      await updateDuel(duelId, { state: "done" });
      await ctx.editMessageText(
        `🌿 <b>Крестики-нолики</b>\n\n` +
          boardText + `\n\n` +
          `🤝 Ничья! Все клетки заняты, победителя нет.`,
        { parse_mode: "HTML" },
      );
    } else {
      const nextUser = nextTurn === duel.challengerId ? challenger : challenged;
      const kb = tttKeyboard(duelId, newState.board);
      await ctx.editMessageText(
        `🌿 <b>Крестики-нолики</b>\n\n` +
          `${cSkin.emoji} ${esc(challenger.owlName)} (❌) vs ${cdSkin.emoji} ${esc(challenged.owlName)} (⭕)\n\n` +
          boardText + `\n\n` +
          `Ход: ${getSkin(nextUser.owlSkin).emoji} <b>${esc(nextUser.owlName)}</b>`,
        { parse_mode: "HTML", reply_markup: kb },
      );
    }
  });

  // Battle actions
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

    const { result, winner, state: newState } = battleAction(state, ctx.from!.id, action);
    const nextTurn = newState.currentTurn;

    await updateDuel(duelId, {
      gameState: newState as unknown as Record<string, unknown>,
      currentTurn: nextTurn,
    });

    const hpBar = (hp: number) => hp >= 2 ? "❤️❤️" : hp === 1 ? "❤️🖤" : "🖤🖤";
    const cHp = hpBar(newState.challengerHp);
    const cdHp = hpBar(newState.challengedHp);
    const stakeStr = duel.stakeType === "none" ? "" : duel.stakeType === "feathers" ? `🪶 ${duel.stakeAmount}` : `✨ ${duel.stakeAmount} XP`;
    const currentUser = ctx.from!.id === duel.challengerId ? challenger : challenged;
    const actionText = action === "attack" ? "⚔️ атаковала" : "🌀 попыталась уклониться";

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
          (stakeStr ? `🎁 Приз: <b>${stakeStr}</b>\n` : "") +
          `✨ +30 XP победителю · +10 XP проигравшему`,
        { parse_mode: "HTML" },
      );
    } else {
      const nextUser = nextTurn === duel.challengerId ? challenger : challenged;
      const kb = battleKeyboard(duelId);
      await ctx.editMessageText(
        `⚔️ <b>Поединок</b>\n\n` +
          `${cSkin.emoji} <b>${esc(challenger.owlName)}</b> ${cHp}\n` +
          `${cdSkin.emoji} <b>${esc(challenged.owlName)}</b> ${cdHp}\n\n` +
          `${getSkin(currentUser.owlSkin).emoji} <b>${esc(currentUser.owlName)}</b> ${actionText} — ${result}\n\n` +
          `Ход: ${getSkin(nextUser.owlSkin).emoji} <b>${esc(nextUser.owlName)}</b>`,
        { parse_mode: "HTML", reply_markup: kb },
      );
    }
  });
}
