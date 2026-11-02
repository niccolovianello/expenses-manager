// The site and the repository are public, so the initial accounts (with real balances) live in
// accounts.local.js, which is git-ignored: it exists only on the local server (npm start).
// Opening the app there once adds them, encrypted, on Firebase; elsewhere there is nothing to load.
const LOCAL_HOSTS = ['127.0.0.1', 'localhost'];

export async function loadAccountSeed() {
  if (!LOCAL_HOSTS.includes(location.hostname)) return null;
  try {
    const { default: seed } = await import('./accounts.local.js');
    return Array.isArray(seed) && seed.length ? seed : null;
  } catch {
    return null;
  }
}
