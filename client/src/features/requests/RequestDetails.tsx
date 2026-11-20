import type { RequestAction, RequestDetail, Role } from '../../api/types'
import { code, dateOnly, dateTime, money, number } from '../../shared/format'
import { actionLabels, paymentLabels } from '../../shared/labels'
import { Button, Heading, Panel } from '../../shared/ui'
import { ParkingStatus } from './ParkingStatus'
import { TransferTask } from './TransferTask'
import { StatusTag } from './status'
import './request-details.css'

const actionOrder: RequestAction[] = [
  'receive', 'schedule', 'cancel', 'diagnose', 'startDiagnosis', 'diagnosisReport', 'estimate',
  'approve', 'decline', 'recordDecision', 'dispatchTransfer', 'cancelTransfer', 'assign', 'startRepair', 'resume', 'repairReport', 'park', 'moveBay',
  'pause', 'release', 'ready', 'rework', 'returnCar', 'payment', 'issue',
]

function EstimatePanel({ row, role }: { row: RequestDetail; role: Role }) {
  if (!row.estimate.length) return null
  if (role === 'mechanic') return <Panel inset title="Согласованные позиции">
    {row.estimate.map((line, index) => <p className="split line-item" key={index}><span>{line.name}</span><strong>× {line.quantity}</strong></p>)}
  </Panel>
  return <Panel inset title={'Смета · версия ' + row.estimate_version}>
    {row.estimate.map(line => <p className="split line-item" key={line.id}>
      <span>{line.name} <small className="meta">× {line.quantity}</small></span>
      <strong>{money(line.quantity * (line.unit_price ?? 0))}</strong>
    </p>)}
    <p className="split line-item"><strong>{row.status === 'declined' ? 'Отклонена клиентом' : 'По смете'}</strong>
      <strong>{money(row.estimate.reduce((sum, line) => sum + line.quantity * (line.unit_price ?? 0), 0))}</strong></p>
  </Panel>
}

function PaymentPanel({ row }: { row: RequestDetail }) {
  if (row.paid === undefined || row.total === undefined || !['ready', 'issued'].includes(row.status)) return null
  return <Panel inset title="Оплата">
    <p className="split"><span>Оплачено</span><strong>{money(row.paid)}</strong></p>
    <p className="split"><span>Осталось</span><strong>{money(row.total - row.paid)}</strong></p>
    {row.payments?.map(payment => <p className="split line-item" key={payment.id}>
      <span>{paymentLabels[payment.method]} · {dateTime(payment.created_at)}</span><strong>{money(payment.amount)}</strong>
    </p>)}
  </Panel>
}

function ReportsPanel({ row }: { row: RequestDetail }) {
  if (!row.reports.length) return null
  return <Panel inset title="Отчёты механиков">{row.reports.map(report => <article className="report" key={report.id}>
    <h3>{report.kind === 'diagnosis' ? 'Диагностика' : 'Ремонт'}</h3>
    <p className="meta">{report.mechanic} · {report.minutes} мин · {dateTime(report.created_at)}</p>
    <p className="request-text">{report.result}</p>
    {report.recommendations && <p className="request-text">Рекомендации: {report.recommendations}</p>}
    {report.parts && <p className="request-text">Израсходовано: {report.parts}</p>}
  </article>)}</Panel>
}

function actionTitle(action: RequestAction, row: RequestDetail) {
  if (action === 'schedule' && row.appointment) return 'Перенести визит'
  if (action === 'estimate' && row.estimate_version) return 'Пересмотреть смету'
  if (action === 'assign' && row.status === 'repair_assigned') return 'Изменить назначение'
  if (action === 'dispatchTransfer' && row.transfer) return 'Изменить назначение перегона'
  if (action === 'diagnose' && row.status === 'diagnosis_assigned') return 'Изменить назначение диагностики'
  if (action === 'park' && row.parking_space) return 'Изменить место или срок поставки'
  return actionLabels[action]
}

export function RequestDetails({ row, role, onAction, onBack, onCompleteTransfer, submitting }: {
  row: RequestDetail; role: Role; onAction: (action: RequestAction) => void; onBack: () => void;
  onCompleteTransfer: (row: RequestDetail) => void; submitting: boolean
}) {
  const actions = actionOrder.filter(key => row.actions.includes(key))
  const facts = [
    ['Пробег', row.mileage !== null ? number(row.mileage) + ' км' : null],
    ['Желаемая дата', dateOnly(row.preferred_date)], ['Визит', dateTime(row.appointment)], ['Ожидаемая готовность', dateTime(row.eta)],
    ['Клиент', row.client_name], ['Телефон', row.client_phone], ['VIN', row.vin], ['Исполнитель', row.mechanic_name],
  ]
  const expected = row.assigned_to_me && (
    ['diagnosis_assigned', 'diagnosing'].includes(row.status) ? 'В отчёте укажите результаты проверки, причину неисправности, время и рекомендации.'
      : ['repair_assigned', 'repairing', 'paused'].includes(row.status)
        ? 'В отчёте укажите выполненные работы, результаты проверки и затраченное время.' : ''
  )
  const needed = new Map(row.estimate.filter(line => line.part_id !== null && (row.parts_remaining?.[line.part_id] ?? 0) > 0)
    .map(line => [line.part_id!, line.name]))
  return <>
    <div className="back"><Button variant="text-button" onClick={onBack}>К списку</Button></div>
    <Heading title={row.model}
      subtitle={[row.plate, 'Заявка ' + code(row.id), row.order_id ? 'Заказ-наряд ' + code(row.order_id) : null].filter(Boolean).join(' · ')}
      action={<StatusTag status={row.status} />} />
    <div className="detail-grid">
      <div className="column">
        <TransferTask row={row} busy={submitting}
          onComplete={row.actions.includes('completeTransfer') ? () => onCompleteTransfer(row) : undefined} />
        <ParkingStatus {...row} />
        {role === 'client' && row.visit_note && <Panel inset title="Информация о визите"><p>{row.visit_note}</p></Panel>}
        {row.work_instructions && role !== 'client' && <Panel inset title={row.bay_id ? `Пост ${row.bay_id} · ${row.bay_name}` : 'Последнее задание'}>
          <p className="request-text">{row.work_instructions}</p>
          {expected && <p className="job-output muted">{expected}</p>}
          {row.pause_reason && <p className="muted request-text">Пауза: {row.pause_reason}</p>}
          {row.resume_blocked && <p className="muted">Сначала завершите или поставьте на паузу текущую задачу.</p>}
        </Panel>}
        {row.description && <Panel inset title="Обращение"><p className="request-text">{row.description}</p>
          <dl className="facts">{facts.filter(([, value]) => value != null && value !== '').map(([label, value]) =>
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          )}</dl>
          {row.intake_note && <p className="request-text meta">Приёмка: {row.intake_note}</p>}
          {row.inspection_note && <p className="request-text meta">Контроль качества: {row.inspection_note}</p>}
          {row.tracking_token && <p className="tracking-link">
            <a href={`/tracking#${row.tracking_token}`} target="_blank" rel="noreferrer">Страница статуса для клиента</a>
            <span className="muted"> Доступна по ссылке на компьютере, где запущена мастерская.</span>
          </p>}
          {actions.length > 0 && <div className="actions">{actions.map((key, index) =>
            <Button key={key} variant={index === 0 ? 'primary' : 'secondary'} onClick={() => onAction(key)}>{actionTitle(key, row)}</Button>
          )}</div>}
        </Panel>}
        <EstimatePanel row={row} role={role} />
        {role === 'mechanic' && row.assigned_to_me && ['repair_assigned', 'repairing', 'paused'].includes(row.status) && needed.size > 0
          && <Panel inset title="Получить у запчастиста">
            {[...needed].map(([id, name]) => <p className="split line-item" key={id}>
              <span>{name}</span><strong>× {row.parts_remaining?.[id]}</strong>
            </p>)}
          </Panel>}
        {Boolean(row.stock_usage?.length) && <Panel inset title="Выдано со склада">
          {row.stock_usage?.map(part => <p className="split line-item" key={part.part_id}><span>{part.name}</span><strong>× {part.quantity}</strong></p>)}
        </Panel>}
        <ReportsPanel row={row} />
      </div>
      <div className="column"><PaymentPanel row={row} />
        <Panel inset title="История заявки"><ol className="timeline">{row.history.map((event, index) =>
          <li key={index}><h3>{event.title}</h3><time className="muted">{dateTime(event.created_at)}</time>
            {event.note && <p className="request-text">{event.note}</p>}</li>
        )}</ol></Panel>
      </div>
    </div>
  </>
}
