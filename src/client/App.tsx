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
import { HelpTooltip } from './components/HelpTooltip'
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
  help: string
}> = [
  {
    label: 'How to',
    icon: CircleHelp,
    purpose:
      'Follow the complete weekly workflow from importing an official card through reviewing evidence, placing bets, and settlement.',
    help: 'Use this guide as the start-to-finish checklist for preparing and tracking a UFC slate.',
  },
  {
    label: 'Cards',
    icon: CalendarDays,
    purpose:
      'Create each UFC event, maintain its official fight list, and optionally match misspelled transcript names.',
    help: 'Start here: import or create an event, add its fights, and map a transcript spelling only when it does not match the official fighter name.',
  },
  {
    label: 'Fight board',
    icon: Swords,
    purpose:
      'Turn reviewed picks and current prices into a fight-by-fight consensus view and a budget-capped draft slate.',
    help: 'Review consensus and evidence, create a draft slate after sources and prices are ready, then accept it to the ledger.',
  },
  {
    label: 'Sources',
    icon: BookOpenText,
    purpose:
      'Capture capper and tracker material, review the structured extraction, and accept only evidence you trust.',
    help: 'Paste capper or tracker material, parse it, check every extracted value and identity, then accept the reviewed run.',
  },
  {
    label: 'Odds board',
    icon: CircleDollarSign,
    purpose:
      'Record timestamped bookmaker prices so synthesis evaluates bets against markets that are actually available.',
    help: 'Enter current bookmaker prices. The newest reviewed price qualifies bets; transcript-mentioned odds are evidence only.',
  },
  {
    label: 'Bet ledger',
    icon: ClipboardCheck,
    purpose:
      'Track recommendations and bets actually placed, including the real odds, stake, parlay legs, and settlement result.',
    help: 'Record the bets actually placed, including actual odds and stake, then settle them after the event.',
  },
  {
    label: 'Bankroll',
    icon: BarChart3,
    purpose:
      'Review settled returns, ROI, performance breakdowns, capper accuracy, and downloadable application backups.',
    help: 'Review settled performance in units and AUD, filter by date, compare breakdowns, and download a backup.',
  },
]

const settingsNavItem = {
  label: 'Settings' as const,
  icon: Settings,
  purpose:
    'Maintain your current bankroll, default unit size, and the language-model connection used for extraction and summaries.',
  help: 'Set bankroll and unit size, save preferred OpenRouter models, and choose a reasoning level. API keys remain limited to this browser tab.',
}

function App() {
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
  const activeHelp = activeNavItem?.help ?? ''
  const activePurpose = activeNavItem?.purpose ?? ''

  return (
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
          {navItems.map(({ label, icon: Icon, help }) => (
            <button
              key={label}
              type="button"
              className={`nav-button ${activeNav === label ? 'nav-button--active' : ''}`}
              onClick={() => handleNav(label)}
              aria-label={label}
              title={sidebarCollapsed ? `${label} — ${help}` : help}
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
          title={settingsNavItem.help}
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
            aria-controls="application-sidebar"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={21} />
          </button>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div className="page-title-with-help">
              <h1>{activeNav}</h1>
              <HelpTooltip label={activeNav} text={activeHelp} align="left" />
            </div>
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
  )
}

export default App
