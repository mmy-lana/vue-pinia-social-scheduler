import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { useSlotsStore } from '@/stores/useSlotsStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { useMediaStore } from '@/stores/useMediaStore'
import { useActivityStore } from '@/stores/useActivityStore'
import { useUiStore } from '@/stores/useUiStore'
import { MAX_QUEUE_SLOTS_PER_ACCOUNT } from '@/lib/queue'
import type { PlatformId } from '@/types'

function freshPinia() {
  window.localStorage.clear()
  setActivePinia(createPinia())
}

function addAccount(overrides: { platform?: PlatformId; handle?: string; connected?: boolean } = {}) {
  const accounts = useAccountsStore()
  const result = accounts.add({
    platform: overrides.platform ?? 'x',
    handle: overrides.handle ?? 'lanabuilds',
    displayName: 'Lana Builds',
    connected: overrides.connected ?? true,
  })
  if (!result.ok) throw new Error(`fixture failed: ${JSON.stringify(result.error)}`)
  return result.value
}

describe('useAccountsStore', () => {
  beforeEach(freshPinia)

  it('adds a valid account with a derived hue and normalized handle', () => {
    const accounts = useAccountsStore()
    const result = accounts.add({
      platform: 'linkedin',
      handle: '@lana.builds',
      displayName: '  Lana · Product  ',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.handle).toBe('lana.builds')
    expect(result.value.displayName).toBe('Lana · Product')
    expect(result.value.connected).toBe(true)
    expect(result.value.avatarHue).toBeGreaterThanOrEqual(0)
    expect(result.value.avatarHue).toBeLessThan(360)
    expect(accounts.count).toBe(1)
  })

  it('rejects a duplicate handle on the same platform but allows it elsewhere', () => {
    const accounts = useAccountsStore()
    addAccount({ platform: 'x', handle: 'lana' })
    const duplicate = accounts.add({ platform: 'x', handle: 'LANA', displayName: 'Other' })
    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) expect(duplicate.error.handle).toContain('already connected')

    const other = accounts.add({ platform: 'threads', handle: 'lana', displayName: 'Other' })
    expect(other.ok).toBe(true)
  })

  it('rejects an invalid handle, display name and platform', () => {
    const accounts = useAccountsStore()
    const badHandle = accounts.add({ platform: 'x', handle: 'a', displayName: 'Lana' })
    expect(badHandle.ok).toBe(false)

    const badName = accounts.add({ platform: 'x', handle: 'lana', displayName: '   ' })
    expect(badName.ok).toBe(false)

    const badPlatform = accounts.add({
      platform: 'myspace' as PlatformId,
      handle: 'lana',
      displayName: 'Lana',
    })
    expect(badPlatform.ok).toBe(false)
    if (!badPlatform.ok) expect(badPlatform.error.platform).toBeDefined()
  })

  it('renames and toggles connection state', () => {
    const accounts = useAccountsStore()
    const account = addAccount()
    expect(accounts.rename(account.id, 'Lana Studio').ok).toBe(true)
    expect(accounts.get(account.id)?.displayName).toBe('Lana Studio')
    expect(accounts.rename(account.id, '').ok).toBe(false)
    expect(accounts.rename('missing', 'Nope').ok).toBe(false)

    accounts.setConnected(account.id, false)
    expect(accounts.get(account.id)?.connected).toBe(false)
    expect(accounts.connected).toHaveLength(0)
    expect(accounts.setConnected('missing', true).ok).toBe(false)
  })

  it('lists accounts per platform and by id', () => {
    const accounts = useAccountsStore()
    const x = addAccount({ platform: 'x', handle: 'xhandle' })
    const threads = addAccount({ platform: 'threads', handle: 'thandle' })
    expect(accounts.forPlatform('x')).toHaveLength(1)
    expect(accounts.forIds([x.id, threads.id, 'ghost'])).toHaveLength(2)
  })

  it('cascades a removal to slots, posts and unreferenced media', () => {
    const accounts = useAccountsStore()
    const posts = usePostsStore()
    const slots = useSlotsStore()
    const media = useMediaStore()
    const activity = useActivityStore()
    const account = addAccount()

    slots.add(account.id, 1, '09:00')
    const created = posts.createGroup({
      content: 'Hello',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'draft',
      scheduledAtIso: null,
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const post = created.value.posts[0]
    if (!post) throw new Error('expected a post')
    media.replaceAll([
      {
        id: 'media-1',
        name: 'a.jpg',
        mime: 'image/jpeg',
        width: 10,
        height: 10,
        bytes: 100,
        dataUrl: 'data:image/jpeg;base64,AAAA',
        createdAt: post.createdAt,
        updatedAt: post.createdAt,
      },
    ])
    posts.update(post.id, { mediaIds: ['media-1'] })
    expect(activity.entries.length).toBe(2)

    const snapshot = accounts.remove(account.id)
    expect(snapshot).not.toBeNull()
    expect(accounts.count).toBe(0)
    expect(slots.slots).toHaveLength(0)
    expect(posts.posts).toHaveLength(0)
    expect(media.assets).toHaveLength(0)
    expect(activity.entries.some((entry) => entry.postId === post.id)).toBe(false)
    expect(useUiStore().toasts.at(-1)?.action?.label).toBe('Undo')
  })

  it('restores everything after an undo', () => {
    const accounts = useAccountsStore()
    const posts = usePostsStore()
    const slots = useSlotsStore()
    const account = addAccount()
    slots.add(account.id, 2, '10:00')
    posts.createGroup({
      content: 'Hi',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'draft',
      scheduledAtIso: null,
    })

    const snapshot = accounts.remove(account.id)
    expect(snapshot).not.toBeNull()
    if (!snapshot) return

    accounts.restore(snapshot)
    expect(accounts.count).toBe(1)
    expect(slots.slots).toHaveLength(1)
    expect(posts.posts).toHaveLength(1)
  })

  it('ignores removing an unknown account', () => {
    expect(useAccountsStore().remove('ghost')).toBeNull()
  })
})

describe('useSlotsStore', () => {
  beforeEach(freshPinia)

  it('adds, sorts and de-duplicates slots', () => {
    const slots = useSlotsStore()
    const account = addAccount()
    expect(slots.add(account.id, 3, '09:00').ok).toBe(true)
    expect(slots.add(account.id, 1, '17:00').ok).toBe(true)
    expect(slots.forAccount(account.id).map((slot) => slot.weekday)).toEqual([1, 3])
    expect(slots.add(account.id, 3, '09:00').ok).toBe(false)
    expect(slots.hasSlotsFor(account.id)).toBe(true)
  })

  it('rejects an invalid time and enforces the per-account cap', () => {
    const slots = useSlotsStore()
    const account = addAccount()
    expect(slots.add(account.id, 1, '9:00').ok).toBe(false)
    for (let i = 0; i < MAX_QUEUE_SLOTS_PER_ACCOUNT; i += 1) {
      slots.add(account.id, 1, `${String(i).padStart(2, '0')}:00`)
    }
    const overflow = slots.add(account.id, 2, '08:00')
    expect(overflow.ok).toBe(false)
    if (!overflow.ok) expect(overflow.error).toContain('14')
  })

  it('removes one slot and clears an account', () => {
    const slots = useSlotsStore()
    const account = addAccount()
    const first = slots.add(account.id, 1, '09:00')
    slots.add(account.id, 2, '09:00')
    if (!first.ok) throw new Error('fixture failed')
    expect(slots.remove(first.value.id)).toBe(true)
    expect(slots.remove('ghost')).toBe(false)
    expect(slots.clearForAccount(account.id)).toHaveLength(1)
    expect(slots.slots).toHaveLength(0)
  })

  it('seeds the Mon–Fri default pattern, replacing whatever was there', () => {
    const slots = useSlotsStore()
    const account = addAccount()
    slots.add(account.id, 6, '03:00')
    const created = slots.seedDefault(account.id)
    expect(created).toHaveLength(10)
    expect(slots.forWeekday(account.id, 0)).toHaveLength(0)
    expect(slots.forWeekday(account.id, 1)).toHaveLength(2)
  })

  it('copies one channel pattern to the others', () => {
    const slots = useSlotsStore()
    const source = addAccount({ platform: 'x', handle: 'source' })
    const other = addAccount({ platform: 'linkedin', handle: 'other' })
    const third = addAccount({ platform: 'threads', handle: 'third' })
    slots.seedDefault(source.id)
    const created = slots.copyToAll(source.id, [source.id, other.id, third.id])
    expect(created).toHaveLength(20)
    expect(slots.forAccount(other.id)).toHaveLength(10)

    slots.add(other.id, 6, '23:00')
    slots.copyToAll(source.id, [source.id, other.id])
    expect(slots.forWeekday(other.id, 6)).toHaveLength(0)
  })

  it('restores slots without duplicating ids', () => {
    const slots = useSlotsStore()
    const account = addAccount()
    const added = slots.add(account.id, 1, '09:00')
    if (!added.ok) throw new Error('fixture failed')
    slots.restore([added.value])
    expect(slots.slots).toHaveLength(1)
  })
})
