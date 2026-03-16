/**
 * UFO: Cosmic Clash — Bojový systém
 * Upraveno pro:
 *  - 3 soupeře v matchmakingu
 *  - tahový automatický souboj
 *  - HP + stamina + dodge + weapon cost
 *  - kratší battle log
 *  - hezčí battle preview a replay
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
import { isTrainingActive } from "./training.js";
import { loadEquippedItems, computeEnergyState } from "./dashboard.js";
import { BattleDisplayLogic } from "./logic/battle-display-logic.js";

// ─────────────────────────────────────────────
//  KONSTANTY
// ─────────────────────────────────────────────

const LEVEL_RANGE = 2;
const MATCHMAKING_POOL = 30;
const OPPONENT_COUNT = 3;

const WIN_REWARDS = {
  xp: 40,
  starCoins: 20,
  gemChance: 0.15,
  gemAmount: 1,
};

const LOSS_ENERGY_PENALTY = 1;
const TROPHIES_WIN_MIN = 25;
const TROPHIES_WIN_MAX = 30;
const TROPHIES_LOSS_MIN = 10;
const TROPHIES_LOSS_MAX = 15;

const BASE_STAMINA_REGEN = 5;
const BASE_ATTACK_STAMINA_COST = 10;
const MAX_BATTLE_ROUNDS = 60;

// ─────────────────────────────────────────────
//  VEŘEJNÉ EXPORTY
// ─────────────────────────────────────────────

export async function findOpponent(uid, myLevel) {
  const opponents = await findOpponents(uid, myLevel, 1);
  return opponents[0] ?? null;
}

export async function findOpponents(uid, myLevel, count = OPPONENT_COUNT) {
  const minLevel = Math.max(1, (myLevel ?? 1) - LEVEL_RANGE);
  const maxLevel = (myLevel ?? 1) + LEVEL_RANGE;

  const q = query(
    collection(db, "aliens"),
    where("level", ">=", minLevel),
    orderBy("level", "asc"),
    limit(MATCHMAKING_POOL)
  );

  const snap = await getDocs(q);
  if (snap.empty) return [];

  const candidates = snap.docs
    .filter((d) => d.id !== uid)
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter((entry) => {
      const lvl = entry.data?.level ?? 1;
      return lvl >= minLevel && lvl <= maxLevel;
    });

  if (!candidates.length) return [];

  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export async function executeBattle(uid, opponent) {
  console.log("[BATTLE] executeBattle start", { uid, opponent });

  const alienRef = doc(db, "aliens", uid);
  const alienSnap = await getDoc(alienRef);

  console.log("[BATTLE] alienSnap exists:", alienSnap.exists());

  if (!alienSnap.exists()) {
    throw new Error("Profil hráče nebyl nalezen.");
  }

  let alien = alienSnap.data();

  console.log("[BATTLE] raw energy fields:", {
    energy: alien.energy,
    energyUpdatedAt: alien.energyUpdatedAt,
    energyUpdatedAtType: typeof alien.energyUpdatedAt,
    isTimestamp: alien.energyUpdatedAt instanceof Timestamp,
  });

  const { newEnergy, updatedAt, changed } = computeEnergyState(alien);

  console.log("[BATTLE] computed energy fields:", {
    newEnergy,
    updatedAt,
    changed,
    now: Date.now(),
    diffMs: Date.now() - updatedAt,
  });

  if (changed) {
    await updateDoc(alienRef, {
      energy: newEnergy,
      energyUpdatedAt: Timestamp.fromMillis(updatedAt),
    });

    alien = {
      ...alien,
      energy: newEnergy,
      energyUpdatedAt: Timestamp.fromMillis(updatedAt),
    };

    console.log("[BATTLE] energy updated in DB");
  }

  const energy = alien.energy ?? 0;
  console.log("[BATTLE] final energy before check:", energy);

  if (energy <= 0) {
    console.log("[BATTLE] BLOCKED because energy <= 0");
    throw new Error("Nemáš žádnou energii. Počkej na obnovu.");
  }

  const training = await isTrainingActive(uid);
  console.log("[BATTLE] training active:", training);

  if (training) {
    throw new Error("Nelze bojovat během tréninku.");
  }

  const [myEquip, opponentEquip] = await Promise.all([
    loadEquippedItems(alien),
    loadEquippedItems(opponent.data),
  ]);

  const myFighter = buildBattleFighter(uid, alien, myEquip, true);
  const enemyFighter = buildBattleFighter(opponent.id, opponent.data, opponentEquip, false);

  const replay = simulateBattle(myFighter, enemyFighter);
  const won = replay.winnerId === uid;

  let alienUpdate = {};
  let rewards = {};

  const currentTrophies = Math.max(0, alien.galaxyTrophies ?? 0);

  if (won) {
    const gemDrop = Math.random() < WIN_REWARDS.gemChance;
    const newGems = (alien.galacticGems ?? 0) + (gemDrop ? WIN_REWARDS.gemAmount : 0);
    const trophyGain = randomInt(TROPHIES_WIN_MIN, TROPHIES_WIN_MAX);

    alienUpdate = {
      xp: (alien.xp ?? 0) + WIN_REWARDS.xp,
      starCoins: (alien.starCoins ?? 0) + WIN_REWARDS.starCoins,
      galacticGems: newGems,
      galaxyTrophies: currentTrophies + trophyGain,
    };

    rewards = {
      xp: WIN_REWARDS.xp,
      starCoins: WIN_REWARDS.starCoins,
      galacticGems: gemDrop ? WIN_REWARDS.gemAmount : 0,
      galaxyTrophies: trophyGain,
    };
  } else {
    const reducedEnergy = Math.max(0, energy - LOSS_ENERGY_PENALTY);
    const trophyLoss = randomInt(TROPHIES_LOSS_MIN, TROPHIES_LOSS_MAX);
    const nextTrophies = Math.max(0, currentTrophies - trophyLoss);

    alienUpdate = {
      energy: reducedEnergy,
      energyUpdatedAt: Timestamp.now(),
      galaxyTrophies: nextTrophies,
    };

    rewards = {
      energy: -LOSS_ENERGY_PENALTY,
      galaxyTrophies: nextTrophies - currentTrophies,
    };
  }

  await updateDoc(alienRef, alienUpdate);

  const battleDoc = {
    attackerId: uid,
    defenderId: opponent.id,

    attackerName: alien.name ?? "?",
    defenderName: opponent.data?.name ?? "Soupeř",

    attackerLevel: alien.level ?? 1,
    defenderLevel: opponent.data?.level ?? 1,

    result: won ? "win" : "loss",
    rewards,

    myScore: replay.attackerSummary.score,
    opponentScore: replay.defenderSummary.score,

    attackerFinalHp: replay.attackerSummary.hp,
    defenderFinalHp: replay.defenderSummary.hp,
    attackerFinalStamina: replay.attackerSummary.stamina,
    defenderFinalStamina: replay.defenderSummary.stamina,

    attackerWeapon: replay.attackerSummary.weaponName,
    defenderWeapon: replay.defenderSummary.weaponName,
    attackerArmor: replay.attackerSummary.armorName,
    defenderArmor: replay.defenderSummary.armorName,

    battleLog: replay.log,
    createdAt: Timestamp.now(),
  };

  const battleRef = await addDoc(collection(db, "battles"), battleDoc);

  const updatedAlien = { ...alien, ...alienUpdate };

  return {
    outcome: won ? "win" : "loss",
    myScore: replay.attackerSummary.score,
    opponentScore: replay.defenderSummary.score,
    rewards,
    battleId: battleRef.id,
    updatedAlien,
    opponent,
    replay,
  };
}

export async function fetchBattleHistory(uid, count = 10) {
  const q = query(
    collection(db, "battles"),
    where("attackerId", "==", uid),
    orderBy("createdAt", "desc"),
    limit(count)
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

export async function renderBattleScreen(container, alien, uid, onBack, onRefresh) {
  container.innerHTML = _htmlLoading("Načítám arenu…");

  const energy = alien.energy ?? 0;
  const training = await isTrainingActive(uid);

  _renderIdle(container, alien, uid, energy, training, onBack, onRefresh);
}

// ─────────────────────────────────────────────
//  BATTLE CORE
// ─────────────────────────────────────────────

function buildBattleFighter(uid, alien, equippedItems, isAttacker = false) {
  const baseHp = alien.hp ?? 100;
  const baseDmg = alien.dmg ?? 10;
  const baseStamina = alien.stamina ?? 100;

  const weapon = equippedItems?.weapon ?? null;
  const armor = equippedItems?.armor ?? null;

  const bonusHp = equippedItems?.bonusHp ?? 0;
  const bonusDmg = equippedItems?.bonusDmg ?? 0;
  const bonusStamina = equippedItems?.bonusStamina ?? 0;

  const maxHp = baseHp + bonusHp;
  const maxStamina = baseStamina + bonusStamina;

  const armorReduction =
    (armor?.armorReduction ?? 0) ||
    (armor?.defense ?? 0) ||
    Math.max(
      0,
      Math.round(((armor?.hpBonus ?? 0) * 0.08) + ((armor?.dmgBonus ?? 0) * 0.05))
    );

  const staminaRegenBonus =
    (armor?.staminaRegenBonus ?? 0) ||
    (armor?.regenBonus ?? 0) ||
    0;

  const dodgeChance = clamp(
    (
      (alien.dodgeChance ?? 0) +
      (weapon?.dodgeChance ?? 0) +
      (armor?.dodgeChance ?? 0)
    ) || 0.06,
    0,
    0.35
  );

  const weaponDamageBonus =
    (weapon?.battleDamageBonus ?? 0) ||
    (weapon?.weaponDamage ?? 0) ||
    (weapon?.dmgBonus ?? 0) ||
    0;

  const weaponExtraStaminaCost = Math.max(
    0,
    Number(weapon?.staminaBonus ?? weapon?.staminaCost ?? 0)
  );

  const staminaCost = clamp(
    BASE_ATTACK_STAMINA_COST + weaponExtraStaminaCost,
    5,
    30
  );

  return {
    uid,
    isAttacker,
    name: alien.name ?? "Neznámý ufoun",
    origin: alien.origin ?? alien.type ?? "Neznámý původ",
    level: alien.level ?? 1,
    avatar: getAvatarUrl(alien),

    maxHp,
    hp: maxHp,

    baseDmg,
    dmg: baseDmg + bonusDmg,
    maxStamina,
    stamina: maxStamina,

    weaponName: weapon?.name ?? "Základní výzbroj",
    armorName: armor?.name ?? "Žádné brnění",

    weapon,
    armor,

    weaponDamageBonus,
    staminaCost,
    armorReduction,
    staminaRegen: BASE_STAMINA_REGEN + staminaRegenBonus,
    dodgeChance,
  };
}

function simulateBattle(attackerInput, defenderInput) {
  const attacker = cloneFighter(attackerInput);
  const defender = cloneFighter(defenderInput);

  const log = [];
  const timeline = [];

  let current = Math.random() < 0.5 ? attacker : defender;
  let enemy = current.uid === attacker.uid ? defender : attacker;

  log.push(`${current.name} začíná.`);
  timeline.push(createFrame(attacker, defender, log[log.length - 1], current.uid));

  let rounds = 0;

  while (attacker.hp > 0 && defender.hp > 0 && rounds < MAX_BATTLE_ROUNDS) {
    rounds += 1;

    const cost = current.staminaCost;
    let message = "";

    if (current.stamina < cost) {
      const beforeRegen = current.stamina;
      current.stamina = Math.min(current.maxStamina, current.stamina + current.staminaRegen);

      message =
        `${current.name}: málo staminy (${beforeRegen}/${current.maxStamina}) -> regen na ${current.stamina}.`;
    } else {
      current.stamina = Math.max(0, current.stamina - cost);

      const dodgeRoll = Math.random();
      if (dodgeRoll < enemy.dodgeChance) {
        message =
          `${current.name} -> ${current.weaponName} | ${enemy.name} uhnul | STA ${current.stamina}/${current.maxStamina}`;
      } else {
        const rawDamage = current.dmg + current.weaponDamageBonus;
        const randomMultiplier = 0.8 + Math.random() * 0.4;
        const randomized = Math.round(rawDamage * randomMultiplier);
        const finalDamage = Math.max(1, randomized - enemy.armorReduction);

        enemy.hp = Math.max(0, enemy.hp - finalDamage);

        message =
          `${current.name} -> ${current.weaponName} | -${finalDamage} HP | ${enemy.name}: ${enemy.hp}/${enemy.maxHp} HP`;
      }

      enemy.stamina = Math.min(enemy.maxStamina, enemy.stamina + enemy.staminaRegen);
    }

    log.push(message);
    timeline.push(createFrame(attacker, defender, message, current.uid));

    if (enemy.hp <= 0) {
      break;
    }

    const tmp = current;
    current = enemy;
    enemy = tmp;
  }

  let winner;
  let loser;

  if (attacker.hp <= 0 && defender.hp <= 0) {
    winner = attacker.hp >= defender.hp ? attacker : defender;
    loser = winner.uid === attacker.uid ? defender : attacker;
  } else {
    winner = attacker.hp > 0 ? attacker : defender;
    loser = winner.uid === attacker.uid ? defender : attacker;
  }

  if (rounds >= MAX_BATTLE_ROUNDS && attacker.hp > 0 && defender.hp > 0) {
    winner = attacker.hp >= defender.hp ? attacker : defender;
    loser = winner.uid === attacker.uid ? defender : attacker;

    const timeoutMsg = `Limit kol. Na body vyhrává ${winner.name}.`;
    log.push(timeoutMsg);
    timeline.push(createFrame(attacker, defender, timeoutMsg, winner.uid));
  } else {
    const endMsg = `${winner.name} vyhrál souboj.`;
    log.push(endMsg);
    timeline.push(createFrame(attacker, defender, endMsg, winner.uid));
  }

  return {
    winnerId: winner.uid,
    loserId: loser.uid,
    log,
    timeline,
    attackerSummary: createSummary(attacker),
    defenderSummary: createSummary(defender),
  };
}

function createSummary(fighter) {
  const score =
    Math.round(fighter.hp) +
    Math.round(fighter.stamina) +
    Math.round(fighter.dmg * 2) +
    Math.round(fighter.level * 5);

  return {
    uid: fighter.uid,
    name: fighter.name,
    hp: fighter.hp,
    maxHp: fighter.maxHp,
    stamina: fighter.stamina,
    maxStamina: fighter.maxStamina,
    dmg: fighter.dmg,
    level: fighter.level,
    weaponName: fighter.weaponName,
    armorName: fighter.armorName,
    score,
  };
}

function createFrame(attacker, defender, message, activeUid) {
  return {
    message,
    activeUid,
    attacker: {
      uid: attacker.uid,
      hp: attacker.hp,
      maxHp: attacker.maxHp,
      stamina: attacker.stamina,
      maxStamina: attacker.maxStamina,
    },
    defender: {
      uid: defender.uid,
      hp: defender.hp,
      maxHp: defender.maxHp,
      stamina: defender.stamina,
      maxStamina: defender.maxStamina,
    },
  };
}

function cloneFighter(f) {
  return JSON.parse(JSON.stringify(f));
}

function estimateWeaponStaminaCost(weapon) {
  if (!weapon) return 5;

  const dmg =
    (weapon.battleDamageBonus ?? 0) ||
    (weapon.weaponDamage ?? 0) ||
    (weapon.dmgBonus ?? 0) ||
    0;

  if (dmg >= 12) return 15;
  if (dmg >= 7) return 10;
  return 5;
}

// ─────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────

function _renderIdle(container, alien, uid, energy, trainingActive, onBack, onRefresh) {
  const blocked = energy <= 0 || trainingActive;
  const blockMsg = trainingActive
    ? "Probíhá trénink — souboj není dostupný."
    : energy <= 0
      ? "Nemáš energii — počkej na obnovu."
      : "";

  container.innerHTML = `
    <div class="dash-header">
      <span class="logo-icon">⚔️</span>
      <h1>Bojová aréna</h1>
      <p class="subtitle">Najdi soupeře a sleduj automatický souboj</p>
    </div>

    ${_htmlFighterCard("Tvůj ufoun", alien, null, "attacker")}

    ${blocked ? `<div class="battle-block-msg">${_esc(blockMsg)}</div>` : ""}

    <div class="card">
      <button class="btn btn-battle" id="btn-find-opponents" ${blocked ? "disabled" : ""}>
        Najít soupeře
      </button>
      <div id="battle-status" class="battle-status-msg"></div>
    </div>

    <div id="battle-dynamic-area"></div>

    <div class="card">
      <button class="btn btn-secondary" id="btn-history">Historie soubojů</button>
    </div>

    <div class="card">
      <button class="btn btn-secondary" id="btn-back-dashboard">← Zpět na dashboard</button>
    </div>
  `;

  document.getElementById("btn-find-opponents")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-find-opponents");
    btn.disabled = true;
    btn.textContent = "Hledám...";
    _setStatus("Prohledávám galaxii...");

    try {
      const opponents = await findOpponents(uid, alien.level ?? 1, OPPONENT_COUNT);

      if (!opponents.length) {
        _setStatus("Žádný vhodný soupeř nebyl nalezen. Zkus to znovu.");
        btn.disabled = false;
        btn.textContent = "Najít soupeře";
        return;
      }

      _renderOpponentChoices(container, alien, uid, opponents, energy, trainingActive, onBack, onRefresh);
    } catch (err) {
      console.error("[CosmicClash/battle] Chyba při hledání soupeřů:", err);
      _setStatus(err.message ?? "Hledání soupeřů selhalo.");
      btn.disabled = false;
      btn.textContent = "Najít soupeře";
    }
  });

  document.getElementById("btn-history")?.addEventListener("click", async () => {
    _renderHistory(container, uid, alien, energy, trainingActive, onBack, onRefresh);
  });

  _bindBackButton(container, onBack);
}

function _renderOpponentChoices(container, alien, uid, opponents, energy, trainingActive, onBack, onRefresh) {
  container.innerHTML = `
    <div class="dash-header">
      <span class="logo-icon">👾</span>
      <h1>Vyber si soupeře</h1>
      <p class="subtitle">Našli jsme soupeře podobné úrovně</p>
    </div>

    <div class="card">
      <p class="section-title">Tvoje statistiky</p>
      ${_htmlFighterCard("Tvůj ufoun", alien, null, "attacker")}
    </div>

    <div class="card">
      <p class="section-title">Dostupní soupeři</p>
      <div class="battle-opponents-grid">
        ${opponents.map((op, idx) => `
          <div class="battle-opponent-card">
            ${_htmlFighterCard(`Soupeř ${idx + 1}`, op.data, null, "defender", false)}
            <button class="btn btn-battle battle-select-opponent" data-opponent-id="${_escAttr(op.id)}">
              Vybrat soupeře
            </button>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="card">
      <button class="btn btn-secondary" id="btn-find-again">Najít znovu</button>
      <button class="btn btn-secondary" id="btn-back-dashboard" style="margin-top:10px;">← Zpět na dashboard</button>
    </div>
  `;

  document.querySelectorAll(".battle-select-opponent").forEach((btn) => {
    btn.addEventListener("click", () => {
      const opponentId = btn.getAttribute("data-opponent-id");
      const selected = opponents.find((o) => o.id === opponentId);
      if (!selected) return;

      _renderBattlePreview(container, alien, uid, selected, energy, onBack, onRefresh);
    });
  });

  document.getElementById("btn-find-again")?.addEventListener("click", () => {
    _renderIdle(container, alien, uid, energy, trainingActive, onBack, onRefresh);
  });

  _bindBackButton(container, onBack);
}

async function _renderBattlePreview(container, alien, uid, opponent, energy, onBack, onRefresh) {
  container.innerHTML = _htmlLoading("Načítám bojovníky...");

  try {
    const [myEquip, enemyEquip] = await Promise.all([
      loadEquippedItems(alien),
      loadEquippedItems(opponent.data),
    ]);

    container.innerHTML = `
      <div class="dash-header">
        <span class="logo-icon">⚔️</span>
        <h1>Souboj připraven</h1>
        <p class="subtitle">Zkontroluj statistiky před zahájením</p>
      </div>

      <div style="
        display:grid;
        grid-template-columns:minmax(0,1fr) 90px minmax(0,1fr);
        gap:18px;
        align-items:center;
        margin-bottom:18px;
      ">
        ${_htmlFighterCard("Tvůj ufoun", alien, myEquip, "attacker")}
        <div style="
          display:flex;
          align-items:center;
          justify-content:center;
          min-height:100%;
        ">
          <div style="
            width:72px;
            height:72px;
            border-radius:999px;
            background:linear-gradient(135deg,#7c3aed,#ec4899);
            color:white;
            display:flex;
            align-items:center;
            justify-content:center;
            font-weight:800;
            font-size:24px;
            letter-spacing:.08em;
            box-shadow:0 10px 30px rgba(124,58,237,.35);
          ">VS</div>
        </div>
        ${_htmlFighterCard("Soupeř", opponent.data, enemyEquip, "defender")}
      </div>

      ${_htmlStatComparison(alien, opponent.data, myEquip, enemyEquip)}

      <div class="card">
        <button class="btn btn-battle" id="btn-start-battle">Zahájit souboj</button>
        <button class="btn btn-secondary" id="btn-pick-other" style="margin-top:10px">Vybrat jiného soupeře</button>
        <div id="battle-status" class="battle-status-msg"></div>
      </div>

      <div class="card">
        <button class="btn btn-secondary" id="btn-back-dashboard">← Zpět na dashboard</button>
      </div>
    `;

    document.getElementById("btn-start-battle")?.addEventListener("click", async () => {
      const btn = document.getElementById("btn-start-battle");
      const btn2 = document.getElementById("btn-pick-other");

      btn.disabled = true;
      btn2.disabled = true;
      btn.textContent = "Probíhá souboj...";
      _setStatus("Spouštím tahový souboj...");

      try {
        const result = await executeBattle(uid, opponent);
        _renderReplay(container, alien, uid, result, energy, onBack, onRefresh);
      } catch (err) {
        console.error("[CosmicClash/battle] Chyba při souboji:", err);
        _setStatus(err.message ?? "Souboj selhal.");
        btn.disabled = false;
        btn2.disabled = false;
        btn.textContent = "Zahájit souboj";
      }
    });

    document.getElementById("btn-pick-other")?.addEventListener("click", async () => {
      const opponents = await findOpponents(uid, alien.level ?? 1, OPPONENT_COUNT);
      _renderOpponentChoices(container, alien, uid, opponents, energy, false, onBack, onRefresh);
    });

    _bindBackButton(container, onBack);
  } catch (err) {
    container.innerHTML = `
      <div class="dash-header">
        <span class="logo-icon">💥</span>
        <h1>Chyba</h1>
      </div>
      <div class="card">
        <p style="color:#fca5a5;font-size:14px;">${_esc(err.message ?? "Nepodařilo se načíst bojovníky.")}</p>
        <button class="btn btn-secondary" id="btn-back-dashboard">← Zpět na dashboard</button>
      </div>
    `;
    _bindBackButton(container, onBack);
  }
}

async function _renderReplay(container, alien, uid, result, prevEnergy, onBack, onRefresh) {
  const won = result.outcome === "win";
  const replay = result.replay;

  const myState = replay.attackerSummary.uid === uid ? replay.attackerSummary : replay.defenderSummary;
  const enemyState = replay.attackerSummary.uid === uid ? replay.defenderSummary : replay.attackerSummary;

  container.innerHTML = `
    <div class="dash-header">
      <span class="logo-icon">${won ? "🏆" : "💀"}</span>
      <h1>${won ? "Vítězství" : "Prohra"}</h1>
      <p class="subtitle">Průběh souboje krok za krokem</p>
    </div>

    <div style="
      display:grid;
      grid-template-columns:minmax(0,1fr) 90px minmax(0,1fr);
      gap:18px;
      align-items:center;
      margin-bottom:18px;
    ">
      ${_htmlReplayCard(
        "Tvůj ufoun",
        replay.attackerSummary.uid === uid ? result.updatedAlien : result.opponent.data,
        myState,
        replay.attackerSummary.uid === uid ? "attacker" : "defender"
      )}
      <div style="
        display:flex;
        align-items:center;
        justify-content:center;
        min-height:100%;
      ">
        <div style="
          width:72px;
          height:72px;
          border-radius:999px;
          background:linear-gradient(135deg,#7c3aed,#ec4899);
          color:white;
          display:flex;
          align-items:center;
          justify-content:center;
          font-weight:800;
          font-size:24px;
          letter-spacing:.08em;
          box-shadow:0 10px 30px rgba(124,58,237,.35);
        ">VS</div>
      </div>
      ${_htmlReplayCard(
        "Soupeř",
        replay.attackerSummary.uid === uid ? result.opponent.data : result.updatedAlien,
        enemyState,
        replay.attackerSummary.uid === uid ? "defender" : "attacker"
      )}
    </div>

    <div class="card">
      <p class="section-title">Průběh souboje</p>
      <div id="battle-live-message" class="battle-status-msg" style="
        margin-bottom:12px;
        font-size:14px;
        font-weight:600;
        color:#f5ecff;
      ">Souboj začíná...</div>

      <div id="battle-bars-wrap">
        ${_htmlReplayBars("player", myState.hp, myState.maxHp, myState.stamina, myState.maxStamina)}
        ${_htmlReplayBars("enemy", enemyState.hp, enemyState.maxHp, enemyState.stamina, enemyState.maxStamina)}
      </div>

      <div id="battle-log-box" style="
        max-height:280px;
        overflow:auto;
        background:rgba(255,255,255,.03);
        border:1px solid rgba(255,255,255,.08);
        border-radius:14px;
        padding:10px;
        font-size:13px;
        color:#e9ddff;
        line-height:1.4;
      "></div>
    </div>

    <div class="card">
      <p class="section-title">Výsledek</p>
      <p style="font-size:14px;color:#c4b5d4;margin-bottom:8px;">
        ${won ? "Vyhrál jsi souboj." : "Tentokrát jsi prohrál."}
      </p>
      <p style="font-size:14px;color:#e8d5ff;">
        ${_formatRewards(result.rewards, won)}
      </p>
    </div>

    <div class="card">
      <button class="btn btn-battle" id="btn-fight-again" disabled>Bojovat znovu</button>
      <button class="btn btn-secondary" id="btn-history" style="margin-top:10px" disabled>Historie soubojů</button>
    </div>

    <div class="card">
      <button class="btn btn-secondary" id="btn-back-dashboard" disabled>← Zpět na dashboard</button>
    </div>
  `;

  const frames = replay.timeline ?? [];
  const logBox = document.getElementById("battle-log-box");
  const liveMessage = document.getElementById("battle-live-message");

  let i = 0;

  const interval = setInterval(() => {
    if (i >= frames.length) {
      clearInterval(interval);

      document.getElementById("btn-fight-again")?.removeAttribute("disabled");
      document.getElementById("btn-history")?.removeAttribute("disabled");
      document.getElementById("btn-back-dashboard")?.removeAttribute("disabled");
      return;
    }

    const frame = frames[i];
    liveMessage.textContent = frame.message;

    const line = document.createElement("div");
    line.style.cssText = `
      margin-bottom:8px;
      padding:8px 10px;
      border-radius:10px;
      background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.06);
      font-size:13px;
    `;
    line.textContent = `${i + 1}. ${frame.message}`;
    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;

    const playerFrame = frame.attacker.uid === uid ? frame.attacker : frame.defender;
    const enemyFrame = frame.attacker.uid === uid ? frame.defender : frame.attacker;

    document.getElementById("player-hp-bar").style.width = `${pct(playerFrame.hp, playerFrame.maxHp)}%`;
    document.getElementById("player-stamina-bar").style.width = `${pct(playerFrame.stamina, playerFrame.maxStamina)}%`;
    document.getElementById("enemy-hp-bar").style.width = `${pct(enemyFrame.hp, enemyFrame.maxHp)}%`;
    document.getElementById("enemy-stamina-bar").style.width = `${pct(enemyFrame.stamina, enemyFrame.maxStamina)}%`;

    document.getElementById("player-hp-text").textContent = `${playerFrame.hp} / ${playerFrame.maxHp}`;
    document.getElementById("player-stamina-text").textContent = `${playerFrame.stamina} / ${playerFrame.maxStamina}`;
    document.getElementById("enemy-hp-text").textContent = `${enemyFrame.hp} / ${enemyFrame.maxHp}`;
    document.getElementById("enemy-stamina-text").textContent = `${enemyFrame.stamina} / ${enemyFrame.maxStamina}`;

    i += 1;
  }, 900);

  const newEnergy = result.updatedAlien.energy ?? prevEnergy;

  document.getElementById("btn-fight-again")?.addEventListener("click", async () => {
    const freshAlien = { ...alien, ...result.updatedAlien };
    const stillTraining = await isTrainingActive(uid);
    _renderIdle(container, freshAlien, uid, newEnergy, stillTraining, onBack, onRefresh);
  });

  document.getElementById("btn-history")?.addEventListener("click", async () => {
    _renderHistory(container, uid, { ...alien, ...result.updatedAlien }, newEnergy, false, onBack, onRefresh);
  });

  _bindBackButton(container, onBack);
}

async function _renderHistory(container, uid, alien, energy, trainingActive, onBack, onRefresh) {
  container.innerHTML = _htmlLoading("Načítám historii soubojů...");

  try {
    const history = await fetchBattleHistory(uid, 10);

    container.innerHTML = `
      <div class="dash-header">
        <span class="logo-icon">📜</span>
        <h1>Historie soubojů</h1>
        <p class="subtitle">Posledních 10 bitev</p>
      </div>

      <div class="card">
        ${history.length ? history.map((row) => {
          const b = row.data ?? {};
          const dateText = formatDate(b.createdAt);
          const resultText = b.result === "win" ? "Výhra" : "Prohra";

          return `
            <div style="
              padding:12px 0;
              border-bottom:1px solid rgba(255,255,255,.08);
            ">
              <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                <strong>${_esc(b.attackerName ?? "Ty")} vs ${_esc(b.defenderName ?? "Soupeř")}</strong>
                <span style="color:${b.result === "win" ? "#86efac" : "#fca5a5"};">${resultText}</span>
              </div>
              <div style="font-size:13px;color:#c4b5d4;margin-top:6px;">
                Level ${b.attackerLevel ?? 1} vs ${b.defenderLevel ?? 1}
              </div>
              <div style="font-size:13px;color:#c4b5d4;margin-top:4px;">
                ${dateText}
              </div>
              <div style="font-size:13px;color:#e8d5ff;margin-top:6px;">
                Odměna / penalizace: ${_formatRewards(b.rewards ?? {}, b.result === "win")}
              </div>
            </div>
          `;
        }).join("") : `
          <p style="font-size:14px;color:#c4b5d4;">Zatím tu žádné souboje nejsou.</p>
        `}
      </div>

      <div class="card">
        <button class="btn btn-secondary" id="btn-back-battle">← Zpět do arény</button>
      </div>

      <div class="card">
        <button class="btn btn-secondary" id="btn-back-dashboard">← Zpět na dashboard</button>
      </div>
    `;

    document.getElementById("btn-back-battle")?.addEventListener("click", () => {
      _renderIdle(container, alien, uid, energy, trainingActive, onBack, onRefresh);
    });

    _bindBackButton(container, onBack);
  } catch (err) {
    container.innerHTML = `
      <div class="dash-header">
        <span class="logo-icon">💥</span>
        <h1>Chyba</h1>
      </div>
      <div class="card">
        <p style="color:#fca5a5;font-size:14px;">${_esc(err.message ?? "Nepodařilo se načíst historii.")}</p>
        <button class="btn btn-secondary" id="btn-back-battle">← Zpět do arény</button>
      </div>
    `;

    document.getElementById("btn-back-battle")?.addEventListener("click", () => {
      _renderIdle(container, alien, uid, energy, trainingActive, onBack, onRefresh);
    });
  }
}

// ─────────────────────────────────────────────
//  HTML HELPERY
// ─────────────────────────────────────────────

function _htmlFighterCard(title, alien, equippedItems = null, side = "attacker", withWrapper = true) {
  const avatar = getAvatarUrl(alien);
  const origin = alien.origin ?? alien.type ?? "Neznámý původ";

  let hp = alien.hp ?? 100;
  let dmg = alien.dmg ?? 10;
  let stamina = alien.stamina ?? 100;

  let weaponName = "Žádná zbraň";
  let armorName = "Žádné brnění";

  if (equippedItems) {
    hp += equippedItems.bonusHp ?? 0;
    dmg += equippedItems.bonusDmg ?? 0;
    stamina += equippedItems.bonusStamina ?? 0;
    weaponName = equippedItems.weapon?.name ?? "Žádná zbraň";
    armorName = equippedItems.armor?.name ?? "Žádné brnění";
  }

  const borderColor = side === "attacker" ? "rgba(96,165,250,.25)" : "rgba(244,114,182,.25)";

  const inner = `
    <div style="
      background:rgba(255,255,255,.03);
      border:1px solid ${borderColor};
      border-radius:18px;
      padding:14px;
      box-shadow:0 8px 24px rgba(0,0,0,.18);
    ">
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">
        <img
          src="${_escAttr(avatar)}"
          alt="avatar"
          style="width:68px;height:68px;border-radius:999px;object-fit:cover;border:2px solid rgba(255,255,255,.12);"
          onerror="this.onerror=null;this.src='/icons/ufo.png';"
        />
        <div style="min-width:0;">
          <div style="font-size:12px;color:#a78bfa;text-transform:uppercase;letter-spacing:.08em;">${_esc(title)}</div>
          <div style="font-size:18px;font-weight:700;color:#f5ecff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${_esc(alien.name ?? "Ufoun")}
          </div>
          <div style="font-size:13px;color:#c4b5d4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${_esc(origin)}
          </div>
        </div>
      </div>

      <div class="stat-row"><span class="stat-label">Level</span><span class="stat-value">${alien.level ?? 1}</span></div>
      <div class="stat-row"><span class="stat-label">HP</span><span class="stat-value">${hp}</span></div>
      <div class="stat-row"><span class="stat-label">DMG</span><span class="stat-value">${dmg}</span></div>
      <div class="stat-row"><span class="stat-label">STA</span><span class="stat-value">${stamina}</span></div>
      <div class="stat-row"><span class="stat-label">Zbraň</span><span class="stat-value">${_esc(weaponName)}</span></div>
      <div class="stat-row"><span class="stat-label">Armor</span><span class="stat-value">${_esc(armorName)}</span></div>
    </div>
  `;

  if (!withWrapper) return inner;
  return `<div class="battle-fighter-card ${side}">${inner}</div>`;
}

function _htmlReplayCard(title, alien, state, side) {
  const avatar = getAvatarUrl(alien);
  const origin = alien.origin ?? alien.type ?? "Neznámý původ";
  const borderColor = side === "attacker" ? "rgba(96,165,250,.25)" : "rgba(244,114,182,.25)";

  return `
    <div class="battle-fighter-card ${side}">
      <div style="
        background:rgba(255,255,255,.03);
        border:1px solid ${borderColor};
        border-radius:18px;
        padding:14px;
        box-shadow:0 8px 24px rgba(0,0,0,.18);
      ">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">
          <img
            src="${_escAttr(avatar)}"
            alt="avatar"
            style="width:68px;height:68px;border-radius:999px;object-fit:cover;border:2px solid rgba(255,255,255,.12);"
            onerror="this.onerror=null;this.src='/icons/ufo.png';"
          />
          <div style="min-width:0;">
            <div style="font-size:12px;color:#a78bfa;text-transform:uppercase;letter-spacing:.08em;">${_esc(title)}</div>
            <div style="font-size:18px;font-weight:700;color:#f5ecff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${_esc(state.name ?? alien.name ?? "Ufoun")}
            </div>
            <div style="font-size:13px;color:#c4b5d4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${_esc(origin)}
            </div>
          </div>
        </div>

        <div class="stat-row"><span class="stat-label">Level</span><span class="stat-value">${state.level ?? alien.level ?? 1}</span></div>
        <div class="stat-row"><span class="stat-label">HP</span><span class="stat-value">${state.hp} / ${state.maxHp}</span></div>
        <div class="stat-row"><span class="stat-label">STA</span><span class="stat-value">${state.stamina} / ${state.maxStamina}</span></div>
        <div class="stat-row"><span class="stat-label">Zbraň</span><span class="stat-value">${_esc(state.weaponName ?? "Žádná zbraň")}</span></div>
        <div class="stat-row"><span class="stat-label">Armor</span><span class="stat-value">${_esc(state.armorName ?? "Žádné brnění")}</span></div>
      </div>
    </div>
  `;
}

function _htmlReplayBars(prefix, hp, maxHp, stamina, maxStamina) {
  return `
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:13px;color:#e8d5ff;margin-bottom:6px;">
        <span>${prefix === "player" ? "Tvůj ufoun" : "Soupeř"} HP</span>
        <span id="${prefix}-hp-text">${hp} / ${maxHp}</span>
      </div>
      <div style="height:12px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden;margin-bottom:10px;">
        <div id="${prefix}-hp-bar" style="height:100%;width:${pct(hp, maxHp)}%;background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
      </div>

      <div style="display:flex;justify-content:space-between;gap:8px;font-size:13px;color:#e8d5ff;margin-bottom:6px;">
        <span>${prefix === "player" ? "Tvůj ufoun" : "Soupeř"} Stamina</span>
        <span id="${prefix}-stamina-text">${stamina} / ${maxStamina}</span>
      </div>
      <div style="height:12px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden;">
        <div id="${prefix}-stamina-bar" style="height:100%;width:${pct(stamina, maxStamina)}%;background:linear-gradient(90deg,#38bdf8,#60a5fa);"></div>
      </div>
    </div>
  `;
}

function _htmlStatComparison(me, enemy, myEquip = null, enemyEquip = null) {
  const myStats = getDisplayStats(me, myEquip);
  const enemyStats = getDisplayStats(enemy, enemyEquip);

  return `
    <div class="card">
      <p class="section-title">Rychlé porovnání</p>
      <div style="
        display:grid;
        grid-template-columns:1fr 1fr 1fr;
        gap:10px;
        text-align:center;
      ">
        <div style="padding:10px;border-radius:12px;background:rgba(255,255,255,.03);">
          <div style="font-size:12px;color:#a78bfa;">HP</div>
          <div style="font-weight:700;color:#f5ecff;">${myStats.hp} vs ${enemyStats.hp}</div>
        </div>
        <div style="padding:10px;border-radius:12px;background:rgba(255,255,255,.03);">
          <div style="font-size:12px;color:#a78bfa;">DMG</div>
          <div style="font-weight:700;color:#f5ecff;">${myStats.dmg} vs ${enemyStats.dmg}</div>
        </div>
        <div style="padding:10px;border-radius:12px;background:rgba(255,255,255,.03);">
          <div style="font-size:12px;color:#a78bfa;">STA</div>
          <div style="font-weight:700;color:#f5ecff;">${myStats.stamina} vs ${enemyStats.stamina}</div>
        </div>
      </div>
    </div>
  `;
}

function _htmlLoading(text) {
  return `
    <div class="card">
      <div class="loading-wrap">
        <div class="loading-text">${_esc(text)}</div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────
//  MALÉ HELPERY
// ─────────────────────────────────────────────

function getDisplayStats(alien, equippedItems = null) {
  let hp = alien.hp ?? 100;
  let dmg = alien.dmg ?? 10;
  let stamina = alien.stamina ?? 100;

  let weapon = "Žádná zbraň";
  let armor = "Žádné brnění";

  if (equippedItems) {
    hp += equippedItems.bonusHp ?? 0;
    dmg += equippedItems.bonusDmg ?? 0;
    stamina += equippedItems.bonusStamina ?? 0;
    weapon = equippedItems.weapon?.name ?? "Žádná zbraň";
    armor = equippedItems.armor?.name ?? "Žádné brnění";
  }

  return { hp, dmg, stamina, weapon, armor };
}

function getAvatarUrl(alien) {
  return (
    alien.avatarUrl ||
    alien.avatar ||
    alien.photoURL ||
    alien.photoUrl ||
    alien.imageUrl ||
    alien.img ||
    "/icons/ufo.png"
  );
}

function _formatRewards(rewards, won) {
  return BattleDisplayLogic.formatRewards(rewards, won);
}

function randomInt(min, max) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function _setStatus(message) {
  const el = document.getElementById("battle-status");
  if (el) el.textContent = message;
}

function _bindBackButton(container, onBack) {
  const btn = container.querySelector("#btn-back-dashboard");
  if (!btn) return;
  btn.addEventListener("click", () => onBack());
}

function formatDate(value) {
  return BattleDisplayLogic.formatDate(value);
}

function pct(value, max) {
  return BattleDisplayLogic.pct(value, max);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function _esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function _escAttr(value) {
  return _esc(value).replaceAll("`", "&#96;");
}