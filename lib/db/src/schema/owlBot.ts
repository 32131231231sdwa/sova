import {
  pgTable,
  bigint,
  text,
  integer,
  real,
  timestamp,
  boolean,
  jsonb,
  serial,
} from "drizzle-orm/pg-core";

export const owlUsers = pgTable("owl_users", {
  telegramId: bigint("telegram_id", { mode: "number" }).primaryKey(),
  username: text("username"),
  owlName: text("owl_name").notNull().default("Полло"),
  owlSkin: text("owl_skin").notNull().default("default"),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  hunger: real("hunger").notNull().default(100),
  thirst: real("thirst").notNull().default(100),
  feathers: integer("feathers").notNull().default(0),
  lastFedAt: timestamp("last_fed_at").notNull().defaultNow(),
  lastWateredAt: timestamp("last_watered_at").notNull().defaultNow(),
  lastBathedAt: timestamp("last_bathed_at"),
  duelWinCooldown: timestamp("duel_win_cooldown"),
  duelLoseCooldown: timestamp("duel_lose_cooldown"),
  messageCount: integer("message_count").notNull().default(0),
  lastMessageAt: timestamp("last_message_at"),
  activeStreak: integer("active_streak").notNull().default(0),
  ownedSkins: text("owned_skins").array().notNull().default(["default"]),
  questsCompleted: text("quests_completed").array().notNull().default([]),
  totalDuelsWon: integer("total_duels_won").notNull().default(0),
  totalDuelsLost: integer("total_duels_lost").notNull().default(0),
  totalBathes: integer("total_bathes").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const owlCards = pgTable("owl_cards", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  cardId: integer("card_id").notNull(),
  obtainedAt: timestamp("obtained_at").notNull().defaultNow(),
});

export const owlFamilies = pgTable("owl_families", {
  id: serial("id").primaryKey(),
  user1Id: bigint("user1_id", { mode: "number" }).notNull(),
  user2Id: bigint("user2_id", { mode: "number" }).notNull(),
  familyName: text("family_name").notNull(),
  lastHeistAt: timestamp("last_heist_at"),
  lastJointActivityAt: timestamp("last_joint_activity_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const owlFamilyInvites = pgTable("owl_family_invites", {
  id: serial("id").primaryKey(),
  fromId: bigint("from_id", { mode: "number" }).notNull(),
  toId: bigint("to_id", { mode: "number" }).notNull(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const owlDuels = pgTable("owl_duels", {
  id: serial("id").primaryKey(),
  challengerId: bigint("challenger_id", { mode: "number" }).notNull(),
  challengedId: bigint("challenged_id", { mode: "number" }).notNull(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  duelType: text("duel_type").notNull().default("pending"),
  stakeType: text("stake_type").notNull().default("none"),
  stakeAmount: integer("stake_amount").notNull().default(0),
  state: text("state").notNull().default("pending"),
  gameState: jsonb("game_state"),
  currentTurn: bigint("current_turn", { mode: "number" }),
  winnerId: bigint("winner_id", { mode: "number" }),
  messageId: integer("message_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const owlQuests = pgTable("owl_quests", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  questId: text("quest_id").notNull(),
  progress: integer("progress").notNull().default(0),
  target: integer("target").notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type OwlUser = typeof owlUsers.$inferSelect;
export type OwlCard = typeof owlCards.$inferSelect;
export type OwlFamily = typeof owlFamilies.$inferSelect;
export type OwlDuel = typeof owlDuels.$inferSelect;
export type OwlQuest = typeof owlQuests.$inferSelect;
