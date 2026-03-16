import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GameLogic } from "../src/logic/game-logic.js";

describe("GameLogic class", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  describe("computeEnergyState", () => {
    it("keeps full energy unchanged", () => {
      const result = GameLogic.computeEnergyState({ energy: 5 });

      expect(result.newEnergy).toBe(5);
      expect(result.changed).toBe(false);
      expect(typeof result.updatedAt).toBe("number");
    });

    it("repairs broken profile when timestamp is missing", () => {
      const result = GameLogic.computeEnergyState({ energy: 2 });

      expect(result.newEnergy).toBe(5);
      expect(result.changed).toBe(true);
      expect(typeof result.updatedAt).toBe("number");
    });

    it("does not regen energy when interval has not passed", () => {
      const now = Date.now();
      const result = GameLogic.computeEnergyState({
        energy: 3,
        energyUpdatedAt: now - (10 * 60 * 1000),
      });

      expect(result.newEnergy).toBe(3);
      expect(result.updatedAt).toBe(now - (10 * 60 * 1000));
      expect(result.changed).toBe(false);
    });

    it("regenerates energy after full intervals", () => {
      const now = Date.now();
      const result = GameLogic.computeEnergyState({
        energy: 1,
        energyUpdatedAt: now - (65 * 60 * 1000),
      });

      expect(result.newEnergy).toBe(3);
      expect(result.updatedAt).toBe(now - (5 * 60 * 1000));
      expect(result.changed).toBe(true);
    });

    it("caps regenerated energy at maximum", () => {
      const now = Date.now();
      const result = GameLogic.computeEnergyState({
        energy: 4,
        energyUpdatedAt: now - (120 * 60 * 1000),
      });

      expect(result.newEnergy).toBe(5);
      expect(result.changed).toBe(true);
    });

    it("accepts firebase-like timestamp object", () => {
      const now = Date.now();
      const tsObj = {
        toMillis() {
          return now - (30 * 60 * 1000);
        },
      };

      const result = GameLogic.computeEnergyState({
        energy: 2,
        energyUpdatedAt: tsObj,
      });

      expect(result.newEnergy).toBe(3);
      expect(result.changed).toBe(true);
    });
  });
});
