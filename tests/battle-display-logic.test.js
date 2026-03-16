import { describe, it, expect } from "vitest";
import { BattleDisplayLogic } from "../src/logic/battle-display-logic.js";

describe("BattleDisplayLogic class", () => {
  describe("pct", () => {
    it("returns 0 when max is invalid", () => {
      expect(BattleDisplayLogic.pct(10, 0)).toBe(0);
      expect(BattleDisplayLogic.pct(10, -1)).toBe(0);
    });

    it("returns rounded percentage clamped to range", () => {
      expect(BattleDisplayLogic.pct(25, 40)).toBe(63);
      expect(BattleDisplayLogic.pct(999, 100)).toBe(100);
      expect(BattleDisplayLogic.pct(-10, 100)).toBe(0);
    });
  });

  describe("formatRewards", () => {
    it("formats positive and negative reward parts", () => {
      const text = BattleDisplayLogic.formatRewards(
        {
          xp: 40,
          starCoins: 20,
          galacticGems: 1,
          galaxyTrophies: -12,
          energy: -1,
        },
        false
      );

      expect(text).toContain("+40 XP");
      expect(text).toContain("+20 Star Coins");
      expect(text).toContain("+1 Galactic Gem");
      expect(text).toContain("-12 Galaxy Trophies");
      expect(text).toContain("-1 energie");
    });

    it("returns fallback for empty rewards", () => {
      expect(BattleDisplayLogic.formatRewards({}, true)).toBe("Výhra bez dropu navíc.");
      expect(BattleDisplayLogic.formatRewards({}, false)).toBe("Žádná extra penalizace.");
    });

    it("returns safe fallback for invalid rewards", () => {
      expect(BattleDisplayLogic.formatRewards(null, true)).toBe("Bez odměny.");
      expect(BattleDisplayLogic.formatRewards(undefined, false)).toBe("Bez změny.");
    });
  });

  describe("formatDate", () => {
    it("formats numeric timestamp", () => {
      const text = BattleDisplayLogic.formatDate(Date.UTC(2026, 2, 16, 10, 0, 0));
      expect(text).toContain("16.");
    });

    it("supports firestore-like toDate object", () => {
      const text = BattleDisplayLogic.formatDate({
        toDate() {
          return new Date("2026-03-16T10:00:00.000Z");
        },
      });

      expect(text).toContain("2026");
    });

    it("returns fallback for invalid input", () => {
      expect(BattleDisplayLogic.formatDate(null)).toBe("Neznámý čas");
      expect(BattleDisplayLogic.formatDate("bad")).toBe("Neznámý čas");
    });
  });
});
