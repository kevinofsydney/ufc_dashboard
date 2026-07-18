import {
  CalendarDays,
  CircleDollarSign,
  LoaderCircle,
  Sparkles,
  Swords,
} from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  acceptSynthesis,
  getCards,
  getCurrentSynthesis,
  getFightOutcomes,
  getFights,
  postSynthesis,
  putFightOutcome,
  type Card,
  type Fight,
  type FightOutcome,
  type Synthesis,
} from '../api'
import { formatCardTimestamp } from '../format'
import { HelpTooltip } from './HelpTooltip'

export function FightBoardWorkspace() {
  const [cards, setCards] = useState<Card[]>([])
  const [fights, setFights] = useState<Fight[]>([])
  const [outcomes, setOutcomes] = useState<FightOutcome[]>([])
  const [selectedCardId, setSelectedCardId] = useState('')
  const [loading, setLoading] = useState(true)
  const [synthesising, setSynthesising] = useState(false)
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [savingOutcomeFightId, setSavingOutcomeFightId] = useState<
    string | null
  >(null)
  const [synthesisAccepted, setSynthesisAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getCards()
      .then((nextCards) => {
        if (cancelled) return
        setCards(nextCards)
        setSelectedCardId((current) => current || nextCards[0]?.id || '')
        if (nextCards.length === 0) setLoading(false)
      })
      .catch(
        (requestError: unknown) =>
          !cancelled &&
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Cards could not be loaded',
          ),
      )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedCardId) return
    Promise.all([
      getFights(selectedCardId),
      getCurrentSynthesis(selectedCardId),
      getFightOutcomes(selectedCardId),
    ])
      .then(([nextFights, currentSynthesis, nextOutcomes]) => {
        setFights(nextFights)
        setOutcomes(nextOutcomes)
        setSynthesis(currentSynthesis)
        setSynthesisAccepted(currentSynthesis?.status === 'accepted')
      })
      .catch((requestError: unknown) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Fights could not be loaded',
        ),
      )
      .finally(() => setLoading(false))
  }, [selectedCardId])

  const selectedCard = useMemo(
    () => cards.find((card) => card.id === selectedCardId) ?? null,
    [cards, selectedCardId],
  )

  const handleSynthesis = async () => {
    if (!selectedCardId) return
    setSynthesising(true)
    setError(null)
    try {
      setSynthesis(await postSynthesis(selectedCardId))
      setSynthesisAccepted(false)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Card could not be synthesised',
      )
    } finally {
      setSynthesising(false)
    }
  }

  const handleAcceptSynthesis = async () => {
    if (!synthesis) return
    setAccepting(true)
    setError(null)
    try {
      await acceptSynthesis(synthesis.id)
      setSynthesis((current) =>
        current ? { ...current, status: 'accepted' } : current,
      )
      setSynthesisAccepted(true)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Draft could not be accepted',
      )
    } finally {
      setAccepting(false)
    }
  }

  const handleOutcome = async (
    event: FormEvent<HTMLFormElement>,
    fight: Fight,
  ) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = String(form.get('outcomeResult') ?? 'pending')
    const winnerFighterId = result.startsWith('winner:')
      ? result.slice('winner:'.length)
      : null
    const status = (
      winnerFighterId ? 'winner' : result
    ) as FightOutcome['status']
    setSavingOutcomeFightId(fight.id)
    setError(null)
    try {
      const outcome = await putFightOutcome(fight.id, {
        status,
        winnerFighterId,
        method:
          status === 'winner'
            ? (String(form.get('method') || '') as FightOutcome['method']) ||
              null
            : null,
        round:
          status === 'winner'
            ? (String(form.get('round') || '') as FightOutcome['round']) || null
            : null,
      })
      setOutcomes((current) => [
        ...current.filter((item) => item.fightId !== fight.id),
        outcome,
      ])
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Fight outcome could not be saved',
      )
    } finally {
      setSavingOutcomeFightId(null)
    }
  }

  return (
    <section className="workspace-stack">
      <div className="source-toolbar">
        <label className="field source-card-select">
          <span>Working card</span>
          <select
            value={selectedCardId}
            onChange={(event) => {
              setLoading(true)
              setFights([])
              setOutcomes([])
              setSynthesis(null)
              setSynthesisAccepted(false)
              setSelectedCardId(event.target.value)
            }}
          >
            {cards.length === 0 && (
              <option value="">Create a card first</option>
            )}
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
        </label>
        {selectedCard && (
          <div className="board-summary">
            <span>
              <CalendarDays size={14} />{' '}
              {selectedCard.eventStartsAtUtc
                ? formatCardTimestamp(
                    selectedCard.eventStartsAtUtc,
                    selectedCard.displayTimezone,
                  )
                : 'Date not set'}
            </span>
            <span>
              <CircleDollarSign size={14} /> {selectedCard.budgetUnits}u at $
              {(selectedCard.unitValueCents / 100).toFixed(2)}
            </span>
            <button
              className="button button--primary button--compact"
              type="button"
              title="Calculate consensus and a budget-capped draft from accepted sources and current prices"
              disabled={synthesising || fights.length === 0}
              onClick={() => void handleSynthesis()}
            >
              {synthesising ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Sparkles size={14} />
              )}
              {synthesising ? 'Synthesising' : 'Create draft slate'}
            </button>
          </div>
        )}
      </div>

      <div className="fight-column live-fight-board">
        <div className="section-heading">
          <div>
            <div className="heading-with-help">
              <h2>Fight Board</h2>
              <HelpTooltip
                label="Fight Board"
                text="Read the computed pick, weighted share, supporters, dissent, method and round evidence. Add sources and prices first, then create a draft slate."
                align="left"
              />
            </div>
          </div>
          <span className="quiet-badge">{fights.length} fights</span>
        </div>

        {error && <p className="form-message form-message--error">{error}</p>}
        {loading ? (
          <div className="empty-state">
            <LoaderCircle className="spin" size={23} />
            <p>Loading Fight Board</p>
          </div>
        ) : fights.length === 0 ? (
          <div className="empty-state">
            <Swords size={24} />
            <p>No fights on this card</p>
            <span>Add the reviewed bout list on the Cards page.</span>
          </div>
        ) : (
          <div className="fight-list">
            {fights.map((fight, index) =>
              (() => {
                const outcome = outcomes.find(
                  (item) => item.fightId === fight.id,
                )
                const outcomeResult =
                  outcome?.status === 'winner' && outcome.winnerFighterId
                    ? `winner:${outcome.winnerFighterId}`
                    : (outcome?.status ?? 'pending')
                const summary = synthesis?.fightSummaries.find(
                  (item) => item.fightId === fight.id,
                )
                const pickedFighter = [fight.fighterA, fight.fighterB].find(
                  (fighter) => fighter.id === summary?.consensusFighterId,
                )
                const isAwaitingConsensus = !summary || !pickedFighter
                return (
                  <article
                    className={`fight-board-card ${isAwaitingConsensus ? 'fight-board-card--awaiting' : ''} ${fight.status !== 'scheduled' ? 'fight-board-card--muted' : ''}`}
                    key={fight.id}
                  >
                    <div className="fight-board-card__identity">
                      <div className="fight-board-card__order">
                        <span>
                          {fight.isMainEvent
                            ? 'Main event'
                            : `Bout ${fight.boutOrder ?? index + 1}`}
                        </span>
                        <small>
                          {fight.weightClass ?? 'Weight class not recorded'}
                        </small>
                      </div>
                      <div className="fight-board-card__matchup">
                        <strong>{fight.fighterA.name}</strong>
                        <span>vs</span>
                        <strong>{fight.fighterB.name}</strong>
                      </div>
                    </div>
                    <div className="fight-board-card__analysis">
                      {isAwaitingConsensus ? (
                        <p className="fight-board-card__status">
                          {fight.status === 'scheduled'
                            ? 'No accepted source opinions yet'
                            : fight.status}
                        </p>
                      ) : (
                        <div className="consensus-result">
                          <div className="consensus-result__pick">
                            <span>Pick</span>
                            <strong>{pickedFighter.name}</strong>
                            <small>
                              {summary.rawSupportCount}/
                              {summary.eligibleVoterCount} cappers ·{' '}
                              {Math.round((summary.weightedShare ?? 0) * 100)}%
                              weighted
                            </small>
                          </div>
                          {summary.badges.length > 0 && (
                            <div className="consensus-badges">
                              {summary.badges.map((badge) => (
                                <span key={badge}>
                                  {badge.replaceAll('_', ' ')}
                                </span>
                              ))}
                            </div>
                          )}
                          {summary.evidence.missingCurrentMoneylinePrice && (
                            <p className="form-message form-message--warning">
                              Consensus found, but its current moneyline price
                              is missing from the Odds Board.
                            </p>
                          )}
                          <div className="consensus-detail-grid">
                            <div>
                              <span>Method</span>
                              <strong>
                                {summary.consensusMethod
                                  ? summary.consensusMethod.replace('_', '/')
                                  : 'No consensus'}
                              </strong>
                              <small>
                                {summary.methodSupportCount}/
                                {summary.methodEligibleCount || 0} eligible
                              </small>
                            </div>
                            <div>
                              <span>Round</span>
                              <strong>
                                {summary.consensusRound ?? 'Few/no calls'}
                              </strong>
                              <small>
                                {summary.roundSupportCount}/
                                {summary.roundEligibleCount || 0} eligible
                              </small>
                            </div>
                          </div>
                          {summary.evidence.tracker && (
                            <div className="tracker-evidence">
                              <strong>Tracker evidence</strong>
                              {summary.evidence.tracker.allChannels && (
                                <span>
                                  All channels — {fight.fighterA.name}:{' '}
                                  {summary.evidence.tracker.allChannels
                                    .fighter_a_count ?? '—'}{' '}
                                  · {fight.fighterB.name}:{' '}
                                  {summary.evidence.tracker.allChannels
                                    .fighter_b_count ?? '—'}{' '}
                                  · total{' '}
                                  {summary.evidence.tracker.allChannels.total ??
                                    'not stated'}
                                </span>
                              )}
                              {summary.evidence.tracker.bestOverall && (
                                <span>
                                  Best predictors — {fight.fighterA.name}:{' '}
                                  {summary.evidence.tracker.bestOverall
                                    .fighter_a_count ?? '—'}{' '}
                                  · {fight.fighterB.name}:{' '}
                                  {summary.evidence.tracker.bestOverall
                                    .fighter_b_count ?? '—'}{' '}
                                  · total{' '}
                                  {summary.evidence.tracker.bestOverall.total ??
                                    'not stated'}
                                </span>
                              )}
                              {summary.evidence.tracker.bookmakerNote && (
                                <small>
                                  {summary.evidence.tracker.bookmakerNote}
                                </small>
                              )}
                            </div>
                          )}
                          <p className="consensus-overview">
                            <strong>Why:</strong> {summary.overviewText}
                          </p>
                          {(summary.evidence.dissenters.length > 0 ||
                            summary.evidence.supporters.length > 0) && (
                            <details className="consensus-sources">
                              <summary>
                                Supporting and dissenting evidence
                              </summary>
                              {summary.evidence.supporters.map((supporter) => (
                                <p key={`support-${supporter.capperId}`}>
                                  <strong>{supporter.capperName}</strong>{' '}
                                  supports ({supporter.confidence}) —{' '}
                                  {supporter.reasoning}
                                </p>
                              ))}
                              {summary.evidence.dissenters.map((dissenter) => (
                                <p key={`dissent-${dissenter.capperId}`}>
                                  <strong>{dissenter.capperName}</strong>{' '}
                                  dissents ({dissenter.confidence}) —{' '}
                                  {dissenter.reasoning}
                                </p>
                              ))}
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                    <form
                      className="fight-outcome-form"
                      key={`${fight.id}:${outcome?.updatedAt ?? 'new'}`}
                      onSubmit={(event) => void handleOutcome(event, fight)}
                    >
                      <label>
                        <span>Official result</span>
                        <select
                          name="outcomeResult"
                          defaultValue={outcomeResult}
                        >
                          <option value="pending">Pending</option>
                          <option value={`winner:${fight.fighterA.id}`}>
                            {fight.fighterA.name} won
                          </option>
                          <option value={`winner:${fight.fighterB.id}`}>
                            {fight.fighterB.name} won
                          </option>
                          <option value="draw">Draw</option>
                          <option value="no_contest">No contest</option>
                          <option value="overturned">Overturned</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </label>
                      <label>
                        <span>Method</span>
                        <select
                          name="method"
                          defaultValue={outcome?.method ?? ''}
                        >
                          <option value="">Not recorded</option>
                          <option value="ko_tko">KO / TKO</option>
                          <option value="submission">Submission</option>
                          <option value="decision">Decision</option>
                          <option value="disqualification">
                            Disqualification
                          </option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <label>
                        <span>Round</span>
                        <select
                          name="round"
                          defaultValue={outcome?.round ?? ''}
                        >
                          <option value="">Not recorded</option>
                          {[1, 2, 3, 4, 5].map((round) => (
                            <option key={round} value={round}>
                              {round}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="button button--secondary button--compact"
                        disabled={savingOutcomeFightId === fight.id}
                      >
                        {savingOutcomeFightId === fight.id
                          ? 'Saving'
                          : 'Save result'}
                      </button>
                    </form>
                  </article>
                )
              })(),
            )}
          </div>
        )}
      </div>
      {synthesis && (
        <div className="draft-slate">
          <div className="section-heading">
            <div>
              <div className="heading-with-help">
                <h2>Recommended slate</h2>
                <HelpTooltip
                  label="Recommended slate"
                  text="Review every proposed play and the unspent budget. Accepting copies recommendations to the ledger; it does not place bets with a bookmaker."
                  align="left"
                />
              </div>
            </div>
            <span className="quiet-badge">
              {synthesis.recommendedUnits}u proposed · {synthesis.unspentUnits}u
              unspent
            </span>
            <button
              className="button button--primary button--compact"
              type="button"
              disabled={accepting || synthesisAccepted}
              onClick={() => void handleAcceptSynthesis()}
            >
              {accepting ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Sparkles size={14} />
              )}
              {synthesisAccepted ? 'Accepted to ledger' : 'Accept draft'}
            </button>
          </div>
          {synthesis.bets.length === 0 ? (
            <div className="empty-state empty-state--compact">
              <CircleDollarSign size={22} />
              <p>No bets qualified</p>
              <span>The allocator will not force-spend the card budget.</span>
            </div>
          ) : (
            <div className="record-list">
              {synthesis.bets.map((bet) => (
                <article className="price-row" key={bet.id}>
                  <div>
                    <span className="status-chip">{bet.tier}</span>
                    <strong>{bet.selectionText}</strong>
                    {bet.supportingCappers.length > 0 && (
                      <small>{bet.supportingCappers.join(', ')}</small>
                    )}
                    <p>{bet.rationale}</p>
                  </div>
                  <div className="price-value">
                    <strong>{bet.units}u</strong>
                    <span>@ {bet.decimalOdds.toFixed(2)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
