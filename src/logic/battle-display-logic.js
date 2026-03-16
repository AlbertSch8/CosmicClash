export class BattleDisplayLogic {
  static formatRewards(rewards, won) {
    if (!rewards || typeof rewards !== "object") {
      return won ? "Bez odměny." : "Bez změny.";
    }

    const parts = [];

    if ((rewards.xp ?? 0) > 0) parts.push(`+${rewards.xp} XP`);
    if ((rewards.starCoins ?? 0) > 0) parts.push(`+${rewards.starCoins} Star Coins`);
    if ((rewards.galacticGems ?? 0) > 0) parts.push(`+${rewards.galacticGems} Galactic Gem`);
    if ((rewards.galaxyTrophies ?? 0) > 0) parts.push(`+${rewards.galaxyTrophies} Galaxy Trophies`);
    if ((rewards.galaxyTrophies ?? 0) < 0) parts.push(`${rewards.galaxyTrophies} Galaxy Trophies`);
    if ((rewards.energy ?? 0) < 0) parts.push(`${rewards.energy} energie`);

    return parts.length ? parts.join(" · ") : (won ? "Výhra bez dropu navíc." : "Žádná extra penalizace.");
  }

  static formatDate(value, locale = "cs-CZ") {
    try {
      if (!value) return "Neznámý čas";

      let date = null;

      if (typeof value?.toDate === "function") {
        date = value.toDate();
      } else if (value instanceof Date) {
        date = value;
      } else if (typeof value === "number") {
        date = new Date(value);
      }

      if (!date || Number.isNaN(date.getTime())) return "Neznámý čas";

      return date.toLocaleString(locale);
    } catch {
      return "Neznámý čas";
    }
  }

  static pct(value, max) {
    if (!max || max <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  }
}
