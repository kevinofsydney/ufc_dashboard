import {
  CalendarPlus,
  CheckCircle2,
  LoaderCircle,
  Plus,
  Swords,
} from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import {
  getCards,
  getFights,
  postCard,
  postFight,
  type Card,
  type Fight,
} from '../api'

export function CardWorkspace() {
  const [cards, setCards] = useState<Card[]>([])
  const [fights, setFights] = useState<Fight[]>([])
  const [selectedCardId, setSelectedCardId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingFight, setSavingFight] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getCards()
      .then((nextCards) => {
        setCards(nextCards)
        setSelectedCardId(nextCards[0]?.id ?? '')
      })
      .catch((requestError: unknown) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Cards could not be loaded',
        ),
      )
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedCardId) return
    getFights(selectedCardId)
      .then(setFights)
      .catch((requestError: unknown) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Fights could not be loaded',
        ),
      )
  }, [selectedCardId])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    setSaving(true)
    setError(null)
    const form = new FormData(formElement)
    const startsAt = String(form.get('eventStartsAt') ?? '')

    try {
      const card = await postCard({
        name: String(form.get('name') ?? '').trim(),
        eventStartsAtUtc: startsAt ? new Date(startsAt).toISOString() : null,
        budgetUnits: Number(form.get('budgetUnits')),
        unitValueCents: Math.round(Number(form.get('unitValue')) * 100),
      })
      setCards((current) => [card, ...current])
      if (!selectedCardId) setSelectedCardId(card.id)
      formElement.reset()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Card could not be saved',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleFightSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const weightClass = String(form.get('weightClass') ?? '').trim()
    const boutOrder = String(form.get('boutOrder') ?? '')
    setSavingFight(true)
    setError(null)

    try {
      const fight = await postFight({
        cardId: selectedCardId,
        fighterAName: String(form.get('fighterAName') ?? '').trim(),
        fighterBName: String(form.get('fighterBName') ?? '').trim(),
        weightClass: weightClass || null,
        boutOrder: boutOrder ? Number(boutOrder) : null,
        isMainEvent: form.get('isMainEvent') === 'on',
      })
      setFights((current) =>
        [...current, fight].sort(
          (left, right) =>
            (left.boutOrder ?? Number.MAX_SAFE_INTEGER) -
            (right.boutOrder ?? Number.MAX_SAFE_INTEGER),
        ),
      )
      formElement.reset()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Fight could not be saved',
      )
    } finally {
      setSavingFight(false)
    }
  }

  return (
    <div className="workspace-stack">
      <section className="workspace-grid">
        <form className="editor-card" onSubmit={handleSubmit}>
          <div className="editor-card__heading">
            <div className="icon-tile icon-tile--warm">
              <CalendarPlus size={19} />
            </div>
            <div>
              <p className="section-kicker">Manual first</p>
              <h2>Create a card</h2>
            </div>
          </div>

          <label className="field field--wide">
            <span>Event name</span>
            <input
              name="name"
              required
              maxLength={120}
              placeholder="UFC Fight Night"
            />
          </label>

          <label className="field field--wide">
            <span>Event date and time</span>
            <input name="eventStartsAt" type="datetime-local" />
            <small>
              Interpreted in your browser’s local timezone and stored in UTC.
            </small>
          </label>

          <div className="field-row">
            <label className="field">
              <span>Budget</span>
              <div className="input-suffix">
                <input
                  name="budgetUnits"
                  type="number"
                  min="0"
                  max="1000"
                  defaultValue="30"
                  required
                />
                <span>units</span>
              </div>
            </label>
            <label className="field">
              <span>Unit value</span>
              <div className="input-prefix">
                <span>$</span>
                <input
                  name="unitValue"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue="10.00"
                  required
                />
              </div>
            </label>
          </div>

          {error && <p className="form-message form-message--error">{error}</p>}

          <button
            className="button button--primary button--full"
            type="submit"
            disabled={saving}
          >
            {saving ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <CalendarPlus size={17} />
            )}
            {saving ? 'Saving card' : 'Create card'}
          </button>
        </form>

        <div className="records-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Saved locally</p>
              <h2>Your cards</h2>
            </div>
            <span className="quiet-badge">{cards.length} total</span>
          </div>

          {loading ? (
            <div className="empty-state">
              <LoaderCircle className="spin" size={23} />
              <p>Loading cards</p>
            </div>
          ) : cards.length === 0 ? (
            <div className="empty-state">
              <CalendarPlus size={24} />
              <p>No cards yet</p>
              <span>Create the next event to begin the weekly workflow.</span>
            </div>
          ) : (
            <div className="record-list">
              {cards.map((card) => (
                <article className="record-row" key={card.id}>
                  <div className="record-status">
                    <CheckCircle2 size={17} />
                  </div>
                  <div>
                    <strong>{card.name}</strong>
                    <span>
                      {card.eventStartsAtUtc
                        ? new Intl.DateTimeFormat('en-AU', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                            timeZone: card.displayTimezone,
                          }).format(new Date(card.eventStartsAtUtc))
                        : 'Date not set'}
                    </span>
                  </div>
                  <div className="record-metric">
                    <strong>{card.budgetUnits}u</strong>
                    <span>AUD {(card.unitValueCents / 100).toFixed(2)}/u</span>
                  </div>
                  <span className="status-chip">{card.lifecycle}</span>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bout-workspace">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Manual bout list</p>
            <h2>Build the card</h2>
          </div>
          <label className="field bout-card-select">
            <span>Card</span>
            <select
              value={selectedCardId}
              onChange={(event) => setSelectedCardId(event.target.value)}
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
        </div>

        <div className="bout-layout">
          <form className="bout-form" onSubmit={handleFightSubmit}>
            <div className="field-row">
              <label className="field">
                <span>Fighter A</span>
                <input
                  name="fighterAName"
                  required
                  maxLength={120}
                  placeholder="Canonical name"
                />
              </label>
              <label className="field">
                <span>Fighter B</span>
                <input
                  name="fighterBName"
                  required
                  maxLength={120}
                  placeholder="Canonical name"
                />
              </label>
            </div>
            <div className="field-row bout-details-row">
              <label className="field">
                <span>Weight class</span>
                <input
                  name="weightClass"
                  maxLength={120}
                  placeholder="Lightweight"
                />
              </label>
              <label className="field">
                <span>Bout order</span>
                <input name="boutOrder" type="number" min="1" max="100" />
              </label>
            </div>
            <label className="check-field">
              <input name="isMainEvent" type="checkbox" />
              <span>Main event</span>
            </label>
            <button
              className="button button--primary button--full"
              type="submit"
              disabled={savingFight || !selectedCardId}
            >
              {savingFight ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Plus size={17} />
              )}
              {savingFight ? 'Adding fight' : 'Add fight'}
            </button>
          </form>

          <div className="bout-list">
            {fights.length === 0 ? (
              <div className="empty-state empty-state--compact">
                <Swords size={24} />
                <p>No fights on this card</p>
                <span>
                  Add official participant names before adding sources.
                </span>
              </div>
            ) : (
              fights.map((fight) => (
                <article className="bout-row" key={fight.id}>
                  <span className="bout-order-number">
                    {fight.isMainEvent ? 'ME' : (fight.boutOrder ?? '—')}
                  </span>
                  <div>
                    <strong>{fight.fighterA.name}</strong>
                    <span>vs</span>
                    <strong>{fight.fighterB.name}</strong>
                  </div>
                  <p>{fight.weightClass ?? 'Weight class not set'}</p>
                  <span className="status-chip">{fight.status}</span>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
