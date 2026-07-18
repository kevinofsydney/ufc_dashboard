import {
  BookOpenText,
  LoaderCircle,
  Plus,
  Sparkles,
  UserRoundPlus,
} from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  acceptExtraction,
  getCappers,
  getCapperAliases,
  getCards,
  getExtractionRuns,
  getSources,
  parseSource,
  patchSource,
  postCapper,
  postCapperAlias,
  postSource,
  type Capper,
  type Alias,
  type Card,
  type ExtractionRun,
  type Source,
} from '../api'
import { formatCardTimestamp } from '../format'
import { HelpTooltip } from './HelpTooltip'

export function SourcesWorkspace() {
  const [cards, setCards] = useState<Card[]>([])
  const [cappers, setCappers] = useState<Capper[]>([])
  const [capperAliases, setCapperAliases] = useState<Alias[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [runs, setRuns] = useState<ExtractionRun[]>([])
  const [selectedCardId, setSelectedCardId] = useState('')
  const [editingSource, setEditingSource] = useState<Source | null>(null)
  const [savingSource, setSavingSource] = useState(false)
  const [savingCapper, setSavingCapper] = useState(false)
  const [parsingSourceId, setParsingSourceId] = useState<string | null>(null)
  const [acceptingRunId, setAcceptingRunId] = useState<string | null>(null)
  const [reviewRunId, setReviewRunId] = useState<string | null>(null)
  const [reviewJson, setReviewJson] = useState('')
  const [reviewConfirmed, setReviewConfirmed] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedCard = cards.find((card) => card.id === selectedCardId)
  const reviewRun = runs.find((run) => run.id === reviewRunId)
  const reviewSource = sources.find(
    (source) => source.id === reviewRun?.sourceId,
  )

  const latestRunBySource = useMemo(() => {
    const latest = new Map<string, ExtractionRun>()
    for (const run of runs) {
      if (!latest.has(run.sourceId)) latest.set(run.sourceId, run)
    }
    return latest
  }, [runs])

  useEffect(() => {
    Promise.all([getCards(), getCappers(), getCapperAliases()])
      .then(([nextCards, nextCappers, nextAliases]) => {
        setCards(nextCards)
        setCappers(nextCappers)
        setCapperAliases(nextAliases)
        setSelectedCardId((current) => current || nextCards[0]?.id || '')
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
    Promise.all([getSources(selectedCardId), getExtractionRuns(selectedCardId)])
      .then(([nextSources, nextRuns]) => {
        setSources(nextSources)
        setRuns(nextRuns)
      })
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
    const formElement = event.currentTarget
    setSavingSource(true)
    setError(null)
    const form = new FormData(formElement)
    const capperId = String(form.get('primaryCapperId') ?? '')
    const sourceUrl = String(form.get('sourceUrl') ?? '').trim()
    const title = String(form.get('title') ?? '').trim()

    try {
      const input = {
        primaryCapperId: capperId || null,
        medium: String(form.get('medium')),
        extractionMode: String(form.get('extractionMode')),
        sourceUrl: sourceUrl || null,
        title: title || null,
        rawText: String(form.get('rawText') ?? ''),
      }
      const source = editingSource
        ? await patchSource(editingSource.id, input)
        : await postSource({ cardId: String(form.get('cardId')), ...input })
      const capperName =
        cappers.find((capper) => capper.id === capperId)?.name ?? null
      setSources((current) =>
        editingSource
          ? current.map((item) =>
              item.id === source.id
                ? { ...source, primaryCapperName: capperName }
                : item,
            )
          : [{ ...source, primaryCapperName: capperName }, ...current],
      )
      setEditingSource(null)
      formElement.reset()
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
    const formElement = event.currentTarget
    setSavingCapper(true)
    setError(null)
    const form = new FormData(formElement)
    try {
      const capper = await postCapper({
        name: String(form.get('capperName') ?? '').trim(),
      })
      setCappers((current) =>
        [...current, capper].sort((a, b) => a.name.localeCompare(b.name)),
      )
      formElement.reset()
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

  const handleCapperAliasSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setSavingCapper(true)
    setError(null)
    try {
      const alias = await postCapperAlias(
        String(form.get('capperId')),
        String(form.get('aliasDisplay') ?? '').trim(),
      )
      setCapperAliases((current) => [...current, alias])
      formElement.reset()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Capper alias could not be saved',
      )
    } finally {
      setSavingCapper(false)
    }
  }

  const handleParse = async (sourceId: string) => {
    setParsingSourceId(sourceId)
    setError(null)
    try {
      const run = await parseSource(sourceId)
      setRuns((current) => [run, ...current])
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Source could not be parsed',
      )
    } finally {
      setParsingSourceId(null)
    }
  }

  const openReview = (run: ExtractionRun) => {
    if (!run.rawResponse) {
      setError('This extraction has no model output to review')
      return
    }
    try {
      const unfenced = run.rawResponse
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
      setReviewJson(JSON.stringify(JSON.parse(unfenced), null, 2))
      setReviewRunId(run.id)
      setReviewConfirmed(false)
      setReviewError(null)
    } catch {
      setError('This extraction is not valid JSON and must be parsed again')
    }
  }

  const handleAccept = async () => {
    if (!reviewRunId || !reviewConfirmed) return
    let output: unknown
    try {
      output = JSON.parse(reviewJson)
    } catch {
      setReviewError('The reviewed output is not valid JSON')
      return
    }
    const runId = reviewRunId
    setAcceptingRunId(runId)
    setError(null)
    setReviewError(null)
    try {
      await acceptExtraction(runId, output)
      setRuns((current) =>
        current.map((run) =>
          run.id === runId
            ? {
                ...run,
                status: 'accepted',
                reviewedResponse: JSON.stringify(output),
              }
            : run,
        ),
      )
      setReviewRunId(null)
      setReviewJson('')
      setReviewConfirmed(false)
    } catch (requestError) {
      setReviewError(
        requestError instanceof Error
          ? requestError.message
          : 'Extraction could not be accepted',
      )
    } finally {
      setAcceptingRunId(null)
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
        <form className="quick-capper" onSubmit={handleCapperAliasSubmit}>
          <label className="field">
            <span>Capper alias</span>
            <select name="capperId" required>
              <option value="">Select capper</option>
              {cappers.map((capper) => (
                <option key={capper.id} value={capper.id}>
                  {capper.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Alternate name</span>
            <input name="aliasDisplay" required maxLength={160} />
          </label>
          <button className="button button--secondary" disabled={savingCapper}>
            Add alias
          </button>
        </form>
      </div>

      {capperAliases.length > 0 && (
        <div className="alias-list">
          {capperAliases.map((alias) => (
            <span key={alias.id}>
              <strong>{alias.aliasDisplay}</strong> → {alias.entityName}
            </span>
          ))}
        </div>
      )}

      <div className="source-layout">
        <form
          className="editor-card"
          key={editingSource?.id ?? 'new-source'}
          onSubmit={handleSourceSubmit}
        >
          <div className="editor-card__heading">
            <div className="icon-tile icon-tile--warm">
              <BookOpenText size={19} />
            </div>
            <div>
              <div className="heading-with-help">
                <h2>{editingSource ? 'Edit source' : 'Add a source'}</h2>
                <HelpTooltip
                  label="Add a source"
                  text="Choose individual for one capper, aggregator for relayed named picks, or stats tracker for aggregate counts. Save first, then parse."
                  align="left"
                />
              </div>
            </div>
          </div>

          <input name="cardId" type="hidden" value={selectedCardId} readOnly />

          <div className="field-row">
            <label className="field">
              <span>Medium</span>
              <select
                name="medium"
                defaultValue={editingSource?.medium ?? 'pasted_text'}
              >
                <option value="pasted_text">Pasted text</option>
                <option value="youtube">YouTube</option>
                <option value="patreon">Patreon</option>
                <option value="webpage">Web page</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field">
              <span>Extraction mode</span>
              <select
                name="extractionMode"
                defaultValue={editingSource?.extractionMode ?? 'individual'}
              >
                <option value="individual">Individual capper</option>
                <option value="aggregator">Aggregator</option>
                <option value="stats_tracker">Stats tracker</option>
              </select>
            </label>
          </div>

          <label className="field field--wide">
            <span>Primary capper</span>
            <select
              name="primaryCapperId"
              defaultValue={editingSource?.primaryCapperId ?? ''}
            >
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
              defaultValue={editingSource?.title ?? ''}
              maxLength={200}
              placeholder="Video or post title"
            />
          </label>

          <label className="field field--wide">
            <span>Source URL</span>
            <input
              name="sourceUrl"
              defaultValue={editingSource?.sourceUrl ?? ''}
              type="url"
              maxLength={2000}
              placeholder="https://… (optional)"
            />
          </label>

          <label className="field field--wide">
            <span>Transcript or tips</span>
            <textarea
              name="rawText"
              defaultValue={editingSource?.rawText ?? ''}
              required
              maxLength={250000}
              rows={10}
              placeholder="Paste transcript or written tips. Review is required before any extraction can influence synthesis."
            />
            <small>
              Up to 250,000 characters. Long sources are split into
              deterministic 50,000-character chunks before extraction.
            </small>
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
            {savingSource
              ? 'Saving source'
              : editingSource
                ? 'Save source changes'
                : 'Save source'}
          </button>
          {editingSource && (
            <button
              className="button button--secondary button--full"
              type="button"
              onClick={() => setEditingSource(null)}
            >
              Cancel editing
            </button>
          )}
        </form>

        <div className="records-card">
          <div className="section-heading">
            <div>
              <div className="heading-with-help">
                <h2>Saved sources</h2>
                <HelpTooltip
                  label="Saved sources"
                  text="Parse a saved source, open any run marked needs review, correct its structured JSON, and accept it before it can influence synthesis."
                  align="left"
                />
              </div>
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
              {sources.map((source) => {
                const latestRun = latestRunBySource.get(source.id)
                return (
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
                        {formatCardTimestamp(
                          source.addedAt,
                          selectedCard?.displayTimezone,
                        )}
                      </span>
                    </div>
                    <div className="source-row__actions">
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setEditingSource(source)}
                      >
                        Edit source
                      </button>
                      {latestRun ? (
                        <span className="run-status">
                          Latest run: {latestRun.status.replace('_', ' ')}
                        </span>
                      ) : (
                        <span className="run-status">Not parsed</span>
                      )}
                      <button
                        className="button button--secondary button--compact"
                        type="button"
                        disabled={parsingSourceId === source.id}
                        onClick={() => void handleParse(source.id)}
                      >
                        {parsingSourceId === source.id ? (
                          <LoaderCircle className="spin" size={14} />
                        ) : (
                          <Sparkles size={14} />
                        )}
                        {parsingSourceId === source.id
                          ? 'Parsing'
                          : 'Parse source'}
                      </button>
                      {latestRun?.status === 'needs_review' && (
                        <button
                          className="button button--primary button--compact"
                          type="button"
                          disabled={acceptingRunId === latestRun.id}
                          onClick={() => openReview(latestRun)}
                        >
                          {acceptingRunId ? (
                            <LoaderCircle className="spin" size={14} />
                          ) : (
                            <Sparkles size={14} />
                          )}
                          Review extraction
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {reviewRunId && (
        <section
          className="review-card"
          aria-labelledby="extraction-review-title"
        >
          <div className="section-heading">
            <div>
              <div className="heading-with-help">
                <h2 id="extraction-review-title">
                  Review structured extraction
                </h2>
                <HelpTooltip
                  label="Review structured extraction"
                  text="Verify fighter, fight, capper, market, confidence, method, and round values. Acceptance makes this run active; the raw response stays auditable."
                  align="left"
                />
              </div>
            </div>
            <button
              className="button button--secondary button--compact"
              type="button"
              onClick={() => setReviewRunId(null)}
            >
              Close
            </button>
          </div>
          <p className="review-card__guidance">
            Check every fight and fighter ID against the card. Correct any pick,
            market, confidence, or reasoning. The original model response
            remains unchanged in the audit history.
          </p>
          {reviewSource?.extractionMode === 'aggregator' && (
            <div className="review-reference">
              <strong>Capper attribution reference</strong>
              <p>
                Each opinion and tip needs an exact{' '}
                <code>attributed_to_raw</code> name or an{' '}
                <code>attributed_to_capper_id</code> from this list.
              </p>
              <div>
                {cappers.map((capper) => (
                  <code key={capper.id}>
                    {capper.name}: {capper.id}
                  </code>
                ))}
              </div>
            </div>
          )}
          <label className="field field--wide">
            <span>Reviewed JSON</span>
            <textarea
              className="review-json"
              value={reviewJson}
              onChange={(event) => {
                setReviewJson(event.target.value)
                setReviewConfirmed(false)
              }}
              rows={18}
              spellCheck={false}
            />
          </label>
          <label className="review-confirmation">
            <input
              type="checkbox"
              checked={reviewConfirmed}
              onChange={(event) => setReviewConfirmed(event.target.checked)}
            />
            <span>I reviewed every opinion, tip, and fighter mapping.</span>
          </label>
          {reviewError && (
            <p className="form-message form-message--error">{reviewError}</p>
          )}
          <button
            className="button button--primary"
            type="button"
            disabled={!reviewConfirmed || acceptingRunId === reviewRunId}
            onClick={() => void handleAccept()}
          >
            {acceptingRunId === reviewRunId ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Sparkles size={17} />
            )}
            Accept reviewed extraction
          </button>
        </section>
      )}
    </section>
  )
}
