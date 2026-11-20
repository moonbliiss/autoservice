import { useState } from 'react'
import { GarageMap } from './GarageMap'

export function StandaloneGarage() {
  const [selected, setSelected] = useState(1)
  return <GarageMap bays={[]} selected={selected} onSelect={setSelected} />
}
