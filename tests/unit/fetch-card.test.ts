import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCardPreview } from '../../src/server/services/fetch-card'

afterEach(() => vi.unstubAllGlobals())

describe('UFC event page preview', () => {
  it('deterministically extracts every bout and displayed price from UFC markup', async () => {
    const fixture = await readFile(
      new URL('../fixtures/ufc-event-multiple-odds.html', import.meta.url),
      'utf8',
    )
    const fetchMock = vi.fn().mockResolvedValue(new Response(fixture))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchCardPreview(
        { DB: {} as D1Database },
        'https://www.ufc.com/event/ufc-fight-night-july-25-2026',
      ),
    ).resolves.toEqual({
      event_name: 'UFC Fight Night: Ankalaev vs Guskov',
      event_starts_at_raw: '2026-07-25T16:00:00.000Z',
      bouts: [
        {
          fighter_a: 'Magomed Ankalaev',
          fighter_b: 'Bogdan Guskov',
          fighter_a_odds_raw: '-450',
          fighter_b_odds_raw: '+350',
          weight_class: 'Light Heavyweight',
          bout_order: 1,
          is_main_event: true,
        },
        {
          fighter_a: 'Steve Erceg',
          fighter_b: 'Ramazan Temirov',
          fighter_a_odds_raw: '-130',
          fighter_b_odds_raw: '+110',
          weight_class: 'Flyweight',
          bout_order: 2,
          is_main_event: false,
        },
        {
          fighter_a: 'Uran Satybaldiev',
          fighter_b: 'Dustin Jacoby',
          fighter_a_odds_raw: null,
          fighter_b_odds_raw: null,
          weight_class: 'Light Heavyweight',
          bout_order: 3,
          is_main_event: false,
        },
      ],
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('prefers structured event data without calling an LLM', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          `<html><script type="application/ld+json">${JSON.stringify({
            '@type': 'SportsEvent',
            name: 'UFC Fixture Night',
            startDate: '2026-07-19T02:00:00Z',
            subEvent: [
              {
                competitor: [{ name: 'Fighter One' }, { name: 'Fighter Two' }],
              },
            ],
          })}</script></html>`,
          { status: 200 },
        ),
      ),
    )

    await expect(
      fetchCardPreview(
        { DB: {} as D1Database },
        'https://www.ufc.com/event/fixture',
      ),
    ).resolves.toMatchObject({
      event_name: 'UFC Fixture Night',
      bouts: [
        {
          fighter_a: 'Fighter One',
          fighter_b: 'Fighter Two',
          fighter_a_odds_raw: null,
          fighter_b_odds_raw: null,
          bout_order: 1,
          is_main_event: true,
        },
      ],
    })
  })

  it('rejects non-UFC and non-HTTPS URLs before fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      fetchCardPreview({ DB: {} as D1Database }, 'https://example.com/private'),
    ).rejects.toThrow(/UFC\.com/)
    await expect(
      fetchCardPreview(
        { DB: {} as D1Database },
        'http://ufc.com/event/insecure',
      ),
    ).rejects.toThrow(/HTTPS/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retains explicitly displayed page odds as raw review data', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          '<html><body>Fighter One vs Fighter Two -245 odds +200</body></html>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    event_name: 'UFC Odds Fixture',
                    event_starts_at_raw: null,
                    bouts: [
                      {
                        fighter_a: 'Fighter One',
                        fighter_b: 'Fighter Two',
                        fighter_a_odds_raw: '-245',
                        fighter_b_odds_raw: '+200',
                        weight_class: null,
                        bout_order: 1,
                        is_main_event: true,
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchCardPreview(
        { DB: {} as D1Database },
        'https://www.ufc.com/event/odds-fixture',
        {
          provider: 'openrouter',
          model: 'fixture/model',
          apiKey: 'fixture-key',
        },
      ),
    ).resolves.toMatchObject({
      bouts: [
        {
          fighter_a_odds_raw: '-245',
          fighter_b_odds_raw: '+200',
        },
      ],
    })
  })
})
