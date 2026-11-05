import { getFirebase, restoredUser, signIn, signOutOf, doc, getDoc, setDoc, serverTimestamp } from './firebase.js';
import { deriveAuthPassword, deriveVaultKey, fromBase64, PBKDF2_ITERATIONS, randomBytes, toBase64 } from './crypto.js';
import { createVaultStorage } from './storage.js';
import { forgetSession, recallSession, rememberSession } from './remember.js';

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

// The profile holds only the (non-secret) salt used to derive the data key.
async function loadOrCreateProfile(db, uid) {
  const ref = doc(db, 'users', uid);
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) return snapshot.data();
  const profile = { salt: toBase64(randomBytes(16)), iterations: PBKDF2_ITERATIONS, version: 1 };
  await setDoc(ref, { ...profile, createdAt: serverTimestamp() });
  return profile;
}

// Locking forgets the remembered key as well as signing out.
const openSession = (auth, db, uid, key) => ({
  storage: createVaultStorage({ db, uid, key }),
  lock: async () => {
    await forgetSession();
    await signOutOf(auth);
  },
});

// Reopens a session remembered by a previous unlock, without the code. Null when there is none,
// it has expired, or Firebase no longer has the same user signed in: the code is then needed.
export async function resume(config) {
  if (!(config.rememberHours > 0)) return null;
  const { auth, db } = getFirebase(config.firebase);
  const [remembered, user] = await Promise.all([recallSession(), restoredUser(auth).catch(() => null)]);
  if (remembered && user?.uid === remembered.uid) return openSession(auth, db, user.uid, remembered.key);
  await forgetSession();
  if (user) await signOutOf(auth).catch(() => {});
  return null;
}

// Verifies the code with Firebase and derives the key: the code is not kept.
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
    if (config.rememberHours > 0) await rememberSession({ uid, key }, config.rememberHours).catch(() => {});
    return openSession(auth, db, uid, key);
  } catch (error) {
    await signOutOf(auth);
    throw new Error(error.code === 'permission-denied'
      ? 'Firestore rifiuta l’accesso: controlla le regole di sicurezza'
      : error.message);
  }
}
