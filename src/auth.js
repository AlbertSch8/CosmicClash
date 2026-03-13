import { auth, db } from "./firebase.js";
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

const errorMsg = {
    "auth/user-not-found": "Účet s tímto emailem neexistuje.",
    "auth/wrong-password": "Nesprávné heslo.",
    "auth/invalid-email": "Neplatný formát emailu.",
    "auth/email-already-in-use": "Tento email je již používán.",
    "auth/weak-password": "Heslo musí mít alespoň 6 znaků.",
    "auth/too-many-requests": "Příliš mnoho pokusů. Zkus to za chvíli.",
    "auth/invalid-credential": "Nesprávný email nebo heslo."
};

function friendlyError(code) {
    return errorMsg[code] || "Nastala chyba. Zkus to znovu.";
}

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

async function handleLogin() {
    const email = document.getElementById("login-email").value.trim();
    const pass = document.getElementById("login-password").value;

    clearStatuses();

    if (!email || !pass) {
        showStatus("login-status", "error", "Vyplň email a heslo.");
        return;
    }

    setLoading("btn-login", true);

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        showStatus("login-status", "success", "✓ Přihlášení úspěšné! Přesměrovávám...");
        setTimeout(() => {
            window.location.href = "/dashboard.html";
        }, 800);
    } catch (e) {
        console.error("Login error:", e);
        showStatus("login-status", "error", friendlyError(e.code));
        setLoading("btn-login", false);
    }
}

async function handleRegister() {
    const name = document.getElementById("register-name").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const pass = document.getElementById("register-password").value;

    clearStatuses();

    if (!name || !email || !pass) {
        showStatus("register-status", "error", "Vyplň všechna pole.");
        return;
    }

    setLoading("btn-register", true);

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const uid = cred.user.uid;

        await setDoc(doc(db, "aliens", uid), {
            name,
            email,
            level: 1,
            xp: 0,
            hp: 100,
            dmg: 10,
            stamina: 100,
            starCoins: 50,
            createdAt: serverTimestamp()
        });

        showStatus("register-status", "success", "✓ Účet vytvořen! Přesměrovávám...");
        setTimeout(() => {
            window.location.href = "/dashboard.html";
        }, 800);
    } catch (e) {
        console.error("Register error:", e);
        showStatus("register-status", "error", friendlyError(e.code));
        setLoading("btn-register", false);
    }
}

function switchTab(tab) {
    document.querySelectorAll(".tab-btn").forEach((b, i) => {
        b.classList.toggle("active", (tab === "login" && i === 0) || (tab === "register" && i === 1));
    });

    document.getElementById("form-login").classList.toggle("active", tab === "login");
    document.getElementById("form-register").classList.toggle("active", tab === "register");

    clearStatuses();
}

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

window.switchTab = switchTab;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;

document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    if (document.getElementById("form-login").classList.contains("active")) {
        handleLogin();
    } else {
        handleRegister();
    }
});

createStars();

onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.href = "/dashboard.html";
    }
});