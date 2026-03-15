/**
 * UFO: Cosmic Clash — Autentizace a registrace (Krok 1, oprava)
 * Autor: Alexandre Basseville
 *
 * Klíčové opravy oproti původní verzi:
 *  1. onAuthStateChanged přesměrovává POUZE při přihlášení (login),
 *     NE během registrace — přesměrování po registraci řídí handleRegister()
 *     až po úspěšném zápisu obou dokumentů do Firestore.
 *  2. handleRegister() zapisuje dokumenty sekvenčně s await a teprve potom
 *     přesměruje — žádná race condition.
 *  3. Zápis do kolekce `users` (veřejný profil) + `aliens` (herní data)
 *     jsou oddělené operace, obě obalené v try/catch.
 *  4. Při selhání zápisu do DB se uživatel nikam nepřesměruje a dostane
 *     srozumitelnou chybovou hlášku.
 */

import { auth, db } from "./firebase.js";
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
} from "firebase/auth";
import { doc, setDoc, Timestamp } from "firebase/firestore";

// ─────────────────────────────────────────────
//  CHYBOVÉ HLÁŠKY
// ─────────────────────────────────────────────

const ERROR_MESSAGES = {
    "auth/user-not-found":        "Účet s tímto emailem neexistuje.",
    "auth/wrong-password":        "Nesprávné heslo.",
    "auth/invalid-email":         "Neplatný formát emailu.",
    "auth/email-already-in-use":  "Tento email je již používán.",
    "auth/weak-password":         "Heslo musí mít alespoň 6 znaků.",
    "auth/too-many-requests":     "Příliš mnoho pokusů. Zkus to za chvíli.",
    "auth/invalid-credential":    "Nesprávný email nebo heslo.",
};

function friendlyError(code) {
    return ERROR_MESSAGES[code] || "Nastala neznámá chyba. Zkus to znovu.";
}

// ─────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────

function clearStatuses() {
    ["login-status", "register-status"].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.className = "status";
        el.innerHTML = "";
    });
}

function showStatus(id, type, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = "status " + type;
    el.innerHTML = msg;
}

function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
        btn.dataset.orig = btn.textContent;
        btn.innerHTML = '<span class="spinner"></span> Zpracovávám...';
    } else {
        btn.innerHTML = btn.dataset.orig || btn.textContent;
    }
}

// ─────────────────────────────────────────────
//  PŘIHLÁŠENÍ
// ─────────────────────────────────────────────

async function handleLogin() {
    const email = document.getElementById("login-email").value.trim();
    const pass  = document.getElementById("login-password").value;

    clearStatuses();

    if (!email || !pass) {
        showStatus("login-status", "error", "Vyplň email a heslo.");
        return;
    }

    setLoading("btn-login", true);

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        showStatus("login-status", "success", "✓ Přihlášení úspěšné! Přesměrovávám...");
    } catch (e) {
        console.error("[CosmicClash/auth] Login error:", e);
        showStatus("login-status", "error", friendlyError(e.code));
        setLoading("btn-login", false);
    }
}

// ─────────────────────────────────────────────
//  REGISTRACE
// ─────────────────────────────────────────────

let isRegistering = false;

async function handleRegister() {
    const name  = document.getElementById("register-name").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const pass  = document.getElementById("register-password").value;

    clearStatuses();

    if (!name || !email || !pass) {
        showStatus("register-status", "error", "Vyplň všechna pole.");
        return;
    }
    if (name.length < 2) {
        showStatus("register-status", "error", "Jméno pilota musí mít alespoň 2 znaky.");
        return;
    }

    setLoading("btn-register", true);
    isRegistering = true;

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const uid  = cred.user.uid;
        const now  = Timestamp.now();

        showStatus("register-status", "success", "✓ Účet vytvořen. Zapisuji profil...");

        await setDoc(doc(db, "users", uid), {
            userId:    uid,
            email:     email,
            createdAt: now,
        });

        await setDoc(doc(db, "aliens", uid), {
            userId:       uid,
            name:         name,
            email:        email,
            type:         "Neznámý původ",

            level:        1,
            xp:           0,

            hp:           100,
            dmg:          10,
            stamina:      100,

            energy:           5,
            energyUpdatedAt:  now,

            starCoins:    50,
            galacticGems: 0,

            galaxyTrophies: 0,

            createdAt:    now,
        });

        showStatus("register-status", "success", "✓ Profil vytvořen! Přesměrovávám...");
        isRegistering = false;

        setTimeout(() => {
            window.location.href = "/dashboard.html";
        }, 800);

    } catch (e) {
        const isAuthError = e.code?.startsWith("auth/");
        console.error(
            isAuthError
                ? "[CosmicClash/auth] Chyba při vytváření účtu:"
                : "[CosmicClash/auth] Chyba při zápisu do Firestore:",
            e
        );

        showStatus(
            "register-status",
            "error",
            isAuthError
                ? friendlyError(e.code)
                : `Chyba databáze: ${e.message ?? "neznámá chyba"} — zkus to znovu.`
        );

        isRegistering = false;
        setLoading("btn-register", false);
    }
}

// ─────────────────────────────────────────────
//  PŘEPÍNÁNÍ ZÁLOŽEK
// ─────────────────────────────────────────────

function switchTab(tab) {
    document.querySelectorAll(".tab-btn").forEach((b, i) => {
        b.classList.toggle(
            "active",
            (tab === "login" && i === 0) || (tab === "register" && i === 1)
        );
    });
    document.getElementById("form-login").classList.toggle("active", tab === "login");
    document.getElementById("form-register").classList.toggle("active", tab === "register");
    clearStatuses();
}

// ─────────────────────────────────────────────
//  HVĚZDNÉ POZADÍ
// ─────────────────────────────────────────────

function createStars() {
    const starsEl = document.getElementById("stars");
    if (!starsEl) return;
    for (let i = 0; i < 120; i++) {
        const s = document.createElement("div");
        s.className = "star-dot";
        const size = Math.random() * 2.2 + 0.5;
        s.style.cssText = `
            width:${size}px; height:${size}px;
            top:${Math.random() * 100}%; left:${Math.random() * 100}%;
            --d:${(Math.random() * 4 + 2).toFixed(1)}s;
            --min:${(Math.random() * 0.2 + 0.05).toFixed(2)};
            --max:${(Math.random() * 0.6 + 0.3).toFixed(2)};
            animation-delay:-${(Math.random() * 6).toFixed(1)}s;
        `;
        starsEl.appendChild(s);
    }
}

// ─────────────────────────────────────────────
//  GLOBÁLNÍ EXPOZICE PRO INLINE HANDLERY V HTML
// ─────────────────────────────────────────────

window.switchTab = switchTab;

document.addEventListener("DOMContentLoaded", () => {
    createStars();

    document.getElementById("btn-login")?.addEventListener("click", handleLogin);
    document.getElementById("btn-register")?.addEventListener("click", handleRegister);

    onAuthStateChanged(auth, (user) => {
        if (!user) return;
        if (isRegistering) return;
        window.location.href = "/dashboard.html";
    });
});