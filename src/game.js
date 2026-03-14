import {db} from "./firebase.js";
import {doc, getDoc, updateDoc} from "firebase/firestore";

function getRequiredXp(level) {
    return level * 100;
}

function applyLevelUp(alien) {
    let updatedAlien = {...alien};

    while (updatedAlien.xp >= getRequiredXp(updatedAlien.level)) {
        updatedAlien.xp -= getRequiredXp(updatedAlien.level);
        updatedAlien.level += 1;
        updatedAlien.hp += 10;
        updatedAlien.dmg += 2;
        updatedAlien.stamina += 5;
    }

    if (updatedAlien.stamina > 100) {
        updatedAlien.stamina = 100;
    }

    return updatedAlien;
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function startTraining(userId) {
    const alienRef = doc(db, "aliens", userId);
    const alienSnap = await getDoc(alienRef);

    if (!alienSnap.exists()) {
        throw new Error("Hráč nebyl nalezen.");
    }

    const alien = alienSnap.data();
    const trainingCost = 10;

    if (alien.stamina < trainingCost) {
        throw new Error("Nemáš dost staminy na trénink.");
    }

    let updatedAlien = {
        ...alien,
        stamina: alien.stamina - trainingCost,
        xp: alien.xp + 25,
        starCoins: alien.starCoins + 10
    };

    updatedAlien = applyLevelUp(updatedAlien);

    await updateDoc(alienRef, {
        xp: updatedAlien.xp,
        level: updatedAlien.level,
        hp: updatedAlien.hp,
        dmg: updatedAlien.dmg,
        stamina: updatedAlien.stamina,
        starCoins: updatedAlien.starCoins
    });

    return {
        type: "training",
        message: "Trénink dokončen. Získal jsi 25 XP a 10 StarCoins. Spotřeboval jsi 10 staminy.",
        alien: updatedAlien
    };
}

export async function startBattle(userId) {
    const alienRef = doc(db, "aliens", userId);
    const alienSnap = await getDoc(alienRef);

    if (!alienSnap.exists()) {
        throw new Error("Hráč nebyl nalezen.");
    }

    const alien = alienSnap.data();
    const battleCost = 15;

    if (alien.stamina < battleCost) {
        throw new Error("Nemáš dost staminy na souboj.");
    }

    const enemy = {
        name: ["Void Beast", "Nebula Drone", "Star Hunter", "Dark Raider"][randomInt(0, 3)],
        hp: randomInt(70, 120),
        dmg: randomInt(7, 14),
        level: randomInt(Math.max(1, alien.level - 1), alien.level + 2)
    };

    let playerHp = alien.hp;
    let enemyHp = enemy.hp;
    const battleLog = [];

    for (let round = 1; round <= 5; round++) {
        if (playerHp <= 0 || enemyHp <= 0) break;

        const playerHit = alien.dmg + randomInt(0, 6) + alien.level;
        enemyHp = Math.max(0, enemyHp - playerHit);
        battleLog.push(`Kolo ${round}: zasáhl jsi nepřítele za ${playerHit} dmg.`);

        if (enemyHp <= 0) {
            battleLog.push(`${enemy.name} byl poražen.`);
            break;
        }

        const enemyHit = enemy.dmg + randomInt(0, 5);
        playerHp = Math.max(0, playerHp - enemyHit);
        battleLog.push(`Kolo ${round}: nepřítel tě zasáhl za ${enemyHit} dmg.`);

        if (playerHp <= 0) {
            battleLog.push(`Tvoje loď byla v kole ${round} přetížena.`);
            break;
        }
    }

    let updatedAlien = {
        ...alien,
        stamina: alien.stamina - battleCost
    };

    let message = "";

    if (enemyHp <= 0 || playerHp > enemyHp) {
        updatedAlien.xp += 40;
        updatedAlien.starCoins += 20;
        message = `Vyhrál jsi souboj proti ${enemy.name}. Získal jsi 40 XP a 20 StarCoins.`;
    } else {
        updatedAlien.starCoins = Math.max(0, updatedAlien.starCoins - 10);
        message = `Souboj proti ${enemy.name} jsi prohrál. Ztratil jsi 10 StarCoins.`;
    }

    updatedAlien = applyLevelUp(updatedAlien);

    await updateDoc(alienRef, {
        xp: updatedAlien.xp,
        level: updatedAlien.level,
        hp: updatedAlien.hp,
        dmg: updatedAlien.dmg,
        stamina: updatedAlien.stamina,
        starCoins: updatedAlien.starCoins
    });

    return {
        type: "battle",
        message: `${message} Spotřeboval jsi 15 staminy.`,
        alien: updatedAlien,
        enemy,
        battleLog
    };
}

export async function restAlien(userId) {
    const alienRef = doc(db, "aliens", userId);
    const alienSnap = await getDoc(alienRef);

    if (!alienSnap.exists()) {
        throw new Error("Hráč nebyl nalezen.");
    }

    const alien = alienSnap.data();

    if (alien.stamina >= 100) {
        throw new Error("Stamina už je plná.");
    }

    const newStamina = Math.min(100, alien.stamina + 20);

    await updateDoc(alienRef, {
        stamina: newStamina
    });

    return {
        type: "rest",
        message: `Odpočinek dokončen. Obnovil jsi si staminu na ${newStamina}.`,
        alien: {
            ...alien,
            stamina: newStamina
        }
    };
}

export async function buyHpUpgrade(userId) {
    const alienRef = doc(db, "aliens", userId);
    const alienSnap = await getDoc(alienRef);

    if (!alienSnap.exists()) {
        throw new Error("Hráč nebyl nalezen.");
    }

    const alien = alienSnap.data();
    const cost = 20;

    if (alien.starCoins < cost) {
        throw new Error("Nemáš dost StarCoins na vylepšení HP.");
    }

    const updatedAlien = {
        ...alien,
        starCoins: alien.starCoins - cost,
        hp: alien.hp + 15
    };

    await updateDoc(alienRef, {
        starCoins: updatedAlien.starCoins,
        hp: updatedAlien.hp
    });

    return {
        type: "shop",
        message: "Koupil jsi vylepšení HP. +15 HP.",
        alien: updatedAlien
    };
}

export async function buyDmgUpgrade(userId) {
    const alienRef = doc(db, "aliens", userId);
    const alienSnap = await getDoc(alienRef);

    if (!alienSnap.exists()) {
        throw new Error("Hráč nebyl nalezen.");
    }

    const alien = alienSnap.data();
    const cost = 25;

    if (alien.starCoins < cost) {
        throw new Error("Nemáš dost StarCoins na vylepšení DMG.");
    }

    const updatedAlien = {
        ...alien,
        starCoins: alien.starCoins - cost,
        dmg: alien.dmg + 3
    };

    await updateDoc(alienRef, {
        starCoins: updatedAlien.starCoins,
        dmg: updatedAlien.dmg
    });

    return {
        type: "shop",
        message: "Koupil jsi vylepšení DMG. +3 DMG.",
        alien: updatedAlien
    };
}