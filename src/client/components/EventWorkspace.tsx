import { ExternalLink, LoaderCircle, Radar, Save } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import {
  discoverCardPreview,
  getCardSourceLinks,
  putCardSourceLink,
  type CardFetchPreview,
  type CardSourceLink,
} from '../api'
import { errorMessage } from '../format'
import { useCards } from '../use-cards'
import { CardWorkspace } from './CardWorkspace'
import { OddsBoardWorkspace } from './OddsBoardWorkspace'

export function EventWorkspace() {
  const { cards, selectedCardId, cardsLoaded } = useCards()
  const [links, setLinks] = useState<CardSourceLink[]>([])
  const [discovery, setDiscovery] = useState<CardFetchPreview | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const autoDiscoveryAttempted = useRef(false)
  const visibleLinks = links.filter((link) => link.cardId === selectedCardId)

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
      .then(setDiscovery)
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
      setDiscovery(await discoverCardPreview())
    } catch (requestError) {
      setMessage(
        errorMessage(requestError, 'Automatic discovery was unavailable'),
      )
    } finally {
      setDiscovering(false)
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
      for (const provider of ['ufc', 'tapology'] as const) {
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
              UFC.com is checked first; Tapology is the fallback. Every fetched
              card remains a preview until you import or merge it below.
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
              <span className="quiet-badge">{discovery.provider}</span>
              <strong>{discovery.event_name ?? 'Upcoming UFC event'}</strong>
              <span>
                {discovery.bouts.length} bouts found · review before import
              </span>
            </div>
            <a href={discovery.source_url} target="_blank" rel="noreferrer">
              Open source <ExternalLink size={14} />
            </a>
            <label className="field field--wide">
              <span>Discovered event URL</span>
              <input readOnly value={discovery.source_url} />
              <small>
                Paste this into the import form below to review the full diff.
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
            <label className="field">
              <span>UFC.com event URL</span>
              <input
                name="ufcUrl"
                type="url"
                defaultValue={
                  visibleLinks.find((link) => link.provider === 'ufc')?.url ??
                  ''
                }
                placeholder="https://www.ufc.com/event/…"
              />
            </label>
            <label className="field">
              <span>Tapology event URL</span>
              <input
                name="tapologyUrl"
                type="url"
                defaultValue={
                  visibleLinks.find((link) => link.provider === 'tapology')
                    ?.url ?? ''
                }
                placeholder="https://www.tapology.com/fightcenter/events/…"
              />
            </label>
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
