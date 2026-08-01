import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { slashItems } from '@/components/editor/extensions/slash-items'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHeadlessEditor(extensions: Extensions = []) {
  return new Editor({
    extensions: [StarterKit, ...extensions],
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  })
}

// The configured Image extension – identical config to what BlockEditor registers
const ConfiguredImage = Image.configure({ inline: false, allowBase64: false })

// ---------------------------------------------------------------------------
// Image node – schema registration
// ---------------------------------------------------------------------------

describe('Image node', () => {
  it('registers the "image" node type when the extension is added', () => {
    const editor = makeHeadlessEditor([ConfiguredImage])
    expect(editor.schema.nodes['image']).toBeDefined()
    editor.destroy()
  })

  it('setImage inserts an image node with the correct src', () => {
    const editor = makeHeadlessEditor([ConfiguredImage])
    editor.chain().focus().setImage({ src: 'https://example.com/cat.png' }).run()
    const json = editor.getJSON()
    const imageNode = json.content?.find((n) => n.type === 'image')
    expect(imageNode).toBeDefined()
    expect(imageNode?.attrs?.src).toBe('https://example.com/cat.png')
    editor.destroy()
  })

  it('image node is block-level (sits at doc top level, not inside a paragraph)', () => {
    const editor = makeHeadlessEditor([ConfiguredImage])
    editor.chain().focus().setImage({ src: 'https://example.com/cat.png' }).run()
    const json = editor.getJSON()
    // In block mode the image node should appear as a direct child of doc
    const topLevelTypes = json.content?.map((n) => n.type) ?? []
    expect(topLevelTypes).toContain('image')
    editor.destroy()
  })

  it('Image extension is configured with allowBase64: false', () => {
    // allowBase64 defaults to false, so also assert configure() can flip it —
    // this proves the option is actually wired, not just matching the default.
    expect(ConfiguredImage.options.allowBase64).toBe(false)
    expect(Image.configure({ allowBase64: true }).options.allowBase64).toBe(true)
  })

  it('Image extension is configured as block-level (inline: false)', () => {
    expect(ConfiguredImage.options.inline).toBe(false)
    expect(Image.configure({ inline: true }).options.inline).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Slash-items registry – presence of Image entry
// ---------------------------------------------------------------------------

describe('slashItems image entry', () => {
  it('contains an Image item', () => {
    expect(slashItems.some((i) => i.title === 'Image')).toBe(true)
  })

  it('Image item has "image" in its keywords', () => {
    const item = slashItems.find((i) => i.title === 'Image')
    expect(item).toBeDefined()
    expect(item?.keywords).toContain('image')
  })

  it('Image item has a command function', () => {
    const item = slashItems.find((i) => i.title === 'Image')
    expect(typeof item?.command).toBe('function')
  })
})
