// tiny static server for local preview of v2/
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve('v2'), T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!f.startsWith(root)) return s.writeHead(403).end(); fs.readFile(f, (e, b) => e ? s.writeHead(404).end() : s.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(b)); }).listen(5181);
