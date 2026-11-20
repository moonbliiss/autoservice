import type { Profile, Role } from '../api/types'

export type Section = 'overview' | 'requests' | 'stock' | 'cars'
export const navigation: Record<Role, [Section, string, string][]> = {
  advisor: [['overview', '▦', 'Обзор'], ['requests', '▤', 'Заказы и заявки'], ['stock', '▥', 'Склад']],
  mechanic: [['overview', '▦', 'Моя смена'], ['requests', '▤', 'Мои задачи']],
  client: [['overview', '▤', 'Мои заявки'], ['cars', '▥', 'Автомобили']],
}

export const roleLabels: Record<Role, string> = { advisor: 'Мастер-приёмщик', mechanic: 'Механик', client: 'Клиент' }
export const profiles = [
  { id: 1, key: 'advisor', label: 'Мастер-приёмщик' },
  { id: 2, key: 'mechanic', label: 'Механик · Илья' },
  { id: 5, key: 'mechanic2', label: 'Механик · Павел' },
  { id: 3, key: 'client', label: 'Клиент · Алексей' },
  { id: 4, key: 'client2', label: 'Клиент · Мария' },
] satisfies { id: number; key: Profile; label: string }[]

export const profileKey = (id?: number): Profile => profiles.find(profile => profile.id === id)?.key ?? 'advisor'
