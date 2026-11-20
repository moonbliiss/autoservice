import type { RequestSummary, Role } from '../../api/types'
import { code, dateTime } from '../../shared/format'
import { Button, Table } from '../../shared/ui'
import { StatusTag } from './status'

export type OpenRequest = (id: number) => void

export function RequestTable({ requests, role, onOpen }: { requests: RequestSummary[]; role: Role; onOpen: OpenRequest }) {
  const advisor = role === 'advisor'
  const mechanic = role === 'mechanic'
  return <Table headings={['Заявка', 'Автомобиль', ...(advisor ? ['Клиент'] : []), 'Статус', mechanic ? 'Пост' : 'Визит']}
    rows={requests.map(row => ({ key: row.id, cells: [
      <Button variant="table-link" onClick={() => onOpen(row.id)}>{code(row.id)}</Button>,
      <><strong>{row.model}</strong><br /><span className="meta">{row.plate}</span></>,
      ...(advisor ? [row.client_name] : []),
      <><StatusTag status={row.status} />{row.priority === 'urgent' && <> <span className="tag alert">Срочно</span></>}</>,
      mechanic ? (row.bay_id ? `Пост ${row.bay_id}` : '—') : dateTime(row.appointment) || '—',
    ] }))} empty="Нет заявок по выбранным условиям." />
}
