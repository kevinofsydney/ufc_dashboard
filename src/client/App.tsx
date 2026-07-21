import {
  BarChart3,
  BookOpenText,
  CalendarDays,
  CircleDollarSign,
  CircleHelp,
  ClipboardCheck,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Smartphone,
  Swords,
  Sun,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { CardWorkspace } from './components/CardWorkspace'
import { BankrollWorkspace } from './components/BankrollWorkspace'
import { FightBoardWorkspace } from './components/FightBoardWorkspace'
import { LedgerWorkspace } from './components/LedgerWorkspace'
import { OddsBoardWorkspace } from './components/OddsBoardWorkspace'
import { SourcesWorkspace } from './components/SourcesWorkspace'
import { SettingsWorkspace } from './components/SettingsWorkspace'
import { HowToWorkspace } from './components/HowToWorkspace'
import {
  applyTheme,
  getInitialNarrowView,
  getInitialSidebarCollapsed,
  getInitialTheme,
  saveNarrowView,
  saveSidebarCollapsed,
  saveTheme,
  type Theme,
} from './ui-preferences'
import WorkflowApp from './WorkflowApp'

type NavItem =
  | 'Cards'
  | 'How to'
  | 'Fight board'
  | 'Sources'
  | 'Odds board'
  | 'Bet ledger'
  | 'Bankroll'
  | 'Settings'

const navItems: Array<{
  label: NavItem
  icon: typeof Swords
  purpose: string
}> = [
  {
    label: 'How to',
    icon: CircleHelp,
    purpose:
      'Follow the full weekly workflow, from setting up a UFC card and reviewing source evidence to entering current odds, preparing bets, recording what you placed, and settling the event.',
  },
  {
    label: 'Cards',
    icon: CalendarDays,
    purpose:
      'Create or import a UFC event, confirm its official fight list, and add an alias when a transcript uses a misspelled or alternate fighter name.',
  },
  {
    label: 'Fight board',
    icon: Swords,
    purpose:
      'Review the consensus and supporting evidence for every fight. Once your sources and current odds are ready, generate a budget-capped draft slate and accept the bets you want to track in the ledger.',
  },
  {
    label: 'Sources',
    icon: BookOpenText,
    purpose:
      'Choose a card, paste source material or upload a transcript CSV, have the model extract structured picks, then review and accept the result before it can affect synthesis.',
  },
  {
    label: 'Odds board',
    icon: CircleDollarSign,
    purpose:
      'Record the bookmaker prices currently available for each fight. Synthesis uses these timestamped prices, not odds mentioned in source material, to decide which bets qualify.',
  },
  {
    label: 'Bet ledger',
    icon: ClipboardCheck,
    purpose:
      'Compare recommended exposure with the bets you actually placed. Record the real odds and stake for singles or parlays, then settle each bet after the event.',
  },
  {
    label: 'Bankroll',
    icon: BarChart3,
    purpose:
      'Review settled returns in units and AUD, explore ROI and performance breakdowns, check capper accuracy, and download a backup of your data.',
  },
]

const settingsNavItem = {
  label: 'Settings' as const,
  icon: Settings,
  purpose:
    'Set your current bankroll and default unit size, then configure the language model used for extraction and summaries. Browser-entered API keys stay in this tab and are not saved to the database.',
}

export function LegacyApp() {
  const [activeNav, setActiveNav] = useState<NavItem>('Fight board')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    getInitialSidebarCollapsed,
  )
  const [narrowView, setNarrowView] = useState(getInitialNarrowView)

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  useEffect(() => {
    saveSidebarCollapsed(sidebarCollapsed)
  }, [sidebarCollapsed])

  useEffect(() => {
    saveNarrowView(narrowView)
  }, [narrowView])

  const handleNav = (label: NavItem) => {
    setActiveNav(label)
    setMobileNavOpen(false)
  }

  const activeNavItem =
    navItems.find((item) => item.label === activeNav) ??
    (activeNav === 'Settings' ? settingsNavItem : undefined)
  const activePurpose = activeNavItem?.purpose ?? ''

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div
        className={`app-shell ${sidebarCollapsed ? 'app-shell--sidebar-collapsed' : ''} ${narrowView ? 'app-shell--narrow-view' : ''}`}
      >
        <aside
          id="application-sidebar"
          className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''} ${mobileNavOpen ? 'sidebar--open' : ''}`}
        >
          <div className="brand-block">
            <div className="brand-mark" aria-hidden="true">
              <span>U</span>
            </div>
            <div className="brand-copy">
              <p className="brand-name">Fightfolio</p>
              <p className="brand-kicker">Bet synthesiser</p>
            </div>
            <button
              className="sidebar-collapse-button"
              type="button"
              aria-label={
                sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
              }
              aria-controls="application-sidebar"
              aria-expanded={!sidebarCollapsed}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse to icons'}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={18} />
              ) : (
                <PanelLeftClose size={18} />
              )}
            </button>
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
            {navItems.map(({ label, icon: Icon, purpose }) => (
              <button
                key={label}
                type="button"
                className={`nav-button ${activeNav === label ? 'nav-button--active' : ''}`}
                onClick={() => handleNav(label)}
                aria-label={label}
                title={sidebarCollapsed ? `${label} — ${purpose}` : undefined}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-spacer" />

          <button
            className="nav-button theme-button"
            type="button"
            onClick={() =>
              setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
            }
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-pressed={theme === 'dark'}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>

          <button
            className="nav-button layout-button"
            type="button"
            onClick={() => setNarrowView((current) => !current)}
            aria-label={
              narrowView ? 'Use desktop layout' : 'Use mobile-width layout'
            }
            aria-pressed={narrowView}
            title={
              narrowView
                ? 'Return to the full-width desktop layout'
                : 'Preview the single-column mobile layout on this screen'
            }
          >
            {narrowView ? <Monitor size={18} /> : <Smartphone size={18} />}
            <span>{narrowView ? 'Desktop layout' : 'Mobile layout'}</span>
          </button>

          <button
            className={`nav-button settings-button ${activeNav === 'Settings' ? 'nav-button--active' : ''}`}
            type="button"
            onClick={() => handleNav('Settings')}
            aria-label="Settings"
            title={sidebarCollapsed ? settingsNavItem.purpose : undefined}
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

        <main className="main-panel" id="main-content" tabIndex={-1}>
          <header className="topbar">
            <button
              className="icon-button mobile-menu"
              type="button"
              aria-label="Open navigation"
              aria-controls="application-sidebar"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu size={21} />
            </button>
          </header>

          <div className="page-content">
            <section className="page-heading">
              <h1>{activeNav}</h1>
              <p>{activePurpose}</p>
            </section>

            {activeNav === 'How to' ? (
              <HowToWorkspace onNavigate={handleNav} />
            ) : activeNav === 'Cards' ? (
              <CardWorkspace />
            ) : activeNav === 'Sources' ? (
              <SourcesWorkspace />
            ) : activeNav === 'Odds board' ? (
              <OddsBoardWorkspace />
            ) : activeNav === 'Fight board' ? (
              <FightBoardWorkspace />
            ) : activeNav === 'Bet ledger' ? (
              <LedgerWorkspace />
            ) : activeNav === 'Bankroll' ? (
              <BankrollWorkspace />
            ) : (
              <SettingsWorkspace />
            )}
          </div>
        </main>
      </div>
    </>
  )
}

export default WorkflowApp
