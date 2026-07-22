import {
  CalendarPlus,
  ExternalLink,
  LoaderCircle,
  Radar,
  Save,
} from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import {
  discoverCardPreview,
  getApplicationSettings,
  getCardSourceLinks,
  putCardSourceLink,
  type CardFetchPreview,
  type CardSourceLink,
} from '../api'
import { importCardPreview, importsOddsByDefault } from '../import-preview'
import { EVENT_PROVIDERS, PROVIDER_LABELS } from '../../shared/providers'
import { errorMessage } from '../format'
import { useCards } from '../use-cards'
import { CardWorkspace } from './CardWorkspace'
import { OddsBoardWorkspace } from './OddsBoardWorkspace'

const PROVIDER_URL_PLACEHOLDERS: Record<
  (typeof EVENT_PROVIDERS)[number],
  string
> = {
  betmma: 'https://www.betmma.tips/next_ufc_event.php',
  ufc: 'https://www.ufc.com/event/…',
  tapology: 'https://www.tapology.com/fightcenter/events/…',
}

export function EventWorkspace() {
  const { cards, setCards, selectedCardId, setSelectedCardId, cardsLoaded } =
    useCards()
  const [links, setLinks] = useState<CardSourceLink[]>([])
  const [discovery, setDiscovery] = useState<CardFetchPreview | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importOdds, setImportOdds] = useState(false)
  const [unitValueCents, setUnitValueCents] = useState(1000)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const autoDiscoveryAttempted = useRef(false)
  const visibleLinks = links.filter((link) => link.cardId === selectedCardId)

  useEffect(() => {
    getApplicationSettings()
      .then((settings) => setUnitValueCents(settings.defaultUnitValueCents))
      .catch(() => {
        // The import falls back to the schema default unit value.
      })
  }, [])

  useEffect(() => {
    if (!selectedCardId) return
    getCardSourceLinks(selectedCardId)
      .then(setLinks)
      .catch((requestError: unknown) =>
        setMessage(
          errorMessage(requestError, 'Event links could not be loaded'),
        ),
      )
  }, [selectedCardId])

  useEffect(() => {
    if (
      !cardsLoaded ||
      cards.length > 0 ||
      discovery ||
      discovering ||
      autoDiscoveryAttempted.current
    )
      return
    autoDiscoveryAttempted.current = true
    setDiscovering(true)
    discoverCardPreview()
      .then((preview) => {
        setImportOdds(importsOddsByDefault(preview.provider))
        setDiscovery(preview)
      })
      .catch((requestError: unknown) =>
        setMessage(
          errorMessage(requestError, 'Automatic discovery was unavailable'),
        ),
      )
      .finally(() => setDiscovering(false))
  }, [cards.length, cardsLoaded, discovering, discovery])

  const handleDiscover = async () => {
    setDiscovering(true)
    setMessage(null)
    try {
      const preview = await discoverCardPreview()
      setImportOdds(importsOddsByDefault(preview.provider))
      setDiscovery(preview)
    } catch (requestError) {
      setMessage(
        errorMessage(requestError, 'Automatic discovery was unavailable'),
      )
    } finally {
      setDiscovering(false)
    }
  }

  const handleImportDiscovery = async () => {
    if (!discovery?.event_name) return
    setImporting(true)
    setMessage(null)
    try {
      const { card, pricesComplete } = await importCardPreview(discovery, {
        unitValueCents,
        importOdds,
      })
      setCards((current) => [card, ...current])
      setSelectedCardId(card.id)
      setDiscovery(null)
      setMessage(
        pricesComplete
          ? `${card.name} imported with ${discovery.bouts.length} bouts. Review the odds below, then add your sources.`
          : `${card.name} was imported, but at least one page price was rejected. Enter the missing prices on the Odds Board.`,
      )
    } catch (requestError) {
      setMessage(errorMessage(requestError, 'Event import failed'))
    } finally {
      setImporting(false)
    }
  }

  const handleLinks = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedCardId) return
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setMessage(null)
    try {
      const nextLinks: CardSourceLink[] = []
      for (const provider of EVENT_PROVIDERS) {
        const url = String(form.get(`${provider}Url`) ?? '').trim()
        if (url)
          nextLinks.push(await putCardSourceLink(selectedCardId, provider, url))
      }
      setLinks((current) => [
        ...current.filter(
          (link) =>
            !nextLinks.some((saved) => saved.provider === link.provider),
        ),
        ...nextLinks,
      ])
      setMessage('Event source links saved.')
    } catch (requestError) {
      setMessage(errorMessage(requestError, 'Event links could not be saved'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="workspace-stack event-workspace">
      <section className="event-source-card">
        <div className="section-heading">
          <div>
            <h2>Event discovery &amp; source links</h2>
            <p>
              BetMMA is checked first because it prices both sides of every
              bout; UFC.com and Tapology are the fallbacks. Every fetched card
              remains a preview until you import it.
            </p>
          </div>
          <button
            className="button button--secondary"
            type="button"
            disabled={discovering}
            onClick={() => void handleDiscover()}
          >
            {discovering ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Radar size={16} />
            )}
            {discovering ? 'Finding event' : 'Find this weekend’s event'}
          </button>
        </div>
        {discovery && (
          <div className="discovery-preview" aria-live="polite">
            <div>
              <span className="quiet-badge">
                {PROVIDER_LABELS[discovery.provider]}
              </span>
              <strong>{discovery.event_name ?? 'Upcoming UFC event'}</strong>
              <span>
                {discovery.bouts.length} bouts found ·{' '}
                {
                  discovery.bouts.filter(
                    (bout) =>
                      bout.fighter_a_odds_raw && bout.fighter_b_odds_raw,
                  ).length
                }{' '}
                fully priced
              </span>
            </div>
            <a href={discovery.source_url} target="_blank" rel="noreferrer">
              Open source <ExternalLink size={14} />
            </a>
            {discovery.warnings.map((warning) => (
              <p className="form-message form-message--warning" key={warning}>
                {warning}
              </p>
            ))}
            {discovery.bouts.some(
              (bout) => bout.fighter_a_odds_raw || bout.fighter_b_odds_raw,
            ) && (
              <label className="import-odds-option">
                <input
                  type="checkbox"
                  checked={importOdds}
                  onChange={(event) => setImportOdds(event.target.checked)}
                />
                <span>
                  Import {PROVIDER_LABELS[discovery.provider]} moneylines to the
                  Odds Board as a reviewed snapshot
                  {discovery.provider === 'betmma'
                    ? '. These are aggregated best-available prices — confirm your own book before staking.'
                    : ''}
                </span>
              </label>
            )}
            <div className="preview-actions">
              <button
                className="button button--primary"
                type="button"
                disabled={
                  !discovery.event_name ||
                  importing ||
                  discovery.conflicts.length > 0
                }
                onClick={() => void handleImportDiscovery()}
              >
                {importing ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <CalendarPlus size={16} />
                )}
                {importing ? 'Importing event' : 'Import as new card'}
              </button>
            </div>
            <label className="field field--wide">
              <span>Discovered event URL</span>
              <input readOnly value={discovery.source_url} />
              <small>
                Paste this into the import form below if you would rather review
                the full diff against an existing card first.
              </small>
            </label>
          </div>
        )}
        {selectedCardId && (
          <form
            key={`${selectedCardId}:${visibleLinks.map((link) => `${link.provider}=${link.url}`).join('|')}`}
            className="event-links-form"
            onSubmit={handleLinks}
          >
            {EVENT_PROVIDERS.map((provider) => (
              <label className="field" key={provider}>
                <span>{PROVIDER_LABELS[provider]} event URL</span>
                <input
                  name={`${provider}Url`}
                  type="url"
                  defaultValue={
                    visibleLinks.find((link) => link.provider === provider)
                      ?.url ?? ''
                  }
                  placeholder={PROVIDER_URL_PLACEHOLDERS[provider]}
                />
              </label>
            ))}
            <button
              className="button button--secondary"
              type="submit"
              disabled={saving}
            >
              {saving ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Save size={16} />
              )}
              Save event links
            </button>
          </form>
        )}
        {message && (
          <p className="form-message" aria-live="polite">
            {message}
          </p>
        )}
      </section>
      <CardWorkspace />
      <section className="event-odds-section">
        <div className="section-heading">
          <div>
            <h2>Current odds</h2>
            <p>Confirm both moneyline sides before creating recommendations.</p>
          </div>
        </div>
        <OddsBoardWorkspace />
      </section>
    </section>
  )
}
