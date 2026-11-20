export function seedWorkshop({ get, exec }, { account, createRequest, action }) {
  if (get('SELECT 1 FROM accounts LIMIT 1')) return;
  exec(`
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
