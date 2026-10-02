import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'

const TESTID = 'base-spinner'

describe('BaseSpinner', () => {
  it('renders a labelled status region at md by default', () => {
    const spinner = mount(BaseSpinner)

    expect(spinner.element.tagName).toBe('SPAN')
    expect(spinner.attributes('role')).toBe('status')
    expect(spinner.attributes('aria-label')).toBe('Loading')
    expect(spinner.attributes('data-testid')).toBe(TESTID)
    expect(spinner.classes()).toContain('size-7')
    expect(spinner.find('.sr-only').text()).toBe('Loading')
  })

  it('maps the four sizes to 16 / 20 / 28 / 40 px', () => {
    const expected: Array<[string, string]> = [
      ['xs', 'size-4'],
      ['sm', 'size-5'],
      ['md', 'size-7'],
      ['lg', 'size-10'],
    ]

    for (const [size, className] of expected) {
      const spinner = mount(BaseSpinner, { props: { size: size as 'xs' } })
      expect(spinner.classes(), size).toContain(className)
      expect(spinner.find('svg').classes(), size).toContain(className)
    }
  })

  it('spins only when motion is allowed and hides the icon from readers', () => {
    const icon = mount(BaseSpinner).find('svg')

    expect(icon.classes()).toContain('motion-safe:animate-spin')
    expect(icon.attributes('aria-hidden')).toBe('true')
  })

  it('uses a custom label for both the region and the sr-only text', () => {
    const spinner = mount(BaseSpinner, { props: { label: 'Publishing posts' } })

    expect(spinner.attributes('aria-label')).toBe('Publishing posts')
    expect(spinner.find('.sr-only').text()).toBe('Publishing posts')
  })

  it('inherits the current color instead of hard-coding one', () => {
    const spinner = mount(BaseSpinner)

    expect(spinner.classes().some((name) => name.startsWith('text-'))).toBe(false)
  })
})
