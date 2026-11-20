import type { RequestSummary, Role } from '../../api/types'
import { code, dateTime } from '../../shared/format'
import { Button, Table } from '../../shared/ui'
import { StatusTag } from './status'

export type OpenRequest = (id: number) => void

export function RequestTable({ requests, role, onOpen, empty = 'Нет заявок по выбранным условиям.', assignmentQueue = false }: {
  requests: RequestSummary[]; role: Role; onOpen: OpenRequest; empty?: string; assignmentQueue?: boolean
}) {
  const showClient = role === 'advisor' || role === 'manager'
  const mechanic = role === 'mechanic'
  return <Table headings={['Заявка', 'Автомобиль', ...(showClient ? ['Клиент'] : []), 'Статус', mechanic ? 'Расположение' : 'Визит / расположение']}
    rows={requests.map(row => ({ key: row.id, onClick: () => onOpen(row.id), cells: [
      <Button variant="table-link" onClick={() => onOpen(row.id)}>
        {code(row.id)}{assignmentQueue && ' · Назначить задачу'}
      </Button>,
      <><strong>{row.model}</strong><br /><span className="meta">{row.plate}</span></>,
      ...(showClient ? [row.client_name] : []),
      <><StatusTag status={row.status} />{row.priority === 'urgent' && <> <span className="tag alert">Срочно</span></>}</>,
      row.parking_space ? `Парковка · место ${row.parking_space}`
        : row.bay_id ? `Пост ${row.bay_id}` : !mechanic && dateTime(row.appointment) || '—',
    ] }))} empty={empty} />
}
