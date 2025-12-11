// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

/**
 * Prefer environment variables (NEXT_PUBLIC_*) in production.
 * Falls back to embedded config if env vars are not set.
 *
 * IMPORTANT:
 * - Put real values in .env.local (do NOT commit secrets).
 * - Common storageBucket format: "<project-id>.appspot.com"
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDpNwXCUm--q-o_lhcun3612NjMc6g-w-4",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "coding-clun.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "coding-clun",
  // Check your Firebase console for the exact storageBucket. Common: "<project-id>.appspot.com"
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "coding-clun.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "907071459068",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:907071459068:web:cb151c932a85c2009f5179",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-GB0PYS28LR",
};

// Initialize app (safe across hot reloads)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Auth / Firestore / Storage exports
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Analytics: only initialize on client and only if supported
let analytics: ReturnType<typeof getAnalytics> | null = null;

if (typeof window !== "undefined") {
  // Delay check until runtime; isSupported returns a promise
  isSupported().then((supported) => {
    if (supported) {
      try {
        analytics = getAnalytics(app);
      } catch (err) {
        // In some environments getAnalytics may throw (e.g., blocked by adblockers)
        // We swallow the error to avoid crashing the app.
        // If you want to log, uncomment the next line:
        // console.warn("Analytics init failed:", err);
        analytics = null;
      }
    }
  }).catch((err) => {
    // Ignore errors from isSupported
    // console.warn("isSupported check failed", err);
  });
}

export { app, auth, db, storage, analytics };
export default db;
