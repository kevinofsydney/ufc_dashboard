import { Check, DownloadCloud, LoaderCircle, RotateCcw } from 'lucide-react'
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  applyResultsReview,
  fetchResultsPreview,
  getBets,
  getFightOutcomes,
  getFights,
  putFightOutcome,
  settleBet,
  type Bet,
  type Fight,
  type FightOutcome,
  type ResultsPreview,
} from '../api'
import { errorMessage } from '../format'
import { useCards } from '../use-cards'

const emptyOutcome = (fightId: string): FightOutcome => ({
  fightId,
  status: 'pending',
  winnerFighterId: null,
  method: null,
  round: null,
  recordedAt: null,
  sourceProvider: null,
  sourceUrl: null,
  fetchedAt: null,
  updatedAt: '',
})

export function ResultsWorkspace() {
  const { selectedCardId } = useCards()
  const [fights, setFights] = useState<Fight[]>([])
  const [outcomes, setOutcomes] = useState<FightOutcome[]>([])
  const [bets, setBets] = useState<Bet[]>([])
  const [preview, setPreview] = useState<ResultsPreview | null>(null)
  const [proposalResults, setProposalResults] = useState<
    Record<string, string>
  >({})
  const [proposalLegResults, setProposalLegResults] = useState<
    Record<string, string>
  >({})
  const [proposalOdds, setProposalOdds] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{
    kind: 'success' | 'error'
    text: string
  } | null>(null)

  const reload = useCallback(async () => {
    if (!selectedCardId) {
      setFights([])
      setOutcomes([])
      setBets([])
      return
    }
    const [nextFights, nextOutcomes, nextBets] = await Promise.all([
      getFights(selectedCardId),
      getFightOutcomes(selectedCardId),
      getBets(selectedCardId),
    ])
    setFights(nextFights)
    setOutcomes(nextOutcomes)
    setBets(nextBets)
  }, [selectedCardId])

  useEffect(() => {
    if (!selectedCardId) return
    let cancelled = false
    Promise.all([
      getFights(selectedCardId),
      getFightOutcomes(selectedCardId),
      getBets(selectedCardId),
    ])
      .then(([nextFights, nextOutcomes, nextBets]) => {
        if (cancelled) return
        setFights(nextFights)
        setOutcomes(nextOutcomes)
        setBets(nextBets)
      })
      .catch((requestError: unknown) => {
        if (cancelled) return
        setMessage({
          kind: 'error',
          text: errorMessage(requestError, 'Results could not be loaded'),
        })
      })
    return () => {
      cancelled = true
    }
  }, [selectedCardId])

  const outcomeByFight = useMemo(
    () => new Map(outcomes.map((outcome) => [outcome.fightId, outcome])),
    [outcomes],
  )

  const handleFetch = async () => {
    if (!selectedCardId) return
    setBusy(true)
    setMessage(null)
    try {
      const nextPreview = await fetchResultsPreview(selectedCardId)
      setPreview(nextPreview)
      setProposalResults(
        Object.fromEntries(
          nextPreview.betProposals.map((proposal) => [
            proposal.betId,
            proposal.result ?? '',
          ]),
        ),
      )
      setProposalLegResults(
        Object.fromEntries(
          nextPreview.betProposals.flatMap((proposal) =>
            proposal.legProposals.map((leg) => [leg.legId, leg.result ?? '']),
          ),
        ),
      )
      setProposalOdds({})
    } catch (requestError) {
      setMessage({
        kind: 'error',
        text: errorMessage(requestError, 'Results could not be fetched'),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleApply = async () => {
    if (!selectedCardId || !preview) return
    setBusy(true)
    setMessage(null)
    try {
      const settlements = preview.betProposals.flatMap((proposal) => {
        const result = proposalResults[proposal.betId]
        return result
          ? [
              {
                betId: proposal.betId,
                result: result as 'won' | 'lost' | 'push' | 'void',
                settlementOddsInput:
                  proposalOdds[proposal.betId]?.trim() || null,
                legs: proposal.legProposals.flatMap((leg) => {
                  const legResult = proposalLegResults[leg.legId]
                  return legResult
                    ? [
                        {
                          legId: leg.legId,
                          result: legResult as 'won' | 'lost' | 'push' | 'void',
                        },
                      ]
                    : []
                }),
              },
            ]
          : []
      })
      const applied = await applyResultsReview(selectedCardId, {
        provider: preview.provider,
        sourceUrl: preview.sourceUrl,
        outcomes: preview.outcomes.filter(
          (outcome) => outcome.issues.length === 0,
        ),
        settlements,
      })
      setPreview(null)
      await reload()
      setMessage({
        kind: 'success',
        text: `Applied ${applied.outcomesApplied} fight results and settled ${applied.betsSettled} bets.`,
      })
    } catch (requestError) {
      setMessage({
        kind: 'error',
        text: errorMessage(
          requestError,
          'Reviewed results could not be applied',
        ),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleManualOutcome = async (
    event: FormEvent<HTMLFormElement>,
    fight: Fight,
  ) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const status = String(form.get('status')) as FightOutcome['status']
    setBusy(true)
    try {
      await putFightOutcome(fight.id, {
        status,
        winnerFighterId:
          status === 'winner'
            ? String(form.get('winnerFighterId') ?? '') || null
            : null,
        method:
          status === 'winner'
            ? (String(form.get('method') ?? '') as FightOutcome['method']) ||
              null
            : null,
        round:
          status === 'winner'
            ? (String(form.get('round') ?? '') as FightOutcome['round']) || null
            : null,
      })
      await reload()
    } catch (requestError) {
      setMessage({
        kind: 'error',
        text: errorMessage(requestError, 'Fight result could not be saved'),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleManualSettlement = async (
    event: FormEvent<HTMLFormElement>,
    bet: Bet,
  ) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      await settleBet(
        bet.id,
        String(form.get('result')) as 'won' | 'lost' | 'push' | 'void',
        String(form.get('settlementOddsInput') ?? '').trim() || null,
      )
      await reload()
    } catch (requestError) {
      setMessage({
        kind: 'error',
        text: errorMessage(requestError, 'Bet could not be settled'),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="workspace-stack results-workspace">
      <section className="results-import-card">
        <div className="section-heading">
          <div>
            <h2>Official results import</h2>
            <p>
              Fetch from the saved UFC.com URL first, then Tapology. Review
              every outcome and settlement proposal before applying it.
            </p>
          </div>
          <button
            className="button button--primary"
            type="button"
            disabled={!selectedCardId || busy}
            onClick={() => void handleFetch()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <DownloadCloud size={16} />
            )}
            Fetch latest results
          </button>
        </div>
        {preview && (
          <div className="results-preview" aria-live="polite">
            <p>
              <strong>{preview.provider.toUpperCase()}</strong> ·{' '}
              {preview.outcomes.length} matched outcomes ·{' '}
              {preview.unmatched.length} unmatched
            </p>
            {preview.conflicts.length > 0 && (
              <div className="form-message form-message--error">
                <strong>Resolve source conflicts before applying</strong>
                {preview.conflicts.map((conflict) => (
                  <span key={conflict}>{conflict}</span>
                ))}
              </div>
            )}
            <div className="result-preview-list">
              {preview.outcomes.map((outcome) => (
                <article className="result-preview-row" key={outcome.fightId}>
                  <strong>{outcome.fightLabel}</strong>
                  <span>
                    {outcome.status.replaceAll('_', ' ')} ·{' '}
                    {outcome.method ?? 'method unavailable'} · round{' '}
                    {outcome.round ?? '—'}
                  </span>
                  <small>{outcome.sourceProvider.toUpperCase()} source</small>
                  {outcome.issues.map((issue) => (
                    <small key={issue}>{issue}</small>
                  ))}
                </article>
              ))}
            </div>
            {preview.betProposals.length > 0 && (
              <div className="settlement-proposals">
                <h3>Settlement proposals</h3>
                {preview.betProposals.map((proposal) => {
                  const bet = bets.find(
                    (candidate) => candidate.id === proposal.betId,
                  )
                  return (
                    <article
                      className="result-proposal-row"
                      key={proposal.betId}
                    >
                      <span>
                        <strong>{bet?.selectionText ?? 'Placed bet'}</strong>
                        <small>{proposal.reason}</small>
                      </span>
                      <label className="field">
                        <span>Bet result</span>
                        <select
                          aria-label={`Settlement for ${bet?.selectionText ?? proposal.betId}`}
                          value={proposalResults[proposal.betId] ?? ''}
                          onChange={(event) =>
                            setProposalResults((current) => ({
                              ...current,
                              [proposal.betId]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Leave for manual review</option>
                          <option value="won">Won</option>
                          <option value="lost">Lost</option>
                          <option value="push">Push</option>
                          <option value="void">Void</option>
                        </select>
                      </label>
                      {proposal.legProposals.map((leg) => {
                        const betLeg = bet?.legs.find(
                          (candidate) => candidate.id === leg.legId,
                        )
                        return (
                          <label className="field" key={leg.legId}>
                            <span>{betLeg?.selectionText ?? 'Parlay leg'}</span>
                            <select
                              aria-label={`Result for ${betLeg?.selectionText ?? leg.legId}`}
                              value={proposalLegResults[leg.legId] ?? ''}
                              onChange={(event) =>
                                setProposalLegResults((current) => ({
                                  ...current,
                                  [leg.legId]: event.target.value,
                                }))
                              }
                            >
                              <option value="">Review manually</option>
                              <option value="won">Won</option>
                              <option value="lost">Lost</option>
                              <option value="push">Push</option>
                              <option value="void">Void</option>
                            </select>
                            <small>{leg.reason}</small>
                          </label>
                        )
                      })}
                      <label className="field">
                        <span>Confirmed settlement odds</span>
                        <input
                          aria-label={`Settlement odds for ${bet?.selectionText ?? proposal.betId}`}
                          value={proposalOdds[proposal.betId] ?? ''}
                          onChange={(event) =>
                            setProposalOdds((current) => ({
                              ...current,
                              [proposal.betId]: event.target.value,
                            }))
                          }
                          placeholder="Required after a void parlay leg"
                        />
                      </label>
                    </article>
                  )
                })}
              </div>
            )}
            <button
              className="button button--primary button--full"
              type="button"
              disabled={busy || preview.conflicts.length > 0}
              onClick={() => void handleApply()}
            >
              <Check size={16} /> Apply reviewed results
            </button>
          </div>
        )}
        {message && (
          <p className={`form-message form-message--${message.kind}`}>
            {message.text}
          </p>
        )}
      </section>

      <section className="records-card">
        <div className="section-heading">
          <div>
            <h2>Fight outcomes</h2>
            <p>Manual fallback and correction path.</p>
          </div>
          <span className="quiet-badge">
            {outcomes.filter((outcome) => outcome.status !== 'pending').length}/
            {fights.length} final
          </span>
        </div>
        <div className="record-list">
          {fights.map((fight) => {
            const outcome =
              outcomeByFight.get(fight.id) ?? emptyOutcome(fight.id)
            return (
              <article className="record-row result-fight-row" key={fight.id}>
                <strong>
                  {fight.fighterA.name} vs {fight.fighterB.name}
                </strong>
                <form
                  className="fight-outcome-form"
                  onSubmit={(event) => void handleManualOutcome(event, fight)}
                >
                  <label className="field">
                    <span>Official result</span>
                    <select name="status" defaultValue={outcome.status}>
                      <option value="pending">Pending</option>
                      <option value="winner">Winner</option>
                      <option value="draw">Draw</option>
                      <option value="no_contest">No contest</option>
                      <option value="overturned">Overturned</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Winner</span>
                    <select
                      name="winnerFighterId"
                      defaultValue={outcome.winnerFighterId ?? ''}
                    >
                      <option value="">Not selected</option>
                      <option value={fight.fighterA.id}>
                        {fight.fighterA.name}
                      </option>
                      <option value={fight.fighterB.id}>
                        {fight.fighterB.name}
                      </option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Method</span>
                    <select name="method" defaultValue={outcome.method ?? ''}>
                      <option value="">Not recorded</option>
                      <option value="ko_tko">KO / TKO</option>
                      <option value="submission">Submission</option>
                      <option value="decision">Decision</option>
                      <option value="disqualification">Disqualification</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Round</span>
                    <select name="round" defaultValue={outcome.round ?? ''}>
                      <option value="">Not recorded</option>
                      {['1', '2', '3', '4', '5'].map((round) => (
                        <option value={round} key={round}>
                          {round}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button button--secondary"
                    type="submit"
                    disabled={busy}
                  >
                    Save result
                  </button>
                </form>
              </article>
            )
          })}
        </div>
      </section>

      <section className="records-card">
        <div className="section-heading">
          <div>
            <h2>Unsettled bets</h2>
            <p>Ambiguous and legacy markets stay here for manual grading.</p>
          </div>
        </div>
        <div className="record-list">
          {bets
            .filter((bet) => bet.state === 'placed')
            .map((bet) => (
              <article className="record-row" key={bet.id}>
                <div>
                  <strong>{bet.selectionText}</strong>
                  {!bet.fightId && bet.legs.length === 0 && (
                    <small>Legacy unstructured bet</small>
                  )}
                </div>
                <form
                  className="ledger-settlement"
                  onSubmit={(event) => void handleManualSettlement(event, bet)}
                >
                  <select
                    name="result"
                    aria-label={`Result for ${bet.selectionText}`}
                  >
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                    <option value="push">Push</option>
                    <option value="void">Void</option>
                  </select>
                  <input
                    name="settlementOddsInput"
                    aria-label={`Settlement odds for ${bet.selectionText}`}
                    placeholder={bet.oddsTaken ?? 'Odds'}
                  />
                  <button
                    className="button button--secondary"
                    type="submit"
                    disabled={busy}
                  >
                    Settle
                  </button>
                </form>
              </article>
            ))}
          {bets.every((bet) => bet.state !== 'placed') && (
            <div className="empty-state">
              <RotateCcw size={20} />
              <p>No unsettled bets</p>
            </div>
          )}
        </div>
      </section>
    </section>
  )
}
