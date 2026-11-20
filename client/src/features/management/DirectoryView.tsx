import type { Dashboard } from '../../api/types'
import { money, number } from '../../shared/format'
import { roleLabels } from '../../shared/labels'
import { Heading, Panel, Table } from '../../shared/ui'

export function DirectoryView({ dashboard }: { dashboard: Dashboard }) {
  const clients = new Map((dashboard.clients ?? []).map(client => [client.id, client]))
  return <>
    <Heading title="Справочник" subtitle="Сотрудники, клиенты и автомобили автосервиса." />
    <div className="column">
      <Panel title="Сотрудники"><Table headings={['Имя', 'Роль']}
        rows={(dashboard.staff ?? []).map(person => ({ key: person.id, cells: [person.name, roleLabels[person.role]] }))} /></Panel>
      <Panel title="Клиенты"><Table headings={['Имя', 'Телефон']}
        rows={[...clients.values()].map(client => ({ key: client.id, cells: [client.name, client.phone ?? '—'] }))} /></Panel>
      <Panel title="Автомобили"><Table headings={['Автомобиль', 'Госномер', 'Клиент', 'Пробег']}
        rows={(dashboard.vehicles ?? []).map(vehicle => ({ key: vehicle.id, cells: [
          vehicle.model, vehicle.plate, clients.get(vehicle.client_id ?? -1)?.name ?? '—',
          vehicle.mileage === null ? '—' : number(vehicle.mileage) + ' км',
        ] }))} /></Panel>
      <Panel title="Услуги"><Table headings={['Услуга', 'Цена']}
        rows={(dashboard.services ?? []).map(service => ({ key: service.id, cells: [service.name, money(service.price)] }))} /></Panel>
    </div>
  </>
}
