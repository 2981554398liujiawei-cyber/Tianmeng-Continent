import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LocalSyncNote, shouldNavigateAfterSync, type LocalSyncStatus } from './SaveSlotsPage'

describe('LocalSyncNote', () => {
  it.each<[LocalSyncStatus, string]>([
    ['synced', '本地已保存+云端已同步'],
    ['offline', '云同步未启用'],
    ['cloud_failed', '云同步失败'],
  ])('renders the exact %s copy', (status, copy) => {
    const note = createElement(LocalSyncNote, { status, onRetry: vi.fn() })
    expect(renderToStaticMarkup(note)).toContain(copy)
  })

  it('renders nothing for null', () => {
    const note = createElement(LocalSyncNote, { status: null, onRetry: vi.fn() })
    expect(renderToStaticMarkup(note)).toBe('')
  })

  it('reports local success without claiming cloud sync in offline mode', () => {
    const note = createElement(LocalSyncNote, { status: 'offline', onRetry: vi.fn() })
    const markup = renderToStaticMarkup(note)
    expect(markup).toContain('本地已保存')
    expect(markup).toContain('云同步未启用')
    expect(markup).not.toContain('云端已同步')
  })
})

describe('sync navigation semantics', () => {
  it('leaves only after the original save succeeds', () => {
    expect(shouldNavigateAfterSync('save')).toBe(true)
    expect(shouldNavigateAfterSync('delete')).toBe(false)
    expect(shouldNavigateAfterSync('import')).toBe(false)
    expect(shouldNavigateAfterSync('retry')).toBe(false)
  })
})
