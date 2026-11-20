const repairStates = ['approved', 'repair_assigned', 'repairing', 'paused', 'waiting_parts', 'transfer_pending', 'inspection'];
const documentStates = ['awaiting_approval', 'declined', ...repairStates];

export const transitions = {
  schedule: ['advisor', ['new', 'scheduled'], 'Назначен визит'],
  cancel: ['advisor client', ['new', 'scheduled'], 'Заявка отменена'],
  receive: ['advisor', ['scheduled', 'new'], 'Автомобиль принят'],
  arrivalPark: ['advisor', ['new', 'scheduled', 'received', 'awaiting_approval', 'approved', 'declined'], 'Автомобиль на клиентской стоянке'],
  leaveArrival: ['advisor', ['new', 'scheduled', 'received', 'awaiting_approval', 'approved', 'declined'], 'Освобождено место на клиентской стоянке'],
  diagnose: ['advisor', ['received', 'diagnosis_assigned'], 'Назначена диагностика'],
  startDiagnosis: ['mechanic', ['diagnosis_assigned'], 'Диагностика начата'],
  diagnosisReport: ['mechanic', ['diagnosing'], 'Диагностика завершена'],
  estimate: ['advisor', ['received', 'awaiting_estimate', 'declined', 'awaiting_approval'], 'Заказ-наряд отправлен на согласование'],
  addWorkOrder: ['advisor', documentStates, 'Дополнительный заказ-наряд отправлен на согласование'],
  classifyLine: ['advisor', documentStates, 'Уточнён тип позиции заказ-наряда'],
  approve: ['client', documentStates, 'Заказ-наряд согласован'],
  decline: ['client', documentStates, 'Клиент отклонил заказ-наряд'],
  recordDecision: ['advisor', documentStates, 'Приёмщик зафиксировал ответ клиента'],
  assign: ['advisor', ['approved', 'repair_assigned', 'paused'], 'Назначены работы'],
  dispatchTransfer: ['advisor manager', ['waiting_parts', 'transfer_pending', 'approved'], 'Назначен перегон в цех'],
  cancelTransfer: ['advisor manager', ['transfer_pending'], 'Перегон отменён'],
  completeTransfer: ['mechanic', ['transfer_pending'], 'Механик подтвердил перегон в цех'],
  moveBay: ['advisor', ['diagnosing', 'repairing', 'inspection'], 'Изменён пост или исполнитель'],
  park: ['advisor', ['diagnosis_assigned', 'diagnosing', 'awaiting_estimate', 'awaiting_approval', 'declined', 'approved', 'repair_assigned', 'repairing', 'paused', 'inspection', 'waiting_parts'], 'Автомобиль переведён на парковку'],
  startRepair: ['mechanic', ['repair_assigned'], 'Ремонт начат'],
  pause: ['mechanic', ['repairing'], 'Ремонт приостановлен'],
  resume: ['mechanic', ['paused'], 'Ремонт возобновлён'],
  repairReport: ['mechanic', ['repairing'], 'Работы переданы на проверку'],
  rework: ['advisor', ['inspection'], 'Назначена доработка'],
  ready: ['advisor', ['inspection'], 'Контроль качества пройден'],
  markPickupParking: ['advisor mechanic', ['pickup_pending', 'ready'], 'Автомобиль на клиентской парковке для выдачи'],
  release: ['advisor', ['paused'], 'Пост освобождён на время паузы'],
  returnCar: ['advisor', ['declined', 'received', 'awaiting_estimate'], 'Автомобиль готов к возврату'],
  payment: ['advisor', ['ready'], 'Зарегистрирована оплата'],
  issue: ['advisor', ['ready'], 'Автомобиль выдан'],
};

export function availableActions(user, row) {
  if (user.role === 'mechanic' && (row.transfer_mechanic_id ?? row.mechanic_id) !== user.id) return [];
  const pending = row.work_orders.some(document => document.status === 'pending');
  return Object.entries(transitions).filter(([key, [roles, states]]) => {
    if (!roles.split(' ').includes(user.role) || !states.includes(row.status)) return false;
    if (key === 'leaveArrival') return row.arrival_space !== null;
    if (key === 'arrivalPark') return !row.bay_id && !row.parking_space;
    if (key === 'dispatchTransfer') return Boolean(row.parking_space);
    if (key === 'assign') return !row.parking_space;
    if (key === 'markPickupParking') return user.role === 'mechanic' ? row.status === 'pickup_pending' : row.status === 'ready';
    if (key === 'payment') return Boolean(row.arrival_space) && row.total > row.paid;
    if (key === 'classifyLine') return row.work_orders.some(document => document.status !== 'declined'
      && document.lines.some(line => line.unclassified));
    if (['approve', 'decline', 'recordDecision'].includes(key)) return pending;
    if (key === 'ready') return !pending && Boolean(row.bay_id && row.mechanic_id);
    if (key === 'release') return Boolean(row.bay_id);
    if (key === 'resume') return Boolean(row.bay_id) && !row.mechanic_busy;
    return key !== 'issue' || Boolean(row.arrival_space) && row.total === row.paid;
  }).map(([key]) => key);
}

export function routingActions(role, row) {
  if (role === 'mechanic') return row.status === 'pickup_pending' ? ['markPickupParking'] : [];
  return ['park', 'moveBay', 'assign', 'diagnose', 'dispatchTransfer'].filter(key => {
    const [roles, states] = transitions[key];
    return roles.split(' ').includes(role) && states.includes(row.status)
      && (key !== 'dispatchTransfer' || row.parking_space) && (key !== 'assign' || !row.parking_space);
  });
}
