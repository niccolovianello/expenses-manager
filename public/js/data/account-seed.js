// The site and the repository are public, so the initial accounts (with real balances) live in
// accounts.local.js, which is git-ignored: it exists only on the local server (npm start).
// Opening the app there once saves them, encrypted, on Firebase; elsewhere there is nothing to load.
export async function loadAccountSeed() {
  try {
    const { default: seed } = await import('./accounts.local.js');
    return Array.isArray(seed) && seed.length ? seed : null;
  } catch {
    return null;
  }
}
