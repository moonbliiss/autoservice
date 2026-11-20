import type { ReactNode } from 'react'
import type { WorkOrderDocument } from '../../api/types'
import { money } from '../../shared/format'
import { Panel } from '../../shared/ui'

const statusLabels = { pending: 'На согласовании', approved: 'Согласован', declined: 'Отклонён' }

export function WorkOrderCard({ document, actions }: {
  document: Pick<WorkOrderDocument, 'title' | 'status'> & {
    total?: number; lines: { id?: number; name: string; quantity: number; unit_price?: number; unclassified?: number }[]
  }
  actions?: ReactNode
}) {
  return <Panel inset title={document.title}>
    <p className="meta">{statusLabels[document.status]}</p>
    {document.lines.map((line, index) => <p className="split line-item" key={line.id ?? index}>
      <span>{line.name} {line.unclassified ? <small className="meta">· тип требует уточнения</small> : null}</span>
      <strong>{line.unit_price === undefined ? `× ${line.quantity}` : `× ${line.quantity} · ${money(line.quantity * line.unit_price)}`}</strong>
    </p>)}
    {document.total !== undefined && <p className="split line-item"><strong>Итого</strong><strong>{money(document.total)}</strong></p>}
    {actions}
  </Panel>
}
