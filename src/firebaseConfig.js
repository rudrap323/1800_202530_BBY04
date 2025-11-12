import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth,
         setPersistence,
         browserLocalPersistence,
         browserSessionPersistence
 } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:             import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:         import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:          import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:      import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:  import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:              import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:      import.meta.env.VITE_FIREBASE_MEASUREMENT_ID, 
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

if (!firebaseConfig.projectId) {
  console.warn("[Firebase] Missing VITE_FIREBASE_PROJECT_ID — check your .env");
} else {
  console.log(`[Firebase] Connected to project: ${app.options.projectId}`);
}

export const auth = getAuth(app);
export const db   = getFirestore(app);
export const apps = initializeApp(firebaseConfig);

(async function setAuthPersistenceForEnv(){
  try {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      await setPersistence(auth, browserSessionPersistence);
      console.log("Auth persistence: session (localhost)");
    } else {
      await setPersistence(auth, browserLocalPersistence);
      console.log("Auth persistence: local");
    }
  } catch (err) {
    console.error("Failed to set auth persistence:", err);
  }
})();