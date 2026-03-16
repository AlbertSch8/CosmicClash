/**
 * UFO: Cosmic Clash — Firebase inicializace
 *
 * Exportuje:
 *   auth           — Firebase Authentication
 *   db             — Firestore databáze
 *   analytics      — Firebase Analytics instance (nebo null)
 *   analyticsReady — Promise<Analytics|null> — čekej na toto v logger.js
 */

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey:            "AIzaSyCcDO3GDgRne13vU0CZ_fAyM1GRdjD3GzE",
  authDomain:        "cosmicclash-b9510.firebaseapp.com",
  projectId:         "cosmicclash-b9510",
  storageBucket:     "cosmicclash-b9510.firebasestorage.app",
  messagingSenderId: "144919290524",
  appId:             "1:144919290524:web:3901452b88a3ff9c530359",
  measurementId:     "G-YQXNE4LN53",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);

// analytics — synchronní export (může být null těsně po startu)
export let analytics = null;

// analyticsReady — Promise která se resolvuje jakmile je Analytics připravena.
// logger.js na toto čeká aby neodesílal eventy do null objektu.
export const analyticsReady = isSupported()
  .then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
      return analytics;
    }
    return null;
  })
  .catch(() => null); // AdBlock, Safari ITP — tiše ignorujeme

export default app;