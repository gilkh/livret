import { test, expect } from '@playwright/test'

// E2E test for suggestion template preview. Disabled by default.
test.skip(process.env.RUN_E2E !== '1', 'E2E tests disabled by default')

test('suggestion preview shows multiple block types and opens suggestion modal', async ({ page }) => {
  // Pretend logged in by setting a token in localStorage
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-token')
  })

  // Intercept templates API and return a sample template with diverse block types
  await page.route('**/templates', route => {
    const templates = [
      {
        _id: 't1',
        name: 'E2E Test Template',
        currentVersion: 1,
        pages: [
          {
            title: 'Page 1',
            blocks: [
              { type: 'text', props: { blockId: 'b1', x: 20, y: 20, text: 'Hello world', color: '#111', fontSize: 14 } },
              { type: 'dynamic_text', props: { blockId: 'b2', x: 20, y: 60, content: 'Dynamic content' } },
              { type: 'dropdown', props: { blockId: 'b3', x: 20, y: 120, options: ['A', 'B', 'C'], dropdownNumber: 1 } },
              { type: 'image', props: { blockId: 'b4', x: 300, y: 20, url: 'https://via.placeholder.com/80', width: 80, height: 80 } },
              { type: 'table', props: { blockId: 'b5', x: 20, y: 200, rows: [['R1C1', 'R1C2'], ['R2C1', 'R2C2']] } },
              { type: 'rect', props: { blockId: 'b6', x: 20, y: 320, width: 120, height: 40 } },
              { type: 'signature', props: { blockId: 'b7', x: 200, y: 320, width: 180, height: 60, label: 'Teacher signature' } },
              { type: 'language_toggle', props: { blockId: 'b8', x: 20, y: 380, items: [{ label: 'FR' }, { label: 'EN' }] } }
            ]
          }
        ]
      }
    ]

    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(templates)
    })
  })

  // Intercept suggestion POST to return a success response
  await page.route('**/suggestions', async route => {
    if (route.request().method() === 'POST') {
      const body = await route.request().postData()
      // postData() may return null; use undefined for fulfill body if null to satisfy typings
      route.fulfill({ status: 200, body: body ?? undefined })
    } else {
      route.fallback()
    }
  })

  // Go to the suggestion page (use port where dev server runs)
  const clientPort = process.env.CLIENT_PORT || '5173'
  const clientHost = process.env.CLIENT_HOST || '127.0.0.1'
  await page.goto(`https://${clientHost}:${clientPort}/subadmin/suggestion/gradebooks`)

  // Wait for template select to populate and select the test template
  await page.waitForSelector('select.filter-select')
  await page.selectOption('select.filter-select', 't1')

  // The page should render a canvas / page with blocks and at least a few ✎ buttons
  await page.waitForSelector('.page-canvas')

  // Ensure at least one image is rendered
  const imgCount = await page.locator('.page-canvas img').count()
  expect(imgCount).toBeGreaterThan(0)

  // Ensure table rows are present
  const tableRows = await page.locator('.page-canvas table tr').count()
  expect(tableRows).toBeGreaterThan(0)

  // Ensure there are multiple ✎ buttons on the page
  const suggestButtons = await page.locator('text=✎').count()
  expect(suggestButtons).toBeGreaterThanOrEqual(4)

  // Click the first suggestion button and ensure modal opens
  await page.locator('text=✎').first().click()
  await page.waitForSelector('text=Suggérer une modification')
  expect(await page.locator('textarea[placeholder="Entrez votre suggestion..."]').count()).toBe(1)

  // Fill suggestion and submit
  await page.fill('textarea[placeholder="Entrez votre suggestion..."]', 'E2E suggestion')
  await page.click('button:has-text("Envoyer")')

  // Confirm success toast appears
  await page.waitForSelector('.toast')
  expect(await page.locator('.toast').innerText()).toContain('Suggestion envoyée')
})
