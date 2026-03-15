import { describe, it, expect } from "vitest";
import { InventoryPriceLogic } from "../src/logic/inventory-price-logic.js";

describe("InventoryPriceLogic class", () => {
  it("sums prices by selected currency field", () => {
    const items = [
      { priceCoins: 10, priceGems: 1 },
      { priceCoins: 15, priceGems: 0 },
      { priceCoins: 5, priceGems: 2 },
    ];

    expect(InventoryPriceLogic.totalPrice(items, "priceCoins")).toBe(30);
    expect(InventoryPriceLogic.totalPrice(items, "priceGems")).toBe(3);
  });

  it("handles missing values as zero", () => {
    const items = [{}, { priceCoins: 4 }];
    expect(InventoryPriceLogic.totalPrice(items, "priceCoins")).toBe(4);
  });

  it("checks affordability from balance", () => {
    const items = [{ priceCoins: 10 }, { priceCoins: 5 }];
    expect(InventoryPriceLogic.canAfford(15, items, "priceCoins")).toBe(true);
    expect(InventoryPriceLogic.canAfford(14, items, "priceCoins")).toBe(false);
  });
});
