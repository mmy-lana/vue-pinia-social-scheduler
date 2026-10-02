import { beforeEach, describe, expect, it } from 'vitest'
import { createTestPinia } from '@/stores/__tests__/testPinia'
import { useMediaStore } from '@/stores/useMediaStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { MAX_MEDIA_ASSETS_TOTAL } from '@/lib/platforms'
import type { MediaAsset } from '@/types'

function asset(id: string, overrides: Partial<MediaAsset> = {}): MediaAsset {
  const now = new Date().toISOString()
  return {
    id,
    name: `${id}.jpg`,
    mime: 'image/jpeg',
    width: 1200,
    height: 800,
    bytes: 2_048,
    dataUrl: 'data:image/jpeg;base64,AAAA',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function gifFile(name = 'loop.gif', size = 1_024): File {
  return new File([new Uint8Array(size)], name, { type: 'image/gif' })
}

beforeEach(() => {
  window.localStorage.clear()
  createTestPinia({ persist: false })
})

describe('useMediaStore', () => {
  it('starts empty', () => {
    const media = useMediaStore()
    expect(media.assets).toEqual([])
    expect(media.totalBytes).toBe(0)
    expect(media.isFull).toBe(false)
  })

  it('stores a compressed asset produced by the pipeline', async () => {
    const media = useMediaStore()
    const result = await media.addFiles([gifFile()])
    expect(result.errors).toEqual([])
    expect(result.added).toHaveLength(1)
    expect(media.count).toBe(1)
    expect(media.isFull).toBe(false)
    expect(media.totalBytes).toBeGreaterThan(0)
    expect(media.lastAddedIds).toHaveLength(1)
  })

  it('collects per-file errors without blocking the good ones', async () => {
    const media = useMediaStore()
    const bad = new File([new Uint8Array(8)], 'notes.txt', { type: 'text/plain' })
    const result = await media.addFiles([bad, gifFile('ok.gif')])
    expect(result.added).toHaveLength(1)
    expect(result.errors[0]).toContain('unsupported file type')
  })

  it('refuses to start once the library is full', async () => {
    const media = useMediaStore()
    media.replaceAll(Array.from({ length: MAX_MEDIA_ASSETS_TOTAL }, (_, i) => asset(`m${i}`)))
    const result = await media.addFiles([gifFile()])
    expect(result.added).toHaveLength(0)
    expect(result.skipped).toBe(1)
    expect(result.errors[0]).toContain('Media library is full')
    expect(media.isFull).toBe(true)
  })

  it('skips the overflow files inside one batch', async () => {
    const media = useMediaStore()
    media.replaceAll(Array.from({ length: MAX_MEDIA_ASSETS_TOTAL - 1 }, (_, i) => asset(`m${i}`)))
    const result = await media.addFiles([gifFile('a.gif'), gifFile('b.gif')])
    expect(result.added).toHaveLength(1)
    expect(result.skipped).toBe(1)
  })

  it('resolves, checks and totals assets', () => {
    const media = useMediaStore()
    media.replaceAll([asset('a'), asset('b', { bytes: 1_024 })])
    expect(media.exists('a')).toBe(true)
    expect(media.exists('ghost')).toBe(false)
    expect(media.resolveMany(['b', 'ghost', 'a'])).toHaveLength(2)
    expect(media.totalBytes).toBe(3_072)
  })

  it('removes one, many, and garbage-collects unreferenced assets', () => {
    const media = useMediaStore()
    const posts = usePostsStore()
    media.replaceAll([asset('used'), asset('orphan'), asset('other')])

    expect(media.remove('missing')).toBe(false)
    expect(media.remove('other')).toBe(true)
    expect(media.assets.map((item) => item.id)).toEqual(['used', 'orphan'])

    // Nothing references media in this fresh store, so everything is collected.
    expect(media.gc(posts.referencedMediaIds())).toHaveLength(2)
    expect(media.assets).toHaveLength(0)
  })

  it('keeps assets that a post still references', () => {
    const media = useMediaStore()
    media.replaceAll([asset('used'), asset('orphan')])
    expect(media.gc(new Set(['used']))).toHaveLength(1)
    expect(media.assets.map((item) => item.id)).toEqual(['used'])
  })

  it('rolls back the last batch after a quota error', async () => {
    const media = useMediaStore()
    await media.addFiles([gifFile('one.gif')])
    expect(media.assets).toHaveLength(1)
    const rolledBack = media.rollBackLastAdd()
    expect(rolledBack).toHaveLength(1)
    expect(media.assets).toHaveLength(0)
    expect(media.rollBackLastAdd()).toHaveLength(0)
  })

  it('restores snapshots without duplicating ids', () => {
    const media = useMediaStore()
    media.replaceAll([asset('a')])
    media.restore([asset('a'), asset('b')])
    expect(media.count).toBe(2)
    expect(media.assets.map((item) => item.id).sort()).toEqual(['a', 'b'])
  })
})