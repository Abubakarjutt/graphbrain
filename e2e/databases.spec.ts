import { test, expect } from '@playwright/test'

test.describe('database flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(process.env.E2E_EMAIL ?? 'test@example.com')
    await page.getByLabel('Password').fill(process.env.E2E_PASSWORD ?? 'testpassword123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/workspace\//)
  })

  test('sidebar shows Databases section', async ({ page }) => {
    await expect(page.getByText('Databases')).toBeVisible()
  })

  test('clicking + New Database creates a database and navigates to it', async ({ page }) => {
    await page.getByRole('button', { name: /new database/i }).click()
    await page.waitForURL(/\/database\//)
    await expect(page.getByText('Fields')).toBeVisible()
  })

  test('adding a field and creating a row appears in the table', async ({ page }) => {
    await page.getByRole('button', { name: /new database/i }).click()
    await page.waitForURL(/\/database\//)
    await page.getByRole('button', { name: 'Fields' }).click()
    await page.getByLabel('New field name').fill('Status')
    await page.getByRole('button', { name: 'Add' }).click()
    await page.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: '+ New Row' }).click()
    await expect(page.getByRole('link', { name: /untitled/i })).toBeVisible()
  })

  test('clicking a row link opens the row page with properties panel', async ({ page }) => {
    await page.getByRole('button', { name: /new database/i }).click()
    await page.waitForURL(/\/database\//)
    await page.getByRole('button', { name: '+ New Row' }).click()
    await page.getByRole('link', { name: /untitled/i }).click()
    await page.waitForURL(/\/page\//)
    await expect(page.getByPlaceholder('Untitled')).toBeVisible()
    await expect(page.getByText('Properties')).toBeVisible()
  })

  test('switching to Kanban view shows the empty-state when no select field', async ({ page }) => {
    await page.getByRole('button', { name: /new database/i }).click()
    await page.waitForURL(/\/database\//)
    await page.getByRole('button', { name: 'Kanban' }).click()
    await expect(page.getByText('Add a Select field to use Kanban view')).toBeVisible()
  })

  test('Kanban view shows columns when a select field exists', async ({ page }) => {
    await page.getByRole('button', { name: /new database/i }).click()
    await page.waitForURL(/\/database\//)
    await page.getByRole('button', { name: 'Fields' }).click()
    await page.getByLabel('New field name').fill('Priority')
    await page.getByLabel('Field type').selectOption('select')
    await page.getByRole('button', { name: 'Add' }).click()
    await page.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Kanban' }).click()
    await expect(page.getByText('No Status')).toBeVisible()
  })
})
