import http from 'node:http';
import { config } from './config.js';
import { createStaticHandler } from './http/static.js';

const serveStatic = createStaticHandler([{ prefix: '/', dir: config.publicDir }]);

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (await serveStatic(req, res, pathname)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (error) {
    console.error(error);
    if (res.headersSent) return res.destroy();
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal error');
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Spese (development) at http://${config.host}:${config.port}`);
});
