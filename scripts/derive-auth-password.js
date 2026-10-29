#!/usr/bin/env node
// Calcola la password da impostare per l'utente in Firebase Authentication.
// Il codice segreto non viene mai mostrato, salvato o inviato: resta in questo processo.
// Uso: npm run derive-password -- tua@email.it
import { createInterface } from 'node:readline';
import { deriveAuthPassword } from '../public/js/vault/crypto.js';

const email = process.argv[2];
if (!email || !email.includes('@')) {
  console.error('Uso: npm run derive-password -- tua@email.it');
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.includes(question)) process.stdout.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const code = await askHidden('Codice segreto: ');
const repeat = await askHidden('Ripeti il codice: ');
if (code !== repeat) {
  console.error('I due codici non coincidono.');
  process.exit(1);
}
if (code.length < 12) {
  console.error('Usa almeno 12 caratteri: è l’unica protezione dei dati cifrati.');
  process.exit(1);
}

console.log('\nPassword da impostare in Firebase Authentication per', email);
console.log(await deriveAuthPassword(code, email));
