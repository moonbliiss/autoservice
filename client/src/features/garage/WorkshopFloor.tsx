import { useState } from 'react'
import type { Dashboard, RoutingAction } from '../../api/types'
import { code } from '../../shared/format'
import { Button, Panel } from '../../shared/ui'
import { StatusTag } from '../requests/status'
import { GarageMap } from './GarageMap'
import { locationKey, sceneLocations, type MapLocation } from './mapLayout'
import './floor.css'

export type MoveRequest = (requestId: number, action: RoutingAction, destination: MapLocation) => void

function moveAction(actions: RoutingAction[], place: MapLocation) {
  if (place.kind === 'parking') return actions.includes('park') ? 'park' : undefined
  return actions.find(key => key !== 'park')
}

export function WorkshopFloor({ dashboard, onOpen, onMove }: {
  dashboard: Dashboard; onOpen: (id: number) => void; onMove: MoveRequest
}) {
  const [selection, setSelection] = useState<{ place: MapLocation; requestId: number | null } | null>(null)
  const bays = dashboard.bays ?? []
  const parking = dashboard.parking ?? []
  const entries = sceneLocations.map(place => ({
    place, vehicle: (place.kind === 'bay' ? bays : parking).find(item => item.id === place.id),
  }))
  const selected = selection && (
    (selection.requestId !== null && entries.find(entry => entry.vehicle?.request_id === selection.requestId))
    || entries.find(entry => locationKey(entry.place) === locationKey(selection.place))
  ) || undefined
  const requestId = selected?.vehicle?.request_id
  const request = dashboard.requests.find(item => item.id === requestId && item.id === selection?.requestId)
  const selectedBay = bays.find(bay => selected?.place.kind === 'bay' && bay.id === selected.place.id)
  const actions = request?.routing_actions ?? []
  const targets = actions.length ? entries.filter(entry => entry.vehicle?.request_id == null && moveAction(actions, entry.place))
    .map(entry => locationKey(entry.place)) : []

  function selectPlace(place: MapLocation) {
    const key = locationKey(place)
    const entry = entries.find(candidate => locationKey(candidate.place) === key)
    const action = moveAction(actions, place)
    if (request && action && targets.includes(key)) {
      onMove(request.id, action, place)
      return
    }
    setSelection({ place, requestId: entry?.vehicle?.request_id ?? null })
  }

  const occupied = parking.filter(space => space.request_id !== null).length
  const title = selectedBay ? `Пост ${selectedBay.id} · ${selectedBay.name}`
    : selected ? `Парковка · место ${selected.place.id}` : 'Выбранное место'
  return <div className="map-grid">
    <section className="panel map-panel"><div className="panel-head">
      <h2>Карта цеха и парковки</h2>
      <p className="muted">Парковка {occupied} / {parking.length}</p>
    </div>
      <GarageMap bays={bays} parking={parking} selected={selected?.place ?? null} targets={targets} onSelect={selectPlace} />
    </section>
    <Panel title={title}>
      <div className="map-selection">
        {request ? <button type="button" className="map-request" onClick={() => onOpen(request.id)}>
          <strong>{request.model}</strong>
          <span className="muted">{request.plate} · {code(request.id)}</span>
          <StatusTag status={request.status} />
          {selectedBay?.mechanic && <span className="muted">{selectedBay.mechanic}</span>}
        </button> : selected?.vehicle?.model ? <p>{selected.vehicle.model}</p> : selected && <p className="muted">Свободно</p>}
        {(!selected || targets.length > 0) && <p className="muted">
          {targets.length > 0 ? 'Выберите подсвеченное свободное место на карте.' : 'Нажмите на машину, пост или парковочное место.'}
        </p>}
        {selected && <Button variant="text-button" onClick={() => setSelection(null)}>Сбросить выбор</Button>}
      </div>
    </Panel>
  </div>
}
