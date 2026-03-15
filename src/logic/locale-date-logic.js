export class LocaleDateLogic {
  static format(value, locale = "cs-CZ") {
    try {
      if (!value) return "Neznamy cas";

      let date = null;

      if (typeof value?.toDate === "function") {
        date = value.toDate();
      } else if (value instanceof Date) {
        date = value;
      } else if (typeof value === "number") {
        date = new Date(value);
      }

      if (!date || Number.isNaN(date.getTime())) return "Neznamy cas";
      return date.toLocaleString(locale);
    } catch {
      return "Neznamy cas";
    }
  }
}
