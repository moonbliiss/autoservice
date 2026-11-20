import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Bay, ParkingSpace, StaffPresence } from '../../api/types'
import { presenceLabels } from '../../shared/labels'
import { locationKey, type DeskLocation, type MapLocation } from './mapLayout'
import { buildScene, type MapScene } from './scene'
import { mountGarage, type MarkerPosition } from './renderer'
import './garage.css'

const defaultScene = buildScene(null)
const noTargets: string[] = []
const noArrivals: ParkingSpace[] = []

export function GarageMap({ bays, parking, arrivals = noArrivals, selected, targets = noTargets, onSelect, onDesk, staff, onClear, children, scene = defaultScene }: {
  bays: readonly Bay[]; parking: readonly ParkingSpace[]; arrivals?: readonly ParkingSpace[]; selected: MapLocation | null
  targets?: string[]; onSelect: (place: MapLocation) => void; onDesk?: (desk: DeskLocation) => void
  staff?: StaffPresence[]
  onClear?: () => void; children?: ReactNode; scene?: MapScene
}) {
  const stage = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<ReturnType<typeof mountGarage>>(null)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const [positions, setPositions] = useState<MarkerPosition[]>([])
  const selectedKey = selected && locationKey(selected)

  useEffect(() => {
    if (!canvas.current || !stage.current) return
    const instance = mountGarage(canvas.current, stage.current, setPositions, scene)
    renderer.current = instance
    return () => {
      instance?.destroy()
      renderer.current = null
    }
  }, [scene])

  useEffect(() => {
    renderer.current?.update(bays, parking, arrivals, selected, targets)
  }, [bays, parking, arrivals, selected, targets, scene])

  return <section className="scene" ref={stage} aria-label="Интерактивная 3D-карта"
    onKeyDown={event => { if (event.key === 'Escape') onClear?.() }}>
    <canvas id="garage" ref={canvas} aria-label="3D-модель цеха, парковок, приёмки и склада"
      onPointerDown={event => { pointerStart.current = { x: event.clientX, y: event.clientY } }}
      onPointerCancel={() => { pointerStart.current = null }}
      onClick={event => {
        const start = pointerStart.current
        pointerStart.current = null
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return
        const bounds = event.currentTarget.getBoundingClientRect()
        const place = renderer.current?.pick(event.clientX - bounds.left, event.clientY - bounds.top)
        if (typeof place === 'string') onDesk?.(place)
        else if (place) onSelect(place)
        else onClear?.()
      }} />
    <div className="markers" aria-label="Подъёмники, парковочные места, приёмка и склад">
      {positions.map(({ place, label, x, y, hidden }) => {
        if (place === 'warehouse' || place === 'reception') {
          const name = label ?? place
          const person = staff?.find(row => row.role === (place === 'warehouse' ? 'stockkeeper' : 'advisor'))
          const status = person?.status ? presenceLabels[person.status] : 'Не отмечено'
          if (!onDesk) return <span key={place} className="map-zone" hidden={hidden} style={{ left: x, top: y }}>{name}</span>
          return <button key={place} className={`marker desk-marker ${place}-marker`} type="button" hidden={hidden}
            style={{ left: x, top: y }} aria-label={`${name} · ${status}`}
            data-location={place} onClick={() => onDesk(place)}>
            <span className="presence-dot" data-status={person?.status ?? ''} aria-hidden="true" />{name}
          </button>
        }
        if (typeof place === 'string') return <span key={place} className="map-zone" hidden={hidden}
          style={{ left: x, top: y }}>{label}</span>
        const key = locationKey(place)
        const bay = place.kind === 'bay'
        const arrival = place.kind === 'arrival'
        const entry = (bay ? bays : arrival ? arrivals : parking).find(item => item.id === place.id)
        const model = entry?.model
        const reserved = bay && bays.find(item => item.id === place.id)?.reserved
        const name = bay ? `Пост ${place.id}, ${bays.find(item => item.id === place.id)?.name ?? ''}`
          : `${place.zoneName ?? (arrival ? 'Клиентская стоянка' : 'Сервисная парковка')}, место ${place.id}, ${model ?? (entry?.occupied ? 'занято' : 'свободно')}`
        return <button key={key} className={`marker ${bay ? 'bay-marker' : 'parking-marker'}${arrival ? ' arrival-marker' : ''}`} type="button" hidden={hidden}
          data-location={key} data-occupied={Boolean(entry?.occupied)} data-reserved={Boolean(reserved)} data-target={targets.includes(key)}
          style={{ left: x, top: y }} aria-label={name} title={bay && model ? `${name} · ${model}` : name}
          aria-pressed={selectedKey === key} onClick={() => onSelect(place)}>
          {bay ? `Пост ${place.id}` : arrival ? `К${place.id}` : String(place.id).padStart(2, '0')}
        </button>
      })}
    </div>
    <div className="camera" aria-label="Масштаб карты">
      <button type="button" aria-label="Отдалить" title="Отдалить" onClick={() => renderer.current?.zoomBy(1 / 1.15)}>−</button>
      <button type="button" aria-label="Приблизить" title="Приблизить" onClick={() => renderer.current?.zoomBy(1.15)}>+</button>
      <button type="button" aria-label="Сбросить масштаб" title="Сбросить масштаб" onClick={() => renderer.current?.reset()}>⌂</button>
    </div>
    {children}
  </section>
}
