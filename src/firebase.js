import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCcDO3GDgRne13vU0CZ_fAyM1GRdjD3GzE",
  authDomain: "cosmicclash-b9510.firebaseapp.com",
  projectId: "cosmicclash-b9510",
  storageBucket: "cosmicclash-b9510.firebasestorage.app",
  messagingSenderId: "144919290524",
  appId: "1:144919290524:web:3901452b88a3ff9c530359",
  measurementId: "G-YQXNE4LN53"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;