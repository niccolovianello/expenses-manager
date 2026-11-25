// Symmetric encryption for the schedule of automatic movements the bot announces (see TELEGRAM-BOT.md).
// Unlike the inbox, the bot has to READ this one: the app seals it with a key the bot also holds.
// The key is derived from the inbox private key, so it needs no storage of its own and "Rigenera
// chiave" replaces both. It opens only the schedule: knowing it reveals nothing about the private key.
// Plain Web Crypto, so the same module runs in the browser, in the Cloudflare Worker and in Node.
import { fromBase64, randomBytes, toBase64 } from './crypto.js';

export const SCHEDULE_VERSION = 1;
const HKDF_INFO = 'spese/schedule/v1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const additionalData = encoder.encode('bot-schedule');

// JWK values are base64url without padding.
const fromBase64Url = (text) => fromBase64(text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '='));

// The key the bot is given (SCHEDULE_KEY), as base64 of 32 raw bytes.
export async function deriveScheduleKey(privateJwk) {
  if (!privateJwk?.d) throw new Error('The schedule key comes from the private inbox key');
  const material = await crypto.subtle.importKey('raw', fromBase64Url(privateJwk.d), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode(HKDF_INFO) },
    material,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

export async function importScheduleKey(base64) {
  const raw = fromBase64(String(base64 ?? '').trim());
  if (raw.length !== 32) throw new Error('SCHEDULE_KEY must be 32 bytes in base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// → { v, iv, data }: the fields stored in users/{uid}/bot/schedule, besides updatedAt.
export async function sealSchedule(key, value) {
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, encoder.encode(JSON.stringify(value)));
  return { v: SCHEDULE_VERSION, iv: toBase64(iv), data: toBase64(new Uint8Array(cipher)) };
}

export async function openSchedule(key, sealed) {
  if (sealed?.v !== SCHEDULE_VERSION) throw new Error('Schedule in an unsupported format');
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(sealed.iv), additionalData }, key, fromBase64(sealed.data));
  } catch {
    throw new Error('Cannot open the schedule: different key (regenerated in the app?) or damaged data');
  }
  return JSON.parse(decoder.decode(plain));
}
