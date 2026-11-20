import test from 'node:test';
import assert from 'node:assert/strict';
import { openWorkshop } from '../server/workshop/service.js';

test('приёмщик и запчастист меняют свой статус, механик его видит', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const stockkeeper = workshop.profile('stockkeeper');
  const mechanic = workshop.profile('mechanic');
  const client = workshop.profile('client');
  const statuses = () => workshop.dashboard(mechanic).staff_presence.map(({ role, status }) => [role, status]);
  assert.deepEqual(statuses(), [['advisor', null], ['stockkeeper', null]]);
  assert.equal(workshop.dashboard(client).staff_presence, undefined);
  assert.throws(() => workshop.setPresence(mechanic, { status: 'present' }), { status: 403 });
  assert.throws(() => workshop.setPresence(advisor, { status: 'unknown' }), { status: 400 });
  workshop.setPresence(advisor, { status: 'present' });
  workshop.setPresence(stockkeeper, { status: 'away', account_id: advisor.id });
  assert.deepEqual(statuses(), [['advisor', 'present'], ['stockkeeper', 'away']]);
  workshop.setPresence(advisor, { status: 'away' });
  assert.deepEqual(statuses(), [['advisor', 'away'], ['stockkeeper', 'away']]);
});

test('заявка проходит диагностику, согласование, ремонт, оплату и выдачу', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const client = workshop.profile('client');
  const mechanic = workshop.profile('mechanic');
  const otherClient = workshop.profile('client2');
  const stockkeeper = workshop.profile('stockkeeper');
  const appointment = '2027-06-10T10:30';
  const draft = workshop.createRequest(client, { model: 'Renault Logan', plate: 'А100АА55', description: 'Шум при торможении' });
  const id = draft.id;
  const step = (user, action, input = {}) => workshop.action(user, id, action, input);
  assert.equal(draft.status, 'new');
  assert.throws(() => workshop.details(otherClient, id), { status: 404 });
  assert.throws(() => workshop.createRequest(otherClient, { vehicle_id: 1, description: 'Чужое авто' }), { status: 404 });
  assert.equal(step(advisor, 'schedule', { appointment }).appointment, appointment);
  assert.equal(step(advisor, 'schedule', { appointment: '2027-06-10T11:30' }).appointment, '2027-06-10T11:30');
  assert.equal(step(advisor, 'receive', { mileage: 120000, priority: 'urgent', note: 'Переданы два ключа' }).status, 'received');
  assert.equal(workshop.details(client, id).intake_note, undefined);
  const assignment = { mechanic_id: mechanic.id, bay_id: 3, instructions: 'Проверить колодки и измерить износ.' };
  assert.throws(() => step(advisor, 'diagnose', assignment), /уже работает/);
  assert.throws(() => step(advisor, 'diagnose', { ...assignment, bay_id: 2 }), /пост уже занят/);
  workshop.action(mechanic, 1, 'diagnosisReport', { result: 'Люфта нет', minutes: 15 });
  assert.equal(step(advisor, 'diagnose', assignment).bay_id, 3);
  assert.equal(step(mechanic, 'startDiagnosis').status, 'diagnosing');
  step(mechanic, 'diagnosisReport', { result: 'Износ колодок 85%', recommendations: 'Замена', minutes: 24 });
  const diagnosed = workshop.details(advisor, id);
  assert.equal(diagnosed.bay_id, 3);
  assert.equal(diagnosed.mechanic_id, null);
  assert.ok(diagnosed.map_actions.includes('estimate'));
  assert.equal(workshop.details(client, id).reports.length, 0);

  const quote = { eta: '2027-06-11T17:00', lines: [
    { kind: 'service', catalog_id: 4, quantity: 1, price: 3200 },
    { kind: 'part', catalog_id: 3, quantity: 1, price: 3400 },
  ] };
  assert.equal(step(advisor, 'estimate', { ...quote, version: 0 }).work_orders[0].total, 6600);
  assert.equal(step(client, 'decline', { version: 1, note: 'Уточните производителя' }).status, 'declined');
  assert.equal(step(advisor, 'estimate', { ...quote, version: 1, note: 'Производитель указан в смете' }).estimate_version, 2);
  assert.throws(() => step(client, 'approve', { version: 1 }), { status: 409 });
  assert.throws(() => step(advisor, 'approve', { version: 2 }), { status: 409 });
  assert.equal(step(client, 'approve', { version: 2 }).status, 'approved');
  const repair = { ...assignment, instructions: 'Заменить колодки, проверить торможение.' };
  assert.equal(step(advisor, 'assign', repair).status, 'repair_assigned');
  step(mechanic, 'startRepair');
  assert.equal(step(mechanic, 'pause', { note: 'Ждём детали' }).status, 'paused');
  assert.equal(step(advisor, 'release').bay_id, null);
  assert.throws(() => step(mechanic, 'resume'), { status: 409 });
  step(advisor, 'assign', repair);
  step(mechanic, 'startRepair');
  const report = { result: 'Колодки заменены, торможение проверено', minutes: 45 };
  const stock = () => workshop.dashboard(advisor).parts.find(part => part.id === 3).stock;
  const before = stock();
  const issue = { request_id: id, part_id: 3, quantity: 1 };
  assert.throws(() => workshop.issueParts(stockkeeper, { ...issue, quantity: 2 }), /превышает/);
  assert.throws(() => step(mechanic, 'repairReport', { ...report, parts: [{ id: 3, quantity: 1 }] }), { status: 403 });
  assert.equal(stock(), before);
  assert.equal(workshop.details(mechanic, id).reports.length, 1);
  workshop.issueParts(stockkeeper, issue);
  assert.equal(step(mechanic, 'repairReport', report).status, 'inspection');
  assert.equal(stock(), before - 1);
  step(advisor, 'rework', { note: 'Повторить проверку на стенде' });
  step(mechanic, 'startRepair');
  assert.equal(workshop.details(mechanic, id).parts_remaining[3], 0);
  step(mechanic, 'repairReport', { ...report, minutes: 10 });
  const checked = step(advisor, 'ready', { note: 'Контроль пройден', public_note: 'Готово, можно забирать' });
  assert.equal(checked.status, 'pickup_pending');
  assert.equal(checked.bay_id, 3);
  assert.throws(() => step(advisor, 'payment', { amount: 2000, method: 'cash' }), { status: 409 });
  assert.throws(() => step(advisor, 'markPickupParking', { arrival_space: 3 }), { status: 409 });
  const ready = step(mechanic, 'markPickupParking', { arrival_space: 3 });
  assert.equal(ready.status, 'ready');
  assert.equal(workshop.details(advisor, id).bay_id, null);
  const onMap = () => workshop.dashboard(advisor).requests.find(row => row.id === id);
  assert.equal(onMap().arrival_space, 3);
  assert.ok(onMap().map_actions.includes('payment'));
  assert.equal(onMap().payment_due, 6600);
  assert.throws(() => step(advisor, 'issue'), { status: 409 });
  assert.equal(step(advisor, 'payment', { amount: 2000, method: 'cash' }).paid, 2000);
  assert.throws(() => step(advisor, 'payment', { amount: 4601, method: 'card' }), { status: 400 });
  assert.equal(step(advisor, 'payment', { amount: 4600, method: 'card' }).paid, 6600);
  assert.ok(onMap().map_actions.includes('issue'));
  assert.equal(step(advisor, 'issue').status, 'issued');
  assert.equal(workshop.dashboard(advisor).occupied_arrivals.includes(3), false);
  const finished = workshop.details(client, id);
  assert.equal(finished.status, 'issued');
  assert.equal(finished.paid, 6600);
  assert.ok(finished.history.some(event => event.note === 'Готово, можно забирать'));
  assert.ok(!finished.history.some(event => event.note === 'Ждём детали'));
});

test('отмена визита, возврат без ремонта и пополнение склада', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const client = workshop.profile('client');
  const other = workshop.profile('client2');
  assert.throws(() => workshop.action(other, 3, 'cancel', {}), { status: 404 });
  assert.equal(workshop.action(client, 3, 'cancel', { note: 'Перенесу на следующую неделю' }).status, 'cancelled');
  const request = workshop.createRequest(client, { vehicle_id: 2, description: 'Проверить колёса' });
  workshop.action(advisor, request.id, 'receive', { mileage: 61500 });
  workshop.action(advisor, request.id, 'estimate', { version: 0, lines: [{ kind: 'custom', name: 'Работы', quantity: 1, price: 1500 }] });
  workshop.action(client, request.id, 'decline', { version: 1, note: 'Отложить ремонт' });
  const returned = workshop.action(advisor, request.id, 'returnCar', { note: 'Автомобиль можно забрать сегодня' });
  assert.equal(returned.total, 0);
  assert.ok(returned.map_actions.includes('markPickupParking'));
  assert.throws(() => workshop.action(advisor, request.id, 'issue', {}), { status: 409 });
  workshop.action(advisor, request.id, 'markPickupParking', { arrival_space: 1 });
  assert.equal(workshop.action(advisor, request.id, 'issue', {}).status, 'issued');
  assert.throws(() => workshop.restock(client, { part_id: 2, quantity: 5, note: 'Накладная' }), { status: 403 });
  const stockkeeper = workshop.profile('stockkeeper');
  assert.throws(() => workshop.restock(advisor, { part_id: 2, quantity: 5, note: 'Накладная' }), { status: 403 });
  assert.equal(workshop.restock(stockkeeper, { part_id: 2, quantity: 5, note: 'Накладная 842' }).stock, 13);
  assert.equal(workshop.dashboard(stockkeeper).movements[0].note, 'Накладная 842');
});

test('приёмщик оформляет очный визит, распределяет работы и освобождает пост на время поставки', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const mechanic = workshop.profile('mechanic2');
  const customer = workshop.profile('client2');
  const other = workshop.profile('client');
  assert.deepEqual(workshop.dashboard(advisor).parking.map(space => space.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  const activeId = workshop.dashboard(customer).requests.find(row => row.status === 'repairing').id;
  const park = { parking_space: 10, parking_reason: 'Ожидается масляный фильтр', parts_expected_date: '2027-06-12' };
  assert.throws(() => workshop.action(mechanic, activeId, 'park', park), { status: 409 });
  assert.throws(() => workshop.action(advisor, activeId, 'park', { ...park, parking_space: 11 }), { status: 400 });
  const parked = workshop.action(advisor, activeId, 'park', park);
  assert.equal(parked.status, 'waiting_parts');
  assert.equal(parked.bay_id, null);
  assert.equal(workshop.dashboard(advisor).bays.find(bay => bay.id === 2).request_id, null);
  assert.equal(workshop.dashboard(customer).requests.find(row => row.id === activeId).parking_space, 10);
  assert.equal(workshop.details(customer, activeId).parts_expected_date, '2027-06-12');
  assert.throws(() => workshop.details(other, activeId), { status: 404 });
  assert.ok(!workshop.details(mechanic, activeId).actions.includes('startRepair'));

  const walkIn = {
    client_name: 'Сергей Петров', client_phone: '+7 900 555-01-02', model: 'Ford Focus',
    plate: 'а123вс55', description: 'Вибрация при торможении', accept_now: 'yes',
    mileage: 123000, priority: 'urgent', note: 'Принят один ключ',
  };
  assert.throws(() => workshop.createRequest(advisor, { ...walkIn, mileage: -1 }), { status: 400 });
  assert.ok(!workshop.dashboard(advisor).clients.some(client => client.name === walkIn.client_name));
  assert.throws(() => workshop.createRequest(mechanic, walkIn), { status: 403 });
  const order = workshop.createRequest(advisor, walkIn);
  assert.equal(order.status, 'received');
  assert.equal(order.client_phone, walkIn.client_phone);
  assert.equal(order.intake_note, walkIn.note);
  assert.equal(order.plate, 'А123ВС55');
  assert.match(order.tracking_token, /^[a-f0-9]{48}$/);
  assert.throws(() => workshop.tracking('0'.repeat(48)), { status: 404 });
  assert.deepEqual(Object.keys(workshop.tracking(order.tracking_token)).sort(),
    ['appointment', 'arrival_space', 'description', 'eta', 'history', 'id', 'model', 'paid',
      'parking_reason', 'parking_space', 'parts_expected_date', 'payments', 'plate', 'status', 'total', 'visit_note', 'work_orders']);

  const assign = (bay_id, instructions) => ({ bay_id, mechanic_id: mechanic.id, instructions });
  workshop.action(advisor, order.id, 'diagnose', assign(2, 'Проверить тормозную систему'));
  assert.equal(workshop.details(mechanic, order.id).work_instructions, 'Проверить тормозную систему');
  workshop.action(mechanic, order.id, 'startDiagnosis', {});
  workshop.action(advisor, order.id, 'moveBay', assign(3, 'Измерить биение дисков'));
  assert.equal(workshop.details(mechanic, order.id).status, 'diagnosis_assigned');
  workshop.action(mechanic, order.id, 'startDiagnosis', {});
  workshop.action(mechanic, order.id, 'diagnosisReport', { result: 'Диски требуют замены', minutes: 20 });
  workshop.action(advisor, order.id, 'estimate', { version: 0,
    lines: [{ kind: 'custom', name: 'Замена дисков', quantity: 1, price: 4300 }] });
  const decision = { decision: 'approve', note: 'Клиент согласовал по телефону' };
  assert.throws(() => workshop.action(advisor, order.id, 'recordDecision', { ...decision, version: 2 }), { status: 409 });
  workshop.action(advisor, order.id, 'recordDecision', { ...decision, version: 1 });
  workshop.action(advisor, order.id, 'assign', assign(3, 'Заменить диски и проверить тормоза'));
  assert.throws(() => workshop.action(advisor, order.id, 'park', park), { status: 409 });
  assert.equal(workshop.details(mechanic, order.id).bay_id, 3);
  workshop.action(advisor, order.id, 'park', { ...park, parking_space: 1 });
  assert.equal(workshop.tracking(order.tracking_token).parking_space, 1);
  workshop.action(advisor, order.id, 'park', { ...park, parking_space: 2 });
  assert.equal(workshop.dashboard(advisor).parking[0].request_id, null);
  const task = workshop.action(advisor, order.id, 'dispatchTransfer', assign(3, 'Продолжить замену дисков'));
  const returned = workshop.action(mechanic, order.id, 'completeTransfer', { transfer_id: task.transfer.id });
  assert.equal(returned.status, 'repair_assigned');
  assert.equal(returned.parking_space, null);
  assert.equal(workshop.dashboard(advisor).parking[1].request_id, null);
  assert.equal(workshop.action(mechanic, order.id, 'startRepair', {}).status, 'repairing');
});

test('заявка приёмщика для существующего клиента появляется в его кабинете', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const customer = workshop.profile('client');
  const vehicle = workshop.dashboard(customer).vehicles[0];
  assert.throws(() => workshop.createRequest(advisor, { client_id: 4, vehicle_id: vehicle.id, description: 'Проверка' }),
    { status: 404 });
  const order = workshop.createRequest(advisor, { client_id: customer.id, vehicle_id: vehicle.id, description: 'Проверка' });
  assert.equal(order.status, 'new');
  workshop.action(advisor, order.id, 'schedule', { appointment: '2027-06-12T10:00', arrival_instructions: 'Заезд через правые ворота' });
  assert.match(workshop.details(customer, order.id).history[0].note, /через правые ворота/);
  assert.match(workshop.tracking(order.tracking_token).visit_note, /через правые ворота/);
  assert.equal(workshop.details(customer, order.id).tracking_token, undefined);
});

test('пауза освобождает механика, а прежняя машина сохраняет пост', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const mechanic = workshop.profile('mechanic2');
  const original = workshop.dashboard(mechanic).requests.find(row => row.status === 'repairing');
  const next = workshop.dashboard(advisor).requests.find(row => row.status === 'new');

  workshop.action(mechanic, original.id, 'pause', { note: 'Перерыв в ремонте' });
  assert.equal(workshop.dashboard(advisor).bays.find(bay => bay.id === original.bay_id).request_id, original.id);
  workshop.action(advisor, next.id, 'receive', { mileage: 63000 });
  const diagnose = { mechanic_id: mechanic.id, bay_id: 3, instructions: 'Проверить вибрацию руля' };
  assert.throws(() => workshop.action(advisor, next.id, 'diagnose', { ...diagnose, bay_id: original.bay_id }), /пост уже занят/);
  workshop.action(advisor, next.id, 'diagnose', diagnose);

  const paused = workshop.details(mechanic, original.id);
  assert.equal(paused.resume_blocked, true);
  assert.ok(!paused.actions.includes('resume'));
  assert.throws(() => workshop.action(mechanic, original.id, 'resume', {}), /текущую задачу/);
  workshop.action(mechanic, next.id, 'startDiagnosis', {});
  workshop.action(mechanic, next.id, 'diagnosisReport', { result: 'Нужна балансировка', minutes: 18 });

  assert.equal(workshop.details(mechanic, original.id).resume_blocked, false);
  assert.equal(workshop.action(mechanic, original.id, 'resume', {}).status, 'repairing');
});

test('детали проходят через заказ поставщику, склад и выдачу в ремонт без повторного списания', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const mechanic = workshop.profile('mechanic');
  const client = workshop.profile('client');
  const stockkeeper = workshop.profile('stockkeeper');
  const request = workshop.dashboard(advisor).requests.find(row => row.status === 'new');
  const current = workshop.dashboard(mechanic).requests.find(row => row.status === 'diagnosing');
  const step = (user, key, data = {}) => workshop.action(user, request.id, key, data);
  const stock = id => workshop.dashboard(advisor).parts.find(part => part.id === id).stock;

  workshop.action(mechanic, current.id, 'diagnosisReport', { result: 'Проверка завершена', minutes: 7 });
  step(advisor, 'receive', { mileage: 63000 });
  const order = { part_id: 'new', sku: 'TEST-BP', name: 'Колодки для заказа', price: 4200,
    request_id: request.id, supplier: 'Поставщик', quantity: 3, expected_date: '2027-06-18' };
  assert.throws(() => workshop.orderSupply(mechanic, order), { status: 403 });
  const supplyId = workshop.orderSupply(stockkeeper, order).id;
  const padsId = workshop.dashboard(advisor).supplies[0].part_id;
  assert.equal(stock(padsId), 0);
  assert.equal(workshop.dashboard(stockkeeper).movements.length, 0);
  step(advisor, 'estimate', { version: 0, lines: [
    { kind: 'part', catalog_id: 1, quantity: 4, price: 900 },
    { kind: 'part', catalog_id: padsId, quantity: 1, price: 4200 },
  ] });
  step(client, 'approve', { version: 1 });
  const assignment = { bay_id: 3, mechanic_id: mechanic.id, instructions: 'Заменить масло и колодки' };
  step(advisor, 'assign', assignment);
  step(mechanic, 'startRepair');

  const oilBefore = stock(1);
  const oil = { request_id: request.id, part_id: 1, quantity: 4 };
  const pads = { request_id: request.id, part_id: padsId, quantity: 1 };
  assert.throws(() => workshop.issueParts(stockkeeper, pads), /недостаточно запчастей/);
  assert.equal(stock(1), oilBefore);
  assert.equal(workshop.dashboard(stockkeeper).movements.length, 0);
  assert.throws(() => workshop.issueParts(mechanic, oil), { status: 403 });
  workshop.issueParts(stockkeeper, oil);
  assert.equal(workshop.details(mechanic, request.id).parts_remaining[1], 0);
  assert.equal(stock(1), oilBefore - 4);

  const parked = step(advisor, 'park', { parking_space: 4 });
  assert.equal(parked.status, 'waiting_parts');
  assert.equal(parked.parking_space, 4);
  assert.equal(parked.parts_expected_date, '2027-06-18');
  assert.match(workshop.details(client, request.id).parking_reason, /Ожидаются запчасти/);

  assert.throws(() => workshop.receiveSupply(mechanic, supplyId, { quantity: 1 }), { status: 403 });
  workshop.receiveSupply(stockkeeper, supplyId, { quantity: 1, note: 'Накладная 17' });
  assert.equal(stock(padsId), 1);
  assert.equal(workshop.dashboard(advisor).supplies[0].received, 1);
  assert.throws(() => workshop.receiveSupply(stockkeeper, supplyId, { quantity: 3 }), { status: 409 });
  assert.equal(stock(padsId), 1);

  const transfer = step(advisor, 'dispatchTransfer', assignment);
  assert.throws(() => workshop.issueParts(stockkeeper, pads), { status: 409 });
  step(mechanic, 'completeTransfer', { transfer_id: transfer.transfer.id });
  step(mechanic, 'startRepair');
  assert.throws(() => workshop.issueParts(stockkeeper, oil), /превышает/);
  assert.equal(stock(padsId), 1);
  workshop.issueParts(stockkeeper, pads);
  const done = step(mechanic, 'repairReport', { result: 'Ремонт завершён', minutes: 30 });
  assert.equal(done.status, 'inspection');
  assert.equal(stock(padsId), 0);
  assert.equal(stock(1), oilBefore - 4);
  assert.equal(done.stock_usage.length, 2);
  workshop.receiveSupply(stockkeeper, supplyId, { quantity: 2 });
  assert.equal(workshop.dashboard(advisor).supplies[0].received, 3);
  assert.throws(() => workshop.receiveSupply(stockkeeper, supplyId, { quantity: 1 }), { status: 409 });
  assert.equal(stock(padsId), 2);
  const moves = workshop.dashboard(stockkeeper).movements;
  assert.deepEqual(moves.map(move => move.quantity), [2, -1, 1, -4]);
  assert.equal(moves.filter(move => move.supply_id === supplyId).length, 2);
  assert.ok(moves.every(move => move.request_id === request.id));
});

test('машина переезжает на парковку из диагностики и возвращается к той же стадии', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const mechanic = workshop.profile('mechanic');
  const request = workshop.dashboard(mechanic).requests.find(row => row.status === 'diagnosing');
  assert.ok(workshop.dashboard(advisor).requests.find(row => row.id === request.id).routing_actions.includes('park'));
  const parked = workshop.action(advisor, request.id, 'park', { parking_space: 6 });
  assert.equal(parked.status, 'waiting_parts');
  assert.equal(parked.bay_id, null);
  const task = workshop.action(advisor, request.id, 'dispatchTransfer', {
    bay_id: 1, mechanic_id: mechanic.id, instructions: 'Продолжить диагностику',
  });
  const returned = workshop.action(mechanic, request.id, 'completeTransfer', { transfer_id: task.transfer.id });
  assert.equal(returned.status, 'diagnosis_assigned');
  assert.equal(returned.parking_space, null);
});

test('кабинеты ограничивают и просмотр данных, и операции', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const stockkeeper = workshop.profile('stockkeeper');
  const manager = workshop.profile('manager');
  const mechanic = workshop.profile('mechanic');
  const secondMechanic = workshop.profile('mechanic2');
  const customer = workshop.profile('client');

  const warehouse = workshop.dashboard(stockkeeper);
  assert.deepEqual(warehouse.requests, []);
  assert.equal(warehouse.clients, undefined);
  assert.equal(warehouse.bays, undefined);
  const need = warehouse.warehouse_needs.find(row => row.request_id === 2 && row.part_id === 1);
  assert.equal(need.required, 4);
  assert.equal(need.mechanic, secondMechanic.name);
  assert.equal(need.can_issue, true);
  for (const key of ['client_name', 'client_phone', 'description', 'unit_price', 'payment']) assert.ok(!(key in need));
  assert.throws(() => workshop.details(stockkeeper, 2), { status: 404 });
  assert.throws(() => workshop.action(stockkeeper, 2, 'park', { parking_space: 4 }), { status: 403 });

  const supplies = workshop.dashboard(advisor);
  assert.equal(supplies.movements, undefined);
  assert.equal(supplies.warehouse_needs, undefined);
  assert.throws(() => workshop.orderSupply(advisor, { part_id: 1, quantity: 1, supplier: 'Поставщик' }), { status: 403 });

  const bay = workshop.dashboard(mechanic).bays.find(row => row.id === 2);
  assert.equal(bay.occupied, true);
  assert.equal(bay.request_id, null);
  assert.equal(bay.model, null);
  assert.throws(() => workshop.details(mechanic, 2), { status: 404 });
  const ownTask = workshop.details(secondMechanic, 2);
  assert.equal(ownTask.total, undefined);
  assert.equal(ownTask.client_phone, undefined);
  assert.ok(ownTask.estimate.every(line => line.unit_price === undefined));
  assert.ok(!ownTask.actions.includes('issueParts'));
  assert.throws(() => workshop.issueParts(secondMechanic, { request_id: 2, part_id: 1, quantity: 1 }), { status: 403 });

  const snapshot = workshop.dashboard(manager);
  assert.equal(snapshot.requests.length, 3);
  assert.equal(snapshot.staff.length, 5);
  assert.equal(snapshot.vehicles.length, 3);
  assert.equal(snapshot.warehouse_needs.length, warehouse.warehouse_needs.length);
  const full = workshop.details(manager, 2);
  assert.equal(full.total, 6120);
  assert.ok(full.client_phone);
  assert.ok(full.work_instructions);
  assert.deepEqual(full.actions, []);
  assert.throws(() => workshop.action(manager, 2, 'park', { parking_space: 4 }), { status: 403 });
  assert.throws(() => workshop.issueParts(manager, { request_id: 2, part_id: 1, quantity: 1 }), { status: 403 });
  assert.throws(() => workshop.restock(manager, { part_id: 1, quantity: 1, note: 'Приход' }), { status: 403 });
  assert.throws(() => workshop.createRequest(manager, {}), { status: 403 });

  assert.equal(workshop.dashboard(customer).parts, undefined);
  assert.throws(() => workshop.details(customer, 2), { status: 404 });
});

test('перегон резервирует пост, а только назначенный механик подтверждает физический переезд', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const manager = workshop.profile('manager');
  const mechanic = workshop.profile('mechanic');
  const other = workshop.profile('mechanic2');
  const client = workshop.profile('client2');
  const assignment = { bay_id: 3, mechanic_id: mechanic.id, instructions: 'Продолжить ремонт' };

  workshop.action(advisor, 1, 'park', { parking_space: 5 });
  workshop.action(advisor, 2, 'park', { parking_space: 4 });
  workshop.action(advisor, 3, 'receive', { mileage: 62000 });
  const pending = workshop.action(manager, 2, 'dispatchTransfer', assignment);
  const pendingBy = workshop.dashboard(mechanic).requests.find(row => row.id === 2);
  assert.equal(pendingBy.transfer.id, pending.transfer.id);
  assert.equal(pending.parking_space, 4);
  assert.equal(pending.bay_id, null);
  assert.equal(workshop.details(client, 2).status, 'transfer_pending');
  assert.equal(workshop.details(client, 2).transfer, undefined);
  const bay = () => workshop.dashboard(advisor).bays.find(row => row.id === 3);
  assert.equal(bay().occupied, false);
  assert.equal(bay().reserved, true);
  assert.equal(workshop.dashboard(advisor).parking.find(row => row.id === 4).request_id, 2);
  assert.deepEqual(workshop.details(mechanic, 2).actions, ['completeTransfer']);
  assert.throws(() => workshop.action(other, 2, 'completeTransfer', { transfer_id: pending.transfer.id }), { status: 404 });
  assert.throws(() => workshop.action(manager, 2, 'completeTransfer', { transfer_id: pending.transfer.id }), { status: 403 });
  assert.throws(() => workshop.action(mechanic, 2, 'startRepair', {}), { status: 409 });
  assert.throws(() => workshop.action(advisor, 3, 'diagnose', { ...assignment, mechanic_id: other.id }), /зарезервирован/);
  assert.throws(() => workshop.action(advisor, 3, 'diagnose', { ...assignment, bay_id: 1 }), /задача перегнать/);

  workshop.action(advisor, 2, 'cancelTransfer', { transfer_id: pending.transfer.id });
  assert.equal(bay().reserved, false);
  assert.equal(workshop.details(client, 2).status, 'waiting_parts');
  const next = workshop.action(advisor, 2, 'dispatchTransfer', assignment);
  assert.throws(() => workshop.action(mechanic, 2, 'completeTransfer', { transfer_id: pending.transfer.id }), /изменилось/);
  const arrived = workshop.action(mechanic, 2, 'completeTransfer', { transfer_id: next.transfer.id });
  assert.equal(arrived.status, 'repair_assigned');
  assert.equal(arrived.bay_id, 3);
  assert.equal(arrived.parking_space, null);
  assert.equal(bay().reserved, false);
  assert.equal(bay().request_id, 2);
  assert.equal(workshop.dashboard(advisor).parking.find(row => row.id === 4).request_id, null);
  assert.throws(() => workshop.action(mechanic, 2, 'completeTransfer', { transfer_id: next.transfer.id }), { status: 409 });
});

test('новые запчасти из заказ-наряда появляются у запчастиста с нулевым остатком ещё до согласования', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const client = workshop.profile('client');
  const stockkeeper = workshop.profile('stockkeeper');
  const need = () => workshop.dashboard(stockkeeper).warehouse_needs.filter(row => row.request_id === 3);
  workshop.action(advisor, 3, 'receive', { mileage: 62000 });
  workshop.action(advisor, 3, 'estimate', { version: 0, lines: [
    { kind: 'custom_part', sku: '341167', name: 'Направляющая суппорта', quantity: 2, price: 400 },
    { kind: 'custom_part', sku: '341169', name: 'Пыльник суппорта', quantity: 1, price: 300 },
    { kind: 'custom', name: 'Работа слесаря', quantity: 1, price: 600 },
  ] });
  assert.deepEqual(need().map(row => row.name).sort(), ['Направляющая суппорта', 'Пыльник суппорта']);
  assert.ok(need().every(row => row.stock === 0 && !row.can_issue && row.status === 'awaiting_approval'));
  workshop.action(client, 3, 'approve', { version: 1 });
  const part = need().find(row => row.name === 'Пыльник суппорта');
  const order = workshop.orderSupply(stockkeeper, { part_id: part.part_id, request_id: 3, supplier: 'Поставщик', quantity: 1 });
  workshop.receiveSupply(stockkeeper, order.id, { quantity: 1 });
  assert.equal(need().find(row => row.part_id === part.part_id).stock, 1);
});

test('заказ-наряды согласуются отдельно до начала и во время ремонта', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const client = workshop.profile('client2');
  const mechanic = workshop.profile('mechanic2');
  const stockkeeper = workshop.profile('stockkeeper');
  const draft = workshop.createRequest(advisor, { client_id: client.id, model: 'Audi A3', plate: 'Т617ТТ55',
    description: 'Проверить двигатель и подвеску', accept_now: 'yes', mileage: 86000 });
  const step = (user, action, input = {}) => workshop.action(user, draft.id, action, input);
  const need = () => workshop.dashboard(stockkeeper).warehouse_needs.filter(row => row.request_id === draft.id);
  const oil = { kind: 'part', catalog_id: 1, quantity: 1, price: 900 };
  step(advisor, 'estimate', { title: 'Двигатель', version: 0, lines: [oil] });
  step(advisor, 'addWorkOrder', { title: 'Подвеска', lines: [
    { kind: 'custom_part', sku: '311267', name: 'Сайлентблок', quantity: 2, price: 400 },
  ] });
  assert.deepEqual(workshop.tracking(draft.tracking_token).work_orders.map(doc => [doc.title, doc.status]),
    [['Двигатель', 'pending'], ['Подвеска', 'pending']]);
  assert.equal(step(client, 'approve', { version: 1 }).status, 'approved');
  assert.equal(step(client, 'decline', { version: 2, note: 'Позже' }).total, 900);
  assert.ok(!need().some(row => row.name === 'Сайлентблок'));
  workshop.action(mechanic, 2, 'repairReport', { result: 'Работы выполнены' });
  workshop.action(advisor, 2, 'ready', { note: 'Проверка пройдена' });
  workshop.action(mechanic, 2, 'markPickupParking', { arrival_space: 1 });
  step(advisor, 'assign', { mechanic_id: mechanic.id, bay_id: 2, instructions: 'Работы по двигателю' });
  step(mechanic, 'startRepair');
  const issue = { request_id: draft.id, part_id: 1, quantity: 1 };
  workshop.issueParts(stockkeeper, issue);
  const updated = step(advisor, 'addWorkOrder', { title: 'Дополнительно по двигателю', lines: [
    oil, { kind: 'custom_part', sku: '111177', name: 'Сальник коленвала', quantity: 1, price: 1500 },
  ] });
  assert.equal(updated.status, 'repairing');
  assert.ok(updated.work_timer.started_at);
  assert.equal(updated.total, 900);
  const pendingOil = need().find(row => row.part_id === 1);
  assert.equal(pendingOil.pending, 1);
  assert.equal(pendingOil.approved_remaining, 0);
  assert.equal(pendingOil.can_issue, false);
  assert.throws(() => workshop.issueParts(stockkeeper, issue), { status: 409 });
  const seal = need().find(row => row.name === 'Сальник коленвала');
  assert.equal(seal.stock, 0);
  assert.equal(seal.pending, 1);
  assert.equal(workshop.details(mechanic, draft.id).work_orders.length, 1);
  step(mechanic, 'repairReport', { result: 'Основные работы завершены' });
  assert.throws(() => step(advisor, 'ready', { note: 'Проверка пройдена' }), { status: 409 });
  const decision = step(advisor, 'recordDecision', { version: 3, decision: 'approve', note: 'По телефону' });
  assert.equal(decision.status, 'repair_assigned');
  assert.equal(decision.total, 3300);
  workshop.issueParts(stockkeeper, issue);
  const supply = workshop.orderSupply(stockkeeper, { request_id: draft.id, part_id: seal.part_id, supplier: 'Поставщик', quantity: 1 });
  workshop.receiveSupply(stockkeeper, supply.id, { quantity: 1 });
  workshop.issueParts(stockkeeper, { ...issue, part_id: seal.part_id });
  assert.equal(need().length, 0);
  step(mechanic, 'startRepair');
  step(mechanic, 'repairReport', { result: 'Дополнительные работы завершены' });
  step(advisor, 'ready', { note: 'Проверка пройдена' });
  step(mechanic, 'markPickupParking', { arrival_space: 2 });
  step(advisor, 'payment', { amount: 3300, method: 'cash' });
  assert.equal(step(advisor, 'issue').status, 'issued');
});

test('время работ измеряется автоматически и исключает паузы и парковку', t => {
  let now = Date.UTC(2027, 0, 1);
  const workshop = openWorkshop(':memory:', { now: () => now });
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const mechanic = workshop.profile('mechanic2');
  now += 123_000;
  const paused = workshop.action(mechanic, 2, 'pause', { note: 'Ждём запчасти' });
  assert.deepEqual(paused.work_timer, { elapsed_ms: 123_000, started_at: null, kind: 'repair' });
  assert.equal(workshop.details(advisor, 2).work_totals[0].elapsed_ms, 123_000);
  now += 600_000;
  workshop.action(mechanic, 2, 'resume', {});
  now += 35_000;
  workshop.action(advisor, 2, 'park', { parking_space: 4 });
  now += 500_000;
  const transfer = workshop.action(advisor, 2, 'dispatchTransfer', { bay_id: 3, mechanic_id: mechanic.id,
    instructions: 'Продолжить замену масла' });
  workshop.action(mechanic, 2, 'completeTransfer', { transfer_id: transfer.transfer.id });
  workshop.action(mechanic, 2, 'startRepair', {});
  now += 8_000;
  const reported = workshop.action(mechanic, 2, 'repairReport', { result: 'Масло заменено' , minutes: 9999 });
  assert.equal(reported.status, 'inspection');
  assert.equal(reported.reports[0].elapsed_ms, 166_000);
  assert.equal(reported.reports[0].minutes, 3);
  assert.equal(workshop.details(advisor, 2).work_totals[0].elapsed_ms, 166_000);
});

test('клиентская стоянка отмечает приезд и освобождается после назначения на пост', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const client = workshop.profile('client');
  const mechanic = workshop.profile('mechanic');
  const move = (id, space) => workshop.action(advisor, id, 'arrivalPark', { arrival_space: space });
  assert.throws(() => move(3, 6), { status: 400 });
  assert.throws(() => workshop.action(client, 3, 'arrivalPark', { arrival_space: 5 }), { status: 409 });
  assert.equal(move(3, 5).arrival_space, 5);
  assert.equal(workshop.details(client, 3).status, 'new');
  assert.equal(workshop.details(client, 3).arrival_space, 5);
  assert.equal(workshop.details(advisor, 3).parking_space, null);
  const visitor = {
    client_name: 'Новый клиент', client_phone: '89000000000', model: 'Ford Focus', plate: 'Х155ХХ55',
    description: 'Проверить тормоза', arrival_space: 5,
  };
  assert.throws(() => workshop.createRequest(advisor, visitor), { status: 409 });
  assert.ok(!workshop.dashboard(advisor).clients.some(item => item.name === visitor.client_name));
  const created = workshop.createRequest(advisor, { ...visitor, arrival_space: 4 });
  assert.equal(workshop.tracking(created.tracking_token).arrival_space, 4);
  assert.throws(() => move(created.id, 5), { status: 409 });
  assert.equal(workshop.action(advisor, 3, 'receive', { mileage: 62500 }).arrival_space, 5);
  workshop.action(mechanic, 1, 'diagnosisReport', { result: 'Диагностика завершена' });
  workshop.action(advisor, 1, 'park', { parking_space: 1 });
  const assigned = workshop.action(advisor, 3, 'diagnose', {
    mechanic_id: mechanic.id, bay_id: 1, instructions: 'Начать проверку',
  });
  assert.equal(assigned.arrival_space, null);
  assert.throws(() => move(3, 2), { status: 409 });
  assert.equal(move(created.id, 5).arrival_space, 5);
  assert.throws(() => workshop.action(advisor, created.id, 'leaveArrival', { arrival_space: 4 }), { status: 409 });
  assert.equal(workshop.action(advisor, created.id, 'leaveArrival', { arrival_space: 5 }).arrival_space, null);
  move(created.id, 4);
  assert.equal(workshop.action(advisor, created.id, 'cancel', {}).arrival_space, null);
});

test('после диагностики машина видна на карте и может ждать согласования на парковке', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const client = workshop.profile('client');
  const mechanic = workshop.profile('mechanic');
  workshop.action(mechanic, 1, 'diagnosisReport', { result: 'Проверена подвеска' });
  const diagnosed = workshop.dashboard(advisor).requests.find(row => row.id === 1);
  assert.deepEqual([diagnosed.status, diagnosed.bay_id, diagnosed.map_actions.includes('estimate')], ['awaiting_estimate', 1, true]);
  assert.equal(workshop.action(advisor, 1, 'park', { parking_space: 4 }).status, 'awaiting_estimate');
  workshop.action(advisor, 3, 'receive', { mileage: 62000 });
  const assigned = workshop.action(advisor, 3, 'diagnose', { bay_id: 1, mechanic_id: mechanic.id });
  assert.equal(assigned.work_instructions, assigned.description);
  workshop.action(advisor, 1, 'estimate', { version: 0, lines: [{ kind: 'custom', name: 'Замена тяги', price: 900, quantity: 1 }] });
  assert.equal(workshop.details(client, 1).status, 'awaiting_approval');
  const approved = workshop.action(client, 1, 'approve', { version: 1 });
  assert.deepEqual([approved.status, approved.parking_space], ['approved', 4]);
  const waiting = workshop.details(advisor, 1);
  assert.ok(waiting.routing_actions.includes('dispatchTransfer'));
  assert.ok(!waiting.actions.includes('assign'));
  const other = workshop.profile('mechanic2');
  workshop.action(advisor, 2, 'park', { parking_space: 5 });
  const transfer = workshop.action(advisor, 1, 'dispatchTransfer', { bay_id: 3, mechanic_id: other.id, instructions: 'Заменить тягу' });
  workshop.action(other, 1, 'completeTransfer', { transfer_id: transfer.transfer.id });
  workshop.action(other, 1, 'startRepair', {});
  workshop.action(other, 1, 'repairReport', { result: 'Тяга заменена' });
  assert.equal(workshop.action(advisor, 1, 'ready', {}).status, 'pickup_pending');
  assert.equal(workshop.action(other, 1, 'markPickupParking', { arrival_space: 5 }).status, 'ready');
});

test('детали с одинаковым названием различаются по введённому артикулу производителя', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const stockkeeper = workshop.profile('stockkeeper');
  const part = { kind: 'custom_part', name: 'Фильтр производителя', quantity: 1, price: 350 };
  workshop.action(advisor, 3, 'receive', { mileage: 62000 });
  assert.throws(() => workshop.action(advisor, 3, 'estimate', { version: 0, lines: [part] }), /Артикул производителя/);
  workshop.restock(stockkeeper, { part_id: 'new', sku: ' abc-123 ', name: part.name, quantity: 4, price: 350, note: 'Накладная' });
  const updated = workshop.action(advisor, 3, 'estimate', { version: 0, lines: [
    { ...part, sku: ' ABC-123 ' }, { ...part, sku: 'ABC-124' },
  ] });
  const [first, second] = updated.work_orders[0].lines;
  assert.notEqual(first.part_id, second.part_id);
  assert.throws(() => workshop.setPartNumber(advisor, first.part_id, { sku: 'ZX-10' }), { status: 403 });
  assert.throws(() => workshop.setPartNumber(stockkeeper, second.part_id, { sku: 'abc-123' }), { status: 409 });
  workshop.setPartNumber(stockkeeper, first.part_id, { sku: 'ZX-10' });
  assert.deepEqual(workshop.dashboard(stockkeeper).warehouse_needs.filter(row => row.request_id === 3)
    .map(row => [row.sku, row.stock]).sort(), [['ABC-124', 0], ['ZX-10', 4]]);
});

test('место выдачи подтверждает назначенный механик, занятое место сохраняет задачу открытой', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const mechanic = workshop.profile('mechanic2');
  const other = workshop.profile('mechanic');
  const client = workshop.profile('client2');
  workshop.action(advisor, 3, 'arrivalPark', { arrival_space: 2 });
  workshop.action(mechanic, 2, 'repairReport', { result: 'Работы завершены' });
  workshop.action(advisor, 2, 'ready', {});
  assert.deepEqual(workshop.dashboard(mechanic).occupied_arrivals, [2]);
  const task = () => workshop.dashboard(mechanic).requests.find(row => row.id === 2);
  assert.ok(task().routing_actions.includes('markPickupParking'));
  assert.equal(task().bay_id, 2);
  assert.throws(() => workshop.action(other, 2, 'markPickupParking', { arrival_space: 3 }), { status: 404 });
  assert.throws(() => workshop.action(mechanic, 2, 'markPickupParking', { arrival_space: 2 }), { status: 409 });
  assert.equal(task().status, 'pickup_pending');
  workshop.action(mechanic, 2, 'markPickupParking', { arrival_space: 4 });
  assert.deepEqual(workshop.dashboard(advisor).occupied_arrivals, [2, 4]);
  assert.equal(workshop.details(client, 2).arrival_space, 4);
  assert.throws(() => workshop.action(mechanic, 2, 'markPickupParking', { arrival_space: 5 }), { status: 409 });
});
