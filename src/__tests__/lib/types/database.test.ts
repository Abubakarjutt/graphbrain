import { describe, it, expectTypeOf } from 'vitest'
import type {
  Workspace,
  WorkspaceMember,
  Page,
  Block,
  FileRecord,
  Database,
  DatabaseRow,
  Node,
  Edge,
  QueryLog,
  WorkspaceRole,
  EntityType,
  RelationshipType,
  BlockType,
  DatabaseField,
  QueryLogSource,
} from '@/lib/types/database'

describe('database types', () => {
  it('Workspace has correct shape', () => {
    expectTypeOf<Workspace>().toHaveProperty('id').toBeString()
    expectTypeOf<Workspace>().toHaveProperty('name').toBeString()
    expectTypeOf<Workspace>().toHaveProperty('owner_id').toBeString()
    expectTypeOf<Workspace>().toHaveProperty('created_at').toBeString()
  })

  it('Page has nullable parent_id', () => {
    expectTypeOf<Page['parent_id']>().toEqualTypeOf<string | null>()
  })

  it('WorkspaceRole is a union of valid roles', () => {
    expectTypeOf<WorkspaceRole>().toEqualTypeOf<'owner' | 'editor' | 'viewer'>()
  })

  it('EntityType is a union of valid types', () => {
    expectTypeOf<EntityType>().toEqualTypeOf<'page' | 'block' | 'file' | 'database_row'>()
  })

  it('RelationshipType is a union of valid types', () => {
    expectTypeOf<RelationshipType>().toEqualTypeOf<'mention' | 'backlink' | 'parent_child' | 'manual'>()
  })

  it('Node has nullable embedding', () => {
    expectTypeOf<Node['embedding']>().toEqualTypeOf<number[] | null>()
  })
})
