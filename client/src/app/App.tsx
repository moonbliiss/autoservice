import { ActionDialog } from '../features/actions/ActionDialog'
import { StockView } from '../features/inventory/StockView'
import { WarehouseDesk } from '../features/inventory/WarehouseNeeds'
import { DirectoryView } from '../features/management/DirectoryView'
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
    dashboard, section, detail, search, setSearch, filter, setFilter,
    action, closeAction, formError, notice, busy, submitting,
    changeProfile, navigate, openRequest, showAction, submitAction, moveOnMap, completeTransfer,
  } = useWorkshop()
  const onNewRequest = (vehicleId?: number) => showAction({ key: 'newRequest', vehicleId })

  return <>
    <AppShell user={dashboard?.user} section={section} busy={busy} submitting={submitting} notice={notice}
      navigate={navigate} changeProfile={changeProfile}
      mapOverview={dashboard?.user.role === 'advisor' && section === 'overview' && !detail}>
      {!dashboard ? <p>{busy ? 'Загрузка мастерской…'
        : 'Не удалось подключиться к мастерской. Проверьте запуск сервера и обновите страницу.'}</p>
        : detail ? <RequestDetails row={detail} role={dashboard.user.role}
          onAction={(key, documentVersion) => showAction({ key, row: detail, documentVersion })} onBack={() => navigate(section)}
          onCompleteTransfer={completeTransfer} submitting={submitting} />
        : section === 'overview' ? (dashboard.user.role === 'stockkeeper'
          ? <WarehouseDesk needs={dashboard.warehouse_needs ?? []}
            onIssue={need => showAction({ key: 'warehouseIssue', need })}
            onOrder={need => showAction({ key: 'orderSupply', requestId: need.request_id, partId: need.part_id ?? undefined,
              quantity: need.approved_remaining - need.stock - need.incoming })} />
          : <Overview dashboard={dashboard} onMove={moveOnMap} onOpen={openRequest}
            onNewRequest={onNewRequest} onNewArrival={arrivalSpace => showAction({ key: 'newRequest', arrivalSpace })}
            onRequests={() => navigate('requests')} onStock={() => navigate('stock')}
            onCompleteTransfer={completeTransfer} submitting={submitting} />)
        : section === 'requests' || section === 'archive' ? <RequestList dashboard={dashboard} onOpen={openRequest} search={search}
          onSearch={setSearch} filter={filter} onFilter={setFilter} onNewRequest={onNewRequest} archive={section === 'archive'} />
        : section === 'stock' ? <StockView dashboard={dashboard} onRestock={() => showAction({ key: 'restock' })}
          onOrder={partId => showAction({ key: 'orderSupply', partId })}
          onReceive={supply => showAction({ key: 'receiveSupply', supply })} onOpenRequest={openRequest} />
        : section === 'directory' ? <DirectoryView dashboard={dashboard} />
        : <CarsView dashboard={dashboard} onNewRequest={onNewRequest} />}
    </AppShell>
    {dashboard && action && <ActionDialog action={action} dashboard={dashboard} busy={submitting} error={formError}
      onClose={closeAction} onSubmit={submitAction} />}
  </>
}
