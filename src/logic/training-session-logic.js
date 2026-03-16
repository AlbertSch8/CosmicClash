export class TrainingSessionLogic {
  static toMillis(value) {
    if (value && typeof value.toMillis === "function") {
      return value.toMillis();
    }
    return Number(value);
  }

  static isSessionActive(sessionData, nowMs = Date.now()) {
    if (!sessionData || sessionData.status !== "active") {
      return false;
    }

    const endMs = this.toMillis(sessionData.endTime);
    return Number.isFinite(endMs) && nowMs < endMs;
  }

  static hasPendingReward(sessionData, nowMs = Date.now()) {
    if (!sessionData || sessionData.rewardsClaimed === true) {
      return false;
    }

    if (sessionData.status === "done") {
      return true;
    }

    if (sessionData.status === "active") {
      const endMs = this.toMillis(sessionData.endTime);
      return Number.isFinite(endMs) && nowMs >= endMs;
    }

    return false;
  }

  static remainingSeconds(endTime, nowMs = Date.now()) {
    const endMs = this.toMillis(endTime);
    if (!Number.isFinite(endMs)) {
      return 0;
    }

    return Math.max(0, Math.ceil((endMs - nowMs) / 1000));
  }

  static computeClaimedStats(alien, mode) {
    const newXp = (alien.xp ?? 0) + mode.rewards.xp;
    const newStarCoins = (alien.starCoins ?? 0) + mode.rewards.starCoins;
    const newHp = (alien.hp ?? 100) + mode.statDeltas.hp;
    const newDmg = (alien.dmg ?? 10) + mode.statDeltas.dmg;
    const newStamina = Math.min((alien.stamina ?? 100) + mode.statDeltas.stamina, 100);

    return {
      xp: newXp,
      starCoins: newStarCoins,
      hp: newHp,
      dmg: newDmg,
      stamina: newStamina,
    };
  }
}
