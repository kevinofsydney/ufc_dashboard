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
      provider: 'ufc',
      source_url: 'https://www.ufc.com/event/ufc-fight-night-july-25-2026',
      field_provenance: {
        event_name: 'ufc',
        event_starts_at_raw: 'ufc',
        bouts: 'ufc',
      },
      conflicts: [],
      warnings: [],
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

  it('rejects unsupported and non-HTTPS URLs before fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      fetchCardPreview({ DB: {} as D1Database }, 'https://example.com/private'),
    ).rejects.toThrow(/BetMMA, UFC\.com or Tapology/)
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

  it('extracts every BetMMA bout and decimal price without calling an LLM', async () => {
    const fixture = await readFile(
      new URL('../fixtures/betmma-next-event.html', import.meta.url),
      'utf8',
    )
    const fetchMock = vi.fn().mockResolvedValue(new Response(fixture))
    vi.stubGlobal('fetch', fetchMock)

    const preview = await fetchCardPreview(
      { DB: {} as D1Database },
      'https://www.betmma.tips/next_ufc_event.php',
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(preview).toMatchObject({
      provider: 'betmma',
      source_url: 'https://www.betmma.tips/next_ufc_event.php',
      conflicts: [],
      event_name: 'UFC Fight Night: Ankalaev vs. Guskov',
      event_starts_at_raw: '2026-07-25',
      bouts: [
        {
          fighter_a: 'Magomed Ankalaev',
          fighter_b: 'Bogdan Guskov',
          fighter_a_odds_raw: '1.20',
          fighter_b_odds_raw: '5.38',
          // BetMMA states 265lbs, but both fighters are listed at 205lbs.
          weight_class: 'Light Heavyweight',
          bout_order: 1,
          is_main_event: true,
        },
        {
          fighter_a: 'Steve Erceg',
          fighter_b: 'Ramazan Temurov',
          fighter_a_odds_raw: '2.00',
          fighter_b_odds_raw: '2.00',
          weight_class: 'Flyweight',
          bout_order: 2,
          is_main_event: false,
        },
        {
          // This bout's odds row was removed from the fixture: the prices must
          // read as absent rather than borrowing another bout's numbers.
          fighter_a: 'Rizvan Kuniev',
          fighter_b: 'Tyrell Fortune',
          fighter_a_odds_raw: null,
          fighter_b_odds_raw: null,
          bout_order: 3,
          is_main_event: false,
        },
      ],
    })
  })

  it('keeps last-fight opponents and page prose out of the BetMMA bouts', async () => {
    const fixture = await readFile(
      new URL('../fixtures/betmma-next-event.html', import.meta.url),
      'utf8',
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(fixture)))

    const preview = await fetchCardPreview(
      { DB: {} as D1Database },
      'https://www.betmma.tips/next_ufc_event.php',
    )

    // Last-fight opponents are linked with the same fighter_profile.php URL as
    // the competitors themselves.
    const named = preview.bouts.flatMap((bout) => [
      bout.fighter_a,
      bout.fighter_b,
    ])
    expect(named).not.toContain('Alex Pereira')
    expect(named).not.toContain('Jan Blachowicz')
    expect(named).not.toContain('Tim Elliott')

    // The fight-facts prose above the card quotes the biggest underdog at
    // @8.50, which must never be read as a bout price.
    expect(fixture).toContain('@8.50')
    const prices = preview.bouts.flatMap((bout) => [
      bout.fighter_a_odds_raw,
      bout.fighter_b_odds_raw,
    ])
    expect(prices).not.toContain('8.50')
  })

  it('prefers the fighters’ agreed weight over a contradictory BetMMA fight weight', async () => {
    const fixture = await readFile(
      new URL('../fixtures/betmma-next-event.html', import.meta.url),
      'utf8',
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(fixture)))

    const preview = await fetchCardPreview(
      { DB: {} as D1Database },
      'https://www.betmma.tips/next_ufc_event.php',
    )

    expect(preview.conflicts).toEqual([])

    // Both fighters are listed at 205lbs against a stated 265lbs fight weight,
    // so the bout is a Light Heavyweight one and the override is reported.
    expect(preview.bouts[0]?.weight_class).toBe('Light Heavyweight')
    expect(
      preview.warnings.some(
        (warning) =>
          warning.includes('Magomed Ankalaev') &&
          warning.includes('205lbs, not 265lbs'),
      ),
    ).toBe(true)

    // Kuniev vs Fortune is a genuine heavyweight bout whose fighters weigh
    // 265lbs and 249lbs, so the stated fight weight must stand.
    expect(preview.bouts[2]?.weight_class).toBe('Heavyweight')
    expect(
      preview.warnings.some((warning) => warning.includes('Rizvan Kuniev')),
    ).toBe(false)

    expect(
      preview.warnings.some((warning) => warning.includes('start time')),
    ).toBe(true)
  })

  it('extracts a Tapology card without calling an LLM', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(`
          <html><head><title>UFC Fixture: Alpha vs Beta</title></head><body>
            <div class="fightCardBout">
              <span class="fightCardFighterName">Alpha Fighter</span>
              <span class="fightOdds">-125</span>
              <span class="fightCardFighterName">Beta Fighter</span>
              <span class="fightOdds">+105</span>
            </div>
          </body></html>
        `),
      ),
    )

    await expect(
      fetchCardPreview(
        { DB: {} as D1Database },
        'https://www.tapology.com/fightcenter/events/fixture',
      ),
    ).resolves.toMatchObject({
      provider: 'tapology',
      event_name: 'UFC Fixture: Alpha vs Beta',
      bouts: [
        {
          fighter_a: 'Alpha Fighter',
          fighter_b: 'Beta Fighter',
          fighter_a_odds_raw: '-125',
          fighter_b_odds_raw: '+105',
        },
      ],
    })
  })
})
