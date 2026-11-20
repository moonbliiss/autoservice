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
  assign: ['advisor', ['approved', 'repair_assigned', 'paused', 'waiting_parts'], 'Назначены работы'],
  moveBay: ['advisor', ['diagnosing', 'repairing', 'inspection'], 'Изменён пост или исполнитель'],
  park: ['advisor', ['diagnosis_assigned', 'diagnosing', 'approved', 'repair_assigned', 'repairing', 'paused', 'inspection', 'waiting_parts'], 'Автомобиль на парковке · ожидание запчастей'],
  startRepair: ['mechanic', ['repair_assigned'], 'Ремонт начат'],
  pause: ['mechanic', ['repairing'], 'Ремонт приостановлен'],
  resume: ['mechanic', ['paused'], 'Ремонт возобновлён'],
  issueParts: ['mechanic', ['repairing'], 'Запчасти выданы со склада'],
  repairReport: ['mechanic', ['repairing'], 'Работы переданы на проверку'],
  rework: ['advisor', ['inspection'], 'Назначена доработка'],
  ready: ['advisor', ['inspection'], 'Автомобиль готов к выдаче'],
  release: ['advisor', ['paused'], 'Пост освобождён на время паузы'],
  returnCar: ['advisor', ['declined', 'received', 'awaiting_estimate'], 'Автомобиль готов к возврату'],
  payment: ['advisor', ['ready'], 'Зарегистрирована оплата'],
  issue: ['advisor', ['ready'], 'Автомобиль выдан'],
};

export function availableActions(user, row) {
  if (user.role === 'mechanic' && row.mechanic_id !== user.id) return [];
  return Object.entries(transitions).filter(([key, [roles, states]]) => {
    if (!roles.split(' ').includes(user.role) || !states.includes(row.status)) return false;
    if (key === 'payment') return row.total > row.paid;
    if (key === 'issueParts') return row.estimate.some(line => line.part_id);
    if (key === 'release') return Boolean(row.bay_id);
    if (key === 'resume') return Boolean(row.bay_id) && !row.mechanic_busy;
    return key !== 'issue' || row.total === row.paid;
  }).map(([key]) => key);
}

export function routingActions(status) {
  return ['park', 'moveBay', 'assign', 'diagnose'].filter(key => transitions[key][1].includes(status));
}
