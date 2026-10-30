import path from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function resolveInside(dir, relative) {
  const target = path.resolve(dir, `.${path.posix.normalize(`/${relative}`)}`);
  return target === dir || target.startsWith(dir + path.sep) ? target : null;
}

// mounts: [{ prefix, dir }] for folders, [{ prefix, files }] for individually mapped files.
export function createStaticHandler(mounts) {
  return async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const mount = mounts.find((candidate) => pathname.startsWith(candidate.prefix));
    if (!mount) return false;

    const relative = decodeURIComponent(pathname.slice(mount.prefix.length)) || 'index.html';
    const file = mount.files ? mount.files[relative] : resolveInside(mount.dir, relative);
    if (!file) return false;

    try {
      const info = await stat(file);
      if (!info.isFile()) return false;
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[path.extname(file)] ?? 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') res.end();
      else createReadStream(file).pipe(res);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  };
}
