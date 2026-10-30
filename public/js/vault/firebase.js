// Single point of contact with the Firebase SDK (official ESM modules from gstatic).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  initializeAuth, inMemoryPersistence, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export { doc, getDoc, setDoc, writeBatch, serverTimestamp };

let services = null;

export function getFirebase(firebaseConfig) {
  if (!services) {
    const app = initializeApp(firebaseConfig);
    // In-memory session only: reloading the page asks for the code again,
    // which is needed anyway to derive the data key.
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    services = { auth, db: getFirestore(app) };
  }
  return services;
}

export const signIn = (auth, email, password) => signInWithEmailAndPassword(auth, email, password);
export const signOutOf = (auth) => signOut(auth);
