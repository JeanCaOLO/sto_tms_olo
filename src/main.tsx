import { StrictMode } from 'react'
import './i18n'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './hooks/useAuth'
import { MOCK_AUTH_ENABLED } from './lib/mock-auth'
import MockRoleSwitch from './components/feature/MockRoleSwitch'

// Modo mock (solo DEV): el tarifador usa el cliente HTTP real contra un backend simulado en memoria,
// con datos demo, en vez de Aurora.
if (MOCK_AUTH_ENABLED) await import('./lib/tarifas/data/memory/installMock')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
    {MOCK_AUTH_ENABLED && <MockRoleSwitch />}
  </StrictMode>,
)
