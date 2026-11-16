// Public-key encryption for the Telegram inbox (see TELEGRAM-BOT.md).
// The bot holds only the public key: it can seal new items but never open them, nor anything else.
// The private key lives in the app, inside a blob sealed with the data key like every other container.
//
// Scheme (ECIES): an ephemeral ECDH P-256 key per item, HKDF-SHA256 over the shared secret,
// AES-GCM 256. The inbox document id is authenticated data: an item cannot be moved to another id.
// Plain Web Crypto, so the same module runs in the browser, in the Cloudflare Worker and in Node.
import { fromBase64, randomBytes, toBase64 } from './crypto.js';

export const INBOX_VERSION = 1;
// Upper bound on the ciphertext, mirrored by the Firestore rule on users/{uid}/inbox.
export const MAX_INBOX_DATA = 16_000;

const CURVE = { name: 'ECDH', namedCurve: 'P-256' };
const HKDF_INFO = 'spese/inbox/v1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const additionalData = (docId) => encoder.encode(`inbox:${docId}`);

function requireDocId(docId) {
  if (typeof docId !== 'string' || !docId) throw new Error('Inbox item without a document id');
}

// A fresh key pair, exported as JWK: the private one goes into the encrypted `inbox-key` blob,
// the public one is copied into the bot's configuration.
export async function generateInboxKeys() {
  const pair = await crypto.subtle.generateKey(CURVE, true, ['deriveBits']);
  const [privateJwk, publicJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', pair.privateKey),
    crypto.subtle.exportKey('jwk', pair.publicKey),
  ]);
  return { privateJwk, publicJwk: { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y } };
}

function checkJwk(jwk) {
  if (jwk?.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) throw new Error('Not a P-256 inbox key');
}

// Refuses a private key: pasting it into the bot by mistake would let the bot open the inbox.
export async function importInboxPublicKey(jwk) {
  checkJwk(jwk);
  if ('d' in jwk) throw new Error('This is the private inbox key: the bot needs the public one');
  return crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, CURVE, false, []);
}

// Non-extractable once imported: its bytes stay inside Web Crypto.
export async function importInboxPrivateKey(jwk) {
  checkJwk(jwk);
  if (!jwk.d) throw new Error('This is the public inbox key: opening items needs the private one');
  return crypto.subtle.importKey('jwk', jwk, CURVE, false, ['deriveBits']);
}

// The ephemeral public key (raw, 65 bytes) is the HKDF salt, so each item has its own AES key.
async function itemKey(privateKey, publicKey, ephemeralRaw, usage) {
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: ephemeralRaw, info: encoder.encode(HKDF_INFO) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

// → { v, epk, iv, data }: the fields stored in users/{uid}/inbox/{docId}, besides createdAt.
export async function sealInboxItem(publicKey, docId, value) {
  requireDocId(docId);
  const ephemeral = await crypto.subtle.generateKey(CURVE, true, ['deriveBits']);
  const ephemeralRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));
  const key = await itemKey(ephemeral.privateKey, publicKey, ephemeralRaw, 'encrypt');
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(docId) },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  const data = toBase64(new Uint8Array(cipher));
  if (data.length > MAX_INBOX_DATA) throw new Error('Inbox item too large');
  return { v: INBOX_VERSION, epk: toBase64(ephemeralRaw), iv: toBase64(iv), data };
}

export async function openInboxItem(privateKey, docId, item) {
  requireDocId(docId);
  if (item?.v !== INBOX_VERSION) throw new Error('Movimento da Telegram in un formato non supportato');
  let plain;
  try {
    const ephemeralRaw = fromBase64(item.epk);
    const ephemeralKey = await crypto.subtle.importKey('raw', ephemeralRaw, CURVE, false, []);
    const key = await itemKey(privateKey, ephemeralKey, ephemeralRaw, 'decrypt');
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(item.iv), additionalData: additionalData(docId) },
      key,
      fromBase64(item.data),
    );
  } catch {
    throw new Error('Impossibile leggere il movimento da Telegram: chiave diversa o dati danneggiati');
  }
  return JSON.parse(decoder.decode(plain));
}
