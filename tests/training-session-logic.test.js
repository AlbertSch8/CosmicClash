import { describe, it, expect } from "vitest";
import { TrainingSessionLogic } from "../src/logic/training-session-logic.js";

describe("TrainingSessionLogic class", () => {
  describe("isSessionActive", () => {
    it("returns true for active session before end time", () => {
      const session = {
        status: "active",
        endTime: 20000,
      };

      expect(TrainingSessionLogic.isSessionActive(session, 10000)).toBe(true);
    });

    it("returns false for finished active session", () => {
      const session = {
        status: "active",
        endTime: 5000,
      };

      expect(TrainingSessionLogic.isSessionActive(session, 5000)).toBe(false);
    });

    it("returns false for non-active statuses", () => {
      const session = {
        status: "done",
        endTime: 10000,
      };

      expect(TrainingSessionLogic.isSessionActive(session, 1000)).toBe(false);
    });
  });

  describe("hasPendingReward", () => {
    it("returns true for done unclaimed session", () => {
      const session = {
        status: "done",
        rewardsClaimed: false,
        endTime: 10000,
      };

      expect(TrainingSessionLogic.hasPendingReward(session, 2000)).toBe(true);
    });

    it("returns true for expired active unclaimed session", () => {
      const session = {
        status: "active",
        rewardsClaimed: false,
        endTime: 5000,
      };

      expect(TrainingSessionLogic.hasPendingReward(session, 5000)).toBe(true);
    });

    it("returns false when reward already claimed", () => {
      const session = {
        status: "done",
        rewardsClaimed: true,
        endTime: 1000,
      };

      expect(TrainingSessionLogic.hasPendingReward(session, 2000)).toBe(false);
    });
  });

  describe("remainingSeconds", () => {
    it("returns rounded up seconds while time remains", () => {
      expect(TrainingSessionLogic.remainingSeconds(13001, 10000)).toBe(4);
    });

    it("never returns negative values", () => {
      expect(TrainingSessionLogic.remainingSeconds(9000, 10000)).toBe(0);
    });
  });

  describe("computeClaimedStats", () => {
    it("adds rewards and stat deltas", () => {
      const alien = {
        xp: 10,
        starCoins: 3,
        hp: 105,
        dmg: 12,
        stamina: 60,
      };

      const mode = {
        rewards: { xp: 30, starCoins: 8 },
        statDeltas: { hp: 8, dmg: 2, stamina: 15 },
      };

      expect(TrainingSessionLogic.computeClaimedStats(alien, mode)).toEqual({
        xp: 40,
        starCoins: 11,
        hp: 113,
        dmg: 14,
        stamina: 75,
      });
    });

    it("caps stamina at 100", () => {
      const alien = {
        xp: 0,
        starCoins: 0,
        hp: 100,
        dmg: 10,
        stamina: 95,
      };

      const mode = {
        rewards: { xp: 20, starCoins: 5 },
        statDeltas: { hp: 0, dmg: 0, stamina: 20 },
      };

      expect(TrainingSessionLogic.computeClaimedStats(alien, mode).stamina).toBe(100);
    });
  });
});
