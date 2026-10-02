import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import PostActionsMenu from '@/components/posts/PostActionsMenu.vue'
import type { Post, PostActionId, PostStatus } from '@/types'

function makePost(overrides: Partial<Post> = {}): Post {
  const nowIso = new Date().toISOString()
  return {
    id: 'post-1',
    groupId: 'group-1',
    accountId: 'account-1',
    content: 'Hello from the timeline.',
    mediaIds: [],
    status: 'scheduled',
    scheduledAt: nowIso,
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

function mountMenu(post: Post, extra: Record<string, unknown> = {}) {
  return mount(PostActionsMenu, {
    props: { post, ...extra },
    global: { stubs: { teleport: true } },
  })
}

async function openMenu(wrapper: ReturnType<typeof mountMenu>): Promise<void> {
  await wrapper.get('[data-testid="base-menu-trigger"]').trigger('click')
  await nextTick()
}

function itemIds(wrapper: ReturnType<typeof mountMenu>): string[] {
  return wrapper.findAll('[data-testid="base-menu-item"]').map((item) =>
    String(item.attributes('data-item-id')),
  )
}

function itemLabels(wrapper: ReturnType<typeof mountMenu>): string[] {
  return wrapper
    .findAll('[data-testid="base-menu-item"]')
    .map((item) => item.find('.text-sm').text())
}

beforeEach(() => {
  setActivePinia(createPinia())
  window.localStorage.clear()
})

describe('PostActionsMenu', () => {
  it('offers the draft matrix', async () => {
    const wrapper = mountMenu(makePost({ status: 'draft' }))
    await openMenu(wrapper)

    expect(itemIds(wrapper)).toEqual(['edit', 'schedule', 'queue', 'duplicate', 'delete'])
    expect(itemLabels(wrapper)).toEqual([
      'Edit',
      'Schedule…',
      'Add to queue',
      'Duplicate',
      'Delete',
    ])
    wrapper.unmount()
  })

  it('offers the scheduled matrix', async () => {
    const wrapper = mountMenu(makePost({ status: 'scheduled' }))
    await openMenu(wrapper)

    expect(itemIds(wrapper)).toEqual([
      'edit',
      'reschedule',
      'publish-now',
      'move-to-drafts',
      'duplicate',
      'delete',
    ])
    expect(itemLabels(wrapper)[2]).toBe('Publish now')
    wrapper.unmount()
  })

  it('offers the published matrix', async () => {
    const wrapper = mountMenu(makePost({ status: 'published' }))
    await openMenu(wrapper)

    expect(itemIds(wrapper)).toEqual(['duplicate', 'delete'])
    wrapper.unmount()
  })

  it('offers the failed matrix', async () => {
    const wrapper = mountMenu(makePost({ status: 'failed' }))
    await openMenu(wrapper)

    expect(itemIds(wrapper)).toEqual(['retry', 'edit', 'reschedule', 'duplicate', 'delete'])
    expect(itemLabels(wrapper)[0]).toBe('Retry')
    wrapper.unmount()
  })

  it('marks Delete as the dangerous row', async () => {
    const wrapper = mountMenu(makePost({ status: 'draft' }))
    await openMenu(wrapper)

    const items = wrapper.findAll('[data-testid="base-menu-item"]')
    const del = items[items.length - 1]
    expect(del?.classes()).toContain('text-danger')

    const duplicate = items[3]
    expect(duplicate?.classes()).not.toContain('text-danger')
    wrapper.unmount()
  })

  it('emits the action and the post id for every matrix row', async () => {
    const cases: Array<{ status: PostStatus; itemId: string; action: PostActionId }> = [
      { status: 'draft', itemId: 'edit', action: 'edit' },
      { status: 'draft', itemId: 'schedule', action: 'schedule' },
      { status: 'draft', itemId: 'queue', action: 'schedule' },
      { status: 'scheduled', itemId: 'reschedule', action: 'reschedule' },
      { status: 'scheduled', itemId: 'publish-now', action: 'publish-now' },
      { status: 'scheduled', itemId: 'move-to-drafts', action: 'move-to-drafts' },
      { status: 'published', itemId: 'duplicate', action: 'duplicate' },
      { status: 'published', itemId: 'delete', action: 'delete' },
      { status: 'failed', itemId: 'retry', action: 'retry' },
    ]

    for (const { status, itemId, action } of cases) {
      const wrapper = mountMenu(makePost({ status }))
      await openMenu(wrapper)

      const item = wrapper
        .findAll('[data-testid="base-menu-item"]')
        .find((node) => node.attributes('data-item-id') === itemId)
      expect(item, `${status} should offer ${itemId}`).toBeDefined()

      await item?.trigger('click')
      expect(wrapper.emitted('action')).toEqual([['post-1', action]])
      wrapper.unmount()
    }
  })

  it('closes the menu after a choice', async () => {
    const wrapper = mountMenu(makePost({ status: 'draft' }))
    await openMenu(wrapper)
    expect(wrapper.find('[data-testid="base-menu-panel"]').exists()).toBe(true)

    await wrapper.findAll('[data-testid="base-menu-item"]')[0]?.trigger('click')
    expect(wrapper.find('[data-testid="base-menu-panel"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders a disabled spinner while publishing, with no items at all', () => {
    const wrapper = mountMenu(makePost({ status: 'publishing' }))

    expect(wrapper.find('[data-testid="base-menu-trigger"]').exists()).toBe(false)
    const trigger = wrapper.get('[data-testid="post-actions-trigger"]')
    expect(trigger.attributes('disabled')).toBeDefined()
    expect(trigger.attributes('aria-label')).toContain('Post actions')
    expect(trigger.get('[data-testid="post-actions-spinner"]').classes()).toContain(
      'motion-safe:animate-spin',
    )
    expect(wrapper.find('[data-testid="base-menu-panel"]').exists()).toBe(false)
    expect(wrapper.emitted('action')).toBeUndefined()
    wrapper.unmount()
  })

  it('disables every row while the caller is busy', async () => {
    const wrapper = mountMenu(makePost({ status: 'scheduled' }), { busy: true })

    expect(wrapper.find('[data-testid="base-menu-trigger"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="post-actions-trigger"]').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('action')).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps the same trigger footprint for the disabled state', () => {
    const open = mountMenu(makePost({ status: 'draft' }))
    const locked = mountMenu(makePost({ status: 'publishing' }))

    const live = open.get('[data-testid="base-menu-trigger"]')
    const inert = locked.get('[data-testid="post-actions-trigger"]')

    // Same box, so a card never reflows when a post changes state.
    for (const className of ['tap-target', 'size-11', 'rounded-control']) {
      expect(live.classes()).toContain(className)
      expect(inert.classes()).toContain(className)
    }
    expect(inert.classes()).toContain('opacity-60')
    open.unmount()
    locked.unmount()
  })

  it('follows the post as it changes status', async () => {
    const wrapper = mountMenu(makePost({ status: 'draft' }))
    await wrapper.setProps({ post: makePost({ status: 'failed' }) })
    await openMenu(wrapper)

    expect(itemIds(wrapper)).toEqual(['retry', 'edit', 'reschedule', 'duplicate', 'delete'])
    wrapper.unmount()
  })
})