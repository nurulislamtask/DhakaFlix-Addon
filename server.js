// DhakaFlix addon — PC-te chalanor jonno local server.
// Store page (public/) + addon API (api/index.js) — http://localhost:3000
// Tunnel (cloudflared) diye eta public korle GooWatch-e install kora jay.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from './api/index.js';

const PORT = process.env.PORT || 3000;
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'public') + sep;
const TYPES = {
  '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    let p = decodeURIComponent(u.pathname);
    if (p === '/') p = '/index.html';
    const file = normalize(join(ROOT, p));
    if (file.startsWith(ROOT)) {
      try {
        const data = await readFile(file);
        res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
        res.end(data);
        return;
      } catch { /* static file nei — addon handler-e jabe */ }
    }
    if (!req.headers['x-forwarded-proto']) req.headers['x-forwarded-proto'] = 'http';
    await handler(req, res);
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e?.message || e));
  }
});

server.listen(PORT, () => {
  console.log(`DhakaFlix addon cholche: http://localhost:${PORT}`);
  console.log(`Manifest: http://localhost:${PORT}/manifest.json`);
  console.log('Bondho korte Ctrl+C chapou. Ei window khula rakhte hobe.');
});
