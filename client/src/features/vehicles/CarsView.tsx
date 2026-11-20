import type { Dashboard } from '../../api/types'
import { number } from '../../shared/format'
import { Button, Heading } from '../../shared/ui'
import './cars.css'

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
