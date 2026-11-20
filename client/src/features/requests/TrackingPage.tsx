import { useEffect, useState } from 'react'
import { errorMessage, getTracking } from '../../api/client'
import type { RequestTracking, Status } from '../../api/types'
import { code, dateTime, money } from '../../shared/format'
import { paymentLabels } from '../../shared/labels'
import { Heading, Panel } from '../../shared/ui'
import { ParkingStatus } from './ParkingStatus'
import { StatusTag } from './status'
import { WorkOrderCard } from './WorkOrderCard'
import '../../shared/base.css'
import '../../shared/ui.css'
import './tracking.css'

const nextSteps: Record<Status, string> = {
  new: 'Приёмщик свяжется с вами, чтобы согласовать визит.',
  scheduled: 'Привезите автомобиль в согласованное время.',
  cancelled: 'Заявка закрыта. Для нового визита свяжитесь с автосервисом.',
  received: 'Автомобиль принят. Приёмщик определит следующий этап.',
  diagnosis_assigned: 'Механик проведёт диагностику и передаст результат приёмщику.',
  diagnosing: 'Механик проверяет автомобиль. После диагностики приёмщик подготовит заказ-наряд.',
  awaiting_estimate: 'Приёмщик готовит заказ-наряд на основе результатов диагностики.',
  awaiting_approval: 'Проверьте заказ-наряды ниже и сообщите своё решение приёмщику.',
  declined: 'Приёмщик уточнит с вами дальнейшие действия.',
  approved: 'Приёмщик назначит пост и механика.',
  repair_assigned: 'Механик назначен и готовится начать ремонт.',
  repairing: 'Механик выполняет согласованные работы.',
  paused: 'Работы временно приостановлены. Статус обновится после возобновления.',
  waiting_parts: 'Сервис ждёт запчасти, чтобы продолжить работу.',
  transfer_pending: 'Механик перегонит автомобиль с парковки в цех.',
  inspection: 'Приёмщик проверяет результат работ перед выдачей.',
  ready: 'Можно забрать автомобиль. Остаток к оплате указан ниже.',
  issued: 'Автомобиль выдан, обслуживание завершено.',
}

function TrackingDetails({ request }: { request: RequestTracking }) {
  return <>
    <Heading title={request.model} subtitle={`${request.plate} · Заявка ${code(request.id)}`}
      eyebrow="МАСТЕРСКАЯ · СТАТУС ОБСЛУЖИВАНИЯ" action={<StatusTag status={request.status} />} />
    <div className="column">
      <Panel inset title="Что происходит"><p>{request.arrival_space && ['new', 'scheduled'].includes(request.status)
        ? 'Приезд отмечен. Обратитесь к приёмщику для оформления автомобиля.' : nextSteps[request.status]}</p></Panel>
      {request.status !== 'awaiting_approval' && request.work_orders.some(document => document.status === 'pending')
        && <Panel inset title="Требуется ваше решение"><p>Проверьте заказ-наряды на согласовании и сообщите решение приёмщику.</p></Panel>}
      <div className="tracking-grid">
        <div className="column">
          <ParkingStatus {...request} />
          {(request.visit_note || request.appointment || request.eta) && <Panel inset title="Сроки">
            {request.visit_note ? <p>{request.visit_note}</p>
              : request.appointment && <p>Визит: {dateTime(request.appointment)}</p>}
            {request.eta && <p>Ожидаемая готовность: {dateTime(request.eta)}</p>}
          </Panel>}
          {request.description && <Panel inset title="Обращение"><p className="tracking-note">{request.description}</p></Panel>}
          {request.work_orders.length > 0 && <section className="column" aria-label="Заказ-наряды">
            <h2>Заказ-наряды</h2>
            {request.work_orders.map(document => <WorkOrderCard key={document.version} document={document} />)}
          </section>}
          {(['ready', 'issued'].includes(request.status) || request.payments.length > 0) && <Panel inset title="Оплата">
            <p className="split"><span>Оплачено</span><strong>{money(request.paid)}</strong></p>
            <p className="split"><span>Осталось к оплате</span><strong>{money(request.total - request.paid)}</strong></p>
            {request.payments.map(payment => <p className="split line-item" key={payment.id}>
              <span>{paymentLabels[payment.method]} · {dateTime(payment.created_at)}</span><strong>{money(payment.amount)}</strong>
            </p>)}
          </Panel>}
        </div>
        <Panel inset title="История обслуживания">
          <ol className="tracking-history">
            {request.history.map((event, index) => <li key={index}>
              <strong>{event.title}</strong><time className="muted">{dateTime(event.created_at)}</time>
              {event.note && <p className="tracking-note">{event.note}</p>}
            </li>)}
          </ol>
        </Panel>
      </div>
    </div>
  </>
}

export function TrackingPage({ token }: { token: string }) {
  const [request, setRequest] = useState<RequestTracking>()
  const [error, setError] = useState('')
  const valid = /^[a-f0-9]{48}$/.test(token)

  useEffect(() => {
    if (!valid) return
    const controller = new AbortController()
    let timer: number

    async function refresh() {
      try {
        setRequest(await getTracking(token, controller.signal))
        setError('')
      } catch (cause) {
        if (!controller.signal.aborted) setError(errorMessage(cause))
      }
      if (!controller.signal.aborted) timer = window.setTimeout(refresh, 12000)
    }

    void refresh()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [token, valid])

  return <main className="tracking-page">
    {!valid ? <Heading title="Заявка не найдена" /> : <>
      {!request && <Heading title="Статус заявки" />}
      {error && <p role="status" className="tracking-error">{error}</p>}
      {!request && !error && <p>Загрузка заявки…</p>}
      {request && <TrackingDetails request={request} />}
    </>}
  </main>
}
