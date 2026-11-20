import { useRef, useState } from 'react'
import type { Dashboard, EstimateLine, RequestDetail } from '../../api/types'
import { money } from '../../shared/format'
import { Field, SelectField, TextField } from './fields'

interface DraftLine { id: number; catalog: string; name: string; sku: string; price: string; quantity: string }

function makeLine(id: number, line?: EstimateLine, catalog = ''): DraftLine {
  return {
    id,
    catalog: line?.part_id ? 'part:' + line.part_id : line?.service_id ? 'service:' + line.service_id
      : line && !line.unclassified ? 'custom' : catalog,
    name: line?.part_id || line?.service_id ? '' : line?.name ?? '',
    sku: '',
    price: String(line?.unit_price ?? ''),
    quantity: String(line?.quantity ?? 1),
  }
}

export function EstimateFields({ dashboard, row, additional }: { dashboard: Dashboard; row: RequestDetail; additional: boolean }) {
  const original = additional ? undefined : row.work_orders?.find(document => document.version === row.estimate_version)
  const [lines, setLines] = useState(() => original ? original.lines.map((line, index) => makeLine(index, line)) : [makeLine(0)])
  const nextId = useRef(lines.length)
  const addedRow = useRef<number | null>(null)
  const catalog = [
    { value: '', name: 'Выберите работу или запчасть', price: '' },
    { value: 'custom', name: 'Работа вручную', price: '' },
    { value: 'custom_part', name: 'Запчасть вручную', price: '' },
    ...(dashboard.services ?? []).map(item => ({ value: 'service:' + item.id, name: item.name, price: String(item.price) })),
    ...(dashboard.parts ?? []).map(item => ({ value: 'part:' + item.id, name: item.name + ' · ' + (item.sku ?? ''), price: String(item.price ?? '') })),
  ]
  const total = lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.price), 0)

  function change(id: number, changes: Partial<DraftLine>) {
    setLines(current => current.map(line => line.id === id ? { ...line, ...changes } : line))
  }

  function addLine(catalog = '') {
    if (catalog && lines.length === 1 && !lines[0].catalog && !lines[0].name && !lines[0].price) {
      addedRow.current = lines[0].id
      change(lines[0].id, { catalog })
      return
    }
    const id = nextId.current++
    addedRow.current = id
    setLines(current => [...current, makeLine(id, undefined, catalog)])
  }

  return <>
    <Field label="Название заказ-наряда" name="title" maxLength={100} placeholder="Например, Подвеска"
      required={additional} defaultValue={original?.title ?? ''} />
    <div id="estimate-rows" className="field-stack">
      {lines.map(line => <div className="estimate-row" key={line.id} ref={element => {
        if (element && addedRow.current === line.id) {
          element.querySelector<HTMLElement>(line.catalog === 'custom_part' ? 'input[name="name"]' : 'select')?.focus()
          addedRow.current = null
        }
      }}>
        <SelectField label="Позиция заказ-наряда" name="catalog" value={line.catalog} options={catalog.map(item => [item.value, item.name])}
          onChange={value => change(line.id, { catalog: value, price: catalog.find(item => item.value === value)?.price || line.price })} />
        {!line.catalog && line.name && <p className="muted">Уточните тип позиции «{line.name}».</p>}
        <div className="custom-item" hidden={!line.catalog.startsWith('custom')}>
          <Field label="Название" name="name" required={line.catalog.startsWith('custom')} maxLength={100}
            value={line.name} onChange={event => change(line.id, { name: event.target.value })} />
        </div>
        <div hidden={line.catalog !== 'custom_part'}>
          <Field label="Артикул производителя" name="sku" maxLength={40} required={line.catalog === 'custom_part'}
            value={line.sku} onChange={event => change(line.id, { sku: event.target.value })} />
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
    <div className="actions">
      <button className="text-button" type="button" disabled={lines.length >= 20} onClick={() => addLine()}>Добавить позицию</button>
      <button className="text-button" type="button" disabled={lines.length >= 20}
        onClick={() => addLine('custom_part')}>Добавить запчасть вручную</button>
    </div>
    <p className="split"><strong>Итого</strong><strong id="estimate-total">{money(total)}</strong></p>
    {!additional && <Field label="Ожидаемая готовность" name="eta" type="datetime-local" required={false} defaultValue={row.eta ?? ''} />}
    <TextField label="Сообщение клиенту" name="note" required={false} />
  </>
}
