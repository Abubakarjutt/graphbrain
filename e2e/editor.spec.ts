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

  // Helper: open a fresh doc and focus the empty body editor.
  async function openBlankDoc(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: /new doc/i }).first().click()
    await page.waitForURL(/\/page\//)
    const editor = page.locator('.ProseMirror')
    await editor.click()
    return editor
  }

  test('slash menu inserts a Heading 1', async ({ page }) => {
    const editor = await openBlankDoc(page)
    await editor.type('/')
    // Slash menu is portaled to document.body with role="listbox".
    await page.getByRole('option', { name: /heading 1/i }).click()
    await editor.type('My heading')
    await expect(editor.locator('h1')).toHaveText('My heading')
  })

  test('bubble menu bolds the selection', async ({ page }) => {
    const editor = await openBlankDoc(page)
    await editor.type('bold me')
    // Select all the text in the current block.
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    await page.getByRole('button', { name: /^bold$/i }).click()
    await expect(editor.locator('strong')).toHaveText('bold me')
  })

  test('markdown "# " becomes a heading', async ({ page }) => {
    const editor = await openBlankDoc(page)
    await editor.type('# Markdown title')
    await expect(editor.locator('h1')).toHaveText('Markdown title')
  })

  test('to-do checkbox toggles done state', async ({ page }) => {
    const editor = await openBlankDoc(page)
    await editor.type('[] finish tests')
    const checkbox = editor.locator('input[type="checkbox"]')
    await expect(checkbox).toBeVisible()
    await checkbox.check()
    // Tiptap marks the taskItem checked via a data-checked attribute on the <li>.
    await expect(editor.locator('li[data-checked="true"]')).toBeVisible()
  })

  test('toggle collapses to hide its content', async ({ page }) => {
    const editor = await openBlankDoc(page)
    await editor.type('/toggle')
    await page.getByRole('option', { name: /^toggle$/i }).click()
    await editor.type('hidden body')
    const content = editor.locator('[data-testid="toggle-content"]')
    await expect(content).toBeVisible()
    await page.getByRole('button', { name: /toggle section/i }).click()
    await expect(content).toBeHidden()
  })

  test('image inserts via URL prompt', async ({ page }) => {
    const editor = await openBlankDoc(page)
    // The image slash item asks for a URL via window.prompt.
    page.once('dialog', (dialog) => dialog.accept('https://example.com/cat.png'))
    await editor.type('/image')
    await page.getByRole('option', { name: /^image$/i }).click()
    await expect(editor.locator('img')).toHaveAttribute('src', 'https://example.com/cat.png')
  })
})
