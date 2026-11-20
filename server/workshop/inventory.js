import { date, integer, requireValue, str } from './validation.js';

export function createInventory({ all, get, run, transaction }) {
  function requireAdvisor(user) {
    requireValue(user.role === 'advisor', 'Закупки и приёмка доступны мастеру-приёмщику.', 403);
  }

  function addStock(user, partId, quantity, note) {
    requireValue(run('UPDATE parts SET stock=stock+? WHERE id=?', quantity, partId).changes, 'Запчасть не найдена.', 404);
    return run('INSERT INTO stock_movements(part_id,account_id,quantity,note) VALUES (?,?,?,?)',
      partId, user.id, quantity, note).lastInsertRowid;
  }

  function restock(user, input) {
    requireAdvisor(user);
    const id = integer(input.part_id, 'Запчасть');
    const quantity = integer(input.quantity, 'Количество', 1, 10000);
    const note = str(input.note, 'Поставщик или накладная');
    return transaction(() => {
      addStock(user, id, quantity, note);
      return { stock: get('SELECT stock FROM parts WHERE id=?', id).stock };
    });
  }

  function orderSupply(user, input) {
    requireAdvisor(user);
    const quantity = integer(input.quantity, 'Количество', 1, 10000);
    const supplier = str(input.supplier, 'Поставщик', { limit: 120 });
    const expectedDate = date(input.expected_date, 'Ожидаемая поставка', true);
    const requestId = input.request_id ? integer(input.request_id, 'Заявка') : null;
    return transaction(() => {
      if (requestId !== null) {
        const request = get(`SELECT COALESCE(o.status,r.status) AS status FROM service_requests r
          LEFT JOIN orders o ON o.request_id=r.id WHERE r.id=?`, requestId);
        requireValue(request, 'Заявка не найдена.', 404);
        requireValue(!['cancelled', 'ready', 'issued'].includes(request.status), 'Для этой заявки закупка уже недоступна.', 409);
      }
      let partId;
      if (input.part_id === 'new') {
        const sku = str(input.sku, 'Артикул', { limit: 40 }).toUpperCase();
        const name = str(input.name, 'Название детали', { limit: 100 });
        const price = integer(input.price, 'Цена за единицу', 0, 1_000_000);
        requireValue(!get('SELECT id FROM parts WHERE UPPER(sku)=?', sku), 'Этот артикул уже есть. Выберите его в списке.', 409);
        partId = run('INSERT INTO parts(sku,name,stock,price) VALUES (?,?,0,?)', sku, name, price).lastInsertRowid;
      } else {
        partId = integer(input.part_id, 'Запчасть');
        requireValue(get('SELECT id FROM parts WHERE id=?', partId), 'Запчасть не найдена.', 404);
      }
      const id = run('INSERT INTO part_supplies(part_id,request_id,supplier,quantity,expected_date) VALUES (?,?,?,?,?)',
        partId, requestId, supplier, quantity, expectedDate).lastInsertRowid;
      return { id };
    });
  }

  function receiveSupply(user, id, input) {
    requireAdvisor(user);
    const quantity = integer(input.quantity, 'Поступило', 1, 10000);
    const document = str(input.note, 'Накладная', { optional: true, limit: 120 });
    return transaction(() => {
      const supply = get('SELECT part_id,supplier,quantity,received FROM part_supplies WHERE id=?', id);
      requireValue(supply, 'Поставка не найдена.', 404);
      requireValue(quantity <= supply.quantity - supply.received, 'Поступление превышает остаток поставки.', 409);
      const movementId = addStock(user, supply.part_id, quantity, document || supply.supplier);
      run('INSERT INTO supply_receipts(movement_id,supply_id) VALUES (?,?)', movementId, id);
      run('UPDATE part_supplies SET received=received+? WHERE id=?', quantity, id);
      return { received: supply.received + quantity };
    });
  }

  function consumeParts(user, orderId, estimate, items, reportId = null) {
    requireValue(Array.isArray(items) && items.length <= 20, 'Проверьте список запчастей.');
    const approved = new Map();
    for (const line of estimate) {
      if (line.part_id) approved.set(line.part_id, (approved.get(line.part_id) || 0) + line.quantity);
    }
    for (const item of items) {
      const partId = integer(item?.id, 'Запчасть');
      const quantity = integer(item?.quantity, 'Количество запчастей', 1, 100);
      const { used } = get(`SELECT COALESCE(SUM(quantity),0) AS used
        FROM order_part_usage WHERE order_id=? AND part_id=?`, orderId, partId);
      requireValue(quantity + used <= (approved.get(partId) || 0), 'Расход запчастей превышает согласованное количество.');
      requireValue(run('UPDATE parts SET stock=stock-? WHERE id=? AND stock>=?', quantity, partId, quantity).changes,
        'На складе недостаточно запчастей.', 409);
      const movementId = run('INSERT INTO stock_movements(part_id,report_id,account_id,quantity) VALUES (?,?,?,?)',
        partId, reportId, user.id, -quantity).lastInsertRowid;
      if (reportId === null) run('INSERT INTO repair_stock_issues(movement_id,order_id) VALUES (?,?)', movementId, orderId);
    }
  }

  function supplies() {
    return all(`SELECT s.*,p.name,p.sku FROM part_supplies s JOIN parts p ON p.id=s.part_id
      ORDER BY (s.received=s.quantity),s.id DESC`);
  }

  function movements() {
    return all(`SELECT s.id,s.quantity,s.note,s.created_at,p.name,a.name AS employee,
      receipts.supply_id, COALESCE(o.request_id,supply.request_id) AS request_id
      FROM stock_movements s JOIN parts p ON p.id=s.part_id JOIN accounts a ON a.id=s.account_id
      LEFT JOIN order_part_usage usage ON usage.movement_id=s.id LEFT JOIN orders o ON o.id=usage.order_id
      LEFT JOIN supply_receipts receipts ON receipts.movement_id=s.id
      LEFT JOIN part_supplies supply ON supply.id=receipts.supply_id
      ORDER BY s.id DESC LIMIT 25`);
  }

  return { restock, orderSupply, receiveSupply, consumeParts, supplies, movements };
}
