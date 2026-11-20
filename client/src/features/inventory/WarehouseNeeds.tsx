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
  if (!needs.length) return <Panel title="Потребность в запчастях"><p className="empty">По согласованным сметам деталей пока не требуется.</p></Panel>

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
        <Table headings={['Запчасть', 'К выдаче', 'В наличии', 'В поставке', ...(canManage ? ['Действия'] : [])]}
          rows={parts.map(need => {
            const remaining = need.required - need.issued
            const shortage = remaining - need.stock - need.incoming
            return { key: need.part_id, cells: [
              <><strong>{need.name}</strong><br /><span className="meta">{need.sku}</span></>,
              remaining, need.stock, need.incoming || '—',
              ...(canManage ? [<div className="actions warehouse-actions">
                {need.can_issue && need.stock > 0 && <Button onClick={() => onIssue?.(need)}>Выдать</Button>}
                {shortage > 0 && <Button variant="text-button" onClick={() => onOrder?.(need)}>Заказать</Button>}
                {!need.can_issue && need.stock > 0 && <span className="muted">Выдача после назначения на пост</span>}
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
    <Heading title="Потребность в деталях" subtitle="Детали по согласованным сметам. Что можно выдать механику и что ещё нужно заказать." />
    <WarehouseNeeds needs={needs} onIssue={onIssue} onOrder={onOrder} />
  </>
}
