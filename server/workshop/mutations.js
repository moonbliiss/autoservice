import { randomBytes } from 'node:crypto';
import { findPartByNumber, partNumber } from './partNumbers.js';
import { availableActions, transitions } from './rules.js';
import { date, integer, requireValue, str } from './validation.js';

export function createWorkshopMutations({ run, get, transaction }, queries, account, workTime) {
  const { amounts, details, getRequest, permitted } = queries;

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
        advisor && (input.accept_now === 'yes' || input.arrival_space != null) ? null : 'Мастер-приёмщик уточнит время визита.');
      if (advisor && input.arrival_space != null) action(user, id, 'arrivalPark', input);
      if (advisor && input.accept_now === 'yes') return action(user, id, 'receive', input);
      return details(user, id);
    });
  }

  function updateOrder(row, status, fields = {}) {
    const changes = { status, ...fields };
    const columns = Object.keys(changes).map(name => `${name}=?`);
    run(`UPDATE orders SET ${columns.join(',')} WHERE id=?`, ...Object.values(changes), row.order_id);
  }

  function checkAssignment(row, input) {
    const mechanicId = integer(input.mechanic_id, 'Механик');
    const bayId = integer(input.bay_id, 'Пост');
    requireValue(account(mechanicId)?.role === 'mechanic', 'Выберите механика из списка.');
    const bay = get('SELECT name FROM bays WHERE id=?', bayId);
    requireValue(bay, 'Выберите существующий пост.');
    requireValue(!get('SELECT 1 FROM orders WHERE bay_id=? AND id<>?', bayId, row.order_id), 'Этот пост уже занят.', 409);
    requireValue(!get("SELECT 1 FROM orders WHERE mechanic_id=? AND bay_id IS NOT NULL AND status <> 'paused' AND id<>?", mechanicId, row.order_id),
      'Механик уже работает на другом посту.', 409);
    requireValue(!get('SELECT 1 FROM parking_transfers WHERE bay_id=? AND order_id<>?', bayId, row.order_id),
      'Этот пост зарезервирован для перегона.', 409);
    requireValue(!get('SELECT 1 FROM parking_transfers WHERE mechanic_id=? AND order_id<>?', mechanicId, row.order_id),
      'У механика уже есть задача перегнать автомобиль.', 409);
    return { mechanicId, bayId, bayName: bay.name };
  }

  function assignOrder(row, input, status) {
    const { mechanicId, bayId, bayName } = checkAssignment(row, input);
    updateOrder(row, status, { mechanic_id: mechanicId, bay_id: bayId,
      work_instructions: str(input.instructions, 'Задача и ожидаемый результат', { optional: status === 'diagnosis_assigned' })
        ?? row.work_instructions ?? row.description, pause_reason: null });
    workTime.stop(row.order_id);
    if (row.parking_space) run('DELETE FROM parking_assignments WHERE order_id=?', row.order_id);
    if (row.arrival_space) run('DELETE FROM arrival_parking WHERE request_id=?', row.id);
    return `Пост ${bayId} · ${bayName}.`;
  }

  function checkTransferVersion(row, input) {
    const id = input.transfer_id == null ? null : integer(input.transfer_id, 'Задача перегона');
    requireValue(id === row.transfer_id, 'Назначение изменилось. Откройте задачу заново.', 409);
  }

  function parkOrder(row, input) {
    const space = integer(input.parking_space, 'Место на парковке');
    requireValue(get('SELECT id FROM parking_spaces WHERE id=?', space), 'Выберите существующее место на парковке.');
    requireValue(!get('SELECT 1 FROM parking_assignments WHERE space_id=? AND order_id<>?', space, row.order_id),
      'Это место на парковке уже занято.', 409);
    const supply = get(`SELECT CASE WHEN COUNT(s.expected_date)=COUNT(*) THEN MAX(s.expected_date) END AS eta,
      GROUP_CONCAT(DISTINCT p.name) AS parts FROM part_supplies s JOIN parts p ON p.id=s.part_id
      WHERE s.request_id=? AND s.received<s.quantity`, row.id);
    const forEstimate = row.parked_for_estimate || ['awaiting_estimate', 'awaiting_approval', 'declined'].includes(row.status);
    const defaultReason = forEstimate ? 'Автомобиль на парковке после диагностики.' : supply.parts ? 'Ожидаются запчасти: ' + supply.parts.replaceAll(',', ', ').slice(0, 575)
      : 'Ожидаются запчасти для продолжения работ.';
    const reason = str(input.parking_reason, 'Какие запчасти ожидаются', { optional: true, limit: 600 })
      ?? row.parking_reason ?? defaultReason;
    const expected = input.parts_expected_date === undefined
      ? row.parts_expected_date ?? (forEstimate ? null : supply.eta) : date(input.parts_expected_date, 'Ожидаемая дата поставки', true);
    run(`INSERT INTO parking_assignments(order_id,space_id,reason,expected_date) VALUES (?,?,?,?)
      ON CONFLICT(order_id) DO UPDATE SET space_id=excluded.space_id, reason=excluded.reason, expected_date=excluded.expected_date`,
    row.order_id, space, reason, expected);
    if (forEstimate) run('INSERT OR IGNORE INTO estimate_parking(order_id) VALUES (?)', row.order_id);
    run('UPDATE orders SET bay_id=NULL WHERE id=?', row.order_id);
    if (row.arrival_space) run('DELETE FROM arrival_parking WHERE request_id=?', row.id);
    workTime.stop(row.order_id);
    return `Место ${space}. ${reason}${expected ? ` · Ожидаемая поставка: ${expected}` : ''}`;
  }

  function saveReport(user, row, input, kind) {
    const result = str(input.result, 'Результат работы');
    const recommendations = str(input.recommendations, 'Рекомендации', { optional: true });
    workTime.report(row, user, kind, result, recommendations);
  }

  function registerEstimatePart(input, name, price) {
    const sku = partNumber(input);
    return findPartByNumber(get, sku)?.id ?? run('INSERT INTO parts(sku,name,stock,price) VALUES (?,?,0,?)',
      sku, name, price).lastInsertRowid;
  }

  function saveDocument(row, input, additional) {
    requireValue(Array.isArray(input.lines) && input.lines.length > 0 && input.lines.length <= 20,
      'Добавьте от 1 до 20 позиций заказ-наряда.');
    const title = str(input.title, 'Название заказ-наряда', { optional: !additional, limit: 100 }) ?? 'Основной заказ-наряд';
    const { version } = get('SELECT COALESCE(MAX(version),0)+1 AS version FROM estimate_lines WHERE order_id=?', row.order_id);
    run("INSERT INTO work_order_documents(order_id,version,title,status) VALUES (?,?,?,'pending')", row.order_id, version, title);
    for (const line of input.lines) {
      requireValue(line && ['service', 'part', 'custom', 'custom_part'].includes(line.kind), 'Выберите тип позиции заказ-наряда.');
      const catalogLine = line.kind === 'service' || line.kind === 'part';
      const table = line.kind === 'part' ? 'parts' : 'services';
      const catalog = catalogLine ? get(`SELECT * FROM ${table} WHERE id=?`, integer(line.catalog_id, 'Позиция')) : null;
      requireValue(!catalogLine || catalog, 'Позиция каталога не найдена.');
      const name = catalog?.name ?? str(line.name, 'Название позиции', { limit: 100 });
      const quantity = integer(line.quantity, 'Количество', 1, 100);
      const price = integer(line.price, 'Цена', 0, 1_000_000);
      const partId = line.kind === 'part' ? catalog.id : line.kind === 'custom_part' ? registerEstimatePart(line.sku, name, price) : null;
      const inserted = run(`INSERT INTO estimate_lines(order_id,version,service_id,part_id,name,quantity,unit_price)
        VALUES (?,?,?,?,?,?,?)`, row.order_id, version, line.kind === 'service' ? catalog.id : null, partId, name, quantity, price);
      if (line.kind === 'custom') run('INSERT INTO estimate_manual_services(line_id) VALUES (?)', inserted.lastInsertRowid);
    }
    if (!additional) {
      run('DELETE FROM work_order_documents WHERE order_id=? AND version=?', row.order_id, row.estimate_version);
      updateOrder(row, 'awaiting_approval', { estimate_version: version, eta: date(input.eta, 'Ожидаемая готовность', true, true) });
    } else if (row.status === 'declined') updateOrder(row, 'awaiting_approval');
    const message = str(input.note, 'Сообщение клиенту', { optional: true });
    return message ? `${title}. ${message}` : title;
  }

  function action(user, id, key, input) {
    return transaction(() => {
      requireValue(['advisor', 'mechanic', 'client'].includes(user.role)
        || user.role === 'manager' && ['dispatchTransfer', 'cancelTransfer'].includes(key),
      'Изменять заявки из этого кабинета нельзя.', 403);
      const row = getRequest(id);
      requireValue(permitted(user, row), 'Заявка не найдена.', 404);
      if (key === 'resume' && row.status === 'paused' && user.role === 'mechanic' && row.mechanic_id === user.id && row.bay_id) {
        requireValue(!row.mechanic_busy, 'Сначала завершите или поставьте на паузу текущую задачу.', 409);
      }
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
          if (row.arrival_space) run('DELETE FROM arrival_parking WHERE request_id=?', id);
          break;
        case 'arrivalPark': {
          const space = integer(input.arrival_space, 'Место на клиентской стоянке', 1, 5);
          requireValue(!get('SELECT 1 FROM arrival_parking WHERE space_id=? AND request_id<>?', space, id),
            'Это место на клиентской стоянке уже занято.', 409);
          requireValue(!get(`SELECT 1 FROM service_requests r LEFT JOIN arrival_parking p ON p.request_id=r.id
            LEFT JOIN orders o ON o.request_id=r.id LEFT JOIN parking_assignments s ON s.order_id=o.id
            WHERE r.vehicle_id=? AND r.id<>? AND (p.space_id IS NOT NULL OR o.bay_id IS NOT NULL OR s.space_id IS NOT NULL)`, row.vehicle_id, id),
          'Автомобиль уже размещён на карте по другой заявке.', 409);
          run(`DELETE FROM arrival_parking WHERE request_id=?`, id);
          run('INSERT INTO arrival_parking(space_id,request_id) VALUES (?,?)', space, id);
          note = `Место ${space}.`;
          break;
        }
        case 'leaveArrival': {
          const expected = input.arrival_space == null ? row.arrival_space : integer(input.arrival_space, 'Место на клиентской стоянке', 1, 5);
          requireValue(expected === row.arrival_space, 'Место автомобиля изменилось. Обновите карту.', 409);
          run('DELETE FROM arrival_parking WHERE request_id=?', id);
          break;
        }
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
        case 'startDiagnosis':
          updateOrder(row, 'diagnosing');
          workTime.start(row, user, 'diagnosis');
          break;
        case 'diagnosisReport':
          saveReport(user, row, input, 'diagnosis');
          updateOrder(row, 'awaiting_estimate', { mechanic_id: null });
          break;
        case 'estimate':
          requireValue(integer(input.version, 'Версия заказ-наряда', 0) === row.estimate_version,
            'Заказ-наряд уже изменён. Откройте его заново.', 409);
          note = saveDocument(row, input, false);
          break;
        case 'addWorkOrder':
          note = saveDocument(row, input, true);
          break;
        case 'classifyLine': {
          const lineId = integer(input.line_id, 'Позиция заказ-наряда');
          const line = money.work_orders.filter(document => document.status !== 'declined')
            .flatMap(document => document.lines).find(item => item.id === lineId && item.unclassified);
          requireValue(line, 'Позиция уже уточнена или заказ-наряд изменился.', 409);
          requireValue(['part', 'service'].includes(input.line_kind), 'Укажите, запчасть это или работа.');
          if (input.line_kind === 'part') {
            run('UPDATE estimate_lines SET part_id=? WHERE id=?', registerEstimatePart(input.sku, line.name, line.unit_price), line.id);
          } else run('INSERT INTO estimate_manual_services(line_id) VALUES (?)', line.id);
          note = line.name + (input.line_kind === 'part' ? ' · запчасть' : ' · работа');
          break;
        }
        case 'approve':
        case 'decline':
        case 'recordDecision': {
          const version = integer(input.version, 'Версия заказ-наряда');
          const document = money.work_orders.find(item => item.version === version && item.status === 'pending');
          requireValue(document, 'Заказ-наряд уже изменён или рассмотрен. Обновите заявку.', 409);
          const decision = key === 'recordDecision' ? input.decision : key;
          requireValue(decision === 'approve' || decision === 'decline', 'Выберите решение клиента.');
          note = document.title;
          if (key === 'recordDecision') {
            const confirmation = str(input.note, 'Как клиент подтвердил своё решение');
            note += `${decision === 'approve' ? ' · согласован' : ' · отклонён'}. ${confirmation}`;
          } else if (decision === 'decline') note += '. ' + str(input.note, 'Причина отказа');
          const status = decision === 'approve' ? 'approved' : 'declined';
          run('UPDATE work_order_documents SET status=? WHERE order_id=? AND version=?', status, row.order_id, version);
          if (row.work_status === 'awaiting_approval') {
            const pending = money.work_orders.some(item => item.version !== version && item.status === 'pending');
            updateOrder(row, decision === 'decline' && pending ? 'awaiting_approval' : status);
          } else if (row.work_status === 'inspection' && decision === 'approve') {
            updateOrder(row, 'repair_assigned', { inspection_note: null });
          }
          break;
        }
        case 'assign': note = assignOrder(row, input, 'repair_assigned'); break;
        case 'dispatchTransfer': {
          checkTransferVersion(row, input);
          const { mechanicId, bayId, bayName } = checkAssignment(row, input);
          const instructions = str(input.instructions, 'Задача после перегона');
          run('DELETE FROM parking_transfers WHERE order_id=?', row.order_id);
          run('INSERT INTO parking_transfers(order_id,bay_id,mechanic_id,instructions) VALUES (?,?,?,?)',
            row.order_id, bayId, mechanicId, instructions);
          note = `Парковка · место ${row.parking_space} → пост ${bayId} · ${bayName}.`;
          break;
        }
        case 'cancelTransfer':
          checkTransferVersion(row, input);
          run('DELETE FROM parking_transfers WHERE order_id=?', row.order_id);
          break;
        case 'completeTransfer': {
          checkTransferVersion(row, input);
          let stage = 'repair_assigned';
          if (['diagnosis_assigned', 'diagnosing'].includes(row.work_status)) stage = 'diagnosis_assigned';
          if (row.work_status === 'inspection') stage = 'inspection';
          note = assignOrder(row, { mechanic_id: row.transfer_mechanic_id, bay_id: row.transfer_bay_id,
            instructions: row.transfer_instructions }, stage);
          break;
        }
        case 'moveBay': {
          const stage = row.status === 'diagnosing' ? 'diagnosis_assigned'
            : row.status === 'inspection' ? 'inspection' : 'repair_assigned';
          note = assignOrder(row, input, stage);
          break;
        }
        case 'park': note = parkOrder(row, input); break;
        case 'startRepair':
        case 'resume':
          updateOrder(row, 'repairing', { pause_reason: null });
          workTime.start(row, user, 'repair');
          break;
        case 'pause': {
          const reason = str(input.note, 'Причина паузы');
          updateOrder(row, 'paused', { pause_reason: reason });
          workTime.stop(row.order_id);
          addHistory(id, user, 'Внутреннее примечание о паузе', reason, 0);
          break;
        }
        case 'release':
          updateOrder(row, 'paused', { bay_id: null });
          break;
        case 'repairReport':
          requireValue(input.parts == null || (Array.isArray(input.parts) && input.parts.length === 0),
            'Выдачу запчастей регистрирует запчастист.', 403);
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
          updateOrder(row, 'ready', { bay_id: null, inspection_note: str(input.note, 'Итог проверки', { optional: true }) });
          note = str(input.public_note, 'Сообщение клиенту', { optional: true }) || 'Можно забрать автомобиль в сервисе.';
          break;
        case 'returnCar':
          note = str(input.note, 'Причина возврата');
          updateOrder(row, 'ready', { bay_id: null });
          if (row.arrival_space) run('DELETE FROM arrival_parking WHERE request_id=?', id);
          if (row.parking_space) run('DELETE FROM parking_assignments WHERE order_id=?', row.order_id);
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
      addHistory(id, user, transitions[key][2], note, ['release', 'dispatchTransfer', 'cancelTransfer', 'classifyLine'].includes(key) ? 0 : 1);
      return details(user, id);
    });
  }

  return { createRequest, action };
}
