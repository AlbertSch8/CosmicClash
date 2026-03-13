import { auth, db } from "./firebase.js";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { startTraining, startBattle, restAlien } from "./game.js";

const content = document.getElementById("content");

async function loadAlien(userId) {
    const alienRef = doc(db, "aliens", userId);
    const alienSnap = await getDoc(alienRef);

    if (!alienSnap.exists()) {
        throw new Error("Hráč nebyl nalezen.");
    }

    return alienSnap.data();
}

function renderDashboard(a, user, actionText = "") {
    content.innerHTML = `
    <h1>🪐 Velitel ${a.name}</h1>

    <div class="stat"><span class="stat-label">Level</span><span class="stat-value">${a.level}</span></div>
    <div class="stat"><span class="stat-label">XP</span><span class="stat-value">${a.xp}</span></div>
    <div class="stat"><span class="stat-label">HP</span><span class="stat-value">${a.hp}</span></div>
    <div class="stat"><span class="stat-label">DMG</span><span class="stat-value">${a.dmg}</span></div>
    <div class="stat"><span class="stat-label">Stamina</span><span class="stat-value">${a.stamina} / 100</span></div>
    <div class="stat"><span class="stat-label">StarCoins</span><span class="stat-value">${a.starCoins} ✦</span></div>

    <div id="action-message" style="margin: 16px 0; text-align: center; color: #d6ddff; min-height: 24px;">
      ${actionText}
    </div>

    <button class="btn-action" id="training-btn">Trénink</button>
    <button class="btn-action" id="battle-btn">Souboj</button>
    <button class="btn-action" id="rest-btn">Odpočinek</button>
    <button class="btn-logout" id="logout-btn">Odhlásit se</button>
  `;

    const trainingBtn = document.getElementById("training-btn");
    const battleBtn = document.getElementById("battle-btn");
    const restBtn = document.getElementById("rest-btn");
    const logoutBtn = document.getElementById("logout-btn");

    trainingBtn.addEventListener("click", async () => {
        try {
            trainingBtn.disabled = true;
            battleBtn.disabled = true;
            restBtn.disabled = true;

            const result = await startTraining(user.uid);
            const updatedAlien = await loadAlien(user.uid);
            renderDashboard(updatedAlien, user, result.message);
        } catch (error) {
            console.error("Chyba při tréninku:", error);
            const currentAlien = await loadAlien(user.uid);
            renderDashboard(currentAlien, user, error.message);
        }
    });

    battleBtn.addEventListener("click", async () => {
        try {
            trainingBtn.disabled = true;
            battleBtn.disabled = true;
            restBtn.disabled = true;

            const result = await startBattle(user.uid);
            const updatedAlien = await loadAlien(user.uid);
            renderDashboard(updatedAlien, user, result.message);
        } catch (error) {
            console.error("Chyba při souboji:", error);
            const currentAlien = await loadAlien(user.uid);
            renderDashboard(currentAlien, user, error.message);
        }
    });

    restBtn.addEventListener("click", async () => {
        try {
            trainingBtn.disabled = true;
            battleBtn.disabled = true;
            restBtn.disabled = true;

            const result = await restAlien(user.uid);
            const updatedAlien = await loadAlien(user.uid);
            renderDashboard(updatedAlien, user, result.message);
        } catch (error) {
            console.error("Chyba při odpočinku:", error);
            const currentAlien = await loadAlien(user.uid);
            renderDashboard(currentAlien, user, error.message);
        }
    });

    logoutBtn.addEventListener("click", async () => {
        await signOut(auth);
        window.location.href = "/index.html";
    });
}

function renderError(message) {
    content.innerHTML = `
    <h1>Chyba</h1>
    <div class="stat">
      <span class="stat-label">Info</span>
      <span class="stat-value">${message}</span>
    </div>
    <button class="btn-logout" id="back-btn">Zpět na přihlášení</button>
  `;

    const backBtn = document.getElementById("back-btn");
    backBtn.addEventListener("click", () => {
        window.location.href = "/index.html";
    });
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "/index.html";
        return;
    }

    try {
        const alien = await loadAlien(user.uid);
        renderDashboard(alien, user);
    } catch (error) {
        console.error("Chyba při načtení dashboardu:", error);
        renderError("Nepodařilo se načíst data hráče.");
    }
});