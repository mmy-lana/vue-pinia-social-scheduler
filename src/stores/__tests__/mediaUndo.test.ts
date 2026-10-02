import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestPinia } from '@/stores/__tests__/testPinia'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { useMediaStore } from '@/stores/useMediaStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useUiStore } from '@/stores/useUiStore'
import { usePostActions, POST_UNDO_MS } from '@/composables/usePostActions'
import type { MediaAsset, SocialAccount } from '@/types'

function makeAsset(id: string): MediaAsset {
  const now = new Date().toISOString()
  return {
    id,
    name: `${id}.png`,
    mime: 'image/png',
    width: 640,
    height: 480,
    bytes: 2048,
    dataUrl: 'data:image/png;base64,AAAA',
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Deleting a post must not take its photos with it.
 *
 * Collecting media eagerly removed the assets the 8-second Undo window was
 * going to put back, so an undone deletion produced a post whose `mediaIds` no
 * longer resolved and whose images silently rendered as empty frames.
 */
describe('post deletion preserves media across the undo window', () => {
  let account: SocialAccount
  let postId: string

  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
    createTestPinia()
    useSettingsStore().update({ timezone: 'UTC' })

    const added = useAccountsStore().add({
      platform: 'instagram',
      handle: 'lanastudio',
      displayName: 'Lana Studio',
    })
    if (!added.ok) throw new Error(`fixture failed: ${JSON.stringify(added.error)}`)
    account = added.value

    const media = useMediaStore()
    media.replaceAll([makeAsset('asset-a')])

    const posts = usePostsStore()
    const created = posts.createGroup({
      content: 'With a photo',
      accountIds: [account.id],
      mediaIds: ['asset-a'],
      mode: 'draft',
      scheduledAtIso: null,
    })
    if (!created.ok) throw new Error('fixture post failed')
    postId = created.value.posts[0]?.id ?? ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('snapshots the media the deleted post referenced', () => {
    const snapshot = usePostsStore().remove(postId)

    expect(snapshot).not.toBeNull()
    expect(snapshot?.media.map((asset) => asset.id)).toEqual(['asset-a'])
  })

  it('restores the photos with the post on undo', () => {
    const posts = usePostsStore()
    const media = useMediaStore()

    const snapshot = posts.remove(postId)
    expect(snapshot).not.toBeNull()
    media.gc(posts.referencedMediaIds())

    expect(posts.get(postId)).toBeNull()

    posts.restore(snapshot!)

    expect(posts.get(postId)).not.toBeNull()
    // The asset resolves again, so the restored card renders its image.
    expect(media.resolveMany(['asset-a'])).toHaveLength(1)
  })

  it('keeps the asset alive until the undo window closes, then collects it', () => {
    const media = useMediaStore()
    const ui = useUiStore()
    const actions = usePostActions()

    void actions.run(postId, 'delete')

    // Nothing is swept yet: the snapshot is still open.
    vi.advanceTimersByTime(POST_UNDO_MS - 1)
    expect(media.exists('asset-a')).toBe(true)
    expect(ui.postSnapshot).not.toBeNull()

    // Window closes with no undo.
    vi.advanceTimersByTime(2)
    expect(media.exists('asset-a')).toBe(false)
    actions.cancelMediaCollection()
  })

  it('does not collect media when the undo window is still open', () => {
    const posts = usePostsStore()
    const media = useMediaStore()
    const ui = useUiStore()
    const actions = usePostActions()

    void actions.run(postId, 'delete')
    expect(ui.postSnapshot).not.toBeNull()

    // Undo through the toast action the store registered.
    const toast = ui.toasts.find((item) => item.action?.label === 'Undo')
    expect(toast).toBeDefined()
    toast?.action?.run()

    vi.advanceTimersByTime(POST_UNDO_MS + 10)

    expect(posts.get(postId)).not.toBeNull()
    expect(media.exists('asset-a')).toBe(true)
    actions.cancelMediaCollection()
  })

  it('raises exactly one toast for a deletion', () => {
    const ui = useUiStore()
    const actions = usePostActions()

    ui.toasts.length = 0
    void actions.run(postId, 'delete')

    const deletions = ui.toasts.filter((item) => item.message.startsWith('Deleted'))
    expect(deletions).toHaveLength(1)
    actions.cancelMediaCollection()
  })
})