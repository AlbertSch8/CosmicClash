# 🛸 UFO: Cosmic Clash

> Prohlížečová sci-fi hra pro více hráčů postavená na čistém JavaScriptu, Vite a Firebase.

**Autoři:** Tadeáš Zikl, Kryštof Málek a Alexandre Basseville

---

## Obsah

- [O projektu](#o-projektu)
- [Technologie](#technologie)
- [Struktura projektu](#struktura-projektu)
- [Instalace a spuštění](#instalace-a-spuštění)
- [Herní mechaniky](#herní-mechaniky)
- [Databázová struktura](#databázová-struktura)
- [Firestore indexy](#firestore-indexy)
- [Zabezpečení](#zabezpečení)
- [Admin panel](#admin-panel)
- [Nasazení](#nasazení)

---

## O projektu

UFO: Cosmic Clash je plně funkční webová hra ve vesmírném stylu. Hráči si vytvářejí vlastní ufoune, trénují je, bojují proti ostatním pilotům z celé galaxie, nakupují vybavení v obchodě a sledují svůj postup na galaktickém žebříčku.

---

## Technologie

| Vrstva | Technologie |
|---|---|
| Frontend | Vanilla JavaScript (ES Modules) |
| Bundler | Vite 7 |
| Autentizace | Firebase Authentication (email/heslo) |
| Databáze | Firebase Firestore (v9 modulární SDK) |
| Hosting | Firebase Hosting |
| Fonty | Google Fonts — Orbitron, Syne, Share Tech Mono |

---

## Struktura projektu

```
CosmicClash/
├── src/
│   ├── firebase.js        # Inicializace Firebase (auth + db)
│   ├── auth.js            # Registrace a přihlášení hráče
│   ├── dashboard.js       # Hlavní dashboard — profil, energie, navigace
│   ├── training.js        # Tréninkový systém (session, countdown, odměny)
│   ├── battle.js          # Bojový systém (matchmaking, výpočet, výsledky)
│   ├── shop.js            # Obchod s předměty
│   ├── equipment.js       # Správa inventáře a nasazování předmětů
│   ├── leaderboard.js     # Galaktický žebříček
│   ├── settings.js        # Nastavení profilu (jméno, avatar)
│   ├── admin.js           # Admin "God Mode" panel
│   └── ui-utils.js        # Sdílené UI utility (toasty, button lock, esc)
├── icons/                 # Herní ikony (PNG)
├── images/                # Avatary ufonů (PNG)
├── index.html             # Login / registrace
├── dashboard.html         # Hlavní herní stránka
├── settings.html          # Nastavení hráče
├── admin.html             # Admin panel
├── vite.config.js         # Vite konfigurace (multi-page)
├── firebase.json          # Firebase Hosting konfigurace
├── firestore.rules        # Firestore Security Rules
└── firestore.indexes.json # Firestore composite indexy
```

---

## Instalace a spuštění

### Požadavky
- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)

### Lokální vývoj

```bash
# 1. Nainstaluj závislosti
npm install

# 2. Spusť vývojový server
npm run dev
```

Hra poběží na `http://localhost:5173`.

### Build a nasazení

```bash
# Build pro produkci
npm run build

# Nasazení na Firebase Hosting
firebase deploy

Hra poběží na `https://cosmicclash-b9510.web.app/`.


# Nasazení pouze pravidel a indexů
firebase deploy --only firestore:rules,firestore:indexes
```

---

## Herní mechaniky

### Energie ⚡
- Každý ufoun má maximálně **5 bodů energie**
- 1 bod se obnoví každých **30 minut**
- Obnova se počítá ze serverového timestampu — nelze podvádět změnou času v prohlížeči
- Trénink a souboj spotřebovávají energii

### Trénink 🏋️
- Dva režimy: **Galaktická posilovna** (HP + DMG) a **Vesmírný běh** (Stamina)
- Každý trénink trvá **1 hodinu** a stojí Star Coins
- Session je uložena v Firestore — odpočet funguje i po reloadu stránky
- Po dokončení hráč vyzvedne odměny (XP, Star Coins, zvýšení statistik)
- Odměnu lze vyzvednout pouze jednou (`rewardsClaimed: true`)

### Souboj ⚔️
- Matchmaking hledá soupeře v rozsahu **±2 levely**
- Výsledek počítá **bojové skóre** podle vzorce:
  ```
  score = (HP × 0.35) + (DMG × 0.4) + (Stamina × 0.15) + (equipBonus × 0.1) + náhodný faktor ±10 %
  ```
- Výhra: +40 XP, +20 Star Coins, 15% šance na Galactic Gem
- Prohra: −1 energie
- Výsledky se ukládají do kolekce `battles`

### Vybavení 🛡️
- Hráč nakupuje předměty v **Obchodě** za Star Coins nebo Galactic Gems
- Předměty lze nasadit v sekci **Vybavení**
- Bonusy (`hpBonus`, `dmgBonus`, `staminaBonus`) se přičítají k základním statistikám
- Nasazené vybavení se projeví na dashboardu i v bojovém skóre

### Leaderboard 🏆
- Top 20 hráčů seřazených podle **levelu** (sestupně), pak **XP** (sestupně)
- Vlastní řádek je vizuálně zvýrazněn
- Pokud hráč není v top 20, zobrazí se motivační hláška

---

## Databázová struktura

### Kolekce `aliens`
Herní profil každého hráče.

| Pole | Typ | Popis |
|---|---|---|
| `userId` | string | Firebase Auth UID |
| `name` | string | Jméno ufouna |
| `type` | string | Původ / typ ufouna |
| `level` | number | Aktuální level (začíná na 1) |
| `xp` | number | Zkušenostní body |
| `hp` | number | Zdraví |
| `dmg` | number | Útok |
| `stamina` | number | Výdrž (0–100) |
| `energy` | number | Aktuální energie (0–5) |
| `energyUpdatedAt` | Timestamp | Čas posledního přepočtu energie |
| `starCoins` | number | Základní měna |
| `galacticGems` | number | Prémiová měna |
| `equippedWeaponId` | string? | ID nasazené zbraně z kolekce `items` |
| `equippedArmorId` | string? | ID nasazeného brnění z kolekce `items` |
| `avatarUrl` | string? | Cesta k avataru (např. `/images/grey.png`) |
| `createdAt` | Timestamp | Datum registrace |

### Kolekce `trainingSessions`
Záznamy o probíhajících a dokončených trénincích.

| Pole | Typ | Popis |
|---|---|---|
| `userId` | string | UID hráče |
| `trainingType` | string | `"gym"` nebo `"run"` |
| `startTime` | Timestamp | Čas zahájení |
| `endTime` | Timestamp | Čas ukončení (startTime + 1 hodina) |
| `status` | string | `"active"` nebo `"done"` |
| `rewardsClaimed` | boolean | Zda byly odměny vyzvednuty |

### Kolekce `battles`
Historie soubojů.

| Pole | Typ | Popis |
|---|---|---|
| `attackerId` | string | UID útočníka |
| `defenderId` | string | UID obránce |
| `attackerName` | string | Jméno útočníka |
| `defenderName` | string | Jméno obránce |
| `myScore` | number | Bojové skóre útočníka |
| `opponentScore` | number | Bojové skóre obránce |
| `result` | string | `"win"` nebo `"loss"` |
| `rewards` | object | Přiznané odměny nebo penalizace |
| `createdAt` | Timestamp | Čas souboje |

### Kolekce `items`
Globální katalog předmětů v obchodě.

| Pole | Typ | Popis |
|---|---|---|
| `name` | string | Název předmětu |
| `type` | string | `"weapon"` nebo `"armor"` |
| `rarity` | string | `common` / `uncommon` / `rare` / `epic` / `legendary` |
| `hpBonus` | number | Bonus k HP |
| `dmgBonus` | number | Bonus k DMG |
| `staminaBonus` | number | Bonus ke Stamině |
| `priceCoins` | number | Cena ve Star Coins |
| `priceGems` | number | Cena v Galactic Gems |
| `isActive` | boolean | Zda je předmět viditelný v obchodě |
| `sortOrder` | number | Pořadí zobrazení |

### Kolekce `inventory`
Předměty vlastněné hráčem.

| Pole | Typ | Popis |
|---|---|---|
| `userId` | string | UID vlastníka |
| `itemId` | string | ID předmětu z kolekce `items` |
| `acquiredAt` | Timestamp | Datum pořízení |

---

## Firestore indexy

Composite indexy definované v `firestore.indexes.json`:

| Kolekce | Pole 1 | Pole 2 | Použití |
|---|---|---|---|
| `trainingSessions` | `userId` ASC | `startTime` DESC | Detekce aktivní session |
| `battles` | `attackerId` ASC | `createdAt` DESC | Historie soubojů |
| `aliens` | `level` DESC | `xp` DESC | Leaderboard |
| `items` | `isActive` ASC | `sortOrder` ASC | Filtrování v obchodě |

Nasazení:
```bash
firebase deploy --only firestore:indexes
```

---

## Zabezpečení

### Firestore Security Rules
Každá kolekce má explicitně definovaná pravidla:

- **`aliens`** — hráč čte/mění pouze svůj dokument; admin účet může měnit jakýkoliv dokument
- **`trainingSessions`** — hráč vytváří session pouze pro sebe (`userId == uid`); může číst/měnit jen vlastní session
- **`battles`** — útočník vytváří záznam pouze se svým UID jako `attackerId`; čtení povoleno oběma účastníkům
- **`items`** — čtení pro všechny přihlášené; zápis pouze pro admin účet
- **`inventory`** — hráč vytváří pouze vlastní záznamy; update/delete zakázán z klienta

### Energie (anti-cheat)
Obnova energie se počítá výhradně z `energyUpdatedAt` timestampu uloženého v Firestore. Lokální čas prohlížeče se k přičítání bodů nepoužívá — manipulace se systémovým časem nemá žádný efekt.

### Tréninkové odměny (anti-farm)
Pole `rewardsClaimed` zabraňuje vícenásobnému vyzvednutí odměny za jednu session. Validace probíhá na straně klienta i v logice zápisu.

---

## Admin panel

Admin panel (`/admin.html`) umožňuje správu hry bez přístupu do Firebase Console.

### Přihlášení
Přihlašuje se přes Firebase Authentication pomocí dedikovaného admin účtu. UID admin účtu je hardcoded v `admin.js` i v `firestore.rules` — tím jsou oprávnění ověřena na dvou nezávislých úrovních.

### Funkce

**Záložka Hráči:**
- Výpis všech ufonů s live vyhledáváním podle jména
- Přidání / odebrání Star Coins a Galactic Gems libovolnému hráči

**Záložka Vybavení:**
- Výpis všech předmětů z kolekce `items`
- Úprava bojových bonusů (`hpBonus`, `dmgBonus`, `staminaBonus`)
- Úprava cen (`priceCoins`, `priceGems`)

### Vytvoření admin účtu
1. Firebase Console → Authentication → Add user
2. Email: `admin@cosmicclash.local`, silné heslo
3. Zkopíruj UID nového uživatele
4. Vlož UID do `src/admin.js` (konstanta `ADMIN_UID`) a do `firestore.rules` (funkce `isAdmin()`)
5. `firebase deploy`
