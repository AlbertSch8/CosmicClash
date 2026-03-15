export class SessionGuardLogic {
  static toMillis(value) {
    if (value && typeof value.toMillis === "function") {
      return value.toMillis();
    }
    return Number(value);
  }

  static isExpired(endTime, nowMs = Date.now()) {
    const endMs = this.toMillis(endTime);
    if (!Number.isFinite(endMs)) return true;
    return nowMs >= endMs;
  }

  static canClaimReward(session, nowMs = Date.now()) {
    if (!session || session.rewardsClaimed === true) return false;
    if (session.status === "done") return true;
    if (session.status !== "active") return false;
    return this.isExpired(session.endTime, nowMs);
  }
}
