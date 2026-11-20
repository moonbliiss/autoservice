import { createWarehousePart, findPartByNumber, partNumber } from './partNumbers.js';
import { date, integer, requireValue, str } from './validation.js';

export function createInventory({ all, get, run, transaction }) {
  const issueStages = ['repair_assigned', 'repairing'];
  const canIssue = order => issueStages.includes(order.work_status) && Boolean(order.mechanic_id && order.bay_id);

  function requireStockkeeper(user) {
    requireValue(user.role === 'stockkeeper', 'Складские операции выполняет запчастист.', 403);
  }

  function addStock(user, partId, quantity, note) {
    requireValue(run('UPDATE parts SET stock=stock+? WHERE id=?', quantity, partId).changes, 'Запчасть не найдена.', 404);
    return run('INSERT INTO stock_movements(part_id,account_id,quantity,note) VALUES (?,?,?,?)',
      partId, user.id, quantity, note).lastInsertRowid;
  }

  function restock(user, input) {
    requireStockkeeper(user);
    const quantity = integer(input.quantity, 'Количество', 1, 10000);
    const note = str(input.note, 'Поставщик или накладная');
    return transaction(() => {
      const id = input.part_id === 'new' ? createWarehousePart({ get, run }, input) : integer(input.part_id, 'Запчасть');
      addStock(user, id, quantity, note);
      return { stock: get('SELECT stock FROM parts WHERE id=?', id).stock };
    });
  }

  function setPartNumber(user, id, input) {
    requireStockkeeper(user);
    const sku = partNumber(input.sku);
    return transaction(() => {
      const existing = findPartByNumber(get, sku);
      requireValue(!existing || existing.id === id, 'Этот артикул уже используется для другой детали.', 409);
      requireValue(run('UPDATE parts SET sku=? WHERE id=?', sku, id).changes, 'Запчасть не найдена.', 404);
      return { sku };
    });
  }

  function orderSupply(user, input) {
    requireStockkeeper(user);
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
      const partId = input.part_id === 'new'
        ? createWarehousePart({ get, run }, input) : integer(input.part_id, 'Запчасть');
      requireValue(get('SELECT id FROM parts WHERE id=?', partId), 'Запчасть не найдена.', 404);
      const id = run('INSERT INTO part_supplies(part_id,request_id,supplier,quantity,expected_date) VALUES (?,?,?,?,?)',
        partId, requestId, supplier, quantity, expectedDate).lastInsertRowid;
      return { id };
    });
  }

  function receiveSupply(user, id, input) {
    requireStockkeeper(user);
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

  function issueParts(user, input) {
    requireStockkeeper(user);
    const requestId = integer(input.request_id, 'Заявка');
    const partId = integer(input.part_id, 'Запчасть');
    const quantity = integer(input.quantity, 'Количество запчастей', 1, 2000);
    return transaction(() => {
      const order = get(`SELECT id, status AS work_status, mechanic_id, bay_id
        FROM orders WHERE request_id=?`, requestId);
      requireValue(order, 'Заказ-наряд не найден.', 404);
      requireValue(canIssue(order), 'Выдача доступна, когда автомобиль назначен механику на пост для ремонта.', 409);
      const { approved } = get(`SELECT COALESCE(SUM(quantity),0) AS approved FROM work_order_document_lines
        WHERE order_id=? AND decision='approved' AND part_id=?`, order.id, partId);
      const { used } = get(`SELECT COALESCE(SUM(quantity),0) AS used
        FROM order_part_usage WHERE order_id=? AND part_id=?`, order.id, partId);
      requireValue(quantity + used <= approved, 'Выдача превышает согласованное количество по заказ-нарядам.', 409);
      requireValue(run('UPDATE parts SET stock=stock-? WHERE id=? AND stock>=?', quantity, partId, quantity).changes,
        'На складе недостаточно запчастей.', 409);
      const movementId = run('INSERT INTO stock_movements(part_id,account_id,quantity) VALUES (?,?,?)',
        partId, user.id, -quantity).lastInsertRowid;
      run('INSERT INTO repair_stock_issues(movement_id,order_id) VALUES (?,?)', movementId, order.id);
      run('INSERT INTO history(request_id,account_id,title,note,is_public) VALUES (?,?,?,?,0)', requestId, user.id,
        'Запчасти выданы со склада', `${get('SELECT name FROM parts WHERE id=?', partId).name} × ${quantity}`);
      return { issued: used + quantity };
    });
  }

  function needs() {
    const rows = all(`SELECT o.request_id,o.bay_id,o.mechanic_id,o.status AS work_status,a.name AS mechanic,
      CASE WHEN transfer.id IS NOT NULL THEN 'transfer_pending' WHEN parking.space_id IS NOT NULL AND ep.order_id IS NULL THEN 'waiting_parts'
        ELSE o.status END AS status,
      v.model,v.plate,p.id AS part_id,CASE WHEN p.id IS NULL THEN e.id END AS unclassified_line_id,
      COALESCE(p.name,e.name) AS name,p.sku,COALESCE(p.stock,0) AS stock,SUM(e.quantity) AS required,
      SUM(CASE WHEN e.decision='approved' THEN e.quantity ELSE 0 END) AS approved,
      SUM(CASE WHEN e.decision='pending' THEN e.quantity ELSE 0 END) AS pending,
      JSON_GROUP_ARRAY(DISTINCT e.document_title) AS document_titles,
      COALESCE((SELECT SUM(u.quantity) FROM order_part_usage u WHERE u.order_id=o.id AND u.part_id=p.id),0) AS issued,
      COALESCE((SELECT SUM(s.quantity-s.received) FROM part_supplies s
        WHERE s.request_id=o.request_id AND s.part_id=p.id AND s.received<s.quantity),0) AS incoming
      FROM orders o JOIN service_requests r ON r.id=o.request_id JOIN vehicles v ON v.id=r.vehicle_id
      JOIN work_order_document_lines e ON e.order_id=o.id AND e.decision<>'declined'
      LEFT JOIN parts p ON p.id=e.part_id
      LEFT JOIN accounts a ON a.id=o.mechanic_id LEFT JOIN parking_assignments parking ON parking.order_id=o.id
      LEFT JOIN estimate_parking ep ON ep.order_id=o.id
      LEFT JOIN parking_transfers transfer ON transfer.order_id=o.id
      WHERE o.status NOT IN ('ready','issued') AND (p.id IS NOT NULL OR e.unclassified=1)
      GROUP BY o.id,p.id,unclassified_line_id HAVING approved>issued OR pending>0
      ORDER BY (o.status IN ('repair_assigned','repairing') AND o.bay_id IS NOT NULL) DESC, o.request_id,name`);
    return rows.map(({ work_status, mechanic_id, document_titles, ...row }) => {
      const approved_remaining = Math.max(0, row.approved - row.issued);
      return { ...row, document_titles: JSON.parse(document_titles), approved_remaining,
        can_issue: row.part_id !== null && approved_remaining > 0 && canIssue({ ...row, work_status, mechanic_id }) };
    });
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
      ORDER BY s.id DESC`);
  }

  return { restock, setPartNumber, orderSupply, receiveSupply, issueParts, needs, supplies, movements };
}
