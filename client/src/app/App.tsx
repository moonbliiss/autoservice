import { ActionDialog } from '../features/actions/ActionDialog'
import { StockView } from '../features/inventory/StockView'
import { Overview } from '../features/overview/Overview'
import { RequestDetails } from '../features/requests/RequestDetails'
import { RequestList } from '../features/requests/RequestList'
import { CarsView } from '../features/vehicles/CarsView'
import { AppShell } from './AppShell'
import { useWorkshop } from './useWorkshop'
import '../shared/base.css'
import '../shared/ui.css'

export function App() {
  const {
    dashboard, section, detail, selectedBay, setSelectedBay, search, setSearch, filter, setFilter,
    action, closeAction, formError, notice, busy, submitting,
    changeProfile, navigate, openRequest, showAction, submitAction,
  } = useWorkshop()
  const onNewRequest = (vehicleId?: number) => showAction({ key: 'newRequest', vehicleId })

  return <>
    <AppShell user={dashboard?.user} section={section} busy={busy} submitting={submitting} notice={notice}
      navigate={navigate} changeProfile={changeProfile}>
      {!dashboard ? <p>{busy ? 'Загрузка мастерской…'
        : 'Не удалось подключиться к мастерской. Проверьте запуск сервера и обновите страницу.'}</p>
        : detail ? <RequestDetails row={detail} role={dashboard.user.role}
          onAction={key => showAction({ key, row: detail })} onBack={() => navigate(section)} />
        : section === 'overview' ? <Overview dashboard={dashboard} selectedBay={selectedBay} onSelectBay={setSelectedBay}
          onOpen={openRequest} onNewRequest={onNewRequest} onRequests={() => navigate('requests')} />
        : section === 'requests' ? <RequestList dashboard={dashboard} onOpen={openRequest} search={search}
          onSearch={setSearch} filter={filter} onFilter={setFilter} onNewRequest={onNewRequest} />
        : section === 'stock' ? <StockView dashboard={dashboard} onRestock={() => showAction({ key: 'restock' })} />
        : <CarsView dashboard={dashboard} onNewRequest={onNewRequest} />}
    </AppShell>
    {dashboard && action && <ActionDialog action={action} dashboard={dashboard} busy={submitting} error={formError}
      onClose={closeAction} onSubmit={submitAction} />}
  </>
}
