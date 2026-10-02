import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { Check, Minus } from 'lucide-vue-next'
import BaseCheckbox from '@/components/ui/BaseCheckbox.vue'

type CheckboxProps = InstanceType<typeof BaseCheckbox>['$props']

const TESTID = '[data-testid="base-checkbox"]'

let release: (() => void) | null = null

function mountCheckbox(props: Partial<CheckboxProps> = {}) {
  const wrapper = mount(BaseCheckbox, {
    attachTo: document.body,
    props: { label: 'Include hashtags', modelValue: false, ...props },
  })
  release = () => wrapper.unmount()
  return wrapper
}

afterEach(() => {
  release?.()
  release = null
})

describe('BaseCheckbox', () => {
  it('is a real checkbox with a label bound to it', () => {
    const wrapper = mountCheckbox()
    const input = wrapper.get<HTMLInputElement>(TESTID)
    const label = wrapper.get('label')

    expect(input.element.type).toBe('checkbox')
    expect(label.attributes('for')).toBe(input.attributes('id'))
    expect(label.text()).toContain('Include hashtags')
  })

  it('reflects the model in the checked state', async () => {
    const wrapper = mountCheckbox()
    expect(wrapper.get<HTMLInputElement>(TESTID).element.checked).toBe(false)

    await wrapper.setProps({ modelValue: true })
    expect(wrapper.get<HTMLInputElement>(TESTID).element.checked).toBe(true)
  })

  it('toggles when the label is clicked and emits update:modelValue', async () => {
    const wrapper = mountCheckbox()

    await wrapper.get('label').trigger('click')

    expect(wrapper.get<HTMLInputElement>(TESTID).element.checked).toBe(true)
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })

  it('toggles when the box itself is clicked', async () => {
    const wrapper = mountCheckbox({ modelValue: true })

    await wrapper.get<HTMLInputElement>(TESTID).setValue(false)

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('marks itself mixed and sets the DOM property when indeterminate', async () => {
    const wrapper = mountCheckbox({ indeterminate: true })
    const input = wrapper.get<HTMLInputElement>(TESTID)

    expect(input.element.indeterminate).toBe(true)
    expect(input.attributes('aria-checked')).toBe('mixed')
    expect(wrapper.findComponent(Minus).exists()).toBe(true)
    expect(wrapper.findComponent(Check).exists()).toBe(false)
  })

  it('updates the DOM property when indeterminate changes', async () => {
    const wrapper = mountCheckbox()
    const input = wrapper.get<HTMLInputElement>(TESTID)
    expect(input.element.indeterminate).toBe(false)

    await wrapper.setProps({ indeterminate: true })
    expect(wrapper.get<HTMLInputElement>(TESTID).element.indeterminate).toBe(true)
    expect(wrapper.findComponent(Minus).exists()).toBe(true)

    await wrapper.setProps({ indeterminate: false })
    expect(wrapper.get<HTMLInputElement>(TESTID).element.indeterminate).toBe(false)
    expect(wrapper.findComponent(Minus).exists()).toBe(false)
  })

  it('shows the check mark only when checked', async () => {
    const wrapper = mountCheckbox()
    expect(wrapper.findComponent(Check).exists()).toBe(false)

    await wrapper.setProps({ modelValue: true })
    expect(wrapper.findComponent(Check).exists()).toBe(true)
  })

  it('wires aria-describedby to the description', () => {
    const withDescription = mountCheckbox({ description: 'Adds #trending to the caption.' })
    const description = withDescription.get('[id$="-description"]')

    expect(description.text()).toBe('Adds #trending to the caption.')
    expect(withDescription.get(TESTID).attributes('aria-describedby')).toBe(
      description.attributes('id'),
    )

    const without = mountCheckbox()
    expect(without.get(TESTID).attributes('aria-describedby')).toBeUndefined()
  })

  it('blocks interaction while disabled', async () => {
    const wrapper = mountCheckbox({ disabled: true })
    const input = wrapper.get<HTMLInputElement>(TESTID)

    expect(input.attributes('disabled')).toBeDefined()
    expect(wrapper.get('label').classes()).toContain('cursor-not-allowed')
    expect(wrapper.get('label').classes()).toContain('opacity-60')

    await wrapper.get('label').trigger('click')
    expect(input.element.checked).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('keeps the input focusable and paints the ring on the box', () => {
    const wrapper = mountCheckbox()
    const input = wrapper.get<HTMLInputElement>(TESTID)
    input.element.focus()

    expect(document.activeElement).toBe(input.element)
    // The input is transparent but focusable; the ring is a peer variant on the
    // box that follows it in the DOM.
    expect(input.classes()).toContain('opacity-0')
    expect(wrapper.get('[aria-hidden="true"]').classes()).toContain('peer-focus-visible:ring-2')
  })

  it('keeps the whole row as a 44px touch target', () => {
    expect(
      mountCheckbox({ description: 'A longer explanation.' }).get('label').classes(),
    ).toContain('min-h-11')
  })
})
