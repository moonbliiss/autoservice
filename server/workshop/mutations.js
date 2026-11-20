import { availableActions, transitions } from './rules.js';
import { date, integer, requireValue, str } from './validation.js';

export function createWorkshopMutations({ run, get, transaction }, queries, account) {
  const { amounts, details, estimateRows, getRequest, permitted } = queries;

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
      const row = getRequest(id);
      requireValue(permitted(user, row), 'Заявка не найдена.', 404);
      const money = amounts(row);
      requireValue(Object.hasOwn(transitions, key) && availableActions(user, { ...row, ...money }).includes(key),
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

  return { createRequest, action, restock };
}
