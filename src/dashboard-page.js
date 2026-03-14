import {auth} from "./firebase.js";
import {loadDashboard} from "./dashboard.js";
import {onAuthStateChanged, signOut} from "firebase/auth";

const content = document.getElementById("content");

function renderDashboard(a) {
    content.innerHTML = `
    <h1>🪐 Velitel ${a.name}</h1>
    <div class="stat"><span class="stat-label">Level</span><span class="stat-value">${a.level}</span></div>
    <div class="stat"><span class="stat-label">XP</span><span class="stat-value">${a.xp}</span></div>
    <div class="stat"><span class="stat-label">HP</span><span class="stat-value">${a.hp}</span></div>
    <div class="stat"><span class="stat-label">DMG</span><span class="stat-value">${a.dmg}</span></div>
    <div class="stat"><span class="stat-label">Stamina</span><span class="stat-value">${a.stamina}</span></div>
    <div class="stat"><span class="stat-label">StarCoins</span><span class="stat-value">${a.starCoins} ✦</span></div>
    <button class="btn-logout" id="logout-btn">Odhlásit se</button>
  `;

    const logoutBtn = document.getElementById("logout-btn");
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
        const alien = await loadDashboard(user.uid);
        renderDashboard(alien);
    } catch (error) {
        console.error("Chyba při načtení dashboardu:", error);
        renderError("Nepodařilo se načíst data hráče.");
    }
});