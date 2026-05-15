import { Bot } from "grammy";
import type { Context } from "grammy";
import { getOrCreateUser, getAllUserQuests, addXP } from "../dbHelpers.js";
import { esc, getLevelXP } from "../format.js";
import { QUESTS } from "../data.js";

export function registerQuestHandlers(bot: Bot<Context>) {
  bot.command(["задания", "zadaniya", "quests"], async (ctx) => {
    const user = await getOrCreateUser(ctx.from!.id, ctx.from!.username);

    if (user.level < 5) {
      await ctx.reply(
        `📜 <b>Задания</b>\n\nЗадания открываются с <b>уровня 6</b>!\n\nТы на уровне <b>${user.level}</b> — продолжай кормить, поить и устраивать дуэли!`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const userQuests = await getAllUserQuests(ctx.from!.id);
    const questMap = new Map(userQuests.map((q) => [q.questId, q]));

    // Determine current required quests (for current level + 1)
    const nextLevel = user.level + 1;
    if (nextLevel > 50) {
      await ctx.reply(
        `🏆 <b>Максимальный уровень достигнут!</b>\n\nТы достигла вершины — уровень <b>50</b>!`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const lines: string[] = [
      `📜 <b>Задания для уровня ${nextLevel}</b>\n`,
      `Текущий уровень: <b>${user.level}</b>\n`,
    ];

    const questsForNext = QUESTS.filter((q) => q.forLevel === nextLevel);

    if (questsForNext.length === 0) {
      // Only XP needed
      const xpNeeded = getLevelXP(nextLevel) - user.xp;
      lines.push(
        `✨ Нужно набрать ещё <b>${xpNeeded} XP</b> для следующего уровня.`,
      );
    } else {
      lines.push(`Выполни задания для повышения уровня:\n`);
      for (const quest of questsForNext) {
        const progress = questMap.get(quest.id);
        const done = progress?.completed ?? false;
        const current = progress?.progress ?? 0;
        const icon = done ? "✅" : "📌";
        lines.push(
          `${icon} <b>${esc(quest.description)}</b>\n` +
            `   Прогресс: ${current}/${quest.target}`,
        );
      }

      const allDone = questsForNext.every((q) => questMap.get(q.id)?.completed);
      if (allDone) {
        const xpNeeded = getLevelXP(nextLevel) - user.xp;
        if (xpNeeded > 0) {
          lines.push(`\n✅ Все задания выполнены!\nОсталось набрать ещё <b>${xpNeeded} XP</b>.`);
        } else {
          lines.push(`\n🎉 Всё выполнено! Уровень повысится автоматически.`);
        }
      }
    }

    // Show all previous incomplete quests (backlog)
    const allIncomplete = QUESTS.filter((q) => {
      if (q.forLevel >= nextLevel) return false;
      const p = questMap.get(q.id);
      return !p?.completed;
    });

    if (allIncomplete.length > 0) {
      lines.push(`\n<b>Незавершённые задания:</b>`);
      for (const quest of allIncomplete.slice(0, 5)) {
        const progress = questMap.get(quest.id);
        const current = progress?.progress ?? 0;
        lines.push(
          `📌 <b>${esc(quest.description)}</b> (${current}/${quest.target})`,
        );
      }
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });
}
