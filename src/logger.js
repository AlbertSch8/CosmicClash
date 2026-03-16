/**
 * UFO: Cosmic Clash — Globální zachytávač chyb a logger
 * Autor: Alexandre Basseville
 *
 * OPRAVA: analytics je null při synchronním importu (isSupported je async).
 * Řešení: sendErrorToAnalytics čeká na analyticsReady Promise před odesláním.
 */

import { analyticsReady } from "./firebase.js";
import { logEvent } from "firebase/analytics";

// ─────────────────────────────────────────────
//  HELPER: odeslání do GA
// ─────────────────────────────────────────────

/**
 * Počká na inicializaci Analytics, pak odešle event.
 * analyticsReady je Promise<Analytics|null> z firebase.js.
 */
async function sendErrorToAnalytics(type, message, source) {
  try {
    const analytics = await analyticsReady;
    if (!analytics) return; // AdBlock nebo nepodporovaný prohlížeč

    logEvent(analytics, "app_error", {
      error_message: String(message).slice(0, 100),
      error_source:  String(source).slice(0, 100),
      error_type:    type,
      app_page:      window.location.pathname,
    });
  } catch {
    // logEvent nesmí způsobit další chybu
  }
}

// ─────────────────────────────────────────────
//  1. Synchronní JS chyby
// ─────────────────────────────────────────────

window.onerror = function (message, source, lineno, colno, error) {
  const sourceLabel = source
    ? `${source.split("/").pop()}:${lineno}:${colno}`
    : "unknown";

  const errorMessage = error?.message ?? String(message);

  console.error(`[CosmicClash] Neobsloužená chyba @ ${sourceLabel}:`, error ?? message);
  sendErrorToAnalytics("uncaught_error", errorMessage, sourceLabel);

  return false;
};

// ─────────────────────────────────────────────
//  2. Odmítnuté Promise
// ─────────────────────────────────────────────

window.addEventListener("unhandledrejection", (event) => {
  const reason  = event.reason;
  const message = reason instanceof Error
    ? reason.message
    : String(reason ?? "Unknown rejection");

  const errorType =
    message.includes("permission-denied") ||
    message.includes("Missing or insufficient permissions")
      ? "firestore_permission_denied"
      : "unhandled_rejection";

  console.error("[CosmicClash] Neobsloužená Promise rejection:", reason);
  sendErrorToAnalytics(errorType, message, "promise");
});

// ─────────────────────────────────────────────
//  3. Manuální logger
// ─────────────────────────────────────────────

/**
 * Použij v catch blocích pro sledování zachycených chyb v Analytics.
 *
 * @param {Error|string} error
 * @param {string}       context
 */
export function logError(error, context = "manual") {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[CosmicClash/${context}]`, error);
  sendErrorToAnalytics("caught_error", message, `context:${context}`);
}