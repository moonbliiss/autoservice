import type { Dashboard, Profile, RequestAction, RequestDetail, Submission } from './types'

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
