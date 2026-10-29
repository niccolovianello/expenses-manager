// Unico punto di contatto con l'SDK Firebase (moduli ESM ufficiali da gstatic).
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
    // Sessione solo in memoria: ricaricare la pagina richiede di nuovo il codice,
    // che serve comunque per ricavare la chiave dei dati.
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    services = { auth, db: getFirestore(app) };
  }
  return services;
}

export const signIn = (auth, email, password) => signInWithEmailAndPassword(auth, email, password);
export const signOutOf = (auth) => signOut(auth);
