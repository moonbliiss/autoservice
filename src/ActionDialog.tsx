import { useId, useLayoutEffect, useRef, useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { actionLabels, paymentLabels, type Dashboard, type EstimateLine, type FormAction, type RequestDetail, type Submission } from './api'
import { money } from './ui'

function Field({ label, type = 'text', required = true, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="field"><span>{label}</span><input type={type} required={required} {...props} /></label>
}

function TextField({ label, name, required = true, defaultValue }: {
  label: string; name: string; required?: boolean; defaultValue?: string
}) {
  return <label className="field"><span>{label}</span><textarea name={name} maxLength={1600}
    required={required} defaultValue={defaultValue} /></label>
}

type Option = [string | number, string]

function SelectField({ label, name, options, defaultValue, value, onChange }: {
  label: string; name: string; options: Option[]; defaultValue?: string | number; value?: string;
  onChange?: (value: string) => void
}) {
  const labelId = useId()
  return <label className="field"><span id={labelId}>{label}</span><select name={name} aria-labelledby={labelId}
    required defaultValue={defaultValue} value={value}
    onChange={onChange && (event => onChange(event.target.value))}>
    {options.map(([key, text]) => <option value={key} key={key}>{text}</option>)}
  </select></label>
}

function NewRequestFields({ vehicles = [], vehicleId }: { vehicles: Dashboard['vehicles']; vehicleId?: number }) {
  const [vehicle, setVehicle] = useState(String(vehicleId ?? vehicles[0]?.id ?? 'new'))
  return <>
    <SelectField label="Автомобиль" name="vehicle_id" value={vehicle} onChange={setVehicle}
      options={[...vehicles.map((car): Option => [car.id, car.model + ' · ' + car.plate]), ['new', 'Добавить автомобиль']]} />
    <fieldset id="new-car" className="field-stack" hidden={vehicle !== 'new'} disabled={vehicle !== 'new'}>
      <div className="fields-row"><Field label="Марка и модель" name="model" maxLength={80} />
        <Field label="Госномер" name="plate" maxLength={18} /></div>
      <Field label="VIN (по желанию)" name="vin" maxLength={17} required={false} />
    </fieldset>
    <TextField label="Что нужно проверить или сделать?" name="description" />
    <Field label="Желаемая дата (по желанию)" name="preferred_date" type="date" required={false} />
  </>
}

function AssignmentFields({ dashboard, row }: { dashboard: Dashboard; row: RequestDetail }) {
  const bays = dashboard.bays ?? []
  const usedBays = bays.filter(bay => bay.status && bay.request_id !== row.id)
  const usedMechanics = new Set(usedBays.map(bay => bay.mechanic_id))
  const free = bays.filter(bay => !usedBays.includes(bay))
  const workers = (dashboard.mechanics ?? []).filter(person => !usedMechanics.has(person.id))
  return <>
    {(!free.length || !workers.length) && <p className="muted">Для назначения нужен свободный пост и механик.</p>}
    <SelectField label="Пост" name="bay_id" defaultValue={row.bay_id ?? ''}
      options={[['', 'Выберите пост'], ...free.map((bay): Option => [bay.id, `Пост ${bay.id} · ${bay.name}`])]} />
    <SelectField label="Механик" name="mechanic_id" defaultValue={row.mechanic_id ?? ''}
      options={[['', 'Выберите механика'], ...workers.map((person): Option => [person.id, person.name])]} />
    <TextField label="Задача и ожидаемый результат" name="instructions" defaultValue={row.work_instructions ?? ''} />
  </>
}

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

function EstimateFields({ dashboard, row }: { dashboard: Dashboard; row: RequestDetail }) {
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

function ReportFields({ dashboard, row, repair }: { dashboard: Dashboard; row: RequestDetail; repair: boolean }) {
  const approved = new Map<number, number>()
  for (const line of row.estimate) {
    if (line.part_id) approved.set(line.part_id, (approved.get(line.part_id) ?? 0) + line.quantity)
  }
  const parts = (dashboard.parts ?? []).filter(part => approved.has(part.id))
  return <>
    <TextField label={repair ? 'Что выполнено и как проверен результат?' : 'Что проверили и какую неисправность нашли?'} name="result" />
    <Field label="Затрачено минут" name="minutes" type="number" min={1} max={20000} />
    <TextField label="Рекомендации или замечания" name="recommendations" required={false} />
    {repair && parts.length > 0 && <><h3>Фактический расход запчастей</h3>
      {parts.map(part => {
        const remaining = row.parts_remaining?.[part.id] ?? approved.get(part.id) ?? 0
        return <Field key={part.id} label={`${part.name} · осталось по смете ${remaining}, на складе ${part.stock}`}
          name={'part_' + part.id} type="number" required={false} defaultValue={0} min={0} max={Math.min(remaining, part.stock)} />
      })}</>}
  </>
}

function FormFields({ action, dashboard }: { action: FormAction; dashboard: Dashboard }) {
  if (action.key === 'newRequest') return <NewRequestFields vehicles={dashboard.vehicles} vehicleId={action.vehicleId} />
  if (action.key === 'restock') return <>
    <SelectField label="Запчасть" name="part_id" options={(dashboard.parts ?? []).map(part => [part.id, part.name])} />
    <Field label="Количество" name="quantity" type="number" defaultValue={1} min={1} max={10000} />
    <TextField label="Поставщик или номер накладной" name="note" />
  </>
  const { key, row } = action
  switch (key) {
    case 'schedule': return <Field label="Время визита" name="appointment" type="datetime-local" defaultValue={row.appointment ?? ''} />
    case 'receive': return <>
      <Field label="Пробег, км" name="mileage" type="number" defaultValue={row.mileage ?? ''} min={0} max={5000000} />
      <SelectField label="Приоритет" name="priority" options={[['normal', 'Обычный'], ['urgent', 'Срочный']]} />
      <TextField label="Состояние при приёмке и комплектность" name="note" required={false} />
    </>
    case 'diagnose':
    case 'assign': return <AssignmentFields dashboard={dashboard} row={row} />
    case 'estimate': return <EstimateFields dashboard={dashboard} row={row} />
    case 'approve': return <p>Подтвердите смету версии {row.estimate_version} на сумму <strong>{money(row.total ?? 0)}</strong>.</p>
    case 'decline': return <TextField label="Причина отказа или что нужно изменить" name="note" />
    case 'startDiagnosis': return <p>Зафиксировать начало диагностики на назначенном посту?</p>
    case 'startRepair': return <p>Зафиксировать начало работы на назначенном посту?</p>
    case 'resume': return <p>Вернуть заказ в работу?</p>
    case 'diagnosisReport':
    case 'repairReport': return <ReportFields dashboard={dashboard} row={row} repair={key === 'repairReport'} />
    case 'pause': return <TextField label="Причина паузы" name="note" />
    case 'release': return <p>Пост станет доступен для других работ. Чтобы продолжить ремонт, назначьте пост заново.</p>
    case 'rework': return <TextField label="Что нужно исправить" name="note" />
    case 'ready': return <>
      <TextField label="Итог проверки для сотрудников" name="note" />
      <TextField label="Сообщение клиенту" name="public_note" required={false} />
    </>
    case 'returnCar': return <TextField label="Причина возврата и инструкции клиенту" name="note" />
    case 'cancel': return <TextField label="Причина отмены (по желанию)" name="note" required={false} />
    case 'payment': {
      const remaining = (row.total ?? 0) - (row.paid ?? 0)
      return <>
        <Field label="Сумма, ₽" name="amount" type="number" defaultValue={remaining} min={1} max={remaining} />
        <SelectField label="Способ оплаты" name="method" options={Object.entries(paymentLabels)} />
      </>
    }
    case 'issue': return <p>Подтвердите передачу автомобиля клиенту. Заказ перейдёт в историю.</p>
  }
}

function submissionFor(action: FormAction, form: HTMLFormElement): Submission {
  const fields = new FormData(form)
  if (action.key === 'newRequest' && fields.get('vehicle_id') === 'new') fields.delete('vehicle_id')
  const data: Submission = Object.fromEntries(fields)
  if (action.key === 'estimate' || action.key === 'approve' || action.key === 'decline') data.version = action.row.estimate_version
  if (action.key === 'estimate') {
    const names = fields.getAll('name')
    const quantities = fields.getAll('quantity')
    const prices = fields.getAll('price')
    data.lines = fields.getAll('catalog').map((value, index) => {
      const [kind, catalog_id] = String(value).split(':')
      return { kind, catalog_id, name: String(names[index]), quantity: String(quantities[index]), price: String(prices[index]) }
    })
    for (const key of ['catalog', 'name', 'quantity', 'price']) delete data[key]
  }
  if (action.key === 'repairReport') {
    data.parts = []
    for (const [name, quantity] of fields) {
      if (!name.startsWith('part_')) continue
      if (Number(quantity) > 0) data.parts.push({ id: name.slice(5), quantity })
      delete data[name]
    }
  }
  return data
}

export function ActionDialog({ action, dashboard, busy, error, onClose, onSubmit }: {
  action: FormAction; dashboard: Dashboard; busy: boolean; error: string;
  onClose: () => void; onSubmit: (data: Submission) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const errorBox = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  useLayoutEffect(() => {
    if (error) errorBox.current?.scrollIntoView({ block: 'nearest' })
  }, [error])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!busy) onSubmit(submissionFor(action, event.currentTarget))
  }

  function close() {
    if (!busy) onClose()
  }

  const submitLabel = action.key === 'newRequest' ? 'Отправить заявку' : action.key === 'estimate' ? 'Отправить смету'
    : action.key === 'diagnosisReport' || action.key === 'repairReport' ? 'Отправить отчёт' : 'Подтвердить'
  return <dialog ref={dialog} id="dialog" aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); close() }}>
    <form id="form" onSubmit={submit}>
      <div className="dialog-head"><h2 id="dialog-title">{actionLabels[action.key]}</h2>
        <button className="close" type="button" onClick={close} disabled={busy} aria-label="Закрыть">×</button></div>
      <div id="fields"><FormFields dashboard={dashboard} action={action} /></div>
      <p ref={errorBox} className="form-error" role="alert" hidden={!error}>{error}</p>
      <div className="dialog-actions">
        <button className="secondary" type="button" onClick={close} disabled={busy}>Отмена</button>
        <button className="primary" type="submit" disabled={busy}>{submitLabel}</button>
      </div>
    </form>
  </dialog>
}
