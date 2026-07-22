import { expect, test } from '@playwright/test'
import type {
  Card,
  CardFetchPreview,
  CardSourceLink,
  Fight,
  MarketPrice,
} from '../../src/client/api'

/**
 * Only the outbound BetMMA fetch is stubbed. Card creation, bouts, prices and
 * the source link all run against the real API so the one-click Monday path is
 * exercised end to end.
 */
test('discovers the BetMMA card and imports it with its prices in one click', async ({
  page,
}) => {
  const auditId = Date.now()
  const eventName = `E2E BetMMA Night ${auditId}`
  const preview: CardFetchPreview = {
    provider: 'betmma',
    source_url: 'https://www.betmma.tips/next_ufc_event.php',
    field_provenance: {
      event_name: 'betmma',
      event_starts_at_raw: 'betmma',
      bouts: 'betmma',
    },
    conflicts: [],
    warnings: [
      'BetMMA publishes the event date but not its start time, and does not mark women’s divisions. Confirm the Melbourne start date and time before importing, and confirm weight classes on the card afterward.',
    ],
    event_name: eventName,
    event_starts_at_raw: '2026-07-25',
    bouts: [
      {
        fighter_a: `E2E BetMMA Alpha ${auditId}`,
        fighter_b: `E2E BetMMA Bravo ${auditId}`,
        fighter_a_odds_raw: '1.20',
        fighter_b_odds_raw: '5.38',
        weight_class: 'Light Heavyweight',
        bout_order: 1,
        is_main_event: true,
      },
      {
        fighter_a: `E2E BetMMA Charlie ${auditId}`,
        fighter_b: `E2E BetMMA Delta ${auditId}`,
        fighter_a_odds_raw: '2.00',
        fighter_b_odds_raw: '2.00',
        weight_class: 'Flyweight',
        bout_order: 2,
        is_main_event: false,
      },
    ],
  }
  await page.route('**/api/cards/discover-preview', async (route) => {
    await route.fulfill({ json: { preview } })
  })

  await page.goto('/?step=event')
  await page.getByRole('button', { name: 'Find this weekend’s event' }).click()

  await expect(page.getByText('BetMMA', { exact: true })).toBeVisible()
  await expect(page.getByText(eventName)).toBeVisible()
  await expect(page.getByText('2 bouts found · 2 fully priced')).toBeVisible()
  await expect(page.getByText(/does not mark women’s divisions/)).toBeVisible()

  const importButton = page.getByRole('button', { name: 'Import as new card' })
  await expect(importButton).toBeDisabled()
  await page.getByLabel('Event start in Melbourne').fill('2026-07-26T12:00')
  await expect(importButton).toBeEnabled()

  // BetMMA prices both sides of every bout, so the import is opted in already.
  const oddsToggle = page.getByRole('checkbox', {
    name: /Import BetMMA moneylines/,
  })
  await expect(oddsToggle).toBeChecked()

  await importButton.click()
  // Wait for the confirmation, not the preview: the preview repeats the event
  // name and bout count, so a looser matcher would pass mid-import.
  await expect(page.getByText(/imported with 2 bouts/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Import as new card' }),
  ).toBeHidden()

  const cards = (
    (await (await page.request.get('/api/cards')).json()) as { cards: Card[] }
  ).cards
  const imported = cards.find((card) => card.name === eventName)
  expect(imported).toBeDefined()
  const cardId = (imported as Card).id
  expect((imported as Card).eventStartsAtUtc).toBe('2026-07-26T02:00:00.000Z')

  const fights = (
    (await (await page.request.get(`/api/fights?cardId=${cardId}`)).json()) as {
      fights: Fight[]
    }
  ).fights
  expect(fights).toHaveLength(2)
  expect(fights.map((fight) => fight.fighterA.name)).toEqual([
    `E2E BetMMA Alpha ${auditId}`,
    `E2E BetMMA Charlie ${auditId}`,
  ])

  const prices = (
    (await (
      await page.request.get(`/api/market-prices?cardId=${cardId}`)
    ).json()) as { prices: MarketPrice[] }
  ).prices
  expect(prices).toHaveLength(4)
  expect(
    prices.every((price) => price.bookmaker === 'BetMMA best available'),
  ).toBe(true)
  expect(prices.every((price) => price.sourceProvider === 'betmma')).toBe(true)
  expect(
    prices
      .map((price) => price.decimalOdds)
      .sort((left, right) => Number(left) - Number(right)),
  ).toEqual(['1.2000', '2.0000', '2.0000', '5.3800'])

  const links = (
    (await (
      await page.request.get(`/api/cards/${cardId}/source-links`)
    ).json()) as { links: CardSourceLink[] }
  ).links
  expect(links).toEqual([
    expect.objectContaining({
      provider: 'betmma',
      url: 'https://www.betmma.tips/next_ufc_event.php',
    }),
  ])
})
