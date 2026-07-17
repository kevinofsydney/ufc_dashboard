import { expect, test } from '@playwright/test'

test('creates a card and opens its persisted fight workspace', async ({
  page,
}) => {
  const uniqueName = `E2E UFC Card ${Date.now()}`
  await page.goto('/')

  await page.getByRole('button', { name: 'Cards' }).click()
  const createCardForm = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: 'Create a card' }) })
  await createCardForm
    .getByLabel('Event name', { exact: true })
    .fill(uniqueName)
  await createCardForm.locator('input[name="budgetUnits"]').fill('30')
  await createCardForm.locator('input[name="unitValue"]').fill('10')
  await createCardForm.getByRole('button', { name: 'Create card' }).click()

  await expect(
    page.locator('.record-row strong').filter({ hasText: uniqueName }),
  ).toBeVisible()
  await page.getByLabel('Card').selectOption({ label: uniqueName })
  const addFightForm = page.locator('form.bout-form')
  await addFightForm
    .getByLabel('Fighter A', { exact: true })
    .fill('E2E Fighter Alpha')
  await addFightForm
    .getByLabel('Fighter B', { exact: true })
    .fill('E2E Fighter Beta')
  await addFightForm.getByLabel('Bout order', { exact: true }).fill('1')
  await addFightForm.getByRole('button', { name: 'Add fight' }).click()

  await expect(page.getByLabel('Fighter A for bout 1')).toHaveValue(
    'E2E Fighter Alpha',
  )
  await expect(page.getByLabel('Fighter B for bout 1')).toHaveValue(
    'E2E Fighter Beta',
  )

  await addFightForm
    .getByLabel('Fighter A', { exact: true })
    .fill('E2E Fighter Gamma')
  await addFightForm
    .getByLabel('Fighter B', { exact: true })
    .fill('E2E Fighter Delta')
  await addFightForm.getByLabel('Bout order', { exact: true }).fill('2')
  await addFightForm.getByRole('button', { name: 'Add fight' }).click()
  await expect(page.getByLabel('Fighter A for bout 2')).toHaveValue(
    'E2E Fighter Gamma',
  )

  await page.getByRole('button', { name: 'Fight board' }).click()
  await page.getByLabel('Working card').selectOption({ label: uniqueName })
  await expect(
    page.getByText('E2E Fighter Alpha', { exact: true }),
  ).toBeVisible()
  const alphaFight = page
    .locator('.fight-board-card')
    .filter({ hasText: 'E2E Fighter Alpha' })
  await alphaFight
    .getByLabel('Official result')
    .selectOption({ label: 'E2E Fighter Alpha won' })
  await alphaFight.getByLabel('Method').selectOption('decision')
  await alphaFight.getByLabel('Round').selectOption('3')
  await alphaFight.getByRole('button', { name: 'Save result' }).click()

  await page.getByRole('button', { name: 'Cards' }).click()
  await page.getByRole('button', { name: 'Fight board' }).click()
  await page.getByLabel('Working card').selectOption({ label: uniqueName })
  await expect(
    page.getByText('E2E Fighter Alpha', { exact: true }),
  ).toBeVisible()
  const persistedAlphaFight = page
    .locator('.fight-board-card')
    .filter({ hasText: 'E2E Fighter Alpha' })
  await expect(persistedAlphaFight.getByLabel('Official result')).toHaveValue(
    /winner:/,
  )
  await expect(persistedAlphaFight.getByLabel('Method')).toHaveValue('decision')
  await expect(persistedAlphaFight.getByLabel('Round')).toHaveValue('3')

  await page.getByRole('button', { name: 'Bet ledger' }).click()
  await page.getByLabel('Working card').selectOption({ label: uniqueName })
  await page.getByLabel('Market').selectOption('parlay')
  await expect(
    page
      .getByLabel('Fight for leg 1')
      .locator('option')
      .filter({ hasText: 'E2E Fighter Alpha vs E2E Fighter Beta' }),
  ).toHaveCount(1)
  await page
    .getByLabel('Fight for leg 1')
    .selectOption({ label: 'E2E Fighter Alpha vs E2E Fighter Beta' })
  await page
    .getByLabel('Selection for leg 1')
    .selectOption({ label: 'E2E Fighter Alpha' })
  await page.getByRole('button', { name: 'Add leg' }).click()
  await page
    .getByLabel('Fight for leg 2')
    .selectOption({ label: 'E2E Fighter Gamma vs E2E Fighter Delta' })
  await page
    .getByLabel('Selection for leg 2')
    .selectOption({ label: 'E2E Fighter Gamma' })
  await page.getByLabel('Actual odds').fill('2.00')
  await page.getByLabel('Stake').fill('1')
  await page.getByRole('button', { name: 'Add placed bet' }).click()

  const parlay = page
    .locator('.ledger-row')
    .filter({ hasText: 'E2E Fighter Alpha + E2E Fighter Gamma' })
  await expect(parlay).toContainText('E2E Fighter Alpha')
  await expect(parlay).toContainText('E2E Fighter Gamma')

  await page.reload()
  await page.getByRole('button', { name: 'Bet ledger' }).click()
  await page.getByLabel('Working card').selectOption({ label: uniqueName })
  const persistedParlay = page
    .locator('.ledger-row')
    .filter({ hasText: 'E2E Fighter Alpha + E2E Fighter Gamma' })
  await expect(persistedParlay).toContainText('E2E Fighter Gamma')
  await persistedParlay.getByLabel('Settlement result').selectOption('won')
  await persistedParlay.getByRole('button', { name: 'Settle' }).click()
  await expect(persistedParlay).toContainText('WON')

  await page.getByRole('button', { name: 'Bankroll' }).click()
  await expect(
    page.getByRole('heading', { name: 'Capper accuracy' }),
  ).toBeVisible()
  await expect(
    page.locator('.bankroll-row').filter({ hasText: uniqueName }),
  ).toContainText('+1.00u')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download backup' }).click()
  await expect((await downloadPromise).suggestedFilename()).toMatch(
    /^ufc-bet-synthesiser-\d{4}-\d{2}-\d{2}\.json$/,
  )
})
