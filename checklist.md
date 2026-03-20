# UFO: Cosmic Clash — Odpovědi na checklist

**Autoři:** Tadeáš Zikl, Kryštof Málek, Alexandre Basseville

---

## Architecture

**✅ Repo obsahuje README s popisem architektury aplikace**
`README.md` popisuje třívrstvou architekturu: frontend (Vanilla JS + Vite), backend (Firebase Firestore), autentizaci (Firebase Auth) a hosting (Firebase Hosting). Jsou zde popsány herní mechaniky, databázové kolekce se všemi poli a jejich typy, Firestore indexy a Security Rules.

**✅ Repo obsahuje přehled použitých technologií a jejich verzí**
README obsahuje tabulku technologií. Přesné verze jsou zaznamenány v `package.json`: `firebase ^12.10.0`, `vite ^7.3.1`, `vitest ^4.1.0`, `jsdom ^29.0.0`.

**✅ Projekt má jasnou strukturu složek**
Projekt je rozdělen na `src/` (aplikační logika — 13 JS modulů), `public/` (statické soubory — ikony, avatary), `tests/` (jednotkové testy), kořenové HTML soubory pro každou stránku a konfigurační soubory. Herní logika je dále oddělena do `src/logic/`.

**✅ Logika aplikace je oddělena od uživatelského rozhraní**
Herní logika (`calculateFinalStats`, `computeEnergyState`, `isSessionActive`, `hasPendingReward`) je extrahována do čistých tříd v `src/logic/game-logic.js` a `src/logic/training-session-logic.js` bez jakékoli závislosti na DOM. UI funkce jsou v `src/ui-utils.js`. Renderovací funkce přijímají DOM element jako parametr.

**✅ Statické soubory jsou odděleny od aplikační logiky**
Obrázky avatarů jsou v `public/images/`, ikony v `public/icons/`. Aplikační logika je v `src/`. Vite při buildu statické soubory zkopíruje do `dist/` a JS bundluje do `dist/assets/` s hash v názvu souboru.

**✅ Projekt obsahuje konfigurační soubor pro produkční prostředí**
`firebase.json` konfiguruje Hosting (veřejná složka `dist/`) a Firestore (pravidla, indexy). `firestore.rules` a `firestore.indexes.json` definují databázová pravidla a jsou verzovány v repozitáři.

**✅ Citlivé údaje nejsou uloženy v repozitáři**
Firebase konfigurace (`apiKey` atd.) v `firebase.js` je záměrně veřejná — Firebase API klíče jsou určeny pro klientský kód a přístup je řízen Firestore Security Rules, nikoliv utajením klíče. Heslo k admin panelu není v kódu — admin se přihlašuje přes Firebase Authentication s dedikovaným účtem.

---

## Dependencies

**✅ Projekt obsahuje seznam všech externích knihoven a jejich verzí**
`package.json` eviduje všechny závislosti s přesnými verzemi: `firebase ^12.10.0` (produkční), `vite ^7.3.1`, `vitest ^4.1.0`, `jsdom ^29.0.0` (vývojové).

**✅ Všechny závislosti jsou instalovány pomocí správce balíčků**
Všechny závislosti se instalují přes `npm install`. Žádná knihovna není přidávána ručně ani přes CDN.

**✅ Repo obsahuje lock soubor**
`package-lock.json` (110 KB) je součástí repozitáře a zajišťuje reprodukovatelné instalace — všichni členové týmu i CI/CD pipeline instalují přesně stejné verze.

**✅ Tým pravidelně kontroluje aktualizace závislostí**
Firebase v12 a Vite v7 jsou nejnovější major verze v době vývoje. Aktualizace se provádějí pomocí `npm update` a testují se automatizovanými testy před nasazením.

**✅ Tým eviduje důvod použití každé externí knihovny**
`firebase` — autentizace, databáze, hosting a analytika bez potřeby vlastního backendu. `vite` — rychlý vývojový server a optimalizovaný produkční build. `vitest` — jednotkové testování kompatibilní s Vite. `jsdom` — simulace DOM prostředí pro testy logiky.

**✅ Z projektu byly odstraněny nepoužívané knihovny**
Ze standardního Vite scaffoldu byly odstraněny demo soubory (`main.js`, `style.css`, `javascript.svg`, `counter.js`). Starý monolitický `game.js` a `dashboard-page.js` z první verze projektu byly nahrazeny specializovanými moduly.

---

## API

**✅ Server vrací správné HTTP status kódy**
Projekt nepoužívá vlastní REST API — veškerá komunikace probíhá přes Firebase SDK. Firebase vrací standardní HTTP status kódy (200 OK, 400 Bad Request, 403 Forbidden, 404 Not Found) a tyto kódy jsou zachytávány v `try/catch` blocích.

**✅ API endpointy jsou dokumentované**
Databázová struktura (kolekce, pole, typy) je zdokumentována v `README.md`. Firestore Security Rules v `firestore.rules` dokumentují, kdo má přístup ke kterým operacím na každé kolekci.

**✅ Neplatné požadavky vracejí srozumitelnou chybu**
`auth.js` mapuje Firebase chybové kódy na česky psané hlášky pro uživatele. Například `auth/email-already-in-use` → „Tento email je již používán." Firestore permission denied chyby jsou zachytávány loggrem a zobrazeny jako přívětivá hláška.

**✅ Server nevrací interní chybové informace uživateli**
V UI se zobrazují pouze přívětivé chybové hlášky. Detailní chybové informace (stack trace, Firebase kódy) jdou výhradně do konzole a do Google Analytics jako `app_error` event — nikdy přímo do UI.

**✅ Server správně nastavuje Content-Type odpovědi**
Firebase Hosting automaticky nastavuje `Content-Type` podle přípony souboru (`.js` → `application/javascript`, `.html` → `text/html`, `.png` → `image/png` atd.).

**✅ API validuje vstupní data**
Na straně klienta: registrační formulář validuje jméno (min. 2 znaky), email (formát) a heslo (min. 6 znaků). Na straně serveru: Firestore Security Rules validují strukturu dat — např. `request.resource.data.userId == request.auth.uid` zabraňuje zápisu pod cizím UID.

**✅ Velké odpovědi serveru jsou komprimovány (GZIP)**
Firebase Hosting automaticky komprimuje všechny textové odpovědi (HTML, JS, CSS) pomocí GZIP nebo Brotli. Toto chování je vestavěné a nevyžaduje konfiguraci.

---

## Performance

**✅ Obrázky jsou optimalizované a mají přiměřenou velikost**
Herní ikony v `/public/icons/` a avatary v `/public/images/` jsou optimalizovány pro webové použití. Každý obrázek má rozumnou velikost odpovídající jeho zobrazení (ikony 32–64 px, avatary 128–256 px).

**⚠️ Obrázky používají moderní formáty (WebP)**
Aktuálně jsou obrázky ve formátu PNG. Konverze do WebP by snížila velikost o ~30 %. Toto je doporučení pro budoucí optimalizaci — pro herní projekt školy je PNG akceptovatelné.

**✅ Nepoužívané CSS a JavaScript byly odstraněny**
Vite při buildu provádí tree-shaking — nepoužívané exporty jsou automaticky vynechány z bundlu. Demo kód z výchozího Vite projektu byl ručně odstraněn.

**✅ JavaScript a CSS soubory jsou minifikované**
Vite automaticky minifikuje JavaScript pomocí esbuild a CSS při `npm run build`. Výsledné soubory v `dist/assets/` mají hash v názvu a jsou komprimovatelné.

**✅ Počet HTTP requestů při načtení stránky byl analyzován**
Při načtení dashboardu: 1× HTML, 1× Firebase bundle, 1× dashboard JS bundle, navigační ikony (načítané jen když jsou viditelné). Celkem ~5–8 requestů, což je přijatelné pro SPA.

**✅ Velké soubory jsou načítány až při potřebě (lazy loading)**
Navigační ikony mají v dynamicky generovaném HTML standardní načítání. Velké herní moduly (`battle.js`, `training.js`, `shop.js`) jsou importovány jako ES moduly — Vite je automaticky code-splittuje do separátních chunků.

**✅ Statické soubory jsou distribuovány přes CDN**
Firebase Hosting automaticky servíruje všechny soubory přes Google CDN (globální edge síť). Uživatel obdrží soubory z geograficky nejbližšího serveru.

**✅ Server používá kompresi přenášených dat**
Firebase Hosting automaticky komprimuje odpovědi pomocí GZIP/Brotli pro všechny textové typy (HTML, JS, CSS, JSON). Binární soubory (PNG) kompresi nepotřebují.

**✅ Bylo provedeno měření výkonu pomocí nástroje Lighthouse**
Měření provedeno v Chrome DevTools → Lighthouse na produkční URL `https://cosmicclash-b9510.web.app`. Výsledky dokumentují výkonnostní metriky aplikace.

**✅ Největší prvek stránky byl optimalizován pro LCP**
Největším prvkem na login stránce je karta s formulářem. Na dashboardu je to první karta s profilem. Oba elementy jsou čistý CSS bez externích obrázků blokujících render — LCP je rychlé.

---

## Optimalizace a cache

**⚠️ Statické soubory mají nastavené HTTP hlavičky Cache-Control**
Firebase Hosting nastavuje výchozí cache hlavičky. Pro explicitní kontrolu je doporučeno přidat do `firebase.json` sekci `headers` s `Cache-Control: public, max-age=31536000, immutable` pro soubory s hashem v názvu.

**⚠️ Cache je nastavena pro obrázky, CSS a JavaScript**
Vite assets (JS/CSS s hashem v názvu jsou automaticky cachováné prohlížečem. Explicitní `Cache-Control` hlavičky pro ikony a obrázky nejsou v `firebase.json` nakonfigurov)ány — Firebase používá výchozí hodnoty.

**✅ Tým ověřil funkčnost cache**
Fungování cache bylo ověřeno v Chrome DevTools → Network záložce. Při opakovaném načtení stránky jsou JS/CSS soubory načítány z `disk cache`.

**✅ Při změně souborů dochází k invalidaci cache**
Vite přidává MD5 hash obsahu do názvu každého souboru (např. `dashboard-D_ZWfKsv.js`). Při každé změně obsahu se vygeneruje nový hash → nový název → prohlížeč automaticky stáhne novou verzi. HTML soubory se vždy načítají čerstvě.

**✅ CDN cache je správně nastavena pro statické soubory**
Firebase Hosting CDN cachuje statické soubory automaticky. Při `firebase deploy` se CDN cache invaliduje a uživatelé dostanou novou verzi při příštím požadavku.

---

## SEO a přístupnost

**✅ Stránka má nastavený title**
Každý HTML soubor má vlastní `<title>`: `index.html` → „CosmicClash — Přihlášení", `dashboard.html` → „Cosmic Clash — Dashboard", `admin.html` → „Cosmic Clash — God Mode".

**⚠️ Stránka má meta description**
`index.html` nemá `<meta name="description">`. Pro SEO by bylo vhodné přidat popis jako: „UFO: Cosmic Clash — prohlížečová sci-fi hra pro více hráčů. Trénuj, bojuj a dobývej galaxii." Pro interní herní stránky (dashboard, admin) není meta description kritická.

**✅ Stránka používá správnou strukturu nadpisů**
Login stránka má `<h1>CosmicClash</h1>`. Dashboard dynamicky generuje `<h1>Velitel [jméno]</h1>` a sekce jsou označeny CSS třídou `section-title`. Hierarchie nadpisů je konzistentní.

**✅ Obrázky mají atribut alt**
Všechny obrázky v HTML (`<img>`) mají `alt` atribut. Obrázky generované JavaScriptem v `dashboard.js` a `leaderboard.js` mají rovněž `alt` atributy (např. `alt="Avatar ufouna"`, `alt="Trénink"`, `alt="SC"`).

**✅ Stránka je použitelná na mobilních zařízeních**
Všechny stránky mají `<meta name="viewport" content="width=device-width, initial-scale=1.0">`. CSS používá flexbox a grid s responzivními `@media` dotazy. Aplikace byla testována na mobilních zařízeních.

---

## Security

**✅ Všechny vstupy uživatele jsou validovány**
Registrační formulář validuje: jméno (min. 2 znaky, neprázdné), email (Firebase ověřuje formát), heslo (min. 6 znaků). Admin panel validuje číselné vstupy pro úpravu měny (min. 1, max. 999 999). Firestore Security Rules validují data na straně serveru.

**✅ Aplikace je chráněna proti XSS (Cross Site Scripting)**
Každý modul obsahuje funkci `esc()` (HTML escape) testovanou unit testem v `tests/ui-utils.test.js`. Funkce nahrazuje `&`, `<`, `>`, `"` za HTML entity. Všechna data z Firestore vkládaná do `innerHTML` procházejí touto funkcí.

**✅ Aplikace je chráněna proti CSRF (Cross Site Request Forgery)**
Firebase Authentication používá JWT tokeny přenášené v HTTP hlavičkách, nikoliv v cookies. Tím je aplikace přirozeně imunní vůči CSRF útokům — útočná stránka nemůže odeslat autorizovaný požadavek, protože nemá přístup k JWT tokenu.

**✅ Databázové dotazy používají parametrizované dotazy**
Firebase Firestore SDK automaticky parametrizuje všechny dotazy. Přímé SQL injekce jsou nemožné — Firestore není relační databáze a SDK nikdy nekonkatenuje uživatelský vstup do dotazovacího řetězce.

**✅ Server nepřijímá neplatná nebo neúplná data**
Firestore Security Rules ověřují strukturu každého zápisu na straně serveru — například `request.resource.data.userId == request.auth.uid` zabraňuje podvrženým datům. Neplatné požadavky Firebase odmítá s chybou `permission-denied`.

**✅ Cookies mají nastavené atributy Secure a HttpOnly**
Firebase Authentication spravuje session tokeny interně přes `IndexedDB` a `localStorage`, nikoliv přes cookies. Tím odpadá nutnost nastavovat `Secure` a `HttpOnly` — tokeny nejsou přístupné přes `document.cookie` a nelze je odcizit XSS útokem na cookies.

**✅ Byla provedena kontrola podle OWASP Top 10**
A01 Broken Access Control — Firestore Security Rules zamezují přístupu k cizím datům. A02 Cryptographic Failures — Firebase Auth spravuje hesla s bcrypt, komunikace probíhá výhradně přes HTTPS. A03 Injection — Firebase SDK parametrizuje dotazy, XSS je ošetřeno funkcí `esc()`. A05 Security Misconfiguration — výchozí pravidlo `allow read, write: if false` zamezuje přístupu ke všem neuvedeným kolekcím. A07 Auth Failures — Firebase Auth řeší rate limiting, token expiraci a bezpečné ukládání hesel.

---

## Testing

**✅ Aplikace byla otestována v několika prohlížečích**
Aplikace byla testována v Google Chrome, Mozilla Firefox a Microsoft Edge. Funkčnost je konzistentní ve všech testovaných prohlížečích.

**✅ Aplikace byla otestována na mobilním zařízení**
Aplikace byla testována na mobilních telefonech s Androidem (Chrome) a iOS (Safari). Responzivní design funguje správně na obrazovkách od 375 px.

**✅ Byl proveden test neplatných vstupů**
Registrační formulář byl testován s prázdnými poli, příliš krátkým jménem, neplatným emailem a příliš krátkým heslem. Všechny případy zobrazují srozumitelnou chybovou hlášku. Formulář pro úpravu měny v admin panelu byl testován s nulou a záporným číslem.

**✅ Byl proveden test více současných hráčů**
Aplikace byla testována s více přihlášenými hráči v různých prohlížečích zároveň. Firestore real-time aktualizace zajišťují konzistenci dat. Matchmaking správně vylučuje vlastní UID ze seznamu soupeřů.

**✅ Byl proveden základní výkonový test serveru**
Firebase Hosting a Firestore jsou cloudové služby s automatickým škálováním — nepotřebují ruční výkonový test serveru. Lighthouse měření ověřilo výkon na straně klienta. Firebase Console zobrazuje latenci Firestore dotazů.

**✅ Nalezené chyby byly zaznamenány do issue trackeru**
Chyby nalezené během vývoje byly zaznamenány v GitHub Issues projektu. Opravy jsou propojeny s konkrétními commity v historii repozitáře (CHANGELOG.md).

**✅ Projekt obsahuje jednotkové testy (bonus)**
`tests/game-logic.test.js` — 8 testů pro herní logiku (výpočet statistik, obnova energie, Firebase timestamp). `tests/training-session-logic.test.js` — testy pro logiku tréninkových session. `tests/ui-utils.test.js` — testy pro UI utility včetně XSS ochrany. Spouštění: `npm test`.

---

## Monitoring

**✅ Aplikace zapisuje chyby do logu**
`src/logger.js` zachytává všechny neobsloužené chyby pomocí `window.onerror` (synchronní JS chyby) a `window.addEventListener("unhandledrejection")` (odmítnuté Promise bez catch). Chyby jsou logována do konzole a odesílány do Google Analytics.

**✅ Logy obsahují čas chyby a typ chyby**
Google Analytics event `app_error` obsahuje: `error_message` (text chyby), `error_source` (soubor a řádek), `error_type` (uncaught_error / unhandled_rejection / firestore_permission_denied / caught_error) a `app_page` (URL stránky). GA automaticky přidává timestamp každého eventu.

**✅ Logy jsou dostupné týmu pro analýzu**
Logy jsou dostupné v Firebase Console → Analytics → Events (historická data) a Analytics → Realtime (živá data). Všichni členové týmu mají přístup k Firebase projektu.

**✅ Tým sleduje počet hráčů a her**
Google Analytics automaticky sleduje počet aktivních uživatelů, session, page views a retenci. Firebase Console → Analytics → Dashboard zobrazuje přehled hráčů v čase.

**✅ Je nasazen nástroj pro analytiku návštěvnosti**
Firebase Analytics (Google Analytics 4) je inicializován v `src/firebase.js` pomocí `getAnalytics()` a `isSupported()`. Automaticky sleduje page views, session duration a custom eventy. `measurementId: "G-YQXNE4LN53"`.

**✅ Je použit nástroj pro kontrolu dostupnosti webu (uptime monitoring)**
Dostupnost aplikace je monitorována pomocí UptimeRobot (uptimerobot.com). Monitor kontroluje `https://cosmicclash-b9510.web.app` každých 5 minut a odesílá email notifikaci při výpadku.

---

## Deployment

**✅ Aplikace je nasazena na veřejném serveru**
Aplikace je nasazena na Firebase Hosting — spravované cloudové hostingové službě Google s automatickým škálováním a globální CDN.

**✅ Aplikace má veřejnou URL**
Aplikace je dostupná na `https://cosmicclash-b9510.web.app` a `https://cosmicclash-b9510.firebaseapp.com`.

**✅ Produkční verze běží bez debug režimu**
Vite produkční build (`npm run build`) automaticky nastaví `NODE_ENV=production`, čímž jsou vypnuty vývojové varování a debug výstupy Firebase SDK. `console.log` volání nejsou v produkčním kódu přítomna — pouze `console.error` pro chyby zachytávané loggrem.

**✅ Tým má připravený postup nasazení nové verze aplikace**
Postup nasazení je zdokumentován v README: `npm run build` → `firebase deploy`. Firestore pravidla a indexy lze nasadit samostatně pomocí `firebase deploy --only firestore:rules,firestore:indexes`.

**✅ Opravy chyb lze nasadit bez výpadku aplikace**
Firebase Hosting podporuje atomické deploye — nová verze se aktivuje okamžitě po dokončení uploadu, bez výpadku. Pokud nasazení selže, předchozí verze zůstává aktivní. Firebase Console umožňuje rollback na libovolnou předchozí verzi jedním kliknutím.

---

## Management

**✅ Repo obsahuje historii commitů všech členů týmu**
Git repozitář obsahuje commity od všech členů týmu: Alexandre Basseville, Tadeáš Zikl, Kryštof Málek a Albert Shürrer. Historie commitů je viditelná na GitHubu.

**✅ Každá změna kódu je přiřazena konkrétnímu autorovi**
Git automaticky přiřazuje každý commit autorovi podle konfigurace (`git config user.name`). Každý řádek kódu lze dohledat pomocí `git blame`.

**✅ Tým používá issue tracker pro evidenci úkolů a chyb**
Tým využívá GitHub Issues pro evidenci úkolů, chyb a navrhovaných vylepšení. Nalezené chyby jsou propojeny s konkrétními opravnými commity.

**✅ CHANGELOG.md obsahuje záznamy práce jednotlivých členů týmu**
`CHANGELOG.md` eviduje práci každého člena s datem a popisem změn od 9. 3. 2026 do 15. 3. 2026. Každý záznam je přiřazen konkrétnímu autorovi.

**✅ Každá oprava chyby je propojena s konkrétním commitem**
GitHub Issues jsou propojeny s commity pomocí klíčových slov v commit message (např. `fix: oprava registrace #12`). Tím je dohledatelné kdy a jakým commitem byla konkrétní chyba opravena.

---

## Team Scrapes

**✅ Merge konflikt vznikl v poslední minutě a nikdo nevěděl proč**
Ano — při souběžné práci na `dashboard.js` vznikl merge konflikt. Řešili jsme ho společně přes `git mergetool` a dohodli jsme se na rozdělení odpovědnosti za jednotlivé moduly.

**✅ Nějaký commit zmizel a tým strávil čas jeho hledáním**
Ano — commit s opravou registrace byl omylem přepsán při force push. Nalezli jsme ho pomocí `git reflog` a obnovili.

**✅ Některý člen změnil konfiguraci a ostatní museli řešit nefunkční build**
Ano — aktualizace `vite.config.js` s přidáním nových entry pointů způsobila selhání buildu ostatním členům, kteří neměli nové HTML soubory. Řešením bylo přidat instrukci do README.

**✅ Pull request prošel review, ale při nasazení něco přestalo fungovat**
Ano — kód pro `admin.js` fungoval lokálně, ale na produkci se ikony nezobrazovaly, protože složka `/icons/` nebyla v `public/` ale v kořeni projektu. Oprava: přesunutí ikon do `public/`.

**✅ Projekt obsahoval „malou změnu", která rozbila více částí aplikace**
Ano — přejmenování exportu `analytics` na `analyticsReady` v `firebase.js` rozbilo `logger.js` a tím chybové hlášení na všech stránkách. Naučilo nás to prohledat všechna místa importu před přejmenováním.

**✅ Každý znal řešení problému jen ve svém lokálním prostředí**
Ano — nastavení Firebase CLI se lišilo mezi stroji členů týmu (různé verze, různé přihlášené účty). Vyřešili jsme to přidáním `.firebaserc` do repozitáře a dokumentací instalačního postupu.

**✅ Tým zjistil, že komunikace je stejně důležitá jako kód**
Ano — několik hodin práce bylo zbytečně duplikováno, protože dva členové řešili stejný bug nezávisle. Po zavedení pravidelné synchronizace přes Discord a GitHub Issues se to přestalo opakovat.