/**
 * UFO: Cosmic Clash — Sdílené UI utility (Finální polish)
 * Autor: Alexandre Basseville
 *
 * Centrální modul pro:
 *  1. Blokování tlačítek během asynchronních operací (withButtonLock)
 *  2. Toast notifikace (showToast) — success / error / info
 *  3. Přívětivé chybové hlášky (showInlineError, showInlinePending)
 *  4. HTML-escape pro bezpečné vkládání dat z DB (esc)
 *  5. Loading state helper (setLoadingState)
 *
 * Importuj pouze to, co potřebuješ:
 *   import { withButtonLock, showToast, esc } from "./ui-utils.js";
 */

// ─────────────────────────────────────────────
//  BUTTON LOCK — ochrana před dvojím klikem
// ─────────────────────────────────────────────

/**
 * Obalí asynchronní operaci tak, aby tlačítko bylo po dobu jejího
 * trvání zablokované a zobrazovalo loading text.
 *
 * Použití:
 *   btn.addEventListener("click", () =>
 *     withButtonLock(btn, "Zpracovávám…", async () => {
 *       await nějak();
 *     })
 *   );
 *
 * Po dokončení (úspěch i chyba) se tlačítko automaticky odblokuje
 * a obnoví původní text.
 *
 * @param {HTMLButtonElement} btn         – cílové tlačítko
 * @param {string}            loadingText – text zobrazený během operace
 * @param {Function}          fn          – async funkce k provedení
 * @returns {Promise<any>}                – výsledek fn()
 */
export async function withButtonLock(btn, loadingText, fn) {
  if (!btn || btn.disabled) return; // Zabrání dvojímu spuštění

  const origText     = btn.innerHTML;
  const origDisabled = btn.disabled;

  btn.disabled = true;
  btn.innerHTML = `<span class="btn-spinner"></span>${loadingText}`;

  try {
    return await fn();
  } finally {
    // Vždy obnovíme tlačítko — i při chybě
    btn.disabled = origDisabled;
    btn.innerHTML = origText;
  }
}

/**
 * Zablokuje více tlačítek najednou (např. celá sekce akcí).
 * Vrací funkci pro odblokování.
 *
 * @param  {...HTMLButtonElement} btns
 * @returns {Function} unlock — zavolej po dokončení operace
 */
export function lockButtons(...btns) {
  const valid = btns.filter(Boolean);
  valid.forEach((b) => (b.disabled = true));
  return () => valid.forEach((b) => (b.disabled = false));
}

// ─────────────────────────────────────────────
//  TOAST NOTIFIKACE
// ─────────────────────────────────────────────

/**
 * Zobrazí dočasný toast v dolní části obrazovky.
 *
 * @param {string}                    msg      – text zprávy
 * @param {"success"|"error"|"info"}  type     – typ (ovlivní barvu)
 * @param {number}                    duration – ms než zmizí (výchozí 3500)
 */
export function showToast(msg, type = "info", duration = 3500) {
  const old = document.getElementById("cc-toast");
  if (old) old.remove();

  const colors = {
    success: { border: "rgba(0,229,160,.45)",   bg: "rgba(0,229,160,.08)",   text: "#6ee7b7" },
    error:   { border: "rgba(255,59,110,.45)",  bg: "rgba(255,59,110,.08)",  text: "#fca5a5" },
    info:    { border: "rgba(123,47,255,.45)",  bg: "rgba(15,8,30,.97)",     text: "#e8d5ff" },
  };
  const c = colors[type] ?? colors.info;

  const icons = { success: "✅", error: "❌", info: "ℹ️" };

  const el = document.createElement("div");
  el.id = "cc-toast";
  el.setAttribute("role", "alert");
  el.setAttribute("aria-live", "polite");
  el.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: ${c.bg}; border: 1px solid ${c.border};
    border-radius: 12px; padding: 12px 22px; color: ${c.text};
    font-size: 13px; z-index: 9999;
    box-shadow: 0 4px 24px rgba(0,0,0,.4);
    max-width: min(340px, calc(100vw - 32px));
    text-align: center; line-height: 1.5;
    animation: cc-toast-in .25s ease both;
  `;
  el.textContent = `${icons[type] ?? ""} ${msg}`.trim();
  document.body.appendChild(el);

  // Přidáme keyframe pokud ještě neexistuje
  if (!document.getElementById("cc-toast-style")) {
    const style = document.createElement("style");
    style.id = "cc-toast-style";
    style.textContent = `
      @keyframes cc-toast-in {
        from { opacity: 0; transform: translateX(-50%) translateY(12px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      .btn-spinner {
        display: inline-block; width: 12px; height: 12px;
        border: 2px solid rgba(255,255,255,.3); border-top-color: white;
        border-radius: 50%; animation: spin .6s linear infinite;
        vertical-align: middle; margin-right: 8px;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
  }

  setTimeout(() => el.remove(), duration);
}

// ─────────────────────────────────────────────
//  INLINE CHYBOVÉ A STATUS ZPRÁVY
// ─────────────────────────────────────────────

/**
 * Zobrazí inline chybovou zprávu do existujícího DOM elementu.
 * Pokud element neexistuje, zobrazí toast jako fallback.
 *
 * @param {string} elementId – ID elementu pro zprávu
 * @param {string} msg       – text chyby
 */
export function showInlineError(elementId, msg) {
  const el = document.getElementById(elementId);
  if (!el) { showToast(msg, "error"); return; }
  el.textContent = msg;
  el.style.color = "#fca5a5";
  el.style.display = "block";
}

/**
 * Zobrazí inline pending/loading zprávu.
 *
 * @param {string} elementId
 * @param {string} msg
 */
export function showInlinePending(elementId, msg) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = msg;
  el.style.color = "#a5f3fc";
  el.style.display = "block";
}

/**
 * Vyčistí inline status element.
 * @param {string} elementId
 */
export function clearInlineStatus(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = "";
  el.style.display = "none";
}

// ─────────────────────────────────────────────
//  LOADING STATE
// ─────────────────────────────────────────────

/**
 * Přepne element do loading stavu nebo zpět.
 * Vhodné pro celé sekce / karty.
 *
 * @param {HTMLElement} el
 * @param {boolean}     loading
 * @param {string}      loadingText
 */
export function setLoadingState(el, loading, loadingText = "Načítám…") {
  if (!el) return;
  if (loading) {
    el.dataset.origContent = el.innerHTML;
    el.innerHTML = `
      <div style="text-align:center;padding:32px 16px;">
        <div class="spinner" style="margin:0 auto 12px;"></div>
        <p style="color:var(--glow);font-size:12px;letter-spacing:.15em;
                  text-transform:uppercase;font-family:'Orbitron',sans-serif;">
          ${esc(loadingText)}
        </p>
      </div>
    `;
  } else if (el.dataset.origContent) {
    el.innerHTML = el.dataset.origContent;
    delete el.dataset.origContent;
  }
}

// ─────────────────────────────────────────────
//  HTML ESCAPE
// ─────────────────────────────────────────────

/**
 * Escapuje HTML speciální znaky.
 * Vždy použij při vkládání dat z Firestore do innerHTML.
 *
 * @param {any} str
 * @returns {string}
 */
export function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
