import { Check, Download, FileUp, LoaderCircle } from 'lucide-react'
import { type ChangeEvent, useState } from 'react'
import {
  getFights,
  importTipCsv,
  previewTipCsv,
  type TipCsvPreview,
} from '../api'
import { errorMessage } from '../format'
import { tipCsvTemplate } from '../../shared/tip-csv'

function downloadCsv(contents: string) {
  const url = URL.createObjectURL(
    new Blob([contents], { type: 'text/csv;charset=utf-8' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'fightfolio-tipper-picks.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

export function StructuredTipCsvPanel({
  cardId,
  onImported,
}: {
  cardId: string
  onImported: () => void | Promise<void>
}) {
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<TipCsvPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{
    kind: 'success' | 'error'
    text: string
  } | null>(null)

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.name.toLocaleLowerCase().endsWith('.csv')) {
      setMessage({ kind: 'error', text: 'Choose a .csv tip file.' })
      return
    }
    const contents = await file.text()
    setCsv(contents)
    setFileName(file.name)
    setPreview(null)
    setMessage(null)
  }

  const handleTemplate = async () => {
    try {
      downloadCsv(tipCsvTemplate(cardId ? await getFights(cardId) : []))
    } catch (requestError) {
      setMessage({
        kind: 'error',
        text: errorMessage(
          requestError,
          'The tip template could not be created',
        ),
      })
    }
  }

  const handlePreview = async () => {
    setBusy(true)
    setMessage(null)
    try {
      setPreview(await previewTipCsv(cardId, csv))
    } catch (requestError) {
      setMessage({
        kind: 'error',
        text: errorMessage(requestError, 'The tip CSV could not be previewed'),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await importTipCsv(cardId, csv)
      setMessage({
        kind: 'success',
        text: `Accepted ${result.importedTips} structured tip${result.importedTips === 1 ? '' : 's'}.`,
      })
      setPreview(null)
      setCsv('')
      setFileName('')
      await onImported()
    } catch (requestError) {
      setMessage({
        kind: 'error',
        text: errorMessage(requestError, 'The tip CSV could not be imported'),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="csv-import-card tip-csv-card"
      aria-labelledby="tip-csv-title"
    >
      <div className="csv-import-card__heading">
        <FileUp size={20} aria-hidden="true" />
        <div>
          <h3 id="tip-csv-title">Upload structured tip CSV</h3>
          <p>
            Use one row for each explicit tip, such as a moneyline,
            inside-distance, method, or exact-round pick. Mentioned odds remain
            source evidence.
          </p>
        </div>
      </div>
      <div className="tip-csv-actions">
        <label className="field csv-import-card__file">
          <span>Tip CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy || !cardId}
            onChange={(event) => void handleFile(event)}
          />
          <small>
            Required: capper, fight, selection, market, confidence, reasoning.
          </small>
        </label>
        <button
          className="button button--secondary"
          type="button"
          disabled={!cardId}
          onClick={() => void handleTemplate()}
        >
          <Download size={16} /> Download card template
        </button>
      </div>
      <details className="tip-csv-example">
        <summary>View an inline CSV example</summary>
        <pre>{`capper,fight,selection,market,line,confidence,odds,stake_units,reasoning,source_url
MMA Guru,Max Holloway vs Opponent,Max Holloway,moneyline,,solid,+120,1.5,Better five-round cardio,https://example.com/source`}</pre>
      </details>
      {csv && (
        <div className="csv-import-preview">
          <div className="csv-import-preview__summary">
            <div>
              <strong>{fileName}</strong>
              <span>Ready for exact card matching</span>
            </div>
            <button
              className="button button--secondary button--compact"
              type="button"
              disabled={busy}
              onClick={() => void handlePreview()}
            >
              {busy ? <LoaderCircle className="spin" size={15} /> : null}
              Preview tips
            </button>
          </div>
        </div>
      )}
      {preview && (
        <div className="tip-csv-preview" aria-live="polite">
          <div className="csv-import-list">
            {preview.rows.map((row) => (
              <article
                className={`csv-import-row ${row.issues.length ? 'csv-import-row--duplicate' : ''}`}
                key={row.rowNumber}
              >
                <div className="csv-import-row__copy">
                  <strong>
                    {row.selection} · {row.market}
                  </strong>
                  <span>
                    {row.capper} · {row.fight}
                  </span>
                  {row.willCreateCapper && (
                    <small>New capper will be created</small>
                  )}
                  {row.issues.map((issue) => (
                    <small key={issue}>{issue}</small>
                  ))}
                </div>
                {!row.issues.length && <Check size={18} aria-label="Matched" />}
              </article>
            ))}
          </div>
          {preview.errors.map((error) => (
            <p
              className="form-message form-message--error"
              key={`${error.rowNumber}:${error.message}`}
            >
              Row {error.rowNumber}: {error.message}
            </p>
          ))}
          <button
            className="button button--primary button--full"
            type="button"
            disabled={!preview.canAccept || busy}
            onClick={() => void handleImport()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            Review complete · accept {preview.rows.length} tips
          </button>
        </div>
      )}
      {message && (
        <p className={`form-message form-message--${message.kind}`}>
          {message.text}
        </p>
      )}
    </section>
  )
}
