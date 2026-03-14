/**
 * UFO: Cosmic Clash — Bojový systém (Krok 4)
 * Autor: Alexandre Basseville
 *
 * Odpovědnosti tohoto modulu:
 *  1. Hledání soupeře ve Firestore (podobný level, náhodný výběr)
 *  2. Výpočet výsledku souboje pomocí bojového skóre s náhodným faktorem
 *  3. Atomické uložení výsledku do kolekce `battles`
 *  4. Připsání odměn vítězi (XP, Star Coins, šance na Galactic Gems)
 *  5. Odečtení energie poraženému útočníkovi
 *  6. Blokování souboje při 0 energii nebo aktivním tréninku
 *  7. Výpis historie posledních soubojů hráče
 *  8. Renderování celé bojové obrazovky do předaného DOM elementu
 */

import {db} from "./firebase.js";
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
import {isTrainingActive} from "./training.js";

// ─────────────────────────────────────────────
//  KONSTANTY
// ─────────────────────────────────────────────

/** Maximální rozdíl levelů pro matchmaking. */
const LEVEL_RANGE = 2;

/** Počet soupeřů načtených z DB, ze kterých se náhodně vybere jeden. */
const MATCHMAKING_POOL = 10;

/** Odměny za výhru. */
const WIN_REWARDS = {
    xp: 40,
    starCoins: 20,
    /** Pravděpodobnost dropu Galactic Gem (0–1). */
    gemChance: 0.15,
    gemAmount: 1,
};

/** Ztráta energie při prohře. */
const LOSS_ENERGY_PENALTY = 1;

// ─────────────────────────────────────────────
//  BOJOVÝ VZOREC
// ─────────────────────────────────────────────

/**
 * Vypočítá bojové skóre ufouna dle zadaného vzorce.
 *
 * score = (HP * 0.35) + (DMG * 0.4) + (stamina * 0.15)
 *       + (equipBonus * 0.1)          ← zatím 0, připraveno pro Krok Vybavení
 *       + náhodný faktor (0–10 % ze základu)
 *
 * Náhodný faktor zajišťuje, že slabší ufoun může občas překvapit —
 * ale statisticky silnější ufoun vyhraje ve většině případů.
 *
 * @param {object} alien       – data ufouna
 * @param {number} equipBonus  – bonus z vybavení (zatím vždy 0)
 * @returns {number} bojové skóre
 */
export function calcBattleScore(alien, equipBonus = 0) {
    const hp = alien.hp ?? 100;
    const dmg = alien.dmg ?? 10;
    const stamina = alien.stamina ?? 100;

    const base = (hp * 0.35) + (dmg * 0.4) + (stamina * 0.15) + (equipBonus * 0.1);

    // Náhodný faktor: ±10 % ze základního skóre
    const randomFactor = base * (Math.random() * 0.2 - 0.1);

    return base + randomFactor;
}

// ─────────────────────────────────────────────
//  MATCHMAKING — HLEDÁNÍ SOUPEŘE
// ─────────────────────────────────────────────

/**
 * Najde náhodného soupeře z Firestore v rozsahu ±LEVEL_RANGE levelů.
 *
 * Strategie:
 *  - Dotáže se na MATCHMAKING_POOL hráčů s levelem >= (myLevel - LEVEL_RANGE)
 *  - Z výsledků odfiltruje vlastní UID hráče
 *  - Náhodně vybere jednoho
 *  - Pokud nikdo vhodný neexistuje, vrátí null
 *
 * BEZPEČNOST: Čteme pouze veřejná data soupeře — HP, DMG, stamina, level, name.
 * UID soupeře se ukládá do battles dokumentu, ale jeho detailní profil
 * není zpřístupněn útočníkovi mimo souboj.
 *
 * @param {string} uid      – vlastní UID (vyloučíme se z výsledků)
 * @param {number} myLevel  – vlastní level
 * @returns {Promise<{id: string, data: object}|null>}
 */
export async function findOpponent(uid, myLevel) {
    const minLevel = Math.max(1, myLevel - LEVEL_RANGE);
    const maxLevel = myLevel + LEVEL_RANGE;

    // Firestore neumí WHERE level BETWEEN → použijeme >= minLevel a filtrujeme v JS
    const q = query(
        collection(db, "aliens"),
        where("level", ">=", minLevel),
        orderBy("level", "asc"),
        limit(MATCHMAKING_POOL)
    );

    const snap = await getDocs(q);
    if (snap.empty) return null;

    // Filtrujeme: vyloučíme sebe a hráče mimo maxLevel
    const candidates = snap.docs
        .filter((d) => d.id !== uid && (d.data().level ?? 1) <= maxLevel)
        .map((d) => ({id: d.id, data: d.data()}));

    if (candidates.length === 0) return null;

    // Náhodný výběr ze seznamu kandidátů
    const idx = Math.floor(Math.random() * candidates.length);
    return candidates[idx];
}

// ─────────────────────────────────────────────
//  PRŮBĚH SOUBOJE
// ─────────────────────────────────────────────

/**
 * Provede celý souboj: výpočet, uložení do DB, připsání odměn / penalizace.
 *
 * Validace před zahájením:
 *  1. Hráč existuje v DB
 *  2. Hráč má > 0 energie
 *  3. Neprobíhá aktivní trénink (isTrainingActive)
 *  4. Soupeř existuje (předán jako parametr z findOpponent)
 *
 * Atomicita:
 *  - updateDoc na aliens hráče (odměny nebo penalizace)
 *  - addDoc do battles (výsledek)
 *  Pokud addDoc selže, odměny jsou již zapsány — přijatelný edge case
 *  pro klientský kontext (bez Cloud Functions).
 *
 * @param {string} uid       – UID útočníka (přihlášeného hráče)
 * @param {object} opponent  – { id: string, data: object } ze findOpponent
 * @returns {Promise<BattleResult>}
 *
 * @typedef {object} BattleResult
 * @property {"win"|"loss"} outcome
 * @property {number} myScore
 * @property {number} opponentScore
 * @property {object} rewards        – připsané odměny (nebo penalizace)
 * @property {string} battleId       – ID uloženého dokumentu v battles
 * @property {object} updatedAlien   – aktuální data hráče po souboji
 */
export async function executeBattle(uid, opponent) {
    // 1) Načteme aktuální profil hráče přímo z DB (ne ze stavu UI)
    const alienSnap = await getDoc(doc(db, "aliens", uid));
    if (!alienSnap.exists()) throw new Error("Profil hráče nebyl nalezen.");
    const alien = alienSnap.data();

    // 2) Ověříme energii
    const energy = alien.energy ?? 0;
    if (energy <= 0) {
        throw new Error("Nemáš žádnou energii. Počkej na obnovu.");
    }

    // 3) Ověříme, zda neprobíhá trénink
    const training = await isTrainingActive(uid);
    if (training) {
        throw new Error("Nelze bojovat během tréninku.");
    }

    // 4) Vypočítáme bojová skóre obou hráčů
    //    equipBonus = 0 → připraveno pro budoucí systém vybavení
    const myScore = calcBattleScore(alien, 0);
    const opponentScore = calcBattleScore(opponent.data, 0);

    const won = myScore >= opponentScore;

    // 5) Připravíme aktualizaci hráčova profilu
    let alienUpdate = {};
    let rewards = {};

    if (won) {
        // Výhra: přičteme XP, Star Coins, případně Galactic Gem
        const gemDrop = Math.random() < WIN_REWARDS.gemChance;
        const newGems = (alien.galacticGems ?? 0) + (gemDrop ? WIN_REWARDS.gemAmount : 0);

        alienUpdate = {
            xp: (alien.xp ?? 0) + WIN_REWARDS.xp,
            starCoins: (alien.starCoins ?? 0) + WIN_REWARDS.starCoins,
            galacticGems: newGems,
        };
        rewards = {
            xp: WIN_REWARDS.xp,
            starCoins: WIN_REWARDS.starCoins,
            galacticGems: gemDrop ? WIN_REWARDS.gemAmount : 0,
        };
    } else {
        // Prohra: odečteme 1 energii (min 0)
        const newEnergy = Math.max(0, energy - LOSS_ENERGY_PENALTY);
        alienUpdate = {energy: newEnergy};
        rewards = {energy: -LOSS_ENERGY_PENALTY};
    }

    // 6) Zapíšeme odměny / penalizaci do aliens
    await updateDoc(doc(db, "aliens", uid), alienUpdate);

    // 7) Uložíme výsledek souboje do kolekce battles
    const battleDoc = {
        attackerId: uid,
        defenderId: opponent.id,
        attackerName: alien.name ?? "?",
        defenderName: opponent.data.name ?? "?",
        attackerLevel: alien.level ?? 1,
        defenderLevel: opponent.data.level ?? 1,
        myScore: Math.round(myScore),
        opponentScore: Math.round(opponentScore),
        result: won ? "win" : "loss",
        rewards,
        createdAt: Timestamp.now(),
    };

    const battleRef = await addDoc(collection(db, "battles"), battleDoc);

    // 8) Sestavíme aktualizovaný stav hráče pro UI (bez dalšího čtení z DB)
    const updatedAlien = {...alien, ...alienUpdate};

    return {
        outcome: won ? "win" : "loss",
        myScore: Math.round(myScore),
        opponentScore: Math.round(opponentScore),
        rewards,
        battleId: battleRef.id,
        updatedAlien,
        opponent,
    };
}

// ─────────────────────────────────────────────
//  HISTORIE SOUBOJŮ
// ─────────────────────────────────────────────

/**
 * Načte posledních N soubojů přihlášeného hráče z Firestore.
 * Vrátí pouze souboje kde byl útočníkem (attackerId == uid).
 *
 * @param {string} uid    – UID hráče
 * @param {number} count  – max počet záznamů (výchozí 10)
 * @returns {Promise<Array<{id: string, data: object}>>}
 */
export async function fetchBattleHistory(uid, count = 10) {
    const q = query(
        collection(db, "battles"),
        where("attackerId", "==", uid),
        orderBy("createdAt", "desc"),
        limit(count)
    );

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({id: d.id, data: d.data()}));
}

// ─────────────────────────────────────────────
//  RENDER — HLAVNÍ ORCHESTRÁTOR
// ─────────────────────────────────────────────

/**
 * Vykreslí celou bojovou obrazovku do předaného DOM elementu.
 *
 * Stavy obrazovky:
 *   A) Výchozí      – zobrazení hráčova profilu + tlačítko "Najít soupeře"
 *   B) Soupeř nalezen – porovnání statistik + tlačítko "Zahájit souboj"
 *   C) Výsledek     – výsledek souboje + odměny + tlačítko "Bojovat znovu"
 *   D) Historie     – přepínatelná záložka s historií posledních soubojů
 *
 * @param {HTMLElement} container
 * @param {object}      alien      – data hráče
 * @param {string}      uid
 * @param {Function}    onBack     – návrat na dashboard
 * @param {Function}    onRefresh  – reload dat + překreslení dashboardu
 */
export async function renderBattleScreen(container, alien, uid, onBack, onRefresh) {
    container.innerHTML = _html_loading("Načítám arenu…");

    // Zkontrolujeme blokující podmínky
    const energy = alien.energy ?? 0;
    const training = await isTrainingActive(uid);

    _renderIdle(container, alien, uid, energy, training, onBack, onRefresh);
}

// ─────────────────────────────────────────────
//  PRIVÁTNÍ RENDER FUNKCE
// ─────────────────────────────────────────────

/**
 * Stav A – klidový stav, hráč hledá soupeře.
 */
function _renderIdle(container, alien, uid, energy, trainingActive, onBack, onRefresh) {
    const blocked = energy <= 0 || trainingActive;
    const blockMsg = trainingActive
        ? "⚠️ Probíhá trénink — souboj není dostupný"
        : energy <= 0
            ? "⚡ Žádná energie — počkej na obnovu"
            : "";

    container.innerHTML = `
    <div class="dash-header">
      <span class="logo-icon">⚔️</span>
      <h1>Bojová aréna</h1>
      <p class="subtitle">Připrav se na souboj</p>
    </div>

    ${_html_fighter_card("Tvůj ufoun", alien, "attacker")}

    ${blocked ? `<div class="battle-block-msg">${blockMsg}</div>` : ""}

    <div class="card" id="opponent-area">
      <p class="section-title">Soupeř</p>
      <div class="empty-opponent">
        <span class="empty-icon">👾</span>
        <p>Stiskni tlačítko pro nalezení soupeře</p>
      </div>
    </div>

    <div class="card">
      <button class="btn btn-battle" id="btn-find-opponent" ${blocked ? "disabled" : ""}>
        🔍 Najít soupeře
      </button>
      <div id="battle-status" class="battle-status-msg"></div>
    </div>

    <div class="card">
      <button class="btn btn-secondary" id="btn-history">
        📜 Historie soubojů
      </button>
    </div>

    <div class="card">
      <button class="btn btn-secondary" id="btn-back-dashboard">← Zpět na dashboard</button>
    </div>
  `;

    // Najít soupeře
    document.getElementById("btn-find-opponent").addEventListener("click", async () => {
        const btn = document.getElementById("btn-find-opponent");
        btn.disabled = true;
        btn.textContent = "Hledám…";
        _setStatus("Prohledávám galaxii…");

        try {
            const opponent = await findOpponent(uid, alien.level ?? 1);
            if (!opponent) {
                _setStatus("❌ Žádný vhodný soupeř nenalezen. Zkus to znovu.");
                btn.disabled = false;
                btn.textContent = "🔍 Najít soupeře";
                return;
            }
            _renderOpponentFound(container, alien, uid, opponent, energy, onBack, onRefresh);
        } catch (err) {
            console.error("[CosmicClash/battle] Chyba při hledání soupeře:", err);
            _setStatus(`❌ ${err.message}`);
            btn.disabled = false;
            btn.textContent = "🔍 Najít soupeře";
        }
    });

    // Historie
    document.getElementById("btn-history").addEventListener("click", async () => {
        _renderHistory(container, uid, alien, energy, trainingActive, onBack, onRefresh);
    });

    _bindBackButton(container, onBack);
}

/**
 * Stav B – soupeř nalezen, porovnání statistik.
 */
function _renderOpponentFound(container, alien, uid, opponent, energy, onBack, onRefresh) {
    container.innerHTML = `
    <div class="dash-header">
      <span class="logo-icon">⚔️</span>
      <h1>Soupeř nalezen!</h1>
      <p class="subtitle">Porovnej statistiky před bojem</p>
    </div>

    <div class="battle-vs-grid">
      ${_html_fighter_card("Tvůj ufoun", alien, "attacker")}
      <div class="vs-badge">VS</div>
      ${_html_fighter_card("Soupeř", opponent.data, "defender")}
    </div>

    ${_html_stat_comparison(alien, opponent.data)}

    <div class="card">
      <button class="btn btn-battle" id="btn-start-battle">
        ⚔️ Zahájit souboj!
      </button>
      <button class="btn btn-secondary" id="btn-find-another" style="margin-top:10px">
        🔍 Najít jiného soupeře
      </button>
      <div id="battle-status" class="battle-status-msg"></div>
    </div>

    <div class="card">
      <button class="btn btn-secondary" id="btn-back-dashboard">← Zpět na dashboard</button>
    </div>
  `;

    // Zahájit souboj
    document.getElementById("btn-start-battle").addEventListener("click", async () => {
        const btn = document.getElementById("btn-start-battle");
        const btn2 = document.getElementById("btn-find-another");
        btn.disabled = true;
        btn2.disabled = true;
        btn.textContent = "Probíhá souboj…";
        _setStatus("Vyhodnocuji výsledek…");

        try {
            const result = await executeBattle(uid, opponent);
            _renderResult(container, alien, uid, result, energy, onBack, onRefresh);
        } catch (err) {
            console.error("[CosmicClash/battle] Chyba při souboji:", err);
            _setStatus(`❌ ${err.message}`);
            btn.disabled = false;
            btn2.disabled = false;
            btn.textContent = "⚔️ Zahájit souboj!";
        }
    });

    // Najít jiného soupeře
    document.getElementById("btn-find-another").addEventListener("click", async () => {
        _renderIdle(container, alien, uid, energy, false, onBack, onRefresh);
    });

    _bindBackButton(container, onBack);
}

/**
 * Stav C – výsledek souboje.
 */
function _renderResult(container, alien, uid, result, prevEnergy, onBack, onRefresh) {
    const won = result.outcome === "win";
    const rewStr = _formatRewards(result.rewards, won);
    const scoreDiff = result.myScore - result.opponentScore;

    container.innerHTML = `
    <div class="dash-header">
      <span class="logo-icon">${won ? "🏆" : "💀"}</span>
      <h1>${won ? "Vítězství!" : "Prohra"}</h1>
      <p class="subtitle">${won ? "Galaxie patří tobě" : "Příště to vyjde"}</p>
    </div>

    <div class="card result-card ${won ? "result-win" : "result-loss"}">
      <p class="section-title">Výsledek souboje</p>

      <div class="score-row">
        <div class="score-side">
          <p class="score-name">${_esc(result.updatedAlien.name ?? alien.name)}</p>
          <p class="score-value">${result.myScore}</p>
          <p class="score-label">Bojové skóre</p>
        </div>
        <div class="score-vs">${won ? ">" : "<"}</div>
        <div class="score-side">
          <p class="score-name">${_esc(result.opponent.data.name ?? "Soupeř")}</p>
          <p class="score-value">${result.opponentScore}</p>
          <p class="score-label">Bojové skóre</p>
        </div>
      </div>

      <div class="result-rewards">
        <p class="rewards-title">${won ? "🎁 Odměny" : "⚡ Penalizace"}</p>
        <p class="rewards-text">${rewStr}</p>
      </div>
    </div>

    <div class="card">
      <button class="btn btn-battle" id="btn-fight-again">⚔️ Bojovat znovu</button>
      <button class="btn btn-secondary" id="btn-history" style="margin-top:10px">
        📜 Historie soubojů
      </button>
    </div>

    <div class="card">
      <button class="btn btn-secondary" id="btn-back-dashboard">← Zpět na dashboard</button>
    </div>
  `;

    const newEnergy = result.updatedAlien.energy ?? prevEnergy;

    document.getElementById("btn-fight-again").addEventListener("click", async () => {
        // Použijeme aktualizovaná data hráče (po odečtení energie / připsání odměn)
        const freshAlien = {...alien, ...result.updatedAlien};
        const stillTraining = await isTrainingActive(uid);
        _renderIdle(container, freshAlien, uid, newEnergy, stillTraining, onBack, onRefresh);
    });

    document.getElementById("btn-history").addEventListener("click", async () => {
        const freshAlien = {...alien, ...result.updatedAlien};
        const stillTraining = await isTrainingActive(uid);
        _renderHistory(container, uid, freshAlien, newEnergy, stillTraining, onBack, onRefresh);
    });

    // Refreshneme dashboard v pozadí (bez čekání), aby se odměny projevily
    if (typeof onRefresh === "function") {
        onRefresh().catch(() => {
        });
    }

    _bindBackButton(container, onBack);
}

/**
 * Stav D – historie soubojů.
 */
async function _renderHistory(container, uid, alien, energy, trainingActive, onBack, onRefresh) {
    container.innerHTML = _html_loading("Načítám historii…");

    try {
        const history = await fetchBattleHistory(uid, 10);

        const rows = history.length === 0
            ? `<div class="empty-history">Zatím žádné souboje. Čas vstoupit do arény!</div>`
            : history.map((b) => _html_history_row(b.data)).join("");

        container.innerHTML = `
      <div class="dash-header">
        <span class="logo-icon">📜</span>
        <h1>Historie soubojů</h1>
        <p class="subtitle">Posledních ${history.length} zápasů</p>
      </div>

      <div class="card">
        <p class="section-title">Záznamy z bitevního pole</p>
        <div class="history-list">${rows}</div>
      </div>

      <div class="card">
        <button class="btn btn-battle" id="btn-go-battle">⚔️ Zpět do arény</button>
      </div>

      <div class="card">
        <button class="btn btn-secondary" id="btn-back-dashboard">← Zpět na dashboard</button>
      </div>
    `;

        document.getElementById("btn-go-battle").addEventListener("click", () => {
            _renderIdle(container, alien, uid, energy, trainingActive, onBack, onRefresh);
        });

        _bindBackButton(container, onBack);

    } catch (err) {
        console.error("[CosmicClash/battle] Chyba při načítání historie:", err);
        container.innerHTML = `
      <div class="card">
        <p style="color:#fca5a5;font-size:14px;margin-bottom:14px;">
          Chyba při načítání: ${_esc(err.message)}
        </p>
        <button class="btn btn-secondary" id="btn-back-dashboard">← Zpět</button>
      </div>
    `;
        _bindBackButton(container, onBack);
    }
}

// ─────────────────────────────────────────────
//  HTML ŠABLONY
// ─────────────────────────────────────────────

/**
 * Karta bojovníka (útočník nebo obránce).
 */
function _html_fighter_card(title, alien, side) {
    const originLabel = alien.origin ?? alien.type ?? "Neznámý původ";
    const hpPct = Math.min(Math.round(((alien.hp ?? 100) / 200) * 100), 100);
    const staminaPct = Math.min(alien.stamina ?? 100, 100);

    return `
    <div class="card fighter-card fighter-${side}">
      <p class="section-title">${title}</p>
      <div class="fighter-name">${_esc(alien.name ?? "?")}</div>
      <div class="fighter-origin">${_esc(originLabel)} · Lv.${alien.level ?? 1}</div>

      <div class="fighter-stats">
        <div class="fstat">
          <span class="fstat-label">HP</span>
          <div class="progress-bar fstat-bar">
            <div class="progress-fill hp-fill" style="width:${hpPct}%"></div>
          </div>
          <span class="fstat-val">${alien.hp ?? 100}</span>
        </div>
        <div class="fstat">
          <span class="fstat-label">DMG</span>
          <span class="fstat-val fstat-val-only">⚔️ ${alien.dmg ?? 10}</span>
        </div>
        <div class="fstat">
          <span class="fstat-label">Stamina</span>
          <div class="progress-bar fstat-bar">
            <div class="progress-fill stamina-fill" style="width:${staminaPct}%"></div>
          </div>
          <span class="fstat-val">${alien.stamina ?? 100}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Tabulka porovnání statistik.
 */
function _html_stat_comparison(attacker, defender) {
    const stats = [
        {label: "Level", a: attacker.level ?? 1, d: defender.level ?? 1},
        {label: "HP", a: attacker.hp ?? 100, d: defender.hp ?? 100},
        {label: "DMG", a: attacker.dmg ?? 10, d: defender.dmg ?? 10},
        {label: "Stamina", a: attacker.stamina ?? 100, d: defender.stamina ?? 100},
    ];

    const rows = stats.map(({label, a, d}) => {
        const aWin = a > d;
        const dWin = d > a;
        return `
      <div class="cmp-row">
        <span class="cmp-val ${aWin ? "cmp-win" : dWin ? "cmp-loss" : ""}">${a}</span>
        <span class="cmp-label">${label}</span>
        <span class="cmp-val ${dWin ? "cmp-win" : aWin ? "cmp-loss" : ""}">${d}</span>
      </div>
    `;
    }).join("");

    return `
    <div class="card">
      <p class="section-title">Porovnání statistik</p>
      <div class="comparison-grid">${rows}</div>
      <p class="cmp-hint">Zelená = lepší statistika · Výsledek obsahuje náhodný faktor</p>
    </div>
  `;
}

/**
 * Řádek v historii soubojů.
 */
function _html_history_row(data) {
    const won = data.result === "win";
    const date = data.createdAt instanceof Timestamp
        ? data.createdAt.toDate().toLocaleDateString("cs-CZ", {
            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        })
        : "—";
    const rewStr = _formatRewards(data.rewards, won);

    return `
    <div class="history-row battle-history-row ${won ? "history-win" : "history-loss"}">
      <div class="history-icon">${won ? "🏆" : "💀"}</div>
      <div class="history-info">
        <p class="history-opponent">vs. ${_esc(data.defenderName ?? "?")}</p>
        <p class="history-meta">
          Lv.${data.attackerLevel ?? "?"} vs Lv.${data.defenderLevel ?? "?"}
          · skóre ${data.myScore ?? "?"} : ${data.opponentScore ?? "?"}
        </p>
        <p class="history-rewards">${rewStr}</p>
      </div>
      <div class="history-date">${date}</div>
    </div>
  `;
}

/** Formátuje odměny / penalizace do čitelného stringu. */
function _formatRewards(rewards, won) {
    if (!rewards) return "—";
    const parts = [];
    if (won) {
        if (rewards.xp) parts.push(`+${rewards.xp} XP`);
        if (rewards.starCoins) parts.push(`+${rewards.starCoins} ✦`);
        if (rewards.galacticGems) parts.push(`+${rewards.galacticGems} 💎`);
    } else {
        if (rewards.energy != null) parts.push(`${rewards.energy} ⚡`);
    }
    return parts.join("  ·  ") || "—";
}

function _html_loading(text) {
    return `
    <div class="loading-wrap">
      <div class="spinner"></div>
      <p class="loading-text">${_esc(text)}</p>
    </div>
  `;
}

function _setStatus(msg) {
    const el = document.getElementById("battle-status");
    if (el) el.textContent = msg;
}

function _bindBackButton(container, onBack) {
    container.querySelector("#btn-back-dashboard")
        ?.addEventListener("click", onBack);
}

/** HTML-escape — ochrana proti XSS při vkládání dat z DB do innerHTML. */
function _esc(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
