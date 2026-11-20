import type { ReactNode } from 'react'
import type { Dashboard, PresenceStatus, Profile, StaffPresence } from '../api/types'
import { presenceLabels, roleLabels } from '../shared/labels'
import { navigation, profileKey, profiles, type Section } from './navigation'
import './shell.css'

export function AppShell({ user, section, busy, submitting, notice, navigate, changeProfile, changePresence, ownPresence, children, mapOverview }: {
  user?: Dashboard['user']; section: Section; busy: boolean; submitting: boolean;
  mapOverview: boolean;
  notice: { message: string; error: boolean } | null; navigate: (section: Section) => void;
  changeProfile: (profile: Profile) => Promise<void>; children: ReactNode
  ownPresence?: StaffPresence; changePresence: (status: PresenceStatus) => Promise<void>
}) {
  const name = user?.name ?? 'Анна Морозова'
  const avatar = name.split(' ').map(part => part[0]).join('').slice(0, 2)
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
      <header className="top" data-has-presence={Boolean(ownPresence)}>
        <span id="location-label">{user ? roleLabels[user.role] : 'Рабочее пространство'}</span>
        {ownPresence && <label className="presence-control">
          <span className="presence-dot" data-status={ownPresence.status ?? ''} aria-hidden="true" />
          <select aria-label="Мой статус присутствия" value={ownPresence.status ?? ''} disabled={busy || submitting}
            onChange={event => {
              const value = event.target.value
              if (value === 'present' || value === 'away') void changePresence(value)
            }}>
            <option value="" disabled>Не отмечено</option>
            <option value="present">{presenceLabels.present}</option>
            <option value="away">{presenceLabels.away}</option>
          </select>
        </label>}
        <label className="profile"><span id="avatar" className="avatar" aria-hidden="true">{avatar}</span>
          <span className="profile-label"><span id="profile-name">{name}</span>
            <select id="profile" aria-label="Демонстрационный профиль" value={profileKey(user)}
              disabled={busy || submitting} onChange={event => {
                const profile = profiles.find(item => item.key === event.target.value)
                if (profile) void changeProfile(profile.key)
              }}>
              {profiles.map(profile => <option key={profile.key} value={profile.key}>{profile.label}</option>)}
            </select>
          </span>
        </label>
      </header>
      <p id="notice" className={notice?.error ? 'notice error' : 'notice'} role="status" hidden={!notice}>{notice?.message}</p>
      <main id="content" className={mapOverview ? 'map-overview' : undefined} aria-busy={busy}>{children}</main>
    </div>
  </div>
}
