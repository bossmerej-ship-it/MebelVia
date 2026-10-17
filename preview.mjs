import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)),'dist');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (pathname === '/__preview/mobile') {
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
      res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><title>MebelVia — проверка узкого экрана</title><style>body{margin:0;background:#e9e5df;display:grid;place-items:center;min-height:100vh}iframe{display:block;border:0;width:390px;height:680px;background:#fdfcf9}</style><iframe src="/" title="MebelVia — экран 390 пикселей"></iframe></html>');
      return;
    }
    const file = resolve(root,pathname === '/' ? 'index.html' : `.${pathname}`);
    if (!file.startsWith(root + sep)) {res.writeHead(403);res.end();return;}
    const data = await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)] || 'application/octet-stream','Cache-Control':'no-cache'});
    res.end(data);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(4173,'127.0.0.1',() => console.log('Local: http://127.0.0.1:4173'));
