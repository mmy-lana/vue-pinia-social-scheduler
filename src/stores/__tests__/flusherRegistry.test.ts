import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestPinia } from '@/stores/__tests__/testPinia'
import {
  flushPersistence,
  unregisterStorePersistence,
} from '@/stores/persistencePlugin'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { readEnvelope, STORAGE_KEYS, writeEnvelope } from '@/lib/storage'
import type { SocialAccount } from '@/types'

/**
 * The flusher registry used to be a `Set`, so every store instance that ever
 * registered added another closure that nothing ever removed — each one holding
 * its store alive and still being called by `flushPersistence`. These cases pin
 * the keyed behaviour: re-registering replaces, unregistering removes, and an
 * unregistered store stops being written.
 */
describe('persistence flusher registry', () => {
  let account: SocialAccount

  beforeEach(() => {
    window.localStorage.clear()
    createTestPinia()
    useSettingsStore().update({ timezone: 'UTC' })
    const added = useAccountsStore().add({
      platform: 'x',
      handle: 'lanabuilds',
      displayName: 'Lana Builds',
    })
    if (!added.ok) throw new Error(`fixture failed: ${JSON.stringify(added.error)}`)
    account = added.value
  })

  afterEach(() => {
    vi.useRealTimers()
    usePostsStore().replaceAll([])
  })

  it('flushes every registered store in one pass', () => {
    const posts = usePostsStore()
    posts.replaceAll([])
    writeEnvelope(STORAGE_KEYS.posts, 1, [])

    posts.createGroup({
      content: 'Flushed by key',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'draft',
      scheduledAtIso: null,
    })
    flushPersistence()

    expect(readEnvelope<unknown[]>(STORAGE_KEYS.posts, 1, [])).toHaveLength(1)
  })

  it('removes a key from the registry so no forced flush reaches it', () => {
    const posts = usePostsStore()
    posts.replaceAll([])
    writeEnvelope(STORAGE_KEYS.posts, 1, [])

    posts.createGroup({
      content: 'Held in memory only',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'draft',
      scheduledAtIso: null,
    })

    // Unregistering withdraws the writer that `flushPersistence` uses. The
    // store's own subscription is a separate path and is unaffected, which is
    // what makes this safe for a live store and correct for a disposed one.
    unregisterStorePersistence(STORAGE_KEYS.posts)
    flushPersistence()

    expect(readEnvelope<unknown[]>(STORAGE_KEYS.posts, 1, [])).toHaveLength(0)
  })

  it('does not grow the registry when the same key registers again', () => {
    const first = createTestPinia()
    const postsA = usePostsStore(first)
    postsA.replaceAll([])
    postsA.createGroup({
      content: 'First instance',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'draft',
      scheduledAtIso: null,
    })

    // A second instance for the same store id replaces the first writer rather
    // than adding a second one, so the stale closure cannot also write.
    const second = createTestPinia()
    const postsB = usePostsStore(second)
    postsB.replaceAll([])

    flushPersistence()
    expect(readEnvelope<unknown[]>(STORAGE_KEYS.posts, 1, [])).toHaveLength(0)
  })
})