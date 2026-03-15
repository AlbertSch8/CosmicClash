import { describe, it, expect } from "vitest";
import { SessionGuardLogic } from "../src/logic/session-guard-logic.js";

describe("SessionGuardLogic class", () => {
  it("detects expired and non-expired end times", () => {
    expect(SessionGuardLogic.isExpired(1000, 900)).toBe(false);
    expect(SessionGuardLogic.isExpired(1000, 1000)).toBe(true);
  });

  it("accepts firestore-like timestamp object", () => {
    const ts = { toMillis: () => 5000 };
    expect(SessionGuardLogic.isExpired(ts, 4000)).toBe(false);
  });

  it("validates reward claim rules", () => {
    expect(
      SessionGuardLogic.canClaimReward({ status: "done", rewardsClaimed: false }, 0)
    ).toBe(true);

    expect(
      SessionGuardLogic.canClaimReward({ status: "active", rewardsClaimed: false, endTime: 1000 }, 999)
    ).toBe(false);

    expect(
      SessionGuardLogic.canClaimReward({ status: "active", rewardsClaimed: false, endTime: 1000 }, 1000)
    ).toBe(true);
  });
});
