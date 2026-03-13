import { auth, db } from "./firebase.js";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { startTraining, startBattle, restAlien } from "./game.js";

const content = document.getElementById("content");

function getRequiredXp(level) {
    return level * 100;
}

async function loadAlien(userId) {
    const alienRef = doc(db, "aliens", userId);
    const alienSnap = await getDoc(alienRef);

    if (!alienSnap.exists()) {
        throw new Error("Hráč nebyl nalezen.");
    }

    return alienSnap.data();
}

function renderDashboard(a, user, actionText = "") {
    const requiredXp = getRequiredXp(a.level);
    const xpPercent = Math.min((a.xp / requiredXp) * 100, 100);
    const staminaPercent = Math.min((a.stamina / 100) * 100, 100);

    content.innerHTML = `
    <div class="dashboard-header">
      <h1>🪐 Velitel ${a.name}</h1>
      <p class="subtitle">Připraven na další vesmírný střet</p>
    </div>

    <div class="section">
      <h2 class="section-title">Hráč</h2>
      <div class="stat"><span class="stat-label">Level</span><span class="stat-value">${a.level}</span></div>
      <div class="stat"><span class="stat-label">StarCoins</span><span class="stat-value">${a.starCoins} ✦</span></div>
    </div>

    <div class="section">
      <h2 class="section-title">Statistiky</h2>
      <div class="stat"><span class="stat-label">HP</span><span class="stat-value">${a.hp}</span></div>
      <div class="stat"><span class="stat-label">DMG</span><span class="stat-value">${a.dmg}</span></div>
      <div class="stat"><span class="stat-label">Stamina</span><span class="stat-value">${a.stamina} / 100</span></div>
    </div>

    <div class="section">
      <h2 class="section-title">Postup</h2>

      <div class="bar-block">
        <div class="bar-header">
          <span class="stat-label">XP</span>
          <span class="stat-value">${a.xp} / ${requiredXp}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill xp-fill" style="width: ${xpPercent}%"></div>
        </div>
      </div>

      <div class="bar-block">
        <div class="bar-header">
          <span class="stat-label">Energie</span>
          <span class="stat-value">${a.stamina} / 100</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill stamina-fill" style="width: ${staminaPercent}%"></div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Akce</h2>

      <div id="action-message" class="action-message">
        ${actionText}
      </div>

      <button class="btn-action" id="training-btn">Trénink</button>
      <button class="btn-action" id="battle-btn">Souboj</button>
      <button class="btn-action" id="rest-btn">Odpočinek</button>
      <button class="btn-logout" id="logout-btn">Odhlásit se</button>
    </div>
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
    <div class="dashboard-header">
      <h1>Chyba</h1>
      <p class="subtitle">Nepodařilo se načíst dashboard</p>
    </div>

    <div class="section">
      <div class="stat">
        <span class="stat-label">Info</span>
        <span class="stat-value">${message}</span>
      </div>
      <button class="btn-logout" id="back-btn">Zpět na přihlášení</button>
    </div>
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