import { useState } from 'react'
import type { Dashboard, PartSupply } from '../../api/types'
import { code } from '../../shared/format'
import { Field, SelectField, type Option } from './fields'

export function OrderSupplyFields({ dashboard, requestId, partId }: { dashboard: Dashboard; requestId?: number; partId?: number }) {
  const [part, setPart] = useState(partId ? String(partId) : '')
  const requests = dashboard.requests.filter(row => !['cancelled', 'ready', 'issued'].includes(row.status))

  return <>
    <SelectField label="Запчасть" name="part_id" value={part} onChange={setPart} options={[
      ['', 'Выберите запчасть'],
      ...(dashboard.parts ?? []).map((item): Option => [item.id, `${item.name} · ${item.sku} · Остаток: ${item.stock}`]),
      ['new', 'Добавить новую запчасть'],
    ]} />
    {part === 'new' && <>
      <div className="fields-row">
        <Field label="Артикул" name="sku" maxLength={40} />
        <Field label="Название запчасти" name="name" maxLength={100} />
      </div>
      <Field label="Цена за единицу, ₽" name="price" type="number" min={0} max={1000000} />
    </>}
    <Field label="Поставщик" name="supplier" maxLength={120} />
    <div className="fields-row">
      <Field label="Количество" name="quantity" type="number" defaultValue={1} min={1} max={10000} />
      <Field label="Ожидаемая дата поставки" name="expected_date" type="date" required={false} />
    </div>
    <SelectField label="Для какой заявки" name="request_id" required={false} defaultValue={requestId ?? ''}
      options={ [['', 'Пополнение склада'], ...requests.map((row): Option => [row.id, `${code(row.id)} · ${row.model} · ${row.plate}`])] } />
  </>
}

export function ReceiveSupplyFields({ supply }: { supply: PartSupply }) {
  const remaining = supply.quantity - supply.received
  return <>
    <p><strong>{supply.name}</strong><br /><span className="muted">{supply.supplier} · осталось принять {remaining}</span></p>
    <Field label="Поступило" name="quantity" type="number" defaultValue={remaining} min={1} max={remaining} />
    <Field label="Номер накладной (по желанию)" name="note" maxLength={120} required={false} />
  </>
}
