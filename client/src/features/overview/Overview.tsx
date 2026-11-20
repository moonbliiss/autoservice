import type { Dashboard, RequestSummary, Status } from '../../api/types'
import { code } from '../../shared/format'
import { statusLabels } from '../../shared/labels'
import { Button, Heading, Metrics, Panel } from '../../shared/ui'
import { StatusTag, closedStatuses, workshopStatuses } from '../requests/status'
import { RequestTable, type OpenRequest } from '../requests/RequestTable'
import { WorkshopFloor, type MoveRequest } from '../garage/WorkshopFloor'
import { TransferTask } from '../requests/TransferTask'
import { WorkTimer } from '../requests/WorkTimer'
import './overview.css'

function needsWorkshopAssignment(row: RequestSummary) {
  return row.status === 'received' || row.status === 'approved' || (row.status === 'paused' && !row.bay_id)
}

function AdvisorRequests({ requests, onOpen }: { requests: RequestSummary[]; onOpen: OpenRequest }) {
  const unassigned: RequestSummary[] = []
  const byStatus = new Map<Status, RequestSummary[]>()

  for (const row of requests) {
    if (closedStatuses.has(row.status)) continue
    if (needsWorkshopAssignment(row)) {
      unassigned.push(row)
      continue
    }
    const group = byStatus.get(row.status)
    if (group) group.push(row)
    else byStatus.set(row.status, [row])
  }

  const groups = [
    { title: 'Ждут назначения в цех', rows: unassigned },
    ...(Object.keys(statusLabels) as Status[]).map(status => ({ title: statusLabels[status], rows: byStatus.get(status) ?? [] })),
  ].filter(group => group.rows.length > 0)

  return <div className="map-queue">
    {groups.map(({ title, rows }) => <section key={title}>
      <h3>{title}</h3>
      {rows.map(row => <Button key={row.id} variant="text-button" onClick={() => onOpen(row.id)}>
        {code(row.id)} · {row.model} <span className="meta">{row.plate}</span>
      </Button>)}
    </section>)}
  </div>
}

export function Overview({ dashboard, onMove, onOpen, onNewRequest, onNewArrival, onRequests, onStock, onCompleteTransfer, submitting }: {
  dashboard: Dashboard; onOpen: OpenRequest; onNewRequest: () => void; onRequests: () => void; onMove: MoveRequest; onStock: () => void;
  onNewArrival: (place: number) => void;
  onCompleteTransfer: (row: RequestSummary) => void; submitting: boolean
}) {
  const { requests, user: { role }, bays = [] } = dashboard
  const ready = requests.filter(row => row.status === 'ready').length
  if (role === 'client') return <>
    <Heading title="Мои заявки" subtitle="Следите за визитом, согласованием заказ-нарядов и готовностью автомобиля."
      eyebrow="КАБИНЕТ КЛИЕНТА" action={<Button variant="primary" onClick={onNewRequest}>Новая заявка</Button>} />
    <Metrics items={[
      ['Открытые заявки', requests.filter(row => !closedStatuses.has(row.status)).length],
      ['На согласовании', requests.filter(row => row.status === 'awaiting_approval').length], ['Готовы к выдаче', ready],
    ]} />
    <Panel title="История обслуживания"><RequestTable requests={requests} role={role} onOpen={onOpen} /></Panel>
  </>
  const floor = <WorkshopFloor key={dashboard.user.id} dashboard={dashboard} onOpen={onOpen} onMove={onMove}
    onOpenStock={role === 'advisor' || role === 'manager' ? onStock : undefined}
    onNewRequest={role === 'advisor' ? onNewRequest : undefined} onNewArrival={role === 'advisor' ? onNewArrival : undefined}
    queues={role === 'advisor' && requests.some(row => !closedStatuses.has(row.status))
      ? <AdvisorRequests requests={requests} onOpen={onOpen} /> : undefined} />
  if (role === 'advisor') return floor
  if (role === 'mechanic') {
    const transfer = requests.find(row => row.transfer && row.assigned_to_me)
    const active = requests.find(row => row.status !== 'paused' && workshopStatuses.has(row.status) && row.bay_id && row.assigned_to_me)
    return <>
      <Heading title="Моя смена" subtitle="Текущий пост, задача и результаты работы." eyebrow="КАБИНЕТ МЕХАНИКА" />
      {transfer ? <TransferTask row={transfer} busy={submitting} onComplete={() => onCompleteTransfer(transfer)} />
        : active ? <Panel inset title={`Ваш пост ${String(active.bay_id).padStart(2, '0')} · ${bays.find(bay => bay.id === active.bay_id)?.name ?? ''}`}>
        <div className="split"><div><strong>{active.model}</strong><p className="muted">{active.plate}</p></div><StatusTag status={active.status} /></div>
        <WorkTimer timer={active.work_timer} />
        <div className="actions"><Button variant="primary" onClick={() => onOpen(active.id)}>Открыть задачу</Button></div>
      </Panel> : <Panel inset title="Текущий пост"><p className="muted">Активного назначения пока нет.</p></Panel>}
      <div className="section-gap" />{floor}
      <Panel title="Задачи смены"><RequestTable requests={requests} role={role} onOpen={onOpen} /></Panel>
    </>
  }
  return <>
    <Heading title="Обзор автосервиса" subtitle="Загрузка цеха и движение заказов" eyebrow="КАБИНЕТ УПРАВЛЯЮЩЕГО" />
    <Metrics items={[
      ['Новые заявки', requests.filter(row => row.status === 'new').length],
      ['Занятые посты', `${bays.filter(bay => bay.status).length} / ${bays.length}`], ['Готовы к выдаче', ready],
    ]} />
    {floor}
    <Panel title="Ждут назначения в цех">
      <RequestTable requests={requests.filter(needsWorkshopAssignment)} role={role} onOpen={onOpen}
        empty="Все принятые автомобили распределены." />
    </Panel>
    <Panel title="Недавние заявки" action={<Button variant="text-button" onClick={onRequests}>Все заявки</Button>}>
      <RequestTable requests={requests.filter(row => row.status !== 'issued').slice(0, 5)} role={role} onOpen={onOpen} />
    </Panel>
  </>
}
