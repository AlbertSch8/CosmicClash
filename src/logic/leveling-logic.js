export class LevelingLogic {
  /**
   * Spočítá level a progress bar čistě z celkových XP.
   * Křivka: Level = odmocnina z (XP / 100) + 1.
   */
  static getLevelInfo(totalXp) {
    const xp = Math.max(0, Number(totalXp) || 0);
    const currentLevel = Math.floor(Math.sqrt(xp / 100)) + 1;

    // Výpočet XP pro hranice aktuálního a dalšího levelu
    const currentLevelBaseXp = Math.pow(currentLevel - 1, 2) * 100;
    const nextLevelBaseXp = Math.pow(currentLevel, 2) * 100;

    // Kolik XP získal hráč v tomto konkrétním levelu a kolik jich potřebuje na další
    const xpInCurrentLevel = xp - currentLevelBaseXp;
    const xpRequiredForNext = nextLevelBaseXp - currentLevelBaseXp;

    // Procenta pro progress bar (0-100)
    const progressPct = Math.min(100, Math.max(0, Math.round((xpInCurrentLevel / xpRequiredForNext) * 100)));

    return {
      level: currentLevel,
      currentXp: xp,
      nextLevelXp: nextLevelBaseXp,
      progressPct: progressPct
    };
  }
}