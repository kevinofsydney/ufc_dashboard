import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const workspaces = [
  'How to',
  'Cards',
  'Fight board',
  'Sources',
  'Odds board',
  'Bet ledger',
  'Bankroll',
  'Settings',
] as const

async function openWorkspace(
  page: Page,
  workspace: (typeof workspaces)[number],
) {
  await page.getByRole('button', { name: workspace, exact: true }).click()
  await expect(
    page.getByRole('heading', { name: workspace, exact: true, level: 1 }),
  ).toBeVisible()
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  return results.violations
    .filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    )
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target.join(' ')),
    }))
}

async function expectVerticalChildren(page: Page, selector: string) {
  await expect(page.locator(selector).first()).toBeVisible()
  const boxes = await page
    .locator(selector)
    .first()
    .locator(':scope > *')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const style = getComputedStyle(element)
          return style.display !== 'none' && style.visibility !== 'hidden'
        })
        .map((element) => {
          const box = element.getBoundingClientRect()
          return { top: box.top, bottom: box.bottom, left: box.left }
        }),
    )
  expect(
    boxes.length,
    `${selector} needs multiple visible children`,
  ).toBeGreaterThan(1)
  for (let index = 1; index < boxes.length; index += 1) {
    expect(
      boxes[index].top,
      `${selector} placed child ${index + 1} beside an earlier child`,
    ).toBeGreaterThanOrEqual(boxes[index - 1].bottom - 1)
    expect(boxes[index].left, `${selector} children are not left aligned`).toBe(
      boxes[0].left,
    )
  }
}

test('has no serious automated accessibility violations across desktop workspaces', async ({
  page,
}) => {
  await page.goto('/')
  const workspaceViolations: Array<{
    theme: 'light' | 'dark'
    workspace: string
    violations: Awaited<ReturnType<typeof seriousViolations>>
  }> = []
  for (const theme of ['light', 'dark'] as const) {
    if ((await page.locator('html').getAttribute('data-theme')) !== theme) {
      await page
        .getByRole('button', { name: `Switch to ${theme} mode` })
        .click()
    }
    for (const workspace of workspaces) {
      await openWorkspace(page, workspace)
      const violations = await seriousViolations(page)
      if (violations.length > 0) {
        workspaceViolations.push({ theme, workspace, violations })
      }
    }
  }
  expect(workspaceViolations).toEqual([])
})

test('supports keyboard entry and a 200% equivalent layout without horizontal clipping', async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 720 })
  await page.goto('/')

  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('link', { name: 'Skip to main content' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()

  for (const workspace of workspaces) {
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await page
      .locator('#application-sidebar')
      .getByRole('button', { name: workspace, exact: true })
      .click()
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(
      dimensions.scrollWidth,
      `${workspace} clipped at a 200% equivalent viewport`,
    ).toBeLessThanOrEqual(dimensions.clientWidth + 1)
  }
})

test('uses one vertical reading column for every workspace section', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const checks: Array<{
    workspace: (typeof workspaces)[number]
    selectors: string[]
  }> = [
    {
      workspace: 'How to',
      selectors: ['.workflow-overview', '.workflow-steps', '.workflow-path'],
    },
    {
      workspace: 'Sources',
      selectors: ['.capper-setup-grid', '.source-mode-guide'],
    },
    { workspace: 'Odds board', selectors: ['.source-layout'] },
    { workspace: 'Bet ledger', selectors: ['.source-layout'] },
    {
      workspace: 'Bankroll',
      selectors: ['.metric-grid', '.analytics-grid'],
    },
    { workspace: 'Settings', selectors: ['.settings-surface'] },
  ]

  for (const check of checks) {
    await openWorkspace(page, check.workspace)
    for (const selector of check.selectors) {
      await expectVerticalChildren(page, selector)
    }
  }
})
