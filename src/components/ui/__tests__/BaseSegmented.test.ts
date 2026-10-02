import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { Calendar, List } from 'lucide-vue-next'
import BaseSegmented from '@/components/ui/BaseSegmented.vue'

type SegmentedProps = InstanceType<typeof BaseSegmented>['$props']

const GROUP = '[data-testid="base-segmented"]'
const OPTION = '[data-testid="base-segmented-option"]'

const OPTIONS = [
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List', icon: List },
  { value: 'month', label: 'Month', icon: Calendar },
]

let release: (() => void) | null = null

function mountGroup(props: Partial<SegmentedProps> = {}) {
  const wrapper = mount(BaseSegmented, {
    attachTo: document.body,
    props: { options: OPTIONS, ariaLabel: 'View', modelValue: 'grid', ...props },
  })
  release = () => wrapper.unmount()
  return wrapper
}

afterEach(() => {
  release?.()
  release = null
})

describe('BaseSegmented', () => {
  it('is a labelled radiogroup of radios', () => {
    const wrapper = mountGroup()
    const group = wrapper.get(GROUP)

    expect(group.attributes('role')).toBe('radiogroup')
    expect(group.attributes('aria-label')).toBe('View')
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(3)
  })

  it('marks exactly one option as checked', () => {
    const wrapper = mountGroup({ modelValue: 'list' })
    const checked = wrapper
      .findAll('[role="radio"]')
      .filter((radio) => radio.attributes('aria-checked') === 'true')

    expect(checked).toHaveLength(1)
    expect(checked[0]?.attributes('data-value')).toBe('list')
  })

  it('keeps only the selected option in the tab order', () => {
    const wrapper = mountGroup({ modelValue: 'list' })
    const tabindexes = wrapper
      .findAll('[role="radio"]')
      .map((radio) => radio.attributes('tabindex'))

    expect(tabindexes).toEqual(['-1', '0', '-1'])
  })

  it('falls back to the first option when the model matches nothing', () => {
    const wrapper = mountGroup({ modelValue: 'missing' })
    const radios = wrapper.findAll('[role="radio"]')

    expect(radios.every((radio) => radio.attributes('aria-checked') === 'false')).toBe(true)
    expect(radios[0]?.attributes('tabindex')).toBe('0')
  })

  it('selects and emits on click', async () => {
    const wrapper = mountGroup()

    await wrapper.findAll(OPTION)[2].trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['month']])
  })

  it('moves and selects with ArrowRight and ArrowDown, wrapping around', async () => {
    const wrapper = mountGroup()
    const group = wrapper.get(GROUP)

    await group.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['list']])

    await wrapper.setProps({ modelValue: 'list' })
    await group.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['list'], ['month']])

    await wrapper.setProps({ modelValue: 'month' })
    await group.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['list'], ['month'], ['grid']])
  })

  it('moves and selects with ArrowLeft and ArrowUp, wrapping around', async () => {
    const wrapper = mountGroup()
    const group = wrapper.get(GROUP)

    await group.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['month']])

    await wrapper.setProps({ modelValue: 'month' })
    await group.trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['month'], ['list']])
  })

  it('jumps to the ends with Home and End', async () => {
    const wrapper = mountGroup({ modelValue: 'list' })
    const group = wrapper.get(GROUP)

    await group.trigger('keydown', { key: 'End' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['month']])

    await wrapper.setProps({ modelValue: 'month' })
    await group.trigger('keydown', { key: 'Home' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['month'], ['grid']])
  })

  it('selects with Space and Enter', async () => {
    for (const key of [' ', 'Enter']) {
      const wrapper = mountGroup({ modelValue: 'missing' })

      await wrapper.get(GROUP).trigger('keydown', { key })

      expect(wrapper.emitted('update:modelValue')).toEqual([['grid']])
    }
  })

  it('leaves the selection alone for keys it does not own', async () => {
    const wrapper = mountGroup()

    await wrapper.get(GROUP).trigger('keydown', { key: 'a' })

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('moves focus onto the newly selected option', async () => {
    const wrapper = mountGroup()
    const group = wrapper.get(GROUP)

    group.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(document.activeElement).toBe(wrapper.findAll(OPTION)[1].element)
  })

  it('cancels the arrow keys so the page does not scroll', () => {
    const wrapper = mountGroup()
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    })

    wrapper.get(GROUP).element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('renders an option icon per option', () => {
    const wrapper = mountGroup()

    expect(wrapper.findAllComponents(List)).toHaveLength(1)
    expect(wrapper.findAllComponents(Calendar)).toHaveLength(1)
  })

  it('paints the selected option on a muted track', () => {
    const wrapper = mountGroup({ modelValue: 'list' })
    const selected = wrapper.findAll(OPTION)[1]
    const idle = wrapper.findAll(OPTION)[0]

    expect(wrapper.get(GROUP).classes()).toContain('bg-surface-muted')
    expect(selected.classes()).toContain('bg-surface')
    expect(selected.classes()).toContain('shadow-card')
    expect(selected.classes()).toContain('text-brand-700')
    expect(idle.classes()).toContain('text-ink-muted')
  })

  it('stretches to the container when block is set', () => {
    const wrapper = mountGroup({ block: true })

    expect(wrapper.get(GROUP).classes()).toContain('w-full')
    expect(wrapper.findAll(OPTION)[0].classes()).toContain('flex-1')
  })

  it('keeps every option at a 44px touch target in both sizes', () => {
    for (const size of ['sm', 'md'] as const) {
      const wrapper = mountGroup({ size })
      for (const option of wrapper.findAll('[role="radio"]')) {
        expect(option.classes()).toContain('min-h-11')
      }
    }
  })

  it('renders no interactive option for an empty option list', async () => {
    const wrapper = mountGroup({ options: [] })

    expect(wrapper.findAll('[role="radio"]')).toHaveLength(0)

    await wrapper.get(GROUP).trigger('keydown', { key: 'ArrowRight' })

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
