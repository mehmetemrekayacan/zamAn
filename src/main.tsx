import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initDb } from './lib/db'
import './index.css'
import App from './App.tsx'

// Veritabanını hemen aç; uygulama mount olunca seanslar IndexedDB’den yüklenecek (kalıcılık)
initDb()
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
  .catch((err) => {
    console.error('DB init failed:', err)
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
