import { describe, it, expect } from "vitest";
import { GameLogic } from "../src/logic/game-logic.js";

describe("GameLogic class", () => {
  describe("calculateFinalStats", () => {
    it("returns base defaults when values are missing", () => {
      const stats = GameLogic.calculateFinalStats({});
      expect(stats).toEqual({ hp: 100, dmg: 10, stamina: 100 });
    });

    it("applies equipment bonuses to base stats", () => {
      const stats = GameLogic.calculateFinalStats(
        { hp: 120, dmg: 17, stamina: 80 },
        { bonusHp: 15, bonusDmg: 3, bonusStamina: 20 }
      );

      expect(stats).toEqual({ hp: 135, dmg: 20, stamina: 100 });
    });

    it("handles partial equipment bonuses", () => {
      const stats = GameLogic.calculateFinalStats(
        { hp: 101, dmg: 11, stamina: 61 },
        { bonusHp: 9 }
      );

      expect(stats).toEqual({ hp: 110, dmg: 11, stamina: 61 });
    });
  });
});
