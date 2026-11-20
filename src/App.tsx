import { useEffect, useRef, useState } from 'react'
import {
  ApiError, createRequest, errorMessage, getDashboard, getRequest, profiles, restock, selectProfile, updateRequest,
  type Dashboard, type FormAction, type Profile, type RequestAction, type RequestDetail, type Role, type Submission,
} from './api'
import { ActionDialog } from './ActionDialog'
import { CarsView, DetailsView, navigation, Overview, RequestList, StockView, type Section } from './Views'

const roleLabels: Record<Role, string> = { advisor: 'Мастер-приёмщик', mechanic: 'Механик', client: 'Клиент' }
const profileKey = (id?: number): Profile => profiles.find(profile => profile.id === id)?.key ?? 'advisor'

export function App() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [section, setSection] = useState<Section>('overview')
  const [detail, setDetail] = useState<RequestDetail | null>(null)
  const [selectedBay, setSelectedBay] = useState(1)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [action, setAction] = useState<FormAction | null>(null)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const locked = useRef(true)
  const revision = useRef(0)

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
    setSelectedBay(1)
    setSearch('')
    setFilter('all')
  }

  async function changeProfile(profile: Profile) {
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
      setDashboard(next)
      setSelectedBay(next.bays?.find(bay => next.requests.some(row => row.id === bay.request_id))?.id ?? 1)
      setNotice(null)
      if (detail && next.requests.some(row => row.id === detail.id)) {
        setDetail(await getRequest(detail.id))
      }
    } catch (error) {
      if (sessionChanged && profile !== profileKey(dashboard?.user.id)) {
        setDashboard(current => current?.user.id === dashboard?.user.id ? null : current)
      }
      notify(errorMessage(error), true)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  const userId = dashboard?.user.id
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
            await selectProfile(profileKey(userId))
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
    const timer = window.setInterval(refresh, 12000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [userId, detailId, section, action, busy, submitting])

  function navigate(next: Section) {
    if (locked.current) return
    ++revision.current
    setDetail(null)
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

  function requestAction(key: RequestAction) {
    if (detail) showAction({ key, row: detail })
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
      else setDetail(await (key === 'newRequest' ? createRequest(data) : updateRequest(action.row.id, key, data)))
    } catch (error) {
      setFormError(errorMessage(error))
      locked.current = false
      setSubmitting(false)
      return
    }
    setAction(null)
    const message = key === 'newRequest' ? 'Заявка отправлена.' : key === 'estimate' ? 'Смета отправлена клиенту.' : 'Изменения сохранены.'
    try {
      setDashboard(await getDashboard())
      notify(message)
    } catch (error) {
      notify(message + ' Не удалось обновить данные. ' + errorMessage(error), true)
    } finally {
      locked.current = false
      setSubmitting(false)
    }
  }

  const user = dashboard?.user
  const name = user?.name ?? 'Анна Морозова'
  const avatar = name.split(' ').map(part => part[0]).join('').slice(0, 2)
  const onNewRequest = (vehicleId?: number) => showAction({ key: 'newRequest', vehicleId })
  return <div className="shell">
    <aside className="sidebar">
      <div className="identity"><span className="logo" aria-hidden="true"><i /><i /><i /></span>
        <span>Мастерская<small>Автосервис</small></span></div>
      <nav id="navigation" aria-label="Разделы приложения">
        {user && navigation[user.role].map(([key, icon, label]) => <button type="button" className="nav-button" key={key}
          aria-current={section === key ? 'page' : undefined} onClick={() => navigate(key)}>
          <span aria-hidden="true">{icon}</span>{label}
        </button>)}
      </nav>
      <div className="sidebar-foot"><span className="signal" /> Локальный деморежим</div>
    </aside>
    <div className="workspace">
      <header className="top">
        <span id="location-label">{user ? roleLabels[user.role] : 'Рабочее пространство'}</span>
        <label className="profile"><span id="avatar" className="avatar" aria-hidden="true">{avatar}</span>
          <span className="profile-label"><span id="profile-name">{name}</span>
            <select id="profile" aria-label="Демонстрационный профиль" value={profileKey(user?.id)}
              disabled={busy || submitting} onChange={event => {
                const profile = profiles.find(item => item.key === event.target.value)
                if (profile) void changeProfile(profile.key)
              }}>
              {profiles.map(profile => <option key={profile.id} value={profile.key}>{profile.label}</option>)}
            </select>
          </span>
        </label>
      </header>
      <p id="notice" className={notice?.error ? 'notice error' : 'notice'} role="status" hidden={!notice}>{notice?.message}</p>
      <main id="content" aria-busy={busy}>
        {!dashboard ? <p>{busy ? 'Загрузка мастерской…'
          : 'Не удалось подключиться к мастерской. Проверьте запуск сервера и обновите страницу.'}</p>
          : detail ? <DetailsView row={detail} role={dashboard.user.role} onAction={requestAction} onBack={() => navigate(section)} />
          : section === 'overview' ? <Overview dashboard={dashboard} selectedBay={selectedBay} onSelectBay={setSelectedBay}
            onOpen={openRequest} onNewRequest={onNewRequest} onRequests={() => navigate('requests')} />
          : section === 'requests' ? <RequestList dashboard={dashboard} onOpen={openRequest} search={search}
            onSearch={setSearch} filter={filter} onFilter={setFilter} />
          : section === 'stock' ? <StockView dashboard={dashboard} onRestock={() => showAction({ key: 'restock' })} />
          : <CarsView dashboard={dashboard} onNewRequest={onNewRequest} />}
      </main>
    </div>
    {dashboard && action && <ActionDialog action={action} dashboard={dashboard} busy={submitting} error={formError}
      onClose={() => setAction(null)} onSubmit={submitAction} />}
  </div>
}
