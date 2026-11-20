import type { Dashboard } from '../../api/types'
import { code } from '../../shared/format'
import { Button, Panel } from '../../shared/ui'
import { StatusTag } from '../requests/status'
import { GarageMap } from './GarageMap'
import './floor.css'

export function WorkshopFloor({ dashboard, selectedBay, onOpen, onSelectBay }: {
  dashboard: Dashboard; selectedBay: number; onOpen: (id: number) => void; onSelectBay: (id: number) => void
}) {
  const bays = dashboard.bays ?? []
  const selected = bays.find(bay => bay.id === selectedBay) ?? bays[0]
  if (!selected) return null
  const requestId = selected.request_id
  const canOpen = requestId !== null && dashboard.requests.some(row => row.id === requestId)
  return <div className="map-grid">
    <section className="panel map-panel"><div className="panel-head"><h2>Карта цеха</h2>
      <p className="muted">3D · {bays.length} поста</p></div>
      <GarageMap bays={bays} selected={selected.id} onSelect={onSelectBay} />
    </section>
    <Panel title="Посты сервиса"><div id="bay-list">
      <div className="bay-list">{bays.map(bay => <button key={bay.id} type="button" className="bay"
        aria-pressed={bay.id === selected.id} onClick={() => onSelectBay(bay.id)}>
        <span className="number">{String(bay.number).padStart(2, '0')}</span>
        <span><strong>{bay.name}</strong><small>{bay.status ? bay.model : 'Свободен'}</small></span>
      </button>)}</div>
      <div className="bay-detail"><StatusTag status={selected.status} />
        <p className="muted">{selected.status ? selected.mechanic : 'Пост доступен для назначения.'}</p>
        {canOpen && <Button variant="text-button" onClick={() => onOpen(requestId)}>Открыть {code(requestId)}</Button>}
      </div>
    </div></Panel>
  </div>
}
