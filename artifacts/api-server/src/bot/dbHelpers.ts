import { db } from "@workspace/db";
import {
  owlUsers,
  owlCards,
  owlFamilies,
  owlFamilyInvites,
  owlDuels,
  owlQuests,
  type OwlUser,
  type OwlFamily,
} from "@workspace/db";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { getLevelXP } from "./format.js";
import { QUESTS } from "./data.js";

export async function getOrCreateUser(
  telegramId: number,
  username?: string,
): Promise<OwlUser> {
  const existing = await db
    .select()
    .from(owlUsers)
    .where(eq(owlUsers.telegramId, telegramId))
    .limit(1);
  if (existing[0]) {
    if (username && existing[0].username !== username) {
      await db
        .update(owlUsers)
        .set({ username })
        .where(eq(owlUsers.telegramId, telegramId));
      return { ...existing[0], username };
    }
    return existing[0];
  }
  const [newUser] = await db
    .insert(owlUsers)
    .values({ telegramId, username })
    .returning();
  return newUser!;
}

export async function updateUser(
  telegramId: number,
  data: Partial<typeof owlUsers.$inferInsert>,
) {
  await db.update(owlUsers).set(data).where(eq(owlUsers.telegramId, telegramId));
}

function featherRewardForLevel(level: number): number {
  if (level <= 8) return Math.floor(Math.random() * 10) + 1;
  if (level <= 20) return Math.floor(Math.random() * 26) + 5;
  if (level <= 35) return Math.floor(Math.random() * 66) + 15;
  return Math.floor(Math.random() * 181) + 50;
}

export async function addXP(
  telegramId: number,
  amount: number,
): Promise<{ leveledUp: boolean; newLevel: number; featherReward: number }> {
  const user = await getOrCreateUser(telegramId);
  if (user.level >= 50) return { leveledUp: false, newLevel: 50, featherReward: 0 };

  const newXp = user.xp + amount;
  const nextLevelXp = getLevelXP(user.level + 1);
  const questsForNextLevel = QUESTS.filter((q) => q.forLevel === user.level + 1);
  const allQuestsDone =
    questsForNextLevel.length === 0 ||
    questsForNextLevel.every((q) => user.questsCompleted.includes(q.id));

  let newLevel = user.level;
  if (newXp >= nextLevelXp && allQuestsDone && user.level < 50) {
    newLevel = user.level + 1;
  }

  await db
    .update(owlUsers)
    .set({ xp: newXp, level: newLevel })
    .where(eq(owlUsers.telegramId, telegramId));

  if (newLevel > user.level) {
    const reward = featherRewardForLevel(newLevel);
    await addFeathers(telegramId, reward);
    return { leveledUp: true, newLevel, featherReward: reward };
  }

  return { leveledUp: false, newLevel, featherReward: 0 };
}

export async function addFeathers(telegramId: number, amount: number) {
  await db
    .update(owlUsers)
    .set({ feathers: sql`${owlUsers.feathers} + ${amount}` })
    .where(eq(owlUsers.telegramId, telegramId));
}

export async function removeFeathers(
  telegramId: number,
  amount: number,
): Promise<boolean> {
  const user = await getOrCreateUser(telegramId);
  if (user.feathers < amount) return false;
  await db
    .update(owlUsers)
    .set({ feathers: sql`${owlUsers.feathers} - ${amount}` })
    .where(eq(owlUsers.telegramId, telegramId));
  return true;
}

export async function getUserCards(telegramId: number) {
  return db
    .select()
    .from(owlCards)
    .where(eq(owlCards.telegramId, telegramId))
    .orderBy(desc(owlCards.obtainedAt));
}

export async function addCard(telegramId: number, cardId: number) {
  await db.insert(owlCards).values({ telegramId, cardId });
}

export async function getFamily(telegramId: number): Promise<OwlFamily | null> {
  const rows = await db
    .select()
    .from(owlFamilies)
    .where(or(eq(owlFamilies.user1Id, telegramId), eq(owlFamilies.user2Id, telegramId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getFamilyUsers(family: OwlFamily): Promise<[OwlUser, OwlUser]> {
  const [u1] = await db.select().from(owlUsers).where(eq(owlUsers.telegramId, family.user1Id)).limit(1);
  const [u2] = await db.select().from(owlUsers).where(eq(owlUsers.telegramId, family.user2Id)).limit(1);
  return [u1!, u2!];
}

export async function createFamily(user1Id: number, user2Id: number, familyName: string) {
  const [fam] = await db.insert(owlFamilies).values({ user1Id, user2Id, familyName }).returning();
  return fam!;
}

export async function deleteFamily(familyId: number) {
  await db.delete(owlFamilies).where(eq(owlFamilies.id, familyId));
}

export async function getActiveDuel(userId: number) {
  const rows = await db
    .select()
    .from(owlDuels)
    .where(
      and(
        or(eq(owlDuels.challengerId, userId), eq(owlDuels.challengedId, userId)),
        or(
          eq(owlDuels.state, "pending"),
          eq(owlDuels.state, "challenger_type"),
          eq(owlDuels.state, "challenger_stake"),
          eq(owlDuels.state, "active"),
        ),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getDuel(duelId: number) {
  const [duel] = await db.select().from(owlDuels).where(eq(owlDuels.id, duelId)).limit(1);
  return duel ?? null;
}

export async function updateDuel(duelId: number, data: Partial<typeof owlDuels.$inferInsert>) {
  await db.update(owlDuels).set(data).where(eq(owlDuels.id, duelId));
}

export async function createDuel(challengerId: number, challengedId: number, chatId: number) {
  const [duel] = await db.insert(owlDuels).values({ challengerId, challengedId, chatId }).returning();
  return duel!;
}

export async function getTopByXP(limit = 10) {
  return db.select().from(owlUsers).orderBy(desc(owlUsers.xp)).limit(limit);
}

export async function getTopByFeathers(limit = 10) {
  return db.select().from(owlUsers).orderBy(desc(owlUsers.feathers)).limit(limit);
}

export async function getTopByLevel(limit = 10) {
  return db.select().from(owlUsers).orderBy(desc(owlUsers.level), desc(owlUsers.xp)).limit(limit);
}

export async function getRecentActiveUsers(limit = 8) {
  return db
    .select()
    .from(owlUsers)
    .where(sql`${owlUsers.lastMessageAt} IS NOT NULL`)
    .orderBy(desc(owlUsers.lastMessageAt))
    .limit(limit);
}

export async function getPendingInvite(fromId: number, toId: number) {
  const rows = await db
    .select()
    .from(owlFamilyInvites)
    .where(and(eq(owlFamilyInvites.fromId, fromId), eq(owlFamilyInvites.toId, toId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getInviteForUser(toId: number) {
  const rows = await db
    .select()
    .from(owlFamilyInvites)
    .where(and(eq(owlFamilyInvites.toId, toId), sql`${owlFamilyInvites.expiresAt} > now()`))
    .limit(1);
  return rows[0] ?? null;
}

export async function createFamilyInvite(fromId: number, toId: number, chatId: number) {
  await db
    .delete(owlFamilyInvites)
    .where(or(eq(owlFamilyInvites.fromId, fromId), eq(owlFamilyInvites.toId, fromId)));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const [inv] = await db.insert(owlFamilyInvites).values({ fromId, toId, chatId, expiresAt }).returning();
  return inv!;
}

export async function deleteInvite(inviteId: number) {
  await db.delete(owlFamilyInvites).where(eq(owlFamilyInvites.id, inviteId));
}

export async function getUserQuest(telegramId: number, questId: string) {
  const [q] = await db
    .select()
    .from(owlQuests)
    .where(and(eq(owlQuests.telegramId, telegramId), eq(owlQuests.questId, questId)))
    .limit(1);
  return q ?? null;
}

export async function upsertQuestProgress(
  telegramId: number,
  questId: string,
  target: number,
  increment: number,
) {
  const existing = await getUserQuest(telegramId, questId);
  if (!existing) {
    await db.insert(owlQuests).values({ telegramId, questId, target, progress: increment });
    return;
  }
  if (existing.completed) return;
  const newProgress = existing.progress + increment;
  const completed = newProgress >= target;
  await db
    .update(owlQuests)
    .set({ progress: newProgress, completed, completedAt: completed ? new Date() : null })
    .where(eq(owlQuests.id, existing.id));

  if (completed) {
    await db
      .update(owlUsers)
      .set({ questsCompleted: sql`array_append(${owlUsers.questsCompleted}, ${questId})` })
      .where(eq(owlUsers.telegramId, telegramId));
  }
}

export async function getAllUserQuests(telegramId: number) {
  return db.select().from(owlQuests).where(eq(owlQuests.telegramId, telegramId));
}
