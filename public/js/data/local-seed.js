// The site and the repository are public, so the initial accounts (with real balances) and recurring
// transactions live in accounts.local.js and recurring.local.js, which are git-ignored: they exist only
// on the local server (npm start). Opening the app there adds them, encrypted, on Firebase; elsewhere
// there is nothing to load.
const LOCAL_HOSTS = ['127.0.0.1', 'localhost'];

async function loadLocalSeed(load) {
  if (!LOCAL_HOSTS.includes(location.hostname)) return null;
  try {
    const { default: seed } = await load();
    return Array.isArray(seed) && seed.length ? seed : null;
  } catch {
    return null;
  }
}

export const loadAccountSeed = () => loadLocalSeed(() => import('./accounts.local.js'));
export const loadRecurringSeed = () => loadLocalSeed(() => import('./recurring.local.js'));
