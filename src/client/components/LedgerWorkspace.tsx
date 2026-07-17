import { ClipboardCheck, LoaderCircle, Plus } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  getBets,
  getCards,
  getFights,
  placeBet,
  postManualBet,
  settleBet,
  skipBet,
  type Bet,
  type Card,
  type Fight,
  unsettleBet,
} from '../api'

export function LedgerWorkspace() {
  const [cards, setCards] = useState<Card[]>([])
  const [bets, setBets] = useState<Bet[]>([])
  const [fights, setFights] = useState<Fight[]>([])
  const [manualLegs, setManualLegs] = useState<
    Array<{ id: string; fightId: string; selectionFighterId: string }>
  >([])
  const [manualMarketType, setManualMarketType] = useState('moneyline')
  const [selectedCardId, setSelectedCardId] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyBetId, setBusyBetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getCards()
      .then((nextCards) => {
        setCards(nextCards)
        setSelectedCardId((current) => current || nextCards[0]?.id || '')
      })
      .catch((requestError: unknown) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Cards could not be loaded',
        ),
      )
  }, [])

  useEffect(() => {
    if (!selectedCardId) return
    Promise.all([getBets(selectedCardId), getFights(selectedCardId)])
      .then(([nextBets, nextFights]) => {
        setBets(nextBets)
        setFights(nextFights)
      })
      .catch((requestError: unknown) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Ledger could not be loaded',
        ),
      )
  }, [selectedCardId])

  const placedExposure = useMemo(
    () =>
      bets
        .filter((bet) => bet.state === 'placed' || bet.state === 'settled')
        .reduce((total, bet) => total + Number(bet.stakeUnits ?? 0), 0),
    [bets],
  )
  const recommendedExposure = useMemo(
    () =>
      bets
        .filter((bet) => bet.state === 'recommended')
        .reduce((total, bet) => total + Number(bet.recommendedUnits ?? 0), 0),
    [bets],
  )
  const selectedCard = cards.find((card) => card.id === selectedCardId)
  const replaceBet = (updated: Bet) =>
    setBets((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    )

  const handleManualSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const stakeUnits = Number(form.get('stakeUnits'))
    if (
      selectedCard &&
      placedExposure + stakeUnits > selectedCard.budgetUnits &&
      !window.confirm(
        `This will take actual exposure to ${(placedExposure + stakeUnits).toFixed(2)}u, above the ${selectedCard.budgetUnits}u card budget. Record it anyway?`,
      )
    ) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const structuredLegs = manualLegs.flatMap((leg) => {
        const fight = fights.find((item) => item.id === leg.fightId)
        const fighter = [fight?.fighterA, fight?.fighterB].find(
          (item) => item?.id === leg.selectionFighterId,
        )
        return fight && fighter
          ? [
              {
                fightId: fight.id,
                marketType: 'moneyline',
                selectionFighterId: fighter.id,
                selectionText: fighter.name,
              },
            ]
          : []
      })
      const marketType = String(form.get('marketType') ?? 'moneyline')
      const selectionText =
        marketType === 'parlay'
          ? structuredLegs.map((leg) => leg.selectionText).join(' + ')
          : String(form.get('selectionText') ?? '').trim()
      const bet = await postManualBet({
        cardId: selectedCardId,
        marketType,
        selectionText,
        oddsTakenInput: String(form.get('oddsTakenInput') ?? '').trim(),
        stakeUnits,
        notes: String(form.get('notes') ?? '').trim() || null,
        legs: marketType === 'parlay' ? structuredLegs : undefined,
      })
      setBets((current) => [bet, ...current])
      formElement.reset()
      setManualMarketType('moneyline')
      setManualLegs([])
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Manual bet could not be saved',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleRecommendedAction = async (
    event: FormEvent<HTMLFormElement>,
    bet: Bet,
  ) => {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null
    const action = submitter?.value
    setBusyBetId(bet.id)
    setError(null)
    try {
      if (action === 'skip') {
        replaceBet(await skipBet(bet.id))
      } else {
        const form = new FormData(event.currentTarget)
        const odds = String(
          form.get('oddsTakenInput') ?? bet.recommendedOdds ?? '',
        )
        const stake = Number(form.get('stakeUnits') ?? bet.recommendedUnits)
        if (
          selectedCard &&
          placedExposure + stake > selectedCard.budgetUnits &&
          !window.confirm(
            `This will take actual exposure above the ${selectedCard.budgetUnits}u card budget. Place it anyway?`,
          )
        ) {
          return
        }
        replaceBet(await placeBet(bet.id, odds, stake))
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Bet could not be updated',
      )
    } finally {
      setBusyBetId(null)
    }
  }

  const handleSettlement = async (
    event: FormEvent<HTMLFormElement>,
    bet: Bet,
  ) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = String(form.get('result')) as
      'won' | 'lost' | 'push' | 'void'
    const settlementOdds = String(form.get('settlementOddsInput') ?? '').trim()
    setBusyBetId(bet.id)
    setError(null)
    try {
      replaceBet(await settleBet(bet.id, result, settlementOdds || null))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Bet could not be settled',
      )
    } finally {
      setBusyBetId(null)
    }
  }

  const handleUnsettle = async (bet: Bet) => {
    setBusyBetId(bet.id)
    setError(null)
    try {
      replaceBet(await unsettleBet(bet.id))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Bet could not be unsettled',
      )
    } finally {
      setBusyBetId(null)
    }
  }

  const addManualLeg = () =>
    setManualLegs((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        fightId: fights[0]?.id ?? '',
        selectionFighterId: fights[0]?.fighterA.id ?? '',
      },
    ])

  const updateManualLeg = (
    id: string,
    field: 'fightId' | 'selectionFighterId',
    value: string,
  ) =>
    setManualLegs((current) =>
      current.map((leg) => {
        if (leg.id !== id) return leg
        if (field === 'fightId') {
          const fight = fights.find((item) => item.id === value)
          return {
            ...leg,
            fightId: value,
            selectionFighterId: fight?.fighterA.id ?? '',
          }
        }
        return { ...leg, selectionFighterId: value }
      }),
    )

  return (
    <section className="workspace-stack">
      <div className="source-toolbar">
        <label className="field source-card-select">
          <span>Working card</span>
          <select
            value={selectedCardId}
            onChange={(event) => {
              setSelectedCardId(event.target.value)
              setManualMarketType('moneyline')
              setManualLegs([])
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
        <div className="board-summary">
          <span>{recommendedExposure.toFixed(2)}u proposed</span>
          <span>{placedExposure.toFixed(2)}u placed</span>
          <span>{selectedCard?.budgetUnits ?? 0}u card budget</span>
        </div>
      </div>
      {selectedCard && placedExposure > selectedCard.budgetUnits && (
        <p className="form-message form-message--warning">
          Actual exposure is above the card budget. This records reality and
          does not change the synthesised slate.
        </p>
      )}

      <div className="source-layout">
        <form className="editor-card" onSubmit={handleManualSubmit}>
          <div className="editor-card__heading">
            <div className="icon-tile icon-tile--warm">
              <Plus size={19} />
            </div>
            <div>
              <p className="section-kicker">Track reality</p>
              <h2>Add a manual bet</h2>
            </div>
          </div>
          <label className="field">
            <span>Selection</span>
            <input
              name="selectionText"
              required={manualMarketType !== 'parlay'}
              disabled={manualMarketType === 'parlay'}
              maxLength={240}
              placeholder={
                manualMarketType === 'parlay'
                  ? 'Built from the legs below'
                  : 'Fighter or prop selection'
              }
            />
          </label>
          <label className="field">
            <span>Market</span>
            <select
              name="marketType"
              value={manualMarketType}
              onChange={(event) => {
                setManualMarketType(event.target.value)
                if (event.target.value === 'parlay' && manualLegs.length === 0)
                  addManualLeg()
              }}
            >
              <option value="moneyline">Moneyline</option>
              <option value="method">Method</option>
              <option value="over_under">Over / under</option>
              <option value="prop">Prop</option>
              <option value="parlay">Parlay</option>
              <option value="other">Other</option>
            </select>
          </label>
          {manualMarketType === 'parlay' && (
            <fieldset className="parlay-builder">
              <legend>Structured parlay legs</legend>
              {manualLegs.map((leg, index) => {
                const fight = fights.find((item) => item.id === leg.fightId)
                return (
                  <div className="parlay-leg" key={leg.id}>
                    <span className="parlay-leg__number">{index + 1}</span>
                    <select
                      aria-label={`Fight for leg ${index + 1}`}
                      value={leg.fightId}
                      onChange={(event) =>
                        updateManualLeg(leg.id, 'fightId', event.target.value)
                      }
                      required
                    >
                      {fights.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.fighterA.name} vs {item.fighterB.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Selection for leg ${index + 1}`}
                      value={leg.selectionFighterId}
                      onChange={(event) =>
                        updateManualLeg(
                          leg.id,
                          'selectionFighterId',
                          event.target.value,
                        )
                      }
                      required
                    >
                      {[fight?.fighterA, fight?.fighterB]
                        .filter((fighter) => fighter !== undefined)
                        .map((fighter) => (
                          <option key={fighter.id} value={fighter.id}>
                            {fighter.name}
                          </option>
                        ))}
                    </select>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() =>
                        setManualLegs((current) =>
                          current.filter((item) => item.id !== leg.id),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                )
              })}
              <button
                className="button button--secondary button--compact"
                type="button"
                onClick={addManualLeg}
                disabled={fights.length === 0}
              >
                <Plus size={15} /> Add leg
              </button>
              {manualLegs.length < 2 && (
                <small>Add at least two legs before saving a parlay.</small>
              )}
            </fieldset>
          )}
          <div className="field-row">
            <label className="field">
              <span>Actual odds</span>
              <input
                name="oddsTakenInput"
                required
                placeholder="1.80 or -125"
              />
            </label>
            <label className="field">
              <span>Stake</span>
              <div className="input-suffix">
                <input
                  name="stakeUnits"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
                <span>units</span>
              </div>
            </label>
          </div>
          <label className="field">
            <span>Notes</span>
            <textarea name="notes" rows={3} maxLength={2000} />
          </label>
          {error && <p className="form-message form-message--error">{error}</p>}
          <button
            className="button button--primary button--full"
            type="submit"
            disabled={
              saving ||
              !selectedCardId ||
              (manualMarketType === 'parlay' && manualLegs.length < 2)
            }
          >
            {saving ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Plus size={17} />
            )}
            {saving ? 'Saving bet' : 'Add placed bet'}
          </button>
        </form>

        <div className="records-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Accepted slate + manual</p>
              <h2>Bet Ledger</h2>
            </div>
            <span className="quiet-badge">{bets.length} bets</span>
          </div>
          {bets.length === 0 ? (
            <div className="empty-state">
              <ClipboardCheck size={24} />
              <p>No ledger bets</p>
              <span>
                Accept a draft slate or add the bets you actually place.
              </span>
            </div>
          ) : (
            <div className="record-list">
              {bets.map((bet) => (
                <article className="ledger-row" key={bet.id}>
                  <div className="ledger-row__heading">
                    <span className="status-chip">{bet.tier}</span>
                    <span className={`ledger-state ledger-state--${bet.state}`}>
                      {bet.state}
                    </span>
                  </div>
                  <strong>{bet.selectionText}</strong>
                  <small>
                    {bet.origin} · {bet.marketType.replace('_', ' ')}
                  </small>
                  {bet.legs.length > 0 && (
                    <ol className="ledger-legs">
                      {bet.legs.map((leg) => (
                        <li key={leg.id}>
                          {leg.selectionText} <span>({leg.legResult})</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {bet.state === 'recommended' ? (
                    <form
                      className="ledger-place"
                      onSubmit={(event) =>
                        void handleRecommendedAction(event, bet)
                      }
                    >
                      <input
                        name="oddsTakenInput"
                        aria-label="Actual odds"
                        defaultValue={bet.recommendedOdds ?? ''}
                        required
                      />
                      <input
                        name="stakeUnits"
                        aria-label="Stake units"
                        type="number"
                        min="0.01"
                        step="0.01"
                        defaultValue={bet.recommendedUnits ?? ''}
                        required
                      />
                      <button
                        className="button button--primary button--compact"
                        name="action"
                        value="place"
                        disabled={busyBetId === bet.id}
                      >
                        Place
                      </button>
                      <button
                        className="button button--secondary button--compact"
                        name="action"
                        value="skip"
                        disabled={busyBetId === bet.id}
                      >
                        Skip
                      </button>
                    </form>
                  ) : bet.state === 'placed' ? (
                    <form
                      className="ledger-place"
                      onSubmit={(event) => void handleSettlement(event, bet)}
                    >
                      <select
                        name="result"
                        aria-label="Settlement result"
                        defaultValue="won"
                      >
                        <option value="won">Won</option>
                        <option value="lost">Lost</option>
                        <option value="push">Push</option>
                        <option value="void">Void</option>
                      </select>
                      <input
                        name="settlementOddsInput"
                        aria-label="Settlement odds"
                        placeholder={bet.oddsTaken ?? 'Odds'}
                      />
                      <button
                        className="button button--primary button--compact"
                        disabled={busyBetId === bet.id}
                      >
                        Settle
                      </button>
                    </form>
                  ) : (
                    <div className="ledger-actual">
                      <span>{bet.stakeUnits ?? bet.recommendedUnits}u</span>
                      <span>
                        @{' '}
                        {Number(
                          bet.oddsTaken ?? bet.recommendedOdds ?? 0,
                        ).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {bet.state === 'settled' && (
                    <div className="ledger-settled">
                      <strong>
                        {bet.result.toUpperCase()} ·{' '}
                        {Number(bet.netProfitUnits ?? 0) >= 0 ? '+' : ''}
                        {Number(bet.netProfitUnits ?? 0).toFixed(2)}u
                      </strong>
                      <button
                        className="text-button"
                        type="button"
                        disabled={busyBetId === bet.id}
                        onClick={() => void handleUnsettle(bet)}
                      >
                        Unsettle for correction
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
