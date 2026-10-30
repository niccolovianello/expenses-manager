import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Development server: serves the public/ folder the way GitHub Pages will.
export const config = {
  port: Number(process.env.PORT) || 5173,
  host: process.env.HOST || '127.0.0.1',
  publicDir: path.join(root, 'public'),
};
