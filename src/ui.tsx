import type { ReactNode } from 'react'
import { statusLabels, type Status } from './api'

const currency = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
export const money = (amount: number) => currency.format(amount) + ' ₽'
export const number = (value: number) => value.toLocaleString('ru-RU')
export const code = (id: number) => '#' + String(id).padStart(4, '0')
export const dateOnly = (value: string | null) => value ? new Date(value + 'T12:00:00').toLocaleDateString('ru-RU') : ''
export function dateTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
export const closedStatuses = new Set<Status>(['issued', 'cancelled'])
export const workshopStatuses = new Set<Status>(['diagnosis_assigned', 'diagnosing', 'repair_assigned', 'repairing', 'paused', 'inspection'])

export function Button({ children, onClick, variant = 'secondary' }: {
  children: ReactNode; onClick: () => void; variant?: string
}) {
  return <button type="button" className={variant} onClick={onClick}>{children}</button>
}

export function StatusTag({ status }: { status?: Status | null }) {
  const variant = !status ? '' : ['new', 'awaiting_estimate', 'awaiting_approval', 'paused'].includes(status) ? 'wait'
    : ['declined', 'cancelled'].includes(status) ? 'alert' : workshopStatuses.has(status) || status === 'ready' ? 'active' : ''
  return <span className={`tag ${variant}`}>{status ? statusLabels[status] : 'Свободен'}</span>
}

export function Heading({ title, subtitle, action, eyebrow }: {
  title: string; subtitle?: string; action?: ReactNode; eyebrow?: string
}) {
  return <div className="title-row"><div>
    {eyebrow && <p className="overline">{eyebrow}</p>}
    <h1>{title}</h1>{subtitle && <p className="subtitle">{subtitle}</p>}
  </div>{action}</div>
}

export function Metrics({ items }: { items: [string, string | number][] }) {
  return <div className="metrics">{items.map(([label, value]) =>
    <div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>
  )}</div>
}

export function Panel({ title, children, inset = false, action }: {
  title: string; children: ReactNode; inset?: boolean; action?: ReactNode
}) {
  return <section className={inset ? 'panel inset' : 'panel'}>
    {inset ? <h2>{title}</h2> : <div className="panel-head"><h2>{title}</h2>{action}</div>}
    {children}
  </section>
}

export function Table({ headings, rows, empty = 'Здесь пока ничего нет.' }: {
  headings: string[]; rows: { key: string | number; cells: ReactNode[] }[]; empty?: string
}) {
  if (!rows.length) return <p className="empty">{empty}</p>
  return <div className="table-wrap"><table>
    <thead><tr>{headings.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
    <tbody>{rows.map(({ key, cells }) => <tr key={key}>{cells.map((cell, index) => <td key={headings[index]}>{cell}</td>)}</tr>)}</tbody>
  </table></div>
}
