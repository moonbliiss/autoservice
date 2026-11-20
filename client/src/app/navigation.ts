import type { Dashboard, Profile, Role } from '../api/types'

export type Section = 'overview' | 'requests' | 'archive' | 'stock' | 'cars' | 'directory'
export const navigation: Record<Role, [Section, string, string][]> = {
  advisor: [['overview', '▦', 'Обзор'], ['requests', '▤', 'Заказы и заявки'], ['archive', '▣', 'Архив'], ['stock', '▥', 'Склад']],
  mechanic: [['overview', '▦', 'Моя смена'], ['requests', '▤', 'Мои задачи']],
  client: [['overview', '▤', 'Мои заявки'], ['cars', '▥', 'Автомобили']],
  stockkeeper: [['overview', '▤', 'Потребность в деталях'], ['stock', '▥', 'Склад и поставки']],
  manager: [['overview', '▦', 'Обзор'], ['requests', '▤', 'Все заявки'], ['archive', '▣', 'Архив'], ['stock', '▥', 'Склад'], ['directory', '◉', 'Справочник']],
}

export const profiles: { id?: number; key: Profile; label: string }[] = [
  { id: 1, key: 'advisor', label: 'Мастер-приёмщик' },
  { id: 2, key: 'mechanic', label: 'Механик · Илья' },
  { id: 5, key: 'mechanic2', label: 'Механик · Павел' },
  { id: 3, key: 'client', label: 'Клиент · Алексей' },
  { id: 4, key: 'client2', label: 'Клиент · Мария' },
  { key: 'stockkeeper', label: 'Запчастист' },
  { key: 'manager', label: 'Управляющий' },
]

export function profileKey(user?: Dashboard['user']): Profile {
  if (!user) return 'advisor'
  if (user.role === 'stockkeeper' || user.role === 'manager') return user.role
  return profiles.find(profile => profile.id === user.id)?.key ?? user.role
}
