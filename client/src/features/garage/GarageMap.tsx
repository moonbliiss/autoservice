import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Bay, ParkingSpace } from '../../api/types'
import { garagePosts, locationKey, type MapLocation } from './mapLayout'
import { mountGarage, type MarkerPosition } from './renderer'
import './garage.css'

const noTargets: string[] = []
const noArrivals: ParkingSpace[] = []

export function GarageMap({ bays, parking, arrivals = noArrivals, selected, targets = noTargets, onSelect, onOpenStock, onClear, children }: {
  bays: readonly Bay[]; parking: readonly ParkingSpace[]; arrivals?: readonly ParkingSpace[]; selected: MapLocation | null
  targets?: string[]; onSelect: (place: MapLocation) => void; onOpenStock?: () => void
  onClear?: () => void; children?: ReactNode
}) {
  const stage = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<ReturnType<typeof mountGarage>>(null)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const [positions, setPositions] = useState<MarkerPosition[]>([])
  const selectedKey = selected && locationKey(selected)

  useEffect(() => {
    if (!canvas.current || !stage.current) return
    const instance = mountGarage(canvas.current, stage.current, setPositions)
    renderer.current = instance
    return () => {
      instance?.destroy()
      renderer.current = null
    }
  }, [])

  useEffect(() => {
    renderer.current?.update(bays, parking, arrivals, selected, targets)
  }, [bays, parking, arrivals, selected, targets])

  return <section className="scene" ref={stage} aria-label="Интерактивная 3D-карта"
    onKeyDown={event => { if (event.key === 'Escape') onClear?.() }}>
    <canvas id="garage" ref={canvas} aria-label="3D-модель цеха, парковки и склада"
      onPointerDown={event => { pointerStart.current = { x: event.clientX, y: event.clientY } }}
      onPointerCancel={() => { pointerStart.current = null }}
      onClick={event => {
        const start = pointerStart.current
        pointerStart.current = null
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return
        const bounds = event.currentTarget.getBoundingClientRect()
        const place = renderer.current?.pick(event.clientX - bounds.left, event.clientY - bounds.top)
        if (place === 'warehouse') onOpenStock?.()
        else if (place) onSelect(place)
        else onClear?.()
      }} />
    <div className="markers" aria-label="Подъёмники, парковочные места и склад">
      {positions.map(({ place, x, y, hidden }) => {
        if (place === 'warehouse') return onOpenStock && <button key={place} className="marker warehouse-marker"
          type="button" hidden={hidden} style={{ left: x, top: y }} aria-label="Запчастист · открыть склад"
          data-location={place} onClick={onOpenStock}>Склад</button>
        const key = locationKey(place)
        const bay = place.kind === 'bay'
        const arrival = place.kind === 'arrival'
        const entry = (bay ? bays : arrival ? arrivals : parking).find(item => item.id === place.id)
        const model = entry?.model
        const reserved = bay && bays.find(item => item.id === place.id)?.reserved
        const name = bay ? `Пост ${place.id}, ${garagePosts[place.id - 1].name}`
          : `${arrival ? 'Клиентская стоянка' : 'Сервисная парковка'}, место ${place.id}, ${model ?? (entry?.occupied ? 'занято' : 'свободно')}`
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
