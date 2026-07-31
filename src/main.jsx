import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

const GALILEO_WORKER_PATH = '/sw.js'
const GALILEO_CACHE_PREFIX = 'galileo-v2-cache-'

function isGalileoWorkerRegistration(registration) {
  return [registration.installing, registration.waiting, registration.active]
    .filter(Boolean)
    .some(worker => {
      try {
        const url = new URL(worker.scriptURL)
        return url.origin === window.location.origin && url.pathname === GALILEO_WORKER_PATH
      } catch {
        return false
      }
    })
}

async function cleanLocalGalileoWorker() {
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.allSettled(
    registrations
      .filter(isGalileoWorkerRegistration)
      .map(registration => registration.unregister())
  )

  if ('caches' in window) {
    const cacheNames = await caches.keys()
    await Promise.allSettled(
      cacheNames
        .filter(name => name.startsWith(GALILEO_CACHE_PREFIX))
        .map(name => caches.delete(name))
    )
  }
}

if ('serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    cleanLocalGalileoWorker()
      .catch(error => console.warn('Local service worker cleanup failed', error))
  } else {
    navigator.serviceWorker.register(GALILEO_WORKER_PATH)
      .then(async registration => {
        await registration.update().catch(() => null)
        if (registration.periodicSync?.register) {
          await registration.periodicSync.register('galileo-pending-reports', {
            minInterval: 12 * 60 * 60 * 1000
          }).catch(() => null)
        }
      })
      .catch(error => console.warn('Service worker registration failed', error))
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
