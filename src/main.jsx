import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
