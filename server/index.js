import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openWorkshop } from './workshop/service.js';
import { body, fail, response } from './http/json.js';
import { changeSession, getSessionUser } from './http/sessions.js';
import { serveFrontend } from './http/static.js';

const port = Number(process.env.PORT || 8765);
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
const workshop = openWorkshop(process.env.WORKSHOP_DB || fileURLToPath(new URL('../data/workshop.sqlite', import.meta.url)));

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'self'; form-action 'self'; object-src 'none'");
  const host = req.headers.host;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return response(res, 400, { error: 'Используйте локальный адрес приложения.' });
  try {
    const path = new URL(req.url, `http://${host}`).pathname;
    if (req.method === 'GET' && serveFrontend(path, res)) return;
    if (path === '/favicon.ico') return res.writeHead(204).end();
    if (req.method === 'POST' && (req.headers['sec-fetch-site'] === 'cross-site'
      || (req.headers.origin && req.headers.origin !== `http://${host}`))) {
      fail(403, 'Запрос должен исходить из приложения.');
    }
    if (req.method === 'POST' && path === '/api/session') {
      return await changeSession(req, res, workshop);
    }
    if (req.method === 'GET' && path === '/api/tracking') {
      const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{48})$/)?.[1];
      if (!token) fail(404, 'Заявка не найдена.');
      return response(res, 200, workshop.tracking(token));
    }
    const user = getSessionUser(req);
    if (!user) {
      if (path.startsWith('/api/')) fail(401, 'Выберите демонстрационный профиль.');
      fail(404, 'Страница не найдена.');
    }
    if (req.method === 'GET' && path === '/api/dashboard') return response(res, 200, workshop.dashboard(user));
    if (req.method === 'POST' && path === '/api/requests') return response(res, 201, workshop.createRequest(user, await body(req)));
    if (req.method === 'POST' && path === '/api/stock') return response(res, 200, workshop.restock(user, await body(req)));
    if (req.method === 'POST' && path === '/api/stock/issue') return response(res, 200, workshop.issueParts(user, await body(req)));
    if (req.method === 'POST' && path === '/api/supplies') return response(res, 201, workshop.orderSupply(user, await body(req)));
    const supplyReceipt = path.match(/^\/api\/supplies\/(\d+)\/receive$/);
    if (req.method === 'POST' && supplyReceipt) {
      return response(res, 200, workshop.receiveSupply(user, Number(supplyReceipt[1]), await body(req)));
    }
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
server.listen(port, '127.0.0.1', () => {
  console.log(`Мастерская: http://127.0.0.1:${port}/`);
  process.send?.('ready');
});
