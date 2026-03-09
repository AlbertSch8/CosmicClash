import { loadDashboard } from "./dashboard.js";

async function showDashboard(userId) {
    const alien = await loadDashboard(userId);

    console.log("Jmeno:", alien.name);
    console.log("Level:", alien.level);
    console.log("HP:", alien.hp);
    console.log("DMG:", alien.dmg);
    console.log("Stamina:", alien.stamina);
}