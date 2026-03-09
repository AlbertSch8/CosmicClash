import { db } from "./firebase.js";
import { doc, updateDoc, getDoc } from "firebase/firestore";

export async function startTraining(userId) {
    const alienRef = doc(db, "aliens", userId);
    const snap = await getDoc(alienRef);

    if (!snap.exists()) throw new Error("Ufoun nenalezen");

    const alien = snap.data();

    await updateDoc(alienRef, {
        xp: alien.xp + 10,
        hp: alien.hp + 2,
        dmg: alien.dmg + 1,
        stamina: alien.stamina + 1,
        starCoins: alien.starCoins + 5
    });

    return { success: true, message: "Trenink dokoncen" };
}

export async function startBattle(userId) {
    // zatim jen jednoduche demo
    return {
        win: Math.random() > 0.5,
        reward: 15
    };
}