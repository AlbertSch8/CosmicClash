## Bezpečnostní kontrola sOWASP Top 10

Projekt byl navržen a kontrolován s ohledem na aktuální žebříček největších bezpečnostních hrozeb OWASP Top 10. Architektura využívá Backend-as-a-Service (Google Firebase), čímž je velká část infrastrukturní bezpečnosti delegována. Na straně aplikace jsou implementována následující opatření:

**A01: Broken Access Control (Chybná kontrola přístupu)**
* **Řešení:** Využíváme striktní `firestore.rules`. Zápis a čtení do kolekcí jako `users`, `aliens` nebo `inventory` je podmíněn shodou UID uživatele s ID dokumentu (`request.auth.uid == userId`). Pro privilegované operace (úprava předmětů v obchodě) je implementována role-based kontrola pomocí funkce `isAdmin()`. Zbytek databáze je defaultně uzamčen (`allow read, write: if false;`).

**A02: Cryptographic Failures (Kryptografická selhání)**
* **Řešení:** Komunikace s Firebase probíhá výhradně přes šifrované WSS/HTTPS protokoly. Správa hesel je plně v režii Firebase Authentication (využívá silný hashovací algoritmus scrypt). Aplikace v LocalStorage neukládá žádné citlivé údaje v prostém textu.

**A03: Injection (Injekce / XSS)**
* **Řešení:** Přímé dotazy do databáze jsou zpracovávány přes Firestore SDK, což eliminuje NoSQL injekce. Ochrana proti XSS (Cross-Site Scripting) na frontendu je zajištěna utilitou `esc(str)`, která před renderováním do HTML převádí nebezpečné znaky (`<`, `>`, `&`) na entity.

**A04: Insecure Design (Nezabezpečený návrh)**
* **Řešení:** Datový model striktně odděluje data, která může měnit hráč (např. spuštění tréninku v `trainingSessions`), od statických dat řízených administrátorem (katalog `items`). 

**A05: Security Misconfiguration (Chybná konfigurace bezpečnosti)**
* **Řešení:** Konfigurační klíče Firebase na frontendu jsou veřejné z podstaty BaaS architektury, ale bezpečnost je garantována na straně serveru přes Security Rules. Produkční build (Vite) odstraňuje zbytečné vývojářské logy.

**A06: Vulnerable and Outdated Components (Zranitelné a zastaralé komponenty)**
* **Řešení:** Aplikace je spravována přes NPM s využitím moderního bundleru Vite. Pomocí příkazu `npm audit` jsou pravidelně kontrolovány zranitelnosti závislostí v souboru `package.json`.

**A07: Identification and Authentication Failures (Selhání identifikace a autentizace)**
* **Řešení:** Autentizace je řešena robustní knihovnou `firebase/auth`. Tento systém chrání aplikaci proti útokům hrubou silou (Rate Limiting) a zajišťuje bezpečné generování a obnovu relačních (session) tokenů.

**A08: Software and Data Integrity Failures (Selhání integrity softwaru a dat)**
* **Řešení:** Kód neimportuje žádné externí skripty z neověřených CDN. Všechny balíčky jsou uzamčeny v `package-lock.json`, což garantuje integritu buildu a ochranu před podvrženým kódem.

**A09: Security Logging and Monitoring Failures (Selhání logování a monitorování)**
* **Řešení:** Aplikace obsahuje dedikovaný modul `logger.js`. Ten přes `window.onerror` a `unhandledrejection` zachytává pády a bezpečnostní incidenty (specificky zachytává chybu `firestore_permission_denied`) a loguje je do Firebase Analytics pro následnou analýzu.

**A10: Server-Side Request Forgery - SSRF (Podvržení požadavku na straně serveru)**
* **Řešení:** Vzhledem k plně bezserverové (serverless) architektuře na frontendu bez aktivního stahování obsahu z externích URL uživatelem, je tato zranitelnost mimo rozsah (Out of Scope).