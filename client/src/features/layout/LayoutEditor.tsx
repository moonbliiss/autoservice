import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { errorMessage, saveLayout } from '../../api/client'
import { areaLabels, templateAreas, type AreaKind, type LayoutArea, type SavedLayout } from '../garage/siteDesign'
import { GarageMap } from '../garage/GarageMap'
import { buildScene } from '../garage/scene'
import { Button, Heading, Panel } from '../../shared/ui'
import './layout-editor.css'

const dimensions = { workshop: [21, 16], service: [17, 8], arrival: [17, 8], warehouse: [7.5, 6], reception: [7.5, 6] }
const snap = (value: number) => Math.round(value * 2) / 2
type Point = { x: number; z: number }
type Gesture = { start: Point; current: Point; original?: LayoutArea }
const kinds = Object.keys(areaLabels) as AreaKind[]

export function LayoutEditor({ layout, onSaved }: { layout: SavedLayout | null; onSaved: () => Promise<void> }) {
  const [areas, setAreas] = useState(() => structuredClone(layout?.areas ?? templateAreas))
  const [revision, setRevision] = useState(layout?.revision ?? 0)
  const [selected, setSelected] = useState<string | null>(null)
  const [tool, setTool] = useState<AreaKind | null>(null)
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const active = useRef<Gesture | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const dirty = useRef(false)
  const plan = useRef<HTMLDivElement>(null)
  const [margin, setMargin] = useState(0)
  const [bounds] = useState(() => ({
    left: Math.min(-26, ...areas.map(area => area.x - 6)), back: Math.min(-30, ...areas.map(area => area.z - 6)),
    right: Math.max(30, ...areas.map(area => area.x + area.width + 6)),
    front: Math.max(27, ...areas.map(area => area.z + area.depth + 6)),
  }))
  const left = bounds.left - margin, back = bounds.back - margin
  const width = bounds.right - left + margin, depth = bounds.front - back + margin
  const area = areas.find(item => item.id === selected)

  function edit(next: LayoutArea[]) {
    if (busy) return
    dirty.current = true
    setAreas(next)
    setMessage('')
    setError('')
  }

  function replace(next: LayoutArea) {
    edit(areas.map(item => item.id === next.id ? next : item))
  }

  function toPoint(event: PointerEvent): Point {
    const rect = plan.current!.getBoundingClientRect()
    return { x: snap(left + (event.clientX - rect.left) * width / rect.width),
      z: snap(back + (event.clientY - rect.top) * depth / rect.height) }
  }

  function style(x: number, z: number, w: number, d: number) {
    return { left: (x - left) / width * 100 + '%', top: (z - back) / depth * 100 + '%',
      width: w / width * 100 + '%', height: d / depth * 100 + '%' }
  }

  function begin(event: PointerEvent, original?: LayoutArea) {
    if (event.button !== 0 || busy || (!original && !tool)) return
    if (original && !tool) setSelected(original.id)
    const start = toPoint(event)
    const next = { start, current: start, original: tool ? undefined : original }
    event.stopPropagation()
    plan.current!.setPointerCapture(event.pointerId)
    active.current = next
    setGesture(next)
  }

  function drag(event: PointerEvent) {
    if (!active.current) return
    const next = { ...active.current, current: toPoint(event) }
    active.current = next
    setGesture(next)
  }

  function end(event: PointerEvent, cancelled = false) {
    const current = active.current
    active.current = null
    setGesture(null)
    if (!current || cancelled) return
    const point = toPoint(event)
    const { start, original } = current
    if (original) {
      const dx = point.x - start.x, dz = point.z - start.z
      if (dx || dz) replace({ ...original, x: snap(original.x + dx), z: snap(original.z + dz) })
    } else if (tool) {
      const [defaultWidth, defaultDepth] = dimensions[tool]
      const id = crypto.randomUUID()
      const x = Math.min(point.x, start.x), z = Math.min(point.z, start.z)
      const w = Math.max(Math.abs(point.x - start.x), defaultWidth)
      const d = Math.max(Math.abs(point.z - start.z), defaultDepth)
      const slots = tool === 'workshop' ? templateAreas[0].slots.map(slot => ({ ...slot }))
        : tool === 'service' || tool === 'arrival' ? [{ id: nextSlot(tool) }] : []
      edit([...areas, { id, kind: tool, name: areaLabels[tool], x, z, width: w, depth: d, slots }])
      setTool(null)
      setSelected(id)
    }
  }

  function nextSlot(kind: AreaKind) {
    const prior = [...areas, ...(layout?.areas ?? templateAreas)].filter(item => item.kind === kind)
    return Math.max(0, ...prior.flatMap(item => item.slots.map(slot => slot.id))) + 1
  }

  function appendSlot(area: LayoutArea) {
    const id = nextSlot(area.kind)
    const slots = [...area.slots, { id, ...(area.kind === 'workshop' ? { name: 'Пост ' + id } : {}) }]
    const min = area.kind === 'workshop' ? slots.length * 6.05 + 2 : slots.length * 3.25 + .5
    replace({ ...area, slots, width: Math.max(area.width, Math.ceil(min * 2) / 2) })
  }

  async function publish(template = false) {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const unchanged = !dirty.current && layout?.areas == null
      const saved = await saveLayout(revision, template || unchanged ? null : areas)
      setRevision(saved.revision)
      dirty.current = false
      setMessage('Схема сохранена и доступна на рабочей карте.')
      await onSaved()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return <>
    <Heading title="Конструктор схемы" subtitle={revision === 0
      ? 'Настройте план автосервиса при первом запуске. Начните с шаблона или нарисуйте свои зоны.'
      : 'Редактируйте зоны, посты и парковочные места. Сохранённая схема появится на рабочей 3D-карте.'} />
    <div className="designer-toolbar" aria-label="Инструменты конструктора">
      {kinds.map(kind => <button key={kind} type="button" className="secondary" aria-pressed={tool === kind}
        disabled={busy || areas.length >= 14 || (['workshop', 'warehouse', 'reception'].includes(kind) && areas.some(item => item.kind === kind))}
        onClick={() => { setTool(tool === kind ? null : kind); setPreview(false) }}>+ {areaLabels[kind]}</button>)}
      <button type="button" className="text-button" onClick={() => setMargin(value => value + 12)}>Расширить поле</button>
    </div>
    <div className="designer-grid">
      <div className="designer-canvas">
        <p>{tool ? 'Протяните по сетке, чтобы нарисовать зону. Щелчок создаст зону стандартного размера.'
          : 'Перетащите зону по сетке или выберите её и задайте размеры.'}</p>
        <div className="designer-plan" data-draw={Boolean(tool)} ref={plan} style={{ aspectRatio: `${width} / ${depth}` }}
          aria-label="План автосервиса" onPointerDown={event => begin(event)} onPointerMove={drag}
          onPointerUp={event => end(event)} onPointerCancel={event => end(event, true)}>
          {areas.map(item => {
            const moving = gesture?.original?.id === item.id
            const dx = moving ? gesture.current.x - gesture.start.x : 0
            const dz = moving ? gesture.current.z - gesture.start.z : 0
            return <button key={item.id} type="button" className="designer-area" data-kind={item.kind}
              aria-pressed={item.id === selected} style={style(item.x + dx, item.z + dz, item.width, item.depth)}
              onPointerDown={event => begin(event, item)} onClick={() => setSelected(item.id)}>
              <span>{item.name}</span>{item.slots.length > 0 && <small>{item.slots.map(slot => item.kind === 'arrival' ? 'К' + slot.id : slot.id).join(' · ')}</small>}
            </button>
          })}
          {gesture && !gesture.original && tool && <div className="designer-drawing" style={style(
            Math.min(gesture.start.x, gesture.current.x), Math.min(gesture.start.z, gesture.current.z),
            Math.abs(gesture.current.x - gesture.start.x), Math.abs(gesture.current.z - gesture.start.z),
          )} />}
        </div>
      </div>
      <Panel inset title={area ? 'Свойства зоны' : 'Зоны на схеме'}>
        <div className="designer-properties">
          <label>Выбранная зона<select value={selected ?? ''} onChange={event => setSelected(event.target.value || null)}>
            <option value="">Выберите зону</option>
            {areas.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select></label>
          {area && <>
            <label>Название<input maxLength={75} value={area.name} onChange={event => replace({ ...area, name: event.target.value })} /></label>
            <div className="designer-numbers">
              {([['x', 'X'], ['z', 'Z'], ['width', 'Ширина'], ['depth', 'Глубина']] as const).map(([key, label]) => <label key={key}>
                {label}<input type="number" step="0.1" value={area[key]} onChange={event => {
                  const value = event.currentTarget.valueAsNumber
                  if (Number.isFinite(value)) replace({ ...area, [key]: value })
                }} />
              </label>)}
            </div>
            {area.slots.map(slot => <div className="designer-slot" key={slot.id}>
              <span>{area.kind === 'arrival' ? 'К' : '№'}{slot.id}</span>
              {area.kind === 'workshop' && <input aria-label={`Название поста ${slot.id}`} maxLength={75}
                value={slot.name ?? ''} onChange={event => replace({ ...area,
                  slots: area.slots.map(row => row.id === slot.id ? { ...row, name: event.target.value } : row) })} />}
              <button type="button" className="text-button" disabled={area.slots.length < 2}
                aria-label={`Убрать место ${slot.id}`} onClick={() => replace({ ...area, slots: area.slots.filter(item => item.id !== slot.id) })}>Убрать</button>
            </div>)}
            {area.slots.length > 0 && <button type="button" className="secondary" disabled={area.slots.length >= 12}
              onClick={() => appendSlot(area)}>{area.kind === 'workshop' ? 'Добавить пост' : 'Добавить место'}</button>}
            <Button variant="text-button" onClick={() => { edit(areas.filter(item => item.id !== area.id)); setSelected(null) }}>Удалить зону из чертежа</Button>
          </>}
        </div>
      </Panel>
    </div>
    <div className="actions">
      <button type="button" className="primary" disabled={busy} onClick={() => void publish()}>Сохранить схему</button>
      {revision === 0 && <button type="button" className="secondary" disabled={busy} onClick={() => void publish(true)}>Оставить стандартную карту</button>}
      <button type="button" className="secondary" disabled={busy} onClick={() => setPreview(!preview)}
        aria-expanded={preview}>{preview ? 'Скрыть предпросмотр' : 'Предпросмотр 3D'}</button>
      <Button variant="text-button" onClick={() => { edit(structuredClone(templateAreas)); setSelected(null); setTool(null) }}>Загрузить шаблон в чертёж</Button>
      <Button variant="text-button" onClick={() => { edit([]); setSelected(null); setTool(null) }}>Очистить чертёж</Button>
    </div>
    {error && <p className="designer-error" role="alert">{error}</p>}
    {message && <p className="designer-message" role="status">{message}</p>}
    {preview && <Preview areas={!dirty.current && layout?.areas == null ? null : areas} />}
  </>
}


function Preview({ areas }: { areas: LayoutArea[] | null }) {
  const scene = useMemo(() => areas && (!areas.length || areas.some(area => area.width < 3 || area.depth < 3
    || [area.x, area.z, area.width, area.depth].some(value => Math.abs(value) > 120))) ? null : buildScene(areas), [areas])
  if (!scene) return <p className="muted">Добавьте зоны с корректными размерами.</p>
  const slots = (areas ?? templateAreas).find(area => area.kind === 'workshop')?.slots
  return <div className="designer-preview"><GarageMap scene={scene} bays={scene.bays.map(place => ({
    id: place.id, number: place.id, name: slots?.find(slot => slot.id === place.id)?.name ?? '',
    status: null, request_id: null, mechanic_id: null, model: null,
    mechanic: null, occupied: false, reserved: false,
  }))} parking={[]} selected={null} onSelect={() => {}} /></div>
}
