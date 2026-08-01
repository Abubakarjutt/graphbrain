import { test, expect } from '@playwright/test'

test.describe('editor persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(process.env.E2E_EMAIL ?? 'test@example.com')
    await page.getByLabel('Password').fill(process.env.E2E_PASSWORD ?? 'testpassword123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/workspace\//)
  })

  test('page body persists across reload', async ({ page }) => {
    await page.getByRole('button', { name: /new doc/i }).first().click()
    await page.waitForURL(/\/page\//)
    const editor = page.locator('.ProseMirror')
    await editor.click()
    await editor.type('Persistent body text')
    await page.waitForTimeout(1500) // debounced autosave (1s) + margin
    await page.reload()
    await expect(page.locator('.ProseMirror')).toContainText('Persistent body text')
  })
})
