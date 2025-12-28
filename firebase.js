import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ↓↓ ここにあなたのFirebase設定を貼り付けてください ↓↓
const firebaseConfig = {
  apiKey: "AIzaSyChrDtt8PcbmgbNeugz3p-7wSCd1bJNG9g",
  authDomain: "shun-fes.firebaseapp.com",
  projectId: "shun-fes",
  storageBucket: "shun-fes.firebasestorage.app",
  messagingSenderId: "613973868362",
  appId: "1:613973868362:web:7c1c6fb5a46e468e43cbb3"
};

// ↑↑ ここまで ↑↑

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
