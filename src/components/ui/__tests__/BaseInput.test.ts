import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { Mail } from 'lucide-vue-next'
import BaseInput from '@/components/ui/BaseInput.vue'

type InputProps = InstanceType<typeof BaseInput>['$props']

const TESTID = '[data-testid="base-input"]'

function mountInput(props: Partial<InputProps> = {}) {
  return mount(BaseInput, {
    props: { label: 'Email', modelValue: '', ...props },
  })
}

describe('BaseInput', () => {
  it('renders a permanent label bound to the control, not a placeholder', () => {
    const wrapper = mountInput({ label: 'Handle', placeholder: '@name' })
    const input = wrapper.get<HTMLInputElement>(TESTID)
    const label = wrapper.get('label')

    expect(label.text()).toContain('Handle')
    expect(label.attributes('for')).toBe(input.attributes('id'))
    expect(input.attributes('id')).not.toBe('')
    expect(input.attributes('placeholder')).toBe('@name')
  })

  it('renders the current model value', () => {
    const wrapper = mountInput({ modelValue: 'ada' })
    expect(wrapper.get<HTMLInputElement>(TESTID).element.value).toBe('ada')
  })

  it('emits update:modelValue while typing', async () => {
    const wrapper = mountInput({ modelValue: '' })
    const input = wrapper.get<HTMLInputElement>(TESTID)

    input.element.value = 'ada@example.com'
    await input.trigger('input')

    expect(wrapper.emitted('update:modelValue')).toEqual([['ada@example.com']])
    expect(wrapper.get<HTMLInputElement>(TESTID).element.value).toBe('ada@example.com')
  })

  it('wires aria-describedby to the hint while there is no error', () => {
    const wrapper = mountInput({ hint: 'We never share it.' })
    const input = wrapper.get<HTMLInputElement>(TESTID)
    const hint = wrapper.get('[data-testid="base-input-hint"]')

    expect(hint.text()).toBe('We never share it.')
    expect(input.attributes('aria-describedby')).toBe(hint.attributes('id'))
    expect(input.attributes('aria-invalid')).toBeUndefined()
  })

  it('replaces the hint with an alert and marks the field invalid', () => {
    const wrapper = mountInput({ hint: 'We never share it.', error: 'Already taken.' })
    const input = wrapper.get<HTMLInputElement>(TESTID)
    const alert = wrapper.get('[data-testid="base-input-error"]')

    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toBe('Already taken.')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe(alert.attributes('id'))
    expect(wrapper.find('[data-testid="base-input-hint"]').exists()).toBe(false)
  })

  it('omits aria-describedby entirely when there is no message', () => {
    const wrapper = mountInput()
    expect(wrapper.get<HTMLInputElement>(TESTID).attributes('aria-describedby')).toBeUndefined()
  })

  it('generates a distinct id per instance inside one app', () => {
    const Pair = defineComponent({
      setup: () => () =>
        h('div', [
          h(BaseInput, { label: 'First', modelValue: '' }),
          h(BaseInput, { label: 'Second', modelValue: '' }),
        ]),
    })
    const pair = mount(Pair)
    const inputs = pair.findAll<HTMLInputElement>(TESTID)
    const labels = pair.findAll('label')

    expect(inputs).toHaveLength(2)
    expect(inputs[0].attributes('id')).toBeTruthy()
    expect(inputs[0].attributes('id')).not.toBe(inputs[1].attributes('id'))
    expect(labels[0].attributes('for')).toBe(inputs[0].attributes('id'))
    expect(labels[1].attributes('for')).toBe(inputs[1].attributes('id'))
  })

  it('honours an explicit id prop', () => {
    const wrapper = mountInput({ id: 'composer-author' })
    expect(wrapper.get<HTMLInputElement>(TESTID).attributes('id')).toBe('composer-author')
    expect(wrapper.get('label').attributes('for')).toBe('composer-author')
  })

  it('blocks input while disabled and dims the control', async () => {
    const wrapper = mountInput({ disabled: true })
    const input = wrapper.get<HTMLInputElement>(TESTID)

    expect(input.attributes('disabled')).toBeDefined()
    expect(input.classes()).toContain('cursor-not-allowed')
    expect(input.classes()).toContain('opacity-60')

    input.element.value = 'nope'
    await input.trigger('input')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('forwards the native field attributes', () => {
    const wrapper = mountInput({
      type: 'email',
      required: true,
      maxlength: 120,
      autocomplete: 'email',
      inputmode: 'email',
      min: 1,
      max: 9,
    })
    const input = wrapper.get<HTMLInputElement>(TESTID)

    expect(input.attributes('type')).toBe('email')
    expect(input.attributes('required')).toBeDefined()
    expect(input.attributes('maxlength')).toBe('120')
    expect(input.attributes('autocomplete')).toBe('email')
    expect(input.attributes('inputmode')).toBe('email')
    expect(input.attributes('min')).toBe('1')
    expect(input.attributes('max')).toBe('9')
    expect(wrapper.get('label').text()).toContain('*')
  })

  it('renders the prefix icon and the suffix slot inside the control', () => {
    const wrapper = mount(BaseInput, {
      props: { label: 'Email', modelValue: '', prefixIcon: Mail },
      slots: { suffix: '<span data-testid="suffix">@gmail.com</span>' },
    })

    expect(wrapper.findComponent(Mail).exists()).toBe(true)
    expect(wrapper.get('[data-testid="suffix"]').text()).toBe('@gmail.com')
    expect(wrapper.get<HTMLInputElement>(TESTID).classes()).toContain('pl-9')
    expect(wrapper.get<HTMLInputElement>(TESTID).classes()).toContain('pr-10')
  })

  it('keeps the control at a 44px touch height', () => {
    expect(mountInput().get<HTMLInputElement>(TESTID).classes()).toContain('h-11')
  })
})
