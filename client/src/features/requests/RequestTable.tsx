import type { RequestSummary, Role } from '../../api/types'
import { code, dateTime } from '../../shared/format'
import { Button, Table } from '../../shared/ui'
import { StatusTag } from './status'

export type OpenRequest = (id: number) => void

export function RequestTable({ requests, role, onOpen, empty = 'Нет заявок по выбранным условиям.', archive = false }: {
  requests: RequestSummary[]; role: Role; onOpen: OpenRequest; empty?: string; archive?: boolean
}) {
  const showClient = role === 'advisor' || role === 'manager'
  const mechanic = role === 'mechanic'
  return <Table headings={['Заявка', 'Автомобиль', ...(showClient ? ['Клиент'] : []), 'Статус',
    archive ? 'Дата выдачи' : mechanic ? 'Расположение' : 'Визит / расположение']}
    rows={requests.map(row => ({ key: row.id, onClick: () => onOpen(row.id), cells: [
      <Button variant="table-link" onClick={() => onOpen(row.id)}>
        {code(row.id)}
      </Button>,
      <><strong>{row.model}</strong><br /><span className="meta">{row.plate}</span></>,
      ...(showClient ? [row.client_name] : []),
      <><StatusTag status={row.status} />{row.priority === 'urgent' && <> <span className="tag alert">Срочно</span></>}</>,
      archive ? dateTime(row.issued_at ?? null) || '—' : row.parking_space ? `Парковка · место ${row.parking_space}`
        : row.arrival_space ? `Клиентская стоянка · место ${row.arrival_space}`
          : row.bay_id ? `Пост ${row.bay_id}` : !mechanic && dateTime(row.appointment) || '—',
    ] }))} empty={empty} />
}
