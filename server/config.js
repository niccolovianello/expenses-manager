import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Server di sviluppo: serve la cartella public/ come farà GitHub Pages.
export const config = {
  port: Number(process.env.PORT) || 5173,
  host: process.env.HOST || '127.0.0.1',
  publicDir: path.join(root, 'public'),
};
