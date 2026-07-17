import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCardPreview } from '../../src/server/services/fetch-card'

afterEach(() => vi.unstubAllGlobals())

describe('UFC event page preview', () => {
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
})
