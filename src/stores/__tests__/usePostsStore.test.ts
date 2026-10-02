import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { useSlotsStore } from '@/stores/useSlotsStore'
import { useMediaStore } from '@/stores/useMediaStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useActivityStore } from '@/stores/useActivityStore'
import { useSchedulerStore } from '@/stores/useSchedulerStore'
import { useUiStore } from '@/stores/useUiStore'
import { HORIZON_DAYS } from '@/lib/queue'
import { minuteKey } from '@/lib/queue'
import type { PlatformId, SocialAccount } from '@/types'

function freshPinia() {
  window.localStorage.clear()
  setActivePinia(createPinia())
  useSettingsStore().update({ timezone: 'Asia/Jakarta' })
  return useAccountsStore()
}

function addAccount(handle: string, platform: PlatformId = 'x'): SocialAccount {
  const result = useAccountsStore().add({ platform, handle, displayName: `@${handle}` })
  if (!result.ok) throw new Error(`fixture failed: ${JSON.stringify(result.error)}`)
  return result.value
}

const FUTURE = new Date(Date.now() + 3 * 60 * 60_000).toISOString()

describe('usePostsStore — create', () => {
  beforeEach(freshPinia)

  it('creates one post per channel and shares a group id', () => {
    const a = addAccount('alpha')
    const b = addAccount('beta', 'linkedin')
    const posts = usePostsStore()

    const result = posts.createGroup({
      content: 'Launch day!',
      accountIds: [a.id, b.id],
      mediaIds: [],
      mode: 'schedule',
      scheduledAtIso: FUTURE,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.posts).toHaveLength(2)
    expect(new Set(result.value.posts.map((post) => post.groupId)).size).toBe(1)
    expect(result.value.posts.every((post) => post.status === 'scheduled')).toBe(true)
    expect(posts.scheduled).toHaveLength(2)
    expect(useActivityStore().entries[0]?.type).toBe('scheduled')
  })

  it('saves drafts with no scheduled time', () => {
    const account = addAccount('alpha')
    const posts = usePostsStore()
    const result = posts.createGroup({
      content: 'Rough idea',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'draft',
      scheduledAtIso: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.posts[0]?.status).toBe('draft')
    expect(result.value.posts[0]?.scheduledAt).toBeNull()
    expect(posts.drafts).toHaveLength(1)
  })

  it('rejects an empty post, a missing channel and a disconnected channel', () => {
    const posts = usePostsStore()
    const empty = posts.createGroup({
      content: '  ',
      accountIds: [],
      mediaIds: [],
      mode: 'schedule',
      scheduledAtIso: FUTURE,
    })
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.error.accounts).toBeDefined()

    const account = addAccount('alpha')
    useAccountsStore().setConnected(account.id, false)
    const disconnected = posts.createGroup({
      content: 'Hi',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'schedule',
      scheduledAtIso: FUTURE,
    })
    expect(disconnected.ok).toBe(false)
    if (!disconnected.ok) expect(disconnected.error.accounts).toContain('disconnected')
  })

  it('enforces the strictest channel limit and Instagram media', () => {
    const x = addAccount('alpha')
    const instagram = addAccount('beta', 'instagram')
    const posts = usePostsStore()

    const tooLong = posts.createGroup({
      content: 'x'.repeat(281),
      accountIds: [x.id],
      mediaIds: [],
      mode: 'schedule',
      scheduledAtIso: FUTURE,
    })
    expect(tooLong.ok).toBe(false)
    if (!tooLong.ok) expect(tooLong.error.content).toContain('X')

    const noMedia = posts.createGroup({
      content: 'Caption',
      accountIds: [instagram.id],
      mediaIds: [],
      mode: 'schedule',
      scheduledAtIso: FUTURE,
    })
    expect(noMedia.ok).toBe(false)
    if (!noMedia.ok) expect(noMedia.error.media).toContain('Instagram')
  })

  it('rejects a schedule inside the lead time', () => {
    const account = addAccount('alpha')
    const posts = usePostsStore()
    const result = posts.createGroup({
      content: 'Soon',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'schedule',
      scheduledAtIso: new Date(Date.now() + 5_000).toISOString(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.schedule).toContain('1 minute')
  })

  it('queues into the next free slot and never double-books a minute', () => {
    const account = addAccount('alpha')
    const slots = useSlotsStore()
    slots.add(account.id, new Date().getDay() as never, '23:59')
    slots.add(account.id, ((new Date().getDay() + 1) % 7) as never, '08:00')
    const posts = usePostsStore()

    const first = posts.createGroup({
      content: 'One',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'queue',
      scheduledAtIso: null,
    })
    const second = posts.createGroup({
      content: 'Two',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'queue',
      scheduledAtIso: null,
    })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.value.posts[0]?.source).toBe('queue')
    expect(first.value.posts[0]?.scheduledAt).not.toBe(second.value.posts[0]?.scheduledAt)
  })

  it('skips channels without posting times and warns', () => {
    const withSlots = addAccount('alpha')
    const withoutSlots = addAccount('beta', 'linkedin')
    useSlotsStore().seedDefault(withSlots.id)
    const posts = usePostsStore()

    const result = posts.createGroup({
      content: 'Queued',
      accountIds: [withSlots.id, withoutSlots.id],
      mediaIds: [],
      mode: 'queue',
      scheduledAtIso: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.posts).toHaveLength(1)
    expect(result.value.skipped.map((account) => account.id)).toEqual([withoutSlots.id])
    expect(useUiStore().toasts.at(-1)?.message).toContain('@beta')
  })

  it('fails the whole group when no channel has a free slot', () => {
    const account = addAccount('alpha')
    const slots = useSlotsStore()
    slots.seedDefault(account.id)
    const posts = usePostsStore()

    for (let day = 0; day <= HORIZON_DAYS; day += 1) {
      const when = new Date(Date.now() + day * 86_400_000)
      for (const hour of ['09:00', '17:00']) {
        const [h, m] = hour.split(':').map(Number)
        when.setHours(h ?? 0, m ?? 0, 0, 0)
        posts.posts.push({
          id: `busy-${day}-${hour}`,
          groupId: `g-${day}-${hour}`,
          accountId: account.id,
          content: 'busy',
          mediaIds: [],
          status: 'scheduled',
          scheduledAt: when.toISOString(),
          publishedAt: null,
          source: 'manual',
          attempts: 0,
          nextRetryAt: null,
          failure: null,
          metrics: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }
    }

    const result = posts.createGroup({
      content: 'Nowhere to go',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'queue',
      scheduledAtIso: null,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.schedule).toContain('60 days')
  })

  it('publishes immediately by scheduling at now', () => {
    const account = addAccount('alpha')
    const posts = usePostsStore()
    const scheduler = useSchedulerStore()
    const tick = vi.fn(() => Promise.resolve())
    scheduler.tick = tick

    const result = posts.createGroup({
      content: 'Ship it',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'now',
      scheduledAtIso: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Date.now() - new Date(result.value.posts[0]?.scheduledAt ?? 0).getTime()).toBeLessThan(5_000)
    expect(tick).toHaveBeenCalled()
  })
})

describe('usePostsStore — mutate', () => {
  let account: SocialAccount
  let postId: string

  beforeEach(() => {
    freshPinia()
    account = addAccount('alpha')
    useSlotsStore().seedDefault(account.id)
    const created = usePostsStore().createGroup({
      content: 'Original',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'schedule',
      scheduledAtIso: FUTURE,
    })
    if (!created.ok || !created.value.posts[0]) throw new Error('fixture failed')
    postId = created.value.posts[0].id
  })

  it('updates content and media on an editable post', () => {
    const posts = usePostsStore()
    useMediaStore().replaceAll([
      {
        id: 'media-1',
        name: 'a.jpg',
        mime: 'image/jpeg',
        width: 10,
        height: 10,
        bytes: 100,
        dataUrl: 'data:image/jpeg;base64,AAAA',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])
    const result = posts.update(postId, { content: 'Edited', mediaIds: ['media-1'] })
    expect(result.ok).toBe(true)
    expect(posts.get(postId)?.content).toBe('Edited')
    expect(posts.get(postId)?.mediaIds).toEqual(['media-1'])
  })

  it('rejects unknown media, over-long content and illegal transitions', () => {
    const posts = usePostsStore()
    expect(posts.update(postId, { mediaIds: ['ghost'] }).ok).toBe(false)
    expect(posts.update(postId, { content: 'x'.repeat(400) }).ok).toBe(false)
    expect(posts.update(postId, { status: 'published' }).ok).toBe(false)
    expect(posts.update('missing', { content: 'x' }).ok).toBe(false)
  })

  it('reschedules inside the window and resets the failure', () => {
    const posts = usePostsStore()
    const target = new Date(Date.now() + 5 * 60 * 60_000).toISOString()
    posts.update(postId, { status: 'failed' })
    posts.markFailed(postId, { code: 'RATE_LIMITED', message: 'Slow down', at: new Date().toISOString() })

    const ok = posts.reschedule(postId, target)
    expect(ok.ok).toBe(true)
    expect(posts.get(postId)?.scheduledAt).toBe(target)
    expect(posts.get(postId)?.failure).toBeNull()
    expect(posts.get(postId)?.status).toBe('scheduled')

    const tooSoon = posts.reschedule(postId, new Date(Date.now() + 1_000).toISOString())
    expect(tooSoon.ok).toBe(false)
    expect(posts.reschedule('missing', target).ok).toBe(false)
  })

  it('moves a post back to drafts and clears its time', () => {
    const posts = usePostsStore()
    expect(posts.moveToDraft(postId).ok).toBe(true)
    expect(posts.get(postId)?.status).toBe('draft')
    expect(posts.get(postId)?.scheduledAt).toBeNull()
    expect(posts.moveToDraft(postId).ok).toBe(false)
  })

  it('duplicates into a fresh draft that keeps the media', () => {
    const posts = usePostsStore()
    const copy = posts.duplicate(postId)
    expect(copy.ok).toBe(true)
    if (!copy.ok) return
    expect(copy.value.status).toBe('draft')
    expect(copy.value.source).toBe('manual')
    expect(copy.value.groupId).not.toBe(posts.get(postId)?.groupId)
    expect(posts.duplicate('missing').ok).toBe(false)
  })

  it('deletes the whole group and restores it on undo', () => {
    const posts = usePostsStore()
    const second = addAccount('beta', 'linkedin')
    const grouped = posts.createGroup({
      content: 'Siblings go together',
      accountIds: [account.id, second.id],
      mediaIds: [],
      mode: 'draft',
      scheduledAtIso: null,
    })
    if (!grouped.ok) throw new Error('fixture failed')
    const groupId = grouped.value.groupId
    expect(posts.forGroup(groupId)).toHaveLength(2)

    const snapshot = posts.remove(grouped.value.posts[0]?.id as string)
    expect(snapshot).not.toBeNull()
    expect(posts.posts).toHaveLength(1)
    expect(posts.forGroup(groupId)).toHaveLength(0)
    expect(useUiStore().toasts.at(-1)?.action?.label).toBe('Undo')

    if (!snapshot) return
    posts.restore(snapshot)
    expect(posts.posts).toHaveLength(3)
  })

  it('retries a failed post a few seconds out', () => {
    const posts = usePostsStore()
    posts.markFailed(postId, { code: 'RATE_LIMITED', message: 'Slow down', at: new Date().toISOString() })
    const result = posts.retry(postId)
    expect(result.ok).toBe(true)
    expect(posts.get(postId)?.status).toBe('scheduled')
    expect(posts.get(postId)?.failure).toBeNull()
    expect(posts.get(postId)?.attempts).toBe(1)
  })

  it('tracks published state as terminal', () => {
    const posts = usePostsStore()
    const publishedAt = new Date().toISOString()
    posts.markPublished(postId, publishedAt, {
      impressions: 100,
      likes: 5,
      comments: 1,
      shares: 2,
      clicks: 3,
    })
    expect(posts.get(postId)?.status).toBe('published')
    expect(posts.update(postId, { content: 'nope' }).ok).toBe(false)
    expect(posts.reschedule(postId, FUTURE).ok).toBe(false)
    expect(posts.published).toHaveLength(1)
  })
})

describe('usePostsStore — derived views', () => {
  beforeEach(freshPinia)

  it('groups posts by the user timezone day and counts them', () => {
    const account = addAccount('alpha')
    const posts = usePostsStore()
    const tomorrow = new Date(Date.now() + 30 * 60 * 60_000).toISOString()

    posts.createGroup({
      content: 'Later',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'schedule',
      scheduledAtIso: tomorrow,
    })
    posts.createGroup({
      content: 'Draft',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'draft',
      scheduledAtIso: null,
    })

    expect(posts.byDay.size).toBe(1)
    expect(posts.counts.scheduled).toBe(1)
    expect(posts.counts.drafts).toBe(1)
    expect(posts.nextUp?.content).toBe('Later')
  })

  it('collects referenced media ids for garbage collection', () => {
    const account = addAccount('alpha')
    const now = new Date().toISOString()
    useMediaStore().replaceAll(['media-1', 'media-2'].map((id) => ({
      id,
      name: `${id}.jpg`,
      mime: 'image/jpeg' as const,
      width: 10,
      height: 10,
      bytes: 100,
      dataUrl: 'data:image/jpeg;base64,AAAA',
      createdAt: now,
      updatedAt: now,
    })))
    const posts = usePostsStore()
    const created = posts.createGroup({
      content: 'With media',
      accountIds: [account.id],
      mediaIds: ['media-1', 'media-2'],
      mode: 'draft',
      scheduledAtIso: null,
    })
    expect(created.ok).toBe(true)
    expect([...posts.referencedMediaIds()].sort()).toEqual(['media-1', 'media-2'])
  })

  it('does not collide queue minutes across two sequential group creations', () => {
    const account = addAccount('alpha')
    const slots = useSlotsStore()
    const weekday = new Date().getDay() as never
    slots.add(account.id, weekday, '23:58')
    const posts = usePostsStore()

    const first = posts.createGroup({
      content: 'A',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'queue',
      scheduledAtIso: null,
    })
    const second = posts.createGroup({
      content: 'B',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'queue',
      scheduledAtIso: null,
    })
    if (!first.ok || !second.ok) throw new Error('queue creation failed')
    const a = first.value.posts[0]?.scheduledAt ?? ''
    const b = second.value.posts[0]?.scheduledAt ?? ''
    expect(minuteKey(a)).not.toBe(minuteKey(b))
  })
})

describe('usePostsStore — update semantics', () => {
  beforeEach(freshPinia)

  it('treats an unchanged status as a no-op instead of a failed transition', () => {
    const account = addAccount('alpha')
    const posts = usePostsStore()
    const created = posts.createGroup({
      content: 'Draft',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'draft',
      scheduledAtIso: null,
    })
    if (!created.ok || !created.value.posts[0]) throw new Error('fixture failed')
    const id = created.value.posts[0].id

    expect(posts.update(id, { status: 'draft', content: 'Still a draft' }).ok).toBe(true)
    expect(posts.get(id)?.content).toBe('Still a draft')
  })

  it('still refuses a genuinely illegal transition', () => {
    const account = addAccount('alpha')
    const posts = usePostsStore()
    const created = posts.createGroup({
      content: 'Scheduled',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'schedule',
      scheduledAtIso: FUTURE,
    })
    if (!created.ok || !created.value.posts[0]) throw new Error('fixture failed')
    expect(posts.update(created.value.posts[0].id, { status: 'published' }).ok).toBe(false)
  })
})
