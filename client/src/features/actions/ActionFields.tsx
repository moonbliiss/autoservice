import { useState } from 'react'
import type { Dashboard, RequestAction, RequestDetail } from '../../api/types'
import { money } from '../../shared/format'
import { paymentLabels } from '../../shared/labels'
import { EstimateFields } from './EstimateFields'
import { Field, SelectField, TextField, type Option } from './fields'

export type FormAction =
  | { key: RequestAction; row: RequestDetail }
  | { key: 'newRequest'; vehicleId?: number }
  | { key: 'restock' }

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

export function ActionFields({ action, dashboard }: { action: FormAction; dashboard: Dashboard }) {
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
