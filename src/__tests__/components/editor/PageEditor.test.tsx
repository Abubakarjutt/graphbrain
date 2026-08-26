import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PageEditor } from '@/components/editor/PageEditor'
import { updatePageTitle, saveBlocks } from '@/lib/actions/pages'
import type { TiptapDocument } from '@/lib/types/database'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/actions/pages', () => ({
  updatePageTitle: vi.fn().mockResolvedValue(undefined),
  saveBlocks: vi.fn().mockResolvedValue(undefined),
}))

// BlockEditor wraps the real Tiptap editor — replaced here with a stub that
// exposes a button to invoke onSave on demand, so PageEditor's own save/error
// handling can be tested without driving a full contenteditable instance.
vi.mock('@/components/editor/BlockEditor', () => ({
  BlockEditor: ({ onSave }: { doc: TiptapDocument; onSave: (doc: TiptapDocument) => void }) => (
    <button onClick={() => onSave({ type: 'doc', content: [] })}>trigger-editor-save</button>
  ),
}))

vi.mock('@/components/files/FileUploadButton', () => ({
  FileUploadButton: ({ onFileCreated }: { onFileCreated: (pageId: string, filename: string) => void }) => (
    <button onClick={() => onFileCreated('new-file-page-id', 'notes.pdf')}>trigger-file-upload</button>
  ),
}))

const emptyDoc: TiptapDocument = { type: 'doc', content: [] }

function renderEditor(overrides: Partial<React.ComponentProps<typeof PageEditor>> = {}) {
  return render(
    <PageEditor
      pageId="page-1"
      workspaceId="ws-1"
      initialTitle="My Page"
      initialDoc={emptyDoc}
      {...overrides}
    />
  )
}

describe('PageEditor', () => {
  beforeEach(() => {
    vi.mocked(updatePageTitle).mockReset().mockResolvedValue(undefined)
    vi.mocked(saveBlocks).mockReset().mockResolvedValue(undefined)
  })

  it('renders the title input pre-filled with the initial title', () => {
    renderEditor()
    expect(screen.getByLabelText('Page title')).toHaveValue('My Page')
  })

  it('shows "Untitled" in the breadcrumb when the title is empty', () => {
    renderEditor({ initialTitle: '' })
    expect(screen.getAllByText('Untitled').length).toBeGreaterThan(0)
  })

  it('shows the workspace name in the breadcrumb when provided', () => {
    renderEditor({ workspaceName: 'Acme Workspace' })
    expect(screen.getByText('Acme Workspace')).toBeInTheDocument()
  })

  it('omits the workspace breadcrumb segment when no workspace name is given', () => {
    renderEditor()
    expect(screen.queryByText('Acme Workspace')).not.toBeInTheDocument()
  })

  it('saves the title on blur with the current field value', async () => {
    renderEditor()
    const input = screen.getByLabelText('Page title')
    fireEvent.change(input, { target: { value: 'Renamed Page' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(updatePageTitle).toHaveBeenCalledWith('page-1', 'ws-1', 'Renamed Page')
    })
  })

  it('shows an error message when saving the title fails', async () => {
    vi.mocked(updatePageTitle).mockRejectedValueOnce(new Error('network down'))
    renderEditor()
    const input = screen.getByLabelText('Page title')
    fireEvent.blur(input)

    await waitFor(() => {
      expect(screen.getByText('save failed')).toBeInTheDocument()
    })
  })

  it('calls saveBlocks with the current title when the editor saves content', async () => {
    renderEditor()
    fireEvent.click(screen.getByText('trigger-editor-save'))

    await waitFor(() => {
      expect(saveBlocks).toHaveBeenCalledWith('page-1', 'ws-1', { type: 'doc', content: [] }, 'My Page')
    })
  })

  it('shows an error message when saving content fails', async () => {
    vi.mocked(saveBlocks).mockRejectedValueOnce(new Error('boom'))
    renderEditor()
    fireEvent.click(screen.getByText('trigger-editor-save'))

    await waitFor(() => {
      expect(screen.getByText('save failed')).toBeInTheDocument()
    })
  })

  it('clears a previous save error once a later save succeeds', async () => {
    vi.mocked(saveBlocks).mockRejectedValueOnce(new Error('boom'))
    renderEditor()
    fireEvent.click(screen.getByText('trigger-editor-save'))
    await waitFor(() => {
      expect(screen.getByText('save failed')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('trigger-editor-save'))
    await waitFor(() => {
      expect(screen.queryByText('save failed')).not.toBeInTheDocument()
    })
  })

  it('renders pre-existing file attachments', () => {
    renderEditor({ fileAttachments: [{ pageId: 'file-1', filename: 'design.pdf' }] })
    const link = screen.getByText('design.pdf').closest('a')
    expect(link).toHaveAttribute('href', '/workspace/ws-1/page/file-1')
  })

  it('adds a new attachment to the list when a file finishes uploading', async () => {
    const user = userEvent.setup()
    renderEditor()
    expect(screen.queryByText('notes.pdf')).not.toBeInTheDocument()

    await user.click(screen.getByText('trigger-file-upload'))

    const link = screen.getByText('notes.pdf').closest('a')
    expect(link).toHaveAttribute('href', '/workspace/ws-1/page/new-file-page-id')
  })

  it('updates the title input as the user types', () => {
    renderEditor()
    const input = screen.getByLabelText('Page title')
    fireEvent.change(input, { target: { value: 'New name' } })
    expect(input).toHaveValue('New name')
  })
})
