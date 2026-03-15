/**
 * UFO: Cosmic Clash — Admin "God Mode" Panel
 * Autor: Alexandre Basseville
 *
 * Sekce:
 *  1. LOGIN      — heslo uložené v sessionStorage
 *  2. HRÁČI      — výpis aliens s live filtrací, +/- Star Coins & Galactic Gems
 *  3. VYBAVENÍ   — výpis items, editace dmgBonus/hpBonus/staminaBonus/priceCoins/priceGems
 */

import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  collection, getDocs, doc, getDoc, updateDoc,
  query, orderBy,
} from "firebase/firestore";

// ─────────────────────────────────────────────
//  KONFIGURACE
// ─────────────────────────────────────────────

/** UID admin účtu — musí odpovídat UID v firestore.rules */
const ADMIN_UID = "eWJmAYdCNbOwAb7OXD5T7C6S2zQ2";

// ─────────────────────────────────────────────
//  STAV APLIKACE
// ─────────────────────────────────────────────

let allPlayers = [];
let activeTab  = "players";

// ─────────────────────────────────────────────
//  UTILITY
// ─────────────────────────────────────────────

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Vrátí true pokud je přihlášený uživatel admin.
 * Ověření probíhá na dvou úrovních:
 *  1. Firebase Auth — uživatel musí být přihlášen
 *  2. UID check — musí odpovídat ADMIN_UID
 * Firestore Rules pak ověří UID ještě jednou na straně serveru.
 */
function isAdmin(user) {
  return user !== null && user.uid === ADMIN_UID;
}

function toast(msg, type = "info") {
  const old = document.getElementById("adm-toast");
  if (old) old.remove();
  const colors = { success: "#00e5a0", error: "#ff6b8a", info: "#a5f3fc" };
  const c = colors[type] ?? colors.info;
  const el = document.createElement("div");
  el.id = "adm-toast";
  el.style.cssText = `
    position:fixed;bottom:24px;right:24px;
    background:#0d0b1e;border:1px solid ${c};
    border-radius:10px;padding:10px 18px;color:${c};font-size:13px;
    z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.6);
    font-family:'Syne',sans-serif;max-width:300px;line-height:1.4;
  `;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─────────────────────────────────────────────
//  LOGIN
// ─────────────────────────────────────────────

function renderLogin(errorMsg = "") {
  document.getElementById("root").innerHTML = `
    <div class="adm-login-wrap">
      <div class="adm-login-box">
        <div class="adm-login-icon">&#9881;</div>
        <h1 class="adm-login-title">GOD MODE</h1>
        <p class="adm-login-sub">UFO: Cosmic Clash &middot; Admin Terminal</p>

        <div class="adm-login-field" style="margin-bottom:10px;">
          <span class="adm-login-prefix">EMAIL &#9654;</span>
          <input
            type="email"
            id="adm-email"
            class="adm-login-input"
            placeholder="admin@cosmicclash.local"
            autocomplete="email"
            style="letter-spacing:0;"
          />
        </div>

        <div class="adm-login-field">
          <span class="adm-login-prefix">HESLO &#9654;</span>
          <input
            type="password"
            id="adm-pass"
            class="adm-login-input"
            placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
            autocomplete="current-password"
          />
        </div>

        <div id="adm-login-err" class="adm-login-err">${errorMsg}</div>
        <button id="adm-login-btn" class="adm-btn adm-btn-primary adm-btn-full">
          AUTORIZOVAT PŘÍSTUP
        </button>
        <a href="/dashboard.html" class="adm-back-link">← Zpět na dashboard</a>
      </div>
    </div>
  `;

  const emailInput = document.getElementById("adm-email");
  const passInput  = document.getElementById("adm-pass");
  const btn        = document.getElementById("adm-login-btn");
  const err        = document.getElementById("adm-login-err");

  async function tryLogin() {
    const email    = emailInput.value.trim();
    const password = passInput.value;

    if (!email || !password) {
      err.textContent = "ZADEJ EMAIL A HESLO";
      return;
    }

    btn.disabled = true;
    btn.textContent = "OVĚŘUJI…";
    err.textContent = "";

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);

      // Ověříme, zda přihlášený uživatel je skutečně admin
      if (!isAdmin(cred.user)) {
        // Přihlásili jsme se, ale UID nesedí — odhlásíme a ukážeme chybu
        await signOut(auth);
        err.textContent = "PŘÍSTUP ODEPŘEN — tento účet nemá admin oprávnění";
        passInput.value = "";
        passInput.classList.add("adm-shake");
        setTimeout(() => passInput.classList.remove("adm-shake"), 500);
        btn.disabled = false;
        btn.textContent = "AUTORIZOVAT PŘÍSTUP";
        return;
      }

      // OK — jsme admin, zobrazíme panel
      renderPanel();

    } catch (e) {
      const msgs = {
        "auth/invalid-credential": "NESPRÁVNÝ EMAIL NEBO HESLO",
        "auth/user-not-found":     "ÚČET NENALEZEN",
        "auth/wrong-password":     "NESPRÁVNÉ HESLO",
        "auth/too-many-requests":  "PŘÍLIŠ MNOHO POKUSŮ — zkus to za chvíli",
        "auth/invalid-email":      "NEPLATNÝ FORMÁT EMAILU",
      };
      err.textContent = msgs[e.code] ?? `CHYBA: ${e.message}`;
      passInput.value = "";
      passInput.classList.add("adm-shake");
      setTimeout(() => passInput.classList.remove("adm-shake"), 500);
      btn.disabled = false;
      btn.textContent = "AUTORIZOVAT PŘÍSTUP";
    }
  }

  btn.addEventListener("click", tryLogin);
  passInput.addEventListener("keydown", e => { if (e.key === "Enter") tryLogin(); });
  emailInput.addEventListener("keydown", e => { if (e.key === "Enter") passInput.focus(); });
  setTimeout(() => emailInput.focus(), 50);
}

// ─────────────────────────────────────────────
//  HLAVNÍ PANEL — SHELL
// ─────────────────────────────────────────────

async function renderPanel() {
  const root = document.getElementById("root");
  root.innerHTML = `
    <div class="adm-shell">

      <header class="adm-topbar">
        <div class="adm-topbar-left">
          <span class="adm-topbar-logo">&#9881;</span>
          <span class="adm-topbar-title">GOD MODE TERMINAL</span>
          <span class="adm-topbar-sep">|</span>
          <span class="adm-topbar-sub">cosmicclash-b9510</span>
        </div>
        <div class="adm-topbar-right">
          <span class="adm-status-dot"></span>
          <span class="adm-topbar-sub">ONLINE</span>
          <button id="adm-logout" class="adm-btn adm-btn-ghost adm-btn-sm">ODHLÁSIT</button>
          <a href="/dashboard.html" class="adm-btn adm-btn-ghost adm-btn-sm">DASHBOARD</a>
        </div>
      </header>

      <nav class="adm-tabs">
        <button class="adm-tab active" data-tab="players">
          HRÁČI <span class="adm-tab-count" id="tab-count-players">—</span>
        </button>
        <button class="adm-tab" data-tab="items">
          VYBAVENÍ <span class="adm-tab-count" id="tab-count-items">—</span>
        </button>
      </nav>

      <!-- === ZÁLOŽKA: HRÁČI === -->
      <section id="tab-players" class="adm-section">
        <div class="adm-toolbar">
          <div class="adm-search-wrap">
            <span class="adm-search-icon">&#128269;</span>
            <input
              type="text" id="adm-search" class="adm-search-input"
              placeholder="Hledat hráče podle jména…"
            />
          </div>
          <button id="adm-refresh-players" class="adm-btn adm-btn-ghost adm-btn-sm">↺ REFRESH</button>
        </div>

        <div class="adm-table-scroll">
          <table class="adm-table" id="players-table">
            <thead>
              <tr>
                <th>JMÉNO / UID</th>
                <th class="adm-tc">LVL</th>
                <th class="adm-tc">STAR COINS</th>
                <th class="adm-tc">GALACTIC GEMS</th>
                <th>SPRÁVA MĚNY</th>
              </tr>
            </thead>
            <tbody id="players-tbody">
              <tr><td colspan="5" class="adm-loading-cell">
                <span class="adm-mini-spinner"></span>Načítám hráče…
              </td></tr>
            </tbody>
          </table>
        </div>
        <div id="players-status" class="adm-global-status"></div>
      </section>

      <!-- === ZÁLOŽKA: VYBAVENÍ === -->
      <section id="tab-items" class="adm-section adm-hidden">
        <div class="adm-toolbar">
          <span class="adm-toolbar-info">Změny se zapisují přímo do kolekce <code>items</code></span>
          <button id="adm-refresh-items" class="adm-btn adm-btn-ghost adm-btn-sm">↺ REFRESH</button>
        </div>
        <div id="items-grid" class="adm-items-grid">
          <div class="adm-loading-cell">
            <span class="adm-mini-spinner"></span>Načítám předměty…
          </div>
        </div>
      </section>

    </div>
  `;

  document.querySelectorAll(".adm-tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  document.getElementById("adm-logout").addEventListener("click", async () => {
    await signOut(auth);
    renderLogin();
  });
  document.getElementById("adm-refresh-players").addEventListener("click", loadPlayers);
  document.getElementById("adm-refresh-items").addEventListener("click", loadItems);
  document.getElementById("adm-search").addEventListener("input", e => {
    renderPlayersTable(e.target.value.trim().toLowerCase());
  });

  await Promise.all([loadPlayers(), loadItems()]);
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".adm-tab").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  document.getElementById("tab-players").classList.toggle("adm-hidden", tab !== "players");
  document.getElementById("tab-items").classList.toggle("adm-hidden",   tab !== "items");
}

// ─────────────────────────────────────────────
//  HRÁČI
// ─────────────────────────────────────────────

async function loadPlayers() {
  const tbody = document.getElementById("players-tbody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="adm-loading-cell">
    <span class="adm-mini-spinner"></span>Načítám…</td></tr>`;
  try {
    const snap = await getDocs(query(collection(db, "aliens"), orderBy("name")));
    allPlayers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const c = document.getElementById("tab-count-players");
    if (c) c.textContent = allPlayers.length;
    renderPlayersTable(document.getElementById("adm-search")?.value.trim().toLowerCase() ?? "");
  } catch (err) {
    const tbody = document.getElementById("players-tbody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="adm-err-cell">
      Chyba: ${esc(err.message)}</td></tr>`;
  }
}

function renderPlayersTable(filter = "") {
  const tbody = document.getElementById("players-tbody");
  if (!tbody) return;

  const list = filter
    ? allPlayers.filter(p => (p.name ?? "").toLowerCase().includes(filter))
    : allPlayers;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="adm-empty-cell">Žádný hráč nenalezen.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(p => `
    <tr class="adm-player-row" id="row-${esc(p.id)}">
      <td>
        <div class="adm-player-name">${esc(p.name ?? "—")}</div>
        <div class="adm-player-uid">#${p.id.slice(0, 10)}</div>
      </td>
      <td class="adm-tc">
        <span class="adm-level-badge">Lv.${p.level ?? 1}</span>
      </td>
      <td class="adm-tc">
        <span class="adm-sc-val" id="sc-val-${esc(p.id)}">
          ${(p.starCoins ?? 0).toLocaleString("cs-CZ")}
        </span>
        <span class="adm-coin-sym">✦</span>
      </td>
      <td class="adm-tc">
        <span class="adm-gem-val" id="gem-val-${esc(p.id)}">
          ${(p.galacticGems ?? 0).toLocaleString("cs-CZ")}
        </span>
        <span class="adm-gem-sym">&#128142;</span>
      </td>
      <td>
        <div class="adm-actions-wrap">
          <!-- Star Coins -->
          <div class="adm-currency-row">
            <span class="adm-currency-tag sc-tag">SC</span>
            <input
              type="number" min="1" max="999999" placeholder="Počet"
              id="sc-input-${esc(p.id)}" class="adm-num-input"
            />
            <button class="adm-btn adm-btn-plus adm-btn-xs"
              onclick="adjustCurrency('${esc(p.id)}','starCoins',1)"
              title="Přidat Star Coins">+</button>
            <button class="adm-btn adm-btn-minus adm-btn-xs"
              onclick="adjustCurrency('${esc(p.id)}','starCoins',-1)"
              title="Odebrat Star Coins">−</button>
          </div>
          <!-- Galactic Gems -->
          <div class="adm-currency-row">
            <span class="adm-currency-tag gem-tag">GG</span>
            <input
              type="number" min="1" max="999999" placeholder="Počet"
              id="gem-input-${esc(p.id)}" class="adm-num-input"
            />
            <button class="adm-btn adm-btn-plus adm-btn-xs"
              onclick="adjustCurrency('${esc(p.id)}','galacticGems',1)"
              title="Přidat Galactic Gems">+</button>
            <button class="adm-btn adm-btn-minus adm-btn-xs"
              onclick="adjustCurrency('${esc(p.id)}','galacticGems',-1)"
              title="Odebrat Galactic Gems">−</button>
          </div>
        </div>
      </td>
    </tr>
  `).join("");
}

window.adjustCurrency = async function(playerId, field, direction) {
  const isCoins  = field === "starCoins";
  const inputId  = isCoins ? `sc-input-${playerId}` : `gem-input-${playerId}`;
  const input    = document.getElementById(inputId);
  const amount   = parseInt(input?.value ?? "0", 10);
  if (!amount || amount < 1) { toast("Zadej platný počet (min. 1)", "error"); input?.focus(); return; }

  const label    = isCoins ? "Star Coins" : "Galactic Gems";
  const sym      = isCoins ? "✦" : "💎";
  const statusEl = document.getElementById("players-status");

  try {
    const ref  = doc(db, "aliens", playerId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Hráč nenalezen.");
    const current  = snap.data()[field] ?? 0;
    const newValue = Math.max(0, current + direction * amount);
    await updateDoc(ref, { [field]: newValue });

    // Aktualizace lokálního stavu
    const idx = allPlayers.findIndex(p => p.id === playerId);
    if (idx !== -1) allPlayers[idx][field] = newValue;

    // Aktualizace DOM bez překreslení tabulky
    const valEl = document.getElementById(isCoins ? `sc-val-${playerId}` : `gem-val-${playerId}`);
    if (valEl) valEl.textContent = newValue.toLocaleString("cs-CZ");

    // Flash efekt
    const row = document.getElementById(`row-${playerId}`);
    if (row) {
      row.classList.add(direction > 0 ? "adm-flash-green" : "adm-flash-red");
      setTimeout(() => row.classList.remove("adm-flash-green", "adm-flash-red"), 700);
    }

    if (input) input.value = "";
    const name = allPlayers.find(p => p.id === playerId)?.name ?? playerId;
    const sign = direction > 0 ? "+" : "−";
    if (statusEl) {
      statusEl.textContent = `${sign}${amount} ${label} → ${name} | nový stav: ${newValue} ${sym}`;
      statusEl.className   = "adm-global-status ok";
    }
    toast(`${sign}${amount} ${label} pro ${name}`, direction > 0 ? "success" : "info");

  } catch (err) {
    if (statusEl) { statusEl.textContent = `Chyba: ${err.message}`; statusEl.className = "adm-global-status err"; }
    toast(err.message, "error");
  }
};

// ─────────────────────────────────────────────
//  VYBAVENÍ / ITEMY
// ─────────────────────────────────────────────

async function loadItems() {
  const grid = document.getElementById("items-grid");
  if (grid) grid.innerHTML = `<div class="adm-loading-cell">
    <span class="adm-mini-spinner"></span>Načítám předměty…</div>`;
  try {
    const snap  = await getDocs(collection(db, "items"));
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const c = document.getElementById("tab-count-items");
    if (c) c.textContent = items.length;
    renderItemsGrid(items);
  } catch (err) {
    const grid = document.getElementById("items-grid");
    if (grid) grid.innerHTML = `<div class="adm-err-cell">Chyba: ${esc(err.message)}</div>`;
  }
}

function renderItemsGrid(items) {
  const grid = document.getElementById("items-grid");
  if (!grid) return;
  if (items.length === 0) { grid.innerHTML = `<div class="adm-empty-cell">Žádné předměty v DB.</div>`; return; }

  grid.innerHTML = items.map(item => `
    <div class="adm-item-card" id="item-card-${esc(item.id)}">
      <div class="adm-item-header">
        <div>
          <span class="adm-item-name">${esc(item.name ?? item.id)}</span>
          ${item.type    ? `<span class="adm-badge adm-badge-type">${esc(item.type)}</span>` : ""}
          ${item.rarity  ? `<span class="adm-badge adm-badge-rarity adm-rarity-${(item.rarity ?? "").toLowerCase()}">${esc(item.rarity)}</span>` : ""}
        </div>
        <span class="adm-item-uid">#${item.id.slice(0, 8)}</span>
      </div>

      <div class="adm-item-body">
        <p class="adm-item-group-label">BOJOVÉ BONUSY</p>
        <div class="adm-item-fields">
          <div class="adm-item-field">
            <label>HP bonus</label>
            <input type="number" id="ihp-${esc(item.id)}" value="${item.hpBonus ?? 0}" class="adm-item-input" />
          </div>
          <div class="adm-item-field">
            <label>DMG bonus</label>
            <input type="number" id="idmg-${esc(item.id)}" value="${item.dmgBonus ?? 0}" class="adm-item-input" />
          </div>
          <div class="adm-item-field">
            <label>Stamina bonus</label>
            <input type="number" id="ista-${esc(item.id)}" value="${item.staminaBonus ?? 0}" class="adm-item-input" />
          </div>
        </div>

        <p class="adm-item-group-label" style="margin-top:12px;">CENA</p>
        <div class="adm-item-fields">
          <div class="adm-item-field">
            <label>Star Coins ✦</label>
            <input type="number" id="ipc-${esc(item.id)}" value="${item.priceCoins ?? 0}" class="adm-item-input" />
          </div>
          <div class="adm-item-field">
            <label>Galactic Gems &#128142;</label>
            <input type="number" id="ipg-${esc(item.id)}" value="${item.priceGems ?? 0}" class="adm-item-input" />
          </div>
        </div>
      </div>

      <div class="adm-item-footer">
        <span id="item-status-${esc(item.id)}" class="adm-item-status"></span>
        <button class="adm-btn adm-btn-primary adm-btn-sm" onclick="saveItem('${esc(item.id)}')">
          ULOŽIT ÚPRAVY
        </button>
      </div>
    </div>
  `).join("");
}

window.saveItem = async function(itemId) {
  const get    = id => parseInt(document.getElementById(id)?.value ?? "0", 10);
  const status = document.getElementById(`item-status-${itemId}`);
  const card   = document.getElementById(`item-card-${itemId}`);

  if (status) { status.textContent = "Ukládám…"; status.className = "adm-item-status"; }

  try {
    await updateDoc(doc(db, "items", itemId), {
      hpBonus:      get(`ihp-${itemId}`),
      dmgBonus:     get(`idmg-${itemId}`),
      staminaBonus: get(`ista-${itemId}`),
      priceCoins:   get(`ipc-${itemId}`),
      priceGems:    get(`ipg-${itemId}`),
    });
    if (status) { status.textContent = "✓ Uloženo"; status.className = "adm-item-status ok"; }
    if (card) {
      card.classList.add("adm-flash-green");
      setTimeout(() => card.classList.remove("adm-flash-green"), 700);
    }
    toast("Předmět uložen", "success");
  } catch (err) {
    if (status) { status.textContent = `Chyba: ${err.message}`; status.className = "adm-item-status err"; }
    toast(err.message, "error");
  }
};

// ─────────────────────────────────────────────
//  VSTUPNÍ BOD
// ─────────────────────────────────────────────

/**
 * onAuthStateChanged zajistí správné chování i po F5:
 *  - Pokud je uživatel přihlášen jako admin → rovnou panel
 *  - Pokud je přihlášen jako non-admin → odhlásíme a login
 *  - Pokud není přihlášen vůbec → login
 */
onAuthStateChanged(auth, async (user) => {
  if (user && isAdmin(user)) {
    // Admin je přihlášen → panel
    renderPanel().catch(err => {
      document.getElementById("root").innerHTML =
        `<div style="padding:40px;color:#ff6b8a;font-family:monospace;">FATAL: ${esc(err.message)}</div>`;
    });
  } else if (user && !isAdmin(user)) {
    // Přihlášen, ale není admin → odhlásit a zobrazit chybu
    await signOut(auth);
    renderLogin("PŘÍSTUP ODEPŘEN — přihlášený účet nemá admin oprávnění");
  } else {
    // Nikdo přihlášen → login formulář
    renderLogin();
  }
});