import {
  BarChart3,
  CircleDollarSign,
  Download,
  LoaderCircle,
  TrendingUp,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  getAnalyticsBets,
  getCapperGrades,
  getCards,
  downloadBackup,
  type Bet,
  type CapperGrade,
  type Card,
} from '../api'

interface CardLedger {
  card: Card
  bets: Bet[]
}

interface PerformanceRow {
  label: string
  bets: number
  stake: number
  gross: number
  net: number
  roi: number | null
}

function performanceRows(
  ledgers: CardLedger[],
  key: (bet: Bet) => string,
): PerformanceRow[] {
  const groups = new Map<string, Omit<PerformanceRow, 'label' | 'roi'>>()
  for (const { bets } of ledgers) {
    for (const bet of bets.filter((item) => item.state === 'settled')) {
      const label = key(bet)
      const current = groups.get(label) ?? {
        bets: 0,
        stake: 0,
        gross: 0,
        net: 0,
      }
      const stake = Number(bet.stakeUnits ?? 0)
      const net = Number(bet.netProfitUnits ?? 0)
      current.bets += 1
      current.stake += stake
      current.gross += stake + net
      current.net += net
      groups.set(label, current)
    }
  }
  return [...groups.entries()]
    .map(([label, row]) => ({
      label,
      ...row,
      roi: row.stake === 0 ? null : row.net / row.stake,
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

export function BankrollWorkspace() {
  const [ledgers, setLedgers] = useState<CardLedger[]>([])
  const [capperGrades, setCapperGrades] = useState<CapperGrade[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getCards(), getCapperGrades(), getAnalyticsBets()])
      .then(([cards, grades, bets]) => ({
        grades,
        ledgers: cards.map((card) => ({
          card,
          bets: bets.filter((bet) => bet.cardId === card.id),
        })),
      }))
      .then(({ grades, ledgers: nextLedgers }) => {
        setCapperGrades(grades)
        setLedgers(nextLedgers)
      })
      .catch((requestError: unknown) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Bankroll could not be loaded',
        ),
      )
      .finally(() => setLoading(false))
  }, [])

  const filteredLedgers = useMemo(
    () =>
      ledgers.filter(({ card }) => {
        const date = (card.eventStartsAtUtc ?? card.createdAt).slice(0, 10)
        return (!fromDate || date >= fromDate) && (!toDate || date <= toDate)
      }),
    [fromDate, ledgers, toDate],
  )

  const totals = useMemo(() => {
    let settledStake = 0
    let netUnits = 0
    let netCents = 0
    let settledBets = 0
    let grossUnits = 0
    for (const { card, bets } of filteredLedgers) {
      for (const bet of bets.filter((item) => item.state === 'settled')) {
        const profit = Number(bet.netProfitUnits ?? 0)
        settledStake += Number(bet.stakeUnits ?? 0)
        netUnits += profit
        grossUnits += Number(bet.stakeUnits ?? 0) + profit
        netCents += profit * card.unitValueCents
        settledBets += 1
      }
    }
    return {
      settledStake,
      netUnits,
      grossUnits,
      netCents,
      settledBets,
      roi: settledStake === 0 ? 0 : netUnits / settledStake,
    }
  }, [filteredLedgers])

  const breakdowns = useMemo(
    () => [
      {
        title: 'Origin',
        rows: performanceRows(filteredLedgers, (bet) => bet.origin),
      },
      {
        title: 'Tier',
        rows: performanceRows(filteredLedgers, (bet) => bet.tier),
      },
      {
        title: 'Market',
        rows: performanceRows(filteredLedgers, (bet) =>
          bet.marketType.replaceAll('_', ' '),
        ),
      },
    ],
    [filteredLedgers],
  )

  const cumulative = useMemo(() => {
    const ordered = [...filteredLedgers].sort((left, right) =>
      (left.card.eventStartsAtUtc ?? left.card.createdAt).localeCompare(
        right.card.eventStartsAtUtc ?? right.card.createdAt,
      ),
    )
    return ordered.reduce<Array<{ card: Card; running: number }>>(
      (points, { card, bets }) => {
        const running =
          (points.at(-1)?.running ?? 0) +
          bets
            .filter((bet) => bet.state === 'settled')
            .reduce((sum, bet) => sum + Number(bet.netProfitUnits ?? 0), 0)
        return [...points, { card, running }]
      },
      [],
    )
  }, [filteredLedgers])

  const handleBackup = async () => {
    setDownloading(true)
    setError(null)
    try {
      await downloadBackup()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Backup could not be downloaded',
      )
    } finally {
      setDownloading(false)
    }
  }

  return (
    <section className="workspace-stack">
      {error && <p className="form-message form-message--error">{error}</p>}
      {loading ? (
        <div className="empty-state">
          <LoaderCircle className="spin" size={24} />
          <p>Loading bankroll</p>
        </div>
      ) : (
        <>
          <div className="analytics-toolbar">
            <div className="date-filter">
              <label className="field">
                <span>From card date</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </label>
              <label className="field">
                <span>To card date</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </label>
            </div>
            <button
              className="button button--secondary"
              type="button"
              disabled={downloading}
              onClick={() => void handleBackup()}
            >
              {downloading ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Download size={16} />
              )}
              Download backup
            </button>
          </div>
          <div className="metric-grid">
            <article className="metric-card">
              <div className="icon-tile icon-tile--warm">
                <TrendingUp size={18} />
              </div>
              <span>Net result</span>
              <strong>
                {totals.netUnits >= 0 ? '+' : ''}
                {totals.netUnits.toFixed(2)}u
              </strong>
              <small>
                {totals.netCents >= 0 ? '+' : '-'}$
                {Math.abs(totals.netCents / 100).toFixed(2)} AUD
              </small>
            </article>
            <article className="metric-card">
              <div className="icon-tile">
                <BarChart3 size={18} />
              </div>
              <span>Settled ROI</span>
              <strong>{(totals.roi * 100).toFixed(1)}%</strong>
              <small>{totals.settledStake.toFixed(2)}u settled stake</small>
            </article>
            <article className="metric-card">
              <div className="icon-tile">
                <CircleDollarSign size={18} />
              </div>
              <span>Settled bets</span>
              <strong>{totals.settledBets}</strong>
              <small>Pending and skipped bets excluded</small>
            </article>
          </div>

          <div className="records-card">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Actual settled results</p>
                <h2>Running bankroll</h2>
              </div>
              <span className="quiet-badge">
                {totals.grossUnits.toFixed(2)}u gross return
              </span>
            </div>
            {cumulative.length === 0 ? (
              <div className="empty-state empty-state--compact">
                <TrendingUp size={22} />
                <p>No cards in this date range</p>
              </div>
            ) : (
              <div
                className="bankroll-chart"
                aria-label="Cumulative profit by card"
              >
                {cumulative.map(({ card, running }) => (
                  <div className="bankroll-chart__point" key={card.id}>
                    <span>{card.name}</span>
                    <div
                      className={running >= 0 ? 'positive' : 'negative'}
                      style={{
                        width: `${Math.max(4, Math.min(100, Math.abs(running) * 8))}%`,
                      }}
                    />
                    <strong>
                      {running >= 0 ? '+' : ''}
                      {running.toFixed(2)}u
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="records-card">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Reconciled history</p>
                <h2>Card performance</h2>
              </div>
              <span className="quiet-badge">
                {filteredLedgers.length} cards
              </span>
            </div>
            {filteredLedgers.length === 0 ? (
              <div className="empty-state">
                <BarChart3 size={24} />
                <p>No cards yet</p>
              </div>
            ) : (
              <div className="record-list">
                {filteredLedgers.map(({ card, bets }) => {
                  const settled = bets.filter((bet) => bet.state === 'settled')
                  const stake = settled.reduce(
                    (sum, bet) => sum + Number(bet.stakeUnits ?? 0),
                    0,
                  )
                  const net = settled.reduce(
                    (sum, bet) => sum + Number(bet.netProfitUnits ?? 0),
                    0,
                  )
                  const gross = stake + net
                  return (
                    <article className="bankroll-row" key={card.id}>
                      <div>
                        <strong>{card.name}</strong>
                        <span>{settled.length} settled bets</span>
                      </div>
                      <div>
                        <span>Stake</span>
                        <strong>{stake.toFixed(2)}u</strong>
                      </div>
                      <div>
                        <span>Gross / net</span>
                        <strong className={net >= 0 ? 'positive' : 'negative'}>
                          {gross.toFixed(2)}u / {net >= 0 ? '+' : ''}
                          {net.toFixed(2)}u
                        </strong>
                      </div>
                      <div>
                        <span>ROI</span>
                        <strong>
                          {stake === 0
                            ? '—'
                            : `${((net / stake) * 100).toFixed(1)}%`}
                        </strong>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          <div className="analytics-grid">
            {breakdowns.map((breakdown) => (
              <div className="records-card" key={breakdown.title}>
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">Settled performance</p>
                    <h2>By {breakdown.title.toLowerCase()}</h2>
                  </div>
                </div>
                {breakdown.rows.length === 0 ? (
                  <div className="empty-state empty-state--compact">
                    <BarChart3 size={20} />
                    <p>No settled bets</p>
                  </div>
                ) : (
                  <div className="performance-table">
                    {breakdown.rows.map((row) => (
                      <div className="performance-row" key={row.label}>
                        <strong>{row.label}</strong>
                        <span>{row.bets} bets</span>
                        <span>{row.stake.toFixed(2)}u staked</span>
                        <span>{row.gross.toFixed(2)}u returned</span>
                        <strong
                          className={row.net >= 0 ? 'positive' : 'negative'}
                        >
                          {row.net >= 0 ? '+' : ''}
                          {row.net.toFixed(2)}u ·{' '}
                          {row.roi === null
                            ? '—'
                            : `${(row.roi * 100).toFixed(1)}%`}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="records-card">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Reviewed calls only</p>
                <h2>Capper accuracy</h2>
              </div>
              <span className="quiet-badge">
                {capperGrades.length} graded cappers
              </span>
            </div>
            {capperGrades.length === 0 ? (
              <div className="empty-state empty-state--compact">
                <BarChart3 size={22} />
                <p>No resolvable winner calls yet</p>
                <span>
                  Record official fight results to grade accepted opinions.
                </span>
              </div>
            ) : (
              <div className="record-list">
                {capperGrades.map((grade) => (
                  <article className="bankroll-row" key={grade.capperId}>
                    <div>
                      <strong>{grade.capperName}</strong>
                      <span>
                        {grade.winnerCallsGraded} winner calls ·{' '}
                        {grade.pricedTipsGraded === 0
                          ? 'no priced tips'
                          : `${grade.pricedTipsGraded} priced tips · ${((grade.tipRoiAtStatedOdds ?? 0) * 100).toFixed(1)}% stated-price ROI`}
                      </span>
                    </div>
                    <div>
                      <span>Winner</span>
                      <strong>
                        {grade.winnerHits}/{grade.winnerCallsGraded} ·{' '}
                        {((grade.winnerHitRate ?? 0) * 100).toFixed(0)}%
                      </strong>
                    </div>
                    <div>
                      <span>Method</span>
                      <strong>
                        {grade.methodCallsGraded === 0
                          ? '—'
                          : `${grade.methodHits}/${grade.methodCallsGraded} · ${((grade.methodHitRate ?? 0) * 100).toFixed(0)}%`}
                      </strong>
                    </div>
                    <div>
                      <span>Round</span>
                      <strong>
                        {grade.roundCallsGraded === 0
                          ? '—'
                          : `${grade.roundHits}/${grade.roundCallsGraded} · ${((grade.roundHitRate ?? 0) * 100).toFixed(0)}%`}
                      </strong>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
