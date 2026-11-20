import { useState, type ReactNode } from 'react'
import type { Dashboard, ParkingSpace, RoutingAction } from '../../api/types'
import { code, dateOnly } from '../../shared/format'
import { Button } from '../../shared/ui'
import { StatusTag } from '../requests/status'
import { GarageMap } from './GarageMap'
import { arrivalLocations, locationKey, sceneLocations, type MapLocation } from './mapLayout'
import './floor.css'

type ArrivalAction = 'arrivalPark' | 'leaveArrival'
export type MoveRequest = (requestId: number, action: RoutingAction | ArrivalAction, destination: MapLocation) => void

function moveAction(actions: RoutingAction[], place: MapLocation) {
  if (place.kind === 'arrival') return
  if (place.kind === 'parking') return actions.includes('park') ? 'park' : undefined
  return actions.find(key => key !== 'park')
}

export function WorkshopFloor({ dashboard, onOpen, onMove, onOpenStock, onNewRequest, onNewArrival, queues }: {
  dashboard: Dashboard; onOpen: (id: number) => void; onMove: MoveRequest; onOpenStock?: () => void
  onNewRequest?: () => void; onNewArrival?: (place: number) => void; queues?: ReactNode
}) {
  const [selection, setSelection] = useState<{ place: MapLocation; requestId: number | null } | 'warehouse' | 'queue' | null>(null)
  const { requests, bays = [], parking = [] } = dashboard
  const advisor = dashboard.user.role === 'advisor'
  const arrivals: ParkingSpace[] = arrivalLocations.map(({ id }) => {
    const request = requests.find(row => row.arrival_space === id)
    return { id, request_id: request?.id ?? null, model: request?.model ?? null, plate: request?.plate ?? null,
      expected_date: null, occupied: Boolean(request) }
  })
  const entries = sceneLocations.map(place => ({
    place, vehicle: (place.kind === 'bay' ? bays : place.kind === 'arrival' ? arrivals : parking).find(item => item.id === place.id),
  }))
  const chosen = selection && typeof selection === 'object' ? selection : null
  const selected = chosen ? (
    (chosen.requestId !== null && entries.find(entry => entry.vehicle?.request_id === chosen.requestId))
    || entries.find(entry => locationKey(entry.place) === locationKey(chosen.place))
  ) : undefined
  const selectedBay = selected?.place.kind === 'bay' ? bays.find(bay => bay.id === selected.place.id) : undefined
  const request = requests.find(item => item.id === selected?.vehicle?.request_id)
  const reservation = requests.find(item => item.id === selectedBay?.reserved_request_id)
  const displayedRequest = request ?? reservation
  const actions = request?.routing_actions ?? []
  const targets = actions.length ? entries.filter(entry => !entry.vehicle?.occupied && moveAction(actions, entry.place)
    && !(entry.place.kind === 'bay' && bays.some(bay => bay.id === entry.place.id && bay.reserved)))
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

  const arriving = selected?.place.kind === 'arrival'
  const arrivalOptions = advisor && arriving && !request ? requests.filter(row =>
    row.status === 'new' || row.status === 'scheduled' || row.status === 'received' || row.arrival_space) : []
  const expected = selected?.place.kind === 'parking' ? parking.find(space => space.id === selected.place.id)?.expected_date : null
  const title = selection === 'queue' ? 'Заявки по статусам' : selection === 'warehouse' ? 'Склад'
    : selectedBay ? `Пост ${selectedBay.id} · ${selectedBay.name}`
      : selected && `${arriving ? 'Клиентская стоянка' : 'Сервисная парковка'} · место ${selected.place.id}`

  return <div className={advisor ? 'workshop-map workshop-map-main' : 'workshop-map'}>
    <GarageMap bays={bays} parking={parking} arrivals={arrivals} selected={selected?.place ?? null} targets={targets}
      onSelect={selectPlace} onClear={() => setSelection(null)} onOpenStock={onOpenStock && (() => setSelection('warehouse'))}>
      {advisor && <header className="map-toolbar">
        <h1>Карта сервиса</h1>
        <div className="map-toolbar-actions">
          {queues && <button type="button" className="secondary" aria-expanded={selection === 'queue'}
            onClick={() => setSelection(selection === 'queue' ? null : 'queue')}>Заявки по статусам</button>}
          {onNewRequest && <Button variant="primary" onClick={onNewRequest}>Новая заявка</Button>}
        </div>
        <div className="map-legend" aria-label="Стоянки на карте">
          <span><i className="arrival-key" />Клиентская стоянка <b>{arrivals.filter(space => space.occupied).length}/{arrivals.length}</b></span>
          <span><i />Сервисная парковка <b>{parking.filter(space => space.occupied).length}/{parking.length}</b></span>
        </div>
      </header>}
      {title && <section className="map-popover" aria-labelledby="map-popover-title">
        <div className="map-popover-head">
          <h2 id="map-popover-title">{title}</h2>
          <button type="button" aria-label="Закрыть карточку карты" onClick={() => setSelection(null)}>×</button>
        </div>
        {selection === 'queue' ? queues : selection === 'warehouse' ? <>
          <p className="muted">Остатки, потребность в деталях и поставки.</p>
          {onOpenStock && <Button variant="primary" onClick={onOpenStock}>Открыть склад</Button>}
        </> : selected && <>
          {displayedRequest ? <>
            <div className="map-car">
              <strong>{displayedRequest.model}</strong>
              <span className="muted">{displayedRequest.plate} · {code(displayedRequest.id)}</span>
              <StatusTag status={displayedRequest.status} />
            </div>
            {selectedBay?.mechanic && <p>Механик: {selectedBay.mechanic}</p>}
            {arriving && request?.client_name && <p>Клиент: {request.client_name}</p>}
            {displayedRequest.transfer && <p className="muted">Перегон на пост {displayedRequest.transfer.bay_id} · {displayedRequest.transfer.mechanic_name}</p>}
            {expected && <p className="muted">Ожидаемая поставка: {dateOnly(expected)}</p>}
            <Button variant="primary" onClick={() => onOpen(displayedRequest.id)}>Открыть заявку</Button>
            {arriving && advisor && request && <Button variant="text-button"
              onClick={() => onMove(request.id, 'leaveArrival', selected.place)}>Освободить место</Button>}
          </> : <>
            <p className="muted">{selected.vehicle?.model ?? (
              selected.vehicle?.occupied ? 'Занято' : selectedBay?.reserved ? 'Зарезервировано для перегона' : 'Свободно')}</p>
            {arriving && advisor && !selected.vehicle?.occupied && <>
              {arrivalOptions.length > 0 && <form className="arrival-form" onSubmit={event => {
                event.preventDefault()
                const id = Number(new FormData(event.currentTarget).get('request_id'))
                if (id) onMove(id, 'arrivalPark', selected.place)
              }}>
                <label htmlFor="arrival-request">Заявка приехавшего клиента</label>
                <select id="arrival-request" name="request_id" required defaultValue="">
                  <option value="">Выберите заявку</option>
                  {arrivalOptions.map(row => <option key={row.id} value={row.id}>
                    {code(row.id)} · {row.model} · {row.plate}
                  </option>)}
                </select>
                <button type="submit" className="primary">Отметить приезд</button>
              </form>}
              {onNewArrival && <Button variant="secondary" onClick={() => onNewArrival(selected.place.id)}>Создать заявку для этого места</Button>}
            </>}
          </>}
          {targets.length > 0 && <p className="map-routing-hint">Для перемещения выберите выделенное место на карте.</p>}
        </>}
      </section>}
    </GarageMap>
  </div>
}
