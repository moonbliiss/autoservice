import { useRef, useState } from 'react'
import type { Dashboard, EstimateLine, RequestDetail } from '../../api/types'
import { money } from '../../shared/format'
import { Field, SelectField, TextField } from './fields'

interface DraftLine { id: number; catalog: string; name: string; price: string; quantity: string }

function makeLine(id: number, line?: EstimateLine): DraftLine {
  return {
    id,
    catalog: line?.part_id ? 'part:' + line.part_id : line?.service_id ? 'service:' + line.service_id : 'custom',
    name: line?.part_id || line?.service_id ? '' : line?.name ?? '',
    price: String(line?.unit_price ?? ''),
    quantity: String(line?.quantity ?? 1),
  }
}

export function EstimateFields({ dashboard, row }: { dashboard: Dashboard; row: RequestDetail }) {
  const [lines, setLines] = useState(() => row.estimate.length ? row.estimate.map((line, index) => makeLine(index, line)) : [makeLine(0)])
  const nextId = useRef(lines.length)
  const addedRow = useRef<number | null>(null)
  const catalog = [
    { value: 'custom', name: 'Своя позиция', price: '' },
    ...(dashboard.services ?? []).map(item => ({ value: 'service:' + item.id, name: item.name, price: String(item.price) })),
    ...(dashboard.parts ?? []).map(item => ({ value: 'part:' + item.id, name: item.name + ' · запчасть', price: String(item.price ?? '') })),
  ]
  const total = lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.price), 0)

  function change(id: number, changes: Partial<DraftLine>) {
    setLines(current => current.map(line => line.id === id ? { ...line, ...changes } : line))
  }

  return <>
    <div id="estimate-rows" className="field-stack">
      {lines.map(line => <div className="estimate-row" key={line.id} ref={element => {
        if (element && addedRow.current === line.id) {
          element.querySelector('select')?.focus()
          addedRow.current = null
        }
      }}>
        <SelectField label="Строка сметы" name="catalog" value={line.catalog} options={catalog.map(item => [item.value, item.name])}
          onChange={value => change(line.id, { catalog: value, price: catalog.find(item => item.value === value)?.price ?? '' })} />
        <div className="custom-item" hidden={line.catalog !== 'custom'}>
          <Field label="Название" name="name" required={line.catalog === 'custom'} maxLength={100}
            value={line.name} onChange={event => change(line.id, { name: event.target.value })} />
        </div>
        <div className="fields-row">
          <Field label="Количество" name="quantity" type="number" min={1} max={100}
            value={line.quantity} onChange={event => change(line.id, { quantity: event.target.value })} />
          <Field label="Цена за единицу, ₽" name="price" type="number" min={0} max={1000000}
            value={line.price} onChange={event => change(line.id, { price: event.target.value })} />
        </div>
        <button className="text-button" type="button" disabled={lines.length === 1}
          onClick={() => setLines(current => current.filter(item => item.id !== line.id))}>Удалить позицию</button>
      </div>)}
    </div>
    <button className="text-button" type="button" disabled={lines.length >= 20} onClick={() => {
      const id = nextId.current++
      addedRow.current = id
      setLines(current => [...current, makeLine(id)])
    }}>Добавить позицию</button>
    <p className="split"><strong>Итого</strong><strong id="estimate-total">{money(total)}</strong></p>
    <Field label="Ожидаемая готовность" name="eta" type="datetime-local" required={false} defaultValue={row.eta ?? ''} />
    <TextField label="Сообщение клиенту" name="note" required={false} />
  </>
}
