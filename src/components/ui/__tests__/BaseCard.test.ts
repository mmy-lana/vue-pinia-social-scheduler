import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseCard from '@/components/ui/BaseCard.vue'

const TESTID = 'base-card'

function mountCard(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(BaseCard, { props: props as never, slots })
}

describe('BaseCard', () => {
  it('renders a padded surface div by default', () => {
    const card = mountCard({}, { default: 'Body copy' })

    expect(card.element.tagName).toBe('DIV')
    expect(card.attributes('data-testid')).toBe(TESTID)
    expect(card.classes()).toContain('card-surface')
    expect(card.classes()).toContain('p-5')
    expect(card.attributes('type')).toBeUndefined()
    expect(card.text()).toBe('Body copy')
  })

  it('maps every padding step', () => {
    expect(mountCard({ padding: 'sm' }).classes()).toContain('p-3')
    expect(mountCard({ padding: 'md' }).classes()).toContain('p-5')
    expect(mountCard({ padding: 'lg' }).classes()).toContain('p-6')
  })

  it('drops the padding entirely for padding="none"', () => {
    const card = mountCard({ padding: 'none' })

    expect(card.classes()).toContain('card-surface')
    expect(card.classes()).not.toContain('p-5')
    expect(card.classes()).not.toContain('p-3')
    expect(card.classes().some((name) => /^p-\d+$/.test(name))).toBe(false)
  })

  it('renders the requested tag through the as prop', () => {
    expect(mountCard({ as: 'section' }).element.tagName).toBe('SECTION')
    expect(mountCard({ as: 'li' }).element.tagName).toBe('LI')
  })

  it('becomes a real button when interactive', () => {
    const card = mountCard({ interactive: true }, { default: 'Pick me' })

    expect(card.element.tagName).toBe('BUTTON')
    expect(card.attributes('type')).toBe('button')
    expect(card.classes()).toContain('w-full')
    expect(card.classes()).toContain('text-left')
    expect(card.classes()).toContain('card-surface')
  })

  it('gives the interactive state a visible hover/active polish and a focus ring', () => {
    const card = mountCard({ interactive: true })

    expect(card.classes()).toContain('motion-safe:hover:border-brand-300')
    expect(card.classes()).toContain('motion-safe:hover:shadow-pop')
    expect(card.classes()).toContain('motion-safe:active:scale-[0.995]')
    expect(card.classes()).toContain('focus-visible:ring-2')
  })

  it('never adds hover-only state to a static card', () => {
    const card = mountCard()

    expect(card.classes().some((name) => name.includes(':hover'))).toBe(false)
    expect(card.classes().some((name) => name.includes(':active'))).toBe(false)
    expect(card.classes()).not.toContain('w-full')
  })

  it('keeps an explicit tag even when interactive', () => {
    const card = mountCard({ as: 'article', interactive: true })

    expect(card.element.tagName).toBe('ARTICLE')
    expect(card.classes()).toContain('text-left')
  })
})
