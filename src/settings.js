// Přidej tento řádek na samý začátek každého src/*.js souboru:
import "./logger.js";

// Volitelně, pro manuální logování zachycených chyb:
import { logError } from "./logger.js";
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";

const AVATARS = [
  { id: "grey",    label: "Grey",    src: "/images/grey.png" },
  { id: "cyborg",  label: "Cyborg",  src: "/images/cyborg.png" },
  { id: "aqua",    label: "Aqua",    src: "/images/aqua.png" },
  { id: "beast",   label: "Beast",   src: "/images/beast.png" },
  { id: "crystal", label: "Crystal", src: "/images/crystal.png" },
  { id: "flora",   label: "Flora",   src: "/images/flora.png" },
  { id: "insect",  label: "Insect",  src: "/images/insect.png" },
  { id: "lizard",  label: "Lizard",  src: "/images/lizard.png" },
  { id: "plasma",  label: "Plasma",  src: "/images/plasma.png" },
  { id: "void",    label: "Void",    src: "/images/void.png" },
];

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function render(root, alien, uid) {
  const currentAvatar = alien.avatarUrl ?? AVATARS[0].src;

  root.innerHTML = `
    <div class="dash-header">
      <img src="/icons/ufo.png" alt="UFO" style="width:52px;height:52px;object-fit:contain;display:block;margin:0 auto 8px;" />
      <h1>Nastavení pilota</h1>
      <p class="subtitle">Upravit profil ufouna</p>
    </div>

    <div class="card">
      <p class="section-title">Jméno pilota</p>
      <div class="field">
        <label for="input-name">Jméno ufouna</label>
        <input type="text" id="input-name" maxlength="32"
               value="${esc(alien.name ?? "")}"
               placeholder="StarLord42" />
      </div>
    </div>

    <div class="card">
      <p class="section-title">Výběr avatara</p>
      <div class="avatar-grid" id="avatar-grid">
        ${AVATARS.map(a => `
          <div class="avatar-option ${a.src === currentAvatar ? "selected" : ""}"
               data-src="${esc(a.src)}">
            <img src="${esc(a.src)}" alt="${esc(a.label)}" />
            <span>${esc(a.label)}</span>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="card">
      <button class="btn btn-primary" id="btn-save">Uložit změny</button>
      <div class="status-msg" id="status-msg"></div>
      <button class="btn btn-secondary" id="btn-back" style="margin-top:8px;">← Zpět na dashboard</button>
    </div>
  `;

  let selectedAvatar = currentAvatar;

  // Výběr avatara kliknutím
  document.querySelectorAll(".avatar-option").forEach(el => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".avatar-option").forEach(x => x.classList.remove("selected"));
      el.classList.add("selected");
      selectedAvatar = el.dataset.src;
    });
  });

  // Uložení
  document.getElementById("btn-save").addEventListener("click", async () => {
    const nameVal = document.getElementById("input-name").value.trim();
    const btn     = document.getElementById("btn-save");
    const status  = document.getElementById("status-msg");

    if (!nameVal) {
      status.textContent = "Jméno nesmí být prázdné.";
      status.className = "status-msg error";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Ukládám…";
    status.className = "status-msg";

    try {
      await updateDoc(doc(db, "aliens", uid), {
        name:      nameVal,
        avatarUrl: selectedAvatar,
      });
      status.textContent = "✓ Nastavení uloženo!";
      status.className = "status-msg success";
    } catch (err) {
      console.error("[CosmicClash/settings]", err);
      status.textContent = "Chyba při ukládání: " + err.message;
      status.className = "status-msg error";
    } finally {
      btn.disabled = false;
      btn.textContent = "Uložit změny";
    }
  });

  document.getElementById("btn-back").addEventListener("click", () => {
    window.location.href = "/dashboard.html";
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.replace("/index.html"); return; }

  const root = document.getElementById("root");
  try {
    const snap = await getDoc(doc(db, "aliens", user.uid));
    if (!snap.exists()) throw new Error("Profil nenalezen.");
    render(root, snap.data(), user.uid);
  } catch (err) {
    root.innerHTML = `
      <div class="card">
        <p style="color:#fca5a5;margin-bottom:14px;">${esc(err.message)}</p>
        <button class="btn btn-secondary" onclick="window.location.href='/dashboard.html'">← Zpět</button>
      </div>
    `;
  }
});