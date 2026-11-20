import type { Dashboard } from '../../api/types'
import { Button, Heading, Metrics, Panel } from '../../shared/ui'
import { StatusTag, closedStatuses, workshopStatuses } from '../requests/status'
import { RequestTable, type OpenRequest } from '../requests/RequestTable'
import { WorkshopFloor } from '../garage/WorkshopFloor'
import { ParkingLot } from '../garage/ParkingLot'
import './overview.css'

export function Overview({ dashboard, selectedBay, onSelectBay, onOpen, onNewRequest, onRequests }: {
  dashboard: Dashboard; selectedBay: number; onSelectBay: (id: number) => void; onOpen: OpenRequest;
  onNewRequest: () => void; onRequests: () => void
}) {
  const { requests, user: { role }, bays = [] } = dashboard
  const ready = requests.filter(row => row.status === 'ready').length
  if (role === 'client') return <>
    <Heading title="Мои заявки" subtitle="Следите за визитом, согласованием сметы и готовностью автомобиля."
      eyebrow="КАБИНЕТ КЛИЕНТА" action={<Button variant="primary" onClick={onNewRequest}>Новая заявка</Button>} />
    <Metrics items={[
      ['Открытые заявки', requests.filter(row => !closedStatuses.has(row.status)).length],
      ['На согласовании', requests.filter(row => row.status === 'awaiting_approval').length], ['Готовы к выдаче', ready],
    ]} />
    <Panel title="История обслуживания"><RequestTable requests={requests} role={role} onOpen={onOpen} /></Panel>
  </>
  const floor = <WorkshopFloor dashboard={dashboard} selectedBay={selectedBay} onOpen={onOpen} onSelectBay={onSelectBay} />
  const parking = <ParkingLot spaces={dashboard.parking ?? []} visibleRequests={new Set(requests.map(row => row.id))} onOpen={onOpen} />
  if (role === 'mechanic') {
    const active = requests.find(row => workshopStatuses.has(row.status) && row.bay_id && row.assigned_to_me)
    return <>
      <Heading title="Моя смена" subtitle="Текущий пост, задача и результаты работы." eyebrow="КАБИНЕТ МЕХАНИКА" />
      {active ? <Panel inset title={`Ваш пост ${String(active.bay_id).padStart(2, '0')} · ${bays.find(bay => bay.id === active.bay_id)?.name ?? ''}`}>
        <div className="split"><div><strong>{active.model}</strong><p className="muted">{active.plate}</p></div><StatusTag status={active.status} /></div>
        <div className="actions"><Button variant="primary" onClick={() => onOpen(active.id)}>Открыть задачу</Button></div>
      </Panel> : <Panel inset title="Текущий пост"><p className="muted">Активного назначения пока нет.</p></Panel>}
      <div className="section-gap" />{floor}{parking}
      <Panel title="Задачи смены"><RequestTable requests={requests} role={role} onOpen={onOpen} /></Panel>
    </>
  }
  const unassigned = requests.filter(row => row.status === 'received' || row.status === 'approved' || row.status === 'paused' && !row.bay_id)
  return <>
    <Heading title="Карта сервиса" subtitle="Загрузка цеха и движение заказов" eyebrow="РАБОЧЕЕ МЕСТО ПРИЁМЩИКА"
      action={<Button variant="primary" onClick={onNewRequest}>Новая заявка</Button>} />
    <Metrics items={[
      ['Новые заявки', requests.filter(row => row.status === 'new').length],
      ['Занятые посты', `${bays.filter(bay => bay.status).length} / ${bays.length}`], ['Готовы к выдаче', ready],
    ]} />
    {floor}{parking}
    <Panel title="Ждут назначения в цех">
      <RequestTable requests={unassigned} role={role} onOpen={onOpen} assignmentQueue empty="Все принятые автомобили распределены." />
    </Panel>
    <Panel title="Недавние заявки" action={<Button variant="text-button" onClick={onRequests}>Все заявки</Button>}>
      <RequestTable requests={requests.slice(0, 5)} role={role} onOpen={onOpen} />
    </Panel>
  </>
}
