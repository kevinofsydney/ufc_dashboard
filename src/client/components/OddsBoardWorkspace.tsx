import { CircleDollarSign, LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  getCards,
  getFights,
  getMarketPrices,
  hideMarketPrice,
  postMarketPrice,
  type Card,
  type Fight,
  type MarketPrice,
} from '../api'
import { synthesisConfig } from '../../shared/config/synthesis'
import { formatCardTimestamp } from '../format'
import { HelpTooltip } from './HelpTooltip'

export function OddsBoardWorkspace() {
  const [cards, setCards] = useState<Card[]>([])
  const [fights, setFights] = useState<Fight[]>([])
  const [prices, setPrices] = useState<MarketPrice[]>([])
  const [selectedCardId, setSelectedCardId] = useState('')
  const [selectedFightId, setSelectedFightId] = useState('')
  const [saving, setSaving] = useState(false)
  const [hidingPriceId, setHidingPriceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [staleCheckedAt, setStaleCheckedAt] = useState(() => Date.now())

  useEffect(() => {
    getCards()
      .then((nextCards) => {
        setCards(nextCards)
        setSelectedCardId((current) => current || nextCards[0]?.id || '')
        if (nextCards.length === 0) setLoading(false)
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
    Promise.all([getFights(selectedCardId), getMarketPrices(selectedCardId)])
      .then(([nextFights, nextPrices]) => {
        setFights(nextFights)
        setPrices(nextPrices)
        setSelectedFightId(nextFights[0]?.id ?? '')
        setStaleCheckedAt(Date.now())
      })
      .catch((requestError: unknown) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Odds could not be loaded',
        ),
      )
      .finally(() => setLoading(false))
  }, [selectedCardId])

  const selectedCard = useMemo(
    () => cards.find((card) => card.id === selectedCardId) ?? null,
    [cards, selectedCardId],
  )

  const selectedFight = useMemo(
    () => fights.find((fight) => fight.id === selectedFightId) ?? null,
    [fights, selectedFightId],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedFight) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const fighterId = String(form.get('selectionFighterId') ?? '')
    const fighter = [selectedFight.fighterA, selectedFight.fighterB].find(
      (participant) => participant.id === fighterId,
    )
    if (!fighter) return

    setSaving(true)
    setError(null)
    try {
      const price = await postMarketPrice({
        cardId: selectedCardId,
        fightId: selectedFight.id,
        bookmaker: String(form.get('bookmaker') ?? '').trim() || null,
        marketType: 'moneyline',
        selectionFighterId: fighter.id,
        selectionText: `${fighter.name} moneyline`,
        oddsInput: String(form.get('oddsInput') ?? '').trim(),
      })
      setPrices((current) => [price, ...current])
      formElement.reset()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Price could not be saved',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleHidePrice = async (price: MarketPrice) => {
    if (
      !window.confirm(
        `Hide the ${Number(price.decimalOdds).toFixed(2)} snapshot for ${price.selectionFighterName ?? price.selectionText}? Historical synthesis runs remain unchanged.`,
      )
    )
      return
    setHidingPriceId(price.id)
    setError(null)
    try {
      await hideMarketPrice(price.id)
      setPrices((current) => current.filter((item) => item.id !== price.id))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Price snapshot could not be hidden',
      )
    } finally {
      setHidingPriceId(null)
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
        <div className="odds-note">
          <RefreshCw size={15} />
          <span>
            Each entry is timestamped; newer prices do not rewrite history.
          </span>
        </div>
      </div>

      <div className="source-layout">
        <form className="editor-card" onSubmit={handleSubmit}>
          <div className="editor-card__heading">
            <div className="icon-tile icon-tile--warm">
              <CircleDollarSign size={19} />
            </div>
            <div>
              <div className="heading-with-help">
                <h2>Add a moneyline price</h2>
                <HelpTooltip
                  label="Add a moneyline price"
                  text="Enter the price currently available at your bookmaker. Decimal and signed American formats are accepted; saving creates a timestamped snapshot."
                  align="left"
                />
              </div>
            </div>
          </div>

          <label className="field field--wide">
            <span>Fight</span>
            <select
              value={selectedFightId}
              onChange={(event) => setSelectedFightId(event.target.value)}
              required
            >
              {fights.length === 0 && (
                <option value="">Add a fight first</option>
              )}
              {fights.map((fight) => (
                <option key={fight.id} value={fight.id}>
                  {fight.fighterA.name} vs {fight.fighterB.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field field--wide">
            <span>Selection</span>
            <select
              name="selectionFighterId"
              required
              disabled={!selectedFight}
            >
              {selectedFight ? (
                <>
                  <option value={selectedFight.fighterA.id}>
                    {selectedFight.fighterA.name}
                  </option>
                  <option value={selectedFight.fighterB.id}>
                    {selectedFight.fighterB.name}
                  </option>
                </>
              ) : (
                <option value="">Select a fight</option>
              )}
            </select>
          </label>

          <div className="field-row">
            <label className="field">
              <span>Odds</span>
              <input
                name="oddsInput"
                required
                maxLength={40}
                placeholder="1.80 or -125"
              />
            </label>
            <label className="field">
              <span>Bookmaker</span>
              <input name="bookmaker" maxLength={120} placeholder="Optional" />
            </label>
          </div>
          <p className="field-help">
            Decimal and signed American odds are accepted and normalized to four
            decimals.
          </p>

          {error && <p className="form-message form-message--error">{error}</p>}
          <button
            className="button button--primary button--full"
            type="submit"
            disabled={saving || !selectedFight}
          >
            {saving ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Plus size={17} />
            )}
            {saving ? 'Saving price' : 'Save price snapshot'}
          </button>
        </form>

        <div className="records-card">
          <div className="section-heading">
            <div>
              <div className="heading-with-help">
                <h2>Odds Board</h2>
                <HelpTooltip
                  label="Odds Board"
                  text="The newest active price for each selection is used during synthesis. Stale or missing prices remain visible but cannot silently qualify a bet."
                  align="left"
                />
              </div>
            </div>
            <span className="quiet-badge">{prices.length} snapshots</span>
          </div>

          {loading ? (
            <div className="empty-state">
              <LoaderCircle className="spin" size={23} />
              <p>Loading prices</p>
            </div>
          ) : prices.length === 0 ? (
            <div className="empty-state">
              <CircleDollarSign size={24} />
              <p>No current prices</p>
              <span>
                A current market price is required before a bet can qualify.
              </span>
            </div>
          ) : (
            <div className="record-list">
              {prices.map((price) => {
                const stale =
                  staleCheckedAt - new Date(price.capturedAt).getTime() >
                  synthesisConfig.priceStaleHours * 60 * 60 * 1000
                return (
                  <article
                    className={`price-row ${stale ? 'price-row--stale' : ''}`}
                    key={price.id}
                  >
                    <div>
                      <span className="status-chip">
                        {stale ? 'STALE · ' : ''}
                        {price.marketType}
                      </span>
                      <strong>
                        {price.selectionFighterName ?? price.selectionText}
                      </strong>
                      <small>
                        {price.fighterAName} vs {price.fighterBName}
                      </small>
                    </div>
                    <div className="price-value">
                      <strong>{Number(price.decimalOdds).toFixed(2)}</strong>
                      <span>{price.bookmaker ?? 'Bookmaker not recorded'}</span>
                      <small>
                        {formatCardTimestamp(
                          price.capturedAt,
                          selectedCard?.displayTimezone,
                        )}
                      </small>
                      <button
                        className="text-button"
                        type="button"
                        disabled={hidingPriceId === price.id}
                        onClick={() => void handleHidePrice(price)}
                      >
                        Hide snapshot
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
