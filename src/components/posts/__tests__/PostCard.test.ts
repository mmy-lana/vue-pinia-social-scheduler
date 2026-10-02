import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import PostCard from '@/components/posts/PostCard.vue'
import { resetBodyScrollLock } from '@/composables/useBodyScrollLock'
import { relativeTime } from '@/lib/datetime'
import { PLATFORMS } from '@/lib/platforms'
import { formatCompactNumber } from '@/lib/utils'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { useMediaStore } from '@/stores/useMediaStore'
import type { MediaAsset, Post, PostStatus, SocialAccount } from '@/types'

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const ACCOUNT: SocialAccount = {
  id: 'account-1',
  platform: 'linkedin',
  handle: 'lumenstudio',
  displayName: 'Lumen Studio',
  avatarHue: 214,
  connected: true,
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
}

const ASSET: MediaAsset = {
  id: 'm1',
  name: 'Sunset.png',
  mime: 'image/png',
  width: 1200,
  height: 675,
  bytes: 2048,
  dataUrl: PIXEL,
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
}

const LONG_CONTENT = 'Lumen ships a new field guide. '.repeat(40)

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

function makePost(overrides: Partial<Post> = {}): Post {
  const nowIso = iso(0)
  return {
    id: 'post-1',
    groupId: 'group-1',
    accountId: ACCOUNT.id,
    content: 'New field guide is out.',
    mediaIds: [],
    status: 'scheduled',
    scheduledAt: iso(7_200_000),
    publishedAt: null,
    source: 'manual',
    attempts: 0,
    nextRetryAt: null,
    failure: null,
    metrics: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    ...overrides,
  }
}

function mountCard(post: Post, extra: Record<string, unknown> = {}) {
  return mount(PostCard, {
    props: { post, ...extra },
    global: { stubs: { teleport: true } },
  })
}

const TONE_CLASS: Record<PostStatus, string> = {
  draft: 'text-ink-muted',
  scheduled: 'text-info',
  publishing: 'text-warn',
  published: 'text-ok',
  failed: 'text-danger',
}

beforeEach(() => {
  setActivePinia(createPinia())
  window.localStorage.clear()
  useAccountsStore().replaceAll([ACCOUNT])
  useMediaStore().replaceAll([ASSET])
})

afterEach(() => {
  resetBodyScrollLock()
})

describe('PostCard', () => {
  it('renders the channel, the platform and the status', () => {
    const post = makePost({ status: 'scheduled' })
    const wrapper = mountCard(post)

    const card = wrapper.get('[data-testid="post-card"]')
    expect(card.attributes('data-post-id')).toBe(post.id)
    expect(card.attributes('data-status')).toBe('scheduled')
    expect(card.attributes('data-platform')).toBe('linkedin')
    expect(card.classes()).toContain('card-surface')

    expect(wrapper.get('[data-testid="post-author"]').text()).toBe('Lumen Studio')
    expect(wrapper.get('[data-testid="post-handle"]').text()).toBe('@lumenstudio')
    expect(wrapper.get('[data-testid="post-platform-badge"]').text()).toContain('LinkedIn')

    const badge = wrapper.get('[data-testid="post-status-badge"]')
    expect(badge.text()).toContain('Scheduled')
    expect(badge.get('[data-testid="base-badge"]').classes()).toContain('text-info')

    // The platform accent is data, so it is painted inline.
    expect(card.attributes('style')).toContain(PLATFORMS.linkedin.color)
    wrapper.unmount()
  })

  it('shows the relative time of the moment that matters', () => {
    const publishedAt = iso(-7_200_000)
    const post = makePost({ status: 'published', publishedAt, scheduledAt: publishedAt })
    const wrapper = mountCard(post)

    const time = wrapper.get('[data-testid="post-time"]')
    expect(time.attributes('datetime')).toBe(publishedAt)
    expect(time.text()).toBe(relativeTime(publishedAt, new Date()))
    expect(time.text()).not.toBe('')
    wrapper.unmount()
  })

  it('renders the body without a toggle while it is short', () => {
    const wrapper = mountCard(makePost({ content: 'Short and sweet.' }))
    expect(wrapper.get('[data-testid="post-content"]').text()).toBe('Short and sweet.')
    expect(wrapper.find('[data-testid="post-content-toggle"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="post-content"]').classes()).not.toContain('clamp-6')
    wrapper.unmount()
  })

  it('clamps a long body to six lines and can always reveal the rest', async () => {
    const wrapper = mountCard(makePost({ content: LONG_CONTENT }))
    const content = wrapper.get('[data-testid="post-content"]')
    const toggle = wrapper.get('[data-testid="post-content-toggle"]')

    expect(content.classes()).toContain('clamp-6')
    expect(toggle.text()).toBe('Show more')
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('click')
    expect(wrapper.get('[data-testid="post-content"]').classes()).not.toContain('clamp-6')
    expect(wrapper.get('[data-testid="post-content-toggle"]').text()).toBe('Show less')

    await wrapper.get('[data-testid="post-content-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="post-content"]').classes()).toContain('clamp-6')
    expect(wrapper.get('[data-testid="post-content-toggle"]').text()).toBe('Show more')
    wrapper.unmount()
  })

  it('shows the media grid only when the post has photos', () => {
    expect(mountCard(makePost()).find('[data-testid="media-grid"]').exists()).toBe(false)

    const withMedia = mountCard(makePost({ mediaIds: [ASSET.id] }))
    const grid = withMedia.get('[data-testid="media-grid"]')
    expect(grid.findAll('[data-testid="media-item"]')).toHaveLength(1)
    expect(grid.get('[data-testid="media-item"]').attributes('aria-label')).toBe(
      `View photo 1 of 1: ${ASSET.name}`,
    )
    withMedia.unmount()
  })

  it('shows the metrics of a published post and nothing for the others', () => {
    const metrics = {
      impressions: 12_340,
      likes: 428,
      comments: 37,
      shares: 12,
      clicks: 1_204,
    }

    const published = mountCard(
      makePost({
        status: 'published',
        publishedAt: iso(-3_600_000),
        scheduledAt: iso(-3_600_000),
        metrics,
      }),
    )
    const row = published.get('[data-testid="post-metrics-row"]')
    expect(row.find('[data-metric="impressions"]').text()).toBe(
      `${formatCompactNumber(metrics.impressions)} impressions`,
    )
    expect(published.findAll('[data-testid="post-metric"]')).toHaveLength(5)
    published.unmount()

    const scheduled = mountCard(makePost({ status: 'scheduled', metrics }))
    expect(scheduled.find('[data-testid="post-metrics-row"]').exists()).toBe(false)
    scheduled.unmount()
  })

  it('shows the failure reason in an alert region', () => {
    const post = makePost({
      status: 'failed',
      failure: {
        code: 'RATE_LIMITED',
        message: 'LinkedIn returned 429 — retry in a minute.',
        at: iso(-600_000),
      },
    })
    const wrapper = mountCard(post)

    const alert = wrapper.get('[data-testid="post-failure"]')
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toContain('LinkedIn returned 429 — retry in a minute.')
    expect(alert.text()).toContain('RATE_LIMITED')
    expect(wrapper.get('[data-testid="post-status-badge"]').attributes('title')).toContain('429')
    wrapper.unmount()
  })

  it('paints each status with its own tone', () => {
    const statuses: PostStatus[] = ['draft', 'scheduled', 'publishing', 'published', 'failed']
    for (const status of statuses) {
      const wrapper = mountCard(makePost({ status }))
      const pills = wrapper.findAll('[data-testid="post-status-badge"]')
      expect(pills.length).toBeGreaterThan(0)
      expect(pills[0]?.get('[data-testid="base-badge"]').classes()).toContain(
        TONE_CLASS[status],
      )
      expect(wrapper.get('[data-testid="post-card"]').attributes('data-status')).toBe(status)
      wrapper.unmount()
    }
  })

  it('gives every status a reachable primary action', async () => {
    const cases: Array<{ status: PostStatus; label: string; action: string | null }> = [
      { status: 'draft', label: 'Schedule', action: 'schedule' },
      { status: 'scheduled', label: 'Publish now', action: 'publish-now' },
      { status: 'failed', label: 'Retry', action: 'retry' },
      { status: 'published', label: 'Duplicate', action: 'duplicate' },
    ]

    for (const { status, label, action } of cases) {
      const wrapper = mountCard(makePost({ status }))
      const button = wrapper.get('[data-testid="post-primary-action"]')

      expect(button.text()).toBe(label)
      expect(button.attributes('data-post-action')).toBe(action)

      await button.trigger('click')
      expect(wrapper.emitted('action')).toEqual([['post-1', action]])
      wrapper.unmount()
    }
  })

  it('shows a busy-looking primary action while publishing', () => {
    const wrapper = mountCard(makePost({ status: 'publishing' }))
    const button = wrapper.get('[data-testid="post-primary-action"]')

    expect(button.attributes('aria-busy')).toBe('true')
    expect(wrapper.find('[data-testid="base-button-spinner"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="post-actions-trigger"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('keeps every action reachable without hover: visible button plus kebab', async () => {
    const wrapper = mountCard(makePost({ status: 'scheduled' }))

    // The kebab is in the markup from the start — no group-hover, no focus-only.
    expect(wrapper.find('[data-testid="base-menu-trigger"]').exists()).toBe(true)

    await wrapper.get('[data-testid="base-menu-trigger"]').trigger('click')
    await nextTick()

    const items = wrapper.findAll('[data-testid="base-menu-item"]')
    expect(items.map((item) => item.attributes('data-item-id'))).toEqual([
      'edit',
      'reschedule',
      'publish-now',
      'move-to-drafts',
      'duplicate',
      'delete',
    ])

    const reschedule = items[1]
    await reschedule?.trigger('click')
    expect(wrapper.emitted('action')).toEqual([['post-1', 'reschedule']])
    wrapper.unmount()
  })

  it('collapses to a single row in compact mode', () => {
    const post = makePost({
      status: 'scheduled',
      content: LONG_CONTENT,
      mediaIds: [ASSET.id],
    })
    const wrapper = mountCard(post, { compact: true })
    const card = wrapper.get('[data-testid="post-card"]')

    expect(card.attributes('data-compact')).toBe('true')
    expect(wrapper.get('[data-testid="post-card-header"]').classes()).toContain('items-center')
    expect(wrapper.get('[data-testid="post-content"]').classes()).toContain('clamp-1')
    expect(wrapper.find('[data-testid="post-content-toggle"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="media-grid"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="post-metrics-row"]').exists()).toBe(false)
    // One status badge in the header only; the footer does not repeat it.
    expect(wrapper.findAll('[data-testid="post-status-badge"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="post-primary-action"]').text()).toBe('Publish now')
    wrapper.unmount()
  })

  it('still emits from the compact variant', async () => {
    const wrapper = mountCard(makePost({ status: 'draft' }), { compact: true })
    await wrapper.get('[data-testid="post-primary-action"]').trigger('click')
    expect(wrapper.emitted('action')).toEqual([['post-1', 'schedule']])
    wrapper.unmount()
  })

  it('survives a channel that was deleted under it', () => {
    useAccountsStore().replaceAll([])
    const wrapper = mountCard(makePost())

    expect(wrapper.get('[data-testid="post-author"]').text()).toBe('Deleted channel')
    expect(wrapper.get('[data-testid="post-handle"]').text()).toBe('@unknown')
    expect(wrapper.get('[data-testid="post-card"]').attributes('data-platform')).toBe('x')
    wrapper.unmount()
  })

  it('drops a photo the library no longer has instead of a broken frame', () => {
    useMediaStore().replaceAll([])
    const wrapper = mountCard(makePost({ mediaIds: [ASSET.id] }))
    expect(wrapper.find('[data-testid="media-grid"]').exists()).toBe(false)
    wrapper.unmount()
  })
})