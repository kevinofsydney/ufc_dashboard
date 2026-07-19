import { expect, test } from '@playwright/test'

test('persists theme and desktop sidebar preferences', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await page.evaluate(() => {
    window.localStorage.removeItem('fightfolio.theme.v1')
    window.localStorage.removeItem('fightfolio.sidebar-collapsed.v1')
    window.localStorage.removeItem('fightfolio.narrow-view.v1')
  })
  await page.reload()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('button', { name: 'Use mobile-width layout' }).click()
  await expect(page.locator('.app-shell')).toHaveClass(/app-shell--narrow-view/)

  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect(page.locator('.app-shell')).toHaveClass(
    /app-shell--sidebar-collapsed/,
  )
  await expect(page.getByRole('button', { name: 'Cards' })).toBeVisible()

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.app-shell')).toHaveClass(
    /app-shell--sidebar-collapsed/,
  )
  await expect(page.locator('.app-shell')).toHaveClass(/app-shell--narrow-view/)

  await page.getByRole('button', { name: 'Expand sidebar' }).click()
  await page.getByRole('button', { name: 'Use desktop layout' }).click()
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('.app-shell')).not.toHaveClass(
    /app-shell--sidebar-collapsed/,
  )
  await expect(page.locator('.app-shell')).not.toHaveClass(
    /app-shell--narrow-view/,
  )
})

test('keeps every workspace inside a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const workspaces = [
    'How to',
    'Cards',
    'Fight board',
    'Sources',
    'Odds board',
    'Bet ledger',
    'Bankroll',
    'Settings',
  ]

  for (const workspace of workspaces) {
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await page
      .locator('#application-sidebar')
      .getByRole('button', { name: workspace, exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: workspace, exact: true, level: 1 }),
    ).toBeVisible()
    if (workspace === 'Sources') {
      const mobileCsv = [
        'channel_name,video_id,video_title,video_url,part_number,part_count,transcript_text',
        'Mobile Channel,mobile-video,Mobile CSV preview,https://youtube.test/watch?v=mobile-video,1,1,Transcript text',
      ].join('\n')
      await page.getByLabel('Transcript CSV file').setInputFiles({
        name: 'mobile-transcripts.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(mobileCsv),
      })
      await expect(
        page.getByText('Mobile CSV preview', { exact: true }),
      ).toBeVisible()
    }
    const overflowingElements = await page
      .locator('body *')
      .evaluateAll((elements) =>
        elements
          .filter((element) => {
            const style = window.getComputedStyle(element)
            const bounds = element.getBoundingClientRect()
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              bounds.width > 0 &&
              bounds.right > window.innerWidth + 1
            )
          })
          .map((element) => {
            const bounds = element.getBoundingClientRect()
            return {
              tag: element.tagName.toLowerCase(),
              className: element.className,
              right: Math.round(bounds.right),
              width: Math.round(bounds.width),
            }
          }),
      )
    expect(overflowingElements, `${workspace} overflowed`).toEqual([])
  }
})

test('creates a card and opens its persisted fight workspace', async ({
  page,
}) => {
  const auditId = Date.now()
  const uniqueName = `E2E UFC Card ${auditId}`
  const uniqueCapper = `E2E Capper ${auditId}`
  await page.goto('/')

  await expect(
    page.getByText(
      'Review the consensus and supporting evidence for every fight.',
      { exact: false },
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Help: Fight board', exact: true }),
  ).toHaveCount(0)

  await page.getByRole('button', { name: 'How to' }).click()
  await expect(
    page.getByRole('heading', {
      name: 'From event page to placed-bet checklist',
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Open Settings' }).click()
  await expect(
    page.getByRole('heading', { name: 'OpenRouter connection' }),
  ).toBeVisible()
  const pageHeadingBox = await page.locator('.page-heading').boundingBox()
  const settingsWorkspaceBox = await page
    .locator('.settings-workspace')
    .boundingBox()
  expect(pageHeadingBox).not.toBeNull()
  expect(settingsWorkspaceBox).not.toBeNull()
  expect(
    Math.abs((pageHeadingBox?.x ?? 0) - (settingsWorkspaceBox?.x ?? 0)),
  ).toBeLessThanOrEqual(1)

  const modelSelectBox = await page
    .getByLabel('Model ID', { exact: true })
    .boundingBox()
  const loadModelsBox = await page
    .getByRole('button', { name: 'Load models' })
    .boundingBox()
  expect(modelSelectBox).not.toBeNull()
  expect(loadModelsBox).not.toBeNull()
  expect(
    Math.abs((modelSelectBox?.y ?? 0) - (loadModelsBox?.y ?? 0)),
  ).toBeLessThanOrEqual(1)

  const reasoningPadding = await page
    .getByLabel('Thinking / reasoning')
    .evaluate((element) => getComputedStyle(element).paddingLeft)
  expect(reasoningPadding).toBe('40px')
  const bankrollInput = page.getByLabel('Current bankroll')
  const unitInput = page.getByLabel('Default unit size')
  const originalBankroll = await bankrollInput.inputValue()
  const originalUnit = await unitInput.inputValue()
  await bankrollInput.fill('123.45')
  await unitInput.fill('7.50')
  await page.getByRole('button', { name: 'Save bankroll settings' }).click()
  await expect(
    page.getByText('Bankroll and default unit size saved.'),
  ).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByLabel('Current bankroll')).toHaveValue('123.45')
  await expect(page.getByLabel('Default unit size')).toHaveValue('7.50')
  await page.getByLabel('Current bankroll').fill(originalBankroll)
  await page.getByLabel('Default unit size').fill(originalUnit)
  await page.getByRole('button', { name: 'Save bankroll settings' }).click()
  await page.getByLabel('OpenRouter API key').fill('test-session-key')
  await page.getByLabel('Custom model ID').fill('test/model')
  await page.getByRole('button', { name: 'Save model' }).click()
  await page.getByLabel('Model ID', { exact: true }).selectOption('test/model')
  await expect(
    page.getByText('Requests send the exact model ID', { exact: false }),
  ).toContainText('test/model')
  await page.getByLabel('Thinking / reasoning').selectOption('high')
  await page.getByRole('button', { name: 'Save connection' }).click()
  await expect(page.getByText('Configured for this tab')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByLabel('OpenRouter API key')).toHaveValue(
    'test-session-key',
  )
  await expect(page.getByLabel('Model ID', { exact: true })).toHaveValue(
    'test/model',
  )
  await expect(page.getByLabel('Thinking / reasoning')).toHaveValue('high')
  await page.getByRole('button', { name: 'Clear tab key' }).click()
  await expect(page.getByLabel('OpenRouter API key')).toHaveValue('')
  await page.getByText(/Saved models \(\d+\)/).click()
  await page
    .getByRole('button', { name: 'Remove saved model test/model' })
    .click()

  await page.getByRole('button', { name: 'Cards' }).click()
  const cardSetup = page.locator('details').filter({
    has: page.getByRole('heading', { name: 'Create or update a card' }),
  })
  const cardsSectionBox = await page.locator('.records-card').boundingBox()
  const cardSetupBox = await cardSetup.boundingBox()
  expect(cardsSectionBox).not.toBeNull()
  expect(cardSetupBox).not.toBeNull()
  expect(cardSetupBox?.y ?? 0).toBeGreaterThan(cardsSectionBox?.y ?? 0)
  expect(
    Math.abs((cardsSectionBox?.x ?? 0) - (cardSetupBox?.x ?? 0)),
  ).toBeLessThanOrEqual(1)
  await expect(cardSetup).not.toHaveAttribute('open', '')
  await cardSetup.locator('summary').click()
  await expect(cardSetup).toHaveAttribute('open', '')
  const setupSections = await cardSetup
    .locator('.fetch-card-panel, .card-create-section, .manual-card-builder')
    .evaluateAll((sections) =>
      sections.map((section) => {
        const box = section.getBoundingClientRect()
        return { x: box.x, y: box.y }
      }),
    )
  expect(setupSections).toHaveLength(3)
  expect(setupSections.map(({ y }) => y)).toEqual(
    [...setupSections.map(({ y }) => y)].sort((a, b) => a - b),
  )
  expect(new Set(setupSections.map(({ x }) => Math.round(x))).size).toBe(1)

  const transcriptMatching = page.locator('details').filter({
    has: page.getByRole('heading', { name: 'Match transcript spellings' }),
  })
  await transcriptMatching.locator('summary').click()
  await expect(
    transcriptMatching.getByText(
      /Use this only when a transcript misspells or mishears/,
    ),
  ).toBeVisible()
  await transcriptMatching.locator('summary').click()

  const createCardForm = page.locator('form').filter({
    has: page.getByRole('heading', {
      name: 'Create a blank card manually',
    }),
  })
  await createCardForm
    .getByLabel('Event name', { exact: true })
    .fill(uniqueName)
  await createCardForm.locator('input[name="budgetUnits"]').fill('30')
  await createCardForm.locator('input[name="unitValue"]').fill('10')
  await createCardForm.getByRole('button', { name: 'Create card' }).click()

  const createdCardRow = page
    .locator('.record-row')
    .filter({ hasText: uniqueName })
  await expect(createdCardRow).toBeVisible()
  await createdCardRow
    .getByRole('button', { name: `Show ${uniqueName} fights` })
    .click()
  await expect(
    createdCardRow.getByRole('heading', { name: 'Bouts on this card' }),
  ).toBeVisible()
  await expect(
    createdCardRow.getByText('No bouts on this card yet'),
  ).toBeVisible()
  await expect(
    page.locator('.bout-card-select select option:checked'),
  ).toHaveText(uniqueName)
  const addFightForm = page.locator('form.bout-form')
  await addFightForm
    .getByLabel('Fighter A', { exact: true })
    .fill('E2E Fighter Alpha')
  await addFightForm
    .getByLabel('Fighter B', { exact: true })
    .fill('E2E Fighter Beta')
  await addFightForm
    .locator('select[name="weightClass"]')
    .selectOption('Lightweight')
  await addFightForm.getByLabel('Bout order', { exact: true }).fill('1')
  await addFightForm.getByLabel('Main event', { exact: true }).check()
  await addFightForm.getByRole('button', { name: 'Add fight' }).click()

  await expect(page.getByLabel('Fighter A for bout 1')).toHaveValue(
    'E2E Fighter Alpha',
  )
  await expect(page.getByLabel('Fighter B for bout 1')).toHaveValue(
    'E2E Fighter Beta',
  )
  await expect(createdCardRow).toContainText(
    'E2E Fighter Alpha vs E2E Fighter Beta',
  )
  const firstBout = page.locator('form.bout-edit-row').filter({
    has: page.getByLabel('Fighter A for bout 1'),
  })
  const boutEditHeader = page.locator('.bout-edit-header')
  for (const heading of [
    'Fighter A',
    'Fighter B',
    'Weight class',
    'Bout order',
    'Bout status',
    'Main event',
    'Actions',
  ]) {
    await expect(boutEditHeader).toContainText(heading)
  }
  await expect(firstBout.getByLabel('Weight class')).toHaveValue('Lightweight')
  await expect(firstBout.getByLabel('Bout status')).toHaveValue('scheduled')
  await expect(
    firstBout.getByLabel('Bout status').locator('option:checked'),
  ).toHaveText('Scheduled (active)')
  const boutStatusBox = await firstBout.getByLabel('Bout status').boundingBox()
  expect(boutStatusBox).not.toBeNull()
  expect(boutStatusBox?.width ?? 0).toBeGreaterThanOrEqual(136)

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

  const cardMaintenanceForm = page.locator('form.card-maintenance-form')
  await cardMaintenanceForm.getByLabel('Budget units').fill('35')
  await cardMaintenanceForm.getByLabel('Lifecycle').selectOption('ready')
  await cardMaintenanceForm
    .getByRole('button', { name: 'Save card changes' })
    .click()
  await expect(createdCardRow).toContainText('35u')
  await expect(createdCardRow).toContainText('ready')

  const secondBout = page.locator('form.bout-edit-row').filter({
    has: page.getByLabel('Fighter A for bout 2'),
  })
  await secondBout.getByLabel('Weight class').selectOption('Welterweight')
  await secondBout.getByRole('button', { name: 'Save' }).click()
  await expect(secondBout.getByLabel('Weight class')).toHaveValue(
    'Welterweight',
  )

  await transcriptMatching.locator('summary').click()
  await transcriptMatching
    .getByLabel('Official fighter')
    .selectOption({ label: 'E2E Fighter Alpha' })
  await transcriptMatching
    .getByLabel('Name used in transcript')
    .fill('E2E Alpha transcription')
  await transcriptMatching
    .getByRole('button', { name: 'Save spelling' })
    .click()
  await expect(
    transcriptMatching.getByText('E2E Alpha transcription', { exact: false }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Sources' }).click()
  const sourceSteps = page.locator('.sources-step')
  await expect(sourceSteps).toHaveCount(4)
  await expect(
    page.getByRole('heading', {
      name: 'Choose the card you are researching',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: 'Add cappers and alternate names',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Save the source material' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Parse, review, and accept' }),
  ).toBeVisible()
  const stepPositions = await sourceSteps.evaluateAll((steps) =>
    steps.map((step) => step.getBoundingClientRect().top),
  )
  expect(stepPositions).toEqual([...stepPositions].sort((a, b) => a - b))
  await expect(
    page.getByText(
      'Only this action makes the evidence available to synthesis.',
    ),
  ).toBeVisible()
  await page.getByLabel('Working card').selectOption({ label: uniqueName })

  const csvVideoId = `csv-${auditId}`
  const csvTitle = `E2E CSV Transcript ${auditId}`
  const transcriptCsv = [
    'record_id,channel_name,video_id,video_title,video_url,published_at,source,status,part_number,part_count,transcript_text,captured_at,notes',
    `${csvVideoId}-auto-2,E2E CSV Channel ${auditId},${csvVideoId},${csvTitle},https://youtube.test/watch?v=${csvVideoId},2026-07-16T00:00:00Z,automatic,CAPTURED_AUTO,2,2,second half.,2026-07-17T00:00:00Z,`,
    `${csvVideoId}-auto-1,E2E CSV Channel ${auditId},${csvVideoId},${csvTitle},https://youtube.test/watch?v=${csvVideoId},2026-07-16T00:00:00Z,automatic,CAPTURED_AUTO,1,2,"First half, ",2026-07-17T00:00:00Z,`,
  ].join('\r\n')
  await page.getByLabel('Transcript CSV file').setInputFiles({
    name: 'transcripts.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(transcriptCsv),
  })
  await expect(page.getByText(csvTitle, { exact: true })).toBeVisible()
  await expect(page.getByText(/2 parts · 24 characters/)).toBeVisible()
  await expect(page.getByLabel(`Extraction mode for ${csvTitle}`)).toHaveValue(
    'individual',
  )
  await page.getByRole('button', { name: 'Import 1 transcript' }).click()
  await expect(
    page.getByText(
      'Imported 1 transcript. It is saved as a raw source; continue to step 4 to parse and review it.',
    ),
  ).toBeVisible()
  const importedCsvSource = page.locator('.source-row').filter({
    hasText: csvTitle,
  })
  await expect(importedCsvSource).toContainText('First half, second half.')

  await page.getByLabel('Capper or channel name').fill(uniqueCapper)
  await page.getByRole('button', { name: 'Save capper' }).click()
  await expect(page.getByLabel('Capper or channel name')).toHaveValue('')
  await expect(
    page.getByRole('option', { name: uniqueCapper, exact: true }),
  ).toHaveCount(2)

  await page.getByLabel('Capper or channel name').fill(uniqueCapper)
  await page.getByRole('button', { name: 'Save capper' }).click()
  await expect(
    page.getByText('A capper with that name already exists'),
  ).toBeVisible()

  await page.getByLabel('Saved capper').selectOption({ label: uniqueCapper })
  await page.getByLabel('Alternate name').fill(`Alias ${auditId}`)
  await page.getByRole('button', { name: 'Add alias' }).click()
  await expect(
    page.getByText(`Alias ${auditId}`, { exact: false }),
  ).toBeVisible()

  await page.getByLabel('Primary capper').selectOption({ label: uniqueCapper })
  await page
    .getByLabel('Title · Optional', { exact: true })
    .fill(`E2E Functional Source ${auditId}`)
  await page
    .getByLabel('Transcript, written tips, or tracker data')
    .fill('E2E Fighter Alpha by decision after a competitive fight.')
  await page.getByRole('button', { name: 'Save source' }).click()
  await expect(
    page.getByLabel('Title · Optional', { exact: true }),
  ).toHaveValue('')
  const savedSource = page.locator('.source-row').filter({
    hasText: `E2E Functional Source ${auditId}`,
  })
  await expect(savedSource).toBeVisible()
  await savedSource.getByRole('button', { name: 'Edit source' }).click()
  await page
    .getByLabel('Title · Optional', { exact: true })
    .fill(`E2E Functional Source ${auditId} updated`)
  await page.getByRole('button', { name: 'Save source changes' }).click()
  await expect(
    page.locator('.source-row').filter({
      hasText: `E2E Functional Source ${auditId} updated`,
    }),
  ).toBeVisible()
  await expect(
    page.getByText('The request could not be completed'),
  ).toHaveCount(0)

  await page.getByRole('button', { name: 'Odds board' }).click()
  await page.getByLabel('Working card').selectOption({ label: uniqueName })
  await page
    .getByRole('combobox', { name: 'Fight' })
    .selectOption({ label: 'E2E Fighter Alpha vs E2E Fighter Beta' })
  await page
    .getByRole('combobox', { name: 'Selection' })
    .selectOption({ label: 'E2E Fighter Alpha' })
  await page.getByRole('textbox', { name: 'Odds', exact: true }).fill('-125')
  await page
    .getByRole('textbox', { name: 'Bookmaker', exact: true })
    .fill('E2E Bookmaker')
  await page.getByRole('button', { name: 'Save price snapshot' }).click()
  const priceRow = page.locator('.price-row').filter({
    hasText: 'E2E Fighter Alpha',
  })
  await expect(priceRow).toContainText('1.80')
  page.once('dialog', (dialog) => dialog.accept())
  await priceRow.getByRole('button', { name: 'Hide snapshot' }).click()
  await expect(priceRow).not.toBeVisible()

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
  const fighterSelect = page.getByRole('combobox', {
    name: 'Fighter',
    exact: true,
  })
  await expect(fighterSelect.locator('option')).toHaveText([
    'E2E Fighter Alpha',
    'E2E Fighter Beta',
    'E2E Fighter Gamma',
    'E2E Fighter Delta',
  ])

  const templateDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV template' }).click()
  await expect((await templateDownload).suggestedFilename()).toBe(
    'fightfolio-ledger-template.csv',
  )
  await page
    .getByText('Prompt for extracting bets from screenshots', { exact: true })
    .click()
  await expect(page.getByLabel('Screenshot extraction prompt')).toContainText(
    `- E2E Fighter Alpha vs E2E Fighter Beta`,
  )

  const ledgerCsv = [
    'fight,selection,market,odds,stake_units,notes',
    'E2E Fighter Alpha vs E2E Fighter Beta,E2E Fighter Alpha,moneyline,1.80,0.75,CSV single',
    'E2E Fighter Gamma vs E2E Fighter Delta,Over 1.5 rounds,fight_prop,+120,0.5,CSV total',
  ].join('\n')
  await page.getByLabel('Completed ledger CSV').setInputFiles({
    name: 'placed-bets.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(ledgerCsv),
  })
  await expect(
    page.getByText('2 validated bets', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Import 2 placed bets' }).click()
  await expect(
    page.getByText('Imported 2 placed bets into the ledger.'),
  ).toBeVisible()
  await expect(
    page.locator('.ledger-row').filter({ hasText: 'E2E Fighter Alpha ML' }),
  ).toBeVisible()
  await expect(
    page.locator('.ledger-row').filter({
      hasText: 'E2E Fighter Gamma vs E2E Fighter Delta — Over 1.5 rounds',
    }),
  ).toBeVisible()

  const betTypeSelect = page.getByRole('combobox', {
    name: 'Bet type',
    exact: true,
  })
  await fighterSelect.selectOption({ index: 0 })
  await expect(page.locator('.pick-preview')).toContainText(
    'E2E Fighter Alpha ML',
  )
  await expect(betTypeSelect.locator('option[value="round_5"]')).toHaveCount(1)
  await fighterSelect.selectOption({ index: 2 })
  await expect(page.locator('.pick-preview')).toContainText(
    'E2E Fighter Gamma ML',
  )
  await expect(betTypeSelect.locator('option[value="round_4"]')).toHaveCount(0)
  await fighterSelect.selectOption({ index: 0 })
  await betTypeSelect.selectOption('inside_distance')
  await expect(page.locator('.pick-preview')).toContainText(
    'E2E Fighter Alpha Inside the Distance',
  )
  await page.getByLabel('Actual odds').fill('1.80')
  await page.getByLabel('Stake').fill('0.5')
  await page.getByRole('button', { name: 'Add placed bet' }).click()
  await expect(
    page
      .locator('.ledger-row')
      .filter({ hasText: 'E2E Fighter Alpha Inside the Distance' }),
  ).toBeVisible()

  await betTypeSelect.selectOption('parlay')
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
    .filter({ hasText: 'E2E Fighter Alpha ML + E2E Fighter Gamma ML' })
  await expect(parlay).toContainText('E2E Fighter Alpha')
  await expect(parlay).toContainText('E2E Fighter Gamma')

  await page.reload()
  await page.getByRole('button', { name: 'Bet ledger' }).click()
  await page.getByLabel('Working card').selectOption({ label: uniqueName })
  const persistedParlay = page
    .locator('.ledger-row')
    .filter({ hasText: 'E2E Fighter Alpha ML + E2E Fighter Gamma ML' })
  await expect(persistedParlay).toContainText('E2E Fighter Gamma')
  await persistedParlay.getByLabel('Settlement result').selectOption('won')
  await persistedParlay.getByRole('button', { name: 'Settle' }).click()
  await expect(persistedParlay).toContainText('WON')
  await persistedParlay
    .getByRole('button', { name: 'Unsettle for correction' })
    .click()
  await expect(persistedParlay.getByLabel('Settlement result')).toBeVisible()
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

  await page.getByRole('button', { name: 'Cards' }).click()
  const cardRow = page.locator('.record-row').filter({ hasText: uniqueName })
  await cardRow
    .getByRole('button', { name: `Show ${uniqueName} fights` })
    .click()
  const returnedCardSetup = page.locator('details').filter({
    has: page.getByRole('heading', { name: 'Create or update a card' }),
  })
  await returnedCardSetup.locator('summary').click()
  const gammaBout = page.locator('form.bout-edit-row').filter({
    has: page.getByLabel('Fighter A for bout 2'),
  })
  page.once('dialog', (dialog) => dialog.accept())
  await gammaBout.getByRole('button', { name: 'Hide' }).click()
  await expect(gammaBout).not.toBeVisible()

  await cardRow.getByRole('button', { name: `Delete ${uniqueName}` }).click()
  const deleteConfirmation = cardRow.getByRole('group', {
    name: `Confirm deletion of ${uniqueName}`,
  })
  await expect(deleteConfirmation.getByText('Are you sure?')).toBeVisible()
  await deleteConfirmation.getByRole('button', { name: 'Cancel' }).click()
  await expect(deleteConfirmation).not.toBeVisible()

  await cardRow.getByRole('button', { name: `Delete ${uniqueName}` }).click()
  await cardRow.getByRole('button', { name: 'Confirm' }).click()
  await expect(cardRow).not.toBeVisible()
})
