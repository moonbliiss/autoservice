import { useEffect, useState } from 'react'
import { errorMessage, getTracking } from '../../api/client'
import type { RequestTracking } from '../../api/types'
import { code, dateTime } from '../../shared/format'
import { Heading, Panel } from '../../shared/ui'
import { ParkingStatus } from './ParkingStatus'
import { StatusTag } from './status'
import '../../shared/base.css'
import '../../shared/ui.css'
import './tracking.css'

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
      <Heading title={request?.model ?? 'Статус заявки'} subtitle={request && 'Заявка ' + code(request.id)}
        action={request && <StatusTag status={request.status} />} />
      {error && <p role="status">{error}</p>}
      {!request && !error && <p>Загрузка заявки…</p>}
      {request && <div className="column">
        <ParkingStatus {...request} />
        {(request.visit_note || request.appointment || request.eta) && <Panel inset title="Сроки">
          {request.visit_note ? <p>{request.visit_note}</p>
            : request.appointment && <p>Визит: {dateTime(request.appointment)}</p>}
          {request.eta && <p>Ожидаемая готовность: {dateTime(request.eta)}</p>}
        </Panel>}
      </div>}
    </>}
  </main>
}
