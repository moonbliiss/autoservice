import { fixtures, ground, lifts, makeCustomGeometry, type Face } from './geometry'
import { arrivalLocations, bayLocations, desks, parkingEntrance, parkingLocations, parkingWidth, parkingZones, siteBounds,
  type DeskLocation, type SceneLocation } from './mapLayout'
import type { LayoutArea } from './siteDesign'

type Bounds = typeof siteBounds
export interface MapScene {
  bounds: Bounds
  desks: Partial<Record<DeskLocation, Bounds>>
  locations: SceneLocation[]
  arrivals: SceneLocation[]
  bays: SceneLocation[]
  marks: { key: string; label: string; point: [number, number, number] }[]
  driveway: number
  ground: Face[]
  fixtures: Face[]
  lifts: Map<number, Face[]>
}

const standard: MapScene = {
  bounds: siteBounds, desks, locations: [...bayLocations, ...parkingLocations, ...arrivalLocations], arrivals: arrivalLocations,
  bays: bayLocations, driveway: parkingEntrance, ground, fixtures,
  lifts: new Map(bayLocations.map((bay, index) => [bay.id, lifts[index]])),
  marks: [
    { key: 'warehouse', label: 'Склад', point: [-13.7, 1.1, -2.5] },
    { key: 'reception', label: 'Приёмка', point: [-14.2, .3, 5.35] },
    ...parkingZones.map(zone => ({ key: zone.key, label: zone.label, point: [.78, .55, zone.z - 3.05] as [number, number, number] })),
  ],
}

export function buildScene(areas: LayoutArea[] | null | undefined): MapScene {
  if (!areas) return standard
  const locations: SceneLocation[] = []
  const rooms: MapScene['desks'] = {}
  const marks: MapScene['marks'] = []
  const driveway = Math.max(...areas.map(area => area.x + area.width)) + 3.6
  const bounds = {
    left: Math.min(...areas.map(area => area.x)) - 1.8,
    right: driveway + 2.5,
    back: Math.min(...areas.map(area => area.z)) - 2,
    front: Math.max(...areas.map(area => area.z + area.depth)) + 2,
  }
  for (const area of areas) {
    const { x, z, width, depth } = area
    if (area.kind === 'warehouse' || area.kind === 'reception') {
      rooms[area.kind] = { left: x, right: x + width, back: z, front: z + depth }
      marks.push({ key: area.kind, label: area.name, point: [x + width / 2, 1.1, z + depth * .61] })
      continue
    }
    const workshop = area.kind === 'workshop'
    const aisle = z + depth - (workshop ? 3 : 1.9)
    const pitch = workshop ? 6.05 : parkingWidth
    const first = x + width / 2 - (area.slots.length - 1) * pitch / 2
    const center = z + (workshop ? 5.8 : 2.45)
    area.slots.forEach((slot, index) => locations.push({
      kind: workshop ? 'bay' : area.kind === 'service' ? 'parking' : 'arrival',
      id: slot.id, x: first + index * pitch, z: center, yaw: 0, aisle, opensFront: true,
      lastInRow: index === area.slots.length - 1, markZ: center + (workshop ? 4.4 : 2), zoneName: area.name,
    }))
    if (!workshop) marks.push({ key: 'zone-' + area.id, label: area.name, point: [x + width / 2, .4, z - .6] })
  }
  const bays = locations.filter(place => place.kind === 'bay')
  return {
    bounds, desks: rooms, locations, marks, driveway, bays, arrivals: locations.filter(place => place.kind === 'arrival'),
    ...makeCustomGeometry(areas, locations, bounds, driveway),
  }
}
