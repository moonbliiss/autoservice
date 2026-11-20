import type { Dashboard, PartSupply } from '../../api/types'
import { code, dateOnly, dateTime, money } from '../../shared/format'
import { Button, Heading, Panel, Table } from '../../shared/ui'
import { WarehouseNeeds } from './WarehouseNeeds'

export function StockView({ dashboard, onRestock, onOrder, onReceive, onOpenRequest }: {
  dashboard: Dashboard
  onRestock: () => void
  onOrder: (partId?: number) => void
  onReceive: (supply: PartSupply) => void
  onOpenRequest: (id: number) => void
}) {
  const supplies = dashboard.supplies ?? []
  const canManage = dashboard.user.role === 'stockkeeper'
  const showJournal = canManage || dashboard.user.role === 'manager'
  const incoming = supplies.filter(supply => supply.received < supply.quantity)
  const received = supplies.filter(supply => supply.received === supply.quantity)
  const requestLink = (requestId: number | null) => requestId === null ? '—'
    : canManage ? code(requestId) : <Button variant="table-link" onClick={() => onOpenRequest(requestId)}>{code(requestId)}</Button>

  return <>
    <Heading title="Склад запчастей" subtitle="Остатки, поставки и выдача деталей в цех."
      action={canManage && <div className="actions"><Button onClick={onRestock}>Пополнить склад</Button>
        <Button variant="primary" onClick={() => onOrder()}>Заказать запчасть</Button></div>} />
    <div className="column">
      <Panel title="Поставки в пути"><Table headings={['Поставка', 'Запчасть', ...(showJournal ? ['Поставщик'] : []),
        'Принято / заказано', 'Ожидается', 'Заявка', ...(canManage ? [''] : [])]}
        rows={incoming.map(supply => ({ key: supply.id, cells: [
          code(supply.id), supply.name, ...(showJournal ? [supply.supplier] : []), `${supply.received} / ${supply.quantity}`,
          dateOnly(supply.expected_date) || '—', requestLink(supply.request_id),
          ...(canManage ? [<Button variant="text-button" onClick={() => onReceive(supply)}>Принять поставку</Button>] : []),
        ] }))} empty="Поставок в пути нет." /></Panel>
      <Panel title="Остатки"><Table headings={['Артикул', 'Запчасть', 'В наличии', 'Цена', ...(canManage ? [''] : [])]}
        rows={(dashboard.parts ?? []).map(part => ({ key: part.id, cells: [
          part.sku, part.name, part.stock, money(part.price ?? 0),
          ...(canManage ? [<Button variant="text-button" onClick={() => onOrder(part.id)}>Заказать</Button>] : []),
        ] }))} /></Panel>
      {showJournal && <Panel title="Принятые поставки"><Table headings={['Поставка', 'Запчасть', 'Поставщик', 'Принято', 'Заявка']}
        rows={received.map(supply => ({ key: supply.id, cells: [
          code(supply.id), supply.name, supply.supplier, supply.received, requestLink(supply.request_id),
        ] }))} empty="Принятых поставок пока нет." /></Panel>}
      {showJournal && <Panel title="Журнал движений"><Table headings={['Дата', 'Запчасть', 'Операция', 'Количество', 'Сотрудник', 'Документ', 'Заявка']}
        rows={(dashboard.movements ?? []).map(row => ({ key: row.id, cells: [
          dateTime(row.created_at), row.name, row.quantity > 0 ? 'Приход' : 'Выдача в цех',
          row.quantity > 0 ? '+' + row.quantity : row.quantity, row.employee,
          row.supply_id ? `Поставка ${code(row.supply_id)} · ${row.note}` : row.note || '—',
          requestLink(row.request_id),
        ] }))} empty="Движений пока нет." /></Panel>}
      {dashboard.user.role === 'manager' && <WarehouseNeeds needs={dashboard.warehouse_needs ?? []} onOpen={onOpenRequest} />}
    </div>
  </>
}
