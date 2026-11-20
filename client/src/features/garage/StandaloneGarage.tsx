import { useState } from 'react'
import { GarageMap } from './GarageMap'
import type { MapLocation } from './mapLayout'

export function StandaloneGarage() {
  const [selected, setSelected] = useState<MapLocation | null>(null)
  return <GarageMap bays={[]} parking={[]} selected={selected} onSelect={setSelected} />
}
