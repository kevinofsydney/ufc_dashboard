import type { Fight } from './api'

export type PickType =
  | 'moneyline'
  | 'inside_distance'
  | 'ko_tko'
  | 'submission'
  | 'decision'
  | `round_${1 | 2 | 3 | 4 | 5}`

export interface PickTypeOption {
  value: PickType
  label: string
}

const standardPickTypes: PickTypeOption[] = [
  { value: 'moneyline', label: 'Moneyline (ML)' },
  { value: 'inside_distance', label: 'Inside the distance' },
  { value: 'ko_tko', label: 'KO / TKO' },
  { value: 'submission', label: 'Submission' },
  { value: 'decision', label: 'Decision' },
]

export function pickTypeOptionsForFight(fight: Fight): PickTypeOption[] {
  const scheduledRounds = fight.isMainEvent ? 5 : 3
  return [
    ...standardPickTypes,
    ...Array.from({ length: scheduledRounds }, (_, index) => {
      const round = (index + 1) as 1 | 2 | 3 | 4 | 5
      return {
        value: `round_${round}` as PickType,
        label: `Round ${round}`,
      }
    }),
  ]
}

export function buildBetSelection(
  fight: Fight,
  fighterId: string,
  pickType: PickType,
): {
  marketType: 'moneyline' | 'method' | 'round' | 'prop'
  selectionText: string
} | null {
  const fighter = [fight.fighterA, fight.fighterB].find(
    (participant) => participant.id === fighterId,
  )
  if (!fighter) return null

  if (pickType === 'moneyline') {
    return { marketType: 'moneyline', selectionText: `${fighter.name} ML` }
  }
  if (pickType === 'inside_distance') {
    return {
      marketType: 'prop',
      selectionText: `${fighter.name} Inside the Distance`,
    }
  }
  if (pickType === 'ko_tko') {
    return { marketType: 'method', selectionText: `${fighter.name} by KO/TKO` }
  }
  if (pickType === 'submission') {
    return {
      marketType: 'method',
      selectionText: `${fighter.name} by Submission`,
    }
  }
  if (pickType === 'decision') {
    return {
      marketType: 'method',
      selectionText: `${fighter.name} by Decision`,
    }
  }

  const round = Number(pickType.replace('round_', ''))
  const maximumRound = fight.isMainEvent ? 5 : 3
  if (!Number.isInteger(round) || round < 1 || round > maximumRound) return null
  return {
    marketType: 'round',
    selectionText: `${fighter.name} in Round ${round}`,
  }
}
