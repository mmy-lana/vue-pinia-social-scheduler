import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { Pencil, Search } from 'lucide-vue-next'
import BaseIconButton from '@/components/ui/BaseIconButton.vue'

const TESTID = 'base-icon-button'

function mountIconButton(props: Record<string, unknown> = {}) {
  return mount(BaseIconButton, {
    props: { label: 'Edit post', icon: Pencil, ...props } as never,
  })
}

describe('BaseIconButton', () => {
  it('takes its accessible name from the required label prop', () => {
    const button = mountIconButton()

    expect(button.attributes('aria-label')).toBe('Edit post')
    expect(button.attributes('title')).toBe('Edit post')
    expect(button.attributes('data-testid')).toBe(TESTID)
    expect(button.attributes('type')).toBe('button')
    expect(button.text()).toBe('')
    expect(button.findComponent(Pencil).exists()).toBe(true)
  })

  it('is ghost by default and never smaller than 44×44', () => {
    const button = mountIconButton()

    expect(button.classes()).toContain('text-ink-muted')
    expect(button.classes()).toContain('min-h-11')
    expect(button.classes()).toContain('min-w-11')
  })

  it('grows at lg and keeps the 44px floor at sm', () => {
    expect(mountIconButton({ size: 'lg' }).classes()).toContain('min-h-12')
    expect(mountIconButton({ size: 'lg' }).classes()).toContain('min-w-12')
    expect(mountIconButton({ size: 'sm' }).classes()).toContain('min-h-11')
    expect(mountIconButton({ size: 'sm' }).classes()).toContain('min-w-11')
  })

  it('applies the variant classes', () => {
    expect(mountIconButton({ variant: 'primary' }).classes()).toContain('bg-brand-600')
    expect(mountIconButton({ variant: 'secondary' }).classes()).toContain('border-line')
    expect(mountIconButton({ variant: 'danger' }).classes()).toContain('bg-danger')
  })

  it('emits click with the original MouseEvent', async () => {
    const button = mountIconButton({ icon: Search })

    await button.trigger('click')

    expect(button.emitted('click')).toHaveLength(1)
    expect(button.emitted('click')?.[0]?.[0]).toBeInstanceOf(Event)
  })

  it('blocks clicks while disabled', async () => {
    const button = mountIconButton({ disabled: true })

    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')

    expect(button.emitted('click')).toBeUndefined()
  })

  it('swaps the icon for a spinner while loading and blocks clicks', async () => {
    const button = mountIconButton({ loading: true })

    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.find('[data-testid="base-icon-button-spinner"]').exists()).toBe(true)
    expect(button.find('[data-testid="base-icon-button-icon"]').exists()).toBe(false)
    expect(button.attributes('aria-label')).toBe('Edit post')

    await button.trigger('click')
    expect(button.emitted('click')).toBeUndefined()
  })

  it('reflects the pressed state through aria-pressed', () => {
    expect(mountIconButton().attributes('aria-pressed')).toBe('false')
    expect(mountIconButton({ active: true }).attributes('aria-pressed')).toBe('true')
    expect(mountIconButton({ active: true }).classes()).toContain('bg-brand-50')
  })
})
