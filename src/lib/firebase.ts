// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDpNwXCUm--q-o_lhcun3612NjMc6g-w-4",
  authDomain: "coding-clun.firebaseapp.com",
  projectId: "coding-clun",
  storageBucket: "coding-clun.firebasestorage.app",
  messagingSenderId: "907071459068",
  appId: "1:907071459068:web:cb151c932a85c2009f5179",
  measurementId: "G-GB0PYS28LR"
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
