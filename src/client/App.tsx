import {
  BarChart3,
  BookOpenText,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  Menu,
  Plus,
  Radio,
  Settings,
  ShieldCheck,
  Sparkles,
  Swords,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { CardWorkspace } from './components/CardWorkspace'
import { BankrollWorkspace } from './components/BankrollWorkspace'
import { FightBoardWorkspace } from './components/FightBoardWorkspace'
import { LedgerWorkspace } from './components/LedgerWorkspace'
import { OddsBoardWorkspace } from './components/OddsBoardWorkspace'
import { SourcesWorkspace } from './components/SourcesWorkspace'

type NavItem =
  'Cards' | 'Fight board' | 'Sources' | 'Odds board' | 'Bet ledger' | 'Bankroll'

interface ServiceStatus {
  state: 'checking' | 'ready' | 'unavailable'
  label: string
}

const navItems: Array<{ label: NavItem; icon: typeof Swords }> = [
  { label: 'Cards', icon: CalendarDays },
  { label: 'Fight board', icon: Swords },
  { label: 'Sources', icon: BookOpenText },
  { label: 'Odds board', icon: CircleDollarSign },
  { label: 'Bet ledger', icon: ClipboardCheck },
  { label: 'Bankroll', icon: BarChart3 },
]

function App() {
  const [activeNav, setActiveNav] = useState<NavItem>('Fight board')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [status, setStatus] = useState<ServiceStatus>({
    state: 'checking',
    label: 'Checking foundation',
  })

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/status', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Service unavailable')
        return response.json()
      })
      .then(() => setStatus({ state: 'ready', label: 'Foundation online' }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setStatus({ state: 'unavailable', label: 'Preview mode' })
      })
    return () => controller.abort()
  }, [])

  const handleNav = (label: NavItem) => {
    setActiveNav(label)
    setMobileNavOpen(false)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar--open' : ''}`}>
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <span>U</span>
          </div>
          <div>
            <p className="brand-name">Fightfolio</p>
            <p className="brand-kicker">Bet synthesiser</p>
          </div>
          <button
            className="icon-button sidebar-close"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="primary-nav" aria-label="Primary navigation">
          <p className="nav-label">Workspace</p>
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              className={`nav-button ${activeNav === label ? 'nav-button--active' : ''}`}
              onClick={() => handleNav(label)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="system-card">
          <div className="system-card__icon">
            <ShieldCheck size={18} />
          </div>
          <div>
            <strong>Private workspace</strong>
            <span>Access-gated · AUD</span>
          </div>
        </div>

        <button
          className="nav-button settings-button"
          type="button"
          disabled
          title="Configuration is versioned in the repository for the MVP"
        >
          <Settings size={18} />
          <span>Settings</span>
        </button>
      </aside>

      {mobileNavOpen && (
        <button
          className="sidebar-scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <main className="main-panel">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="event-switcher">
            <CalendarDays size={17} />
            <div>
              <span>Current card</span>
              <strong>Select inside workspace</strong>
            </div>
            <ChevronDown size={16} />
          </div>
          <div className="topbar-spacer" />
          <div className={`service-pill service-pill--${status.state}`}>
            <span className="service-dot" />
            {status.label}
          </div>
          <button
            className="avatar"
            type="button"
            aria-label="Open account menu"
          >
            W
          </button>
        </header>

        <div className="page-content">
          <section className="hero-grid">
            <div className="hero-copy">
              <div className="eyebrow">
                <Radio size={14} />
                Sunday, Sydney time
              </div>
              <h1>{activeNav}</h1>
              <p>
                Turn noisy fight analysis into a reviewed, evidence-backed
                slate—without losing sight of the actual price or stake you
                take.
              </p>
            </div>
            <div className="hero-actions">
              <button
                className="button button--secondary"
                type="button"
                onClick={() => handleNav('Sources')}
              >
                <Plus size={17} />
                Add source
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={() => handleNav('Fight board')}
              >
                <Sparkles size={17} />
                Synthesise
              </button>
            </div>
          </section>

          {activeNav === 'Cards' ? (
            <CardWorkspace />
          ) : activeNav === 'Sources' ? (
            <SourcesWorkspace />
          ) : activeNav === 'Odds board' ? (
            <OddsBoardWorkspace />
          ) : activeNav === 'Fight board' ? (
            <FightBoardWorkspace />
          ) : activeNav === 'Bet ledger' ? (
            <LedgerWorkspace />
          ) : (
            <BankrollWorkspace />
          )}
        </div>
      </main>
    </div>
  )
}

export default App
