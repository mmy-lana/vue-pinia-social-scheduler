import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'

type SwitchProps = InstanceType<typeof BaseSwitch>['$props']

const TESTID = '[data-testid="base-switch"]'
const TRACK = '[data-testid="base-switch-track"]'

let release: (() => void) | null = null

function mountSwitch(props: Partial<SwitchProps> = {}) {
  const wrapper = mount(BaseSwitch, {
    attachTo: document.body,
    props: { label: 'Simulate failures', modelValue: false, ...props },
  })
  release = () => wrapper.unmount()
  return wrapper
}

afterEach(() => {
  release?.()
  release = null
})

describe('BaseSwitch', () => {
  it('is a native button carrying the switch role', () => {
    const wrapper = mountSwitch()
    const root = wrapper.get(TESTID)

    expect(root.element.tagName).toBe('BUTTON')
    expect(root.attributes('type')).toBe('button')
    expect(root.attributes('role')).toBe('switch')
  })

  it('reflects the model in aria-checked', async () => {
    const wrapper = mountSwitch()
    expect(wrapper.get(TESTID).attributes('aria-checked')).toBe('false')

    await wrapper.setProps({ modelValue: true })
    expect(wrapper.get(TESTID).attributes('aria-checked')).toBe('true')
  })

  it('toggles on click and emits update:modelValue', async () => {
    const wrapper = mountSwitch()

    await wrapper.get(TESTID).trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])

    await wrapper.setProps({ modelValue: true })
    await wrapper.get(TESTID).trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true], [false]])
  })

  it('toggles the painted track alongside the state', async () => {
    const wrapper = mountSwitch({ modelValue: true })
    expect(wrapper.get(TRACK).classes()).toContain('bg-brand-600')

    await wrapper.setProps({ modelValue: false })
    expect(wrapper.get(TRACK).classes()).toContain('bg-line')
  })

  it('relies on native button activation for Space and Enter', async () => {
    const wrapper = mountSwitch()
    const root = wrapper.get<HTMLButtonElement>(TESTID)

    // Space and Enter reach a real <button> as synthesized click events, so the
    // component must neither swallow those keys nor fake the activation with a
    // keydown handler of its own (which would double-toggle in a browser).
    for (const key of [' ', 'Enter']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      root.element.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }

    // Exactly what a browser performs for those two keys.
    root.element.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })

  it('wires aria-describedby to the description', () => {
    const withDescription = mountSwitch({ description: 'Injects deterministic failures.' })
    const description = withDescription.get('[id$="-description"]')

    expect(description.text()).toBe('Injects deterministic failures.')
    expect(withDescription.get(TESTID).attributes('aria-describedby')).toBe(
      description.attributes('id'),
    )

    const without = mountSwitch()
    expect(without.get(TESTID).attributes('aria-describedby')).toBeUndefined()
  })

  it('blocks clicks while disabled', async () => {
    const wrapper = mountSwitch({ disabled: true })
    const root = wrapper.get(TESTID)

    expect(root.attributes('disabled')).toBeDefined()
    expect(root.classes()).toContain('cursor-not-allowed')
    expect(root.classes()).toContain('opacity-60')

    await root.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('keeps the whole row as a 44px touch target', () => {
    const wrapper = mountSwitch({ description: 'A description that wraps onto a second line.' })
    const root = wrapper.get(TESTID)

    expect(root.classes()).toContain('min-h-11')
    expect(root.classes()).toContain('w-full')
  })
})
