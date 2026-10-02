import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { ChevronDown } from 'lucide-vue-next'
import BaseSelect from '@/components/ui/BaseSelect.vue'

type SelectProps = InstanceType<typeof BaseSelect>['$props']

const TESTID = '[data-testid="base-select"]'

const OPTIONS = [
  { value: 'now', label: 'Publish now' },
  { value: 'queue', label: 'Add to queue' },
  { value: 'draft', label: 'Save as draft', disabled: true },
]

function mountSelect(props: Partial<SelectProps> = {}) {
  return mount(BaseSelect, {
    props: { label: 'Mode', options: OPTIONS, modelValue: '', ...props },
  })
}

describe('BaseSelect', () => {
  it('renders a permanent label bound to the control', () => {
    const wrapper = mountSelect()
    const select = wrapper.get<HTMLSelectElement>(TESTID)
    const label = wrapper.get('label')

    expect(label.text()).toBe('Mode')
    expect(label.attributes('for')).toBe(select.attributes('id'))
  })

  it('renders every option with its label', () => {
    const wrapper = mountSelect({ modelValue: 'now' })
    const options = wrapper.get<HTMLSelectElement>(TESTID).findAll('option')

    expect(options.map((option) => option.text())).toEqual([
      'Publish now',
      'Add to queue',
      'Save as draft',
    ])
    expect(options.map((option) => option.attributes('value'))).toEqual(['now', 'queue', 'draft'])
    expect(options[2]?.attributes('disabled')).toBeDefined()
  })

  it('prepends the placeholder as a disabled empty option', () => {
    const wrapper = mountSelect({ placeholder: 'Choose a mode' })
    const first = wrapper.get<HTMLSelectElement>(TESTID).find('option')

    expect(first?.text()).toBe('Choose a mode')
    expect(first?.attributes('value')).toBe('')
    expect(first?.attributes('disabled')).toBeDefined()
  })

  it('adds no empty option when no placeholder is given', () => {
    const wrapper = mountSelect()
    const values = wrapper
      .get<HTMLSelectElement>(TESTID)
      .findAll('option')
      .map((o) => o.attributes('value'))

    expect(values).toEqual(['now', 'queue', 'draft'])
  })

  it('reflects the model value as the selected option', () => {
    const wrapper = mountSelect({ modelValue: 'queue' })
    expect(wrapper.get<HTMLSelectElement>(TESTID).element.value).toBe('queue')
  })

  it('emits update:modelValue on a native change', async () => {
    const wrapper = mountSelect({ modelValue: 'now' })

    await wrapper.get<HTMLSelectElement>(TESTID).setValue('queue')

    expect(wrapper.emitted('update:modelValue')).toEqual([['queue']])
  })

  it('wires aria-describedby to the hint and to the error alert', () => {
    const hinted = mountSelect({ hint: 'Applies to every selected account.' })
    const hint = hinted.get('[data-testid="base-select-hint"]')
    expect(hinted.get<HTMLSelectElement>(TESTID).attributes('aria-describedby')).toBe(
      hint.attributes('id'),
    )
    expect(hinted.get<HTMLSelectElement>(TESTID).attributes('aria-invalid')).toBeUndefined()

    const invalid = mountSelect({ hint: 'Applies to every account.', error: 'Pick a mode.' })
    const alert = invalid.get('[data-testid="base-select-error"]')
    expect(alert.attributes('role')).toBe('alert')
    expect(invalid.get<HTMLSelectElement>(TESTID).attributes('aria-invalid')).toBe('true')
    expect(invalid.get<HTMLSelectElement>(TESTID).attributes('aria-describedby')).toBe(
      alert.attributes('id'),
    )
    expect(invalid.find('[data-testid="base-select-hint"]').exists()).toBe(false)
  })

  it('blocks a change while disabled', async () => {
    const wrapper = mountSelect({ disabled: true })
    const select = wrapper.get<HTMLSelectElement>(TESTID)

    expect(select.attributes('disabled')).toBeDefined()
    expect(select.classes()).toContain('cursor-not-allowed')

    await select.setValue('queue')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('drops the native appearance and paints a decorative chevron', () => {
    const wrapper = mountSelect()
    const select = wrapper.get<HTMLSelectElement>(TESTID)

    expect(select.classes()).toContain('appearance-none')
    expect(select.classes()).toContain('h-11')
    expect(wrapper.findComponent(ChevronDown).exists()).toBe(true)
    expect(wrapper.findComponent(ChevronDown).attributes('aria-hidden')).toBe('true')
  })
})
