import type { PaymentMethod, RequestAction, Status } from '../api/types'

export const statusLabels = {
  new: 'Новая', scheduled: 'Визит назначен', cancelled: 'Отменена', received: 'Автомобиль принят',
  diagnosis_assigned: 'Назначена диагностика', diagnosing: 'Диагностика', awaiting_estimate: 'Подготовка сметы',
  awaiting_approval: 'На согласовании', declined: 'Смета отклонена', approved: 'Смета согласована',
  repair_assigned: 'Работы назначены', repairing: 'В ремонте', paused: 'Работы приостановлены',
  waiting_parts: 'Ожидает запчасти', inspection: 'Контроль качества', ready: 'Готов к выдаче', issued: 'Автомобиль выдан',
} satisfies Record<Status, string>

export const actionLabels = {
  schedule: 'Назначить визит', cancel: 'Отменить заявку', receive: 'Принять автомобиль',
  diagnose: 'Назначить диагностику', startDiagnosis: 'Начать диагностику', diagnosisReport: 'Сдать диагностику',
  estimate: 'Подготовить смету', approve: 'Согласовать смету', decline: 'Отклонить смету',
  assign: 'Назначить ремонт', startRepair: 'Начать ремонт', pause: 'Приостановить', resume: 'Возобновить',
  repairReport: 'Передать на проверку', ready: 'Подтвердить готовность', rework: 'Вернуть на доработку',
  release: 'Освободить пост', returnCar: 'Подготовить возврат', payment: 'Зарегистрировать оплату',
  issue: 'Выдать автомобиль', newRequest: 'Новая заявка', restock: 'Пополнить склад',
  recordDecision: 'Зафиксировать ответ клиента', moveBay: 'Переназначить пост или механика', park: 'Перевести на парковку',
  issueParts: 'Взять запчасти со склада', orderSupply: 'Заказать запчасть', receiveSupply: 'Принять поставку',
} satisfies Record<RequestAction | 'newRequest' | 'restock' | 'orderSupply' | 'receiveSupply', string>

export const paymentLabels = { cash: 'Наличные', card: 'Карта', transfer: 'Перевод' } satisfies Record<PaymentMethod, string>
