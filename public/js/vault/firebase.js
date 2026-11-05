// Single point of contact with the Firebase SDK (official ESM modules from gstatic).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  initializeAuth, indexedDBLocalPersistence, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export { doc, getDoc, setDoc, writeBatch, serverTimestamp };

let services = null;

export function getFirebase(firebaseConfig) {
  if (!services) {
    const app = initializeApp(firebaseConfig);
    // Persisted session: it is honoured only while the remembered data key is still valid
    // (see remember.js), and signed out as soon as that expires or the app is locked.
    const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
    services = { auth, db: getFirestore(app) };
  }
  return services;
}

export const signIn = (auth, email, password) => signInWithEmailAndPassword(auth, email, password);
export const signOutOf = (auth) => signOut(auth);

// The signed-in user restored from persistence, or null.
export async function restoredUser(auth) {
  await auth.authStateReady();
  return auth.currentUser;
}
