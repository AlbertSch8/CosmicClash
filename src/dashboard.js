/**
 * UFO: Cosmic Clash — Dashboard (Krok 4)
 * Autor: Alexandre Basseville
 *
 * Odpovědnosti:
 *  1. Auth guard — nepřihlášený → index.html
 *  2. Načtení profilu z Firestore + přepočet energie (anti-cheat)
 *  3. Zobrazení kompletního herního profilu s live odpočtem energie
 *  4. Rozcestník: Trénink ✅  Souboj ✅  Obchod/Vybavení/Leaderboard (brzy)
 *  5. Integrace training.js + battle.js (přepínání obrazovek bez reload)
 *  6. Helper calculateFinalStats() — připraven na bonusy z vybavení
 */

import {auth, db} from "./firebase.js";
import {onAuthStateChanged, signOut} from "firebase/auth";
import {doc, getDoc, updateDoc, Timestamp} from "firebase/firestore";
import {renderTrainingScreen, stopTrainingCountdown} from "./training.js";
import {renderBattleScreen} from "./battle.js";
import {renderShopScreen} from "./shop.js";
import { renderEquipmentScreen } from "./equipment.js";

// ─────────────────────────────────────────────
//  KONSTANTY
// ─────────────────────────────────────────────

const ENERGY_MAX = 5;
const ENERGY_REGEN_MS = 30 * 60 * 1000;

// ─────────────────────────────────────────────
//  HELPER: FINÁLNÍ STATISTIKY
// ─────────────────────────────────────────────

export function calculateFinalStats(alien, equippedItems = null) {
    let hp = alien.hp ?? 100;
    let dmg = alien.dmg ?? 10;
    let stamina = alien.stamina ?? 100;
    // Budoucí: if (equippedItems) { hp += ...; dmg += ...; }
    return {hp, dmg, stamina};
}

// ─────────────────────────────────────────────
//  LOGIKA ENERGIE
// ─────────────────────────────────────────────

export function computeEnergyState(alien) {
    const cur = alien.energy ?? ENERGY_MAX;
    if (cur >= ENERGY_MAX) return {newEnergy: ENERGY_MAX, updatedAt: Date.now(), changed: false};

    let updatedAtMs;
    if (alien.energyUpdatedAt instanceof Timestamp) updatedAtMs = alien.energyUpdatedAt.toMillis();
    else if (typeof alien.energyUpdatedAt === "number") updatedAtMs = alien.energyUpdatedAt;
    else return {newEnergy: cur, updatedAt: Date.now(), changed: true};

    const gained = Math.floor((Date.now() - updatedAtMs) / ENERGY_REGEN_MS);
    if (gained === 0) return {newEnergy: cur, updatedAt: updatedAtMs, changed: false};

    return {
        newEnergy: Math.min(cur + gained, ENERGY_MAX),
        updatedAt: updatedAtMs + gained * ENERGY_REGEN_MS,
        changed: true,
    };
}

async function persistEnergy(uid, energy, updatedAt) {
    await updateDoc(doc(db, "aliens", uid), {
        energy: energy,
        energyUpdatedAt: Timestamp.fromMillis(updatedAt),
    });
}

// ─────────────────────────────────────────────
//  LIVE ODPOČET ENERGIE
// ─────────────────────────────────────────────

let energyInterval = null;

function startEnergyCountdown(updatedAtMs, energy) {
    if (energyInterval) clearInterval(energyInterval);
    const el = document.getElementById("energy-timer");
    if (!el) return;

    if (energy >= ENERGY_MAX) {
        el.innerHTML = `<span class="energy-full">⚡ Plná energie!</span>`;
        return;
    }

    function tick() {
        const t = document.getElementById("energy-timer");
        if (!t) {
            clearInterval(energyInterval);
            return;
        }
        const ms = ENERGY_REGEN_MS - ((Date.now() - updatedAtMs) % ENERGY_REGEN_MS);
        const s = Math.ceil(ms / 1000);
        t.textContent = `Další energie za: ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }

    tick();
    energyInterval = setInterval(tick, 1000);
}

// ─────────────────────────────────────────────
//  NAČTENÍ PROFILU
// ─────────────────────────────────────────────

/**
 * Načte profil ufouna. Při race condition (nová registrace, dokument
 * ještě nezapsán) zkusí až 5x s rostoucím zpožděním (backoff).
 */
async function loadAlienProfile(uid, attempt = 0) {
    const MAX_RETRIES = 5;
    const DELAYS_MS = [600, 1200, 2000, 3000, 4000];

    const snap = await getDoc(doc(db, "aliens", uid));

    if (!snap.exists()) {
        if (attempt < MAX_RETRIES) {
            console.warn(`[CosmicClash] Profil nenalezen, retry ${attempt + 1}/${MAX_RETRIES} za ${DELAYS_MS[attempt]}ms`);
            await new Promise((r) => setTimeout(r, DELAYS_MS[attempt]));
            return loadAlienProfile(uid, attempt + 1);
        }
        throw new Error("Profil ufouna nebyl nalezen. Zkus se odhlásit a znovu přihlásit.");
    }

    const alien = snap.data();
    const { newEnergy, updatedAt, changed } = computeEnergyState(alien);

    if (changed) {
        await persistEnergy(uid, newEnergy, updatedAt);
    }

    return { ...alien, energy: newEnergy, _energyUpdatedAt: updatedAt };
}

// ─────────────────────────────────────────────
//  RENDER DASHBOARDU
// ─────────────────────────────────────────────

function renderDashboard(alien, user) {
    const root = document.getElementById("root");
    if (!root) return;

    stopTrainingCountdown();
    if (energyInterval) clearInterval(energyInterval);

    const stats = calculateFinalStats(alien);
    const xpReq = alien.level * 100;
    const xpPct = Math.min(Math.round((alien.xp / xpReq) * 100), 100);
    const hpBase = 100 + (alien.level - 1) * 10;
    const hpPct = Math.min(Math.round((stats.hp / hpBase) * 100), 100);
    const stPct = Math.min(stats.stamina, 100);
    const origin = alien.origin ?? alien.type ?? "Neznámý původ";

    const energyDots = Array.from({length: ENERGY_MAX}, (_, i) =>
        `<div class="energy-dot ${i < (alien.energy ?? 0) ? "filled" : ""}">${i < (alien.energy ?? 0) ? "⚡" : ""}</div>`
    ).join("");

    root.innerHTML = `
    <div class="dash-header">
      <span class="logo-icon">🛸</span>
      <h1>Velitel ${esc(alien.name)}</h1>
      <p class="subtitle">${esc(origin)}</p>
    </div>

    <div class="card">
      <p class="section-title">Herní profil</p>
      <div class="stat-row"><span class="stat-label">Jméno</span><span class="stat-value">${esc(alien.name)}</span></div>
      <div class="stat-row"><span class="stat-label">Původ / Typ</span><span class="stat-value">${esc(origin)}</span></div>
      <div class="stat-row"><span class="stat-label">Level</span><span class="stat-value">✦ ${alien.level}</span></div>
      <div class="bar-block">
        <div class="bar-header"><span class="stat-label">XP</span><span class="stat-value">${alien.xp} / ${xpReq}</span></div>
        <div class="progress-bar"><div class="progress-fill xp-fill" style="width:${xpPct}%"></div></div>
      </div>
    </div>

    <div class="card">
      <p class="section-title">Bojové statistiky</p>
      <div class="bar-block">
        <div class="bar-header"><span class="stat-label">HP</span><span class="stat-value">${stats.hp}</span></div>
        <div class="progress-bar"><div class="progress-fill hp-fill" style="width:${hpPct}%"></div></div>
      </div>
      <div class="bar-block">
        <div class="bar-header"><span class="stat-label">Stamina</span><span class="stat-value">${stats.stamina} / 100</span></div>
        <div class="progress-bar"><div class="progress-fill stamina-fill" style="width:${stPct}%"></div></div>
      </div>
      <div class="stat-row"><span class="stat-label">DMG</span><span class="stat-value">⚔️ ${stats.dmg}</span></div>
    </div>

    <div class="card">
      <p class="section-title">Energie (max. ${ENERGY_MAX})</p>
      <div class="energy-dots">${energyDots}</div>
      <p class="energy-timer" id="energy-timer">Počítám...</p>
    </div>

    <div class="card">
      <p class="section-title">Pokladnice</p>
      <div class="currency-row">
        <div class="currency-chip">
          <span class="chip-icon">✦</span>
          <span class="chip-label">Star Coins</span>
          <span class="chip-value">${alien.starCoins ?? 0}</span>
        </div>
        <div class="currency-chip">
          <span class="chip-icon">💎</span>
          <span class="chip-label">Galactic Gems</span>
          <span class="chip-value">${alien.galacticGems ?? 0}</span>
        </div>
      </div>
    </div>

    <div class="card">
  <p class="section-title">Velitelské centrum</p>
  <div class="nav-grid">
    <button class="nav-btn" id="nav-training">
      <span class="nav-icon">🏋️</span><span>Trénink</span>
    </button>
    <button class="nav-btn" id="nav-battle">
      <span class="nav-icon">⚔️</span><span>Souboj</span>
    </button>
    <button class="nav-btn" id="nav-shop">
      <span class="nav-icon">🛒</span><span>Obchod</span>
    </button>
    <button class="nav-btn" id="nav-equipment">
      <span class="nav-icon">🛡️</span><span>Vybavení</span>
    </button>
    <button class="nav-btn nav-btn-locked" id="nav-leaderboard" style="grid-column:span 2">
      <span class="nav-icon">🏆</span><span>Leaderboard</span>
      <span class="nav-badge">Brzy</span>
    </button>
  </div>
</div>

    <div class="card">
      <button class="btn btn-danger" id="btn-logout">Odhlásit se</button>
    </div>
  `;

    startEnergyCountdown(alien._energyUpdatedAt, alien.energy ?? 0);

    document.getElementById("nav-training").addEventListener("click", () => goToTraining(alien, user));
    document.getElementById("nav-battle").addEventListener("click", () => goToBattle(alien, user));
    document.getElementById("nav-shop").addEventListener("click", () => goToShop(alien, user));
    document.getElementById("nav-equipment").addEventListener("click", () => goToEquipment(alien, user));

    ["nav-leaderboard"].forEach((id) => {
        document.getElementById(id)?.addEventListener("click", () =>
            showToast("🚧 Tato sekce bude brzy dostupná.")
        );
    });
    
    document.getElementById("btn-logout").addEventListener("click", async () => {
        await signOut(auth);
        window.location.replace("/index.html");
    });
}

// ─────────────────────────────────────────────
//  PŘECHODY NA PODSEKCE
// ─────────────────────────────────────────────

function goToTraining(alien, user) {
    if (energyInterval) clearInterval(energyInterval);
    const root = document.getElementById("root");
    const onBack = () => reload(user);
    const onRefresh = () => reload(user);
    renderTrainingScreen(root, alien, user.uid, onBack, onRefresh);
}

function goToBattle(alien, user) {
    if (energyInterval) clearInterval(energyInterval);
    const root = document.getElementById("root");
    const onBack = () => reload(user);
    const onRefresh = () => reload(user);
    renderBattleScreen(root, alien, user.uid, onBack, onRefresh);
}

function goToShop(alien, user) {
    if (energyInterval) clearInterval(energyInterval);
    const root = document.getElementById("root");
    const onBack = () => reload(user);
    const onRefresh = () => reload(user);
    renderShopScreen(root, alien, user.uid, onBack, onRefresh);
}

function goToEquipment(alien, user) {
    if (energyInterval) clearInterval(energyInterval);
    const root = document.getElementById("root");
    const onBack = () => reload(user);
    const onRefresh = () => reload(user);
    renderEquipmentScreen(root, alien, user.uid, onBack, onRefresh);
}

async function reload(user) {
    try {
        const alien = await loadAlienProfile(user.uid);
        renderDashboard(alien, user);
    } catch (err) {
        renderError(err.message);
    }
}

// ─────────────────────────────────────────────
//  UTILITY
// ─────────────────────────────────────────────

function esc(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function showToast(msg) {
    const old = document.getElementById("cc-toast");
    if (old) old.remove();
    const el = document.createElement("div");
    el.id = "cc-toast";
    el.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:rgba(15,8,30,.97);border:1px solid rgba(123,47,255,.45);
    border-radius:12px;padding:12px 22px;color:#e8d5ff;font-size:13px;
    z-index:200;box-shadow:0 4px 24px rgba(123,47,255,.35);
    max-width:320px;text-align:center;
  `;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

function renderError(message) {
    const root = document.getElementById("root");
    if (!root) return;
    root.innerHTML = `
    <div class="dash-header"><span class="logo-icon">💥</span><h1>Chyba</h1></div>
    <div class="card">
      <p style="color:#fca5a5;margin-bottom:16px;font-size:14px;">${esc(message)}</p>
      <button class="btn btn-danger" id="btn-back">Zpět na přihlášení</button>
    </div>
  `;
    document.getElementById("btn-back")?.addEventListener("click", () =>
        window.location.replace("/index.html")
    );
}

// ─────────────────────────────────────────────
//  VSTUPNÍ BOD
// ─────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("/index.html");
        return;
    }
    try {
        const alien = await loadAlienProfile(user.uid);
        renderDashboard(alien, user);
    } catch (err) {
        console.error("[CosmicClash]", err);
        renderError(err.message ?? "Neznámá chyba.");
    }
});