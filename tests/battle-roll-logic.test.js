import { describe, it, expect } from "vitest";
import { BattleRollLogic } from "../src/logic/battle-roll-logic.js";

describe("BattleRollLogic class", () => {
  it("returns min when random is 0", () => {
    expect(BattleRollLogic.randomInt(10, 15, () => 0)).toBe(10);
  });

  it("returns max when random is close to 1", () => {
    expect(BattleRollLogic.randomInt(10, 15, () => 0.999999)).toBe(15);
  });

  it("returns middle value deterministically", () => {
    expect(BattleRollLogic.randomInt(10, 15, () => 0.5)).toBe(13);
  });
});
