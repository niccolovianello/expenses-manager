import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch, serverTimestamp } from './firebase.js';
import { openJson, sealJson } from './crypto.js';

// Base64 characters per document: stays under Firestore's 1 MiB limit.
const CHUNK_SIZE = 700_000;

const partId = (name, index) => `${name}-part-${index}`;

function split(text, size) {
  const parts = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts.length ? parts : [''];
}

// Encrypted containers on Firestore: users/{uid}/blobs/{name} holds the iv and number of parts,
// users/{uid}/blobs/{name}-part-{n} the ciphertext. Nothing ever reaches Firebase in plain text.
export function createVaultStorage({ db, uid, key }) {
  const ref = (id) => doc(db, 'users', uid, 'blobs', id);

  return {
    // The Firebase user id: not secret, the bot needs it to know where the inbox is.
    uid,

    async read(name) {
      const head = await getDoc(ref(name));
      if (!head.exists()) return null;
      const { iv, parts } = head.data();
      const chunks = await Promise.all(Array.from({ length: parts }, (_, i) => getDoc(ref(partId(name, i)))));
      if (chunks.some((chunk) => !chunk.exists())) throw new Error('Dati incompleti su Firebase: reimporta l’export');
      return openJson(key, { iv, data: chunks.map((chunk) => chunk.data().data).join('') }, name);
    },

    async write(name, value) {
      const { iv, data } = await sealJson(key, value, name);
      const parts = split(data, CHUNK_SIZE);
      const head = await getDoc(ref(name));
      const previousParts = head.exists() ? head.data().parts : 0;

      const batch = writeBatch(db);
      parts.forEach((part, i) => batch.set(ref(partId(name, i)), { data: part }));
      for (let i = parts.length; i < previousParts; i++) batch.delete(ref(partId(name, i)));
      batch.set(ref(name), { iv, parts: parts.length, updatedAt: serverTimestamp() });
      await batch.commit();
    },

    // users/{uid}/inbox: items the Telegram bot sealed with the inbox public key (see inbox-crypto.js).
    // Read and deleted here, never written: only the bot creates them.
    inbox: {
      async list() {
        const snapshot = await getDocs(collection(db, 'users', uid, 'inbox'));
        return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      },
      remove: (id) => deleteDoc(doc(db, 'users', uid, 'inbox', id)),
    },

    // users/{uid}/bot/hints: account and category names for the bot, in PLAIN TEXT (a deliberate
    // choice, see TELEGRAM-BOT.md). One JSON string, so the bot reads it without Firestore's typed values.
    writeBotHints: (hints) => setDoc(doc(db, 'users', uid, 'bot', 'hints'), { json: JSON.stringify(hints), updatedAt: serverTimestamp() }),

    // users/{uid}/bot/schedule: recurring transactions and top-ups, sealed with the schedule key
    // (schedule-crypto.js), so the bot can announce them on their day.
    writeBotSchedule: ({ v, iv, data }) => setDoc(doc(db, 'users', uid, 'bot', 'schedule'), { v, iv, data, updatedAt: serverTimestamp() }),
  };
}
