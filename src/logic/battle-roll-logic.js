export class BattleRollLogic {
  static randomInt(min, max, randomFn = Math.random) {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    return Math.floor(randomFn() * (high - low + 1)) + low;
  }
}
