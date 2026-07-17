import {
  CalendarPlus,
  CheckCircle2,
  LoaderCircle,
  Plus,
  Swords,
} from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  getCards,
  getFighterAliases,
  getFights,
  hideFight,
  fetchCardPreview,
  patchCard,
  patchFight,
  postCard,
  postFighterAlias,
  postFight,
  type Alias,
  type Card,
  type CardFetchPreview,
  type Fight,
} from '../api'

export function CardWorkspace() {
  const [cards, setCards] = useState<Card[]>([])
  const [fights, setFights] = useState<Fight[]>([])
  const [fighterAliases, setFighterAliases] = useState<Alias[]>([])
  const [fetchPreview, setFetchPreview] = useState<CardFetchPreview | null>(
    null,
  )
  const [selectedCardId, setSelectedCardId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingFight, setSavingFight] = useState(false)
  const [savingEditId, setSavingEditId] = useState<string | null>(null)
  const [fetchingCard, setFetchingCard] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getCards(), getFighterAliases()])
      .then(([nextCards, nextAliases]) => {
        setCards(nextCards)
        setFighterAliases(nextAliases)
        setSelectedCardId((current) => current || nextCards[0]?.id || '')
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

  const handleFetchPreview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setFetchingCard(true)
    setError(null)
    try {
      setFetchPreview(
        await fetchCardPreview(String(form.get('eventUrl') ?? '')),
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Event preview failed',
      )
    } finally {
      setFetchingCard(false)
    }
  }

  const handleImportPreview = async () => {
    if (!fetchPreview?.event_name) return
    setFetchingCard(true)
    setError(null)
    try {
      const parsedDate = fetchPreview.event_starts_at_raw
        ? new Date(fetchPreview.event_starts_at_raw)
        : null
      const card = await postCard({
        name: fetchPreview.event_name,
        eventStartsAtUtc:
          parsedDate && !Number.isNaN(parsedDate.getTime())
            ? parsedDate.toISOString()
            : null,
        budgetUnits: 30,
        unitValueCents: 1000,
      })
      const importedFights: Fight[] = []
      for (const bout of fetchPreview.bouts) {
        importedFights.push(
          await postFight({
            cardId: card.id,
            fighterAName: bout.fighter_a,
            fighterBName: bout.fighter_b,
            weightClass: bout.weight_class,
            boutOrder: bout.bout_order,
            isMainEvent: bout.is_main_event ?? false,
          }),
        )
      }
      setCards((current) => [card, ...current])
      setSelectedCardId(card.id)
      setFights(importedFights)
      setFetchPreview(null)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Event import failed',
      )
    } finally {
      setFetchingCard(false)
    }
  }

  const previewDiff = useMemo(() => {
    const pairKey = (left: string, right: string) =>
      [left, right]
        .map((name) =>
          name
            .trim()
            .normalize('NFKD')
            .replace(/\p{Diacritic}/gu, '')
            .toLocaleLowerCase()
            .replace(/[^\p{Letter}\p{Number}]+/gu, ''),
        )
        .sort()
        .join(':')
    const existingKeys = new Set(
      fights.map((fight) => pairKey(fight.fighterA.name, fight.fighterB.name)),
    )
    const previewKeys = new Set(
      (fetchPreview?.bouts ?? []).map((bout) =>
        pairKey(bout.fighter_a, bout.fighter_b),
      ),
    )
    return {
      bouts: (fetchPreview?.bouts ?? []).map((bout) => ({
        ...bout,
        alreadyPresent: existingKeys.has(
          pairKey(bout.fighter_a, bout.fighter_b),
        ),
      })),
      absentFromPreview: fights.filter(
        (fight) =>
          !previewKeys.has(pairKey(fight.fighterA.name, fight.fighterB.name)),
      ),
    }
  }, [fetchPreview, fights])

  const handleMergePreview = async () => {
    if (!selectedCardId || !fetchPreview) return
    const additions = previewDiff.bouts.filter((bout) => !bout.alreadyPresent)
    setFetchingCard(true)
    setError(null)
    try {
      const created: Fight[] = []
      for (const bout of additions) {
        created.push(
          await postFight({
            cardId: selectedCardId,
            fighterAName: bout.fighter_a,
            fighterBName: bout.fighter_b,
            weightClass: bout.weight_class,
            boutOrder: bout.bout_order,
            isMainEvent: bout.is_main_event ?? false,
          }),
        )
      }
      setFights((current) =>
        [...current, ...created].sort(
          (left, right) =>
            (left.boutOrder ?? Number.MAX_SAFE_INTEGER) -
            (right.boutOrder ?? Number.MAX_SAFE_INTEGER),
        ),
      )
      setFetchPreview(null)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Event merge failed',
      )
    } finally {
      setFetchingCard(false)
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

  const handleCardUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedCardId) return
    const form = new FormData(event.currentTarget)
    const startsAt = String(form.get('eventStartsAt') ?? '')
    setSavingEditId(selectedCardId)
    setError(null)
    try {
      const card = await patchCard(selectedCardId, {
        name: String(form.get('name') ?? '').trim(),
        eventStartsAtUtc: startsAt ? new Date(startsAt).toISOString() : null,
        budgetUnits: Number(form.get('budgetUnits')),
        unitValueCents: Math.round(Number(form.get('unitValue')) * 100),
        lifecycle: String(form.get('lifecycle')) as Card['lifecycle'],
      })
      setCards((current) =>
        current.map((item) => (item.id === card.id ? card : item)),
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Card update failed',
      )
    } finally {
      setSavingEditId(null)
    }
  }

  const handleFightUpdate = async (
    event: FormEvent<HTMLFormElement>,
    fight: Fight,
  ) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSavingEditId(fight.id)
    setError(null)
    try {
      const updated = await patchFight(fight.id, {
        fighterAName: String(form.get('fighterAName') ?? '').trim(),
        fighterBName: String(form.get('fighterBName') ?? '').trim(),
        weightClass: String(form.get('weightClass') ?? '').trim() || null,
        boutOrder: String(form.get('boutOrder') ?? '')
          ? Number(form.get('boutOrder'))
          : null,
        isMainEvent: form.get('isMainEvent') === 'on',
        status: String(form.get('status')) as Fight['status'],
      })
      setFights((current) =>
        current
          .map((item) => (item.id === updated.id ? updated : item))
          .sort(
            (left, right) =>
              (left.boutOrder ?? Number.MAX_SAFE_INTEGER) -
              (right.boutOrder ?? Number.MAX_SAFE_INTEGER),
          ),
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Fight update failed',
      )
    } finally {
      setSavingEditId(null)
    }
  }

  const handleHideFight = async (fight: Fight) => {
    if (
      !window.confirm(
        `Hide ${fight.fighterA.name} vs ${fight.fighterB.name}? Historical extraction and ledger records remain intact.`,
      )
    )
      return
    setSavingEditId(fight.id)
    try {
      await hideFight(fight.id)
      setFights((current) => current.filter((item) => item.id !== fight.id))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Fight could not be hidden',
      )
    } finally {
      setSavingEditId(null)
    }
  }

  const handleAliasSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setSavingEditId('fighter-alias')
    try {
      const alias = await postFighterAlias(
        String(form.get('fighterId')),
        String(form.get('aliasDisplay') ?? '').trim(),
      )
      setFighterAliases((current) => [...current, alias])
      formElement.reset()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Alias could not be saved',
      )
    } finally {
      setSavingEditId(null)
    }
  }

  const selectedCard = cards.find((card) => card.id === selectedCardId)
  const selectableFighters = Array.from(
    new Map(
      fights
        .flatMap((fight) => [fight.fighterA, fight.fighterB])
        .map((fighter) => [fighter.id, fighter]),
    ).values(),
  )

  return (
    <div className="workspace-stack">
      <section className="fetch-card-panel">
        <form className="alias-form" onSubmit={handleFetchPreview}>
          <label className="field">
            <span>UFC event URL</span>
            <input
              name="eventUrl"
              type="url"
              required
              placeholder="https://www.ufc.com/event/..."
            />
          </label>
          <button className="button button--secondary" disabled={fetchingCard}>
            {fetchingCard ? 'Fetching preview' : 'Preview event page'}
          </button>
        </form>
        {fetchPreview && (
          <div className="fetch-preview">
            <div>
              <strong>{fetchPreview.event_name ?? 'Unnamed UFC event'}</strong>
              <span>
                {fetchPreview.event_starts_at_raw ?? 'Date not found'}
              </span>
              <span>{fetchPreview.bouts.length} bouts found</span>
            </div>
            <ol>
              {previewDiff.bouts.map((bout) => (
                <li key={`${bout.fighter_a}-${bout.fighter_b}`}>
                  {bout.fighter_a} vs {bout.fighter_b}
                  <span className="quiet-badge">
                    {bout.alreadyPresent ? 'already on card' : 'new bout'}
                  </span>
                </li>
              ))}
            </ol>
            {previewDiff.absentFromPreview.length > 0 && selectedCard && (
              <p className="form-message form-message--warning">
                {previewDiff.absentFromPreview.length} existing bout(s) are not
                on this preview. They will stay unchanged for review.
              </p>
            )}
            <div className="preview-actions">
              <button
                className="button button--primary"
                type="button"
                disabled={!fetchPreview.event_name || fetchingCard}
                onClick={() => void handleImportPreview()}
              >
                Import as new card
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={
                  !selectedCardId ||
                  fetchingCard ||
                  previewDiff.bouts.every((bout) => bout.alreadyPresent)
                }
                onClick={() => void handleMergePreview()}
              >
                Add new bouts to selected card
              </button>
            </div>
          </div>
        )}
      </section>
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

        {selectedCard && (
          <form
            className="card-maintenance-form"
            key={`${selectedCard.id}:${selectedCard.updatedAt}`}
            onSubmit={handleCardUpdate}
          >
            <label className="field">
              <span>Selected event name</span>
              <input name="name" defaultValue={selectedCard.name} required />
            </label>
            <label className="field">
              <span>Event date and time</span>
              <input
                name="eventStartsAt"
                type="datetime-local"
                defaultValue={
                  selectedCard.eventStartsAtUtc
                    ? new Date(
                        new Date(selectedCard.eventStartsAtUtc).getTime() -
                          new Date(
                            selectedCard.eventStartsAtUtc,
                          ).getTimezoneOffset() *
                            60_000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : ''
                }
              />
            </label>
            <label className="field">
              <span>Budget units</span>
              <input
                name="budgetUnits"
                type="number"
                min="0"
                defaultValue={selectedCard.budgetUnits}
                required
              />
            </label>
            <label className="field">
              <span>Unit value AUD</span>
              <input
                name="unitValue"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={(selectedCard.unitValueCents / 100).toFixed(2)}
                required
              />
            </label>
            <label className="field">
              <span>Lifecycle</span>
              <select name="lifecycle" defaultValue={selectedCard.lifecycle}>
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <button
              className="button button--secondary button--compact"
              disabled={savingEditId === selectedCard.id}
            >
              Save card changes
            </button>
          </form>
        )}

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
                <form
                  className="bout-edit-row"
                  key={`${fight.id}:${fight.updatedAt ?? ''}`}
                  onSubmit={(event) => void handleFightUpdate(event, fight)}
                >
                  <input
                    name="fighterAName"
                    aria-label={`Fighter A for bout ${fight.boutOrder ?? ''}`}
                    defaultValue={fight.fighterA.name}
                    required
                  />
                  <span>vs</span>
                  <input
                    name="fighterBName"
                    aria-label={`Fighter B for bout ${fight.boutOrder ?? ''}`}
                    defaultValue={fight.fighterB.name}
                    required
                  />
                  <input
                    name="weightClass"
                    aria-label="Weight class"
                    defaultValue={fight.weightClass ?? ''}
                    placeholder="Weight class"
                  />
                  <input
                    name="boutOrder"
                    aria-label="Bout order"
                    type="number"
                    min="1"
                    max="100"
                    defaultValue={fight.boutOrder ?? ''}
                  />
                  <select
                    name="status"
                    aria-label="Bout status"
                    defaultValue={fight.status}
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="completed">Completed</option>
                  </select>
                  <label className="check-field">
                    <input
                      name="isMainEvent"
                      type="checkbox"
                      defaultChecked={fight.isMainEvent}
                    />
                    <span>Main event</span>
                  </label>
                  <button
                    className="button button--secondary button--compact"
                    disabled={savingEditId === fight.id}
                  >
                    Save
                  </button>
                  <button
                    className="text-button text-button--danger"
                    type="button"
                    disabled={savingEditId === fight.id}
                    onClick={() => void handleHideFight(fight)}
                  >
                    Hide
                  </button>
                </form>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="alias-workspace">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Transcript identity</p>
            <h2>Fighter aliases</h2>
          </div>
          <span className="quiet-badge">{fighterAliases.length} aliases</span>
        </div>
        <form className="alias-form" onSubmit={handleAliasSubmit}>
          <label className="field">
            <span>Fighter</span>
            <select name="fighterId" required>
              <option value="">Select a fighter</option>
              {selectableFighters.map((fighter) => (
                <option key={fighter.id} value={fighter.id}>
                  {fighter.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Transcript spelling</span>
            <input name="aliasDisplay" required maxLength={160} />
          </label>
          <button
            className="button button--secondary"
            disabled={savingEditId === 'fighter-alias'}
          >
            Add alias
          </button>
        </form>
        <div className="alias-list">
          {fighterAliases.map((alias) => (
            <span key={alias.id}>
              <strong>{alias.aliasDisplay}</strong> → {alias.entityName}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
