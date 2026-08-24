import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

// Public web config — Firebase's own model is that this is safe to ship in the
// client (unlike the GitHub token). Real access control lives in the Realtime
// Database security rules, not in hiding this object.
const firebaseConfig = {
  apiKey: "AIzaSyCNb4cj6znXp4TEoGZyaInr-NZHFBTyIpk",
  authDomain: "alaunchi.firebaseapp.com",
  databaseURL: "https://alaunchi-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "alaunchi",
  storageBucket: "alaunchi.firebasestorage.app",
  messagingSenderId: "1064536166788",
  appId: "1:1064536166788:web:6fb975c8fc7259c1da8dd1",
};

const firebaseApp = initializeApp(firebaseConfig);
export const rtdb = getDatabase(firebaseApp);
export const storage = getStorage(firebaseApp);
