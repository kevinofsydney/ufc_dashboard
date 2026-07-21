import { describe, expect, it } from 'vitest'
import type { Fight } from '../../src/client/api'
import {
  buildBetSelection,
  pickTypeOptionsForFight,
} from '../../src/client/bet-builder'

function fight(isMainEvent: boolean): Fight {
  return {
    id: 'fight-1',
    cardId: 'card-1',
    fighterA: { id: 'fighter-a', name: 'Tommy McMillen' },
    fighterB: { id: 'fighter-b', name: 'Jordan Example' },
    weightClass: 'Lightweight',
    boutOrder: 1,
    isMainEvent,
    status: 'scheduled',
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
  }
}

describe('manual bet builder', () => {
  it('offers rounds one to three for a standard bout', () => {
    expect(
      pickTypeOptionsForFight(fight(false)).map(({ value }) => value),
    ).toEqual(
      expect.arrayContaining(['moneyline', 'ko_tko', 'round_1', 'round_3']),
    )
    expect(
      pickTypeOptionsForFight(fight(false)).map(({ value }) => value),
    ).not.toContain('round_4')
  })

  it('offers rounds four and five for a main event', () => {
    expect(
      pickTypeOptionsForFight(fight(true)).map(({ value }) => value),
    ).toEqual(expect.arrayContaining(['round_4', 'round_5']))
  })

  it('builds reusable fighter selections without free text', () => {
    expect(
      buildBetSelection(fight(false), 'fighter-a', 'inside_distance'),
    ).toEqual({
      marketType: 'prop',
      method: null,
      round: null,
      lineValue: 'inside_distance',
      selectionText: 'Tommy McMillen Inside the Distance',
    })
    expect(buildBetSelection(fight(false), 'fighter-a', 'round_3')).toEqual({
      marketType: 'round',
      method: null,
      round: '3',
      lineValue: null,
      selectionText: 'Tommy McMillen in Round 3',
    })
  })

  it('rejects an unavailable round and an unrelated fighter', () => {
    expect(buildBetSelection(fight(false), 'fighter-a', 'round_5')).toBeNull()
    expect(buildBetSelection(fight(false), 'unknown', 'moneyline')).toBeNull()
  })
})
