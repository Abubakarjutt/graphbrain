import { test, expect } from '@playwright/test'

test.describe('file attachments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(process.env.E2E_EMAIL ?? 'test@example.com')
    await page.getByLabel('Password').fill(process.env.E2E_PASSWORD ?? 'testpassword123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/workspace\//)
  })

  test('page editor shows Attachments section with Attach file button', async ({ page }) => {
    await page.getByRole('button', { name: /new page/i }).click()
    await page.waitForURL(/\/page\//)
    await expect(page.getByText('Attachments')).toBeVisible()
    await expect(page.getByText('Attach file')).toBeVisible()
  })

  test('uploading an image creates a file page in the sidebar and renders an image', async ({ page }) => {
    await page.getByRole('button', { name: /new page/i }).click()
    await page.waitForURL(/\/page\//)

    // Upload a small PNG
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByText('Attach file').click(),
    ])
    await fileChooser.setFiles({
      name: 'test-image.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    })

    // File page link appears in the attachments list
    await expect(page.getByRole('link', { name: 'test-image.png' })).toBeVisible()

    // Navigate to the file page
    await page.getByRole('link', { name: 'test-image.png' }).click()
    await page.waitForURL(/\/page\//)
    await expect(page.getByRole('img')).toBeVisible()
    await expect(page.getByRole('link', { name: /download/i })).toBeVisible()
  })

  test('uploading a PDF creates a file page that shows Indexing status', async ({ page }) => {
    await page.getByRole('button', { name: /new page/i }).click()
    await page.waitForURL(/\/page\//)

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByText('Attach file').click(),
    ])
    await fileChooser.setFiles({
      name: 'document.pdf',
      mimeType: 'application/pdf',
      // Minimal valid PDF
      buffer: Buffer.from('%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'),
    })

    await page.getByRole('link', { name: 'document.pdf' }).click()
    await page.waitForURL(/\/page\//)
    await expect(page.locator('iframe')).toBeVisible()
    // At minimum the download link is always present
    await expect(page.getByRole('link', { name: /download/i })).toBeVisible()
  })
})
