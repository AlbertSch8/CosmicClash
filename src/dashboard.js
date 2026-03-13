import { auth, db } from "./firebase.js";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
    startTraining,
    startBattle,
    restAlien,
    buyHpUpgrade,
    buyDmgUpgrade
} from "./game.js";

const content = document.getElementById("content");

function getRequiredXp(level) {
    return level * 100;
}

function storageKey(userId, suffix) {
    return `cosmicclash_${userId}_${suffix}`;
}

function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

function getLocalData(userId) {
    const equipment =
        JSON.parse(localStorage.getItem(storageKey(userId, "equipment"))) || {
            weapon: "Žádná",
            armor: "Žádné",
            bonusHp: 0,
            bonusDmg: 0
        };

    const history =
        JSON.parse(localStorage.getItem(storageKey(userId, "history"))) || [];

    const missions =
        JSON.parse(localStorage.getItem(storageKey(userId, "missions"))) || {
            date: getTodayKey(),
            trainingCount: 0,
            battleCount: 0,
            restCount: 0
        };

    const uiState =
        JSON.parse(localStorage.getItem(storageKey(userId, "ui"))) || {
            activeTab: "overview",
            lastBattle: null
        };

    if (missions.date !== getTodayKey()) {
        const resetMissions = {
            date: getTodayKey(),
            trainingCount: 0,
            battleCount: 0,
            restCount: 0
        };
        localStorage.setItem(storageKey(userId, "missions"), JSON.stringify(resetMissions));
        return { equipment, history, missions: resetMissions, uiState };
    }

    return { equipment, history, missions, uiState };
}

function saveEquipment(userId, equipment) {
    localStorage.setItem(storageKey(userId, "equipment"), JSON.stringify(equipment));
}

function saveHistory(userId, history) {
    localStorage.setItem(storageKey(userId, "history"), JSON.stringify(history));
}

function saveMissions(userId, missions) {
    localStorage.setItem(storageKey(userId, "missions"), JSON.stringify(missions));
}

function saveUiState(userId, uiState) {
    localStorage.setItem(storageKey(userId, "ui"), JSON.stringify(uiState));
}

function setActiveTab(userId, activeTab) {
    const data = getLocalData(userId);
    saveUiState(userId, { ...data.uiState, activeTab });
}

function setLastBattle(userId, lastBattle) {
    const data = getLocalData(userId);
    saveUiState(userId, { ...data.uiState, lastBattle, activeTab: "battle" });
}

function addHistory(userId, text) {
    const { history } = getLocalData(userId);
    const newHistory = [
        {
            text,
            time: new Date().toLocaleTimeString("cs-CZ", {
                hour: "2-digit",
                minute: "2-digit"
            })
        },
        ...history
    ].slice(0, 8);

    saveHistory(userId, newHistory);
}

function incrementMission(userId, type) {
    const localData = getLocalData(userId);
    const missions = { ...localData.missions };

    if (type === "training") missions.trainingCount += 1;
    if (type === "battle") missions.battleCount += 1;
    if (type === "rest") missions.restCount += 1;

    saveMissions(userId, missions);
}

function getMissionState(missions) {
    return [
        { title: "Dokonči 2 tréninky", progress: missions.trainingCount, goal: 2 },
        { title: "Dokonči 1 souboj", progress: missions.battleCount, goal: 1 },
        { title: "Použij 1 odpočinek", progress: missions.restCount, goal: 1 }
    ];
}

function getMockLeaderboard(currentAlien) {
    const mockPlayers = [
        { name: "Zorblax", level: 7, xp: 420, hp: 180, dmg: 30, starCoins: 210 },
        { name: "Neburion", level: 6, xp: 340, hp: 165, dmg: 27, starCoins: 180 },
        { name: "Astrex", level: 5, xp: 260, hp: 150, dmg: 24, starCoins: 150 },
        { name: "VoidRex", level: 4, xp: 180, hp: 130, dmg: 20, starCoins: 120 }
    ];

    const currentPlayer = {
        name: currentAlien.name,
        level: currentAlien.level,
        xp: currentAlien.xp,
        hp: currentAlien.hp,
        dmg: currentAlien.dmg,
        starCoins: currentAlien.starCoins
    };

    const merged = [...mockPlayers, currentPlayer];

    merged.sort((a, b) => {
        if (b.level !== a.level) return b.level - a.level;
        return b.xp - a.xp;
    });

    return merged.slice(0, 5);
}

async function ensureAlienProfile(user) {
    const alienRef = doc(db, "aliens", user.uid);
    const alienSnap = await getDoc(alienRef);

    if (alienSnap.exists()) {
        return alienSnap.data();
    }

    const fallbackName = user.displayName || user.email?.split("@")[0] || "Pilot";

    const newAlien = {
        name: fallbackName,
        email: user.email || "",
        level: 1,
        xp: 0,
        hp: 100,
        dmg: 10,
        stamina: 100,
        starCoins: 50,
        createdAt: new Date().toISOString()
    };

    await setDoc(alienRef, newAlien);
    return newAlien;
}

function renderLeaderboard(currentAlien) {
    const players = getMockLeaderboard(currentAlien);

    return players.map((player, index) => {
        const isCurrent = player.name === currentAlien.name;
        return `
      <div class="leaderboard-row ${isCurrent ? "leaderboard-row-current" : ""}">
        <div class="leaderboard-rank">#${index + 1}</div>
        <div class="leaderboard-main">
          <div class="leaderboard-name">${player.name}</div>
          <div class="leaderboard-meta">Level ${player.level} • XP ${player.xp}</div>
        </div>
        <div class="leaderboard-score">${player.starCoins} ✦</div>
      </div>
    `;
    }).join("");
}

function renderHistory(userId) {
    const { history } = getLocalData(userId);

    if (!history.length) {
        return `<div class="empty-box">Zatím tu není žádná historie akcí.</div>`;
    }

    return history.map((item) => `
    <div class="history-row">
      <div class="history-time">${item.time}</div>
      <div class="history-text">${item.text}</div>
    </div>
  `).join("");
}

function renderMissions(userId) {
    const { missions } = getLocalData(userId);
    const missionList = getMissionState(missions);

    return missionList.map((mission) => {
        const percent = Math.min((mission.progress / mission.goal) * 100, 100);
        const done = mission.progress >= mission.goal;

        return `
      <div class="mission-card">
        <div class="mission-top">
          <div class="mission-title">${mission.title}</div>
          <div class="mission-count">${mission.progress} / ${mission.goal}</div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill mission-fill" style="width: ${percent}%"></div>
        </div>
        <div class="mission-status">${done ? "Splněno" : "Rozpracováno"}</div>
      </div>
    `;
    }).join("");
}

function getEffectiveStats(alien, equipment) {
    return {
        hp: alien.hp + equipment.bonusHp,
        dmg: alien.dmg + equipment.bonusDmg
    };
}

function renderEquipmentSection(alien, user) {
    const { equipment } = getLocalData(user.uid);
    const effective = getEffectiveStats(alien, equipment);

    return `
    <div class="section">
      <h2 class="section-title">Inventář a výbava</h2>
      <div class="stat"><span class="stat-label">Zbraň</span><span class="stat-value">${equipment.weapon}</span></div>
      <div class="stat"><span class="stat-label">Brnění</span><span class="stat-value">${equipment.armor}</span></div>
      <div class="stat"><span class="stat-label">Celkové HP</span><span class="stat-value">${effective.hp}</span></div>
      <div class="stat"><span class="stat-label">Celkové DMG</span><span class="stat-value">${effective.dmg}</span></div>

      <div class="equipment-grid">
        <button class="btn-equip" id="equip-blaster-btn">Nasadit Plasma Blaster (+5 DMG)</button>
        <button class="btn-equip" id="equip-armor-btn">Nasadit Nano Armor (+20 HP)</button>
        <button class="btn-equip" id="remove-equip-btn">Sundat výbavu</button>
      </div>
    </div>
  `;
}

function renderBattlePanel(userId) {
    const { uiState } = getLocalData(userId);
    const lastBattle = uiState.lastBattle;

    if (!lastBattle) {
        return `
      <div class="section">
        <h2 class="section-title">Battle centrum</h2>
        <div class="empty-box">Zatím jsi neodehrál žádný souboj.</div>
      </div>
    `;
    }

    const enemy = lastBattle.enemy;
    const battleLog = lastBattle.battleLog || [];

    return `
    <div class="section">
      <h2 class="section-title">Battle centrum</h2>

      <div class="enemy-preview">
        <div class="enemy-title">${enemy.name}</div>
        <div class="enemy-stats">
          <div class="stat"><span class="stat-label">Enemy Level</span><span class="stat-value">${enemy.level}</span></div>
          <div class="stat"><span class="stat-label">Enemy HP</span><span class="stat-value">${enemy.hp}</span></div>
          <div class="stat"><span class="stat-label">Enemy DMG</span><span class="stat-value">${enemy.dmg}</span></div>
        </div>
      </div>

      <div class="battle-result-box">
        ${lastBattle.message}
      </div>

      <div class="battle-log">
        ${battleLog.map((line) => `<div class="battle-log-row">${line}</div>`).join("")}
      </div>
    </div>
  `;
}

function renderOverviewTab(a, user, actionText) {
    const { equipment } = getLocalData(user.uid);
    const effective = getEffectiveStats(a, equipment);
    const requiredXp = getRequiredXp(a.level);
    const xpPercent = Math.min((a.xp / requiredXp) * 100, 100);
    const staminaPercent = Math.min((a.stamina / 100) * 100, 100);

    return `
    <div class="section">
      <h2 class="section-title">Hráč</h2>
      <div class="stat"><span class="stat-label">Level</span><span class="stat-value">${a.level}</span></div>
      <div class="stat"><span class="stat-label">StarCoins</span><span class="stat-value">${a.starCoins} ✦</span></div>
    </div>

    <div class="section">
      <h2 class="section-title">Statistiky</h2>
      <div class="stat"><span class="stat-label">HP</span><span class="stat-value">${a.hp}</span></div>
      <div class="stat"><span class="stat-label">DMG</span><span class="stat-value">${a.dmg}</span></div>
      <div class="stat"><span class="stat-label">Stamina</span><span class="stat-value">${a.stamina} / 100</span></div>
      <div class="stat"><span class="stat-label">HP s výbavou</span><span class="stat-value">${effective.hp}</span></div>
      <div class="stat"><span class="stat-label">DMG s výbavou</span><span class="stat-value">${effective.dmg}</span></div>
    </div>

    <div class="section">
      <h2 class="section-title">Postup</h2>
      <div class="bar-block">
        <div class="bar-header">
          <span class="stat-label">XP</span>
          <span class="stat-value">${a.xp} / ${requiredXp}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill xp-fill" style="width: ${xpPercent}%"></div>
        </div>
      </div>

      <div class="bar-block">
        <div class="bar-header">
          <span class="stat-label">Energie</span>
          <span class="stat-value">${a.stamina} / 100</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill stamina-fill" style="width: ${staminaPercent}%"></div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Akce</h2>
      <div id="action-message" class="action-message">${actionText}</div>

      <button class="btn-action" id="training-btn">Trénink</button>
      <button class="btn-action" id="battle-btn">Souboj</button>
      <button class="btn-action" id="rest-btn">Odpočinek</button>
      <button class="btn-logout" id="logout-btn">Odhlásit se</button>
    </div>
  `;
}

function renderProgressTab(userId) {
    return `
    <div class="section">
      <h2 class="section-title">Denní mise</h2>
      <div class="mission-list">
        ${renderMissions(userId)}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Historie akcí</h2>
      <div class="history-list">
        ${renderHistory(userId)}
      </div>
    </div>

    ${renderBattlePanel(userId)}
  `;
}

function renderEconomyTab(a, user) {
    return `
    <div class="section">
      <h2 class="section-title">Shop</h2>
      <button class="btn-shop" id="buy-hp-btn">Koupit +15 HP (20 ✦)</button>
      <button class="btn-shop" id="buy-dmg-btn">Koupit +3 DMG (25 ✦)</button>
    </div>

    ${renderEquipmentSection(a, user)}

    <div class="section">
      <h2 class="section-title">Leaderboard</h2>
      <div class="leaderboard-list">
        ${renderLeaderboard(a)}
      </div>
    </div>
  `;
}

function renderDashboard(a, user, actionText = "") {
    const { uiState } = getLocalData(user.uid);
    const activeTab = uiState.activeTab || "overview";

    content.innerHTML = `
    <div class="dashboard-header">
      <h1>🪐 Velitel ${a.name}</h1>
      <p class="subtitle">Připraven na další vesmírný střet</p>
    </div>

    <div class="dashboard-tabs">
      <button class="dash-tab ${activeTab === "overview" ? "active" : ""}" data-tab="overview">Přehled</button>
      <button class="dash-tab ${activeTab === "progress" ? "active" : ""}" data-tab="progress">Mise a log</button>
      <button class="dash-tab ${activeTab === "battle" ? "active" : ""}" data-tab="battle">Souboj</button>
      <button class="dash-tab ${activeTab === "economy" ? "active" : ""}" data-tab="economy">Shop a gear</button>
    </div>

    ${
        activeTab === "overview"
            ? renderOverviewTab(a, user, actionText)
            : activeTab === "progress"
                ? renderProgressTab(user.uid)
                : activeTab === "battle"
                    ? renderBattlePanel(user.uid)
                    : renderEconomyTab(a, user)
    }
  `;

    document.querySelectorAll(".dash-tab").forEach((btn) => {
        btn.addEventListener("click", async () => {
            setActiveTab(user.uid, btn.dataset.tab);
            const updatedAlien = await ensureAlienProfile(user);
            renderDashboard(updatedAlien, user, actionText);
        });
    });

    const trainingBtn = document.getElementById("training-btn");
    const battleBtn = document.getElementById("battle-btn");
    const restBtn = document.getElementById("rest-btn");
    const logoutBtn = document.getElementById("logout-btn");
    const buyHpBtn = document.getElementById("buy-hp-btn");
    const buyDmgBtn = document.getElementById("buy-dmg-btn");
    const equipBlasterBtn = document.getElementById("equip-blaster-btn");
    const equipArmorBtn = document.getElementById("equip-armor-btn");
    const removeEquipBtn = document.getElementById("remove-equip-btn");

    async function reloadWithMessage(message) {
        const updatedAlien = await ensureAlienProfile(user);
        renderDashboard(updatedAlien, user, message);
    }

    function disableButtonIfExists(btn) {
        if (btn) btn.disabled = true;
    }

    function disableMainButtons() {
        disableButtonIfExists(trainingBtn);
        disableButtonIfExists(battleBtn);
        disableButtonIfExists(restBtn);
        disableButtonIfExists(buyHpBtn);
        disableButtonIfExists(buyDmgBtn);
        disableButtonIfExists(equipBlasterBtn);
        disableButtonIfExists(equipArmorBtn);
        disableButtonIfExists(removeEquipBtn);
    }

    if (trainingBtn) {
        trainingBtn.addEventListener("click", async () => {
            try {
                disableMainButtons();
                const result = await startTraining(user.uid);
                incrementMission(user.uid, "training");
                addHistory(user.uid, "Proběhl trénink.");
                await reloadWithMessage(result.message);
            } catch (error) {
                console.error("Chyba při tréninku:", error);
                await reloadWithMessage(error.message || "Trénink se nepodařil.");
            }
        });
    }

    if (battleBtn) {
        battleBtn.addEventListener("click", async () => {
            try {
                disableMainButtons();
                const result = await startBattle(user.uid);
                incrementMission(user.uid, "battle");
                addHistory(user.uid, `Proběhl souboj proti ${result.enemy.name}.`);
                setLastBattle(user.uid, {
                    enemy: result.enemy,
                    battleLog: result.battleLog,
                    message: result.message
                });
                await reloadWithMessage(result.message);
            } catch (error) {
                console.error("Chyba při souboji:", error);
                await reloadWithMessage(error.message || "Souboj se nepodařil.");
            }
        });
    }

    if (restBtn) {
        restBtn.addEventListener("click", async () => {
            try {
                disableMainButtons();
                const result = await restAlien(user.uid);
                incrementMission(user.uid, "rest");
                addHistory(user.uid, "Proběhl odpočinek.");
                await reloadWithMessage(result.message);
            } catch (error) {
                console.error("Chyba při odpočinku:", error);
                await reloadWithMessage(error.message || "Odpočinek se nepodařil.");
            }
        });
    }

    if (buyHpBtn) {
        buyHpBtn.addEventListener("click", async () => {
            try {
                disableMainButtons();
                const result = await buyHpUpgrade(user.uid);
                addHistory(user.uid, "Zakoupen upgrade HP.");
                await reloadWithMessage(result.message);
            } catch (error) {
                console.error("Chyba při nákupu HP:", error);
                await reloadWithMessage(error.message || "Nákup HP se nepodařil.");
            }
        });
    }

    if (buyDmgBtn) {
        buyDmgBtn.addEventListener("click", async () => {
            try {
                disableMainButtons();
                const result = await buyDmgUpgrade(user.uid);
                addHistory(user.uid, "Zakoupen upgrade DMG.");
                await reloadWithMessage(result.message);
            } catch (error) {
                console.error("Chyba při nákupu DMG:", error);
                await reloadWithMessage(error.message || "Nákup DMG se nepodařil.");
            }
        });
    }

    if (equipBlasterBtn) {
        equipBlasterBtn.addEventListener("click", async () => {
            const { equipment } = getLocalData(user.uid);
            const updatedEquipment = { ...equipment, weapon: "Plasma Blaster", bonusDmg: 5 };
            saveEquipment(user.uid, updatedEquipment);
            addHistory(user.uid, "Nasazena zbraň Plasma Blaster.");
            await reloadWithMessage("Nasadil jsi Plasma Blaster. +5 DMG.");
        });
    }

    if (equipArmorBtn) {
        equipArmorBtn.addEventListener("click", async () => {
            const { equipment } = getLocalData(user.uid);
            const updatedEquipment = { ...equipment, armor: "Nano Armor", bonusHp: 20 };
            saveEquipment(user.uid, updatedEquipment);
            addHistory(user.uid, "Nasazeno brnění Nano Armor.");
            await reloadWithMessage("Nasadil jsi Nano Armor. +20 HP.");
        });
    }

    if (removeEquipBtn) {
        removeEquipBtn.addEventListener("click", async () => {
            const updatedEquipment = {
                weapon: "Žádná",
                armor: "Žádné",
                bonusHp: 0,
                bonusDmg: 0
            };
            saveEquipment(user.uid, updatedEquipment);
            addHistory(user.uid, "Výbava byla sundána.");
            await reloadWithMessage("Sundal jsi veškerou výbavu.");
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            await signOut(auth);
            window.location.replace("./index.html");
        });
    }
}

function renderError(message) {
    content.innerHTML = `
    <div class="dashboard-header">
      <h1>Chyba</h1>
      <p class="subtitle">Nepodařilo se načíst dashboard</p>
    </div>

    <div class="section">
      <div class="stat">
        <span class="stat-label">Info</span>
        <span class="stat-value">${message}</span>
      </div>
      <button class="btn-logout" id="back-btn">Zpět na přihlášení</button>
    </div>
  `;

    const backBtn = document.getElementById("back-btn");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            window.location.replace("./index.html");
        });
    }
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("./index.html");
        return;
    }

    try {
        const alien = await ensureAlienProfile(user);
        renderDashboard(alien, user);
    } catch (error) {
        console.error("Chyba při načtení dashboardu:", error);
        renderError("Nepodařilo se načíst nebo vytvořit data hráče.");
    }
});