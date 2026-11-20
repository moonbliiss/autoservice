import { useState } from 'react'
import type { Dashboard } from '../../api/types'
import { Field, SelectField, TextField, type Option } from './fields'

export function AdvisorRequestFields({ clients = [], vehicles = [] }: Pick<Dashboard, 'clients' | 'vehicles'>) {
  const [clientId, setClientId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [acceptNow, setAcceptNow] = useState(true)
  const clientVehicles = vehicles.filter(vehicle => String(vehicle.client_id) === clientId)
  const vehicle = clientVehicles.find(item => String(item.id) === vehicleId)

  return <>
    <SelectField label="Клиент" name="client_id" value={clientId} onChange={value => {
      setClientId(value)
      setVehicleId('')
    }} options={[['', 'Новый клиент'], ...clients.map((client): Option => [
      client.id, [client.name, client.phone].filter(Boolean).join(' · '),
    ])]} required={false} />
    {!clientId && <div className="fields-row">
      <Field label="Имя клиента" name="client_name" maxLength={100} />
      <Field label="Телефон клиента" name="client_phone" type="tel" maxLength={40} />
    </div>}
    {clientVehicles.length > 0 && <SelectField label="Автомобиль" name="vehicle_id" value={vehicleId} onChange={setVehicleId}
      options={[['', 'Новый автомобиль'], ...clientVehicles.map((item): Option => [item.id, `${item.model} · ${item.plate}`])]} required={false} />}
    {!vehicle && <>
      <div className="fields-row">
        <Field label="Марка и модель" name="model" maxLength={80} />
        <Field label="Госномер" name="plate" maxLength={18} />
      </div>
      <Field label="VIN (по желанию)" name="vin" maxLength={17} required={false} />
    </>}
    <TextField label="Что нужно проверить или сделать?" name="description" />
    <label className="check-field"><input type="checkbox" name="accept_now" value="yes" checked={acceptNow}
      onChange={event => setAcceptNow(event.target.checked)} /> Автомобиль уже в сервисе</label>
    {acceptNow ? <>
      <div className="fields-row">
        <Field key={vehicleId} label="Пробег, км" name="mileage" type="number" defaultValue={vehicle?.mileage ?? ''} min={0} max={5000000} />
        <SelectField label="Приоритет" name="priority" options={ [['normal', 'Обычный'], ['urgent', 'Срочный']] } />
      </div>
      <TextField label="Состояние при приёмке и комплектность" name="note" required={false} />
    </> : <Field label="Желаемая дата (по желанию)" name="preferred_date" type="date" required={false} />}
  </>
}
