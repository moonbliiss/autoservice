import { useEffect, useRef, useState } from 'react'
import { ApiError, createRequest, errorMessage, getDashboard, getRequest, issueStock, orderSupply, receiveSupply, restock, savePresence, selectProfile, updateRequest } from '../api/client'
import type { Dashboard, PresenceStatus, Profile, RequestDetail, RequestSummary, Submission } from '../api/types'
import type { FormAction } from '../features/actions/ActionFields'
import type { MoveRequest } from '../features/garage/WorkshopFloor'
import { profileKey, type Section } from './navigation'

export function useWorkshop() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [section, setSection] = useState<Section>('overview')
  const [detail, setDetail] = useState<RequestDetail | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [action, setAction] = useState<FormAction | null>(null)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const locked = useRef(true)
  const revision = useRef(0)

  async function refreshLayout() {
    const before = ++revision.current
    const next = await getDashboard()
    if (before === revision.current && next.user.id === dashboard?.user.id) setDashboard(next)
  }

  function notify(message: string, error = false) {
    setNotice({ message, error })
  }

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), notice.error ? 11000 : 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    let active = true
    async function start() {
      try {
        let next
        try {
          next = await getDashboard()
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401 || !active) throw error
          await selectProfile('advisor')
          next = await getDashboard()
        }
        if (active) setDashboard(next)
      } catch (error) {
        if (active) notify(errorMessage(error), true)
      } finally {
        if (active) {
          locked.current = false
          setBusy(false)
        }
      }
    }
    void start()
    return () => { active = false }
  }, [])

  function resetView() {
    setSection('overview')
    setDetail(null)
    setSearch('')
    setFilter('all')
  }

  async function changeProfile(profile: Profile, destination?: Section) {
    if (locked.current) return
    ++revision.current
    locked.current = true
    setBusy(true)
    let sessionChanged = false
    try {
      await selectProfile(profile)
      sessionChanged = true
      const next = await getDashboard()
      resetView()
      if (destination) setSection(destination)
      setDashboard(next)
      setNotice(null)
      if (!destination && detail && next.requests.some(row => row.id === detail.id)) {
        setDetail(await getRequest(detail.id))
      }
    } catch (error) {
      if (sessionChanged && profile !== profileKey(dashboard?.user)) {
        setDashboard(current => current?.user.id === dashboard?.user.id ? null : current)
      }
      notify(errorMessage(error), true)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  const userId = dashboard?.user.id
  async function changePresence(status: PresenceStatus) {
    if (locked.current || !userId) return
    ++revision.current
    locked.current = true
    setSubmitting(true)
    try {
      const saved = await savePresence(status)
      setDashboard(current => current && { ...current, staff_presence: current.staff_presence?.map(person =>
        person.id === userId ? { ...person, status: saved.status } : person) })
    } catch (error) {
      notify(errorMessage(error), true)
    } finally {
      locked.current = false
      setSubmitting(false)
    }
  }

  const liveWorkshop = section === 'overview' && ['advisor', 'manager', 'mechanic'].includes(dashboard?.user.role ?? '')
  const demoProfile = profileKey(dashboard?.user)
  const detailId = detail?.id
  useEffect(() => {
    if (!userId || action || busy || submitting) return
    let active = true
    let refreshing = false
    async function refresh() {
      if (refreshing || locked.current || document.hidden || document.activeElement?.id === 'search') return
      refreshing = true
      const before = revision.current
      const isCurrent = () => active && before === revision.current && !locked.current
      try {
        const next = await getDashboard()
        if (!isCurrent()) return
        if (next.user.id !== userId) {
          ++revision.current
          resetView()
        } else if (detailId !== undefined) {
          const updated = next.requests.some(row => row.id === detailId) ? await getRequest(detailId) : null
          if (!isCurrent()) return
          setDetail(updated)
        }
        setDashboard(next)
      } catch (error) {
        if (isCurrent() && error instanceof ApiError && error.status === 401) {
          locked.current = true
          try {
            await selectProfile(demoProfile)
          } catch {
            // Retry on the next refresh if the local server is unavailable.
          } finally {
            locked.current = false
          }
        }
      } finally {
        refreshing = false
      }
    }
    const timer = window.setInterval(refresh, liveWorkshop ? 2000 : 12000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [userId, demoProfile, detailId, section, action, busy, submitting, liveWorkshop])

  function navigate(next: Section) {
    if (locked.current) return
    ++revision.current
    setDetail(null)
    if ((section === 'archive') !== (next === 'archive')) {
      setSearch('')
      setFilter('all')
    }
    setSection(next)
    window.scrollTo(0, 0)
  }

  async function openRequest(id: number) {
    if (locked.current) return
    const before = ++revision.current
    try {
      const row = await getRequest(id)
      if (before === revision.current) {
        // Invalidate a dashboard refresh that started while this request was loading.
        ++revision.current
        setDetail(row)
        window.scrollTo(0, 0)
      }
    } catch (error) {
      if (before === revision.current) notify(errorMessage(error), true)
    }
  }

  function showAction(next: FormAction) {
    if (locked.current) return
    ++revision.current
    setFormError('')
    setAction(next)
  }

  const moveOnMap: MoveRequest = async (id, key, destination) => {
    if (locked.current || action) return
    const before = ++revision.current
    if (key === 'park' || key === 'arrivalPark' || key === 'leaveArrival') {
      locked.current = true
      setSubmitting(true)
      try {
        await updateRequest(id, key, { [key === 'park' ? 'parking_space' : 'arrival_space']: destination.id })
        const message = key === 'park' ? `Автомобиль переведён на место ${destination.id}. Ожидает запчасти.`
          : key === 'arrivalPark' ? `Приезд отмечен. Клиентская стоянка, место ${destination.id}.` : 'Место на клиентской стоянке освобождено.'
        await refreshDashboard(message)
      } catch (error) {
        await refreshDashboard(errorMessage(error), true)
      } finally {
        locked.current = false
        setSubmitting(false)
      }
      return
    }
    try {
      const row = await getRequest(id)
      if (before !== revision.current) return
      if (!row.actions.includes(key)) {
        notify('Перемещение больше недоступно. Проверьте текущий статус заявки.', true)
        return
      }
      showAction({ key, row, destination })
    } catch (error) {
      if (before === revision.current) notify(errorMessage(error), true)
    }
  }

  async function refreshDashboard(message: string, error = false) {
    try {
      setDashboard(await getDashboard())
      notify(message, error)
    } catch (cause) {
      notify(message + ' Не удалось обновить данные. ' + errorMessage(cause), true)
    }
  }

  async function completeTransfer(row: RequestSummary) {
    if (locked.current || !row.transfer) return
    ++revision.current
    locked.current = true
    setSubmitting(true)
    // Mount the map with the current parking position before fetching the confirmed position.
    setSection('overview')
    setDetail(null)
    try {
      await updateRequest(row.id, 'completeTransfer', { transfer_id: row.transfer.id })
      await refreshDashboard(`Перегон подтверждён. Автомобиль на посту ${row.transfer.bay_id}.`)
    } catch (error) {
      await refreshDashboard(errorMessage(error), true)
    } finally {
      locked.current = false
      setSubmitting(false)
    }
  }

  async function submitAction(data: Submission) {
    if (!action || locked.current) return
    ++revision.current
    locked.current = true
    setSubmitting(true)
    setFormError('')
    const { key } = action
    try {
      if (key === 'restock') await restock(data)
      else if (key === 'warehouseIssue') await issueStock(data)
      else if (key === 'orderSupply') await orderSupply(data)
      else if (key === 'receiveSupply') await receiveSupply(action.supply.id, data)
      else if (key === 'newRequest') setDetail(await createRequest(data))
      else {
        const updated = await updateRequest(action.row.id, key, data)
        if (!action.destination) setDetail(updated)
        if (key === 'issue') {
          setSection('archive')
          setSearch('')
          setFilter('all')
        }
      }
    } catch (error) {
      setFormError(errorMessage(error))
      locked.current = false
      setSubmitting(false)
      return
    }
    setAction(null)
    const message = key === 'newRequest' ? 'Заявка отправлена.'
      : key === 'estimate' || key === 'addWorkOrder' ? 'Заказ-наряд отправлен на согласование.'
      : key === 'orderSupply' ? 'Заказ поставщику добавлен в поставки.'
      : key === 'receiveSupply' ? 'Запчасти оприходованы на склад.'
      : key === 'dispatchTransfer' ? 'Задача перегона назначена. Автомобиль пока на парковке.'
      : key === 'issue' ? 'Автомобиль выдан. Заявка перенесена в архив.'
      : key === 'warehouseIssue' ? 'Запчасти выданы механику и списаны со склада.' : 'Изменения сохранены.'
    try {
      await refreshDashboard(message)
    } finally {
      locked.current = false
      setSubmitting(false)
    }
  }

  return {
    dashboard, section, detail, search, setSearch, filter, setFilter,
    action, closeAction: () => setAction(null), formError, notice, busy, submitting,
    changeProfile, changePresence, refreshLayout, navigate, openRequest, showAction, submitAction, moveOnMap, completeTransfer,
  }
}
