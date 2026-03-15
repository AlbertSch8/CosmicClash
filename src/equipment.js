import { db } from "./firebase.js";
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    getDoc,
    updateDoc,
} from "firebase/firestore";

// ─────────────────────────────────────────────
//  NAČTENÍ INVENTÁŘE
// ─────────────────────────────────────────────

async function loadInventory(userId) {
    const q = query(
        collection(db, "inventory"),
        where("userId", "==", userId)
    );

    const snap = await getDocs(q);

    return snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
    }));
}

async function loadAlien(userId) {
    const snap = await getDoc(doc(db, "aliens", userId));
    if (!snap.exists()) {
        throw new Error("Profil hráče nebyl nalezen.");
    }
    return snap.data();
}

// ─────────────────────────────────────────────
//  EQUIP / UNEQUIP
// ─────────────────────────────────────────────

async function equipItem(userId, item) {
    const alienRef = doc(db, "aliens", userId);

    if (item.type === "weapon") {
        await updateDoc(alienRef, {
            equippedWeaponId: item.itemId,
        });
        return;
    }

    if (item.type === "armor") {
        await updateDoc(alienRef, {
            equippedArmorId: item.itemId,
        });
        return;
    }

    throw new Error("Neznámý typ itemu.");
}

async function unequipItem(userId, itemType) {
    const alienRef = doc(db, "aliens", userId);

    if (itemType === "weapon") {
        await updateDoc(alienRef, {
            equippedWeaponId: null,
        });
        return;
    }

    if (itemType === "armor") {
        await updateDoc(alienRef, {
            equippedArmorId: null,
        });
        return;
    }

    throw new Error("Neznámý slot.");
}

// ─────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────

export async function renderEquipmentScreen(root, alien, userId, onBack, onRefresh) {
    if (!root) return;

    root.innerHTML = `
    <div class="dash-header">
      <span class="logo-icon">🛡️</span>
      <h1>Vybavení</h1>
      <p class="subtitle">Inventář a aktivní výbava</p>
    </div>

    <div class="card">
      <p class="section-title">Aktivně nasazeno</p>
      <div id="equipment-slots">
        <div class="loading-wrap">
          <div class="loading-text">Načítám sloty...</div>
        </div>
      </div>
    </div>

    <div class="card">
      <p class="section-title">Tvůj inventář</p>
      <div id="equipment-items">
        <div class="loading-wrap">
          <div class="loading-text">Načítám inventář...</div>
        </div>
      </div>
    </div>

    <div class="card">
      <button class="btn btn-primary" id="btn-equipment-back">Zpět na dashboard</button>
    </div>
  `;

    document.getElementById("btn-equipment-back")?.addEventListener("click", onBack);

    const slotsWrap = document.getElementById("equipment-slots");
    const itemsWrap = document.getElementById("equipment-items");

    try {
        const [inventory, freshAlien] = await Promise.all([
            loadInventory(userId),
            loadAlien(userId),
        ]);

        renderSlots(slotsWrap, freshAlien, inventory);

        if (!inventory.length) {
            itemsWrap.innerHTML = `
        <p style="font-size:14px; color:#c4b5d4;">
          Inventář je zatím prázdný. Nejprve si kup item v obchodě.
        </p>
      `;
            return;
        }

        const weapons = inventory.filter((item) => item.type === "weapon");
        const armors = inventory.filter((item) => item.type === "armor");

        itemsWrap.innerHTML = `
      ${renderInventorySection("Zbraně", weapons, freshAlien)}
      ${renderInventorySection("Brnění", armors, freshAlien)}
    `;

        inventory.forEach((item) => {
            const equipBtn = document.getElementById(`equip-${item.id}`);
            const unequipBtn = document.getElementById(`unequip-${item.id}`);

            equipBtn?.addEventListener("click", async () => {
                equipBtn.disabled = true;
                equipBtn.textContent = "Ukládám...";

                try {
                    await equipItem(userId, item);
                    showToast(`Nasazeno: ${item.name}`);
                    await onRefresh();
                } catch (err) {
                    showToast(err.message ?? "Nasazení selhalo.");
                    equipBtn.disabled = false;
                    equipBtn.textContent = "Nasadit";
                }
            });

            unequipBtn?.addEventListener("click", async () => {
                unequipBtn.disabled = true;
                unequipBtn.textContent = "Ukládám...";

                try {
                    await unequipItem(userId, item.type);
                    showToast(`Sundáno: ${item.name}`);
                    await onRefresh();
                } catch (err) {
                    showToast(err.message ?? "Sundání selhalo.");
                    unequipBtn.disabled = false;
                    unequipBtn.textContent = "Sundat";
                }
            });
        });
    } catch (err) {
        slotsWrap.innerHTML = `
      <p style="font-size:14px; color:#fca5a5;">
        Nepodařilo se načíst vybavení: ${esc(err.message ?? "Neznámá chyba")}
      </p>
    `;
        itemsWrap.innerHTML = "";
    }
}

// ─────────────────────────────────────────────
//  RENDER SLOTS
// ─────────────────────────────────────────────

function renderSlots(root, alien, inventory) {
    const equippedWeaponId = alien.equippedWeaponId ?? null;
    const equippedArmorId = alien.equippedArmorId ?? null;

    const equippedWeapon = inventory.find((item) => item.itemId === equippedWeaponId) ?? null;
    const equippedArmor = inventory.find((item) => item.itemId === equippedArmorId) ?? null;

    root.innerHTML = `
    ${renderSlotCard("Weapon", equippedWeapon, "⚔️")}
    ${renderSlotCard("Armor", equippedArmor, "🛡️")}
  `;
}

function renderSlotCard(label, item, icon) {
    if (!item) {
        return `
      <div class="stat-row" style="margin-bottom:10px;">
        <span class="stat-label">${icon} ${label}</span>
        <span class="stat-value">Prázdné</span>
      </div>
    `;
    }

    return `
    <div style="
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 10px;
    ">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
        <div>
          <div style="font-size:13px;color:#a855f7;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">
            ${icon} ${esc(label)}
          </div>
          <div style="font-size:15px;font-weight:700;color:#e8d5ff;">
            ${esc(item.name ?? "Neznámý item")}
          </div>
          <div style="font-size:12px;color:#c4b5d4;margin-top:4px;">
            +${item.hpBonus ?? 0} HP · +${item.dmgBonus ?? 0} DMG · ${item.type === "weapon" ? `${item.staminaBonus ?? 0} STA / útok` : `+${item.staminaBonus ?? 0} STA`}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────
//  RENDER INVENTÁŘE
// ─────────────────────────────────────────────

function renderInventorySection(title, items, alien) {
    if (!items.length) {
        return `
      <div style="margin-bottom:18px;">
        <div style="font-size:14px;font-weight:700;color:#e8d5ff;margin-bottom:8px;">${esc(title)}</div>
        <p style="font-size:13px;color:#c4b5d4;">Nic tu zatím není.</p>
      </div>
    `;
    }

    return `
    <div style="margin-bottom:18px;">
      <div style="font-size:14px;font-weight:700;color:#e8d5ff;margin-bottom:8px;">${esc(title)}</div>
      ${items.map((item) => renderInventoryItem(item, alien)).join("")}
    </div>
  `;
}

function renderInventoryItem(item, alien) {
    const isEquipped =
        (item.type === "weapon" && alien.equippedWeaponId === item.itemId) ||
        (item.type === "armor" && alien.equippedArmorId === item.itemId);

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
            +${item.hpBonus ?? 0} HP<br>
            +${item.dmgBonus ?? 0} DMG<br>
            ${item.type === "weapon" ? `${item.staminaBonus ?? 0} Stamina / útok` : `+${item.staminaBonus ?? 0} Stamina`}
          </div>
        </div>

        <div style="min-width:120px;text-align:right;">
          ${
        isEquipped
            ? `<div style="font-size:12px;color:#00e5a0;font-weight:700;">NASAZENO</div>`
            : `<div style="font-size:12px;color:#c4b5d4;">V inventáři</div>`
    }
        </div>
      </div>

      ${
        isEquipped
            ? `<button class="btn btn-secondary" id="unequip-${item.id}" style="margin-top:14px;">Sundat</button>`
            : `<button class="btn btn-primary" id="equip-${item.id}" style="margin-top:14px;">Nasadit</button>`
    }
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