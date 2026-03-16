/**
 * UFO: Cosmic Clash — Globální zachytávač chyb a logger
 * Autor: Alexandre Basseville
 *
 * Tento modul musí být importován jako PRVNÍ na každé stránce aplikace
 * (tj. na začátku auth.js, dashboard.js, admin.js...), aby zachytil
 * chyby ještě před spuštěním ostatního kódu.
 *
 * Co dělá:
 *  1. Zachytí všechny neobsloužené JS chyby (window.onerror)
 *  2. Zachytí odmítnuté Promise bez catch (unhandledrejection)
 *  3. Odešle každou chybu jako custom event `app_error` do Google Analytics
 *  4. Vždy zaloguje do konzole (i v produkci — viditelné v DevTools)
 *
 * Formát GA eventu `app_error`:
 *  - error_message  : text chyby (max 100 znaků — limit GA parametrů)
 *  - error_source   : soubor a řádek kde chyba nastala
 *  - error_type     : "uncaught_error" nebo "unhandled_rejection"
 *  - app_page       : pathname aktuální stránky (např. "/dashboard.html")
 */

import { analytics } from "./firebase.js";
import { logEvent } from "firebase/analytics";

// ─────────────────────────────────────────────
//  HELPER: odeslání do GA
// ─────────────────────────────────────────────

/**
 * Odešle chybový event do Google Analytics.
 * Pokud Analytics nejsou dostupné (AdBlock, Safari ITP),
 * funkce tiše skončí bez vyhození další chyby.
 *
 * @param {string} type    - "uncaught_error" | "unhandled_rejection"
 * @param {string} message - Text chybové zprávy
 * @param {string} source  - Zdroj chyby (soubor:řádek nebo "promise")
 */
function sendErrorToAnalytics(type, message, source) {
  // Analytics se inicializují asynchronně — mohou být null krátce po startu
  if (!analytics) return;

  try {
    logEvent(analytics, "app_error", {
      // GA omezuje délku parametrů na 100 znaků
      error_message: String(message).slice(0, 100),
      error_source:  String(source).slice(0, 100),
      error_type:    type,
      app_page:      window.location.pathname,
    });
  } catch {
    // logEvent nesmí způsobit další chybu — tiše ignorujeme
  }
}

// ─────────────────────────────────────────────
//  1. Zachycení synchronních JS chyb
// ─────────────────────────────────────────────

/**
 * window.onerror zachytí:
 *  - Chyby v top-level kódu
 *  - Chyby v event handlerech
 *  - Syntaktické chyby za běhu
 *
 * Parametry jsou předávány prohlížečem automaticky.
 * Vrácení `false` = chyba se i nadále zobrazí v konzoli.
 */
window.onerror = function (message, source, lineno, colno, error) {
  const sourceLabel = source
    ? `${source.split("/").pop()}:${lineno}:${colno}`
    : "unknown";

  const errorMessage = error?.message ?? String(message);

  console.error(
    `[CosmicClash] Neobsloužená chyba @ ${sourceLabel}:`,
    error ?? message
  );

  sendErrorToAnalytics("uncaught_error", errorMessage, sourceLabel);

  // false = chyba se zobrazí i standardně v konzoli
  return false;
};

// ─────────────────────────────────────────────
//  2. Zachycení odmítnutých Promise
// ─────────────────────────────────────────────

/**
 * unhandledrejection zachytí Promise.reject() nebo async funkce
 * které vyhodí výjimku bez `.catch()` bloku.
 *
 * Typické příklady:
 *  - Zapomenutý `try/catch` kolem `await updateDoc(...)`
 *  - Firestore Permission Denied bez ošetření
 *  - Network timeout
 */
window.addEventListener("unhandledrejection", (event) => {
  const reason  = event.reason;
  const message = reason instanceof Error
    ? reason.message
    : String(reason ?? "Unknown rejection");

  // Firestore "permission-denied" logujeme zvlášť pro snazší filtrování v GA
  const errorType = message.includes("permission-denied") || message.includes("Missing or insufficient permissions")
    ? "firestore_permission_denied"
    : "unhandled_rejection";

  console.error("[CosmicClash] Neobsloužená Promise rejection:", reason);

  sendErrorToAnalytics(errorType, message, "promise");
});

// ─────────────────────────────────────────────
//  3. Volitelný manuální logger pro zachycené chyby
// ─────────────────────────────────────────────

/**
 * Použij `logError()` v catch blocích kde nechceš chybu zobrazit
 * uživateli, ale přesto ji chceš sledovat v Analytics.
 *
 * Příklad:
 *   try {
 *     await startTrainingSession(uid, type);
 *   } catch (err) {
 *     logError(err, "training_start");
 *     showToast(err.message, "error");
 *   }
 *
 * @param {Error|string} error   - Zachycená chyba
 * @param {string}       context - Kontext kde chyba nastala (pro filtrování v GA)
 */
export function logError(error, context = "manual") {
  const message = error instanceof Error ? error.message : String(error);
  const source  = `context:${context}`;

  console.error(`[CosmicClash/${context}]`, error);
  sendErrorToAnalytics("caught_error", message, source);
}