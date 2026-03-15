import { describe, it, expect } from "vitest";
import { NumberClampLogic } from "../src/logic/number-clamp-logic.js";

describe("NumberClampLogic class", () => {
  it("keeps value inside range", () => {
    expect(NumberClampLogic.clamp(5, 1, 10)).toBe(5);
  });

  it("clamps low values to min", () => {
    expect(NumberClampLogic.clamp(-3, 1, 10)).toBe(1);
  });

  it("clamps high values to max", () => {
    expect(NumberClampLogic.clamp(99, 1, 10)).toBe(10);
  });
});
