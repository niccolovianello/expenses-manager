// One Telegram update in, one reply out. Everything it talks to is passed in (`deps`), so the tests
// run it with fakes. See TELEGRAM-BOT.md for the whole flow.
import { normalizeEntry } from '../../public/js/domain/entries.js';
import { formatEUR, formatDate } from '../../public/js/lib/format.js';
import { sealInboxItem } from '../../public/js/vault/inbox-crypto.js';

const CANCEL = 'x:';
// A question the bot asks starts with the original message in «»: the reply to it carries both.
const QUOTED = /^«([\s\S]+?)»\n/;

const HELP = `Scrivimi una spesa come la diresti, per esempio:
• pizza 18,50
• benzina 60 ieri con la carta
• stipendio 1800 sul conto
• giroconto 50 dal conto a Satispay

Se non dici il conto uso quello che usi di più. La trovi in Spese la prossima volta che apri l’app.`;

function describeDate(date, today) {
  if (date === today) return 'oggi';
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return date === yesterday ? 'ieri' : formatDate(date);
}

export function confirmation(parsed, today) {
  const where = parsed.kind === 'transfer' ? `${parsed.account} → ${parsed.toAccount}` : parsed.account;
  const head = [formatEUR(parsed.amount), parsed.kind === 'transfer' ? 'Giroconto' : parsed.category, where, describeDate(parsed.date, today)]
    .filter(Boolean).join(' · ');
  const sign = parsed.kind === 'income' ? '＋' : '✓';
  return [`${sign} ${head}`, parsed.comment, parsed.tag ? `#${parsed.tag}` : null].filter(Boolean).join('\n');
}

// What the app would say about these fields (unknown account, missing category…), or null if valid.
function problemWith(parsed, hints) {
  const { error } = normalizeEntry(parsed);
  if (error) return error;
  const accounts = new Set(hints.accounts);
  if (!accounts.has(parsed.account) || (parsed.toAccount && !accounts.has(parsed.toAccount))) return 'Scegli un conto dall’elenco dei conti';
  return null;
}

// `deps`: { telegram, firestore, parse(text, hints), publicKey, allowedChatId, model, now() }.
export async function handleUpdate(update, deps) {
  if (update.callback_query) return handleCallback(update.callback_query, deps);
  const message = update.message;
  if (!message) return;
  const chatId = message.chat?.id;
  const reply = (text, extra) => deps.telegram.sendMessage(chatId, text, extra);

  // Before ALLOWED_CHAT_ID is set, the bot only says which id to set.
  if (!deps.allowedChatId) return reply(`Bot non ancora configurato. Il tuo chat id è ${chatId}: impostalo come ALLOWED_CHAT_ID.`);
  if (String(chatId) !== String(deps.allowedChatId)) return;

  try {
    const typed = message.text?.trim();
    if (!typed) return reply('Mandami un messaggio di testo, per esempio “pizza 18,50”.');
    if (/^\/(start|aiuto|help)\b/.test(typed)) return reply(HELP);

    // An answer to a question of the bot: read together with the message the question was about.
    const quoted = message.reply_to_message?.from?.is_bot ? QUOTED.exec(message.reply_to_message.text ?? '')?.[1] : null;
    const text = quoted ? `${quoted}\n${typed}` : typed;

    const hints = await deps.firestore.readHints();
    if (!hints?.accounts?.length) return reply('Non conosco ancora i tuoi conti: apri l’app una volta (Conti → Telegram) e riprova.');

    const now = deps.now();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(now);
    const parsed = await deps.parse(text, hints, now);
    if (!parsed) return reply('Non ho capito, puoi riscriverlo?');
    if (parsed.status === 'needs_info') {
      return reply(`«${text}»\n${parsed.question}`, { reply_markup: { force_reply: true, input_field_placeholder: 'Rispondi qui' } });
    }

    const docId = String(update.update_id);
    const sealed = await sealInboxItem(deps.publicKey, docId, {
      v: 1,
      receivedAt: new Date((message.date ?? now.getTime() / 1000) * 1000).toISOString(),
      text,
      parsed,
      model: deps.model,
    });
    // Already there: Telegram delivered the same update twice, and the first one has been answered.
    if (!(await deps.firestore.createInboxItem(docId, sealed))) return;

    const problem = problemWith(parsed, hints);
    const body = problem ? `Salvato, ma da completare nell’app: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}.\n«${text}»` : confirmation(parsed, today);
    return reply(body, { reply_markup: { inline_keyboard: [[{ text: 'Annulla', callback_data: `${CANCEL}${docId}` }]] } });
  } catch (error) {
    console.error(error);
    return reply('Qualcosa è andato storto e non l’ho salvato. Riprova tra poco.').catch(() => {});
  }
}

// The Annulla button: a cancel item for the app, which removes the transaction (or the waiting item).
async function handleCallback(query, deps) {
  const chatId = query.message?.chat?.id;
  if (String(chatId) !== String(deps.allowedChatId) || !query.data?.startsWith(CANCEL)) {
    return deps.telegram.answerCallbackQuery(query.id);
  }
  const ref = query.data.slice(CANCEL.length);
  try {
    const docId = `x-${ref}`;
    await deps.firestore.createInboxItem(docId, await sealInboxItem(deps.publicKey, docId, { v: 1, type: 'cancel', ref }));
    await deps.telegram.editMessageText(chatId, query.message.message_id, `${query.message.text}\n\n✗ Annullato`);
    return deps.telegram.answerCallbackQuery(query.id, 'Annullato');
  } catch (error) {
    console.error(error);
    return deps.telegram.answerCallbackQuery(query.id, 'Non sono riuscito ad annullarlo, riprova');
  }
}
