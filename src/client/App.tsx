import {
  BarChart3,
  BookOpenText,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  Database,
  Gauge,
  Menu,
  Plus,
  Radio,
  Settings,
  ShieldCheck,
  Sparkles,
  Swords,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CardWorkspace } from './components/CardWorkspace'
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

const workflow = [
  { label: 'Card', detail: '12 fights reviewed', done: true },
  { label: 'Sources', detail: '0 added', done: false },
  { label: 'Prices', detail: 'Not entered', done: false },
  { label: 'Synthesise', detail: 'Waiting on sources', done: false },
]

const sampleFights = [
  {
    order: 'Main event',
    left: 'Fighter A',
    right: 'Fighter B',
    weight: 'Lightweight · 5 rounds',
    status: 'Awaiting sources',
  },
  {
    order: 'Co-main',
    left: 'Fighter C',
    right: 'Fighter D',
    weight: 'Women’s Flyweight · 3 rounds',
    status: 'Awaiting sources',
  },
  {
    order: 'Main card',
    left: 'Fighter E',
    right: 'Fighter F',
    weight: 'Welterweight · 3 rounds',
    status: 'Awaiting sources',
  },
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

  const completedSteps = useMemo(
    () => workflow.filter((step) => step.done).length,
    [],
  )

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
              {label === 'Sources' && <span className="nav-count">0</span>}
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

        <button className="nav-button settings-button" type="button">
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
              <strong>UFC Event — Draft</strong>
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
              <button className="button button--secondary" type="button">
                <Plus size={17} />
                Add source
              </button>
              <button className="button button--primary" type="button" disabled>
                <Sparkles size={17} />
                Synthesise
              </button>
            </div>
          </section>

          {activeNav === 'Cards' ? (
            <CardWorkspace />
          ) : activeNav === 'Sources' ? (
            <SourcesWorkspace />
          ) : (
            <>
              <section
                className="workflow-card"
                aria-label="Card preparation progress"
              >
                <div className="workflow-heading">
                  <div>
                    <p className="section-kicker">Card preparation</p>
                    <h2>Build the evidence before the slate</h2>
                  </div>
                  <div className="progress-copy">
                    <strong>
                      {completedSteps}/{workflow.length}
                    </strong>
                    <span>steps ready</span>
                  </div>
                </div>
                <div className="workflow-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${(completedSteps / workflow.length) * 100}%`,
                    }}
                  />
                </div>
                <div className="workflow-steps">
                  {workflow.map((step, index) => (
                    <div
                      className={`workflow-step ${step.done ? 'workflow-step--done' : ''}`}
                      key={step.label}
                    >
                      <div className="step-index">
                        {step.done ? <Check size={15} /> : index + 1}
                      </div>
                      <div>
                        <strong>{step.label}</strong>
                        <span>{step.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="content-grid">
                <div className="fight-column">
                  <div className="section-heading">
                    <div>
                      <p className="section-kicker">Bout order</p>
                      <h2>Fight Board</h2>
                    </div>
                    <span className="quiet-badge">Preview data</span>
                  </div>

                  <div className="fight-list">
                    {sampleFights.map((fight) => (
                      <article
                        className="fight-row"
                        key={`${fight.left}-${fight.right}`}
                      >
                        <div className="fight-order">
                          <Swords size={17} />
                          <span>{fight.order}</span>
                        </div>
                        <div className="matchup">
                          <strong>{fight.left}</strong>
                          <span>vs</span>
                          <strong>{fight.right}</strong>
                        </div>
                        <p className="fight-meta">{fight.weight}</p>
                        <div className="empty-consensus">
                          <span className="empty-consensus__bar" />
                          <span>{fight.status}</span>
                        </div>
                        <button
                          className="row-action"
                          type="button"
                          aria-label={`Open ${fight.left} versus ${fight.right}`}
                        >
                          <ChevronDown size={17} />
                        </button>
                      </article>
                    ))}
                  </div>
                </div>

                <aside className="insight-column">
                  <div className="budget-card">
                    <div className="budget-card__topline">
                      <div className="icon-tile icon-tile--warm">
                        <Gauge size={19} />
                      </div>
                      <span>Weekly budget</span>
                    </div>
                    <div className="budget-value">
                      <strong>30</strong>
                      <span>units</span>
                    </div>
                    <p>AUD $300 at $10 per unit</p>
                    <div className="budget-meter">
                      <span />
                    </div>
                    <div className="budget-split">
                      <span>0u proposed</span>
                      <span>30u available</span>
                    </div>
                  </div>

                  <div className="principle-card">
                    <div className="principle-heading">
                      <div className="icon-tile">
                        <Database size={18} />
                      </div>
                      <div>
                        <span>Build principle</span>
                        <strong>Language in, maths in code</strong>
                      </div>
                    </div>
                    <p>
                      Source extraction may use an LLM. Consensus, allocation
                      and payout calculations stay deterministic and tested.
                    </p>
                    <div className="principle-tags">
                      <span>Review first</span>
                      <span>No invention</span>
                      <span>No force-spend</span>
                    </div>
                  </div>
                </aside>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
