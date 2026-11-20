import type { Dashboard } from '../../api/types'
import { dateTime, money } from '../../shared/format'
import { Button, Heading, Panel, Table } from '../../shared/ui'

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
