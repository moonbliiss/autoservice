import type { PaymentMethod, RequestAction, Role, Status } from '../api/types'

export const roleLabels: Record<Role, string> = {
  advisor: 'Мастер-приёмщик', mechanic: 'Механик', client: 'Клиент', stockkeeper: 'Запчастист', manager: 'Управляющий',
}

export const statusLabels = {
  new: 'Новая', scheduled: 'Визит назначен', cancelled: 'Отменена', received: 'Автомобиль принят',
  diagnosis_assigned: 'Назначена диагностика', diagnosing: 'Диагностика', awaiting_estimate: 'Подготовка заказ-наряда',
  awaiting_approval: 'На согласовании', declined: 'Заказ-наряды отклонены', approved: 'Работы согласованы',
  repair_assigned: 'Работы назначены', repairing: 'В ремонте', paused: 'Работы приостановлены',
  waiting_parts: 'Ожидает запчасти', transfer_pending: 'Ожидает перегона в цех', inspection: 'Контроль качества',
  ready: 'Готов к выдаче', issued: 'Автомобиль выдан',
} satisfies Record<Status, string>

export const actionLabels = {
  schedule: 'Назначить визит', cancel: 'Отменить заявку', receive: 'Принять автомобиль',
  diagnose: 'Назначить диагностику', startDiagnosis: 'Начать диагностику', diagnosisReport: 'Сдать диагностику',
  estimate: 'Подготовить заказ-наряд', addWorkOrder: 'Добавить заказ-наряд',
  approve: 'Согласовать заказ-наряд', decline: 'Отклонить заказ-наряд',
  assign: 'Назначить ремонт', startRepair: 'Начать ремонт', pause: 'Приостановить', resume: 'Возобновить',
  repairReport: 'Передать на проверку', ready: 'Подтвердить готовность', rework: 'Вернуть на доработку',
  release: 'Освободить пост', returnCar: 'Подготовить возврат', payment: 'Зарегистрировать оплату',
  issue: 'Выдать автомобиль', newRequest: 'Новая заявка', restock: 'Пополнить склад',
  recordDecision: 'Зафиксировать ответ клиента', moveBay: 'Переназначить пост или механика', park: 'Перевести на парковку',
  dispatchTransfer: 'Назначить перегон в цех', cancelTransfer: 'Отменить перегон', completeTransfer: 'Машина на посту',
  classifyLine: 'Уточнить тип позиции заказ-наряда',
  warehouseIssue: 'Выдать запчасть', orderSupply: 'Заказать запчасть', receiveSupply: 'Принять поставку',
} satisfies Record<RequestAction | 'newRequest' | 'restock' | 'orderSupply' | 'receiveSupply' | 'warehouseIssue', string>

export const paymentLabels = { cash: 'Наличные', card: 'Карта', transfer: 'Перевод' } satisfies Record<PaymentMethod, string>
