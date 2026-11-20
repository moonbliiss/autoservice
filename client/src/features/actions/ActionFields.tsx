import { useState } from 'react'
import type { Dashboard, PartSupply, RequestAction, RequestDetail, WarehouseNeed } from '../../api/types'
import { arrivalLocations, type MapLocation } from '../garage/mapLayout'
import { money } from '../../shared/format'
import { paymentLabels } from '../../shared/labels'
import { AdvisorRequestFields } from './AdvisorRequestFields'
import { EstimateFields } from './EstimateFields'
import { OrderSupplyFields, ReceiveSupplyFields, WarehouseIssueFields } from './SupplyFields'
import { Field, SelectField, TextField, type Option } from './fields'

export type FormAction =
  | { key: RequestAction; row: RequestDetail; destination?: MapLocation; documentVersion?: number }
  | { key: 'newRequest'; vehicleId?: number; arrivalSpace?: number }
  | { key: 'restock' }
  | { key: 'orderSupply'; requestId?: number; partId?: number; quantity?: number }
  | { key: 'receiveSupply'; supply: PartSupply }
  | { key: 'warehouseIssue'; need: WarehouseNeed }

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

function AssignmentFields({ dashboard, row, bayId }: { dashboard: Dashboard; row: RequestDetail; bayId?: number }) {
  const bays = dashboard.bays ?? []
  const usedBays = bays.filter(bay => bay.occupied && bay.request_id !== row.id)
  const reservations = bays.filter(bay => bay.reserved && bay.reserved_request_id !== row.id)
  const usedMechanics = new Set([...usedBays.filter(bay => bay.status !== 'paused').map(bay => bay.mechanic_id),
    ...reservations.map(bay => bay.reserved_mechanic_id)])
  const free = bays.filter(bay => !usedBays.includes(bay) && !reservations.includes(bay))
  const workers = (dashboard.mechanics ?? []).filter(person => !usedMechanics.has(person.id))
  return <>
    {(!free.length || !workers.length) && <p className="muted">Для назначения нужен свободный пост и механик.</p>}
    <SelectField label="Пост" name="bay_id" defaultValue={bayId ?? row.transfer?.bay_id ?? row.bay_id ?? ''}
      options={[['', 'Выберите пост'], ...free.map((bay): Option => [bay.id, `Пост ${bay.id} · ${bay.name}`])]} />
    <SelectField label="Механик" name="mechanic_id" defaultValue={row.transfer?.mechanic_id ?? row.mechanic_id ?? ''}
      options={[['', 'Выберите механика'], ...workers.map((person): Option => [person.id, person.name])]} />
    <TextField label="Задача и ожидаемый результат" name="instructions" defaultValue={row.transfer?.instructions ?? row.work_instructions ?? ''} />
  </>
}

function ReportFields({ repair }: { repair: boolean }) {
  return <>
    <TextField label={repair ? 'Что выполнено и как проверен результат?' : 'Что проверили и какую неисправность нашли?'} name="result" />
    <TextField label="Рекомендации или замечания" name="recommendations" required={false} />
  </>
}

export function ActionFields({ action, dashboard }: { action: FormAction; dashboard: Dashboard }) {
  if (action.key === 'orderSupply') return <OrderSupplyFields dashboard={dashboard} requestId={action.requestId}
    partId={action.partId} quantity={action.quantity} />
  if (action.key === 'warehouseIssue') return <WarehouseIssueFields need={action.need} />
  if (action.key === 'receiveSupply') return <ReceiveSupplyFields supply={action.supply} />
  if (action.key === 'newRequest') return dashboard.user.role === 'advisor'
    ? <AdvisorRequestFields clients={dashboard.clients} vehicles={dashboard.vehicles} arrivalSpace={action.arrivalSpace} />
    : <NewRequestFields vehicles={dashboard.vehicles} vehicleId={action.vehicleId} />
  if (action.key === 'restock') return <>
    <SelectField label="Запчасть" name="part_id" options={(dashboard.parts ?? []).map(part => [part.id, part.name])} />
    <Field label="Количество" name="quantity" type="number" defaultValue={1} min={1} max={10000} />
    <TextField label="Поставщик или номер накладной" name="note" />
  </>
  const { key, row } = action
  switch (key) {
    case 'schedule': return <>
      <Field label="Время визита" name="appointment" type="datetime-local" defaultValue={row.appointment ?? ''} />
      <TextField label="Куда заехать (сообщение клиенту)" name="arrival_instructions" required={false} maxLength={600} />
    </>
    case 'receive': return <>
      <Field label="Пробег, км" name="mileage" type="number" defaultValue={row.mileage ?? ''} min={0} max={5000000} />
      <SelectField label="Приоритет" name="priority" options={[['normal', 'Обычный'], ['urgent', 'Срочный']]} />
      <TextField label="Состояние при приёмке и комплектность" name="note" required={false} />
    </>
    case 'arrivalPark': {
      const occupied = new Set(dashboard.requests.filter(request => request.id !== row.id).map(request => request.arrival_space))
      return <SelectField label="Клиентская стоянка" name="arrival_space" defaultValue={row.arrival_space ?? ''}
        options={ [['', 'Выберите место'], ...arrivalLocations.filter(place => !occupied.has(place.id))
          .map((place): Option => [place.id, `Место ${place.id}`])] } />
    }
    case 'leaveArrival': return <>
      <p>Освободить место {row.arrival_space} на клиентской стоянке?</p>
      <input type="hidden" name="arrival_space" value={row.arrival_space ?? ''} />
    </>
    case 'diagnose':
    case 'moveBay':
    case 'assign': return <AssignmentFields dashboard={dashboard} row={row} bayId={action.destination?.id} />
    case 'dispatchTransfer': return <>
      <p>Механик получит задачу забрать автомобиль с парковки. Пост будет зарезервирован до подтверждения перегона.</p>
      <AssignmentFields dashboard={dashboard} row={row} bayId={action.destination?.id} />
    </>
    case 'cancelTransfer': return <p>Автомобиль останется на месте {row.parking_space}. Резерв поста и назначение механика будут сняты.</p>
    case 'park': {
      const spaces = (dashboard.parking ?? []).filter(space => !space.request_id || space.request_id === row.id)
      return <>
        {spaces.length ? <p>Автомобиль будет ждать запчасти на парковке. Пост и механик освободятся.</p>
          : <p>Все места на парковке заняты.</p>}
        <SelectField label="Место на парковке" name="parking_space" defaultValue={action.destination?.id ?? row.parking_space ?? ''}
          options={ [['', 'Выберите место'], ...spaces.map((space): Option => [space.id, `Место ${space.id}`])] } />
        <TextField label="Какие запчасти ожидаются (видно клиенту)" name="parking_reason" maxLength={600} required={false}
          defaultValue={row.parking_reason ?? ''} />
        <Field label="Ожидаемая дата поставки" name="parts_expected_date" type="date" required={false}
          defaultValue={row.parts_expected_date ?? ''} />
      </>
    }
    case 'estimate':
    case 'addWorkOrder': return <EstimateFields dashboard={dashboard} row={row} additional={key === 'addWorkOrder'} />
    case 'classifyLine': return <>
      <SelectField label="Позиция заказ-наряда" name="line_id" options={(row.work_orders ?? [])
        .filter(document => document.status !== 'declined').flatMap(document => document.lines
          .filter(line => line.unclassified && line.id !== undefined)
          .map((line): Option => [line.id!, `${line.name} · ${document.title}`]))} />
      <SelectField label="Тип позиции" name="line_kind" options={ [['part', 'Запчасть'], ['service', 'Работа']] } />
    </>
    case 'approve':
    case 'decline':
    case 'recordDecision': {
      const document = row.work_orders?.find(item => item.version === action.documentVersion)
      return <>
        {document && <p>{document.title} · <strong>{money(document.total ?? 0)}</strong></p>}
        {key === 'decline' && <TextField label="Причина отказа или что нужно изменить" name="note" />}
        {key === 'recordDecision' && <>
          <SelectField label="Решение клиента" name="decision" options={[
            ['', 'Выберите решение'], ['approve', 'Согласовал заказ-наряд'], ['decline', 'Отклонил заказ-наряд'],
          ]} />
          <TextField label="Как клиент подтвердил своё решение" name="note" />
        </>}
      </>
    }
    case 'startDiagnosis': return <p>Зафиксировать начало диагностики на назначенном посту?</p>
    case 'startRepair': return <p>Зафиксировать начало работы на назначенном посту?</p>
    case 'resume': return <p>Вернуть заказ в работу?</p>
    case 'diagnosisReport':
    case 'repairReport': return <ReportFields repair={key === 'repairReport'} />
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
