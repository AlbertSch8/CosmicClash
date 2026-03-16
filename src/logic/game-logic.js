export const ENERGY_MAX = 5;
export const ENERGY_REGEN_MS = 30 * 60 * 1000;

export class GameLogic {
  static calculateFinalStats(alien, equippedItems = null) {
    let hp = alien.hp ?? 100;
    let dmg = alien.dmg ?? 10;
    let stamina = alien.stamina ?? 100;

    if (equippedItems) {
      hp += equippedItems.bonusHp ?? 0;
      dmg += equippedItems.bonusDmg ?? 0;
      stamina += equippedItems.bonusStamina ?? 0;
    }

    return { hp, dmg, stamina };
  }

  static computeEnergyState(alien) {
    const cur = alien.energy ?? ENERGY_MAX;

    if (cur >= ENERGY_MAX) {
      return {
        newEnergy: ENERGY_MAX,
        updatedAt: Date.now(),
        changed: false,
      };
    }

    let updatedAtMs = null;

    if (alien.energyUpdatedAt && typeof alien.energyUpdatedAt.toMillis === "function") {
      updatedAtMs = alien.energyUpdatedAt.toMillis();
    } else if (typeof alien.energyUpdatedAt === "number") {
      updatedAtMs = alien.energyUpdatedAt;
    }

    if (updatedAtMs == null || Number.isNaN(updatedAtMs)) {
      return {
        newEnergy: ENERGY_MAX,
        updatedAt: Date.now(),
        changed: true,
      };
    }

    const gained = Math.floor((Date.now() - updatedAtMs) / ENERGY_REGEN_MS);

    if (gained <= 0) {
      return {
        newEnergy: cur,
        updatedAt: updatedAtMs,
        changed: false,
      };
    }

    return {
      newEnergy: Math.min(cur + gained, ENERGY_MAX),
      updatedAt: updatedAtMs + gained * ENERGY_REGEN_MS,
      changed: true,
    };
  }
}
