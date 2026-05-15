import { Bot } from "grammy";
import type { Context } from "grammy";
import {
  getOrCreateUser,
  updateUser,
  addCard,
  upsertQuestProgress,
  addXP,
} from "../dbHelpers.js";
import { esc, getSkin } from "../format.js";
import { CARDS, OWL_RESPONSES, QUESTS } from "../data.js";
import { db } from "@workspace/db";
import { owlUsers } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const BASE_CARD_CHANCE = 0.012;
const ACTIVITY_BOOST_PER_STREAK = 0.003;

export function registerMessageHandler(bot: Bot<Context>) {
  bot.on("message:text", async (ctx) => {
    if (!ctx.from || ctx.from.is_bot) return;
    const text = ctx.message.text;

    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);

    // Update message count and streak
    const now = Date.now();
    const lastMsg = user.lastMessageAt ? new Date(user.lastMessageAt).getTime() : 0;
    const hoursSinceLast = (now - lastMsg) / (1000 * 60 * 60);
    let newStreak = user.activeStreak;
    if (hoursSinceLast < 2) {
      newStreak = Math.min(newStreak + 1, 50);
    } else if (hoursSinceLast > 24) {
      newStreak = 0;
    }

    await db
      .update(owlUsers)
      .set({
        messageCount: sql`${owlUsers.messageCount} + 1`,
        lastMessageAt: new Date(),
        activeStreak: newStreak,
      })
      .where(eq(owlUsers.telegramId, ctx.from.id));

    // Quest: send messages
    const msgQuestIds = ["l14_messages_50", "l26_messages_200", "l34_messages_500", "l43_messages_1000"];
    for (const qid of msgQuestIds) {
      const q = QUESTS.find((x) => x.id === qid);
      if (q) await upsertQuestProgress(ctx.from.id, qid, q.target, 1);
    }

    // Owl name detection — respond if own owl name mentioned
    const owlName = user.owlName.toLowerCase();
    const textLower = text.toLowerCase();
    if (
      owlName.length > 2 &&
      textLower.includes(owlName) &&
      Math.random() < 0.7
    ) {
      const response = OWL_RESPONSES[Math.floor(Math.random() * OWL_RESPONSES.length)]!;
      const skin = getSkin(user.owlSkin);
      await ctx.reply(
        `${skin.emoji} <b>${esc(user.owlName)}</b>: ${response}`,
        { parse_mode: "HTML" },
      );
    }

    // Default name "Полло" / "Pöllö" also triggers
    if (
      (textLower.includes("полло") || textLower.includes("pöllö") || textLower.includes("поллo")) &&
      user.owlName.toLowerCase() !== "полло" &&
      Math.random() < 0.5
    ) {
      const response = OWL_RESPONSES[Math.floor(Math.random() * OWL_RESPONSES.length)]!;
      const skin = getSkin(user.owlSkin);
      await ctx.reply(
        `${skin.emoji} <b>${esc(user.owlName)}</b>: ${response}`,
        { parse_mode: "HTML" },
      );
    }

    // Card drop check
    const cardChance = BASE_CARD_CHANCE + newStreak * ACTIVITY_BOOST_PER_STREAK;
    if (Math.random() < cardChance) {
      // Random card, weighted by rarity
      const rarityRoll = Math.random();
      let allowedRarities: string[];
      if (rarityRoll < 0.6) {
        allowedRarities = ["common"];
      } else if (rarityRoll < 0.85) {
        allowedRarities = ["rare"];
      } else if (rarityRoll < 0.97) {
        allowedRarities = ["epic"];
      } else {
        allowedRarities = ["legendary"];
      }

      const eligibleCards = CARDS.filter((c) => allowedRarities.includes(c.rarity));
      const card = eligibleCards[Math.floor(Math.random() * eligibleCards.length)]!;

      await addCard(ctx.from.id, card.id);

      // Quest progress for cards
      const cardQuestIds = ["l17_cards_5", "l23_cards_10", "l30_cards_20", "l37_cards_30", "l47_cards_50"];
      for (const qid of cardQuestIds) {
        const q = QUESTS.find((x) => x.id === qid);
        if (q) await upsertQuestProgress(ctx.from.id, qid, q.target, 1);
      }

      const rarityLabels: Record<string, string> = {
        common: "⚪ Обычная",
        rare: "🔵 Редкая",
        epic: "🟣 Эпическая",
        legendary: "🟡 Легендарная",
      };

      const skin = getSkin(user.owlSkin);
      await ctx.reply(
        `🃏 <b>Новая карточка!</b>\n\n` +
          `${card.emoji} <b>${esc(card.name)}</b>\n` +
          `${rarityLabels[card.rarity] ?? "⚪ Обычная"}\n\n` +
          `<code>${card.art.trim()}</code>\n\n` +
          `<i>${esc(card.description)}</i>\n\n` +
          `<i>${skin.emoji} ${esc(user.owlName)} нашла карточку!</i>`,
        { parse_mode: "HTML" },
      );
    }
  });
}
