import {
  BookOpenText,
  FileUp,
  LoaderCircle,
  Plus,
  Sparkles,
  UserRoundPlus,
} from 'lucide-react'
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  acceptExtraction,
  getCappers,
  getCapperAliases,
  getExtractionRuns,
  getSources,
  parseSource,
  patchSource,
  postCapper,
  postCapperAlias,
  postSource,
  type Capper,
  type Alias,
  type ExtractionRun,
  type Source,
} from '../api'
import { errorMessage, formatCardTimestamp } from '../format'
import { useCards } from '../use-cards'
import {
  parseTranscriptCsv,
  type TranscriptCsvSource,
  type TranscriptExtractionMode,
} from '../transcript-csv'
import { CardSelect } from './CardSelect'
import { StructuredTipCsvPanel } from './StructuredTipCsvPanel'

function comparableName(value: string) {
  return value.trim().toLocaleLowerCase()
}

export function SourcesWorkspace() {
  const { cards, selectedCardId, setSelectedCardId } = useCards()
  const [cappers, setCappers] = useState<Capper[]>([])
  const [capperAliases, setCapperAliases] = useState<Alias[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [runs, setRuns] = useState<ExtractionRun[]>([])
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
  const [csvSources, setCsvSources] = useState<TranscriptCsvSource[]>([])
  const [csvFileName, setCsvFileName] = useState('')
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvMessage, setCsvMessage] = useState<{
    kind: 'success' | 'error'
    text: string
  } | null>(null)

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

  const duplicateCsvVideoIds = useMemo(
    () =>
      new Set(
        csvSources
          .filter((csvSource) =>
            sources.some(
              (source) =>
                source.sourceUrl && source.sourceUrl === csvSource.sourceUrl,
            ),
          )
          .map((csvSource) => csvSource.videoId),
      ),
    [csvSources, sources],
  )

  useEffect(() => {
    Promise.all([getCappers(), getCapperAliases()])
      .then(([nextCappers, nextAliases]) => {
        setCappers(nextCappers)
        setCapperAliases(nextAliases)
      })
      .catch((requestError: unknown) =>
        setError(errorMessage(requestError, 'Sources could not be loaded')),
      )
  }, [])

  useEffect(() => {
    if (!selectedCardId) return
    let cancelled = false
    Promise.all([getSources(selectedCardId), getExtractionRuns(selectedCardId)])
      .then(([nextSources, nextRuns]) => {
        if (cancelled) return
        setSources(nextSources)
        setRuns(nextRuns)
      })
      .catch(
        (requestError: unknown) =>
          !cancelled &&
          setError(errorMessage(requestError, 'Sources could not be loaded')),
      )
    return () => {
      cancelled = true
    }
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
      setError(errorMessage(requestError, 'Source could not be saved'))
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
      setError(errorMessage(requestError, 'Capper could not be saved'))
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
      setError(errorMessage(requestError, 'Capper alias could not be saved'))
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
      setError(errorMessage(requestError, 'Source could not be parsed'))
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
        errorMessage(requestError, 'Extraction could not be accepted'),
      )
    } finally {
      setAcceptingRunId(null)
    }
  }

  const handleEditSource = (source: Source) => {
    setEditingSource(source)
    document
      .getElementById('source-details')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleCsvFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setCsvMessage(null)
    setCsvSources([])
    setCsvFileName(file.name)

    if (!file.name.toLocaleLowerCase().endsWith('.csv')) {
      setCsvMessage({ kind: 'error', text: 'Choose a .csv transcript file.' })
      event.target.value = ''
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setCsvMessage({
        kind: 'error',
        text: 'The CSV is larger than 25 MB. Split it into smaller files before importing.',
      })
      event.target.value = ''
      return
    }

    try {
      const parsedSources = parseTranscriptCsv(await file.text())
      setCsvSources(parsedSources)
      setCsvMessage({
        kind: 'success',
        text: `Ready to import ${parsedSources.length} video transcript${parsedSources.length === 1 ? '' : 's'}. Check the extraction mode for each one first.`,
      })
    } catch (csvError) {
      setCsvMessage({
        kind: 'error',
        text: errorMessage(csvError, 'The transcript CSV could not be read'),
      })
      event.target.value = ''
    }
  }

  const updateCsvExtractionMode = (
    videoId: string,
    extractionMode: TranscriptExtractionMode,
  ) => {
    setCsvSources((current) =>
      current.map((source) =>
        source.videoId === videoId ? { ...source, extractionMode } : source,
      ),
    )
  }

  const handleCsvImport = async () => {
    if (!selectedCardId) {
      setCsvMessage({ kind: 'error', text: 'Choose a card in step 1 first.' })
      return
    }

    const pendingSources = csvSources.filter(
      (source) => !duplicateCsvVideoIds.has(source.videoId),
    )
    if (pendingSources.length === 0) {
      setCsvMessage({
        kind: 'error',
        text: 'Every video in this CSV is already saved on the selected card.',
      })
      return
    }

    setCsvImporting(true)
    setCsvMessage(null)
    const nextCappers = [...cappers]
    const importedSources: Source[] = []
    const importedVideoIds = new Set<string>()

    try {
      for (const csvSource of pendingSources) {
        let primaryCapper: Capper | null = null
        if (csvSource.extractionMode === 'individual') {
          primaryCapper =
            nextCappers.find(
              (capper) =>
                comparableName(capper.name) ===
                comparableName(csvSource.channelName),
            ) ?? null
          if (!primaryCapper) {
            primaryCapper = await postCapper({
              name: csvSource.channelName,
              notes: 'Created from a transcript CSV import.',
            })
            nextCappers.push(primaryCapper)
          }
        }

        const source = await postSource({
          cardId: selectedCardId,
          primaryCapperId: primaryCapper?.id ?? null,
          medium: 'youtube',
          extractionMode: csvSource.extractionMode,
          title: csvSource.title,
          sourceUrl: csvSource.sourceUrl,
          rawText: csvSource.transcriptText,
        })
        importedSources.push({
          ...source,
          primaryCapperName: primaryCapper?.name ?? null,
        })
        importedVideoIds.add(csvSource.videoId)
      }

      setCsvSources([])
      setCsvFileName('')
      setCsvMessage({
        kind: 'success',
        text: `Imported ${importedSources.length} transcript${importedSources.length === 1 ? '' : 's'}. ${importedSources.length === 1 ? 'It is' : 'They are'} saved as ${importedSources.length === 1 ? 'a raw source' : 'raw sources'}; continue to step 4 to parse and review ${importedSources.length === 1 ? 'it' : 'them'}.`,
      })
    } catch (requestError) {
      setCsvSources((current) =>
        current.filter((source) => !importedVideoIds.has(source.videoId)),
      )
      setCsvMessage({
        kind: 'error',
        text: `${importedSources.length} of ${pendingSources.length} transcripts were imported before the import stopped. ${errorMessage(requestError, 'The next source could not be saved')}`,
      })
    } finally {
      setCappers(nextCappers.sort((a, b) => a.name.localeCompare(b.name)))
      if (importedSources.length > 0) {
        setSources((current) => [...importedSources.reverse(), ...current])
      }
      setCsvImporting(false)
    }
  }

  return (
    <section className="workspace-stack sources-workflow">
      {error && <p className="form-message form-message--error">{error}</p>}
      <ol className="sources-steps">
        <li className="sources-step">
          <span className="sources-step__number" aria-hidden="true">
            1
          </span>
          <div className="sources-step__header">
            <span className="sources-step__eyebrow">Step 1</span>
            <h2>Choose the card you are researching</h2>
            <p>
              Every source is attached to one UFC card. Select the event before
              adding anything so its fights are available during extraction and
              review.
            </p>
          </div>
          <div className="sources-card-picker">
            <CardSelect
              cards={cards}
              value={selectedCardId}
              onChange={setSelectedCardId}
            />
          </div>
        </li>

        <li className="sources-step">
          <span className="sources-step__number" aria-hidden="true">
            2
          </span>
          <div className="sources-step__header">
            <span className="sources-step__eyebrow">Step 2 · Optional</span>
            <h2>Add cappers and alternate names</h2>
            <p>
              Add a capper once if the source comes from one person or channel.
              Add an alias only when that same capper is named differently in a
              transcript or aggregator. Skip this step for unattributed crowd
              statistics.
            </p>
          </div>
          <div className="capper-setup-grid">
            <section className="source-setup-panel">
              <h3>Add a capper</h3>
              <p>
                Use the public person or channel name you want to see throughout
                the app.
              </p>
              <form className="quick-capper" onSubmit={handleCapperSubmit}>
                <label className="field">
                  <span>Capper or channel name</span>
                  <input
                    name="capperName"
                    required
                    maxLength={120}
                    placeholder="For example, The MMA Guru"
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
                  Save capper
                </button>
              </form>
            </section>

            <section className="source-setup-panel">
              <h3>Add an alternate name</h3>
              <p>
                Link a nickname, misspelling, or abbreviated channel name to a
                capper you already saved.
              </p>
              <form className="quick-capper" onSubmit={handleCapperAliasSubmit}>
                <label className="field">
                  <span>Saved capper</span>
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
                  <input
                    name="aliasDisplay"
                    required
                    maxLength={160}
                    placeholder="Name used in the source"
                  />
                </label>
                <button
                  className="button button--secondary"
                  disabled={savingCapper}
                >
                  Add alias
                </button>
              </form>
            </section>
          </div>

          {capperAliases.length > 0 && (
            <div className="alias-list" aria-label="Saved capper aliases">
              {capperAliases.map((alias) => (
                <span key={alias.id}>
                  <strong>{alias.aliasDisplay}</strong> → {alias.entityName}
                </span>
              ))}
            </div>
          )}
        </li>

        <li className="sources-step" id="source-details">
          <span className="sources-step__number" aria-hidden="true">
            3
          </span>
          <div className="sources-step__header">
            <span className="sources-step__eyebrow">Step 3</span>
            <h2>Save the source material</h2>
            <p>
              Upload a transcript CSV or paste one transcript, set of written
              tips, or tracker data exactly as you received it. Saving stores
              the raw material; it does not yet add any picks to the Fight
              board.
            </p>
          </div>

          <div className="source-mode-guide" aria-label="Extraction mode guide">
            <div>
              <strong>Individual capper</strong>
              <span>One person or channel giving their own picks or bets.</span>
            </div>
            <div>
              <strong>Aggregator</strong>
              <span>
                A source that relays picks from several named predictors.
              </span>
            </div>
            <div>
              <strong>Stats tracker</strong>
              <span>Aggregate vote counts, percentages, or method totals.</span>
            </div>
          </div>

          <StructuredTipCsvPanel
            key={selectedCardId}
            cardId={selectedCardId}
            onImported={async () => {
              const [nextSources, nextRuns] = await Promise.all([
                getSources(selectedCardId),
                getExtractionRuns(selectedCardId),
              ])
              setSources(nextSources)
              setRuns(nextRuns)
            }}
          />

          <section
            className="csv-import-card"
            aria-labelledby="csv-import-title"
          >
            <div className="csv-import-card__heading">
              <FileUp size={20} aria-hidden="true" />
              <div>
                <h3 id="csv-import-title">Upload transcript CSV</h3>
                <p>
                  Use this for transcript exports with one or more rows per
                  video. Rows sharing a <code>video_id</code> are ordered by{' '}
                  <code>part_number</code> and combined into one source. The
                  import stops if a part is duplicated or missing.
                </p>
              </div>
            </div>

            <label className="field csv-import-card__file">
              <span>Transcript CSV file</span>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={csvImporting}
                onChange={(event) => void handleCsvFile(event)}
              />
              <small>
                Expected columns include channel_name, video_id, video_title,
                video_url, part_number, part_count, and transcript_text. Maximum
                file size: 25 MB.
              </small>
            </label>

            {csvSources.length > 0 && (
              <div className="csv-import-preview">
                <div className="csv-import-preview__summary">
                  <div>
                    <strong>{csvFileName}</strong>
                    <span>
                      {csvSources.length} videos from{' '}
                      {csvSources.reduce(
                        (total, source) => total + source.partCount,
                        0,
                      )}{' '}
                      CSV rows
                    </span>
                  </div>
                  <span className="quiet-badge">
                    {csvSources.length - duplicateCsvVideoIds.size} ready
                  </span>
                </div>

                <div className="csv-import-list">
                  {csvSources.map((csvSource) => {
                    const duplicate = duplicateCsvVideoIds.has(
                      csvSource.videoId,
                    )
                    return (
                      <article
                        className={`csv-import-row ${duplicate ? 'csv-import-row--duplicate' : ''}`}
                        key={csvSource.videoId}
                      >
                        <div className="csv-import-row__copy">
                          <strong>{csvSource.title}</strong>
                          <span>
                            {csvSource.channelName} · {csvSource.partCount}{' '}
                            {csvSource.partCount === 1 ? 'part' : 'parts'} ·{' '}
                            {csvSource.transcriptText.length.toLocaleString()}{' '}
                            characters
                          </span>
                        </div>
                        {duplicate ? (
                          <span className="status-chip">Already saved</span>
                        ) : (
                          <label className="field csv-import-row__mode">
                            <span>Extraction mode</span>
                            <select
                              value={csvSource.extractionMode}
                              disabled={csvImporting}
                              aria-label={`Extraction mode for ${csvSource.title}`}
                              onChange={(event) =>
                                updateCsvExtractionMode(
                                  csvSource.videoId,
                                  event.target
                                    .value as TranscriptExtractionMode,
                                )
                              }
                            >
                              <option value="individual">
                                Individual capper
                              </option>
                              <option value="aggregator">Aggregator</option>
                              <option value="stats_tracker">
                                Stats tracker
                              </option>
                            </select>
                          </label>
                        )}
                      </article>
                    )
                  })}
                </div>

                <button
                  className="button button--primary"
                  type="button"
                  disabled={
                    csvImporting ||
                    csvSources.length === duplicateCsvVideoIds.size
                  }
                  onClick={() => void handleCsvImport()}
                >
                  {csvImporting ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <FileUp size={17} />
                  )}
                  {csvImporting
                    ? 'Importing transcripts'
                    : `Import ${csvSources.length - duplicateCsvVideoIds.size} transcript${csvSources.length - duplicateCsvVideoIds.size === 1 ? '' : 's'}`}
                </button>
              </div>
            )}

            {csvMessage && (
              <p
                className={`csv-import-message csv-import-message--${csvMessage.kind}`}
                role={csvMessage.kind === 'error' ? 'alert' : 'status'}
              >
                {csvMessage.text}
              </p>
            )}
          </section>

          <div className="source-entry-divider">
            <span>Or enter one source manually</span>
          </div>

          <form
            className="editor-card sources-editor"
            key={editingSource?.id ?? 'new-source'}
            onSubmit={handleSourceSubmit}
          >
            {editingSource && (
              <div className="sources-editing-notice">
                <strong>Editing a saved source</strong>
                <span>
                  Save your changes below. Parse it again afterward if you want
                  a new extraction.
                </span>
              </div>
            )}

            <input
              name="cardId"
              type="hidden"
              value={selectedCardId}
              readOnly
            />

            <div className="field-row">
              <label className="field">
                <span>Where did it come from?</span>
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
                <small>
                  This records the source type for your audit history.
                </small>
              </label>
              <label className="field">
                <span>Whose information is this?</span>
                <select
                  name="extractionMode"
                  defaultValue={editingSource?.extractionMode ?? 'individual'}
                >
                  <option value="individual">Individual capper</option>
                  <option value="aggregator">Aggregator</option>
                  <option value="stats_tracker">Stats tracker</option>
                </select>
                <small>
                  Use the guide above to choose the extraction mode.
                </small>
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
              <small>
                Choose the capper for an individual source. Leave this empty for
                aggregators and stats trackers.
              </small>
            </label>

            <label className="field field--wide">
              <span>Title · Optional</span>
              <input
                name="title"
                defaultValue={editingSource?.title ?? ''}
                maxLength={200}
                placeholder="Video, post, or tracker title"
              />
            </label>

            <label className="field field--wide">
              <span>Source URL · Optional</span>
              <input
                name="sourceUrl"
                defaultValue={editingSource?.sourceUrl ?? ''}
                type="url"
                maxLength={2000}
                placeholder="https://…"
              />
            </label>

            <label className="field field--wide">
              <span>Transcript, written tips, or tracker data</span>
              <textarea
                name="rawText"
                defaultValue={editingSource?.rawText ?? ''}
                required
                maxLength={250000}
                rows={12}
                placeholder="Paste the complete source material here. Keep the capper's wording and context so the extraction can distinguish final picks from hypotheticals or discussion."
              />
              <small>
                Up to 250,000 characters. Long sources are split into
                deterministic 50,000-character chunks before extraction.
              </small>
            </label>

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
        </li>

        <li className="sources-step" id="saved-sources">
          <span className="sources-step__number" aria-hidden="true">
            4
          </span>
          <div className="sources-step__header">
            <span className="sources-step__eyebrow">Step 4</span>
            <h2>Parse, review, and accept</h2>
            <p>
              Work through each saved source below. Its extracted picks remain
              inactive until you review the structured result and explicitly
              accept it.
            </p>
          </div>

          <ol className="source-action-sequence">
            <li>
              <strong>Parse source</strong>
              <span>
                The model turns the raw material into structured picks.
              </span>
            </li>
            <li>
              <strong>Review extraction</strong>
              <span>
                Check identities, picks, markets, confidence, and reasoning.
              </span>
            </li>
            <li>
              <strong>Accept reviewed extraction</strong>
              <span>
                Only this action makes the evidence available to synthesis.
              </span>
            </li>
          </ol>

          <p className="sources-prerequisite">
            Parsing uses the language model configured in Settings. If the app
            says that a model or API key is missing, open Settings first; the
            raw source you saved here will remain intact.
          </p>

          <div className="records-card sources-records">
            <div className="section-heading">
              <div>
                <h3>Saved sources for this card</h3>
              </div>
              <span className="quiet-badge">{sources.length} sources</span>
            </div>

            {sources.length === 0 ? (
              <div className="empty-state">
                <BookOpenText size={24} />
                <p>No saved sources yet</p>
                <span>
                  Complete step 3 first. Your saved source will appear here with
                  a Parse source button.
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
                          {source.primaryCapperName ??
                            'Aggregate / unattributed'}
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
                          onClick={() => handleEditSource(source)}
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
          {reviewRunId && (
            <section
              className="review-card"
              aria-labelledby="extraction-review-title"
            >
              <div className="section-heading">
                <div>
                  <h3 id="extraction-review-title">
                    Review structured extraction
                  </h3>
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
                Check every fight and fighter ID against the card. Correct any
                pick, market, confidence, method, round, or reasoning that is
                wrong. The original model response remains unchanged in the
                audit history.
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
                <p className="form-message form-message--error">
                  {reviewError}
                </p>
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
        </li>
      </ol>
    </section>
  )
}
