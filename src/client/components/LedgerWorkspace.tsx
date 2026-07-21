import {
  Check,
  ClipboardCheck,
  Copy,
  Download,
  FileUp,
  LoaderCircle,
  Plus,
} from 'lucide-react'
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'
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
import {
  ledgerCsvTemplate,
  ledgerScreenshotPrompt,
  parseLedgerCsv,
  type LedgerCsvBet,
} from '../ledger-csv'
import { CardSelect } from './CardSelect'
import { HelpTooltip } from './HelpTooltip'

type ManualLeg = {
  id: string
  fightId: string
  selectionFighterId: string
  pickType: PickType
}

function downloadTextFile(fileName: string, contents: string) {
  const url = URL.createObjectURL(
    new Blob([contents], { type: 'text/csv;charset=utf-8' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
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
  const [csvBets, setCsvBets] = useState<LedgerCsvBet[]>([])
  const [csvFileName, setCsvFileName] = useState('')
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvMessage, setCsvMessage] = useState<{
    kind: 'success' | 'error'
    text: string
  } | null>(null)
  const [promptCopied, setPromptCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyBetId, setBusyBetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedCardId) return
    let cancelled = false
    Promise.all([getBets(selectedCardId), getFights(selectedCardId)])
      .then(([nextBets, nextFights]) => {
        if (cancelled) return
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
      .catch(
        (requestError: unknown) =>
          !cancelled &&
          setError(errorMessage(requestError, 'Ledger could not be loaded')),
      )
    return () => {
      cancelled = true
    }
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
  const screenshotPrompt = useMemo(
    () => ledgerScreenshotPrompt(selectedCard?.name ?? '', fights),
    [fights, selectedCard?.name],
  )
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
                method: selection.method,
                round: selection.round,
                lineValue: selection.lineValue,
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
                  method: singlePick.method,
                  round: singlePick.round,
                  lineValue: singlePick.lineValue,
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

  const handleCsvFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    setCsvBets([])
    setCsvFileName('')
    setCsvMessage(null)
    if (!file) return
    if (!file.name.toLocaleLowerCase().endsWith('.csv')) {
      setCsvMessage({ kind: 'error', text: 'Choose a .csv ledger file.' })
      return
    }
    try {
      const parsed = parseLedgerCsv(await file.text(), fights)
      setCsvBets(parsed)
      setCsvFileName(file.name)
    } catch (csvError) {
      setCsvMessage({
        kind: 'error',
        text: errorMessage(csvError, 'The ledger CSV could not be read'),
      })
    }
  }

  const handleCsvImport = async () => {
    if (!selectedCardId || csvBets.length === 0) return
    const importedStake = csvBets.reduce(
      (total, row) => total + row.input.stakeUnits,
      0,
    )
    if (
      selectedCard &&
      placedExposure + importedStake > selectedCard.budgetUnits &&
      !window.confirm(
        `These bets will take actual exposure to ${(placedExposure + importedStake).toFixed(2)}u, above the ${selectedCard.budgetUnits}u card budget. Import them anyway?`,
      )
    ) {
      return
    }

    setCsvImporting(true)
    setCsvMessage(null)
    const imported: Bet[] = []
    try {
      for (const row of csvBets) {
        imported.push(
          await postManualBet({ cardId: selectedCardId, ...row.input }),
        )
      }
      setBets((current) => [...imported.reverse(), ...current])
      setCsvBets([])
      setCsvFileName('')
      setCsvMessage({
        kind: 'success',
        text: `Imported ${imported.length} placed bet${imported.length === 1 ? '' : 's'} into the ledger.`,
      })
    } catch (requestError) {
      if (imported.length > 0) {
        setBets((current) => [...imported.reverse(), ...current])
        setCsvBets((current) => current.slice(imported.length))
      }
      setCsvMessage({
        kind: 'error',
        text: `${imported.length} bet${imported.length === 1 ? '' : 's'} imported before the error. ${errorMessage(requestError, 'The remaining bets could not be imported')}`,
      })
    } finally {
      setCsvImporting(false)
    }
  }

  const copyScreenshotPrompt = async () => {
    try {
      await navigator.clipboard.writeText(screenshotPrompt)
      setPromptCopied(true)
      window.setTimeout(() => setPromptCopied(false), 2_000)
    } catch {
      setCsvMessage({
        kind: 'error',
        text: 'The prompt could not be copied automatically. Select it in the box and copy it manually.',
      })
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
            setCsvBets([])
            setCsvFileName('')
            setCsvMessage(null)
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
                    {fighter.name}
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

        <section
          className="ledger-import-card"
          aria-labelledby="ledger-csv-title"
        >
          <div className="editor-card__heading">
            <div className="icon-tile icon-tile--warm">
              <FileUp size={19} />
            </div>
            <div>
              <h2 id="ledger-csv-title">Import placed bets from CSV</h2>
              <p>
                Upload up to 200 singles at once. Every row is matched against
                the selected card before anything is imported.
              </p>
            </div>
          </div>

          <div className="ledger-import-actions">
            <button
              className="button button--secondary"
              type="button"
              disabled={fights.length === 0}
              onClick={() =>
                downloadTextFile(
                  'fightfolio-ledger-template.csv',
                  ledgerCsvTemplate(fights),
                )
              }
            >
              <Download size={16} /> Download CSV template
            </button>
            <label className="field ledger-import-file">
              <span>Completed ledger CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={csvImporting || fights.length === 0}
                onChange={(event) => void handleCsvFile(event)}
              />
            </label>
          </div>

          <div className="ledger-csv-format">
            <strong>Required columns</strong>
            <code>fight,selection,market,odds,stake_units,notes</code>
            <p>
              Use an exact fighter name with <code>moneyline</code>,{' '}
              <code>inside_distance</code>, <code>ko_tko</code>,{' '}
              <code>submission</code>, <code>decision</code>, or{' '}
              <code>round_1</code> to <code>round_5</code>. For a total or
              another bout-wide market, put the visible prop in{' '}
              <code>selection</code> and use <code>fight_prop</code>.
            </p>
          </div>

          <details className="ledger-prompt">
            <summary>Prompt for extracting bets from screenshots</summary>
            <p>
              Copy this into an AI chat, then attach your bookmaker screenshots.
              It tells the AI to use this card’s exact bout names and never
              guess missing prices or stakes.
            </p>
            <textarea
              aria-label="Screenshot extraction prompt"
              readOnly
              rows={18}
              value={screenshotPrompt}
            />
            <button
              className="button button--secondary button--compact"
              type="button"
              onClick={() => void copyScreenshotPrompt()}
            >
              {promptCopied ? <Check size={15} /> : <Copy size={15} />}
              {promptCopied ? 'Prompt copied' : 'Copy prompt'}
            </button>
          </details>

          {csvBets.length > 0 && (
            <div className="ledger-import-preview">
              <div className="section-heading">
                <div>
                  <strong>{csvFileName}</strong>
                  <p>
                    {csvBets.length} validated bet
                    {csvBets.length === 1 ? '' : 's'} ·{' '}
                    {csvBets
                      .reduce((total, row) => total + row.input.stakeUnits, 0)
                      .toFixed(2)}
                    u total stake
                  </p>
                </div>
                <span className="quiet-badge">Ready to import</span>
              </div>
              <div className="ledger-import-list">
                {csvBets.map((row) => (
                  <div className="ledger-import-row" key={row.rowNumber}>
                    <span>Row {row.rowNumber}</span>
                    <strong>{row.input.selectionText}</strong>
                    <small>
                      {row.input.oddsTakenInput} · {row.input.stakeUnits}u
                    </small>
                  </div>
                ))}
              </div>
              <button
                className="button button--primary button--full"
                type="button"
                disabled={csvImporting}
                onClick={() => void handleCsvImport()}
              >
                {csvImporting ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <FileUp size={17} />
                )}
                {csvImporting
                  ? 'Importing bets'
                  : `Import ${csvBets.length} placed bet${csvBets.length === 1 ? '' : 's'}`}
              </button>
            </div>
          )}

          {csvMessage && (
            <p
              className={`form-message form-message--${csvMessage.kind === 'error' ? 'error' : 'success'}`}
              role={csvMessage.kind === 'error' ? 'alert' : 'status'}
            >
              {csvMessage.text}
            </p>
          )}
        </section>

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
