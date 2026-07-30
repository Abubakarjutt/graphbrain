import { test, expect } from '@playwright/test'

test.describe('authentication flow', () => {
  const testEmail = `test-${Date.now()}@example.com`
  const testPassword = 'testpassword123'

  test('signup form renders and submits without error', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.getByText('graphbrain')).toBeVisible()

    await page.getByLabel('Email').fill(testEmail)
    await page.getByLabel('Password').fill(testPassword)
    await page.getByRole('button', { name: /create account/i }).click()

    // Local Supabase has email confirmation disabled, so the user is signed in
    // immediately and redirected to workspace. In production (email confirmation
    // enabled), the middleware redirects back to /login with a message.
    await page.waitForURL(url =>
      url.pathname.includes('/login') || url.pathname.startsWith('/workspace') || url.pathname === '/',
      { timeout: 8000 }
    )
  })

  test('unauthenticated user redirected to login', async ({ page }) => {
    await page.goto('/workspace/some-id')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page has sign in and magic link buttons', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /magic link/i })).toBeVisible()
  })

  test('magic link shows confirmation after entering email', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('user@example.com')
    await page.getByRole('button', { name: /magic link/i }).click()
    await expect(page.getByText(/magic link sent/i)).toBeVisible()
  })
})
