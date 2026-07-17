import { BookOpenText, LoaderCircle, Plus, UserRoundPlus } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import {
  getCappers,
  getCards,
  getSources,
  postCapper,
  postSource,
  type Capper,
  type Card,
  type Source,
} from '../api'

export function SourcesWorkspace() {
  const [cards, setCards] = useState<Card[]>([])
  const [cappers, setCappers] = useState<Capper[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [selectedCardId, setSelectedCardId] = useState('')
  const [savingSource, setSavingSource] = useState(false)
  const [savingCapper, setSavingCapper] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getCards(), getCappers()])
      .then(([nextCards, nextCappers]) => {
        setCards(nextCards)
        setCappers(nextCappers)
        setSelectedCardId(nextCards[0]?.id ?? '')
      })
      .catch((requestError: unknown) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Sources could not be loaded',
        ),
      )
  }, [])

  useEffect(() => {
    if (!selectedCardId) return
    getSources(selectedCardId)
      .then(setSources)
      .catch((requestError: unknown) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Sources could not be loaded',
        ),
      )
  }, [selectedCardId])

  const handleSourceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSavingSource(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const capperId = String(form.get('primaryCapperId') ?? '')
    const sourceUrl = String(form.get('sourceUrl') ?? '').trim()
    const title = String(form.get('title') ?? '').trim()

    try {
      const source = await postSource({
        cardId: String(form.get('cardId')),
        primaryCapperId: capperId || null,
        medium: String(form.get('medium')),
        extractionMode: String(form.get('extractionMode')),
        sourceUrl: sourceUrl || null,
        title: title || null,
        rawText: String(form.get('rawText') ?? ''),
      })
      const capperName =
        cappers.find((capper) => capper.id === capperId)?.name ?? null
      setSources((current) => [
        { ...source, primaryCapperName: capperName },
        ...current,
      ])
      event.currentTarget.reset()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Source could not be saved',
      )
    } finally {
      setSavingSource(false)
    }
  }

  const handleCapperSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSavingCapper(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    try {
      const capper = await postCapper({
        name: String(form.get('capperName') ?? '').trim(),
      })
      setCappers((current) =>
        [...current, capper].sort((a, b) => a.name.localeCompare(b.name)),
      )
      event.currentTarget.reset()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Capper could not be saved',
      )
    } finally {
      setSavingCapper(false)
    }
  }

  return (
    <section className="workspace-stack">
      <div className="source-toolbar">
        <label className="field source-card-select">
          <span>Working card</span>
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
        <form className="quick-capper" onSubmit={handleCapperSubmit}>
          <label className="field">
            <span>Add a capper</span>
            <input
              name="capperName"
              required
              maxLength={120}
              placeholder="Capper or channel name"
            />
          </label>
          <button
            className="button button--secondary"
            type="submit"
            disabled={savingCapper}
          >
            {savingCapper ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <UserRoundPlus size={17} />
            )}
            Save
          </button>
        </form>
      </div>

      <div className="source-layout">
        <form className="editor-card" onSubmit={handleSourceSubmit}>
          <div className="editor-card__heading">
            <div className="icon-tile icon-tile--warm">
              <BookOpenText size={19} />
            </div>
            <div>
              <p className="section-kicker">Evidence</p>
              <h2>Add a source</h2>
            </div>
          </div>

          <input name="cardId" type="hidden" value={selectedCardId} readOnly />

          <div className="field-row">
            <label className="field">
              <span>Medium</span>
              <select name="medium" defaultValue="pasted_text">
                <option value="pasted_text">Pasted text</option>
                <option value="youtube">YouTube</option>
                <option value="patreon">Patreon</option>
                <option value="webpage">Web page</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field">
              <span>Extraction mode</span>
              <select name="extractionMode" defaultValue="individual">
                <option value="individual">Individual capper</option>
                <option value="aggregator">Aggregator</option>
                <option value="stats_tracker">Stats tracker</option>
              </select>
            </label>
          </div>

          <label className="field field--wide">
            <span>Primary capper</span>
            <select name="primaryCapperId" defaultValue="">
              <option value="">None / aggregate statistics</option>
              {cappers.map((capper) => (
                <option key={capper.id} value={capper.id}>
                  {capper.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field field--wide">
            <span>Title</span>
            <input
              name="title"
              maxLength={200}
              placeholder="Video or post title"
            />
          </label>

          <label className="field field--wide">
            <span>Source URL</span>
            <input
              name="sourceUrl"
              type="url"
              maxLength={2000}
              placeholder="https://… (optional)"
            />
          </label>

          <label className="field field--wide">
            <span>Transcript or tips</span>
            <textarea
              name="rawText"
              required
              maxLength={250000}
              rows={10}
              placeholder="Paste the source text here. Nothing is parsed until the extraction milestone is connected."
            />
          </label>

          {error && <p className="form-message form-message--error">{error}</p>}

          <button
            className="button button--primary button--full"
            type="submit"
            disabled={savingSource || !selectedCardId}
          >
            {savingSource ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Plus size={17} />
            )}
            {savingSource ? 'Saving source' : 'Save source'}
          </button>
        </form>

        <div className="records-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Review queue</p>
              <h2>Saved sources</h2>
            </div>
            <span className="quiet-badge">{sources.length} sources</span>
          </div>

          {sources.length === 0 ? (
            <div className="empty-state">
              <BookOpenText size={24} />
              <p>No sources on this card</p>
              <span>
                Add a transcript, Patreon tip, aggregator, or stats tracker.
              </span>
            </div>
          ) : (
            <div className="record-list">
              {sources.map((source) => (
                <article className="source-row" key={source.id}>
                  <div className="source-row__topline">
                    <span className="status-chip">
                      {source.extractionMode.replace('_', ' ')}
                    </span>
                    <span>{source.medium.replace('_', ' ')}</span>
                  </div>
                  <strong>
                    {source.title ||
                      source.primaryCapperName ||
                      'Untitled source'}
                  </strong>
                  <p>{source.rawText.slice(0, 150)}</p>
                  <div className="source-row__footer">
                    <span>
                      {source.primaryCapperName ?? 'Aggregate / unattributed'}
                    </span>
                    <span>
                      {new Date(source.addedAt).toLocaleString('en-AU')}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
