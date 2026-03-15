import { describe, it, expect } from "vitest";
import { FighterStatLogic } from "../src/logic/fighter-stat-logic.js";

describe("FighterStatLogic class", () => {
  it("returns default stats when fields are missing", () => {
    expect(FighterStatLogic.getDisplayStats({})).toEqual({
      hp: 100,
      dmg: 10,
      stamina: 100,
    });
  });

  it("adds equipped item bonuses", () => {
    expect(
      FighterStatLogic.getDisplayStats(
        { hp: 120, dmg: 16, stamina: 70 },
        { bonusHp: 8, bonusDmg: 2, bonusStamina: 15 }
      )
    ).toEqual({ hp: 128, dmg: 18, stamina: 85 });
  });

  it("handles partial bonus objects", () => {
    expect(
      FighterStatLogic.getDisplayStats(
        { hp: 110, dmg: 12, stamina: 60 },
        { bonusHp: 5 }
      )
    ).toEqual({ hp: 115, dmg: 12, stamina: 60 });
  });
});
