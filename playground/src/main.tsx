import { initPerfScan } from 'react-perf-scan'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

initPerfScan({ dashboardPosition: 'bottom-right', renderThreshold: 3 })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
