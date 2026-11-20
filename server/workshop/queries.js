import { availableActions, routingActions } from './rules.js';
import { requireValue } from './validation.js';

export function createWorkshopQueries({ all, get }, inventory) {
  const requestSelect = `SELECT r.id, r.vehicle_id, r.description, r.priority, r.preferred_date, r.appointment,
    r.status AS request_status, r.created_at, v.model, v.plate, v.vin, v.mileage, v.client_id,
    c.name AS client_name, c.phone AS client_phone, o.id AS order_id, o.status AS work_status,
    CASE WHEN p.space_id IS NOT NULL THEN 'waiting_parts' ELSE COALESCE(o.status,r.status) END AS status,
    p.space_id AS parking_space, p.reason AS parking_reason, p.expected_date AS parts_expected_date,
    o.mechanic_id, m.name AS mechanic_name, o.bay_id, b.name AS bay_name, o.work_instructions,
    o.pause_reason, o.eta, o.estimate_version, o.inspection_note, o.intake_note,
    EXISTS(SELECT 1 FROM orders active WHERE active.mechanic_id=o.mechanic_id
      AND active.bay_id IS NOT NULL AND active.status <> 'paused' AND active.id<>o.id) AS mechanic_busy
    FROM service_requests r JOIN vehicles v ON v.id=r.vehicle_id JOIN accounts c ON c.id=v.client_id
    LEFT JOIN orders o ON o.request_id=r.id LEFT JOIN accounts m ON m.id=o.mechanic_id
    LEFT JOIN bays b ON b.id=o.bay_id LEFT JOIN parking_assignments p ON p.order_id=o.id`;

  function getRequest(id) {
    return get(requestSelect + ' WHERE r.id=?', id);
  }

  function permitted(user, row) {
    return row && (user.role === 'advisor' || (user.role === 'client' && row.client_id === user.id)
      || (user.role === 'mechanic' && (row.mechanic_id === user.id
        || get('SELECT 1 FROM work_reports WHERE order_id=? AND mechanic_id=? LIMIT 1', row.order_id, user.id))));
  }

  const estimateRows = row => row.order_id ? all(`SELECT id, service_id, part_id, name, quantity, unit_price
    FROM estimate_lines WHERE order_id=? AND version=? ORDER BY id`, row.order_id, row.estimate_version) : [];
  const recordedPayments = row => row.order_id
    ? all('SELECT id, amount, method, created_at FROM payments WHERE order_id=? ORDER BY id', row.order_id) : [];
  function amounts(row) {
    const billable = !['received', 'awaiting_estimate', 'declined'].includes(row.status);
    const estimate = estimateRows(row);
    const payments = recordedPayments(row);
    return { estimate, payments, total: billable ? estimate.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) : 0,
      paid: payments.reduce((sum, payment) => sum + payment.amount, 0) };
  }

  function list(user) {
    const restriction = user.role === 'client' ? 'WHERE v.client_id=?'
      : user.role === 'mechanic' ? 'WHERE o.mechanic_id=? OR EXISTS (SELECT 1 FROM work_reports w WHERE w.order_id=o.id AND w.mechanic_id=?)'
      : '';
    const args = user.role === 'client' ? [user.id] : user.role === 'mechanic' ? [user.id, user.id] : [];
    return all(requestSelect + ' ' + restriction + ' ORDER BY r.id DESC', ...args).map(row => summary(user, row));
  }

  function summary(user, row) {
    const { id, model, plate, status, priority, appointment, created_at, eta, bay_id, parking_space } = row;
    return { id, model, plate, status, priority, appointment, created_at, eta, parking_space,
      ...(user.role !== 'client' ? { bay_id } : {}),
      ...(user.role === 'mechanic' ? { assigned_to_me: row.mechanic_id === user.id } : {}),
      ...(user.role === 'advisor' ? { client_name: row.client_name, mechanic_name: row.mechanic_name,
        routing_actions: routingActions(status) } : {}) };
  }

  function details(user, id) {
    const row = getRequest(id);
    requireValue(permitted(user, row), 'Заявка не найдена.', 404);
    const money = amounts(row);
    const history = all(`SELECT title, note, created_at FROM history
      WHERE request_id=? ${user.role === 'client' ? 'AND is_public=1' : ''}
      ${user.role === 'mechanic' ? "AND title<>'Зарегистрирована оплата'" : ''} ORDER BY id DESC`, id);
    const reports = user.role === 'client' || !row.order_id ? [] : all(`SELECT w.*, a.name AS mechanic,
      (SELECT group_concat(p.name || ' × ' || -s.quantity, ', ') FROM stock_movements s
       JOIN parts p ON p.id=s.part_id WHERE s.report_id=w.id) AS parts
      FROM work_reports w JOIN accounts a ON a.id=w.mechanic_id WHERE w.order_id=? ORDER BY w.id DESC`, row.order_id);
    const stockUsage = row.order_id && user.role !== 'client' ? all(
      `SELECT u.part_id,p.name,SUM(u.quantity) AS quantity FROM order_part_usage u
      JOIN parts p ON p.id=u.part_id WHERE u.order_id=? GROUP BY u.part_id,p.name ORDER BY p.name`, row.order_id,
    ) : [];
    const partsRemaining = {};
    if (user.role === 'mechanic' && row.order_id) {
      for (const { part_id: id, quantity } of money.estimate) {
        if (id) partsRemaining[id] = (partsRemaining[id] || 0) + quantity;
      }
      for (const item of stockUsage) {
        if (Object.hasOwn(partsRemaining, item.part_id)) partsRemaining[item.part_id] -= item.quantity;
      }
    }
    return {
      ...summary(user, row), ...(user.role === 'mechanic'
        ? { estimate: money.estimate.map(({ part_id, name, quantity }) => ({ part_id, name, quantity })), parts_remaining: partsRemaining }
        : money), history, reports,
      description: row.description, preferred_date: row.preferred_date, mileage: row.mileage,
      parking_reason: row.parking_reason, parts_expected_date: row.parts_expected_date,
      ...(user.role === 'mechanic' && row.status === 'paused' && row.mechanic_id === user.id
        ? { resume_blocked: Boolean(row.bay_id && row.mechanic_busy) } : {}),
      visit_note: row.status === 'scheduled' ? history.find(event => event.title === 'Назначен визит')?.note ?? null : null,
      estimate_version: row.estimate_version, actions: availableActions(user, { ...row, ...money }),
      ...(user.role === 'client' ? {} : { order_id: row.order_id, bay_name: row.bay_name, work_instructions: row.work_instructions,
        pause_reason: row.pause_reason, intake_note: row.intake_note, inspection_note: row.inspection_note, stock_usage: stockUsage }),
      ...(user.role === 'advisor' ? { client_phone: row.client_phone, vin: row.vin, mechanic_id: row.mechanic_id,
        tracking_token: get('SELECT token FROM request_tracking WHERE request_id=?', id)?.token } : {}),
    };
  }

  function tracking(token) {
    const record = get('SELECT request_id FROM request_tracking WHERE token=?', token);
    requireValue(record, 'Заявка не найдена.', 404);
    const row = getRequest(record.request_id);
    const { id, model, status, appointment, eta, parking_space, parking_reason, parts_expected_date } = row;
    const visit = status === 'scheduled' && get(`SELECT note FROM history
      WHERE request_id=? AND is_public=1 AND title='Назначен визит' ORDER BY id DESC LIMIT 1`, id);
    return { id, model, status, appointment, eta, parking_space, parking_reason, parts_expected_date, visit_note: visit?.note ?? null };
  }

  function dashboard(user) {
    const result = { user, requests: list(user) };
    if (user.role === 'client') {
      result.vehicles = all('SELECT id, model, plate, mileage FROM vehicles WHERE client_id=? ORDER BY id', user.id);
    } else {
      result.bays = all(`SELECT b.id, b.name, b.id AS number, o.status, o.request_id, o.mechanic_id, v.model, a.name AS mechanic
        FROM bays b LEFT JOIN orders o ON o.bay_id=b.id LEFT JOIN service_requests r ON r.id=o.request_id
        LEFT JOIN vehicles v ON r.vehicle_id=v.id LEFT JOIN accounts a ON a.id=o.mechanic_id ORDER BY b.id`);
      result.parking = all(`SELECT s.id, o.request_id, v.model, v.plate, p.expected_date
        FROM parking_spaces s LEFT JOIN parking_assignments p ON p.space_id=s.id
        LEFT JOIN orders o ON o.id=p.order_id LEFT JOIN service_requests r ON r.id=o.request_id
        LEFT JOIN vehicles v ON v.id=r.vehicle_id ORDER BY s.id`);
      result.parts = user.role === 'advisor' ? all('SELECT * FROM parts ORDER BY id') : [];
      if (user.role === 'advisor') {
        result.clients = all("SELECT id, name, phone FROM accounts WHERE role='client' ORDER BY name,id");
        result.vehicles = all('SELECT id, client_id, model, plate, mileage FROM vehicles ORDER BY model,id');
        result.mechanics = all("SELECT id, name FROM accounts WHERE role='mechanic' ORDER BY id");
        result.services = all('SELECT * FROM services ORDER BY id');
        result.movements = inventory.movements();
        result.supplies = inventory.supplies();
      }
      if (user.role === 'mechanic') {
        result.parts = all(`SELECT DISTINCT p.id, p.name, p.stock FROM parts p
          JOIN estimate_lines l ON l.part_id=p.id JOIN orders o ON o.id=l.order_id AND o.estimate_version=l.version
          WHERE o.mechanic_id=? AND o.status IN ('repair_assigned','repairing','paused') ORDER BY p.id`, user.id);
      }
    }
    return result;
  }

  return { getRequest, permitted, estimateRows, amounts, list, details, dashboard, tracking };
}
