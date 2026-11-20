import type { Dashboard } from '../../api/types'
import { code } from '../../shared/format'
import { statusLabels } from '../../shared/labels'
import { Button, Heading, Panel } from '../../shared/ui'
import { RequestTable, type OpenRequest } from './RequestTable'
import { closedStatuses } from './status'
import './request-list.css'

const filters = { all: 'Все статусы', open: 'Открытые', closed: 'Завершённые', ...statusLabels }

export function RequestList({ dashboard, onOpen, search, onSearch, filter, onFilter, onNewRequest }: {
  dashboard: Dashboard; onOpen: OpenRequest; search: string; onSearch: (value: string) => void;
  filter: string; onFilter: (value: string) => void; onNewRequest: () => void
}) {
  const needle = search.trim().toLocaleLowerCase('ru')
  const rows = dashboard.requests.filter(row => (
    filter === 'all' || filter === row.status || filter === 'open' && !closedStatuses.has(row.status)
    || filter === 'closed' && closedStatuses.has(row.status)
  ) && [row.model, row.plate, code(row.id), row.client_name].some(value => value?.toLocaleLowerCase('ru').includes(needle)))
  return <>
    <Heading title={dashboard.user.role === 'mechanic' ? 'Мои задачи' : 'Заказы и заявки'}
      subtitle="Найдите заявку по автомобилю, номеру или этапу."
      action={dashboard.user.role === 'advisor' && <Button variant="primary" onClick={onNewRequest}>Новая заявка</Button>} />
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
