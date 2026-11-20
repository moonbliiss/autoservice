import { useEffect, useRef, useState } from 'react'
import type { Bay } from '../../api/types'
import { garagePosts } from './geometry'
import { mountGarage, type MarkerPosition } from './renderer'
import './garage.css'

export function GarageMap({ bays, selected, onSelect }: {
  bays: readonly Bay[]; selected: number; onSelect: (id: number) => void
}) {
  const stage = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<ReturnType<typeof mountGarage>>(null)
  const [positions, setPositions] = useState<MarkerPosition[]>([])

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
    renderer.current?.update(bays, selected)
  }, [bays, selected])

  return <section className="scene" ref={stage} aria-label="Интерактивная 3D-карта">
    <canvas id="garage" ref={canvas} tabIndex={0}
      aria-label="3D-модель гаража. Клавиши со стрелками поворачивают камеру." />
    <div className="markers" aria-label="Выбор поста">
      {garagePosts.map((post, index) => {
        const id = index + 1
        const position = positions[index]
        return <button key={id} className="marker" type="button" hidden={!position || position.hidden}
          style={{ left: position?.x, top: position?.y }} aria-label={`Пост ${id}, ${post.name}`}
          aria-pressed={selected === id} onClick={() => onSelect(id)}>Пост {id}</button>
      })}
    </div>
    <div className="scene-help">Потяните, чтобы повернуть</div>
    <div className="camera" aria-label="Управление камерой">
      <button type="button" aria-label="Отдалить" title="Отдалить" onClick={() => renderer.current?.zoomBy(1 / 1.15)}>−</button>
      <button type="button" aria-label="Приблизить" title="Приблизить" onClick={() => renderer.current?.zoomBy(1.15)}>+</button>
      <button type="button" aria-label="Сбросить вид" title="Сбросить вид" onClick={() => renderer.current?.reset()}>⌂</button>
    </div>
  </section>
}
