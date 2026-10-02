import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'

const TESTID = 'base-skeleton'

describe('BaseSkeleton', () => {
  it('renders one pulsing text line by default and hides itself from readers', () => {
    const skeleton = mount(BaseSkeleton)

    expect(skeleton.attributes('data-testid')).toBe(TESTID)
    expect(skeleton.attributes('aria-hidden')).toBe('true')
    expect(skeleton.attributes('role')).toBeUndefined()
    expect(skeleton.classes()).toContain('motion-safe:animate-pulse')
    expect(skeleton.findAll('[data-testid="base-skeleton-line"]')).toHaveLength(1)
    expect(skeleton.find('[data-testid="base-skeleton-text"]').attributes('aria-hidden')).toBe(
      'true',
    )
  })

  it('draws one block per line', () => {
    const skeleton = mount(BaseSkeleton, { props: { lines: 4 } })
    const lines = skeleton.findAll('[data-testid="base-skeleton-line"]')

    expect(lines).toHaveLength(4)
    for (const line of lines) {
      expect(line.classes()).toContain('bg-surface-muted')
      expect(line.classes()).toContain('h-4')
    }
  })

  it('clamps a nonsensical line count instead of rendering it', () => {
    expect(
      mount(BaseSkeleton, { props: { lines: 0 } }).findAll('[data-testid="base-skeleton-line"]'),
    ).toHaveLength(1)
    expect(
      mount(BaseSkeleton, { props: { lines: -3 } }).findAll('[data-testid="base-skeleton-line"]'),
    ).toHaveLength(1)
    expect(
      mount(BaseSkeleton, { props: { lines: 99 } }).findAll('[data-testid="base-skeleton-line"]'),
    ).toHaveLength(20)
  })

  it('can be rendered without the pulse animation', () => {
    const skeleton = mount(BaseSkeleton, { props: { animated: false } })

    expect(skeleton.classes().some((name) => name.includes('animate-'))).toBe(false)
  })

  it('becomes a labelled status region when a label is given', () => {
    const skeleton = mount(BaseSkeleton, { props: { label: 'Loading your posts' } })

    expect(skeleton.attributes('role')).toBe('status')
    expect(skeleton.attributes('aria-hidden')).toBeUndefined()
    expect(skeleton.find('.sr-only').text()).toBe('Loading your posts')
  })

  it('renders the card and circle variants', () => {
    const card = mount(BaseSkeleton, { props: { variant: 'card' } })
    expect(card.find('[data-testid="base-skeleton-card"]').exists()).toBe(true)
    expect(card.find('[data-testid="base-skeleton-text"]').exists()).toBe(false)
    expect(card.find('[data-testid="base-skeleton-card"]').classes()).toContain('rounded-card')

    const circle = mount(BaseSkeleton, { props: { variant: 'circle' } })
    const disc = circle.find('[data-testid="base-skeleton-circle"]')
    expect(disc.exists()).toBe(true)
    expect(disc.classes()).toContain('rounded-full')
    expect(disc.classes()).toContain('size-10')
  })

  it('ignores the line count for non-text variants', () => {
    const circle = mount(BaseSkeleton, { props: { variant: 'circle', lines: 5 } })

    expect(circle.findAll('[data-testid="base-skeleton-line"]')).toHaveLength(0)
  })
})
