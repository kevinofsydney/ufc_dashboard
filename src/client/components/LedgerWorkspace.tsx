import { ClipboardCheck, LoaderCircle, Plus } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  getBets,
  getFights,
  placeBet,
  postManualBet,
  settleBet,
  skipBet,
  type Bet,
  type Fight,
  unsettleBet,
} from '../api'
import { errorMessage } from '../format'
import { useCards } from '../use-cards'
import {
  buildBetSelection,
  pickTypeOptionsForFight,
  type PickType,
} from '../bet-builder'
import { CardSelect } from './CardSelect'
import { HelpTooltip } from './HelpTooltip'

type ManualLeg = {
  id: string
  fightId: string
  selectionFighterId: string
  pickType: PickType
}

export function LedgerWorkspace() {
  const { cards, selectedCardId, setSelectedCardId, cardsError } = useCards()
  const [bets, setBets] = useState<Bet[]>([])
  const [fights, setFights] = useState<Fight[]>([])
  const [manualLegs, setManualLegs] = useState<ManualLeg[]>([])
  const [manualPickType, setManualPickType] = useState<PickType | 'parlay'>(
    'moneyline',
  )
  const [manualFighterId, setManualFighterId] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyBetId, setBusyBetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedCardId) return
    Promise.all([getBets(selectedCardId), getFights(selectedCardId)])
      .then(([nextBets, nextFights]) => {
        setBets(nextBets)
        setFights(nextFights)
        setManualFighterId((current) =>
          nextFights.some(
            (fight) =>
              fight.fighterA.id === current || fight.fighterB.id === current,
          )
            ? current
            : (nextFights[0]?.fighterA.id ?? ''),
        )
      })
      .catch((requestError: unknown) =>
        setError(errorMessage(requestError, 'Ledger could not be loaded')),
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
  const fighterOptions = useMemo(
    () =>
      fights.flatMap((fight) => [
        { fighter: fight.fighterA, fight },
        { fighter: fight.fighterB, fight },
      ]),
    [fights],
  )
  const manualFight = fighterOptions.find(
    ({ fighter }) => fighter.id === manualFighterId,
  )?.fight
  const singlePick =
    manualFight && manualPickType !== 'parlay'
      ? buildBetSelection(manualFight, manualFighterId, manualPickType)
      : null
  const manualBetIncomplete =
    manualPickType === 'parlay' ? manualLegs.length < 2 : !singlePick
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
      const parlayLegs = manualLegs.flatMap((leg) => {
        const fight = fights.find((item) => item.id === leg.fightId)
        const selection = fight
          ? buildBetSelection(fight, leg.selectionFighterId, leg.pickType)
          : null
        return fight && selection
          ? [
              {
                fightId: fight.id,
                marketType: selection.marketType,
                selectionFighterId: leg.selectionFighterId,
                selectionText: selection.selectionText,
              },
            ]
          : []
      })
      const marketType =
        manualPickType === 'parlay'
          ? 'parlay'
          : (singlePick?.marketType ?? 'moneyline')
      const selectionText =
        marketType === 'parlay'
          ? parlayLegs.map((leg) => leg.selectionText).join(' + ')
          : (singlePick?.selectionText ?? '')
      const structuredLegs =
        marketType === 'parlay'
          ? parlayLegs
          : manualFight && singlePick
            ? [
                {
                  fightId: manualFight.id,
                  marketType: singlePick.marketType,
                  selectionFighterId: manualFighterId,
                  selectionText: singlePick.selectionText,
                },
              ]
            : []
      const bet = await postManualBet({
        cardId: selectedCardId,
        marketType,
        selectionText,
        oddsTakenInput: String(form.get('oddsTakenInput') ?? '').trim(),
        stakeUnits,
        notes: String(form.get('notes') ?? '').trim() || null,
        legs: structuredLegs,
      })
      setBets((current) => [bet, ...current])
      formElement.reset()
      setManualPickType('moneyline')
      setManualLegs([])
    } catch (requestError) {
      setError(errorMessage(requestError, 'Manual bet could not be saved'))
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
      setError(errorMessage(requestError, 'Bet could not be updated'))
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
      setError(errorMessage(requestError, 'Bet could not be settled'))
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
      setError(errorMessage(requestError, 'Bet could not be unsettled'))
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
        pickType: 'moneyline',
      },
    ])

  const updateManualLeg = (
    id: string,
    field: 'fightId' | 'selectionFighterId' | 'pickType',
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
            pickType: 'moneyline',
          }
        }
        if (field === 'pickType') {
          return { ...leg, pickType: value as PickType }
        }
        return { ...leg, selectionFighterId: value }
      }),
    )

  return (
    <section className="workspace-stack">
      <div className="source-toolbar">
        <CardSelect
          cards={cards}
          value={selectedCardId}
          onChange={(cardId) => {
            setSelectedCardId(cardId)
            setFights([])
            setManualFighterId('')
            setManualPickType('moneyline')
            setManualLegs([])
          }}
        />
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
              <div className="heading-with-help">
                <h2>Add a manual bet</h2>
                <HelpTooltip
                  label="Add a manual bet"
                  text="Record any bet you actually placed outside the generated slate. For parlays, add each structured leg and enter the bookmaker's combined odds."
                  align="left"
                />
              </div>
            </div>
          </div>
          {manualPickType !== 'parlay' && (
            <label className="field">
              <span>Fighter</span>
              <select
                value={manualFighterId}
                onChange={(event) => {
                  setManualFighterId(event.target.value)
                  setManualPickType('moneyline')
                }}
                disabled={fighterOptions.length === 0}
              >
                {fighterOptions.length === 0 && (
                  <option value="">Add fights to this card first</option>
                )}
                {fighterOptions.map(({ fighter, fight }) => (
                  <option key={`${fight.id}:${fighter.id}`} value={fighter.id}>
                    {fighter.name} — vs{' '}
                    {fight.fighterA.id === fighter.id
                      ? fight.fighterB.name
                      : fight.fighterA.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>Bet type</span>
            <select
              aria-label="Bet type"
              value={manualPickType}
              onChange={(event) => {
                setManualPickType(event.target.value as PickType | 'parlay')
                if (event.target.value === 'parlay' && manualLegs.length === 0)
                  addManualLeg()
              }}
            >
              {(manualFight
                ? pickTypeOptionsForFight(manualFight)
                : [{ value: 'moneyline' as const, label: 'Moneyline (ML)' }]
              ).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              <option value="parlay">Parlay</option>
            </select>
          </label>
          {manualPickType !== 'parlay' && singlePick && (
            <div className="pick-preview" aria-live="polite">
              <span>Line</span>
              <strong>{singlePick.selectionText}</strong>
            </div>
          )}
          {manualPickType === 'parlay' && (
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
                    <select
                      aria-label={`Bet type for leg ${index + 1}`}
                      value={leg.pickType}
                      onChange={(event) =>
                        updateManualLeg(leg.id, 'pickType', event.target.value)
                      }
                      required
                    >
                      {fight &&
                        pickTypeOptionsForFight(fight).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
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
          {(error ?? cardsError) && (
            <p className="form-message form-message--error">
              {error ?? cardsError}
            </p>
          )}
          <button
            className="button button--primary button--full"
            type="submit"
            disabled={saving || !selectedCardId || manualBetIncomplete}
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
              <div className="heading-with-help">
                <h2>Bet Ledger</h2>
                <HelpTooltip
                  label="Bet Ledger"
                  text="For recommendations, record the actual price and stake or skip them. Settle placed bets after the event; settled values lock until explicitly unsettled."
                  align="left"
                />
              </div>
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
                  {bet.marketType === 'parlay' && bet.legs.length > 0 && (
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
