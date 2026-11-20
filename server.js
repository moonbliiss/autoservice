import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openWorkshop } from './workshop.js';

const port = Number(process.env.PORT || 8765);
mkdirSync(new URL('./data/', import.meta.url), { recursive: true });
const workshop = openWorkshop(process.env.WORKSHOP_DB || fileURLToPath(new URL('./data/workshop.sqlite', import.meta.url)));
const sessions = new Map();
const dist = new URL('./dist/', import.meta.url);
const assetTypes = { js: 'text/javascript', css: 'text/css' };

function staticFile(path) {
  if (path === '/' || path === '/index.html') return ['index.html', 'text/html'];
  if (path === '/garage-map.html') return ['garage-map.html', 'text/html'];
  const asset = /^\/(assets\/[\w-]+\.(js|css))$/.exec(path);
  return asset && [asset[1], assetTypes[asset[2]]];
}

function response(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(payload));
}

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'Отправьте данные в формате JSON.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) fail(413, 'Размер запроса превышает лимит.');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch {}
  fail(400, 'Не удалось прочитать данные формы.');
}

function sessionKey(req) {
  return req.headers.cookie?.match(/(?:^|;\s*)workshop=([a-f0-9]{48})(?:;|$)/)?.[1];
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'self'; form-action 'self'; object-src 'none'");
  const host = req.headers.host;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return response(res, 400, { error: 'Используйте локальный адрес приложения.' });
  try {
    const path = new URL(req.url, `http://${host}`).pathname;
    const page = req.method === 'GET' && staticFile(path);
    if (page) {
      const [file, mime] = page;
      let content;
      try {
        content = readFileSync(new URL(file, dist));
      } catch (error) {
        if (error.code === 'ENOENT') fail(404, 'Файл приложения не найден. Запустите npm start.');
        throw error;
      }
      res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      return res.end(content);
    }
    if (path === '/favicon.ico') return res.writeHead(204).end();
    if (req.method === 'POST' && (req.headers['sec-fetch-site'] === 'cross-site'
      || (req.headers.origin && req.headers.origin !== `http://${host}`))) {
      fail(403, 'Запрос должен исходить из приложения.');
    }
    const key = sessionKey(req);
    if (req.method === 'POST' && path === '/api/session') {
      const { profile } = await body(req);
      const selected = workshop.profile(profile);
      if (!selected) fail(400, 'Выберите профиль.');
      if (key) sessions.delete(key);
      const now = Date.now();
      for (const [id, entry] of sessions) if (entry.expires < now) sessions.delete(id);
      const id = randomBytes(24).toString('hex');
      sessions.set(id, { user: selected, expires: now + 86400000 });
      return response(res, 200, { user: selected },
        { 'Set-Cookie': `workshop=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400` });
    }
    const session = key && sessions.get(key);
    if (!session || session.expires < Date.now()) {
      if (path.startsWith('/api/')) fail(401, 'Выберите демонстрационный профиль.');
      fail(404, 'Страница не найдена.');
    }
    const { user } = session;
    if (req.method === 'GET' && path === '/api/dashboard') return response(res, 200, workshop.dashboard(user));
    if (req.method === 'POST' && path === '/api/requests') return response(res, 201, workshop.createRequest(user, await body(req)));
    if (req.method === 'POST' && path === '/api/stock') return response(res, 200, workshop.restock(user, await body(req)));
    const request = path.match(/^\/api\/requests\/(\d+)(?:\/([a-zA-Z]+))?$/);
    if (request && req.method === 'GET' && !request[2]) {
      return response(res, 200, workshop.details(user, Number(request[1])));
    }
    if (request && req.method === 'POST' && request[2]) {
      const data = await body(req);
      return response(res, 200, workshop.action(user, Number(request[1]), request[2], data));
    }
    fail(404, 'Страница не найдена.');
  } catch (error) {
    if (!error.status) console.error(error);
    return response(res, error.status || 500, { error: error.status ? error.message : 'Ошибка сервера. Повторите попытку.' });
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Мастерская: http://127.0.0.1:${port}/`));
