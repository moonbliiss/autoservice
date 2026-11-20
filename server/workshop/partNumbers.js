import { integer, requireValue, str } from './validation.js';

export function partNumber(input) {
  return str(input, 'Артикул производителя', { limit: 40 }).toUpperCase();
}

export function findPartByNumber(get, sku) {
  return get('SELECT id FROM parts WHERE UPPER(TRIM(sku))=? ORDER BY id LIMIT 1', sku);
}

export function createWarehousePart({ get, run }, input) {
  const sku = partNumber(input.sku);
  const name = str(input.name, 'Название детали', { limit: 100 });
  const price = integer(input.price, 'Цена за единицу', 0, 1_000_000);
  requireValue(!findPartByNumber(get, sku), 'Этот артикул уже есть. Выберите деталь в списке.', 409);
  return run('INSERT INTO parts(sku,name,stock,price) VALUES (?,?,0,?)', sku, name, price).lastInsertRowid;
}
