import {
  BadgeDollarSign,
  CalendarSearch,
  CheckCircle2,
  FileText,
  ListChecks,
  PlusCircle,
  Settings,
  Sparkles,
} from 'lucide-react'

type WorkflowDestination =
  'Settings' | 'Cards' | 'Sources' | 'Odds board' | 'Fight board' | 'Bet ledger'

interface HowToWorkspaceProps {
  onNavigate: (destination: WorkflowDestination) => void
}

const steps: Array<{
  number: string
  title: string
  description: string
  detail: string
  destination: WorkflowDestination
  action: string
  icon: typeof Settings
}> = [
  {
    number: '01',
    title: 'Set your bankroll and model',
    description:
      'Enter your current AUD bankroll and unit size, then choose a saved or current OpenRouter model and its reasoning level.',
    detail:
      "Load OpenRouter's current text-model catalogue or save a model ID yourself. Model preferences persist in the app; the API key remains scoped to your browser tab.",
    destination: 'Settings',
    action: 'Open Settings',
    icon: Settings,
  },
  {
    number: '02',
    title: 'Import the official fight card',
    description:
      'Paste the official UFC event URL, preview the event, then import or merge the fighter list.',
    detail:
      'When the page exposes moneyline odds, they appear in the preview. Importing them is an explicit choice because page odds can be stale or differ from your bookmaker.',
    destination: 'Cards',
    action: 'Open Cards',
    icon: CalendarSearch,
  },
  {
    number: '03',
    title: 'Add predictor transcripts',
    description:
      'Create one source per YouTube predictor, paste the transcript, and select the appropriate extraction mode.',
    detail:
      'Parse each source, correct ambiguous fighter names or attribution, and accept only the reviewed opinions and explicit bets you trust.',
    destination: 'Sources',
    action: 'Open Sources',
    icon: FileText,
  },
  {
    number: '04',
    title: 'Confirm the prices you can take',
    description:
      'Review imported UFC-page prices and replace or supplement them with your current bookmaker odds.',
    detail:
      'A recommendation needs a current reviewed price. Transcript-mentioned or unconfirmed page odds remain evidence, not permission to qualify a bet.',
    destination: 'Odds board',
    action: 'Open Odds Board',
    icon: BadgeDollarSign,
  },
  {
    number: '05',
    title: 'Synthesise the card',
    description:
      'Create a draft to combine accepted predictor calls, methods, rounds, confidence, and current prices.',
    detail:
      'OpenRouter extracts and summarises language. Tested code deduplicates votes, calculates consensus, applies staking rules, and returns the fighter, market, method, round, and stake candidates.',
    destination: 'Fight board',
    action: 'Open Fight Board',
    icon: Sparkles,
  },
  {
    number: '06',
    title: 'Use the ledger as your checklist',
    description:
      'Accept the draft, mark recommended lines as placed or skipped, and record the actual odds and stake you took.',
    detail:
      'Add any extra singles or parlays manually. After the event, settle the placed bets so bankroll and performance reporting reflect reality.',
    destination: 'Bet ledger',
    action: 'Open Bet Ledger',
    icon: ListChecks,
  },
]

export function HowToWorkspace({ onNavigate }: HowToWorkspaceProps) {
  return (
    <section className="how-to-workspace">
      <div className="workflow-overview">
        <div>
          <h2>From event page to placed-bet checklist</h2>
          <p>
            The app separates evidence gathering, price review, deterministic
            decision rules, and the bets you actually place. That keeps every
            recommendation traceable and prevents a stale webpage price or a
            repeated predictor mention from silently changing the slate.
          </p>
        </div>
        <div className="workflow-path" aria-label="Workflow summary">
          <span>Card</span>
          <span>Sources</span>
          <span>Prices</span>
          <span>Synthesise</span>
          <span>Place</span>
          <span>Settle</span>
        </div>
      </div>

      <div className="workflow-steps">
        {steps.map((step) => {
          const Icon = step.icon
          return (
            <article className="workflow-step" key={step.number}>
              <div className="workflow-step__number">{step.number}</div>
              <div className="workflow-step__icon">
                <Icon size={20} />
              </div>
              <div className="workflow-step__copy">
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <small>{step.detail}</small>
              </div>
              <button
                className="button button--secondary button--compact"
                type="button"
                onClick={() => onNavigate(step.destination)}
              >
                {step.destination === 'Bet ledger' ? (
                  <PlusCircle size={15} />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                {step.action}
              </button>
            </article>
          )
        })}
      </div>

      <div className="workflow-note">
        <strong>The key distinction</strong>
        <p>
          The model does not decide stake maths or invent a bet from outside
          evidence. It turns messy transcripts into reviewed structure and
          concise explanations; deterministic code produces the consensus and
          budget-capped slate.
        </p>
      </div>
    </section>
  )
}
