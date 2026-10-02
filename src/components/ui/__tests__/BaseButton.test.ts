import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { Plus, Send } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'

const TESTID = 'base-button'

function mountButton(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(BaseButton, {
    props: props as never,
    slots,
  })
}

describe('BaseButton', () => {
  it('renders a primary md button by default', () => {
    const button = mountButton({}, { default: 'Save' })

    expect(button.element.tagName).toBe('BUTTON')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('data-testid')).toBe(TESTID)
    expect(button.classes()).toContain('bg-brand-600')
    expect(button.classes()).toContain('rounded-control')
    expect(button.classes()).toContain('min-h-11')
    expect(button.classes()).toContain('px-4')
    expect(button.classes()).toContain('text-sm')
    expect(button.text()).toBe('Save')
  })

  it('applies the variant classes', () => {
    const secondary = mountButton({ variant: 'secondary' })
    expect(secondary.classes()).toContain('bg-surface')
    expect(secondary.classes()).toContain('border-line')

    const ghost = mountButton({ variant: 'ghost' })
    expect(ghost.classes()).toContain('text-ink-muted')
    expect(ghost.classes()).not.toContain('bg-brand-600')

    const danger = mountButton({ variant: 'danger' })
    expect(danger.classes()).toContain('bg-danger')
  })

  it('applies the size classes', () => {
    expect(mountButton({ size: 'sm' }).classes()).toContain('px-3')
    expect(mountButton({ size: 'lg' }).classes()).toContain('px-5')
    expect(mountButton({ size: 'lg' }).classes()).toContain('text-base')
    for (const size of ['sm', 'md', 'lg']) {
      expect(mountButton({ size }).classes()).toContain('min-h-11')
    }
  })

  it('honours the type prop and the block prop', () => {
    expect(mountButton({ type: 'submit' }).attributes('type')).toBe('submit')
    expect(mountButton({ type: 'reset' }).attributes('type')).toBe('reset')
    expect(mountButton({ block: true }).classes()).toContain('w-full')
    expect(mountButton({ block: false }).classes()).not.toContain('w-full')
  })

  it('renders the leading and trailing icons', () => {
    const button = mountButton({ iconLeft: Plus, iconRight: Send })

    expect(button.find('[data-testid="base-button-icon-left"]').exists()).toBe(true)
    expect(button.find('[data-testid="base-button-icon-right"]').exists()).toBe(true)
    expect(button.findComponent(Plus).exists()).toBe(true)
    expect(button.findComponent(Send).exists()).toBe(true)
  })

  it('exposes ariaLabel for icon-only usage', () => {
    expect(mountButton({ ariaLabel: 'Add post' }).attributes('aria-label')).toBe('Add post')
  })

  it('emits click with the original MouseEvent', async () => {
    const button = mountButton({}, { default: 'Publish' })

    await button.trigger('click')

    expect(button.emitted('click')).toHaveLength(1)
    expect(button.emitted('click')?.[0]?.[0]).toBeInstanceOf(Event)
  })

  it('blocks clicks while disabled', async () => {
    const button = mountButton({ disabled: true }, { default: 'Publish' })

    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')

    expect(button.emitted('click')).toBeUndefined()
  })

  it('renders an anchor with the same styling when href is set', async () => {
    const link = mountButton({ href: '#docs' }, { default: 'Read the docs' })

    expect(link.element.tagName).toBe('A')
    expect(link.attributes('href')).toBe('#docs')
    expect(link.attributes('rel')).toBe('noopener')
    expect(link.attributes('data-testid')).toBe(TESTID)
    expect(link.classes()).toContain('bg-brand-600')
    expect(link.attributes('type')).toBeUndefined()

    await link.trigger('click')
    expect(link.emitted('click')).toHaveLength(1)
  })

  it('keeps the label in the DOM and blocks clicks while loading', async () => {
    const button = mountButton({ loading: true }, { default: 'Publishing' })
    const label = button.find('[data-testid="base-button-label"]')

    expect(button.text()).toContain('Publishing')
    expect(label.exists()).toBe(true)
    expect(label.classes()).toContain('opacity-0')
    expect(button.find('[data-testid="base-button-spinner"]').exists()).toBe(true)
    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.attributes('disabled')).toBeDefined()

    await button.trigger('click')
    expect(button.emitted('click')).toBeUndefined()
  })

  it('hides the spinner again once loading finishes', () => {
    const button = mountButton({ loading: false }, { default: 'Publishing' })

    expect(button.find('[data-testid="base-button-spinner"]').exists()).toBe(false)
    expect(button.attributes('aria-busy')).toBeUndefined()
    expect(button.find('[data-testid="base-button-label"]').classes()).not.toContain('opacity-0')
  })

  it('marks an inactive anchor as aria-disabled and blocks its click', async () => {
    const link = mountButton({ href: '#docs', disabled: true }, { default: 'Docs' })

    expect(link.attributes('aria-disabled')).toBe('true')
    await link.trigger('click')
    expect(link.emitted('click')).toBeUndefined()
  })
})
