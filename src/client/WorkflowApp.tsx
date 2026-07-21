import {
  BarChart3,
  CalendarDays,
  Check,
  CircleAlert,
  CircleHelp,
  Clock3,
  FileText,
  ListChecks,
  Menu,
  Moon,
  Settings,
  Sparkles,
  Sun,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getCardWorkflowStatus,
  type CardWorkflowStatus,
  type WorkflowStageState,
} from './api'
import { BankrollWorkspace } from './components/BankrollWorkspace'
import { EventWorkspace } from './components/EventWorkspace'
import { FightBoardWorkspace } from './components/FightBoardWorkspace'
import { HowToWorkspace } from './components/HowToWorkspace'
import { LedgerWorkspace } from './components/LedgerWorkspace'
import { ResultsWorkspace } from './components/ResultsWorkspace'
import { SettingsWorkspace } from './components/SettingsWorkspace'
import { SourcesWorkspace } from './components/SourcesWorkspace'
import { formatCardTimestamp } from './format'
import {
  applyTheme,
  getInitialTheme,
  saveTheme,
  type Theme,
} from './ui-preferences'
import { useCards } from './use-cards'

export type WorkflowStep =
  'event' | 'tipper-picks' | 'recommendations' | 'my-bets' | 'results'
type UtilityView = 'help' | 'performance' | 'settings'

const steps: Array<{
  id: WorkflowStep
  statusKey: keyof CardWorkflowStatus['stages']
  label: string
  title: string
  purpose: string
  icon: typeof CalendarDays
}> = [
  {
    id: 'event',
    statusKey: 'event',
    label: 'Event',
    title: 'Event setup',
    purpose:
      'Import the card, review fight order, save source links, and confirm current odds.',
    icon: CalendarDays,
  },
  {
    id: 'tipper-picks',
    statusKey: 'tipperPicks',
    label: 'Tipper picks',
    title: 'Tipper picks',
    purpose:
      'Add structured tips, transcripts, and reviewed predictor evidence.',
    icon: FileText,
  },
  {
    id: 'recommendations',
    statusKey: 'recommendations',
    label: 'Recommendations',
    title: 'Recommendations',
    purpose:
      'Synthesise accepted evidence and current prices into a reviewable slate.',
    icon: Sparkles,
  },
  {
    id: 'my-bets',
    statusKey: 'myBets',
    label: 'My bets',
    title: 'My bets',
    purpose:
      'Record what you actually placed, including manual singles and parlays.',
    icon: ListChecks,
  },
  {
    id: 'results',
    statusKey: 'results',
    label: 'Results',
    title: 'Results & settlement',
    purpose:
      'Fetch official results, review deterministic resolutions, and settle the event.',
    icon: Check,
  },
]

const stateLabels: Record<WorkflowStageState, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  needs_attention: 'Needs attention',
  ready: 'Ready',
  waiting: 'Waiting for event',
  complete: 'Complete',
}

function StateIcon({ state }: { state: WorkflowStageState }) {
  if (state === 'needs_attention') return <CircleAlert size={14} />
  if (state === 'waiting') return <Clock3 size={14} />
  if (state === 'ready' || state === 'complete') return <Check size={14} />
  return <span className="workflow-state-dot" aria-hidden="true" />
}

function initialLocation(): { step: WorkflowStep; view: UtilityView | null } {
  const params = new URLSearchParams(window.location.search)
  const step = params.get('step') as WorkflowStep | null
  const view = params.get('view') as UtilityView | null
  return {
    step: steps.some((candidate) => candidate.id === step)
      ? (step as WorkflowStep)
      : 'recommendations',
    view: ['help', 'performance', 'settings'].includes(view ?? '')
      ? view
      : null,
  }
}

export default function WorkflowApp() {
  const { cards, selectedCardId, setSelectedCardId, cardsLoaded } = useCards()
  const [location, setLocation] = useState(initialLocation)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [workflow, setWorkflow] = useState<CardWorkflowStatus | null>(null)
  const [utilityOpen, setUtilityOpen] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const selectedCard = useMemo(
    () => cards.find((card) => card.id === selectedCardId) ?? null,
    [cards, selectedCardId],
  )
  const activeStepIndex = steps.findIndex((step) => step.id === location.step)
  const activeStep = steps[activeStepIndex] ?? steps[0]
  const visibleWorkflow = workflow?.cardId === selectedCardId ? workflow : null

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search)
      const cardId = params.get('card')
      if (cardId && cards.some((card) => card.id === cardId)) {
        setSelectedCardId(cardId)
      }
      setLocation(initialLocation())
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [cards, setSelectedCardId])

  useEffect(() => {
    if (!selectedCardId) return
    let cancelled = false
    getCardWorkflowStatus(selectedCardId)
      .then((next) => !cancelled && setWorkflow(next))
      .catch(() => !cancelled && setWorkflow(null))
    return () => {
      cancelled = true
    }
  }, [selectedCardId, location.step])

  useEffect(() => {
    headingRef.current?.focus()
  }, [location])

  const navigate = (
    next: { step?: WorkflowStep; view?: UtilityView | null },
    replace = false,
  ) => {
    const nextLocation = {
      step: next.step ?? location.step,
      view: next.view === undefined ? location.view : next.view,
    }
    const params = new URLSearchParams()
    if (selectedCardId) params.set('card', selectedCardId)
    if (nextLocation.view) params.set('view', nextLocation.view)
    else params.set('step', nextLocation.step)
    window.history[replace ? 'replaceState' : 'pushState'](
      {},
      '',
      `${window.location.pathname}?${params.toString()}`,
    )
    setLocation(nextLocation)
    setUtilityOpen(false)
  }

  const handleCardChange = (cardId: string) => {
    setSelectedCardId(cardId)
    const params = new URLSearchParams(window.location.search)
    if (cardId) params.set('card', cardId)
    else params.delete('card')
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`)
  }

  const globalTitle =
    location.view === 'help'
      ? 'Help'
      : location.view === 'performance'
        ? 'Performance'
        : location.view === 'settings'
          ? 'Settings'
          : activeStep.title
  const globalPurpose =
    location.view === 'help'
      ? 'Follow the complete weekly card workflow and learn why each review boundary exists.'
      : location.view === 'performance'
        ? 'Review bankroll, ROI, capper accuracy, and historical performance.'
        : location.view === 'settings'
          ? 'Configure bankroll defaults and the model connection used for language extraction.'
          : activeStep.purpose

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="workflow-shell">
        <header className="app-header">
          <button
            className="app-brand"
            type="button"
            onClick={() => navigate({ step: 'event', view: null })}
          >
            <span className="brand-mark" aria-hidden="true">
              <span>U</span>
            </span>
            <span>
              <strong>Fightfolio</strong>
              <small>Bet synthesiser</small>
            </span>
          </button>
          <div className="active-event-control">
            <label htmlFor="active-event">Active event</label>
            <select
              id="active-event"
              value={selectedCardId}
              onChange={(event) => handleCardChange(event.target.value)}
              disabled={!cardsLoaded}
            >
              {cards.length === 0 && (
                <option value="">Create or discover an event</option>
              )}
              {cards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </select>
            {selectedCard && (
              <small>
                {selectedCard.eventStartsAtUtc
                  ? formatCardTimestamp(
                      selectedCard.eventStartsAtUtc,
                      selectedCard.displayTimezone,
                    )
                  : 'Date not set'}{' '}
                · {selectedCard.lifecycle.replaceAll('_', ' ')}
              </small>
            )}
          </div>
          <nav
            className={`utility-nav ${utilityOpen ? 'utility-nav--open' : ''}`}
            aria-label="Global navigation"
          >
            <button type="button" onClick={() => navigate({ view: 'help' })}>
              <CircleHelp size={17} />
              <span>Help</span>
            </button>
            <button
              type="button"
              onClick={() => navigate({ view: 'performance' })}
            >
              <BarChart3 size={17} />
              <span>Performance</span>
            </button>
            <button
              type="button"
              onClick={() => navigate({ view: 'settings' })}
            >
              <Settings size={17} />
              <span>Settings</span>
            </button>
            <button
              type="button"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              onClick={() =>
                setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
              }
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
          </nav>
          <button
            className="utility-menu-button"
            type="button"
            aria-label="Open global navigation"
            aria-expanded={utilityOpen}
            onClick={() => setUtilityOpen((open) => !open)}
          >
            <Menu size={20} />
          </button>
        </header>

        {!location.view && (
          <nav className="workflow-nav" aria-label="Card workflow">
            <ol>
              {steps.map((step, index) => {
                const Icon = step.icon
                const status = visibleWorkflow?.stages[step.statusKey]
                const state = status?.state ?? 'not_started'
                return (
                  <li key={step.id}>
                    <button
                      type="button"
                      className={`workflow-step-button workflow-step-button--${state}`}
                      aria-label={step.label}
                      aria-current={
                        location.step === step.id ? 'step' : undefined
                      }
                      onClick={() => navigate({ step: step.id, view: null })}
                    >
                      <span className="workflow-step-number">{index + 1}</span>
                      <Icon className="workflow-step-icon" size={18} />
                      <span className="workflow-step-copy">
                        <strong>{step.label}</strong>
                        <small>
                          {status?.summary ?? 'Choose an event to begin'}
                        </small>
                      </span>
                      <span className="workflow-step-state">
                        <StateIcon state={state} />
                        {stateLabels[state]}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>
        )}

        <main id="main-content" className="workflow-main" tabIndex={-1}>
          <div className="page-content">
            <section className="page-heading workflow-page-heading">
              {!location.view && (
                <span className="mobile-step-count">
                  Step {activeStepIndex + 1} of {steps.length}
                </span>
              )}
              <h1 ref={headingRef} tabIndex={-1}>
                {globalTitle}
              </h1>
              <p>{globalPurpose}</p>
              {!location.view && visibleWorkflow && (
                <div
                  className={`active-stage-status active-stage-status--${visibleWorkflow.stages[activeStep.statusKey].state}`}
                >
                  <StateIcon
                    state={visibleWorkflow.stages[activeStep.statusKey].state}
                  />
                  <strong>
                    {
                      stateLabels[
                        visibleWorkflow.stages[activeStep.statusKey].state
                      ]
                    }
                  </strong>
                  {visibleWorkflow.stages[activeStep.statusKey].blockers.map(
                    (blocker) => (
                      <span key={blocker}>{blocker}</span>
                    ),
                  )}
                </div>
              )}
            </section>

            <div className="workflow-stage">
              {location.view === 'help' ? (
                <HowToWorkspace
                  onNavigate={(destination) => {
                    if (destination === 'Settings')
                      navigate({ view: 'settings' })
                    else if (
                      destination === 'Cards' ||
                      destination === 'Odds board'
                    )
                      navigate({ step: 'event', view: null })
                    else if (destination === 'Sources')
                      navigate({ step: 'tipper-picks', view: null })
                    else if (destination === 'Fight board')
                      navigate({ step: 'recommendations', view: null })
                    else navigate({ step: 'my-bets', view: null })
                  }}
                />
              ) : location.view === 'performance' ? (
                <BankrollWorkspace />
              ) : location.view === 'settings' ? (
                <SettingsWorkspace />
              ) : location.step === 'event' ? (
                <EventWorkspace />
              ) : location.step === 'tipper-picks' ? (
                <SourcesWorkspace />
              ) : location.step === 'recommendations' ? (
                <FightBoardWorkspace
                  readiness={visibleWorkflow?.stages.recommendations}
                  onReviewBets={() => navigate({ step: 'my-bets', view: null })}
                />
              ) : location.step === 'my-bets' ? (
                <LedgerWorkspace />
              ) : (
                <ResultsWorkspace key={selectedCardId} />
              )}
            </div>

            {!location.view && (
              <nav
                className="workflow-pagination"
                aria-label="Workflow pagination"
              >
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={activeStepIndex <= 0}
                  onClick={() =>
                    navigate({
                      step: steps[activeStepIndex - 1]?.id ?? 'event',
                      view: null,
                    })
                  }
                >
                  Previous
                </button>
                <span>
                  Step {activeStepIndex + 1} of {steps.length}
                </span>
                <button
                  className="button button--primary"
                  type="button"
                  disabled={activeStepIndex >= steps.length - 1}
                  onClick={() =>
                    navigate({
                      step: steps[activeStepIndex + 1]?.id ?? 'results',
                      view: null,
                    })
                  }
                >
                  Next
                </button>
              </nav>
            )}
          </div>
        </main>
      </div>
    </>
  )
}
