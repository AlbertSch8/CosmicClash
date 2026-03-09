// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCcDO3GDgRne13vU0CZ_fAyM1GRdjD3GzE",
  authDomain: "cosmicclash-b9510.firebaseapp.com",
  projectId: "cosmicclash-b9510",
  storageBucket: "cosmicclash-b9510.firebasestorage.app",
  messagingSenderId: "144919290524",
  appId: "1:144919290524:web:3901452b88a3ff9c530359",
  measurementId: "G-YQXNE4LN53"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);