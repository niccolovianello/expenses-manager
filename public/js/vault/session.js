import { getFirebase, signIn, signOutOf, doc, getDoc, setDoc, serverTimestamp } from './firebase.js';
import { deriveAuthPassword, deriveVaultKey, fromBase64, PBKDF2_ITERATIONS, randomBytes, toBase64 } from './crypto.js';
import { createVaultStorage } from './storage.js';

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Codice non valido',
  'auth/invalid-login-credentials': 'Codice non valido',
  'auth/wrong-password': 'Codice non valido',
  'auth/user-not-found': 'Codice non valido',
  'auth/too-many-requests': 'Troppi tentativi. Attendi qualche minuto e riprova.',
  'auth/network-request-failed': 'Connessione assente. Controlla la rete e riprova.',
  'auth/user-disabled': 'Account disabilitato su Firebase',
  'auth/invalid-api-key': 'Configurazione Firebase non valida: controlla js/config.js',
  'auth/operation-not-allowed': 'Accesso con email e password non attivo su Firebase',
};

export const isConfigured = (config) => Boolean(config.firebase?.apiKey && config.firebase?.projectId && config.accountEmail);

// Il profilo contiene solo il sale (non segreto) per ricavare la chiave dei dati.
async function loadOrCreateProfile(db, uid) {
  const ref = doc(db, 'users', uid);
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) return snapshot.data();
  const profile = { salt: toBase64(randomBytes(16)), iterations: PBKDF2_ITERATIONS, version: 1 };
  await setDoc(ref, { ...profile, createdAt: serverTimestamp() });
  return profile;
}

// Verifica il codice con Firebase e ricava la chiave: il codice non viene conservato.
export async function unlock(code, config) {
  const { auth, db } = getFirebase(config.firebase);
  let credential;
  try {
    credential = await signIn(auth, config.accountEmail, await deriveAuthPassword(code, config.accountEmail));
  } catch (error) {
    throw new Error(AUTH_ERRORS[error.code] ?? `Accesso non riuscito (${error.code ?? error.message})`);
  }

  const uid = credential.user.uid;
  try {
    const profile = await loadOrCreateProfile(db, uid);
    const key = await deriveVaultKey(code, fromBase64(profile.salt), profile.iterations);
    return {
      storage: createVaultStorage({ db, uid, key }),
      lock: () => signOutOf(auth),
    };
  } catch (error) {
    await signOutOf(auth);
    throw new Error(error.code === 'permission-denied'
      ? 'Firestore rifiuta l’accesso: controlla le regole di sicurezza'
      : error.message);
  }
}
