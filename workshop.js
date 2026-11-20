import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const accounts = { advisor: 1, mechanic: 2, client: 3, client2: 4, mechanic2: 5 };
const transitions = {
  schedule: ['advisor', ['new', 'scheduled'], 'Назначен визит'],
  cancel: ['advisor client', ['new', 'scheduled'], 'Заявка отменена'],
  receive: ['advisor', ['scheduled', 'new'], 'Автомобиль принят'],
  diagnose: ['advisor', ['received', 'diagnosis_assigned'], 'Назначена диагностика'],
  startDiagnosis: ['mechanic', ['diagnosis_assigned'], 'Диагностика начата'],
  diagnosisReport: ['mechanic', ['diagnosing'], 'Диагностика завершена'],
  estimate: ['advisor', ['received', 'awaiting_estimate', 'declined', 'awaiting_approval'], 'Смета отправлена на согласование'],
  approve: ['client', ['awaiting_approval'], 'Смета согласована'],
  decline: ['client', ['awaiting_approval'], 'Клиент отклонил смету'],
  assign: ['advisor', ['approved', 'repair_assigned', 'paused'], 'Назначены работы'],
  startRepair: ['mechanic', ['repair_assigned'], 'Ремонт начат'],
  pause: ['mechanic', ['repairing'], 'Ремонт приостановлен'],
  resume: ['mechanic', ['paused'], 'Ремонт возобновлён'],
  repairReport: ['mechanic', ['repairing'], 'Работы переданы на проверку'],
  rework: ['advisor', ['inspection'], 'Назначена доработка'],
  ready: ['advisor', ['inspection'], 'Автомобиль готов к выдаче'],
  release: ['advisor', ['paused'], 'Пост освобождён на время паузы'],
  returnCar: ['advisor', ['declined', 'received', 'awaiting_estimate'], 'Автомобиль готов к возврату'],
  payment: ['advisor', ['ready'], 'Зарегистрирована оплата'],
  issue: ['advisor', ['ready'], 'Автомобиль выдан'],
};

function requireValue(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}

function str(value, label, { optional = false, limit = 1600 } = {}) {
  const clean = typeof value === 'string' ? value.trim() : '';
  requireValue((optional || clean.length > 0) && clean.length <= limit, `Проверьте поле «${label}».`);
  return clean || null;
}

function integer(value, label, min = 1, max = 10_000_000) {
  const number = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
  requireValue(Number.isSafeInteger(number) && number >= min && number <= max, `Проверьте поле «${label}».`);
  return number;
}

function date(value, label, optional = false, time = false) {
  const clean = str(value, label, { optional, limit: 16 });
  if (!clean) return null;
  const re = time ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  const parsed = new Date(time ? clean + ':00Z' : clean + 'T00:00:00Z');
  requireValue(re.test(clean) && Number.isFinite(+parsed) && parsed.toISOString().slice(0, clean.length) === clean,
    `Проверьте поле «${label}».`);
  return clean;
}

export function openWorkshop(file) {
  const db = new DatabaseSync(file);
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  const run = (sql, ...values) => db.prepare(sql).run(...values);
  const all = (sql, ...values) => db.prepare(sql).all(...values);
  const get = (sql, ...values) => db.prepare(sql).get(...values);
  const account = id => get('SELECT * FROM accounts WHERE id = ?', id);
  const profile = role => Object.hasOwn(accounts, role) ? account(accounts[role]) : null;
  let inTransaction = false;
  const transaction = work => {
    if (inTransaction) return work();
    db.exec('BEGIN IMMEDIATE');
    inTransaction = true;
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      inTransaction = false;
    }
  };
  const requestSelect = `SELECT r.id, r.vehicle_id, r.description, r.priority, r.preferred_date, r.appointment,
    r.status AS request_status, r.created_at, v.model, v.plate, v.vin, v.mileage, v.client_id,
    c.name AS client_name, c.phone AS client_phone, o.id AS order_id, COALESCE(o.status,r.status) AS status,
    o.mechanic_id, m.name AS mechanic_name, o.bay_id, b.name AS bay_name, o.work_instructions,
    o.pause_reason, o.eta, o.estimate_version, o.inspection_note, o.intake_note
    FROM service_requests r JOIN vehicles v ON v.id=r.vehicle_id JOIN accounts c ON c.id=v.client_id
    LEFT JOIN orders o ON o.request_id=r.id LEFT JOIN accounts m ON m.id=o.mechanic_id
    LEFT JOIN bays b ON b.id=o.bay_id`;

  function permitted(user, row) {
    return row && (user.role === 'advisor' || (user.role === 'client' && row.client_id === user.id)
      || (user.role === 'mechanic' && (row.mechanic_id === user.id
        || get('SELECT 1 FROM work_reports WHERE order_id=? AND mechanic_id=? LIMIT 1', row.order_id, user.id))));
  }

  function actions(user, row) {
    if (user.role === 'mechanic' && row.mechanic_id !== user.id) return [];
    return Object.entries(transitions).filter(([key, [roles, states]]) => {
      if (!roles.split(' ').includes(user.role) || !states.includes(row.status)) return false;
      if (key === 'payment') return row.total > row.paid;
      if (key === 'release' || key === 'resume') return Boolean(row.bay_id);
      return key !== 'issue' || row.total === row.paid;
    }).map(([key]) => key);
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
    const { id, model, plate, status, priority, appointment, created_at, eta, bay_id } = row;
    return { id, model, plate, status, priority, appointment, created_at, eta,
      ...(user.role !== 'client' ? { bay_id } : {}),
      ...(user.role === 'mechanic' ? { assigned_to_me: row.mechanic_id === user.id } : {}),
      ...(user.role === 'advisor' ? { client_name: row.client_name, mechanic_name: row.mechanic_name } : {}) };
  }

  function details(user, id) {
    const row = get(requestSelect + ' WHERE r.id=?', id);
    requireValue(permitted(user, row), 'Заявка не найдена.', 404);
    const money = amounts(row);
    const history = all(`SELECT title, note, created_at FROM history
      WHERE request_id=? ${user.role === 'client' ? 'AND is_public=1' : ''}
      ${user.role === 'mechanic' ? "AND title<>'Зарегистрирована оплата'" : ''} ORDER BY id DESC`, id);
    const reports = user.role === 'client' || !row.order_id ? [] : all(`SELECT w.*, a.name AS mechanic,
      (SELECT group_concat(p.name || ' × ' || -s.quantity, ', ') FROM stock_movements s
       JOIN parts p ON p.id=s.part_id WHERE s.report_id=w.id) AS parts
      FROM work_reports w JOIN accounts a ON a.id=w.mechanic_id WHERE w.order_id=? ORDER BY w.id DESC`, row.order_id);
    const partsRemaining = {};
    if (user.role === 'mechanic' && row.order_id) {
      for (const { part_id: id, quantity } of money.estimate) {
        if (id) partsRemaining[id] = (partsRemaining[id] || 0) + quantity;
      }
      for (const item of all(`SELECT s.part_id, SUM(s.quantity) AS quantity FROM stock_movements s
        JOIN work_reports w ON w.id=s.report_id WHERE w.order_id=? GROUP BY s.part_id`, row.order_id)) {
        if (Object.hasOwn(partsRemaining, item.part_id)) partsRemaining[item.part_id] += item.quantity;
      }
    }
    return {
      ...summary(user, row), ...(user.role === 'mechanic'
        ? { estimate: money.estimate.map(({ part_id, name, quantity }) => ({ part_id, name, quantity })), parts_remaining: partsRemaining }
        : money), history, reports,
      description: row.description, preferred_date: row.preferred_date, mileage: row.mileage,
      estimate_version: row.estimate_version, actions: actions(user, { ...row, ...money }),
      ...(user.role === 'client' ? {} : { order_id: row.order_id, bay_name: row.bay_name, work_instructions: row.work_instructions,
        pause_reason: row.pause_reason, intake_note: row.intake_note, inspection_note: row.inspection_note }),
      ...(user.role === 'advisor' ? { client_phone: row.client_phone, vin: row.vin, mechanic_id: row.mechanic_id } : {}),
    };
  }

  function dashboard(user) {
    const result = { user, requests: list(user) };
    if (user.role === 'client') {
      result.vehicles = all('SELECT id, model, plate, mileage FROM vehicles WHERE client_id=? ORDER BY id', user.id);
    } else {
      result.bays = all(`SELECT b.id, b.name, b.id AS number, o.status, o.request_id, o.mechanic_id, v.model, a.name AS mechanic
        FROM bays b LEFT JOIN orders o ON o.bay_id=b.id LEFT JOIN service_requests r ON r.id=o.request_id
        LEFT JOIN vehicles v ON r.vehicle_id=v.id LEFT JOIN accounts a ON a.id=o.mechanic_id ORDER BY b.id`);
      result.parts = user.role === 'advisor' ? all('SELECT * FROM parts ORDER BY id') : [];
      if (user.role === 'advisor') {
        result.mechanics = all("SELECT id, name FROM accounts WHERE role='mechanic' ORDER BY id");
        result.services = all('SELECT * FROM services ORDER BY id');
        result.movements = all(`SELECT s.quantity, s.note, s.created_at, p.name, a.name AS employee FROM stock_movements s
          JOIN parts p ON p.id=s.part_id JOIN accounts a ON a.id=s.account_id ORDER BY s.id DESC LIMIT 25`);
      }
      if (user.role === 'mechanic') {
        result.parts = all(`SELECT DISTINCT p.id, p.name, p.stock FROM parts p
          JOIN estimate_lines l ON l.part_id=p.id JOIN orders o ON o.id=l.order_id AND o.estimate_version=l.version
          WHERE o.mechanic_id=? AND o.status IN ('repair_assigned','repairing','paused') ORDER BY p.id`, user.id);
      }
    }
    return result;
  }

  function addHistory(id, user, title, note = null, isPublic = 1) {
    run('INSERT INTO history(request_id,account_id,title,note,is_public) VALUES (?,?,?,?,?)', id, user.id, title, note, isPublic);
  }

  function createRequest(user, input) {
    requireValue(user.role === 'client', 'Оставить заявку может клиент.', 403);
    return transaction(() => {
      let vehicleId;
      if (input.vehicle_id) {
        vehicleId = integer(input.vehicle_id, 'Автомобиль');
        requireValue(get('SELECT id FROM vehicles WHERE id=? AND client_id=?', vehicleId, user.id), 'Автомобиль не найден.', 404);
      } else {
        const model = str(input.model, 'Марка и модель', { limit: 80 });
        const plate = str(input.plate, 'Госномер', { limit: 18 }).toUpperCase().replace(/\s/g, '');
        const vin = str(input.vin, 'VIN', { optional: true, limit: 17 })?.toUpperCase() || null;
        requireValue(!vin || /^[A-HJ-NPR-Z0-9]{17}$/.test(vin), 'VIN должен содержать 17 допустимых символов.');
        requireValue(!get('SELECT id FROM vehicles WHERE client_id=? AND plate=?', user.id, plate), 'Автомобиль с этим госномером уже есть в профиле.');
        vehicleId = run('INSERT INTO vehicles(client_id,model,plate,vin) VALUES (?,?,?,?)', user.id, model, plate, vin).lastInsertRowid;
      }
      const description = str(input.description, 'Что нужно проверить');
      const preferred = date(input.preferred_date, 'Желаемая дата', true);
      const id = run("INSERT INTO service_requests(vehicle_id,description,preferred_date,status) VALUES (?,?,?,'new')",
        vehicleId, description, preferred).lastInsertRowid;
      addHistory(id, user, 'Заявка отправлена', 'Мастер-приёмщик уточнит время визита.');
      return details(user, id);
    });
  }

  function updateOrder(row, status, fields = {}) {
    const changes = { status, ...fields };
    const columns = Object.keys(changes).map(name => `${name}=?`);
    run(`UPDATE orders SET ${columns.join(',')} WHERE id=?`, ...Object.values(changes), row.order_id);
  }

  function assignOrder(row, input, status) {
    const mechanicId = integer(input.mechanic_id, 'Механик');
    const bayId = integer(input.bay_id, 'Пост');
    requireValue(account(mechanicId)?.role === 'mechanic', 'Выберите механика из списка.');
    requireValue(get('SELECT id FROM bays WHERE id=?', bayId), 'Выберите существующий пост.');
    requireValue(!get('SELECT 1 FROM orders WHERE bay_id=? AND id<>?', bayId, row.order_id), 'Этот пост уже занят.', 409);
    requireValue(!get('SELECT 1 FROM orders WHERE mechanic_id=? AND bay_id IS NOT NULL AND id<>?', mechanicId, row.order_id),
      'Механик уже работает на другом посту.', 409);
    updateOrder(row, status, { mechanic_id: mechanicId, bay_id: bayId,
      work_instructions: str(input.instructions, 'Задача и ожидаемый результат'), pause_reason: null });
  }

  function saveReport(user, row, input, kind) {
    const result = str(input.result, 'Результат работы');
    const recommendations = str(input.recommendations, 'Рекомендации', { optional: true });
    const minutes = integer(input.minutes, 'Затрачено минут', 1, 20000);
    const reportId = run('INSERT INTO work_reports(order_id,mechanic_id,kind,result,recommendations,minutes) VALUES (?,?,?,?,?,?)',
      row.order_id, user.id, kind, result, recommendations, minutes).lastInsertRowid;
    if (kind === 'diagnosis') return;
    const approved = new Map();
    for (const line of estimateRows(row)) {
      if (line.part_id) approved.set(line.part_id, (approved.get(line.part_id) || 0) + line.quantity);
    }
    const used = input.parts ?? [];
    requireValue(Array.isArray(used) && used.length <= 20, 'Проверьте список запчастей.');
    for (const item of used) {
      const partId = integer(item?.id, 'Запчасть');
      const quantity = integer(item?.quantity, 'Количество запчастей', 1, 100);
      const previouslyUsed = get(`SELECT COALESCE(SUM(-s.quantity),0) AS qty FROM stock_movements s
        JOIN work_reports w ON w.id=s.report_id WHERE w.order_id=? AND s.part_id=? AND s.quantity<0`,
      row.order_id, partId).qty;
      requireValue(quantity + previouslyUsed <= (approved.get(partId) || 0), 'Расход запчастей превышает согласованное количество.');
      requireValue(run('UPDATE parts SET stock=stock-? WHERE id=? AND stock>=?', quantity, partId, quantity).changes,
        'На складе недостаточно запчастей.', 409);
      run('INSERT INTO stock_movements(part_id,report_id,account_id,quantity) VALUES (?,?,?,?)', partId, reportId, user.id, -quantity);
    }
  }

  function saveEstimate(row, input) {
    requireValue(Array.isArray(input.lines) && input.lines.length > 0 && input.lines.length <= 20, 'Добавьте от 1 до 20 позиций сметы.');
    const version = row.estimate_version + 1;
    for (const line of input.lines) {
      requireValue(line && ['service', 'part', 'custom'].includes(line.kind), 'Выберите тип позиции сметы.');
      const table = line.kind === 'part' ? 'parts' : 'services';
      const catalog = line.kind === 'custom' ? null : get(`SELECT * FROM ${table} WHERE id=?`, integer(line.catalog_id, 'Позиция'));
      requireValue(line.kind === 'custom' || catalog, 'Позиция каталога не найдена.');
      const name = catalog?.name ?? str(line.name, 'Название позиции', { limit: 100 });
      const quantity = integer(line.quantity, 'Количество', 1, 100);
      const price = integer(line.price, 'Цена', 0, 1_000_000);
      run(`INSERT INTO estimate_lines(order_id,version,service_id,part_id,name,quantity,unit_price)
        VALUES (?,?,?,?,?,?,?)`, row.order_id, version, line.kind === 'service' ? catalog.id : null,
      line.kind === 'part' ? catalog.id : null, name, quantity, price);
    }
    updateOrder(row, 'awaiting_approval', { estimate_version: version, eta: date(input.eta, 'Ожидаемая готовность', true, true) });
  }

  function action(user, id, key, input) {
    return transaction(() => {
      const row = get(requestSelect + ' WHERE r.id=?', id);
      requireValue(permitted(user, row), 'Заявка не найдена.', 404);
      const money = amounts(row);
      requireValue(Object.hasOwn(transitions, key) && actions(user, { ...row, ...money }).includes(key),
        'Действие недоступно на текущем этапе или для этого профиля.', 409);
      let note = null;
      switch (key) {
        case 'schedule': {
          const appointment = date(input.appointment, 'Время визита', false, true);
          run("UPDATE service_requests SET status='scheduled',appointment=? WHERE id=?", appointment, id);
          note = `Время визита: ${appointment.replace('T', ' ')}.`;
          break;
        }
        case 'cancel':
          note = str(input.note, 'Причина отмены', { optional: true });
          run("UPDATE service_requests SET status='cancelled' WHERE id=?", id);
          break;
        case 'receive': {
          const mileage = integer(input.mileage, 'Пробег', 0, 5_000_000);
          const priority = input.priority === 'urgent' ? 'urgent' : 'normal';
          const intake = str(input.note, 'Состояние при приёмке', { optional: true });
          run('UPDATE vehicles SET mileage=? WHERE id=?', mileage, row.vehicle_id);
          run("UPDATE service_requests SET status='ordered',priority=? WHERE id=?", priority, id);
          run("INSERT INTO orders(request_id,advisor_id,status,intake_note) VALUES (?,?,'received',?)", id, user.id, intake);
          break;
        }
        case 'diagnose': assignOrder(row, input, 'diagnosis_assigned'); break;
        case 'startDiagnosis': updateOrder(row, 'diagnosing'); break;
        case 'diagnosisReport':
          saveReport(user, row, input, 'diagnosis');
          updateOrder(row, 'awaiting_estimate', { bay_id: null });
          break;
        case 'estimate':
          requireValue(integer(input.version, 'Версия сметы', 0) === row.estimate_version, 'Смета уже изменена. Откройте её заново.', 409);
          saveEstimate(row, input);
          note = str(input.note, 'Сообщение клиенту', { optional: true });
          break;
        case 'approve':
        case 'decline':
          requireValue(integer(input.version, 'Версия сметы') === row.estimate_version, 'Смета уже изменена. Проверьте новую версию.', 409);
          note = key === 'decline' ? str(input.note, 'Причина отказа') : null;
          updateOrder(row, key === 'approve' ? 'approved' : 'declined');
          break;
        case 'assign': assignOrder(row, input, 'repair_assigned'); break;
        case 'startRepair':
        case 'resume': updateOrder(row, 'repairing', { pause_reason: null }); break;
        case 'pause': {
          const reason = str(input.note, 'Причина паузы');
          updateOrder(row, 'paused', { pause_reason: reason });
          addHistory(id, user, 'Внутреннее примечание о паузе', reason, 0);
          break;
        }
        case 'release':
          updateOrder(row, 'paused', { bay_id: null });
          break;
        case 'repairReport':
          saveReport(user, row, input, 'repair');
          updateOrder(row, 'inspection');
          break;
        case 'rework': {
          const instruction = str(input.note, 'Что нужно исправить');
          updateOrder(row, 'repair_assigned', { work_instructions: instruction, inspection_note: instruction });
          addHistory(id, user, 'Комментарий проверки', instruction, 0);
          break;
        }
        case 'ready':
          updateOrder(row, 'ready', { bay_id: null, inspection_note: str(input.note, 'Итог проверки') });
          note = str(input.public_note, 'Сообщение клиенту', { optional: true }) || 'Можно забрать автомобиль в сервисе.';
          break;
        case 'returnCar':
          note = str(input.note, 'Причина возврата');
          updateOrder(row, 'ready', { bay_id: null, estimate_version: 0 });
          break;
        case 'payment': {
          const amount = integer(input.amount, 'Сумма', 1, money.total - money.paid);
          requireValue(['cash', 'card', 'transfer'].includes(input.method), 'Выберите способ оплаты.');
          run('INSERT INTO payments(order_id,amount,method) VALUES (?,?,?)', row.order_id, amount, input.method);
          note = `${amount.toLocaleString('ru-RU')} ₽`;
          break;
        }
        case 'issue':
          requireValue(money.paid === money.total, 'Перед выдачей зарегистрируйте остаток оплаты.', 409);
          updateOrder(row, 'issued', { bay_id: null });
          break;
      }
      addHistory(id, user, transitions[key][2], note, key === 'release' ? 0 : 1);
      return details(user, id);
    });
  }

  function restock(user, input) {
    requireValue(user.role === 'advisor', 'Пополнение доступно мастеру-приёмщику.', 403);
    const id = integer(input.part_id, 'Запчасть');
    const qty = integer(input.quantity, 'Количество', 1, 10000);
    const note = str(input.note, 'Поставщик или накладная');
    return transaction(() => {
      requireValue(run('UPDATE parts SET stock=stock+? WHERE id=?', qty, id).changes, 'Запчасть не найдена.', 404);
      run('INSERT INTO stock_movements(part_id,account_id,quantity,note) VALUES (?,?,?,?)', id, user.id, qty, note);
      return { stock: get('SELECT stock FROM parts WHERE id=?', id).stock };
    });
  }

  function seed() {
    if (get('SELECT 1 FROM accounts LIMIT 1')) return;
    db.exec(`
      INSERT INTO accounts VALUES (1,'advisor','Анна Морозова',NULL),(2,'mechanic','Илья Соколов',NULL),
        (3,'client','Алексей Волков','+7 900 000-01-03'),(4,'client','Мария Орлова','+7 900 000-01-04'),
        (5,'mechanic','Павел Крылов',NULL);
      INSERT INTO vehicles VALUES (1,3,'Volkswagen Golf','А254МК55',NULL,102400),
        (2,3,'Kia Rio','Е803ТС55',NULL,61500),(3,4,'Škoda Octavia','М417СА55',NULL,83400);
      INSERT INTO bays VALUES (1,'Диагностика'),(2,'Слесарный пост'),(3,'Шиномонтаж');
      INSERT INTO services VALUES (1,'Диагностика подвески',1600),(2,'Замена масла',1800),
        (3,'Балансировка колёс',2200),(4,'Замена тормозных колодок',3200);
      INSERT INTO parts VALUES (1,'OIL-5W30','Моторное масло 5W-30, л',24,900),
        (2,'OF-104','Масляный фильтр',8,720),(3,'BP-021','Передние тормозные колодки',6,3400),
        (4,'WW-060','Грузик балансировочный',35,120);
    `);
    const a = account(1), m = account(2), c = account(3), other = account(4);
    const first = createRequest(c, { vehicle_id: 1, description: 'Стук спереди при проезде неровностей. Проверить подвеску.' });
    action(a, first.id, 'receive', { mileage: 102400, note: 'Ключи и автомобиль приняты.' });
    action(a, first.id, 'diagnose', { mechanic_id: 2, bay_id: 1, instructions: 'Проверить переднюю подвеску. В отчёте указать причину стука и рекомендации.' });
    action(m, first.id, 'startDiagnosis', {});
    const second = createRequest(other, { vehicle_id: 3, description: 'Плановая замена моторного масла и фильтра.' });
    action(a, second.id, 'receive', { mileage: 83400 });
    action(a, second.id, 'estimate', { version: 0, lines: [
      { kind: 'service', catalog_id: 2, quantity: 1, price: 1800 },
      { kind: 'part', catalog_id: 1, quantity: 4, price: 900 },
      { kind: 'part', catalog_id: 2, quantity: 1, price: 720 },
    ] });
    action(other, second.id, 'approve', { version: 1 });
    action(a, second.id, 'assign', { mechanic_id: 5, bay_id: 2, instructions: 'Заменить масло и фильтр. Проверить уровень и герметичность.' });
    action(account(5), second.id, 'startRepair', {});
    createRequest(c, { vehicle_id: 2, description: 'Вибрация руля на скорости. Нужна проверка балансировки колёс.' });
  }

  transaction(seed);
  return { profile, list, dashboard, details, createRequest, action, restock, close: () => db.close() };
}
