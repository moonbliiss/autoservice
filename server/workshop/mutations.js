import { randomBytes } from 'node:crypto';
import { availableActions, transitions } from './rules.js';
import { date, integer, requireValue, str } from './validation.js';

export function createWorkshopMutations({ run, get, transaction }, queries, account) {
  const { amounts, details, estimateRows, getRequest, permitted } = queries;

  function addHistory(id, user, title, note = null, isPublic = 1) {
    run('INSERT INTO history(request_id,account_id,title,note,is_public) VALUES (?,?,?,?,?)', id, user.id, title, note, isPublic);
  }

  function createRequest(user, input) {
    const advisor = user.role === 'advisor';
    requireValue(advisor || user.role === 'client', 'Создать заявку может клиент или приёмщик.', 403);
    return transaction(() => {
      let clientId = user.id;
      if (advisor) {
        if (input.client_id) {
          clientId = integer(input.client_id, 'Клиент');
          requireValue(account(clientId)?.role === 'client', 'Выберите клиента из списка.');
        } else {
          const name = str(input.client_name, 'Имя клиента', { limit: 100 });
          const phone = str(input.client_phone, 'Телефон клиента', { limit: 40 });
          requireValue(phone.replace(/\D/g, '').length >= 5, 'Укажите номер телефона клиента.');
          clientId = run("INSERT INTO accounts(role,name,phone) VALUES ('client',?,?)", name, phone).lastInsertRowid;
        }
      }
      let vehicleId;
      if (input.vehicle_id) {
        vehicleId = integer(input.vehicle_id, 'Автомобиль');
        requireValue(get('SELECT id FROM vehicles WHERE id=? AND client_id=?', vehicleId, clientId), 'Автомобиль не найден у выбранного клиента.', 404);
      } else {
        const model = str(input.model, 'Марка и модель', { limit: 80 });
        const plate = str(input.plate, 'Госномер', { limit: 18 }).toUpperCase().replace(/\s/g, '');
        const vin = str(input.vin, 'VIN', { optional: true, limit: 17 })?.toUpperCase() || null;
        requireValue(!vin || /^[A-HJ-NPR-Z0-9]{17}$/.test(vin), 'VIN должен содержать 17 допустимых символов.');
        requireValue(!get('SELECT id FROM vehicles WHERE client_id=? AND plate=?', clientId, plate), 'Автомобиль с этим госномером уже есть у клиента.');
        vehicleId = run('INSERT INTO vehicles(client_id,model,plate,vin) VALUES (?,?,?,?)', clientId, model, plate, vin).lastInsertRowid;
      }
      const description = str(input.description, 'Что нужно проверить');
      const preferred = date(input.preferred_date, 'Желаемая дата', true);
      const id = run("INSERT INTO service_requests(vehicle_id,description,preferred_date,status) VALUES (?,?,?,'new')",
        vehicleId, description, preferred).lastInsertRowid;
      if (advisor) run('INSERT INTO request_tracking(request_id,token) VALUES (?,?)', id, randomBytes(24).toString('hex'));
      addHistory(id, user, advisor ? 'Заявка оформлена приёмщиком' : 'Заявка отправлена',
        advisor && input.accept_now === 'yes' ? null : 'Мастер-приёмщик уточнит время визита.');
      if (advisor && input.accept_now === 'yes') return action(user, id, 'receive', input);
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
    const bay = get('SELECT name FROM bays WHERE id=?', bayId);
    requireValue(bay, 'Выберите существующий пост.');
    requireValue(!get('SELECT 1 FROM orders WHERE bay_id=? AND id<>?', bayId, row.order_id), 'Этот пост уже занят.', 409);
    requireValue(!get('SELECT 1 FROM orders WHERE mechanic_id=? AND bay_id IS NOT NULL AND id<>?', mechanicId, row.order_id),
      'Механик уже работает на другом посту.', 409);
    updateOrder(row, status, { mechanic_id: mechanicId, bay_id: bayId,
      work_instructions: str(input.instructions, 'Задача и ожидаемый результат'), pause_reason: null });
    if (row.parking_space) run('DELETE FROM parking_assignments WHERE order_id=?', row.order_id);
    return `Пост ${bayId} · ${bay.name}.`;
  }

  function parkOrder(row, input) {
    const space = integer(input.parking_space, 'Место на парковке');
    requireValue(get('SELECT id FROM parking_spaces WHERE id=?', space), 'Выберите существующее место на парковке.');
    requireValue(!get('SELECT 1 FROM parking_assignments WHERE space_id=? AND order_id<>?', space, row.order_id),
      'Это место на парковке уже занято.', 409);
    const reason = str(input.parking_reason, 'Какие запчасти ожидаются', { limit: 600 });
    const expected = date(input.parts_expected_date, 'Ожидаемая дата поставки', true);
    run(`INSERT INTO parking_assignments(order_id,space_id,reason,expected_date) VALUES (?,?,?,?)
      ON CONFLICT(order_id) DO UPDATE SET space_id=excluded.space_id, reason=excluded.reason, expected_date=excluded.expected_date`,
    row.order_id, space, reason, expected);
    run('UPDATE orders SET bay_id=NULL WHERE id=?', row.order_id);
    return `Место ${space}. ${reason}${expected ? ` · Ожидаемая поставка: ${expected}` : ''}`;
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
          const directions = str(input.arrival_instructions, 'Куда заехать', { optional: true, limit: 600 });
          run("UPDATE service_requests SET status='scheduled',appointment=? WHERE id=?", appointment, id);
          note = `Время визита: ${appointment.replace('T', ' ')}.${directions ? ` Куда заехать: ${directions}` : ''}`;
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
        case 'diagnose': note = assignOrder(row, input, 'diagnosis_assigned'); break;
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
        case 'recordDecision': {
          requireValue(integer(input.version, 'Версия сметы') === row.estimate_version, 'Смета уже изменена. Проверьте новую версию.', 409);
          const decision = key === 'recordDecision' ? input.decision : key;
          requireValue(decision === 'approve' || decision === 'decline', 'Выберите решение клиента.');
          if (key === 'recordDecision') {
            const confirmation = str(input.note, 'Как клиент подтвердил своё решение');
            note = `${decision === 'approve' ? 'Смета согласована' : 'Клиент отклонил смету'}. ${confirmation}`;
          } else if (decision === 'decline') note = str(input.note, 'Причина отказа');
          updateOrder(row, decision === 'approve' ? 'approved' : 'declined');
          break;
        }
        case 'assign': note = assignOrder(row, input, 'repair_assigned'); break;
        case 'moveBay': {
          const stage = row.status === 'diagnosing' ? 'diagnosis_assigned'
            : row.status === 'inspection' ? 'inspection' : 'repair_assigned';
          note = assignOrder(row, input, stage);
          break;
        }
        case 'park': note = parkOrder(row, input); break;
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
