import "server-only";

import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const requiredKeys = [
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET",
  "FIREBASE_MESSAGING_SENDER_ID",
  "FIREBASE_APP_ID",
] as const;

export function firebaseDadosLocaisConfigurado() {
  return requiredKeys.every((key) => Boolean(process.env[key]));
}

export function getDadosLocaisDb() {
  if (!firebaseDadosLocaisConfigurado()) return null;

  const config: FirebaseOptions = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
  };

  const app = getApps().find((current) => current.name === "dados-locais")
    || initializeApp(config, "dados-locais");

  return getFirestore(app);
}
