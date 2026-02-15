import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initPwaInstall } from './lib/pwaInstall'

// PWA install prompt dinleyicisini sayfa yüklenir yüklenmez başlat
initPwaInstall()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
