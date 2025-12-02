// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyB_tHEpvzOX7VDtMgiPw06OU0TreGtQ2ig",
  authDomain: "coding-club-ee7c3.firebaseapp.com",
  projectId: "coding-club-ee7c3",
  storageBucket: "coding-club-ee7c3.firebasestorage.app",
  messagingSenderId: "1029326574504",
  appId: "1:1029326574504:web:e2a3880534ed106bbf039d",
  measurementId: "G-2MGDWHB62Y"
};

// Initialize only once (Next.js hot reload safe)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Optional analytics (only runs in browser if supported)
export let analytics: ReturnType<typeof getAnalytics> | null = null;
if (typeof window !== "undefined") {
  isSupported().then((ok) => {
    if (ok) analytics = getAnalytics(app);
  }).catch(() => {
    analytics = null;
  });
}

export default app;
