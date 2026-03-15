/**
 * UFO: Cosmic Clash — Admin panel
 * Autor: Alexandre Basseville
 *
 * Přístup chráněn heslem zadaným přímo v prohlížeči.
 * Heslo se ukládá do sessionStorage — po zavření záložky vyprší.
 */

import { db } from "./firebase.js";
import {
  collection, getDocs, doc, updateDoc, getDoc,
  query, orderBy, limit
} from "firebase/firestore";

// ── Admin heslo ──────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = "cosmicclash";
const SESSION_KEY    = "cc_admin_auth";

// ─────────────────────────────────────────────
//  UTILITY
// ─────────────────────────────────────────────

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isAuthenticated() {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

// ─────────────────────────────────────────────
//  LOGIN FORMULÁŘ
// ─────────────────────────────────────────────

function renderLogin(root) {
  root.innerHTML = `
    <div style="max-width:380px;margin:80px auto;padding:0 16px;">
      <div class="dash-header" style="margin-bottom:24px;">
        <span class="logo-icon">🔐</span>
        <h1>Admin panel</h1>
        <p class="subtitle">Zadej přístupové heslo</p>
      </div>

      <div class="card">
        <p class="section-title">Přihlášení</p>
        <div style="display:flex;flex-direction:column;gap:14px;">
          <input
            type="password"
            id="admin-password"
            placeholder="Heslo"
            autocomplete="current-password"
            style="background:rgba(255,255,255,.05);border:1px solid rgba(123,47,255,.3);
                   border-radius:10px;padding:13px 16px;color:#e8d5ff;
                   font-family:'Syne',sans-serif;font-size:14px;outline:none;
                   transition:border-color .2s;"
          />
          <div id="login-error" style="color:#fca5a5;font-size:13px;min-height:18px;"></div>
          <button id="btn-admin-login" class="btn btn-primary">Vstoupit</button>
        </div>
      </div>

      <div style="text-align:center;margin-top:16px;">
        <a href="/dashboard.html"
           style="font-size:12px;color:var(--text);opacity:.5;text-decoration:none;">
          ← Zpět na dashboard
        </a>
      </div>
    </div>
  `;

  const input   = document.getElementById("admin-password");
  const btn     = document.getElementById("btn-admin-login");
  const errEl   = document.getElementById("login-error");

  function tryLogin() {
    if (input.value === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, "1");
      renderAdminPanel(root);
    } else {
      errEl.textContent = "Nesprávné heslo.";
      input.value = "";
      input.focus();
    }
  }

  btn.addEventListener("click", tryLogin);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(); });
  input.focus();
}

// ─────────────────────────────────────────────
//  ADMIN PANEL
// ─────────────────────────────────────────────

async function renderAdminPanel(root) {
  root.innerHTML = `
    <div class="loading-wrap">
      <div class="spinner"></div>
      <p class="loading-text">Načítám data…</p>
    </div>
  `;

  // Načti hráče a itemy paralelně
  const [playersSnap, itemsSnap] = await Promise.all([
    getDocs(query(collection(db, "aliens"), orderBy("name"), limit(50))),
    getDocs(collection(db, "items")),
  ]);

  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const items   = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  root.innerHTML = `
    <div class="dash-header">
      <span class="logo-icon">⚙️</span>
      <h1>Admin Panel</h1>
      <p class="subtitle">UFO Cosmic Clash — správa hry</p>
    </div>

    <!-- Správa hráčů -->
    <div class="card">
      <p class="section-title">Hráči — přidání Star Coins</p>
      <div id="players-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
        ${players.map(p => `
          <div class="stat-row" style="gap:10px;flex-wrap:wrap;">
            <span class="stat-label" style="flex:1;min-width:120px;">
              ${esc(p.name)} <small style="opacity:.5;font-size:10px;">#${p.id.slice(0,6)}</small>
            </span>
            <span style="color:var(--gold);font-size:13px;">✦ ${p.starCoins ?? 0}</span>
            <input type="number" min="1" max="10000" placeholder="Počet" id="coins-${esc(p.id)}"
              style="width:90px;padding:6px 10px;border-radius:8px;
                     border:1px solid rgba(123,47,255,.3);
                     background:rgba(255,255,255,.05);color:var(--star);font-size:13px;" />
            <button onclick="addCoins('${esc(p.id)}', '${esc(p.name)}')"
              style="padding:6px 14px;border:none;border-radius:8px;cursor:pointer;
                     background:linear-gradient(135deg,#7b2fff,#4f0fbb);color:white;
                     font-size:12px;font-family:'Orbitron',sans-serif;">Přidat</button>
          </div>
        `).join("")}
        ${players.length === 0 ? `<p style="color:var(--text);opacity:.5;">Žádní hráči v DB.</p>` : ""}
      </div>
      <div id="coins-status" style="font-size:13px;min-height:20px;text-align:center;"></div>
    </div>

    <!-- Správa itemů -->
    <div class="card">
      <p class="section-title">Itemy — úprava bonusů</p>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${items.map(item => `
          <div style="background:var(--section-bg);border:1px solid var(--border);
                      border-radius:12px;padding:14px;">
            <p style="font-weight:700;color:var(--star);margin-bottom:8px;">
              ${esc(item.name ?? item.id)}
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <label style="font-size:11px;color:var(--glow);">HP bonus</label>
              <input type="number" id="item-hp-${esc(item.id)}" value="${item.hpBonus ?? 0}"
                style="width:70px;padding:5px 8px;border-radius:7px;
                       border:1px solid rgba(123,47,255,.3);
                       background:rgba(255,255,255,.05);color:var(--star);font-size:13px;" />
              <label style="font-size:11px;color:var(--glow);">DMG bonus</label>
              <input type="number" id="item-dmg-${esc(item.id)}" value="${item.dmgBonus ?? 0}"
                style="width:70px;padding:5px 8px;border-radius:7px;
                       border:1px solid rgba(123,47,255,.3);
                       background:rgba(255,255,255,.05);color:var(--star);font-size:13px;" />
              <label style="font-size:11px;color:var(--glow);">Stamina bonus</label>
              <input type="number" id="item-sta-${esc(item.id)}" value="${item.staminaBonus ?? 0}"
                style="width:70px;padding:5px 8px;border-radius:7px;
                       border:1px solid rgba(123,47,255,.3);
                       background:rgba(255,255,255,.05);color:var(--star);font-size:13px;" />
              <button onclick="saveItem('${esc(item.id)}')"
                style="padding:6px 14px;border:none;border-radius:8px;cursor:pointer;
                       background:linear-gradient(135deg,#7b2fff,#4f0fbb);color:white;
                       font-size:12px;font-family:'Orbitron',sans-serif;">Uložit</button>
            </div>
            <div id="item-status-${esc(item.id)}"
                 style="font-size:12px;margin-top:6px;min-height:16px;"></div>
          </div>
        `).join("")}
        ${items.length === 0 ? `<p style="color:var(--text);opacity:.5;">Žádné itemy v DB.</p>` : ""}
      </div>
    </div>

    <div class="card" style="display:flex;gap:10px;">
      <button class="btn btn-secondary" style="flex:1;"
        onclick="window.location.href='/dashboard.html'">← Zpět na dashboard</button>
      <button class="btn btn-danger" style="width:auto;padding:13px 20px;" id="btn-admin-logout">
        Odhlásit
      </button>
    </div>
  `;

  document.getElementById("btn-admin-logout").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    renderLogin(root);
  });
}

// ─────────────────────────────────────────────
//  GLOBÁLNÍ HANDLERY (inline onclick v dynamickém HTML)
// ─────────────────────────────────────────────

window.addCoins = async function(playerId, playerName) {
  const input  = document.getElementById(`coins-${playerId}`);
  const amount = parseInt(input?.value ?? "0", 10);
  const status = document.getElementById("coins-status");

  if (!amount || amount < 1) {
    status.textContent = "Zadej platný počet mincí (min. 1).";
    status.style.color = "#fca5a5";
    return;
  }

  try {
    const ref     = doc(db, "aliens", playerId);
    const snap    = await getDoc(ref);
    if (!snap.exists()) throw new Error("Hráč nenalezen.");
    const current = snap.data().starCoins ?? 0;
    await updateDoc(ref, { starCoins: current + amount });
    status.textContent = `✓ Přidáno ${amount} SC hráči ${playerName}. Nový stav: ${current + amount}`;
    status.style.color = "var(--success)";
    if (input) input.value = "";
  } catch (err) {
    status.textContent = "Chyba: " + err.message;
    status.style.color = "#ff6b8a";
  }
};

window.saveItem = async function(itemId) {
  const hp     = parseInt(document.getElementById(`item-hp-${itemId}`)?.value  ?? "0", 10);
  const dmg    = parseInt(document.getElementById(`item-dmg-${itemId}`)?.value ?? "0", 10);
  const sta    = parseInt(document.getElementById(`item-sta-${itemId}`)?.value ?? "0", 10);
  const status = document.getElementById(`item-status-${itemId}`);

  try {
    await updateDoc(doc(db, "items", itemId), {
      hpBonus:      hp,
      dmgBonus:     dmg,
      staminaBonus: sta,
    });
    status.textContent = "✓ Uloženo";
    status.style.color = "var(--success)";
  } catch (err) {
    status.textContent = "Chyba: " + err.message;
    status.style.color = "#ff6b8a";
  }
};

// ─────────────────────────────────────────────
//  VSTUPNÍ BOD
// ─────────────────────────────────────────────

const root = document.getElementById("root");

if (isAuthenticated()) {
  // Heslo již bylo zadáno v této session
  renderAdminPanel(root).catch(err => {
    root.innerHTML = `<div class="card"><p style="color:#fca5a5;">${esc(err.message)}</p></div>`;
  });
} else {
  renderLogin(root);
}
