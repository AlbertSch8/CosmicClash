export class InventoryPriceLogic {
  static totalPrice(items, currencyField) {
    return (items ?? []).reduce((sum, item) => sum + (item?.[currencyField] ?? 0), 0);
  }

  static canAfford(balance, items, currencyField) {
    return (balance ?? 0) >= this.totalPrice(items, currencyField);
  }
}
