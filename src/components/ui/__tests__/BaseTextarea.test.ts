import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'

type TextareaProps = InstanceType<typeof BaseTextarea>['$props']

const TESTID = '[data-testid="base-textarea"]'

function mountTextarea(props: Partial<TextareaProps> = {}) {
  return mount(BaseTextarea, {
    props: { label: 'Post content', modelValue: '', ...props },
  })
}

/** happy-dom reports 0 for every layout metric, so the measurement is faked. */
function stubScrollHeight(element: Element, value: number): void {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => value,
  })
}

async function settle(): Promise<void> {
  await nextTick()
  await nextTick()
}

describe('BaseTextarea', () => {
  it('renders a permanent label bound to the control', () => {
    const wrapper = mountTextarea({ label: 'Post content' })
    const textarea = wrapper.get<HTMLTextAreaElement>(TESTID)
    const label = wrapper.get('label')

    expect(label.text()).toContain('Post content')
    expect(label.attributes('for')).toBe(textarea.attributes('id'))
  })

  it('defaults to four rows and honours the rows prop', () => {
    expect(mountTextarea().get<HTMLTextAreaElement>(TESTID).attributes('rows')).toBe('4')
    expect(mountTextarea({ rows: 8 }).get<HTMLTextAreaElement>(TESTID).attributes('rows')).toBe('8')
  })

  it('renders the current model value and emits while typing', async () => {
    const wrapper = mountTextarea({ modelValue: 'Hello' })
    const textarea = wrapper.get<HTMLTextAreaElement>(TESTID)

    expect(textarea.element.value).toBe('Hello')

    textarea.element.value = 'Hello world'
    await textarea.trigger('input')

    expect(wrapper.emitted('update:modelValue')).toEqual([['Hello world']])
  })

  it('wires aria-describedby to the hint and to the error alert', async () => {
    const hinted = mountTextarea({ hint: '280 characters max.' })
    const hint = hinted.get('[data-testid="base-textarea-hint"]')
    expect(hinted.get<HTMLTextAreaElement>(TESTID).attributes('aria-describedby')).toBe(
      hint.attributes('id'),
    )
    expect(hinted.get<HTMLTextAreaElement>(TESTID).attributes('aria-invalid')).toBeUndefined()

    const invalid = mountTextarea({ hint: '280 characters max.', error: 'Too long.' })
    const alert = invalid.get('[data-testid="base-textarea-error"]')
    expect(alert.attributes('role')).toBe('alert')
    expect(invalid.get<HTMLTextAreaElement>(TESTID).attributes('aria-invalid')).toBe('true')
    expect(invalid.get<HTMLTextAreaElement>(TESTID).attributes('aria-describedby')).toBe(
      alert.attributes('id'),
    )
    expect(invalid.find('[data-testid="base-textarea-hint"]').exists()).toBe(false)
  })

  it('blocks input while disabled and dims the control', async () => {
    const wrapper = mountTextarea({ disabled: true })
    const textarea = wrapper.get<HTMLTextAreaElement>(TESTID)

    expect(textarea.attributes('disabled')).toBeDefined()
    expect(textarea.classes()).toContain('cursor-not-allowed')

    textarea.element.value = 'nope'
    await textarea.trigger('input')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('grows the control to the content height', async () => {
    const wrapper = mountTextarea()
    const textarea = wrapper.get<HTMLTextAreaElement>(TESTID)
    stubScrollHeight(textarea.element, 180)

    textarea.element.value = 'a longer draft'
    await textarea.trigger('input')
    await settle()

    expect(textarea.element.style.height).toBe('180px')
    expect(textarea.element.style.overflowY).toBe('hidden')
  })

  it('caps the growth at maxHeight and starts scrolling', async () => {
    const wrapper = mountTextarea({ maxHeight: '420px' })
    const textarea = wrapper.get<HTMLTextAreaElement>(TESTID)
    stubScrollHeight(textarea.element, 1200)

    textarea.element.value = 'a very long draft'
    await textarea.trigger('input')
    await settle()

    expect(textarea.element.style.height).toBe('420px')
    expect(textarea.element.style.overflowY).toBe('auto')
  })

  it('re-measures when the model changes from the parent', async () => {
    const wrapper = mountTextarea({ modelValue: 'a' })
    const textarea = wrapper.get<HTMLTextAreaElement>(TESTID)
    stubScrollHeight(textarea.element, 90)

    await wrapper.setProps({ modelValue: 'ab' })
    await settle()
    expect(textarea.element.style.height).toBe('90px')

    stubScrollHeight(textarea.element, 240)
    await wrapper.setProps({ modelValue: 'a much longer draft' })
    await settle()

    expect(textarea.element.value).toBe('a much longer draft')
    expect(textarea.element.style.height).toBe('240px')
  })

  it('leaves the height alone when autoGrow is off', async () => {
    const wrapper = mountTextarea({ autoGrow: false })
    const textarea = wrapper.get<HTMLTextAreaElement>(TESTID)
    stubScrollHeight(textarea.element, 400)

    textarea.element.value = 'a longer draft'
    await textarea.trigger('input')
    await settle()

    expect(textarea.element.style.height).toBe('')
    expect(textarea.element.style.overflowY).toBe('')
  })

  it('restores the inline height when autoGrow is switched back on', async () => {
    const wrapper = mountTextarea({ autoGrow: false })
    const textarea = wrapper.get<HTMLTextAreaElement>(TESTID)
    stubScrollHeight(textarea.element, 150)

    await wrapper.setProps({ autoGrow: true })
    await settle()

    expect(textarea.element.style.height).toBe('150px')
  })
})
