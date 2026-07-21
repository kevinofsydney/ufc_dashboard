import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { applyTheme, getInitialTheme } from './ui-preferences'
import { CardsProvider } from './use-cards'

applyTheme(getInitialTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CardsProvider>
      <App />
    </CardsProvider>
  </StrictMode>,
)
