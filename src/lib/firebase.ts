// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

// --- Firebase configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyDpNwXCUm--q-o_lhcun3612NjMc6g-w-4",
  authDomain: "coding-clun.firebaseapp.com",
  projectId: "coding-clun",
  storageBucket: "coding-clun.firebasestorage.app",
  messagingSenderId: "907071459068",
  appId: "1:907071459068:web:cb151c932a85c2009f5179",
  measurementId: "G-GB0PYS28LR"
};

// --- Initialize Firebase (safe for Next.js hot reload) ---
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// --- Initialize analytics only on the client (optional) ---
let analytics: ReturnType<typeof getAnalytics> | null = null;
if (typeof window !== "undefined") {
  isSupported().then((yes) => {
    if (yes) analytics = getAnalytics(app);
  });
}

export { app, auth, db, storage, analytics };





