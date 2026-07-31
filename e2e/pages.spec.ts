import { test, expect } from '@playwright/test'

test.describe('page flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(process.env.E2E_EMAIL ?? 'test@example.com')
    await page.getByLabel('Password').fill(process.env.E2E_PASSWORD ?? 'testpassword123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/workspace\//)
  })

  test('sidebar shows Pages section', async ({ page }) => {
    await expect(page.getByText('Pages')).toBeVisible()
  })

  test('clicking + New Page creates a page and navigates to editor', async ({ page }) => {
    await page.getByRole('button', { name: /new page/i }).first().click()
    await page.waitForURL(/\/page\//)
    await expect(page.getByPlaceholder('Untitled')).toBeVisible()
  })

  test('typing in title updates the page title', async ({ page }) => {
    await page.getByRole('button', { name: /new page/i }).first().click()
    await page.waitForURL(/\/page\//)
    const titleInput = page.getByPlaceholder('Untitled')
    await titleInput.fill('My Test Page')
    await titleInput.blur()
    await expect(titleInput).toHaveValue('My Test Page')
  })

  test('editor renders and accepts text input', async ({ page }) => {
    await page.getByRole('button', { name: /new page/i }).first().click()
    await page.waitForURL(/\/page\//)
    const editor = page.locator('.ProseMirror')
    await editor.click()
    await editor.type('Hello graphbrain')
    await expect(editor).toContainText('Hello graphbrain')
  })
})
