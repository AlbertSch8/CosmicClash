import { describe, it, expect } from "vitest";
import { LocaleDateLogic } from "../src/logic/locale-date-logic.js";

describe("LocaleDateLogic class", () => {
  it("formats number timestamp", () => {
    const output = LocaleDateLogic.format(Date.UTC(2026, 2, 16, 10, 0, 0));
    expect(output).not.toBe("Neznamy cas");
  });

  it("formats firestore-like timestamp", () => {
    const output = LocaleDateLogic.format({
      toDate() {
        return new Date("2026-03-16T10:00:00.000Z");
      },
    });

    expect(output).not.toBe("Neznamy cas");
  });

  it("returns fallback for invalid values", () => {
    expect(LocaleDateLogic.format(null)).toBe("Neznamy cas");
    expect(LocaleDateLogic.format("invalid")).toBe("Neznamy cas");
  });
});
