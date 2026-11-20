import { availableActions, routingActions, transitions } from './rules.js';
import { requireValue } from './validation.js';

const technicalEvents = ['diagnose', 'startDiagnosis', 'diagnosisReport', 'assign', 'moveBay', 'park',
  'startRepair', 'pause', 'resume', 'repairReport', 'rework', 'release', 'dispatchTransfer', 'cancelTransfer', 'completeTransfer'].map(key => transitions[key][2]);
technicalEvents.push('Внутреннее примечание о паузе', 'Комментарий проверки', 'Запчасти выданы со склада');
const fullRequestAccess = role => role === 'advisor' || role === 'manager';
const assignedTo = (user, row) => (row.transfer_mechanic_id ?? row.mechanic_id) === user.id && Boolean(row.bay_id || row.parking_space || row.status === 'paused');

export function createWorkshopQueries({ all, get }, inventory, workTime) {
  const requestSelect = `SELECT r.id, r.vehicle_id, r.description, r.priority, r.preferred_date, r.appointment,
    r.status AS request_status, r.created_at, v.model, v.plate, v.vin, v.mileage, v.client_id,
    c.name AS client_name, c.phone AS client_phone, o.id AS order_id, o.status AS work_status,
    CASE WHEN t.id IS NOT NULL THEN 'transfer_pending' WHEN p.space_id IS NOT NULL THEN 'waiting_parts'
      ELSE COALESCE(o.status,r.status) END AS status,
    t.id AS transfer_id,t.bay_id AS transfer_bay_id,tb.name AS transfer_bay_name,t.mechanic_id AS transfer_mechanic_id,
    tm.name AS transfer_mechanic_name,t.instructions AS transfer_instructions,
    p.space_id AS parking_space, p.reason AS parking_reason, p.expected_date AS parts_expected_date,
    arrival.space_id AS arrival_space,
    o.mechanic_id, m.name AS mechanic_name, o.bay_id, b.name AS bay_name, o.work_instructions,
    o.pause_reason, o.eta, o.estimate_version, o.inspection_note, o.intake_note,
    (EXISTS(SELECT 1 FROM orders active WHERE active.mechanic_id=o.mechanic_id
      AND active.bay_id IS NOT NULL AND active.status <> 'paused' AND active.id<>o.id)
      OR EXISTS(SELECT 1 FROM parking_transfers active WHERE active.mechanic_id=o.mechanic_id AND active.order_id<>o.id)) AS mechanic_busy
    FROM service_requests r JOIN vehicles v ON v.id=r.vehicle_id JOIN accounts c ON c.id=v.client_id
    LEFT JOIN orders o ON o.request_id=r.id LEFT JOIN accounts m ON m.id=o.mechanic_id
    LEFT JOIN bays b ON b.id=o.bay_id LEFT JOIN parking_assignments p ON p.order_id=o.id
    LEFT JOIN parking_transfers t ON t.order_id=o.id LEFT JOIN bays tb ON tb.id=t.bay_id
    LEFT JOIN accounts tm ON tm.id=t.mechanic_id LEFT JOIN arrival_parking arrival ON arrival.request_id=r.id`;

  function getRequest(id) {
    return get(requestSelect + ' WHERE r.id=?', id);
  }

  function permitted(user, row) {
    return row && (fullRequestAccess(user.role) || (user.role === 'client' && row.client_id === user.id)
      || (user.role === 'mechanic' && (assignedTo(user, row)
        || get('SELECT 1 FROM work_reports WHERE order_id=? AND mechanic_id=? LIMIT 1', row.order_id, user.id))));
  }

  const recordedPayments = row => row.order_id
    ? all('SELECT id, amount, method, created_at FROM payments WHERE order_id=? ORDER BY id', row.order_id) : [];
  function amounts(row) {
    const documents = new Map();
    const estimate = [];
    const rows = row.order_id ? all(`SELECT id,service_id,part_id,name,quantity,unit_price,unclassified,
      version,decision,document_title FROM work_order_document_lines WHERE order_id=? ORDER BY version,id`, row.order_id) : [];
    for (const { version, decision, document_title, ...line } of rows) {
      if (!documents.has(version)) documents.set(version, {
        version, title: document_title, status: decision, lines: [], total: 0,
      });
      const document = documents.get(version);
      document.lines.push(line);
      document.total += line.quantity * line.unit_price;
      if (decision === 'approved') estimate.push(line);
    }
    const work_orders = [...documents.values()];
    const payments = recordedPayments(row);
    const total = work_orders.reduce((sum, document) => sum + (document.status === 'approved' ? document.total : 0), 0);
    return { estimate, work_orders, payments, total,
      paid: payments.reduce((sum, payment) => sum + payment.amount, 0) };
  }

  function list(user) {
    if (user.role === 'stockkeeper') return [];
    const restriction = user.role === 'client' ? 'WHERE v.client_id=?'
      : user.role === 'mechanic' ? `WHERE (COALESCE(t.mechanic_id,o.mechanic_id)=? AND (o.bay_id IS NOT NULL OR p.space_id IS NOT NULL OR o.status='paused'))
        OR EXISTS (SELECT 1 FROM work_reports w WHERE w.order_id=o.id AND w.mechanic_id=?)`
      : '';
    const args = user.role === 'client' ? [user.id] : user.role === 'mechanic' ? [user.id, user.id] : [];
    return all(requestSelect + ' ' + restriction + ' ORDER BY r.id DESC', ...args).map(row => summary(user, row));
  }

  function summary(user, row) {
    const { id, model, plate, status, priority, appointment, created_at, eta, bay_id, parking_space } = row;
    const mechanic = user.role === 'mechanic';
    const assigned = mechanic && assignedTo(user, row);
    const past = mechanic && !assigned;
    return { id, model, plate, status, priority, appointment: mechanic ? null : appointment, created_at,
      eta: past ? null : eta, parking_space: past ? null : parking_space,
      ...(!mechanic ? { arrival_space: row.arrival_space } : {}),
      ...(user.role !== 'client' ? { bay_id: past ? null : bay_id } : {}),
      ...(mechanic ? { assigned_to_me: assigned } : {}),
      ...((fullRequestAccess(user.role) || assigned) && ['diagnosing', 'repairing', 'paused'].includes(status)
        ? { work_timer: workTime.current(row.order_id, row.mechanic_id, status === 'diagnosing' ? 'diagnosis' : 'repair') } : {}),
      ...(fullRequestAccess(user.role) ? { client_name: row.client_name, mechanic_name: row.mechanic_name } : {}),
      ...(fullRequestAccess(user.role) && status === 'issued' ? { issued_at: get(`SELECT created_at FROM history
        WHERE request_id=? AND title=? ORDER BY id DESC LIMIT 1`, id, transitions.issue[2])?.created_at ?? null } : {}),
      ...(fullRequestAccess(user.role) ? { routing_actions: routingActions(user.role, status) } : {}),
      ...(row.transfer_id && (fullRequestAccess(user.role) || assigned) ? { transfer: {
        id: row.transfer_id, bay_id: row.transfer_bay_id, bay_name: row.transfer_bay_name,
        mechanic_id: row.transfer_mechanic_id, mechanic_name: row.transfer_mechanic_name,
        instructions: row.transfer_instructions,
      } } : {}) };
  }

  function details(user, id) {
    const row = getRequest(id);
    requireValue(permitted(user, row), 'Заявка не найдена.', 404);
    const mechanic = user.role === 'mechanic';
    const pastAssignment = mechanic && !assignedTo(user, row);
    const money = amounts(row);
    const history = pastAssignment ? [] : all(`SELECT title, note, created_at FROM history
      WHERE request_id=? ${user.role === 'client' ? 'AND is_public=1' : ''}
      ${mechanic ? `AND title IN (${technicalEvents.map(() => '?').join(',')})` : ''} ORDER BY id DESC`,
    id, ...(mechanic ? technicalEvents : []));
    const reports = user.role === 'client' || !row.order_id ? [] : all(`SELECT w.*, a.name AS mechanic,
      (SELECT SUM(t.stopped_at-t.started_at) FROM work_periods t WHERE t.report_id=w.id) AS elapsed_ms,
      (SELECT group_concat(p.name || ' × ' || -s.quantity, ', ') FROM stock_movements s
       JOIN parts p ON p.id=s.part_id WHERE s.report_id=w.id) AS parts
      FROM work_reports w JOIN accounts a ON a.id=w.mechanic_id WHERE w.order_id=?
      ${pastAssignment ? 'AND w.mechanic_id=?' : ''} ORDER BY w.id DESC`, row.order_id, ...(pastAssignment ? [user.id] : []));
    const stockUsage = row.order_id && user.role !== 'client' && !pastAssignment ? all(
      `SELECT u.part_id,p.name,SUM(u.quantity) AS quantity FROM order_part_usage u
      JOIN parts p ON p.id=u.part_id WHERE u.order_id=? GROUP BY u.part_id,p.name ORDER BY p.name`, row.order_id,
    ) : [];
    const partsRemaining = {};
    if (mechanic && !pastAssignment && row.order_id) {
      for (const { part_id: id, quantity } of money.estimate) {
        if (id) partsRemaining[id] = (partsRemaining[id] || 0) + quantity;
      }
      for (const item of stockUsage) {
        if (Object.hasOwn(partsRemaining, item.part_id)) partsRemaining[item.part_id] -= item.quantity;
      }
    }
    return {
      ...summary(user, row), ...(mechanic
        ? { estimate: pastAssignment ? [] : money.estimate.map(({ part_id, name, quantity }) => ({ part_id, name, quantity })),
          work_orders: pastAssignment ? [] : money.work_orders.filter(document => document.status === 'approved')
            .map(({ version, title, status, lines }) => ({
              version, title, status, lines: lines.map(({ id, part_id, name, quantity }) => ({ id, part_id, name, quantity })),
            })),
          parts_remaining: partsRemaining }
        : money), history, reports,
      description: pastAssignment ? null : row.description, preferred_date: mechanic ? null : row.preferred_date, mileage: row.mileage,
      parking_reason: pastAssignment ? null : row.parking_reason, parts_expected_date: pastAssignment ? null : row.parts_expected_date,
      ...(user.role === 'mechanic' && row.status === 'paused' && row.mechanic_id === user.id
        ? { resume_blocked: Boolean(row.bay_id && row.mechanic_busy) } : {}),
      visit_note: row.status === 'scheduled' ? history.find(event => event.title === 'Назначен визит')?.note ?? null : null,
      estimate_version: row.estimate_version, actions: availableActions(user, { ...row, ...money }),
      ...(user.role === 'client' || pastAssignment ? {} : { order_id: row.order_id, bay_name: row.bay_name, work_instructions: row.work_instructions,
        pause_reason: row.pause_reason, intake_note: row.intake_note, inspection_note: row.inspection_note, stock_usage: stockUsage }),
      ...(fullRequestAccess(user.role) ? { client_phone: row.client_phone, vin: row.vin, mechanic_id: row.mechanic_id } : {}),
      ...(fullRequestAccess(user.role) && row.order_id ? { work_totals: workTime.totals(row.order_id) } : {}),
      ...(user.role === 'advisor' ? { tracking_token: get('SELECT token FROM request_tracking WHERE request_id=?', id)?.token } : {}),
    };
  }

  function tracking(token) {
    const record = get('SELECT request_id FROM request_tracking WHERE token=?', token);
    requireValue(record, 'Заявка не найдена.', 404);
    const row = getRequest(record.request_id);
    const { id, model, plate, status, appointment, eta, parking_space, arrival_space, parking_reason, parts_expected_date, description } = row;
    const history = all(`SELECT title,note,created_at FROM history WHERE request_id=? AND is_public=1 ORDER BY id DESC`, id);
    const visitNote = status === 'scheduled' ? history.find(item => item.title === 'Назначен визит')?.note ?? null : null;
    const { work_orders, payments, paid, total } = amounts(row);
    return { id, model, plate, status, appointment, eta, parking_space, arrival_space, parking_reason, parts_expected_date, description,
      history, work_orders: work_orders.map(document => ({
        ...document, lines: document.lines.map(({ name, quantity, unit_price }) => ({ name, quantity, unit_price })),
      })), payments, paid, total, visit_note: visitNote };

  }

  function dashboard(user) {
    const result = { user, requests: list(user) };
    if (user.role === 'client') {
      result.vehicles = all('SELECT id, model, plate, mileage FROM vehicles WHERE client_id=? ORDER BY id', user.id);
      return result;
    }

    if (user.role === 'stockkeeper' || user.role === 'manager') {
      result.parts = all('SELECT * FROM parts ORDER BY id');
      result.movements = inventory.movements();
      result.supplies = inventory.supplies();
      result.warehouse_needs = inventory.needs();
      if (user.role === 'stockkeeper') return result;
    }

    const bays = all(`SELECT b.id, b.name, b.id AS number, o.status, o.request_id, o.mechanic_id, v.model, a.name AS mechanic,
      t.mechanic_id AS reserved_mechanic_id,pending.request_id AS reserved_request_id
      FROM bays b LEFT JOIN orders o ON o.bay_id=b.id LEFT JOIN service_requests r ON r.id=o.request_id
      LEFT JOIN vehicles v ON r.vehicle_id=v.id LEFT JOIN accounts a ON a.id=o.mechanic_id
      LEFT JOIN parking_transfers t ON t.bay_id=b.id LEFT JOIN orders pending ON pending.id=t.order_id ORDER BY b.id`);
    const parking = all(`SELECT s.id, o.request_id, COALESCE(t.mechanic_id,o.mechanic_id) AS mechanic_id, v.model, v.plate, p.expected_date
      FROM parking_spaces s LEFT JOIN parking_assignments p ON p.space_id=s.id
      LEFT JOIN orders o ON o.id=p.order_id LEFT JOIN service_requests r ON r.id=o.request_id
      LEFT JOIN parking_transfers t ON t.order_id=o.id LEFT JOIN vehicles v ON v.id=r.vehicle_id ORDER BY s.id`);
    result.bays = bays.map(bay => {
      const occupied = bay.request_id !== null;
      const reserved = bay.reserved_request_id !== null;
      if (user.role !== 'mechanic' || bay.mechanic_id === user.id || bay.reserved_mechanic_id === user.id) return { ...bay, occupied, reserved };
      return { id: bay.id, name: bay.name, number: bay.number, status: null, request_id: null,
        mechanic_id: null, model: null, mechanic: null, occupied, reserved };
    });
    result.parking = parking.map(({ mechanic_id, ...space }) => {
      const occupied = space.request_id !== null;
      if (user.role !== 'mechanic' || mechanic_id === user.id) return { ...space, occupied };
      return { id: space.id, request_id: null, model: null, plate: null, expected_date: null, occupied };
    });

    if (fullRequestAccess(user.role)) {
      result.clients = all("SELECT id, name, phone FROM accounts WHERE role='client' ORDER BY name,id");
      result.vehicles = all('SELECT id, client_id, model, plate, mileage FROM vehicles ORDER BY model,id');
      result.mechanics = all("SELECT id, name FROM accounts WHERE role='mechanic' ORDER BY id");
      result.services = all('SELECT * FROM services ORDER BY id');
    }
    if (user.role === 'advisor') {
      result.parts = all('SELECT * FROM parts ORDER BY id');
      result.supplies = inventory.supplies().filter(row => row.request_id !== null)
        .map(({ supplier, ...summary }) => summary);
    }
    if (user.role === 'manager') {
      result.staff = all("SELECT id,name,role FROM accounts WHERE role<>'client' ORDER BY role,name");
    }
    return result;
  }

  return { getRequest, permitted, amounts, list, details, dashboard, tracking };
}
