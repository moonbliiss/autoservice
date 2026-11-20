import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GarageMap } from './GarageMap'

function GaragePage() {
  const [selected, setSelected] = useState(1)
  return <GarageMap bays={[]} selected={selected} onSelect={setSelected} />
}

createRoot(document.getElementById('root')!).render(<GaragePage />)
