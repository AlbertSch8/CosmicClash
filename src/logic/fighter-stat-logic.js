export class FighterStatLogic {
  static getDisplayStats(alien, equippedItems = null) {
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
}
