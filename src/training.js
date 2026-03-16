/**
 * UFO: Cosmic Clash — Tréninkový systém (Krok 3)
 *
 * Odpovědnosti tohoto modulu:
 *  1. Definice tréninkových režimů (Galaktická posilovna, Vesmírný běh)
 *  2. Spuštění tréninku — zápis nové session do Firestore (kolekce trainingSessions)
 *  3. Detekce aktivní / dokončené session při každém načtení stránky (reload-safe)
 *  4. Živý odpočet do konce tréninku (countdown) napojený na endTime z DB
 *  5. Vyzvednutí odměn — atomický update aliens + označení rewardsClaimed=true
 *  6. Blokování souboje po dobu aktivního tréninku
 *  7. Renderování celé tréninkové obrazovky do předaného DOM elementu
 */

import "./logger.js";
import { db } from "./firebase.js";
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { TrainingSessionLogic } from "./logic/training-session-logic.js";

// ─────────────────────────────────────────────
//  KONSTANTY A DEFINICE TRÉNINKOVÝCH REŽIMŮ
// ─────────────────────────────────────────────

/** Délka jedné tréninkové session v milisekundách (1 hodina). */
export const TRAINING_DURATION_MS = 60 * 60 * 1000;

/**
 * Katalog dostupných tréninkových režimů.
 *
 * Každý režim obsahuje:
 *   id          – interní identifikátor (ukládá se do Firestore)
 *   label       – zobrazovaný název
 *   icon        – emoji ikona
 *   description – popis pro hráče
 *   cost        – cena ve Star Coins (musí být nižší než cena souboje)
 *   rewards     – co hráč získá po dokončení
 *   statDeltas  – změny statistik aplikované na dokument aliens
 */
export const TRAINING_MODES = {
  gym: {
    id: "gym",
    label: "Galaktická posilovna",
    icon: "🏋️",
    description: "Intenzivní silový trénink s gravitačními závažemi z Orionu. Posiluje tělo i zbraňové reflexy.",
    cost: 10, // Star Coins — záměrně nižší než cena souboje (15 SC)
    rewards: {
      xp: 30,
      starCoins: 8,
      description: "+30 XP, +8 ✦, +8 HP, +2 DMG",
    },
    statDeltas: {
      hp:  8,
      dmg: 2,
      stamina: 0,
    },
  },
  run: {
    id: "run",
    label: "Vesmírný běh",
    icon: "🚀",
    description: "Vytrvalostní sprint v nízké gravitaci mezi asteroidovými pásy. Dramaticky zvyšuje staminu a regeneraci.",
    cost: 8, // Star Coins — nejlevnější volba
    rewards: {
      xp: 20,
      starCoins: 5,
      description: "+20 XP, +5 ✦, +15 Stamina",
    },
    statDeltas: {
      hp:     0,
      dmg:    0,
      stamina: 15,
    },
  },
};

// ─────────────────────────────────────────────
//  FIRESTORE HELPERS
// ─────────────────────────────────────────────

/**
 * Vrátí referenci na dokument aliens konkrétního hráče.
 * @param {string} uid
 */
function alienRef(uid) {
  return doc(db, "aliens", uid);
}

/**
 * Načte nejnovější tréninkovou session hráče z Firestore (bez ohledu na status).
 * Vrací null pokud žádná neexistuje.
 *
 * @param {string} uid
 * @returns {Promise<{id: string, data: object}|null>}
 */
export async function fetchLatestSession(uid) {
  const q = query(
    collection(db, "trainingSessions"),
    where("userId", "==", uid),
    orderBy("startTime", "desc"),
    limit(1)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const docSnap = snap.docs[0];
  return { id: docSnap.id, data: docSnap.data() };
}

/**
 * Vrátí aktuálně aktivní (probíhající) session nebo null.
 * Session je "aktivní" pokud má status "active" a endTime je v budoucnosti.
 *
 * @param {string} uid
 * @returns {Promise<{id: string, data: object}|null>}
 */
export async function fetchActiveSession(uid) {
  const latest = await fetchLatestSession(uid);
  if (!latest) return null;

  if (!TrainingSessionLogic.isSessionActive(latest.data)) {
    // Session sice stále nese status "active", ale čas vypršel.
    // Necháme ji tak — označíme jako "done" až při vyzvednutí odměny.
    return null;
  }

  return latest;
}

/**
 * Vrátí dokončenou, ale nevyzvednutou session (odměna čeká na hráče).
 *
 * @param {string} uid
 * @returns {Promise<{id: string, data: object}|null>}
 */
export async function fetchPendingRewardSession(uid) {
  const latest = await fetchLatestSession(uid);
  if (!latest) return null;

  return TrainingSessionLogic.hasPendingReward(latest.data) ? latest : null;
}

// ─────────────────────────────────────────────
//  SPUŠTĚNÍ TRÉNINKU
// ─────────────────────────────────────────────

/**
 * Spustí novou tréninkovou session.
 *
 * Validace (v pořadí):
 *  1. Hráč existuje v DB
 *  2. Hráč má dostatek Star Coins
 *  3. Žádná aktivní session neprobíhá
 *
 * Po úspěšné validaci:
 *  - Odečte Star Coins z dokumentu aliens (atomicky)
 *  - Vytvoří nový dokument v kolekci trainingSessions
 *
 * @param {string} uid          – Firebase UID hráče
 * @param {string} trainingType – klíč z TRAINING_MODES ("gym" | "run")
 * @returns {Promise<{sessionId: string, session: object}>}
 * @throws {Error} při nedostatku SC, aktivní session nebo chybějícím profilu
 */
export async function startTrainingSession(uid, trainingType) {
  const mode = TRAINING_MODES[trainingType];
  if (!mode) throw new Error(`Neznámý typ tréninku: ${trainingType}`);

  // 1) Načteme profil hráče
  const alienSnap = await getDoc(alienRef(uid));
  if (!alienSnap.exists()) throw new Error("Profil hráče nebyl nalezen.");
  const alien = alienSnap.data();

  // 2) Ověříme Star Coins
  const currentCoins = alien.starCoins ?? 0;
  if (currentCoins < mode.cost) {
    throw new Error(
      `Nedostatek Star Coins. Potřebuješ ${mode.cost} ✦, máš ${currentCoins} ✦.`
    );
  }

  // 3) Zkontrolujeme, zda neprobíhá jiná session
  const active = await fetchActiveSession(uid);
  if (active) {
    throw new Error("Trénink už probíhá. Počkej na jeho dokončení.");
  }

  // Výpočet časů
  const now    = Date.now();
  const endMs  = now + TRAINING_DURATION_MS;

  // 4) Atomicky odečteme Star Coins
  await updateDoc(alienRef(uid), {
    starCoins: currentCoins - mode.cost,
  });

  // 5) Vytvoříme session dokument
  const sessionData = {
    userId:         uid,
    trainingType:   trainingType,
    startTime:      Timestamp.fromMillis(now),
    endTime:        Timestamp.fromMillis(endMs),
    status:         "active",     // "active" | "done"
    rewardsClaimed: false,
  };

  const sessionRef = await addDoc(collection(db, "trainingSessions"), sessionData);

  return { sessionId: sessionRef.id, session: sessionData };
}

// ─────────────────────────────────────────────
//  VYZVEDNUTÍ ODMĚN
// ─────────────────────────────────────────────

/**
 * Vyzvedne odměny za dokončený trénink.
 *
 * Bezpečnostní kontroly:
 *  - Ověří, že session existuje a patří danému hráči (userId === uid)
 *  - Ověří, že rewardsClaimed === false (nelze vyzvednout dvakrát)
 *  - Ověří, že čas tréninku skutečně vypršel (endTime <= now)
 *
 * Po validaci:
 *  - Označí session jako status="done", rewardsClaimed=true
 *  - Přičte odměny (XP, SC, statDeltas) do dokumentu aliens
 *
 * @param {string} uid       – Firebase UID hráče
 * @param {string} sessionId – ID dokumentu v kolekci trainingSessions
 * @returns {Promise<{mode: object, alien: object}>} – mode config + aktualizovaná data aliens
 * @throws {Error} při pokusech o duplikátní claim nebo nenalezeném dokumentu
 */
export async function claimTrainingRewards(uid, sessionId) {
  // 1) Načteme session
  const sessionDocRef = doc(db, "trainingSessions", sessionId);
  const sessionSnap   = await getDoc(sessionDocRef);

  if (!sessionSnap.exists()) throw new Error("Tréninková session nebyla nalezena.");
  const session = sessionSnap.data();

  // 2) Ověříme vlastnictví
  if (session.userId !== uid) throw new Error("Tato session nepatří přihlášenému hráči.");

  // 3) Ověříme, že odměna nebyla již vyzvednuta
  if (session.rewardsClaimed === true) {
    throw new Error("Odměna za tento trénink již byla vyzvednuta.");
  }

  // 4) Ověříme, že čas opravdu vypršel (ochrana před předčasným claimem)
  const endMs = TrainingSessionLogic.toMillis(session.endTime);

  if (Date.now() < endMs) {
    const remaining = TrainingSessionLogic.remainingSeconds(endMs);
    throw new Error(`Trénink ještě neskončil. Zbývá ${remaining} sekund.`);
  }

  // 5) Načteme aktuální data hráče
  const alienSnap = await getDoc(alienRef(uid));
  if (!alienSnap.exists()) throw new Error("Profil hráče nebyl nalezen.");
  const alien = alienSnap.data();

  // 6) Získáme konfiguraci režimu
  const mode = TRAINING_MODES[session.trainingType];
  if (!mode) throw new Error(`Neznámý typ tréninku v session: ${session.trainingType}`);

  // 7) Vypočítáme nové hodnoty (s ochranou stamina max=100)
  const claimedStats = TrainingSessionLogic.computeClaimedStats(alien, mode);

  // 8) Zapíšeme odměny do aliens (atomicky)
  await updateDoc(alienRef(uid), {
    xp: claimedStats.xp,
    starCoins: claimedStats.starCoins,
    hp: claimedStats.hp,
    dmg: claimedStats.dmg,
    stamina: claimedStats.stamina,
  });

  // 9) Označíme session jako dokončenou a odměnu jako vyzdvihnutou
  await updateDoc(sessionDocRef, {
    status:         "done",
    rewardsClaimed: true,
  });

  return {
    mode,
    alien: { ...alien, ...claimedStats },
  };
}

// ─────────────────────────────────────────────
//  STAV SOUBOJE — blokování
// ─────────────────────────────────────────────

/**
 * Vrací true pokud je hráč momentálně v aktivním tréninku.
 * Používá se v battle modulu pro blokování souboje.
 *
 * @param {string} uid
 * @returns {Promise<boolean>}
 */
export async function isTrainingActive(uid) {
  const session = await fetchActiveSession(uid);
  return session !== null;
}

// ─────────────────────────────────────────────
//  COUNTDOWN HELPER
// ─────────────────────────────────────────────

/** Aktivní interval ID pro tréninkový countdown (pro cleanup). */
let trainingCountdownInterval = null;

/**
 * Spustí sekundový countdown do konce tréninku a aktualizuje DOM element.
 * Bezpečný pro reload — vychází z endTime z Firestore, ne ze start + elapsed.
 *
 * @param {number}   endMs      – cílový čas v ms epoch (z Firestore Timestamp)
 * @param {string}   elementId  – ID DOM elementu, kam se píše zbývající čas
 * @param {Function} onComplete – callback zavolaný, když čas doběhne
 */
export function startTrainingCountdown(endMs, elementId, onComplete) {
  // Vyčistíme případný předchozí interval
  if (trainingCountdownInterval) clearInterval(trainingCountdownInterval);

  function tick() {
    const el = document.getElementById(elementId);
    if (!el) {
      clearInterval(trainingCountdownInterval);
      return;
    }

    const remaining = endMs - Date.now();

    if (remaining <= 0) {
      clearInterval(trainingCountdownInterval);
      el.textContent = "00:00:00";
      if (typeof onComplete === "function") onComplete();
      return;
    }

    const totalSecs = Math.ceil(remaining / 1000);
    const h  = Math.floor(totalSecs / 3600);
    const m  = Math.floor((totalSecs % 3600) / 60);
    const s  = totalSecs % 60;
    el.textContent = [h, m, s]
      .map((v) => String(v).padStart(2, "0"))
      .join(":");
  }

  tick();
  trainingCountdownInterval = setInterval(tick, 1000);
}

/** Zastaví tréninkový countdown (volat při přechodu na jinou obrazovku). */
export function stopTrainingCountdown() {
  if (trainingCountdownInterval) {
    clearInterval(trainingCountdownInterval);
    trainingCountdownInterval = null;
  }
}

// ─────────────────────────────────────────────
//  RENDER TRÉNINKOVÉ OBRAZOVKY
// ─────────────────────────────────────────────

/**
 * Vykreslí celou tréninkovou obrazovku do předaného DOM elementu.
 *
 * Orchestruje tři stavy:
 *   A) Žádná session → výběr tréninkového režimu
 *   B) Aktivní session → odpočet
 *   C) Dokončená, nevyzvednutá session → tlačítko pro odměnu
 *
 * @param {HTMLElement} container  – DOM element pro vykreslení
 * @param {object}      alien      – aktuální data hráče z Firestore
 * @param {string}      uid        – Firebase UID hráče
 * @param {Function}    onBack     – callback pro návrat na dashboard
 * @param {Function}    onRefresh  – callback pro znovunačtení dat hráče po claimi
 */
export async function renderTrainingScreen(container, alien, uid, onBack, onRefresh) {
  // Nejprve zobrazíme loading stav
  container.innerHTML = _html_loading("Načítám trénink…");

  try {
    // Zkontrolujeme stav sessions v Firestore
    const pendingSession = await fetchPendingRewardSession(uid);
    const activeSession  = pendingSession ? null : await fetchActiveSession(uid);

    if (pendingSession) {
      // ── Stav C: odměna čeká na vyzvednutí ──────────────────────────────
      _renderRewardReady(container, alien, uid, pendingSession, onBack, onRefresh);

    } else if (activeSession) {
      // ── Stav B: trénink probíhá ─────────────────────────────────────────
      _renderActiveTraining(container, alien, uid, activeSession, onBack, onRefresh);

    } else {
      // ── Stav A: výběr režimu ────────────────────────────────────────────
      _renderModeSelection(container, alien, uid, onBack, onRefresh);
    }

  } catch (err) {
    console.error("[CosmicClash/training] Chyba při načítání tréninku:", err);
    container.innerHTML = _html_error(err.message, onBack);
    _bindBackButton(container, onBack);
  }
}

// ─────────────────────────────────────────────
//  PRIVÁTNÍ RENDER FUNKCE
// ─────────────────────────────────────────────

/**
 * Stav A – výběr tréninkového režimu.
 */
function _renderModeSelection(container, alien, uid, onBack, onRefresh) {
  const coins = alien.starCoins ?? 0;

  const modeCards = Object.values(TRAINING_MODES).map((mode) => {
    const canAfford = coins >= mode.cost;
    return `
      <div class="training-mode-card ${canAfford ? "" : "mode-disabled"}">
        <div class="mode-header">
          <span class="mode-icon">${mode.icon}</span>
          <div class="mode-info">
            <p class="mode-label">${_esc(mode.label)}</p>
            <p class="mode-cost ${canAfford ? "cost-ok" : "cost-nok"}">
              ${canAfford ? "✦" : "⚠️"} ${mode.cost} Star Coins
            </p>
          </div>
        </div>
        <p class="mode-desc">${_esc(mode.description)}</p>
        <div class="mode-rewards">
          <span class="reward-tag">⏱ 1 hodina</span>
          <span class="reward-tag">🎁 ${_esc(mode.rewards.description)}</span>
        </div>
        <button
          class="btn btn-primary mode-start-btn"
          data-type="${mode.id}"
          ${canAfford ? "" : "disabled"}
        >
          ${canAfford ? "Zahájit trénink" : "Nedostatek ✦"}
        </button>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="dash-header">
      <span class="logo-icon">🏋️</span>
      <h1>Tréninkové centrum</h1>
      <p class="subtitle">Vyber si svůj trénink</p>
    </div>

    <div class="card">
      <p class="section-title">Tvoje zdroje</p>
      <div class="stat-row">
        <span class="stat-label">Star Coins</span>
        <span class="stat-value">✦ ${coins}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Aktuální HP / DMG / Stamina</span>
        <span class="stat-value">${alien.hp ?? 100} / ${alien.dmg ?? 10} / ${alien.stamina ?? 100}</span>
      </div>
    </div>

    <div class="card">
      <p class="section-title">Dostupné tréninkové režimy</p>
      <div class="training-modes">
        ${modeCards}
      </div>
    </div>

    <div class="card">
      <button class="btn btn-secondary" id="btn-back-dashboard">← Zpět na dashboard</button>
    </div>
  `;

  // Event listenery pro start tlačítka
  container.querySelectorAll(".mode-start-btn:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const type = btn.dataset.type;
      btn.disabled = true;
      btn.textContent = "Spouštím…";

      try {
        await startTrainingSession(uid, type);
        // Po úspěšném spuštění znovu vykreslíme obrazovku (ukáže countdown)
        await renderTrainingScreen(container, alien, uid, onBack, onRefresh);
      } catch (err) {
        console.error("[CosmicClash/training] Chyba při spuštění:", err);
        // Zobrazíme toast a obnovíme tlačítko
        _showToast(`❌ ${err.message}`);
        btn.disabled = false;
        btn.textContent = "Zahájit trénink";
      }
    });
  });

  _bindBackButton(container, onBack);
}

/**
 * Stav B – aktivní trénink, countdown.
 */
function _renderActiveTraining(container, alien, uid, session, onBack, onRefresh) {
  const { data, id } = session;
  const mode = TRAINING_MODES[data.trainingType] ?? {
    label: data.trainingType, icon: "🏋️", rewards: { description: "—" },
  };

  const endMs    = data.endTime instanceof Timestamp ? data.endTime.toMillis() : data.endTime;
  const startMs  = data.startTime instanceof Timestamp ? data.startTime.toMillis() : data.startTime;
  const totalMs  = endMs - startMs;

  container.innerHTML = `
    <div class="dash-header">
      <span class="logo-icon">${mode.icon}</span>
      <h1>${_esc(mode.label)}</h1>
      <p class="subtitle">Trénink probíhá…</p>
    </div>

    <div class="card training-active-card">
      <p class="section-title">Zbývající čas</p>
      <div class="countdown-display" id="training-countdown">--:--:--</div>
      <div class="training-progress-wrap">
        <div class="progress-bar">
          <div class="progress-fill training-fill" id="training-progress-fill" style="width:0%"></div>
        </div>
        <p class="progress-hint">Trénink završíš za 1 hodinu od zahájení</p>
      </div>
    </div>

    <div class="card">
      <p class="section-title">Očekávané odměny</p>
      <p class="reward-preview">${_esc(mode.rewards.description)}</p>
      <div class="stat-row" style="margin-top:10px">
        <span class="stat-label">⚠️ Souboj</span>
        <span class="stat-value" style="color:#fca5a5">Zablokován během tréninku</span>
      </div>
    </div>

    <div class="card">
      <button class="btn btn-secondary" id="btn-back-dashboard">← Zpět na dashboard</button>
    </div>
  `;

  // Spustíme countdown napojený na endTime z DB
  startTrainingCountdown(endMs, "training-countdown", () => {
    // Čas doběhl → znovu vykreslíme (přejde do stavu C)
    renderTrainingScreen(container, alien, uid, onBack, onRefresh);
  });

  // Animovaný progress bar (1× za sekundu)
  const progressInterval = setInterval(() => {
    const el = document.getElementById("training-progress-fill");
    if (!el) { clearInterval(progressInterval); return; }
    const elapsed  = Date.now() - startMs;
    const pct      = Math.min(Math.round((elapsed / totalMs) * 100), 100);
    el.style.width = `${pct}%`;
  }, 1000);

  _bindBackButton(container, onBack);
}

/**
 * Stav C – trénink dokončen, odměna čeká.
 */
function _renderRewardReady(container, alien, uid, session, onBack, onRefresh) {
  const { data, id } = session;
  const mode = TRAINING_MODES[data.trainingType] ?? {
    label: data.trainingType, icon: "🎁", rewards: { description: "—" },
  };

  container.innerHTML = `
    <div class="dash-header">
      <span class="logo-icon">🎉</span>
      <h1>Trénink dokončen!</h1>
      <p class="subtitle">${_esc(mode.label)}</p>
    </div>

    <div class="card reward-card">
      <p class="section-title">Tvoje odměny</p>
      <p class="reward-preview reward-preview-big">${_esc(mode.rewards.description)}</p>
      <p class="reward-hint">Odměna se automaticky připíše k tvým statistikám.</p>
      <button class="btn btn-primary" id="btn-claim-reward">
        🎁 Vyzvednout odměnu
      </button>
    </div>

    <div class="card">
      <button class="btn btn-secondary" id="btn-back-dashboard">← Zpět na dashboard</button>
    </div>
  `;

  document.getElementById("btn-claim-reward").addEventListener("click", async () => {
    const claimBtn = document.getElementById("btn-claim-reward");
    claimBtn.disabled = true;
    claimBtn.textContent = "Zpracovávám…";

    try {
      const result = await claimTrainingRewards(uid, id);
      _showToast(`✅ Odměna vyzvednuta! ${mode.rewards.description}`);

      // Obnovíme data hráče a vrátíme se na dashboard
      if (typeof onRefresh === "function") {
        await onRefresh();
      } else {
        onBack();
      }
    } catch (err) {
      console.error("[CosmicClash/training] Chyba při vyzvednutí odměny:", err);
      _showToast(`❌ ${err.message}`);
      claimBtn.disabled = false;
      claimBtn.textContent = "🎁 Vyzvednout odměnu";
    }
  });

  _bindBackButton(container, onBack);
}

// ─────────────────────────────────────────────
//  PRIVÁTNÍ UI UTILITY
// ─────────────────────────────────────────────

function _html_loading(text) {
  return `
    <div class="loading-wrap">
      <div class="spinner"></div>
      <p class="loading-text">${_esc(text)}</p>
    </div>
  `;
}

function _html_error(message, onBack) {
  return `
    <div class="dash-header">
      <span class="logo-icon">💥</span>
      <h1>Chyba tréninku</h1>
    </div>
    <div class="card">
      <p style="color:#fca5a5;margin-bottom:16px;font-size:14px;">${_esc(message)}</p>
      <button class="btn btn-secondary" id="btn-back-dashboard">← Zpět na dashboard</button>
    </div>
  `;
}

function _bindBackButton(container, onBack) {
  const btn = container.querySelector("#btn-back-dashboard");
  if (btn) btn.addEventListener("click", () => {
    stopTrainingCountdown();
    onBack();
  });
}

function _showToast(msg) {
  const old = document.getElementById("cc-toast");
  if (old) old.remove();
  const el = document.createElement("div");
  el.id = "cc-toast";
  el.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:rgba(15,8,30,.97);border:1px solid rgba(123,47,255,.45);
    border-radius:12px;padding:12px 22px;color:#e8d5ff;font-size:13px;
    z-index:200;box-shadow:0 4px 24px rgba(123,47,255,.35);
    max-width:320px;text-align:center;line-height:1.4;
  `;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/** HTML-escape pro bezpečné vkládání dat do innerHTML. */
function _esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}