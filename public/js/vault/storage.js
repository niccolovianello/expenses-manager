import { doc, getDoc, writeBatch, serverTimestamp } from './firebase.js';
import { openJson, sealJson } from './crypto.js';

// Caratteri base64 per documento: resta sotto il limite di 1 MiB di Firestore.
const CHUNK_SIZE = 700_000;

const partId = (name, index) => `${name}-part-${index}`;

function split(text, size) {
  const parts = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts.length ? parts : [''];
}

// Contenitori cifrati su Firestore: users/{uid}/blobs/{name} tiene iv e numero di parti,
// users/{uid}/blobs/{name}-part-{n} il testo cifrato. Su Firebase non arriva mai nulla in chiaro.
export function createVaultStorage({ db, uid, key }) {
  const ref = (id) => doc(db, 'users', uid, 'blobs', id);

  return {
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
  };
}
