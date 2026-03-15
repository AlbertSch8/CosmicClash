/**
 * UFO: Cosmic Clash — Shop systém
 *
 * Co umí:
 *  1. Načíst katalog itemů z kolekce `items`
 *  2. Zobrazit itemy v obchodě
 *  3. Koupit item za Star Coins nebo Galactic Gems
 *  4. Uložit koupený item do kolekce `inventory`
 *  5. Zabránit duplicitnímu nákupu stejného itemu
 */

import {db} from "./firebase.js";
import {
    collection,
    query,
    where,
    orderBy,
    getDocs,
    doc,
    runTransaction,
    Timestamp,
} from "firebase/firestore";


// ─────────────────────────────────────────────
//  NAČTENÍ ITEMŮ
// ─────────────────────────────────────────────

async function loadShopItems() {
    const q = query(
        collection(db, "items"),
        where("isActive", "==", true),
        orderBy("sortOrder", "asc")
    );

    const snap = await getDocs(q);

    return snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
    }));
}


// ─────────────────────────────────────────────
//  NAČTENÍ INVENTÁŘE HRÁČE
// ─────────────────────────────────────────────

async function loadOwnedItemIds(userId) {
    const q = query(
        collection(db, "inventory"),
        where("userId", "==", userId)
    );

    const snap = await getDocs(q);

    return new Set(
        snap.docs.map((d) => {
            const data = d.data();
            return data.itemId;
        })
    );
}


// ─────────────────────────────────────────────
//  NÁKUP ITEMU
// ─────────────────────────────────────────────

async function buyItem(userId, item) {
    const alienRef = doc(db, "aliens", userId);
    const inventoryRef = doc(db, "inventory", `${userId}_${item.id}`);

    await runTransaction(db, async (transaction) => {

        const alienSnap = await transaction.get(alienRef);

        if (!alienSnap.exists()) {
            throw new Error("Profil hráče nebyl nalezen.");
        }

        const inventorySnap = await transaction.get(inventoryRef);

        if (inventorySnap.exists()) {
            throw new Error("Tento item už vlastníš.");
        }

        const alien = alienSnap.data();

        const starCoins = alien.starCoins ?? 0;
        const galacticGems = alien.galacticGems ?? 0;

        const priceCoins = item.priceCoins ?? 0;
        const priceGems = item.priceGems ?? 0;

        if (starCoins < priceCoins) {
            throw new Error("Nemáš dost Star Coins.");
        }

        if (galacticGems < priceGems) {
            throw new Error("Nemáš dost Galactic Gems.");
        }

        transaction.update(alienRef, {
            starCoins: starCoins - priceCoins,
            galacticGems: galacticGems - priceGems,
        });

        transaction.set(inventoryRef, {
            userId,
            itemId: item.id,
            name: item.name ?? "Neznámý item",
            type: item.type ?? "unknown",
            rarity: item.rarity ?? "common",
            hpBonus: item.hpBonus ?? 0,
            dmgBonus: item.dmgBonus ?? 0,
            staminaBonus: item.staminaBonus ?? 0,
            priceCoins,
            priceGems,
            equipped: false,
            ownedAt: Timestamp.now(),
        });
    });
}


// ─────────────────────────────────────────────
//  RENDER SHOPU
// ─────────────────────────────────────────────

export async function renderShopScreen(root, alien, userId, onBack, onRefresh) {

    if (!root) return;

    root.innerHTML = `
    <div class="dash-header">
      <span class="logo-icon">🛒</span>
      <h1>Obchod</h1>
      <p class="subtitle">Galaktický katalog vybavení</p>
    </div>

    <div class="card">
      <p class="section-title">Tvoje měny</p>
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
      <p class="section-title">Katalog</p>
      <div id="shop-items">
        <div class="loading-wrap">
          <div class="spinner"></div>
          <div class="loading-text">Načítám obchod...</div>
        </div>
      </div>
    </div>

    <div class="card">
      <button class="btn btn-primary" id="btn-shop-back">Zpět na dashboard</button>
    </div>
  `;

    document.getElementById("btn-shop-back")?.addEventListener("click", onBack);

    const itemsWrap = document.getElementById("shop-items");

    try {

        const [items, ownedItemIds] = await Promise.all([
            loadShopItems(),
            loadOwnedItemIds(userId),
        ]);

        itemsWrap.innerHTML = items
            .map((item) => renderItemCard(item, ownedItemIds.has(item.id)))
            .join("");

        items.forEach((item) => {

            const isOwned = ownedItemIds.has(item.id);

            const btn = document.getElementById(`buy-${item.id}`);

            if (!btn || isOwned) return;

            btn.addEventListener("click", async () => {

                btn.disabled = true;
                btn.textContent = "Nakupuji...";

                try {

                    await buyItem(userId, item);

                    showToast(`✅ Koupil jsi item: ${item.name}`);

                    await onRefresh();

                } catch (err) {

                    showToast(`❌ ${err.message ?? "Nákup selhal."}`);

                    btn.disabled = false;
                    btn.textContent = "Koupit";
                }
            });
        });

    } catch (err) {

        itemsWrap.innerHTML = `
        <p style="font-size:14px; color:#fca5a5;">
          Nepodařilo se načíst obchod: ${esc(err.message ?? "Neznámá chyba")}
        </p>
      `;
    }
}


// ─────────────────────────────────────────────
//  HTML ITEM KARTY
// ─────────────────────────────────────────────

function renderItemCard(item, isOwned = false) {

    const hpBonus = item.hpBonus ?? 0;
    const dmgBonus = item.dmgBonus ?? 0;
    const staminaBonus = item.staminaBonus ?? 0;

    const priceCoins = item.priceCoins ?? 0;
    const priceGems = item.priceGems ?? 0;

    return `
    <div style="
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 14px;
      padding: 14px;
      margin-bottom: 12px;
    ">

      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">

        <div>

          <div style="font-size:16px;font-weight:700;color:#e8d5ff;margin-bottom:4px;">
            ${esc(item.name ?? "Neznámý item")}
          </div>

          <div style="font-size:12px;color:#a855f7;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">
            ${esc(item.type ?? "unknown")} • ${esc(item.rarity ?? "common")}
          </div>

          <div style="font-size:13px;color:#c4b5d4;line-height:1.5;">
            +${hpBonus} HP<br>
            +${dmgBonus} DMG<br>
            ${item.type === "weapon" ? `${staminaBonus} Stamina / útok` : `+${staminaBonus} Stamina`}
          </div>

        </div>

        <div style="min-width:120px;text-align:right;">
          <div style="font-size:13px;color:#facc15;font-weight:700;">✦ ${priceCoins}</div>
          <div style="font-size:13px;color:#7dd3fc;font-weight:700;">💎 ${priceGems}</div>
        </div>

      </div>

      <button
        class="btn ${isOwned ? "btn-secondary" : "btn-primary"}"
        id="buy-${item.id}"
        style="margin-top:14px;"
        ${isOwned ? "disabled" : ""}
      >
        ${isOwned ? "Vyprodáno" : "Koupit"}
      </button>

    </div>
  `;
}


// ─────────────────────────────────────────────
//  UTILITY
// ─────────────────────────────────────────────

function esc(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function showToast(msg) {

    const old = document.getElementById("cc-toast");
    if (old) old.remove();

    const el = document.createElement("div");

    el.id = "cc-toast";

    el.style.cssText = `
    position:fixed;
    bottom:24px;
    left:50%;
    transform:translateX(-50%);
    background:rgba(15,8,30,.97);
    border:1px solid rgba(123,47,255,.45);
    border-radius:12px;
    padding:12px 22px;
    color:#e8d5ff;
    font-size:13px;
    z-index:200;
    box-shadow:0 4px 24px rgba(123,47,255,.35);
    max-width:320px;
    text-align:center;
  `;

    el.textContent = msg;

    document.body.appendChild(el);

    setTimeout(() => el.remove(), 3200);
}