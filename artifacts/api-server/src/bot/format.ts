import { SKINS, RARITY_EMOJI, RARITY_LABELS } from "./data.js";
import type { OwlUser } from "@workspace/db";

const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const DECAY_PER_HALF_DAY = 50;

export function getEffectiveHunger(user: OwlUser): number {
  const elapsed = Date.now() - new Date(user.lastFedAt).getTime();
  const decayed = (elapsed / HALF_DAY_MS) * DECAY_PER_HALF_DAY;
  return Math.max(0, user.hunger - decayed);
}

export function getEffectiveThirst(user: OwlUser): number {
  const elapsed = Date.now() - new Date(user.lastWateredAt).getTime();
  const decayed = (elapsed / HALF_DAY_MS) * DECAY_PER_HALF_DAY;
  return Math.max(0, user.thirst - decayed);
}

export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function progressBar(value: number, max = 100, length = 8): string {
  const pct = Math.max(0, Math.min(1, value / max));
  const filled = Math.round(pct * length);
  const empty = length - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  const pctNum = Math.round(pct * 100);
  return `${bar} ${pctNum}%`;
}

export function hungerEmoji(value: number): string {
  if (value >= 80) return "🍗";
  if (value >= 60) return "🍗";
  if (value >= 40) return "😋";
  if (value >= 20) return "😩";
  return "💀";
}

export function thirstEmoji(value: number): string {
  if (value >= 80) return "💧";
  if (value >= 60) return "💧";
  if (value >= 40) return "😰";
  if (value >= 20) return "😵";
  return "☠️";
}

export function getSkin(id: string) {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]!;
}

export function formatProfile(
  user: OwlUser,
  familyName: string | null,
  isGroup: boolean,
): string {
  const skin = getSkin(user.owlSkin);
  const hunger = getEffectiveHunger(user);
  const thirst = getEffectiveThirst(user);
  const xpForNext =
    user.level < 50
      ? getLevelXP(user.level + 1) - getLevelXP(user.level)
      : 0;
  const xpProgress = user.level < 50 ? user.xp - getLevelXP(user.level) : 0;

  if (isGroup) {
    // Compact group version — no monospace frame that can break
    return (
      `${skin.emoji} <b>${esc(user.owlName)}</b> · <b>${esc(skin.name)}</b>\n` +
      `📊 Уровень <b>${user.level}</b>` +
      (user.level < 50
        ? ` · XP: <b>${xpProgress}/${xpForNext}</b>`
        : " · <b>МАКС</b>") +
      `\n` +
      `🍗 Голод: ${hungerEmoji(hunger)} <b>${Math.round(hunger)}%</b>  ` +
      `💧 Жажда: ${thirstEmoji(thirst)} <b>${Math.round(thirst)}%</b>\n` +
      `🪶 Фрагменты: <b>${user.feathers}</b>` +
      (familyName ? `  👨‍👩‍👧 <i>${esc(familyName)}</i>` : "")
    );
  }

  // Full DM version with code block frame
  const line = "─".repeat(22);
  const owlArt = skin.art.trim();
  const artLines = owlArt.split("\n");

  let profileText =
    `<b>${skin.emoji} ${esc(user.owlName)}</b>\n` +
    `<i>${esc(skin.name)}</i>\n\n` +
    `<code>`;

  profileText += `╔${line}╗\n`;
  for (const l of artLines) {
    const padded = l.padEnd(22);
    profileText += `║ ${padded.substring(0, 20)} ║\n`;
  }
  profileText += `╠${line}╣\n`;
  profileText += `║ 📊 Уровень: ${String(user.level).padEnd(9)} ║\n`;
  if (user.level < 50) {
    profileText += `║ ✨ XP: ${String(xpProgress + "/" + xpForNext).padEnd(13)} ║\n`;
  } else {
    profileText += `║ ✨ МАКСИМАЛЬНЫЙ УРОВЕНЬ      ║\n`;
  }
  profileText += `║ 🍗 Голод: ${String(Math.round(hunger) + "%").padEnd(11)} ║\n`;
  profileText += `║ 💧 Жажда: ${String(Math.round(thirst) + "%").padEnd(11)} ║\n`;
  profileText += `║ 🪶 Фрагменты: ${String(user.feathers).padEnd(7)} ║\n`;
  if (familyName) {
    const truncated = familyName.substring(0, 16);
    profileText += `║ 👨‍👩‍👧 Семья: ${truncated.padEnd(10)} ║\n`;
  }
  profileText += `╚${line}╝`;
  profileText += `</code>`;

  return profileText;
}

export function getLevelXP(level: number): number {
  const XP = [
    0, 0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 3900, 5000, 6300, 7800,
    9500, 11500, 14000, 17000, 20500, 24500, 29000, 34000, 40000, 47000, 55000,
    64000, 74000, 85000, 97000, 110000, 125000, 142000, 161000, 182000, 205000,
    231000, 260000, 292000, 327000, 366000, 409000, 456000, 508000, 565000,
    628000, 697000, 773000, 856000, 947000, 1047000, 1156000,
  ];
  return XP[Math.min(level, 50)] ?? 0;
}

export function cardRarityDisplay(rarity: string): string {
  return `${RARITY_EMOJI[rarity] ?? "⚪"} ${RARITY_LABELS[rarity] ?? rarity}`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes} мин ${seconds} сек`;
  return `${seconds} сек`;
}

export function canDuel(user: OwlUser): { ok: boolean; reason?: string } {
  const hunger = getEffectiveHunger(user);
  const thirst = getEffectiveThirst(user);
  if (hunger < 60) {
    return {
      ok: false,
      reason: `Pöllö голодна 😩 Покорми её до 60%+ (сейчас ${Math.round(hunger)}%)`,
    };
  }
  if (thirst < 60) {
    return {
      ok: false,
      reason: `Pöllö хочет пить 😰 Напои её до 60%+ (сейчас ${Math.round(thirst)}%)`,
    };
  }
  const now = Date.now();
  if (user.duelWinCooldown && new Date(user.duelWinCooldown).getTime() > now) {
    const remaining = new Date(user.duelWinCooldown).getTime() - now;
    return {
      ok: false,
      reason: `Pöllö отдыхает после победы 🏆 Ещё ${formatDuration(remaining)}`,
    };
  }
  if (user.duelLoseCooldown && new Date(user.duelLoseCooldown).getTime() > now) {
    const remaining = new Date(user.duelLoseCooldown).getTime() - now;
    return {
      ok: false,
      reason: `Pöllö зализывает раны после поражения 💔 Ещё ${formatDuration(remaining)}`,
    };
  }
  return { ok: true };
}
