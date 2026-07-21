import type { BetRecord } from '../repositories/bets'
import type { FightOutcomeRecord } from '../repositories/outcomes'

export type ProposedBetResult = 'won' | 'lost' | 'push' | 'void'

export interface BetResolutionProposal {
  betId: string
  result: ProposedBetResult | null
  reason: string
  requiresManualReview: boolean
  legProposals: Array<{
    legId: string
    result: ProposedBetResult | null
    reason: string
    requiresManualReview: boolean
  }>
}

type SettlementTarget = {
  legId: string | null
  fightId: string
  marketType: string
  selectionFighterId: string | null
  method: string | null
  round: string | null
  lineValue: string | null
}

function resolveTarget(
  target: SettlementTarget,
  outcome: FightOutcomeRecord | undefined,
): { result: ProposedBetResult | null; reason: string } {
  if (!outcome || outcome.status === 'pending')
    return { result: null, reason: 'Official result is still pending' }
  if (outcome.status === 'overturned')
    return {
      result: null,
      reason: 'Overturned results require bookmaker review',
    }
  if (outcome.status === 'no_contest' || outcome.status === 'cancelled')
    return { result: 'void', reason: 'Fight was not completed as scheduled' }
  if (outcome.status === 'draw') {
    return target.marketType === 'moneyline'
      ? { result: 'void', reason: 'Moneyline proposed void after a draw' }
      : {
          result: null,
          reason: 'Draw prop settlement depends on bookmaker rules',
        }
  }
  if (!target.selectionFighterId)
    return { result: null, reason: 'Bet has no structured fighter selection' }
  const selectedWinner = outcome.winnerFighterId === target.selectionFighterId
  if (target.marketType === 'moneyline')
    return {
      result: selectedWinner ? 'won' : 'lost',
      reason: selectedWinner ? 'Selected fighter won' : 'Selected fighter lost',
    }
  if (target.marketType === 'method')
    return {
      result:
        selectedWinner && outcome.method === target.method ? 'won' : 'lost',
      reason: 'Compared winner and official method',
    }
  if (target.marketType === 'round')
    return {
      result: selectedWinner && outcome.round === target.round ? 'won' : 'lost',
      reason: 'Compared winner and official round',
    }
  if (target.marketType === 'prop' && target.lineValue === 'inside_distance')
    return {
      result:
        selectedWinner && outcome.method && outcome.method !== 'decision'
          ? 'won'
          : 'lost',
      reason: 'Compared winner and whether the result was inside the distance',
    }
  return { result: null, reason: 'This market requires manual grading' }
}

export function proposeBetResolutions(
  bets: BetRecord[],
  outcomes: FightOutcomeRecord[],
): BetResolutionProposal[] {
  const outcomeByFight = new Map(
    outcomes.map((outcome) => [outcome.fightId, outcome]),
  )
  return bets
    .filter((bet) => bet.state === 'placed')
    .map((bet) => {
      const targets: SettlementTarget[] =
        bet.legs.length > 0
          ? bet.legs.map((leg) => ({
              legId: leg.id,
              fightId: leg.fightId,
              marketType: leg.marketType,
              selectionFighterId: leg.selectionFighterId,
              method: leg.method,
              round: leg.round,
              lineValue: leg.lineValue,
            }))
          : bet.fightId
            ? [
                {
                  legId: null,
                  fightId: bet.fightId,
                  marketType: bet.marketType,
                  selectionFighterId: bet.selectionFighterId,
                  method: bet.method,
                  round: bet.round,
                  lineValue: bet.lineValue,
                },
              ]
            : []
      if (targets.length === 0)
        return {
          betId: bet.id,
          result: null,
          reason: 'Legacy bet has no structured fight reference',
          requiresManualReview: true,
          legProposals: [],
        }
      const legResults = targets.map((target) =>
        resolveTarget(target, outcomeByFight.get(target.fightId)),
      )
      const legProposals = targets.flatMap((target, index) =>
        target.legId
          ? [
              {
                legId: target.legId,
                result: legResults[index]?.result ?? null,
                reason: legResults[index]?.reason ?? 'Manual review required',
                requiresManualReview: legResults[index]?.result === null,
              },
            ]
          : [],
      )
      if (legResults.some((leg) => leg.result === 'lost'))
        return {
          betId: bet.id,
          result: 'lost',
          reason: 'At least one structured leg lost',
          requiresManualReview: false,
          legProposals,
        }
      if (legResults.some((leg) => leg.result === null))
        return {
          betId: bet.id,
          result: null,
          reason:
            legResults.find((leg) => leg.result === null)?.reason ??
            'Manual review required',
          requiresManualReview: true,
          legProposals,
        }
      if (legResults.every((leg) => leg.result === 'void'))
        return {
          betId: bet.id,
          result: 'void',
          reason: 'Every structured leg was void',
          requiresManualReview: false,
          legProposals,
        }
      if (legResults.some((leg) => leg.result === 'void'))
        return {
          betId: bet.id,
          result: null,
          reason:
            'A void parlay leg requires confirmed adjusted settlement odds',
          requiresManualReview: true,
          legProposals,
        }
      return {
        betId: bet.id,
        result: 'won',
        reason:
          targets.length > 1
            ? 'Every structured leg won'
            : (legResults[0]?.reason ?? 'Won'),
        requiresManualReview: false,
        legProposals,
      }
    })
}
