import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { CalendarX, Inbox } from 'lucide-vue-next'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import type { Component } from 'vue'

interface EmptyStateProps {
  icon?: Component
  title: string
  description?: string
  compact?: boolean
}

function mountEmptyState(
  overrides: Partial<EmptyStateProps> = {},
  slots: Record<string, string> = {},
) {
  return mount(BaseEmptyState, { props: { title: 'Nothing here', ...overrides }, slots })
}

describe('BaseEmptyState', () => {
  it('renders the icon, the title and the description', () => {
    const wrapper = mountEmptyState({
      icon: Inbox,
      title: 'No posts yet',
      description: 'Draft your first post and schedule it for a free slot.',
    })

    expect(wrapper.find('[data-testid="base-empty-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="base-empty-state-title"]').text()).toBe('No posts yet')
    expect(wrapper.find('[data-testid="base-empty-state-description"]').text()).toBe(
      'Draft your first post and schedule it for a free slot.',
    )
    expect(wrapper.find('svg.lucide-inbox').exists()).toBe(true)
    wrapper.unmount()
  })

  it('centers the composition and tints the icon circle with the brand color', () => {
    const wrapper = mountEmptyState({ icon: CalendarX, title: 'Nothing scheduled' })
    const root = wrapper.find('[data-testid="base-empty-state"]')

    expect(root.classes()).toContain('flex-col')
    expect(root.classes()).toContain('items-center')
    expect(root.classes()).toContain('text-center')

    const circle = root.find('span')
    expect(circle.classes()).toContain('rounded-full')
    expect(circle.classes()).toContain('bg-brand-100')
    expect(circle.classes()).toContain('text-brand-700')
    expect(circle.attributes('aria-hidden')).toBe('true')
    wrapper.unmount()
  })

  it('renders no icon bubble when no icon is passed', () => {
    const wrapper = mountEmptyState({ title: 'No matches' })

    expect(wrapper.find('svg').exists()).toBe(false)
    expect(wrapper.find('[data-testid="base-empty-state-title"]').text()).toBe('No matches')
    wrapper.unmount()
  })

  it('renders no description block when the caller omits it', () => {
    const wrapper = mountEmptyState({ icon: Inbox, title: 'No results' })

    expect(wrapper.find('[data-testid="base-empty-state-description"]').exists()).toBe(false)
    expect(wrapper.text()).toBe('No results')
    wrapper.unmount()
  })

  it('renders the action slot content', () => {
    const wrapper = mountEmptyState(
      { title: 'Your queue is empty', description: 'Add a recurring slot to fill it.' },
      { action: '<button type="button" data-testid="empty-cta">New post</button>' },
    )

    const action = wrapper.find('[data-testid="base-empty-state-action"]')
    expect(action.exists()).toBe(true)
    expect(action.find('[data-testid="empty-cta"]').text()).toBe('New post')
    wrapper.unmount()
  })

  it('renders no empty action area without the slot', () => {
    const wrapper = mountEmptyState({ title: 'Your queue is empty' })

    expect(wrapper.find('[data-testid="base-empty-state-action"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('drops the density in compact mode', () => {
    const roomy = mountEmptyState({
      icon: Inbox,
      title: 'No posts yet',
      description: 'Draft your first post.',
    })
    const tight = mountEmptyState({
      icon: Inbox,
      title: 'No posts yet',
      description: 'Draft your first post.',
      compact: true,
    })

    const roomyRoot = roomy.find('[data-testid="base-empty-state"]')
    const tightRoot = tight.find('[data-testid="base-empty-state"]')
    expect(roomyRoot.classes()).toEqual(expect.not.arrayContaining(tightRoot.classes()))
    expect(roomyRoot.classes()).toContain('py-10')
    expect(tightRoot.classes()).toContain('py-6')

    expect(roomy.find('[data-testid="base-empty-state-title"]').classes()).toContain('text-lg')
    expect(tight.find('[data-testid="base-empty-state-title"]').classes()).toContain('text-base')

    expect(roomy.find('[data-testid="base-empty-state-description"]').classes()).toContain(
      'text-sm',
    )
    expect(tight.find('[data-testid="base-empty-state-description"]').classes()).toContain(
      'text-xs',
    )

    expect(roomy.find('span').classes()).toContain('size-14')
    expect(tight.find('span').classes()).toContain('size-10')

    roomy.unmount()
    tight.unmount()
  })

  it('tightens the action spacing in compact mode', () => {
    const roomy = mountEmptyState(
      { title: 'Empty' },
      { action: '<button type="button">Go</button>' },
    )
    const tight = mountEmptyState(
      { title: 'Empty', compact: true },
      { action: '<button type="button">Go</button>' },
    )

    expect(roomy.find('[data-testid="base-empty-state-action"]').classes()).toContain('pt-2')
    expect(tight.find('[data-testid="base-empty-state-action"]').classes()).toContain('pt-1')

    roomy.unmount()
    tight.unmount()
  })
})
