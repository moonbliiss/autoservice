import type { Dashboard, RequestAction, RequestSummary, Status } from '../../api/types'
import { code } from '../../shared/format'
import { presenceLabels, roleLabels, statusLabels } from '../../shared/labels'
import { Button, Heading, Metrics, Panel } from '../../shared/ui'
import { StatusTag, closedStatuses, workshopStatuses } from '../requests/status'
import { RequestTable, type OpenRequest } from '../requests/RequestTable'
import { WorkshopFloor, type MoveRequest } from '../garage/WorkshopFloor'
import { WorkTimer } from '../requests/WorkTimer'
import './overview.css'

function needsWorkshopAssignment(row: RequestSummary) {
  return row.status === 'received' || row.status === 'approved' || (row.status === 'paused' && !row.bay_id)
}

function AdvisorRequests({ requests, onOpen, onMapAction }: {
  requests: RequestSummary[]; onOpen: OpenRequest; onMapAction: (id: number, action: RequestAction) => void
}) {
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
      {rows.map(row => <div key={row.id}>
        <Button variant="text-button" onClick={() => onOpen(row.id)}>
          {code(row.id)} · {row.model} <span className="meta">{row.plate}</span>
        </Button>
        {row.status === 'ready' && !row.arrival_space && row.map_actions?.includes('markPickupParking')
          && <Button variant="text-button" onClick={() => onMapAction(row.id, 'markPickupParking')}>Указать место выдачи</Button>}
      </div>)}
    </section>)}
  </div>
}

export function Overview({ dashboard, onMove, onMapAction, onOpen, onNewRequest, onNewArrival, onRequests, onStock, onCompleteTransfer, submitting }: {
  dashboard: Dashboard; onOpen: OpenRequest; onNewRequest: () => void; onRequests: () => void; onMove: MoveRequest; onStock: () => void;
  onMapAction: (id: number, action: RequestAction) => void;
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
  const transfer = role === 'mechanic' ? requests.find(row => row.transfer && row.assigned_to_me) : undefined
  const active = role === 'mechanic'
    ? requests.find(row => row.status !== 'paused' && workshopStatuses.has(row.status) && row.bay_id && row.assigned_to_me) : undefined
  const shift = role === 'mechanic' && <header className="map-toolbar shift-toolbar">
    <h1>Моя смена</h1>
    {Boolean(dashboard.staff_presence?.length) && <ul className="shift-presence" aria-label="Присутствие сотрудников">
      {dashboard.staff_presence?.map(person => <li key={person.id}>
        <span className="presence-dot" data-status={person.status ?? ''} aria-hidden="true" />
        <strong>{roleLabels[person.role]}</strong>
        <span>{person.status ? presenceLabels[person.status] : 'Не отмечено'}</span>
      </li>)}
    </ul>}
    {transfer?.transfer ? <div className="shift-task">
      <h2>Перегнать автомобиль в цех</h2>
      <p>{transfer.model} · место {transfer.parking_space} → пост {transfer.transfer.bay_id}</p>
      <button type="button" className="primary" disabled={submitting} onClick={() => onCompleteTransfer(transfer)}>Машина на посту</button>
      <Button variant="text-button" onClick={() => onOpen(transfer.id)}>Открыть задачу</Button>
    </div> : active ? <div className="shift-task">
      <p><strong>Пост {active.bay_id} · {active.model}</strong> <StatusTag status={active.status} /></p>
      {active.status === 'pickup_pending' ? <>
        <p>Перегони на клиентскую парковку и отметь место.</p>
        <Button variant="primary" onClick={() => onMapAction(active.id, 'markPickupParking')}>Указать место выдачи</Button>
      </> : <>
        <WorkTimer timer={active.work_timer} />
        <Button variant="text-button" onClick={() => onOpen(active.id)}>Открыть задачу</Button>
      </>}
    </div> : <p className="shift-task muted">Активного назначения пока нет.</p>}
  </header>
  const floor = <WorkshopFloor key={dashboard.user.id} dashboard={dashboard} onOpen={onOpen} onMove={onMove} onMapAction={onMapAction} shift={shift}
    onOpenStock={role === 'advisor' || role === 'manager' ? onStock : undefined}
    onNewRequest={role === 'advisor' ? onNewRequest : undefined} onNewArrival={role === 'advisor' ? onNewArrival : undefined}
    queues={role === 'advisor' && requests.some(row => !closedStatuses.has(row.status))
      ? <AdvisorRequests requests={requests} onOpen={onOpen} onMapAction={onMapAction} /> : undefined} />
  if (role === 'advisor' || role === 'mechanic') return floor
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
