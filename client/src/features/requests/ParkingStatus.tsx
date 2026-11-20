import type { RequestDetail } from '../../api/types'
import { dateOnly } from '../../shared/format'
import { Panel } from '../../shared/ui'

export function ParkingStatus({ parking_space, parking_reason, parts_expected_date, status }: Pick<RequestDetail,
  'parking_space' | 'parking_reason' | 'parts_expected_date' | 'status'>) {
  if (parking_space === null) return null
  const awaitingTransfer = status === 'transfer_pending'
  return <Panel inset title={`Парковка · место ${parking_space}`}>
    <p>{awaitingTransfer ? 'Автомобиль пока на парковке.' : parking_reason ?? 'Ожидаются запчасти для продолжения работ.'}</p>
    {!awaitingTransfer && parts_expected_date && <p className="muted">Ожидаемая поставка: {dateOnly(parts_expected_date)}</p>}
  </Panel>
}
