import { createRoot } from 'react-dom/client'

const root = createRoot(document.getElementById('root')!)

if (window.location.pathname === '/garage-map.html') {
  document.title = '3D-карта цеха'
  document.body.classList.add('embedded-map')
  void import('./features/garage/StandaloneGarage').then(({ StandaloneGarage }) => root.render(<StandaloneGarage />))
} else if (window.location.pathname === '/tracking') {
  document.title = 'Статус заявки · Мастерская'
  const token = window.location.hash.slice(1)
  void import('./features/requests/TrackingPage').then(({ TrackingPage }) => root.render(<TrackingPage token={token} />))
} else {
  void import('./app/App').then(({ App }) => root.render(<App />))
}
