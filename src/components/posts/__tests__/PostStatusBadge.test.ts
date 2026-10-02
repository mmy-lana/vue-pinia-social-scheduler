import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import PostStatusBadge from '@/components/posts/PostStatusBadge.vue'
import type { PostFailure, PostStatus } from '@/types'

/** The text tone `BaseBadge` paints for each status, per the design contract. */
const TONE_CLASS: Record<PostStatus, string> = {
  draft: 'text-ink-muted',
  scheduled: 'text-info',
  publishing: 'text-warn',
  published: 'text-ok',
  failed: 'text-danger',
}

/**
 * Identifies the rendered glyph by the lucide class it carries, rather than by
 * a hard-coded name. Lucide renames its icons between majors (`FileEdit` became
 * `FilePen`), and a pinned name turns a cosmetic upstream rename into a red test.
 */
function iconKey(status: PostStatus): string {
  const classes = mountBadge(status)
    .get('[data-testid="base-badge-icon"]')
    .classes()
  return classes.find((name) => name.startsWith('lucide-') && !name.endsWith('-icon')) ?? ''
}

const LABEL: Record<PostStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  publishing: 'Publishing',
  published: 'Published',
  failed: 'Failed',
}

const STATUSES: readonly PostStatus[] = [
  'draft',
  'scheduled',
  'publishing',
  'published',
  'failed',
]

function mountBadge(status: PostStatus, extra: Record<string, unknown> = {}) {
  return mount(PostStatusBadge, { props: { status, ...extra } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  window.localStorage.clear()
})

describe('PostStatusBadge', () => {
  it.each(STATUSES)('maps %s to its tone, label and icon', (status) => {
    const wrapper = mountBadge(status)

    const root = wrapper.get('[data-testid="post-status-badge"]')
    expect(root.attributes('data-status')).toBe(status)

    const pill = wrapper.get('[data-testid="base-badge"]')
    expect(pill.text()).toBe(LABEL[status])
    expect(pill.classes()).toContain(TONE_CLASS[status])

    const icon = wrapper.get('[data-testid="base-badge-icon"]')
    expect(icon.element.tagName.toLowerCase()).toBe('svg')
    expect(iconKey(status)).toMatch(/^lucide-[a-z0-9-]+$/)

    expect(root.attributes('title')).toBe(LABEL[status])
    wrapper.unmount()
  })

  it('gives every status its own glyph', () => {
    const keys = STATUSES.map((status) => iconKey(status))

    expect(keys.every((key) => key !== '')).toBe(true)
    expect(new Set(keys).size).toBe(STATUSES.length)
  })

  it('spins only while publishing', () => {
    for (const status of STATUSES) {
      const wrapper = mountBadge(status)
      const spinning = wrapper
        .get('[data-testid="base-badge-icon"]')
        .classes()
        .includes('motion-safe:animate-spin')
      expect(spinning).toBe(status === 'publishing')
      wrapper.unmount()
    }
  })

  it('accepts a label override without losing the tone', () => {
    const wrapper = mountBadge('scheduled', { label: 'Posts at 9:30 AM' })
    expect(wrapper.get('[data-testid="base-badge"]').text()).toBe('Posts at 9:30 AM')
    expect(wrapper.get('[data-testid="base-badge"]').classes()).toContain('text-info')
    expect(wrapper.get('[data-testid="post-status-badge"]').attributes('title')).toBe(
      'Posts at 9:30 AM',
    )
    wrapper.unmount()
  })

  it('renders the size it was given', () => {
    const small = mountBadge('draft')
    const large = mountBadge('draft', { size: 'md' })

    expect(small.get('[data-testid="base-badge"]').classes()).toContain('text-xs')
    expect(large.get('[data-testid="base-badge"]').classes()).toContain('text-sm')
    expect(large.get('[data-testid="base-badge-icon"]').classes()).toContain('size-4')

    small.unmount()
    large.unmount()
  })

  it('exposes the failure reason on hover and to assistive tech', () => {
    const failure: PostFailure = {
      code: 'RATE_LIMITED',
      message: 'X returned 429 — retry in a minute.',
      at: '2026-10-02T08:31:00.000Z',
    }
    const wrapper = mountBadge('failed', { failure })

    const root = wrapper.get('[data-testid="post-status-badge"]')
    expect(root.attributes('title')).toBe('Failed: X returned 429 — retry in a minute.')
    expect(root.attributes('aria-label')).toContain('429')
    expect(wrapper.get('[data-testid="post-status-failure"]').text()).toBe(failure.message)
    wrapper.unmount()
  })

  it('shows no failure text for a healthy post', () => {
    const wrapper = mountBadge('published')
    expect(wrapper.find('[data-testid="post-status-failure"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="post-status-badge"]').attributes('title')).toBe('Published')
    wrapper.unmount()
  })
})