import { readFileSync } from 'node:fs';
import { fail } from './json.js';

const dist = new URL('../../dist/', import.meta.url);
const assetTypes = { js: 'text/javascript', css: 'text/css' };

function staticFile(path) {
  if (path === '/' || path === '/index.html' || path === '/garage-map.html') return ['index.html', 'text/html'];
  const asset = /^\/(assets\/[\w-]+\.(js|css))$/.exec(path);
  return asset && [asset[1], assetTypes[asset[2]]];
}

export function serveFrontend(path, res) {
  const page = staticFile(path);
  if (!page) return false;
  const [file, mime] = page;
  let content;
  try {
    content = readFileSync(new URL(file, dist));
  } catch (error) {
    if (error.code === 'ENOENT') fail(404, 'Файл приложения не найден. Запустите npm start.');
    throw error;
  }
  res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-cache' });
  res.end(content);
  return true;
}
