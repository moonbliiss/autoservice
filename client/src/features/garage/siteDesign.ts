export type AreaKind = 'workshop' | 'service' | 'arrival' | 'warehouse' | 'reception'
export interface LayoutSlot { id: number; name?: string }
export interface LayoutArea {
  id: string; kind: AreaKind; name: string
  x: number; z: number; width: number; depth: number
  slots: LayoutSlot[]
}
export interface SavedLayout { revision: number; areas: LayoutArea[] | null }

export const areaLabels = {
  workshop: 'Цех', service: 'Сервисная парковка', arrival: 'Клиентская парковка', warehouse: 'Склад', reception: 'Приёмка',
} satisfies Record<AreaKind, string>

const numbered = (first: number, count: number) => Array.from({ length: count }, (_, i) => ({ id: first + i }))
export const templateAreas: LayoutArea[] = [
  { id: 'shop', kind: 'workshop', name: 'Цех', x: -10.4, z: -5.9, width: 20.8, depth: 15.4,
    slots: ['Диагностика', 'Слесарный пост', 'Шиномонтаж'].map((name, i) => ({ id: i + 1, name })) },
  { id: 'service-one', kind: 'service', name: 'Парковка сервиса 1', x: -7.65, z: -23.1, width: 17, depth: 8, slots: numbered(1, 5) },
  { id: 'service-two', kind: 'service', name: 'Парковка сервиса 2', x: -7.65, z: -14.6, width: 17, depth: 8, slots: numbered(6, 5) },
  { id: 'customer-parking', kind: 'arrival', name: 'Клиентская парковка', x: -7.65, z: 11.5, width: 17, depth: 8, slots: numbered(1, 5) },
  { id: 'warehouse', kind: 'warehouse', name: 'Склад', x: -17.9, z: -5.9, width: 7.45, depth: 5.55, slots: [] },
  { id: 'reception', kind: 'reception', name: 'Приёмка', x: -17.9, z: -.2, width: 7.45, depth: 5.85, slots: [] },
]
