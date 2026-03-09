import { db } from "./firebase.js";
import { doc, getDoc } from "firebase/firestore";

export async function loadDashboard(userId) {
    const alienRef = doc(db, "aliens", userId);
    const alienSnap = await getDoc(alienRef);

    if (!alienSnap.exists()) {
        throw new Error("Ufoun nenalezen");
    }

    return alienSnap.data();
}
