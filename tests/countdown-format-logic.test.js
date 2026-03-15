import { describe, it, expect } from "vitest";
import { CountdownFormatLogic } from "../src/logic/countdown-format-logic.js";

describe("CountdownFormatLogic class", () => {
  it("formats zero seconds", () => {
    expect(CountdownFormatLogic.formatHms(0)).toBe("00:00:00");
  });

  it("formats mixed h/m/s values", () => {
    expect(CountdownFormatLogic.formatHms(3661)).toBe("01:01:01");
  });

  it("clamps invalid values to zero", () => {
    expect(CountdownFormatLogic.formatHms(-15)).toBe("00:00:00");
  });
});
