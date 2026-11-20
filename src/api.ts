export const statusLabels = {
  new: 'Новая', scheduled: 'Визит назначен', cancelled: 'Отменена', received: 'Автомобиль принят',
  diagnosis_assigned: 'Назначена диагностика', diagnosing: 'Диагностика', awaiting_estimate: 'Подготовка сметы',
  awaiting_approval: 'На согласовании', declined: 'Смета отклонена', approved: 'Смета согласована',
  repair_assigned: 'Работы назначены', repairing: 'В ремонте', paused: 'Работы приостановлены',
  inspection: 'Контроль качества', ready: 'Готов к выдаче', issued: 'Автомобиль выдан',
}

export const actionLabels = {
  schedule: 'Назначить визит', cancel: 'Отменить заявку', receive: 'Принять автомобиль',
  diagnose: 'Назначить диагностику', startDiagnosis: 'Начать диагностику', diagnosisReport: 'Сдать диагностику',
  estimate: 'Подготовить смету', approve: 'Согласовать смету', decline: 'Отклонить смету',
  assign: 'Назначить ремонт', startRepair: 'Начать ремонт', pause: 'Приостановить', resume: 'Возобновить',
  repairReport: 'Передать на проверку', ready: 'Подтвердить готовность', rework: 'Вернуть на доработку',
  release: 'Освободить пост', returnCar: 'Подготовить возврат', payment: 'Зарегистрировать оплату',
  issue: 'Выдать автомобиль', newRequest: 'Новая заявка', restock: 'Пополнить склад',
}

export const paymentLabels = { cash: 'Наличные', card: 'Карта', transfer: 'Перевод' }
export const profiles = [
  { id: 1, key: 'advisor', label: 'Мастер-приёмщик' },
  { id: 2, key: 'mechanic', label: 'Механик · Илья' },
  { id: 5, key: 'mechanic2', label: 'Механик · Павел' },
  { id: 3, key: 'client', label: 'Клиент · Алексей' },
  { id: 4, key: 'client2', label: 'Клиент · Мария' },
] as const

export type Profile = typeof profiles[number]['key']
export type Role = 'advisor' | 'mechanic' | 'client'
export type Status = keyof typeof statusLabels
export type Action = keyof typeof actionLabels
export type RequestAction = Exclude<Action, 'newRequest' | 'restock'>

export interface RequestSummary {
  id: number
  model: string
  plate: string
  status: Status
  priority: 'normal' | 'urgent'
  appointment: string | null
  eta: string | null
  bay_id?: number | null
  assigned_to_me?: boolean
  client_name?: string
}

export interface EstimateLine {
  id?: number
  part_id: number | null
  service_id?: number | null
  name: string
  quantity: number
  unit_price?: number
}

export interface RequestDetail extends RequestSummary {
  order_id?: number | null
  bay_name?: string | null
  mechanic_id?: number | null
  mechanic_name?: string | null
  client_phone?: string | null
  vin?: string | null
  mileage: number | null
  description: string
  preferred_date: string | null
  work_instructions?: string | null
  intake_note?: string | null
  inspection_note?: string | null
  pause_reason?: string | null
  estimate_version: number | null
  estimate: EstimateLine[]
  actions: RequestAction[]
  history: { title: string; note: string | null; created_at: string }[]
  reports: { id: number; kind: 'diagnosis' | 'repair'; mechanic: string; minutes: number; created_at: string;
    result: string; recommendations: string | null; parts: string | null }[]
  parts_remaining?: Record<number, number>
  total?: number
  paid?: number
  payments?: { id: number; method: keyof typeof paymentLabels; created_at: string; amount: number }[]
}

export interface Bay {
  id: number
  name: string
  number: number
  status: Status | null
  request_id: number | null
  mechanic_id: number | null
  model: string | null
  mechanic: string | null
}

interface NamedItem { id: number; name: string }
interface CatalogItem extends NamedItem { price: number }
export interface Part extends NamedItem { stock: number; price?: number; sku?: string }

export interface Dashboard {
  user: { id: number; role: Role; name: string }
  requests: RequestSummary[]
  vehicles?: { id: number; model: string; plate: string; mileage: number | null }[]
  bays?: Bay[]
  parts?: Part[]
  mechanics?: NamedItem[]
  services?: CatalogItem[]
  movements?: { quantity: number; note: string | null; created_at: string; name: string; employee: string }[]
}

export type FormAction =
  | { key: RequestAction; row: RequestDetail }
  | { key: 'newRequest'; vehicleId?: number }
  | { key: 'restock' }

export interface Submission {
  version?: number | null
  lines?: { kind: string; catalog_id?: string; name: string; quantity: string; price: string }[]
  parts?: { id: string; quantity: FormDataEntryValue }[]
  [field: string]: unknown
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function api<T>(path: string, payload?: Submission): Promise<T> {
  const response = await fetch('/api/' + path, payload === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new ApiError(data?.error || 'Не удалось загрузить данные.', response.status)
  }
  return response.json()
}

export const getDashboard = () => api<Dashboard>('dashboard')
export const selectProfile = (profile: Profile) => api('session', { profile })
export const getRequest = (id: number) => api<RequestDetail>('requests/' + id)
export const createRequest = (data: Submission) => api<RequestDetail>('requests', data)
export const restock = (data: Submission) => api('stock', data)
export const updateRequest = (id: number, action: RequestAction, data: Submission) =>
  api<RequestDetail>(`requests/${id}/${action}`, data)

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Не удалось загрузить данные.'
