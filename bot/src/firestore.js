// Firebase over REST, as the bot: no SDK, plain fetch, so it runs in the Cloudflare Worker and in Node.
// The bot signs in as its own Firebase user; the Firestore rules let it create inbox items and read
// the hints, nothing else (see TELEGRAM-BOT.md).

const IDENTITY = 'https://identitytoolkit.googleapis.com/v1';
const FIRESTORE = 'https://firestore.googleapis.com/v1';

async function call(url, init, what) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`${what}: ${body.error?.message ?? response.status}`);
    error.status = body.error?.status ?? response.status;
    throw error;
  }
  return body;
}

// `config`: { apiKey, projectId, email, password, ownerUid }.
export function createFirestoreClient(config) {
  let session = null;
  const documents = `projects/${config.projectId}/databases/(default)/documents`;

  // ID tokens last an hour: a new sign-in a few minutes before that.
  async function token() {
    if (session && session.expiresAt > Date.now() + 5 * 60_000) return session.idToken;
    const body = await call(`${IDENTITY}/accounts:signInWithPassword?key=${encodeURIComponent(config.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: config.email, password: config.password, returnSecureToken: true }),
    }, 'Firebase sign-in');
    session = { idToken: body.idToken, expiresAt: Date.now() + Number(body.expiresIn) * 1000 };
    return session.idToken;
  }

  const authorized = async () => ({ Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' });

  return {
    // Creates users/{owner}/inbox/{docId} from the fields sealInboxItem returned. createdAt is the
    // server's time (the rule checks it). Returns false if the document already exists: the same
    // Telegram update delivered twice.
    async createInboxItem(docId, { v, epk, iv, data }) {
      const name = `${documents}/users/${config.ownerUid}/inbox/${docId}`;
      try {
        await call(`${FIRESTORE}/${documents}:commit?key=${encodeURIComponent(config.apiKey)}`, {
          method: 'POST',
          headers: await authorized(),
          body: JSON.stringify({
            writes: [{
              update: {
                name,
                fields: {
                  v: { integerValue: String(v) },
                  epk: { stringValue: epk },
                  iv: { stringValue: iv },
                  data: { stringValue: data },
                },
              },
              updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
              currentDocument: { exists: false },
            }],
          }),
        }, 'Inbox write');
        return true;
      } catch (error) {
        if (error.status === 'ALREADY_EXISTS' || error.status === 'FAILED_PRECONDITION') return false;
        throw error;
      }
    },
  };
}
