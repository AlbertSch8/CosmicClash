export class CountdownFormatLogic {
  static formatHms(totalSeconds) {
    const safe = Math.max(0, Number(totalSeconds) || 0);
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;

    return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
  }
}
