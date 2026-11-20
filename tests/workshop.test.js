import test from 'node:test';
import assert from 'node:assert/strict';
import { openWorkshop } from '../server/workshop/service.js';

test('заявка проходит диагностику, согласование, ремонт, оплату и выдачу', t => {
  const workshop = openWorkshop(':memory:');
  t.after(() => workshop.close());
  const advisor = workshop.profile('advisor');
  const client = workshop.profile('client');
  const mechanic = workshop.profile('mechanic');
  const otherClient = workshop.profile('client2');
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
  assert.equal(step(mechanic, 'diagnosisReport', { result: 'Износ колодок 85%', recommendations: 'Замена', minutes: 24 }).bay_id, null);
  assert.equal(workshop.details(client, id).reports.length, 0);

  const quote = { eta: '2027-06-11T17:00', lines: [
    { kind: 'service', catalog_id: 4, quantity: 1, price: 3200 },
    { kind: 'part', catalog_id: 3, quantity: 1, price: 3400 },
  ] };
  assert.equal(step(advisor, 'estimate', { ...quote, version: 0 }).total, 6600);
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
  assert.throws(() => step(mechanic, 'repairReport', { ...report, parts: [{ id: 3, quantity: 1 }, { id: 3, quantity: 1 }] }), /превышает/);
  assert.equal(stock(), before);
  assert.equal(workshop.details(mechanic, id).reports.length, 1);
  assert.equal(step(mechanic, 'repairReport', { ...report, parts: [{ id: 3, quantity: 1 }] }).status, 'inspection');
  assert.equal(stock(), before - 1);
  step(advisor, 'rework', { note: 'Повторить проверку на стенде' });
  step(mechanic, 'startRepair');
  assert.equal(workshop.details(mechanic, id).parts_remaining[3], 0);
  step(mechanic, 'repairReport', { ...report, minutes: 10 });
  assert.equal(step(advisor, 'ready', { note: 'Контроль пройден', public_note: 'Готово, можно забирать' }).bay_id, null);
  assert.throws(() => step(advisor, 'issue'), { status: 409 });
  assert.equal(step(advisor, 'payment', { amount: 2000, method: 'cash' }).paid, 2000);
  assert.throws(() => step(advisor, 'payment', { amount: 4601, method: 'card' }), { status: 400 });
  assert.equal(step(advisor, 'payment', { amount: 4600, method: 'card' }).paid, 6600);
  assert.equal(step(advisor, 'issue').status, 'issued');
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
  assert.equal(workshop.action(advisor, request.id, 'issue', {}).status, 'issued');
  assert.throws(() => workshop.restock(client, { part_id: 2, quantity: 5, note: 'Накладная' }), { status: 403 });
  assert.equal(workshop.restock(advisor, { part_id: 2, quantity: 5, note: 'Накладная 842' }).stock, 13);
  assert.equal(workshop.dashboard(advisor).movements[0].note, 'Накладная 842');
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
    ['appointment', 'eta', 'id', 'model', 'parking_reason', 'parking_space', 'parts_expected_date', 'status', 'visit_note']);

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
  const returned = workshop.action(advisor, order.id, 'assign', assign(3, 'Продолжить замену дисков'));
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
