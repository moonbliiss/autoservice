import type { RequestSummary } from '../../api/types'
import { Panel } from '../../shared/ui'
import { code } from '../../shared/format'

export function TransferTask({ row, onComplete, busy = false }: {
  row: RequestSummary; onComplete?: () => void; busy?: boolean
}) {
  const transfer = row.transfer
  if (!transfer) return null
  return <Panel inset title="Перегнать автомобиль в цех">
    <p><strong>{row.model} · {row.plate}</strong><span className="muted"> · {code(row.id)}</span></p>
    <p>Парковка, место {row.parking_space} → пост {transfer.bay_id} · {transfer.bay_name}</p>
    <p className="muted">После перегона: {transfer.instructions}</p>
    {onComplete ? <div className="actions"><button type="button" className="primary" disabled={busy} onClick={onComplete}>
      Машина на посту
    </button></div> : <p className="muted">Механик: {transfer.mechanic_name}. Пост зарезервирован.</p>}
  </Panel>
}
