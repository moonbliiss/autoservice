export type MapLocation = { kind: 'bay' | 'parking' | 'arrival'; id: number }
export type SceneLocation = MapLocation & { x: number; z: number; yaw: number }

export const garagePosts = [
  { id: 1, name: 'Диагностика', x: -6.05 },
  { id: 2, name: 'Слесарный пост', x: 0 },
  { id: 3, name: 'Шиномонтаж', x: 6.05 },
]

export const workshop = { left: -10.4, right: 10.4, back: -5.9, front: 9.5 }
export const workshopAisle = 6.25
export const workshopGate = { back: 3.75, front: 8.75 }
export const arrivalAisle = 12.55
export const parkingAisle = -15.6
export const parkingEntrance = 14
export const spacesPerRow = 5
export const parkingWidth = 3.25
export const parkingDepth = 4.9
export const desks = {
  warehouse: { left: -17.9, right: -10.45, back: -5.9, front: -.35 },
  reception: { left: -17.9, right: -10.45, back: -.2, front: 5.65 },
}
export type DeskLocation = keyof typeof desks
export const siteBounds = { left: -19, right: 16.5, back: -25.3, front: 21.65 }

export const parkingZones = [
  { key: 'service-one', label: 'Парковка сервиса 1', z: -20.55, kind: 'parking' },
  { key: 'service-two', label: 'Парковка сервиса 2', z: -10.65, kind: 'parking' },
  { key: 'customer-parking', label: 'Клиентская парковка', z: 17.1, kind: 'arrival' },
] as const

export const bayLocations: SceneLocation[] = garagePosts.map(({ id, x }) => ({ kind: 'bay', id, x, z: 0, yaw: 0 }))
export const parkingLocations: SceneLocation[] = Array.from({ length: spacesPerRow * 2 }, (_, index) => ({
  kind: 'parking', id: index + 1,
  x: -5.75 + index % spacesPerRow * parkingWidth,
  z: parkingZones[Math.floor(index / spacesPerRow)].z,
  yaw: index < spacesPerRow ? 0 : Math.PI,
}))
export const arrivalLocations: SceneLocation[] = Array.from({ length: spacesPerRow }, (_, index) => ({
  kind: 'arrival', id: index + 1, x: -5.75 + index * parkingWidth, z: parkingZones[2].z, yaw: Math.PI,
}))
export const sceneLocations = [...bayLocations, ...parkingLocations, ...arrivalLocations]
export const locationKey = ({ kind, id }: MapLocation) => `${kind}:${id}`
