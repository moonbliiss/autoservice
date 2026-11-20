export function response(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(payload));
}

export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

export async function body(req) {
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
