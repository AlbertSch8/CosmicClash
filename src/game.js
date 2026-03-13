import { db } from "./firebase.js";
import { doc, getDoc, updateDoc } from "firebase/firestore";

function getRequiredXp(level) {
    return level * 100;
}

function applyLevelUp(alien) {
    let updatedAlien = { ...alien };

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

    const enemyHp = Math.floor(Math.random() * 41) + 60;
    const enemyDmg = Math.floor(Math.random() * 6) + 6;

    const playerPower = alien.hp + alien.dmg * 5 + alien.level * 8;
    const enemyPower = enemyHp + enemyDmg * 5;

    let updatedAlien = {
        ...alien,
        stamina: alien.stamina - battleCost
    };

    let message = "";

    if (playerPower >= enemyPower) {
        updatedAlien.xp += 40;
        updatedAlien.starCoins += 20;
        message = "Vyhrál jsi souboj. Získal jsi 40 XP a 20 StarCoins. Spotřeboval jsi 15 staminy.";
    } else {
        updatedAlien.starCoins = Math.max(0, updatedAlien.starCoins - 10);
        message = "Souboj jsi prohrál. Ztratil jsi 10 StarCoins a spotřeboval jsi 15 staminy.";
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
        message,
        alien: updatedAlien
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
        message: `Odpočinek dokončen. Obnovil jsi si staminu na ${newStamina}.`,
        alien: {
            ...alien,
            stamina: newStamina
        }
    };
}