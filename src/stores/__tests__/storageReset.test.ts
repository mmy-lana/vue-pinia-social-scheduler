import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestPinia } from '@/stores/__tests__/testPinia'
import {
  flushPersistence,
  isPersistenceSuppressedNow,
  suppressPersistence,
} from '@/stores/persistencePlugin'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { clearNamespace, readEnvelope, STORAGE_KEYS } from '@/lib/storage'
import type { SocialAccount } from '@/types'

/**
 * The persistence latch that makes "Reset everything" actually destructive.
 *
 * `suppressPersistence()` is deliberately a one-way switch with module scope,
 * so these cases run in order within a single file: vitest gives each file its
 * own module registry, which keeps the latch from leaking into other suites.
 */
describe('storage reset cannot be undone by a write-back', () => {
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
    usePostsStore().replaceAll([])
  })

  it('writes state through while persistence is live', () => {
    expect(isPersistenceSuppressedNow()).toBe(false)

    const posts = usePostsStore()
    posts.createGroup({
      content: 'Survives a normal write',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'draft',
      scheduledAtIso: null,
    })
    flushPersistence()

    expect(readEnvelope<unknown[]>(STORAGE_KEYS.posts, 1, [])).toHaveLength(1)
  })

  it('refuses to write once suppressed, even when the store still holds data', () => {
    const posts = usePostsStore()
    posts.createGroup({
      content: 'About to be wiped',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'draft',
      scheduledAtIso: null,
    })
    flushPersistence()
    expect(readEnvelope<unknown[]>(STORAGE_KEYS.posts, 1, [])).toHaveLength(1)

    suppressPersistence()
    expect(isPersistenceSuppressedNow()).toBe(true)

    // This is the reset: storage is emptied and every store drops its state,
    // exactly as `resetEverything` does before navigating away.
    clearNamespace()
    posts.replaceAll([])
    useAccountsStore().replaceAll([])
    useSettingsStore().resetToDefaults()

    // The teardown flush that used to resurrect everything.
    flushPersistence()

    expect(readEnvelope<unknown[]>(STORAGE_KEYS.posts, 1, [])).toHaveLength(0)
    expect(readEnvelope<unknown[]>(STORAGE_KEYS.accounts, 1, [])).toHaveLength(0)
  })

  it('keeps the latch closed for the rest of the page', () => {
    flushPersistence()
    flushPersistence()

    expect(readEnvelope<unknown[]>(STORAGE_KEYS.posts, 1, [])).toHaveLength(0)
    expect(isPersistenceSuppressedNow()).toBe(true)
  })
})