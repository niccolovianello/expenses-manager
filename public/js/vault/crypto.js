// Client-side encryption with Web Crypto. Two independent secrets are derived from the secret code:
//  - the Firebase account password (fixed salt tied to the email), so Firebase never sees the code;
//  - the AES-GCM data key (random salt stored on Firestore), which never leaves the browser.
// Knowing one of them reveals neither the other nor the code.
export const PBKDF2_ITERATIONS = 600_000;
const AUTH_CONTEXT = 'spese/auth/v1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const randomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

const toBase64Url = (bytes) => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const codeMaterial = (code) =>
  crypto.subtle.importKey('raw', encoder.encode(code.normalize('NFC')), 'PBKDF2', false, ['deriveBits', 'deriveKey']);

const pbkdf2 = (salt, iterations) => ({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' });

export async function deriveAuthPassword(code, email, iterations = PBKDF2_ITERATIONS) {
  const salt = encoder.encode(`${AUTH_CONTEXT}:${email.trim().toLowerCase()}`);
  const bits = await crypto.subtle.deriveBits(pbkdf2(salt, iterations), await codeMaterial(code), 256);
  return toBase64Url(new Uint8Array(bits));
}

export async function deriveVaultKey(code, salt, iterations = PBKDF2_ITERATIONS) {
  return crypto.subtle.deriveKey(
    pbkdf2(salt, iterations),
    await codeMaterial(code),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function pipe(bytes, transform) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer());
}

// JSON → gzip → AES-GCM. The container name is authenticated data: one blob cannot be
// swapped in for another without decryption failing.
export async function sealJson(key, value, label) {
  const plain = await pipe(encoder.encode(JSON.stringify(value)), new CompressionStream('gzip'));
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(label) }, key, plain);
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(cipher)) };
}

export async function openJson(key, { iv, data }, label) {
  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(iv), additionalData: encoder.encode(label) },
      key,
      fromBase64(data),
    );
  } catch {
    throw new Error('Impossibile decifrare i dati: codice diverso da quello usato per cifrarli o dati danneggiati');
  }
  return JSON.parse(decoder.decode(await pipe(new Uint8Array(plain), new DecompressionStream('gzip'))));
}
