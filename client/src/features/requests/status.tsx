import type { Status } from '../../api/types'
import { statusLabels } from '../../shared/labels'

export const closedStatuses = new Set<Status>(['issued', 'cancelled'])
export const workshopStatuses = new Set<Status>(['diagnosis_assigned', 'diagnosing', 'repair_assigned', 'repairing', 'paused', 'inspection'])

export function StatusTag({ status }: { status?: Status | null }) {
  const variant = !status ? '' : ['new', 'awaiting_estimate', 'awaiting_approval', 'paused'].includes(status) ? 'wait'
    : ['declined', 'cancelled'].includes(status) ? 'alert' : workshopStatuses.has(status) || status === 'ready' ? 'active' : ''
  return <span className={`tag ${variant}`}>{status ? statusLabels[status] : 'Свободен'}</span>
}
