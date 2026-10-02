import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { CalendarDays, Inbox } from 'lucide-vue-next'
import { defineComponent, h } from 'vue'
import BaseTabs from '@/components/ui/BaseTabs.vue'
import type { Component } from 'vue'

interface TabItem {
  id: string
  label: string
  icon?: Component
  count?: number
}

interface TabsProps {
  modelValue: string
  tabs: TabItem[]
  ariaLabel: string
  stretch?: boolean
}

const TABS: TabItem[] = [
  { id: 'upcoming', label: 'Upcoming', count: 3 },
  { id: 'published', label: 'Published' },
  { id: 'failed', label: 'Failed', count: 0 },
]

function mountTabs(overrides: Partial<TabsProps> = {}, attach = false) {
  const props: TabsProps = {
    modelValue: 'upcoming',
    tabs: TABS,
    ariaLabel: 'Post status',
    ...overrides,
  }
  return attach ? mount(BaseTabs, { props, attachTo: document.body }) : mount(BaseTabs, { props })
}

function tabIds(wrapper: ReturnType<typeof mountTabs>): string[] {
  return wrapper
    .findAll('[data-testid="base-tab"]')
    .map((tab) => tab.attributes('data-tab-id') ?? '')
}

function lastSelection(wrapper: ReturnType<typeof mountTabs>): unknown {
  const events = wrapper.emitted('update:modelValue')
  return events?.[events.length - 1]
}

describe('BaseTabs', () => {
  it('renders a labelled tablist with one tab per entry', () => {
    const wrapper = mountTabs()
    const tablist = wrapper.find('[data-testid="base-tabs"]')

    expect(tablist.attributes('role')).toBe('tablist')
    expect(tablist.attributes('aria-label')).toBe('Post status')
    expect(tablist.attributes('aria-orientation')).toBe('horizontal')
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(3)
    expect(tabIds(wrapper)).toEqual(['upcoming', 'published', 'failed'])
    expect(wrapper.text()).toContain('Upcoming')
    wrapper.unmount()
  })

  it('marks the selected tab and keeps a roving tabindex', () => {
    const wrapper = mountTabs()
    const tabs = wrapper.findAll('[role="tab"]')

    expect(tabs[0]?.attributes('aria-selected')).toBe('true')
    expect(tabs[0]?.attributes('tabindex')).toBe('0')
    expect(tabs[1]?.attributes('aria-selected')).toBe('false')
    expect(tabs[1]?.attributes('tabindex')).toBe('-1')
    expect(tabs[2]?.attributes('tabindex')).toBe('-1')
    wrapper.unmount()
  })

  it('follows the model when the owner changes it', async () => {
    const wrapper = mountTabs()
    await wrapper.setProps({ modelValue: 'failed' })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs[2]?.attributes('aria-selected')).toBe('true')
    expect(tabs[2]?.attributes('tabindex')).toBe('0')
    expect(tabs[0]?.attributes('aria-selected')).toBe('false')
    wrapper.unmount()
  })

  it('points every tab at its own generated panel', () => {
    const wrapper = mountTabs()
    const controls = wrapper.findAll('[role="tab"]').map((tab) => tab.attributes('aria-controls'))

    for (const value of controls) {
      expect(typeof value).toBe('string')
      expect(value).not.toBe('')
    }
    expect(new Set(controls).size).toBe(3)
    expect(controls[0]).toContain('upcoming')
    expect(controls[0]).not.toBe(controls[1])
    wrapper.unmount()
  })

  it('gives two instances on one page distinct panel ids', () => {
    const host = defineComponent({
      setup: () => () => [
        h(BaseTabs, { modelValue: 'upcoming', tabs: TABS, ariaLabel: 'First tablist' }),
        h(BaseTabs, { modelValue: 'published', tabs: TABS, ariaLabel: 'Second tablist' }),
      ],
    })
    const wrapper = mount(host)
    const lists = wrapper.findAll('[data-testid="base-tabs"]')

    const first = lists[0]?.find('[role="tab"]').attributes('aria-controls') ?? ''
    const second = lists[1]?.find('[role="tab"]').attributes('aria-controls') ?? ''

    expect(first).not.toBe('')
    expect(first).not.toBe(second)
    wrapper.unmount()
  })

  it('raises the selected tab visually', () => {
    const wrapper = mountTabs()
    const tabs = wrapper.findAll('[role="tab"]')

    expect(tabs[0]?.classes()).toEqual(
      expect.arrayContaining(['bg-surface', 'text-ink', 'shadow-card', 'border-line']),
    )
    expect(tabs[1]?.classes()).toContain('text-ink-muted')
    expect(tabs[1]?.classes()).not.toContain('shadow-card')
    wrapper.unmount()
  })

  it('updates the model when a tab is clicked', async () => {
    const wrapper = mountTabs()

    await wrapper.findAll('[data-testid="base-tab"]')[1]?.trigger('click')

    expect(lastSelection(wrapper)).toEqual(['published'])
    wrapper.unmount()
  })

  it('does not re-emit when the active tab is clicked again', async () => {
    const wrapper = mountTabs()

    await wrapper.findAll('[data-testid="base-tab"]')[0]?.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('scrolls horizontally inside its own container', () => {
    const wrapper = mountTabs()
    const tablist = wrapper.find('[data-testid="base-tabs"]')

    expect(tablist.classes()).toContain('overflow-x-auto')
    expect(tablist.classes()).toContain('scrollbar-none')
    expect(tablist.classes()).toContain('flex')

    for (const tab of wrapper.findAll('[data-testid="base-tab"]')) {
      expect(tab.classes()).toContain('whitespace-nowrap')
      expect(tab.classes()).toContain('shrink-0')
    }
    wrapper.unmount()
  })

  it('renders a count pill next to every counted tab', () => {
    const wrapper = mountTabs()
    const counts = wrapper.findAll('[data-testid="base-tab-count"]')

    expect(counts).toHaveLength(2)
    expect(counts[0]?.text()).toBe('3')
    expect(counts[1]?.text()).toBe('0')
    expect(counts[0]?.classes()).toContain('rounded-full')

    const withoutCount = wrapper.findAll('[data-testid="base-tab"]')[1]
    expect(withoutCount?.find('[data-testid="base-tab-count"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders a per-tab icon when one is provided', () => {
    const wrapper = mountTabs({
      tabs: [
        { id: 'inbox', label: 'Inbox', icon: Inbox },
        { id: 'calendar', label: 'Calendar', icon: CalendarDays },
      ],
    })

    expect(wrapper.find('svg.lucide-inbox').exists()).toBe(true)
    expect(wrapper.find('svg.lucide-calendar-days').exists()).toBe(true)
    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true')
    wrapper.unmount()
  })

  it('lets the tabs share the width when stretch is set', () => {
    const natural = mountTabs()
    const stretched = mountTabs({ stretch: true })

    expect(natural.findAll('[data-testid="base-tab"]')[0]?.classes()).toContain('shrink-0')
    expect(natural.findAll('[data-testid="base-tab"]')[0]?.classes()).not.toContain('basis-0')
    expect(stretched.findAll('[data-testid="base-tab"]')[0]?.classes()).toContain('grow')
    expect(stretched.findAll('[data-testid="base-tab"]')[0]?.classes()).toContain('basis-0')

    natural.unmount()
    stretched.unmount()
  })

  it('moves and selects with ArrowRight, wrapping at the end', async () => {
    const wrapper = mountTabs()
    const tablist = wrapper.find('[data-testid="base-tabs"]')

    await tablist.trigger('keydown', { key: 'ArrowRight' })
    expect(lastSelection(wrapper)).toEqual(['published'])

    await wrapper.setProps({ modelValue: 'published' })
    await tablist.trigger('keydown', { key: 'ArrowRight' })
    expect(lastSelection(wrapper)).toEqual(['failed'])

    await wrapper.setProps({ modelValue: 'failed' })
    await tablist.trigger('keydown', { key: 'ArrowRight' })
    expect(lastSelection(wrapper)).toEqual(['upcoming'])
    wrapper.unmount()
  })

  it('wraps backwards with ArrowLeft', async () => {
    const wrapper = mountTabs()
    const tablist = wrapper.find('[data-testid="base-tabs"]')

    await tablist.trigger('keydown', { key: 'ArrowLeft' })
    expect(lastSelection(wrapper)).toEqual(['failed'])

    await wrapper.setProps({ modelValue: 'published' })
    await tablist.trigger('keydown', { key: 'ArrowLeft' })
    expect(lastSelection(wrapper)).toEqual(['upcoming'])
    wrapper.unmount()
  })

  it('treats the vertical arrows like the horizontal ones', async () => {
    const down = mountTabs()
    await down.find('[data-testid="base-tabs"]').trigger('keydown', { key: 'ArrowDown' })
    expect(lastSelection(down)).toEqual(['published'])
    down.unmount()

    const up = mountTabs()
    await up.find('[data-testid="base-tabs"]').trigger('keydown', { key: 'ArrowUp' })
    expect(lastSelection(up)).toEqual(['failed'])
    up.unmount()
  })

  it('jumps to the first and the last tab with Home and End', async () => {
    const wrapper = mountTabs()
    const tablist = wrapper.find('[data-testid="base-tabs"]')

    await tablist.trigger('keydown', { key: 'End' })
    expect(lastSelection(wrapper)).toEqual(['failed'])

    await wrapper.setProps({ modelValue: 'failed' })
    await tablist.trigger('keydown', { key: 'Home' })
    expect(lastSelection(wrapper)).toEqual(['upcoming'])
    wrapper.unmount()
  })

  it('moves DOM focus along with the selection', async () => {
    const wrapper = mountTabs({}, true)

    await wrapper.find('[data-testid="base-tabs"]').trigger('keydown', { key: 'ArrowRight' })

    const focused = document.activeElement as HTMLElement | null
    expect(focused?.getAttribute('data-tab-id')).toBe('published')
    wrapper.unmount()
  })

  it('ignores keys it does not own', async () => {
    const wrapper = mountTabs()
    const tablist = wrapper.find('[data-testid="base-tabs"]')

    await tablist.trigger('keydown', { key: 'a' })
    await tablist.trigger('keydown', { key: 'Tab' })
    await tablist.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('starts from the first tab when the model matches nothing', async () => {
    const wrapper = mountTabs({ modelValue: 'gone' })
    const tablist = wrapper.find('[data-testid="base-tabs"]')

    await tablist.trigger('keydown', { key: 'ArrowRight' })
    expect(lastSelection(wrapper)).toEqual(['published'])
    wrapper.unmount()
  })

  it('keeps a single tab selected without wrapping anywhere', async () => {
    const wrapper = mountTabs({ tabs: [{ id: 'only', label: 'Only' }], modelValue: 'only' })
    const tablist = wrapper.find('[data-testid="base-tabs"]')

    await tablist.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('[role="tab"]').attributes('aria-selected')).toBe('true')
    wrapper.unmount()
  })

  it('renders an empty tablist without throwing', () => {
    const wrapper = mountTabs({ tabs: [], modelValue: 'upcoming' })

    expect(wrapper.find('[data-testid="base-tabs"]').attributes('role')).toBe('tablist')
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(0)
    wrapper.unmount()
  })
})
