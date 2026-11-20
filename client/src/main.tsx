import { createRoot } from 'react-dom/client'

const root = createRoot(document.getElementById('root')!)

if (window.location.pathname === '/garage-map.html') {
  document.title = '3D-карта цеха'
  document.body.classList.add('embedded-map')
  void import('./features/garage/StandaloneGarage').then(({ StandaloneGarage }) => root.render(<StandaloneGarage />))
} else {
  void import('./app/App').then(({ App }) => root.render(<App />))
}
