import { useEffect, useState } from 'react'
import type { RequestSummary } from '../../api/types'

export function workDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  return [hours ? `${hours} ч` : '', minutes || hours ? `${minutes} мин` : '', `${seconds % 60} с`].filter(Boolean).join(' ')
}

export function WorkTimer({ timer }: { timer: RequestSummary['work_timer'] }) {
  const [clock, setClock] = useState(Date.now)
  const startedAt = timer?.started_at
  useEffect(() => {
    if (startedAt == null) return
    const id = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [startedAt])
  if (!timer) return null
  const elapsed = timer.elapsed_ms + (startedAt == null ? 0 : Math.max(0, clock - startedAt))
  return <p className="meta">
    {timer.kind === 'diagnosis' ? 'Время диагностики' : 'Время ремонта'}: <strong>{workDuration(elapsed)}</strong>
    {startedAt == null && ' · на паузе'}
  </p>
}
