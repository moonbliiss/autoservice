import { randomBytes } from 'node:crypto';
import { body, fail, response } from './json.js';

const sessions = new Map();

function sessionKey(req) {
  return req.headers.cookie?.match(/(?:^|;\s*)workshop=([a-f0-9]{48})(?:;|$)/)?.[1];
}

export async function changeSession(req, res, workshop) {
  const { profile } = await body(req);
  const selected = workshop.profile(profile);
  if (!selected) fail(400, 'Выберите профиль.');
  const key = sessionKey(req);
  if (key) sessions.delete(key);
  const now = Date.now();
  for (const [id, entry] of sessions) if (entry.expires < now) sessions.delete(id);
  const id = randomBytes(24).toString('hex');
  sessions.set(id, { user: selected, expires: now + 86400000 });
  return response(res, 200, { user: selected },
    { 'Set-Cookie': `workshop=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400` });
}

export function getSessionUser(req) {
  const session = sessions.get(sessionKey(req));
  return session && session.expires >= Date.now() ? session.user : null;
}
