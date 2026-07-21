import { describe, expect, it } from 'vitest'
import type { BetRecord } from '../../src/server/repositories/bets'
import type { FightOutcomeRecord } from '../../src/server/repositories/outcomes'
import { proposeBetResolutions } from '../../src/server/services/result-resolution'

function bet(overrides: Partial<BetRecord> = {}): BetRecord {
  return {
    id: 'bet-1',
    cardId: 'card-1',
    synthesisRunId: null,
    origin: 'manual',
    tier: 'manual',
    marketType: 'moneyline',
    fightId: 'fight-1',
    selectionFighterId: 'fighter-a',
    method: null,
    round: null,
    lineValue: null,
    selectionText: 'Fighter A',
    recommendedUnits: null,
    recommendedOdds: null,
    consensusShare: null,
    rationale: null,
    state: 'placed',
    oddsTaken: '2.0000',
    settlementOdds: null,
    stakeUnits: '1.00',
    result: 'pending',
    netProfitUnits: null,
    settledAt: null,
    notes: null,
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
    legs: [],
    ...overrides,
  }
}

function outcome(
  overrides: Partial<FightOutcomeRecord> = {},
): FightOutcomeRecord {
  return {
    fightId: 'fight-1',
    status: 'winner',
    winnerFighterId: 'fighter-a',
    method: 'decision',
    round: '5',
    recordedAt: null,
    sourceProvider: 'ufc',
    sourceUrl: 'https://www.ufc.com/event/example',
    fetchedAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
    ...overrides,
  }
}

function result(inputBet: BetRecord, inputOutcome = outcome()) {
  return proposeBetResolutions([inputBet], [inputOutcome])[0]
}

describe('deterministic result resolution', () => {
  it.each([
    ['selected winner', bet(), outcome(), 'won'],
    [
      'selected loser',
      bet(),
      outcome({ winnerFighterId: 'fighter-b' }),
      'lost',
    ],
    [
      'draw moneyline',
      bet(),
      outcome({ status: 'draw', winnerFighterId: null }),
      'void',
    ],
    [
      'no contest',
      bet(),
      outcome({ status: 'no_contest', winnerFighterId: null }),
      'void',
    ],
    [
      'cancelled',
      bet(),
      outcome({ status: 'cancelled', winnerFighterId: null }),
      'void',
    ],
  ] as const)('%s', (_label, inputBet, inputOutcome, expected) => {
    expect(result(inputBet, inputOutcome)?.result).toBe(expected)
  })

  it('grades winner-by-method, exact-round, and inside-distance targets', () => {
    expect(
      result(bet({ marketType: 'method', method: 'decision' }))?.result,
    ).toBe('won')
    expect(result(bet({ marketType: 'round', round: '4' }))?.result).toBe(
      'lost',
    )
    expect(
      result(
        bet({ marketType: 'prop', lineValue: 'inside_distance' }),
        outcome({ method: 'submission', round: '3' }),
      )?.result,
    ).toBe('won')
  })

  it.each([outcome({ status: 'overturned' }), outcome({ method: null })])(
    'keeps ambiguous or incomplete grading manual',
    (inputOutcome) => {
      const proposal = result(
        bet({ marketType: 'fight_prop', lineValue: 'free_text' }),
        inputOutcome,
      )
      expect(proposal?.result).toBeNull()
      expect(proposal?.requiresManualReview).toBe(true)
    },
  )

  it('preserves legacy unstructured bets for manual settlement', () => {
    const proposal = result(bet({ fightId: null, selectionFighterId: null }))
    expect(proposal).toMatchObject({ result: null, requiresManualReview: true })
  })

  it('resolves complete parlays and requires confirmed odds after a void leg', () => {
    const parlay = bet({
      legs: [
        {
          id: 'leg-a',
          fightId: 'fight-1',
          marketType: 'moneyline',
          selectionFighterId: 'fighter-a',
          method: null,
          round: null,
          lineValue: null,
          selectionText: 'Fighter A',
          legResult: 'pending',
        },
        {
          id: 'leg-b',
          fightId: 'fight-2',
          marketType: 'moneyline',
          selectionFighterId: 'fighter-b',
          method: null,
          round: null,
          lineValue: null,
          selectionText: 'Fighter B',
          legResult: 'pending',
        },
      ],
    })
    const won = proposeBetResolutions(
      [parlay],
      [
        outcome(),
        outcome({ fightId: 'fight-2', winnerFighterId: 'fighter-b' }),
      ],
    )[0]
    expect(won?.result).toBe('won')

    const partialVoid = proposeBetResolutions(
      [parlay],
      [
        outcome(),
        outcome({
          fightId: 'fight-2',
          status: 'no_contest',
          winnerFighterId: null,
        }),
      ],
    )[0]
    expect(partialVoid).toMatchObject({
      result: null,
      requiresManualReview: true,
    })
  })
})
