export type MapLocation = { kind: 'bay' | 'parking'; id: number }
export type SceneLocation = MapLocation & { x: number; z: number; yaw: number }

export const garagePosts = [
  { id: 1, name: 'Диагностика', x: -6.05 },
  { id: 2, name: 'Слесарный пост', x: 0 },
  { id: 3, name: 'Шиномонтаж', x: 6.05 },
]

export const workshopAisle = 6.12
export const parkingAisle = 3.6
export const parkingEntrance = 11.05
export const parkingWidth = 3.1
export const parkingDepth = 4.9
export const siteBounds = { left: -11, right: 29, back: -6.2, front: 12.5 }

export const bayLocations: SceneLocation[] = garagePosts.map(({ id, x }) => ({ kind: 'bay', id, x, z: 0, yaw: 0 }))
export const parkingLocations: SceneLocation[] = Array.from({ length: 10 }, (_, index) => ({
  kind: 'parking', id: index + 1,
  x: 13.2 + index % 5 * 3.25,
  z: index < 5 ? -1.9 : 9.1,
  yaw: index < 5 ? Math.PI : 0,
}))
export const sceneLocations = [...bayLocations, ...parkingLocations]
export const locationKey = ({ kind, id }: MapLocation) => `${kind}:${id}`
