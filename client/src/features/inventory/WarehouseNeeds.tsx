import type { WarehouseNeed } from '../../api/types'
import { code } from '../../shared/format'
import { Button, Heading, Panel, Table } from '../../shared/ui'
import { StatusTag } from '../requests/status'
import './warehouse.css'

export function WarehouseNeeds({ needs, onIssue, onOrder, onOpen }: {
  needs: WarehouseNeed[]
  onIssue?: (need: WarehouseNeed) => void
  onOrder?: (need: WarehouseNeed) => void
  onOpen?: (id: number) => void
}) {
  const requests = new Map<number, WarehouseNeed[]>()
  for (const need of needs) {
    const parts = requests.get(need.request_id) ?? []
    parts.push(need)
    requests.set(need.request_id, parts)
  }
  const canManage = Boolean(onIssue && onOrder)
  if (!needs.length) return <Panel title="Потребность в запчастях"><p className="empty">В открытых заказ-нарядах нет запчастей, которые ещё нужно выдать.</p></Panel>

  return <div className="column">
    {[...requests].map(([id, parts]) => {
      const { model, plate, status, bay_id, mechanic } = parts[0]
      return <Panel key={id} title={`${code(id)} · ${model}`}
        action={onOpen ? <Button variant="text-button" onClick={() => onOpen(id)}>Открыть заявку</Button> : <StatusTag status={status} />}>
        <div className="warehouse-assignment">
          <span>{plate}</span>
          {bay_id && <span>Пост {bay_id}</span>}
          <span>{mechanic ?? 'Механик ещё не назначен'}</span>
          {onOpen && <StatusTag status={status} />}
        </div>
        <Table headings={['Запчасть', 'К выдаче', 'На согласовании', 'В наличии', 'В поставке', ...(canManage ? ['Действия'] : [])]}
          rows={parts.map(need => {
            const shortage = need.approved_remaining - need.stock - need.incoming
            return { key: need.part_id ?? 'line-' + need.unclassified_line_id, cells: [
              <><strong>{need.name}</strong><br /><span className="meta">{need.document_titles.join(' · ')}</span><br />
                <span className="meta">{need.sku?.startsWith('AUTO-') ? 'Добавлена вручную'
                  : need.sku ?? 'Тип позиции требует уточнения'}</span></>,
              need.approved_remaining || '—', need.pending || '—',
              need.part_id === null ? '—' : need.stock || <strong>0 · Нет в наличии</strong>, need.incoming || '—',
              ...(canManage ? [<div className="actions warehouse-actions">
                {need.can_issue && need.stock > 0 && <Button onClick={() => onIssue?.(need)}>Выдать</Button>}
                {need.part_id !== null && shortage > 0
                  && <Button variant="text-button" onClick={() => onOrder?.(need)}>Заказать</Button>}
                {need.part_id === null ? <span className="muted">Тип уточняет приёмщик</span>
                  : !need.approved_remaining ? <span className="muted">Ожидает согласования заказ-наряда</span>
                    : !need.can_issue && need.stock > 0 && <span className="muted">Выдача после назначения на пост</span>}
              </div>] : []),
            ] }
          })} />
      </Panel>
    })}
  </div>
}

export function WarehouseDesk({ needs, onIssue, onOrder }: {
  needs: WarehouseNeed[]; onIssue: (need: WarehouseNeed) => void; onOrder: (need: WarehouseNeed) => void
}) {
  return <>
    <Heading title="Потребность в деталях" subtitle="Запчасти из заказ-нарядов, наличие и поставки." />
    <WarehouseNeeds needs={needs} onIssue={onIssue} onOrder={onOrder} />
  </>
}
