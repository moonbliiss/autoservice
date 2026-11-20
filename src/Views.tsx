import { actionLabels, paymentLabels, statusLabels, type Dashboard, type RequestAction, type RequestDetail, type RequestSummary, type Role } from './api'
import { Button, Heading, Metrics, Panel, StatusTag, Table, closedStatuses, code, dateOnly, dateTime, money, number, workshopStatuses } from './ui'
import { GarageMap } from './GarageMap'

export type Section = 'overview' | 'requests' | 'stock' | 'cars'
export const navigation: Record<Role, [Section, string, string][]> = {
  advisor: [['overview', '▦', 'Обзор'], ['requests', '▤', 'Заказы и заявки'], ['stock', '▥', 'Склад']],
  mechanic: [['overview', '▦', 'Моя смена'], ['requests', '▤', 'Мои задачи']],
  client: [['overview', '▤', 'Мои заявки'], ['cars', '▥', 'Автомобили']],
}

const actionOrder: RequestAction[] = [
  'receive', 'schedule', 'cancel', 'diagnose', 'startDiagnosis', 'diagnosisReport', 'estimate',
  'approve', 'decline', 'assign', 'startRepair', 'resume', 'repairReport', 'pause', 'release', 'ready', 'rework', 'returnCar', 'payment', 'issue',
]

type OpenRequest = (id: number) => void

function RequestTable({ requests, role, onOpen }: { requests: RequestSummary[]; role: Role; onOpen: OpenRequest }) {
  const advisor = role === 'advisor'
  const mechanic = role === 'mechanic'
  return <Table headings={['Заявка', 'Автомобиль', ...(advisor ? ['Клиент'] : []), 'Статус', mechanic ? 'Пост' : 'Визит']}
    rows={requests.map(row => ({ key: row.id, cells: [
      <Button variant="table-link" onClick={() => onOpen(row.id)}>{code(row.id)}</Button>,
      <><strong>{row.model}</strong><br /><span className="meta">{row.plate}</span></>,
      ...(advisor ? [row.client_name] : []),
      <><StatusTag status={row.status} />{row.priority === 'urgent' && <> <span className="tag alert">Срочно</span></>}</>,
      mechanic ? (row.bay_id ? `Пост ${row.bay_id}` : '—') : dateTime(row.appointment) || '—',
    ] }))} empty="Нет заявок по выбранным условиям." />
}

function Floor({ dashboard, selectedBay, onOpen, onSelectBay }: {
  dashboard: Dashboard; selectedBay: number; onOpen: OpenRequest; onSelectBay: (id: number) => void
}) {
  const bays = dashboard.bays ?? []
  const selected = bays.find(bay => bay.id === selectedBay) ?? bays[0]
  if (!selected) return null
  const requestId = selected.request_id
  const canOpen = requestId !== null && dashboard.requests.some(row => row.id === requestId)
  return <div className="map-grid">
    <section className="panel map-panel"><div className="panel-head"><h2>Карта цеха</h2>
      <p className="muted">3D · {bays.length} поста</p></div>
      <GarageMap bays={bays} selected={selected.id} onSelect={onSelectBay} />
    </section>
    <Panel title="Посты сервиса"><div id="bay-list">
      <div className="bay-list">{bays.map(bay => <button key={bay.id} type="button" className="bay"
        aria-pressed={bay.id === selected.id} onClick={() => onSelectBay(bay.id)}>
        <span className="number">{String(bay.number).padStart(2, '0')}</span>
        <span><strong>{bay.name}</strong><small>{bay.status ? bay.model : 'Свободен'}</small></span>
      </button>)}</div>
      <div className="bay-detail"><StatusTag status={selected.status} />
        <p className="muted">{selected.status ? selected.mechanic : 'Пост доступен для назначения.'}</p>
        {canOpen && <Button variant="text-button" onClick={() => onOpen(requestId)}>Открыть {code(requestId)}</Button>}
      </div>
    </div></Panel>
  </div>
}

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
  const floor = <Floor dashboard={dashboard} selectedBay={selectedBay} onOpen={onOpen} onSelectBay={onSelectBay} />
  if (role === 'mechanic') {
    const active = requests.find(row => workshopStatuses.has(row.status) && row.bay_id && row.assigned_to_me)
    return <>
      <Heading title="Моя смена" subtitle="Текущий пост, задача и результаты работы." eyebrow="КАБИНЕТ МЕХАНИКА" />
      {active ? <Panel inset title={`Ваш пост ${String(active.bay_id).padStart(2, '0')} · ${bays.find(bay => bay.id === active.bay_id)?.name ?? ''}`}>
        <div className="split"><div><strong>{active.model}</strong><p className="muted">{active.plate}</p></div><StatusTag status={active.status} /></div>
        <div className="actions"><Button variant="primary" onClick={() => onOpen(active.id)}>Открыть задачу</Button></div>
      </Panel> : <Panel inset title="Текущий пост"><p className="muted">Активного назначения пока нет.</p></Panel>}
      <div className="section-gap" />{floor}
      <Panel title="Задачи смены"><RequestTable requests={requests} role={role} onOpen={onOpen} /></Panel>
    </>
  }
  return <>
    <Heading title="Карта сервиса" subtitle="Загрузка цеха и движение заказов" eyebrow="РАБОЧЕЕ МЕСТО ПРИЁМЩИКА" />
    <Metrics items={[
      ['Новые заявки', requests.filter(row => row.status === 'new').length],
      ['Занятые посты', `${bays.filter(bay => bay.status).length} / ${bays.length}`], ['Готовы к выдаче', ready],
    ]} />
    {floor}
    <Panel title="Недавние заявки" action={<Button variant="text-button" onClick={onRequests}>Все заявки</Button>}>
      <RequestTable requests={requests.slice(0, 5)} role={role} onOpen={onOpen} />
    </Panel>
  </>
}

const filters = { all: 'Все статусы', open: 'Открытые', closed: 'Завершённые', ...statusLabels }

export function RequestList({ dashboard, onOpen, search, onSearch, filter, onFilter }: {
  dashboard: Dashboard; onOpen: OpenRequest; search: string; onSearch: (value: string) => void;
  filter: string; onFilter: (value: string) => void
}) {
  const needle = search.trim().toLocaleLowerCase('ru')
  const rows = dashboard.requests.filter(row => (
    filter === 'all' || filter === row.status || filter === 'open' && !closedStatuses.has(row.status)
    || filter === 'closed' && closedStatuses.has(row.status)
  ) && [row.model, row.plate, code(row.id), row.client_name].some(value => value?.toLocaleLowerCase('ru').includes(needle)))
  return <>
    <Heading title={dashboard.user.role === 'mechanic' ? 'Мои задачи' : 'Заказы и заявки'}
      subtitle="Найдите заявку по автомобилю, номеру или этапу." />
    <Panel title="Журнал">
      <div className="tool-row">
        <input id="search" type="search" aria-label="Поиск по заявкам" placeholder="Поиск по заявкам"
          value={search} onChange={event => onSearch(event.target.value)} />
        <select id="request-filter" aria-label="Этап заявки" value={filter} onChange={event => onFilter(event.target.value)}>
          {Object.entries(filters).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </select>
      </div>
      <RequestTable requests={rows} role={dashboard.user.role} onOpen={onOpen} />
    </Panel>
  </>
}

export function StockView({ dashboard, onRestock }: { dashboard: Dashboard; onRestock: () => void }) {
  return <>
    <Heading title="Склад запчастей" subtitle="Остатки, поступления и расход по заказ-нарядам."
      action={<Button variant="primary" onClick={onRestock}>Пополнить склад</Button>} />
    <div className="column">
      <Panel title="Остатки"><Table headings={['Артикул', 'Запчасть', 'В наличии', 'Цена']}
        rows={(dashboard.parts ?? []).map(part => ({ key: part.id, cells: [part.sku, part.name, part.stock, money(part.price ?? 0)] }))} /></Panel>
      <Panel title="Последние движения"><Table headings={['Дата', 'Запчасть', 'Количество', 'Сотрудник', 'Документ']}
        rows={(dashboard.movements ?? []).map((row, index) => ({ key: index, cells: [
          dateTime(row.created_at), row.name, row.quantity > 0 ? '+' + row.quantity : row.quantity, row.employee, row.note || 'Отчёт механика',
        ] }))} empty="Движений пока нет." /></Panel>
    </div>
  </>
}

export function CarsView({ dashboard, onNewRequest }: { dashboard: Dashboard; onNewRequest: (vehicleId?: number) => void }) {
  return <>
    <Heading title="Мои автомобили" subtitle="Выберите автомобиль, чтобы отправить заявку в сервис."
      action={<Button variant="primary" onClick={() => onNewRequest()}>Новая заявка</Button>} />
    <div className="profile-cars">{(dashboard.vehicles ?? []).map(car => <section className="panel inset car-card" key={car.id}>
      <h2>{car.model}</h2><p>{car.plate}</p>
      <p className="muted">{car.mileage === null ? 'Пробег не указан' : number(car.mileage) + ' км'}</p>
      <div className="actions"><Button onClick={() => onNewRequest(car.id)}>Записаться</Button></div>
    </section>)}</div>
  </>
}

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
  return actionLabels[action]
}

export function DetailsView({ row, role, onAction, onBack }: {
  row: RequestDetail; role: Role; onAction: (action: RequestAction) => void; onBack: () => void
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
        ? 'В отчёте укажите выполненные работы, результаты проверки, время и фактически использованные запчасти.' : ''
  )
  return <>
    <div className="back"><Button variant="text-button" onClick={onBack}>К списку</Button></div>
    <Heading title={row.model}
      subtitle={[row.plate, 'Заявка ' + code(row.id), row.order_id ? 'Заказ-наряд ' + code(row.order_id) : null].filter(Boolean).join(' · ')}
      action={<StatusTag status={row.status} />} />
    <div className="detail-grid">
      <div className="column">
        {row.work_instructions && role !== 'client' && <Panel inset title={row.bay_id ? `Пост ${row.bay_id} · ${row.bay_name}` : 'Последнее задание'}>
          <p className="request-text">{row.work_instructions}</p>
          {expected && <p className="job-output muted">{expected}</p>}
          {row.pause_reason && <p className="muted request-text">Пауза: {row.pause_reason}</p>}
        </Panel>}
        <Panel inset title="Обращение"><p className="request-text">{row.description}</p>
          <dl className="facts">{facts.filter(([, value]) => value != null && value !== '').map(([label, value]) =>
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          )}</dl>
          {row.intake_note && <p className="request-text meta">Приёмка: {row.intake_note}</p>}
          {row.inspection_note && <p className="request-text meta">Контроль качества: {row.inspection_note}</p>}
          {actions.length > 0 && <div className="actions">{actions.map((key, index) =>
            <Button key={key} variant={index === 0 ? 'primary' : 'secondary'} onClick={() => onAction(key)}>{actionTitle(key, row)}</Button>
          )}</div>}
        </Panel>
        <EstimatePanel row={row} role={role} /><ReportsPanel row={row} />
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
