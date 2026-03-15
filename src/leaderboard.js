/**
 * UFO: Cosmic Clash — Leaderboard (Krok 5)
 * Autor: Alexandre Basseville
 *
 * Odpovědnosti tohoto modulu:
 *  1. Načtení top hráčů z kolekce `aliens` seřazených dle level DESC, xp DESC
 *  2. Renderování přehledné tabulky žebříčku do předaného DOM elementu
 *  3. Zvýraznění aktuálně přihlášeného hráče v tabulce
 *  4. Zobrazení medailí pro top 3 pozice
 */

import { db } from "./firebase.js";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";

// ─────────────────────────────────────────────
//  KONSTANTY
// ─────────────────────────────────────────────

/** Maximální počet hráčů zobrazených na leaderboardu. */
const LEADERBOARD_LIMIT = 20;

/** Medaile pro první tři pozice. */
const MEDALS = ["🥇", "🥈", "🥉"];

// ─────────────────────────────────────────────
//  NAČTENÍ DAT
// ─────────────────────────────────────────────

/**
 * Načte top hráče z Firestore.
 *
 * Řazení: primárně level DESC, sekundárně xp DESC.
 * Firestore neumí ORDER BY dvěma poli v různém směru bez composite indexu —
 * oba jsou DESC, takže composite index pokrývá oba najednou.
 *
 * @returns {Promise<Array<{id: string, data: object}>>}
 */
export async function fetchLeaderboard() {
  const q = query(
    collection(db, "aliens"),
    orderBy("level", "desc"),
    orderBy("xp",    "desc"),
    limit(LEADERBOARD_LIMIT)
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

// ─────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────

/**
 * Vykreslí leaderboard obrazovku do předaného DOM elementu.
 *
 * @param {HTMLElement} container  – cílový DOM element (typicky #root)
 * @param {string}      currentUid – UID přihlášeného hráče (pro zvýraznění)
 * @param {Function}    onBack     – callback pro návrat na dashboard
 */
export async function renderLeaderboardScreen(container, currentUid, onBack) {
  // Zobrazíme loading stav
  container.innerHTML = _html_loading("Načítám žebříček…");

  try {
    const players = await fetchLeaderboard();
    _renderTable(container, players, currentUid, onBack);
  } catch (err) {
    console.error("[CosmicClash/leaderboard] Chyba při načítání:", err);
    container.innerHTML = `
      <div class="dash-header">
        <span class="logo-icon">💥</span>
        <h1>Chyba</h1>
        <p class="subtitle">Nepodařilo se načíst žebříček</p>
      </div>
      <div class="card">
        <p style="color:#fca5a5;font-size:14px;margin-bottom:14px;">
          ${_esc(err.message)}
        </p>
        <button class="btn btn-secondary" id="btn-back-dashboard">← Zpět</button>
      </div>
    `;
    container.querySelector("#btn-back-dashboard")?.addEventListener("click", onBack);
  }
}

// ─────────────────────────────────────────────
//  PRIVÁTNÍ RENDER FUNKCE
// ─────────────────────────────────────────────

function _renderTable(container, players, currentUid, onBack) {
  // Najdeme pozici přihlášeného hráče (může být mimo top 20)
  const myRank = players.findIndex((p) => p.id === currentUid);

  const rows = players.map((player, index) => {
    const { data } = player;
    const isMe   = player.id === currentUid;
    const medal  = MEDALS[index] ?? null;
    const rank   = index + 1;

    // XP progress k dalšímu levelu
    const xpReq  = (data.level ?? 1) * 100;
    const xpPct  = Math.min(Math.round(((data.xp ?? 0) / xpReq) * 100), 100);

    return `
      <div class="lb-row ${isMe ? "lb-row-me" : ""} ${index < 3 ? "lb-row-top3" : ""}">

        <!-- Rank + medaile -->
        <div class="lb-rank">
          ${medal
            ? `<span class="lb-medal">${medal}</span>`
            : `<span class="lb-number">#${rank}</span>`
          }
        </div>

        <!-- Jméno a level -->
        <div class="lb-main">
          <div class="lb-name" style="gap:10px;">
            ${data.avatarUrl
              ? `<img src="${_esc(data.avatarUrl)}" alt="avatar"
                      style="width:28px;height:28px;object-fit:contain;border-radius:6px;" />`
              : ""
            }
            ${_esc(data.name ?? "Neznámý")}
            ${isMe ? '<span class="lb-you-badge">ty</span>' : ""}
          </div>
          <div class="lb-origin">${_esc(data.type ?? data.origin ?? "Neznámý původ")}</div>

          <!-- XP progress bar -->
          <div class="lb-xp-wrap">
            <div class="lb-xp-bar">
              <div class="lb-xp-fill" style="width:${xpPct}%"></div>
            </div>
            <span class="lb-xp-text">${data.xp ?? 0} / ${xpReq} XP</span>
          </div>
        </div>

        <!-- Statistiky -->
        <div class="lb-stats">
          <div class="lb-level">Lv.${data.level ?? 1}</div>
          <div class="lb-sub-stats">
            <span title="HP">❤️ ${data.hp ?? 100}</span>
            <span title="DMG">⚔️ ${data.dmg ?? 10}</span>
            <span title="Star Coins">✦ ${data.starCoins ?? 0}</span>
          </div>
        </div>

      </div>
    `;
  }).join("");

  // Pokud je přihlášený hráč mimo top 20, ukážeme jeho pozici zvlášť
  const outsideNote = myRank === -1
    ? `<p class="lb-outside-note">
        Tvůj ufoun není v top ${LEADERBOARD_LIMIT}.
        Trénuj a bojuj, abys se dostal do žebříčku!
       </p>`
    : "";

  container.innerHTML = `
    <div class="dash-header">
      <span class="logo-icon">🏆</span>
      <h1>Galaktický žebříček</h1>
      <p class="subtitle">Top ${LEADERBOARD_LIMIT} pilotů vesmíru</p>
    </div>

    <div class="card lb-card">
      <p class="section-title">Nejlepší ufonové</p>

      ${players.length === 0
        ? `<div class="lb-empty">Zatím žádní hráči. Buď první!</div>`
        : `<div class="lb-list">${rows}</div>`
      }

      ${outsideNote}
    </div>

    <div class="card">
      <button class="btn btn-secondary" id="btn-back-dashboard">← Zpět na dashboard</button>
    </div>
  `;

  container.querySelector("#btn-back-dashboard")?.addEventListener("click", onBack);
}

// ─────────────────────────────────────────────
//  HTML UTILITY
// ─────────────────────────────────────────────

function _html_loading(text) {
  return `
    <div class="loading-wrap">
      <div class="spinner"></div>
      <p class="loading-text">${_esc(text)}</p>
    </div>
  `;
}

/** HTML-escape — ochrana proti XSS při vkládání dat z DB do innerHTML. */
function _esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}