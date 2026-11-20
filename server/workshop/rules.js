export const transitions = {
  schedule: ['advisor', ['new', 'scheduled'], 'Назначен визит'],
  cancel: ['advisor client', ['new', 'scheduled'], 'Заявка отменена'],
  receive: ['advisor', ['scheduled', 'new'], 'Автомобиль принят'],
  diagnose: ['advisor', ['received', 'diagnosis_assigned'], 'Назначена диагностика'],
  startDiagnosis: ['mechanic', ['diagnosis_assigned'], 'Диагностика начата'],
  diagnosisReport: ['mechanic', ['diagnosing'], 'Диагностика завершена'],
  estimate: ['advisor', ['received', 'awaiting_estimate', 'declined', 'awaiting_approval'], 'Смета отправлена на согласование'],
  approve: ['client', ['awaiting_approval'], 'Смета согласована'],
  decline: ['client', ['awaiting_approval'], 'Клиент отклонил смету'],
  recordDecision: ['advisor', ['awaiting_approval'], 'Приёмщик зафиксировал ответ клиента'],
  assign: ['advisor', ['approved', 'repair_assigned', 'paused'], 'Назначены работы'],
  dispatchTransfer: ['advisor manager', ['waiting_parts', 'transfer_pending'], 'Назначен перегон в цех'],
  cancelTransfer: ['advisor manager', ['transfer_pending'], 'Перегон отменён'],
  completeTransfer: ['mechanic', ['transfer_pending'], 'Механик подтвердил перегон в цех'],
  moveBay: ['advisor', ['diagnosing', 'repairing', 'inspection'], 'Изменён пост или исполнитель'],
  park: ['advisor', ['diagnosis_assigned', 'diagnosing', 'approved', 'repair_assigned', 'repairing', 'paused', 'inspection', 'waiting_parts'], 'Автомобиль на парковке · ожидание запчастей'],
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

export function availableActions(user, row) {
  if (user.role === 'mechanic' && (row.transfer_mechanic_id ?? row.mechanic_id) !== user.id) return [];
  return Object.entries(transitions).filter(([key, [roles, states]]) => {
    if (!roles.split(' ').includes(user.role) || !states.includes(row.status)) return false;
    if (key === 'payment') return row.total > row.paid;
    if (key === 'release') return Boolean(row.bay_id);
    if (key === 'resume') return Boolean(row.bay_id) && !row.mechanic_busy;
    return key !== 'issue' || row.total === row.paid;
  }).map(([key]) => key);
}

export function routingActions(role, status) {
  return ['park', 'moveBay', 'assign', 'diagnose', 'dispatchTransfer'].filter(key => {
    const [roles, states] = transitions[key];
    return roles.split(' ').includes(role) && states.includes(status);
  });
}
