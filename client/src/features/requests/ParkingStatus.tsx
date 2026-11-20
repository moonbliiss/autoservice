import type { RequestDetail } from '../../api/types'
import { dateOnly } from '../../shared/format'
import { Panel } from '../../shared/ui'

export function ParkingStatus({ parking_space, parking_reason, parts_expected_date }: Pick<RequestDetail,
  'parking_space' | 'parking_reason' | 'parts_expected_date'>) {
  if (parking_space === null) return null
  return <Panel inset title={`Парковка · место ${parking_space}`}>
    <p>{parking_reason ?? 'Ожидаются запчасти для продолжения работ.'}</p>
    {parts_expected_date && <p className="muted">Ожидаемая поставка: {dateOnly(parts_expected_date)}</p>}
  </Panel>
}
