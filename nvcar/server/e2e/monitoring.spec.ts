import { test, expect } from '@playwright/test'

// This E2E test requires local dev servers for client and server to be running:
// - Server: http://localhost:4000
// - Client: https://localhost:5173 (Vite dev server with HTTPS)
// It is skipped by default unless RUN_E2E is set to '1'.

test.skip(process.env.RUN_E2E !== '1', 'E2E tests disabled by default')

test('open monitoring and run diagnostics (extended mode)', async ({ page }) => {
  await page.goto('https://localhost:5173/admin/monitoring')
  // Toggle diagnostics mode if necessary
  const modeBtn = await page.locator('button:has-text("Mode: Essentiel")')
  if (await modeBtn.count() > 0) {
    await modeBtn.click()
  }

  await page.locator('button:has-text("Lancer les tests")').click()

  // Wait for tests to finish (simple heuristic)
  await page.waitForTimeout(5000)

  // Ensure the diagnostics panel exists
  const diagRows = await page.locator('.diag-row').count()
  expect(diagRows).toBeGreaterThan(0)
})