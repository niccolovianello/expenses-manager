#!/usr/bin/env node
// Computes the password to set for the user in Firebase Authentication.
// The secret code is never shown, stored or sent: it stays in this process.
// Usage: npm run derive-password -- your@email.com
import { createInterface } from 'node:readline';
import { deriveAuthPassword } from '../public/js/vault/crypto.js';

const email = process.argv[2];
if (!email || !email.includes('@')) {
  console.error('Usage: npm run derive-password -- your@email.com');
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

const code = await askHidden('Secret code: ');
const repeat = await askHidden('Repeat the code: ');
if (code !== repeat) {
  console.error('The two codes do not match.');
  process.exit(1);
}
if (code.length < 12) {
  console.error('Use at least 12 characters: it is the only protection of the encrypted data.');
  process.exit(1);
}

console.log('\nPassword to set in Firebase Authentication for', email);
console.log(await deriveAuthPassword(code, email));
