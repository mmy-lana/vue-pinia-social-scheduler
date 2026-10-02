import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CharCounter from '@/components/composer/CharCounter.vue'
import type { PlatformId } from '@/types'

const TESTID = '[data-testid="char-counter"]'
const RING = '[data-testid="base-progress-ring-value"]'

type CounterProps = InstanceType<typeof CharCounter>['$props']

function mountCounter(props: Partial<CounterProps> = {}) {
  return mount(CharCounter, { props: { used: 10, limit: 280, ...props } })
}

function toneOf(props: Partial<CounterProps>): string[] {
  return mountCounter(props).get(RING).classes()
}

describe('CharCounter', () => {
  it('feeds the ring the raw used/limit pair', () => {
    const wrapper = mountCounter({ used: 140, limit: 280 })
    const ring = wrapper.get('[data-testid="base-progress-ring"]')

    expect(wrapper.find(RING).exists()).toBe(true)
    expect(ring.attributes('aria-valuenow')).toBe('50')
    expect(ring.attributes('aria-valuemax')).toBe('280')
  })

  it('stays calm below 90% of the limit', () => {
    expect(toneOf({ used: 0, limit: 100 })).toContain('stroke-ok')
    expect(toneOf({ used: 89, limit: 100 })).toContain('stroke-ok')
  })

  it('warns from 90% of the limit up to the last character', () => {
    expect(toneOf({ used: 90, limit: 100 })).toContain('stroke-warn')
    expect(toneOf({ used: 99, limit: 100 })).toContain('stroke-warn')
  })

  it('turns red at and past the limit', () => {
    expect(toneOf({ used: 100, limit: 100 })).toContain('stroke-danger')
    expect(toneOf({ used: 150, limit: 100 })).toContain('stroke-danger')
  })

  it('never divides by a zero or negative limit', () => {
    const wrapper = mountCounter({ used: 10, limit: 0 })

    expect(wrapper.get(RING).classes()).toContain('stroke-danger')
    expect(wrapper.find(TESTID).exists()).toBe(true)
  })

  it('counts down the characters that are still available', () => {
    expect(mountCounter({ used: 238, limit: 280 }).get('[data-testid="char-counter-headline"]').text()).toBe(
      '42 left',
    )
    expect(mountCounter({ used: 0, limit: 280 }).get('[data-testid="char-counter-headline"]').text()).toBe(
      '280 left',
    )
  })

  it('counts up once the text is longer than the limit', () => {
    expect(
      mountCounter({ used: 292, limit: 280 }).get('[data-testid="char-counter-headline"]').text(),
    ).toBe('12 over')
    expect(
      mountCounter({ used: 280, limit: 280 }).get('[data-testid="char-counter-headline"]').text(),
    ).toBe('0 over')
  })

  it('colours the headline to match the ring', () => {
    const headline = (used: number, limit: number): string[] =>
      mountCounter({ used, limit }).get('[data-testid="char-counter-headline"]').classes()

    expect(headline(10, 100)).toContain('text-ok')
    expect(headline(95, 100)).toContain('text-warn')
    expect(headline(120, 100)).toContain('text-danger')
  })

  it('names the channel that decided the limit', () => {
    expect(mountCounter({ limitedBy: undefined }).find('[data-testid="char-counter-limited-by"]').exists()).toBe(
      false,
    )

    const wrapper = mountCounter({ used: 30, limit: 30, limitedBy: 'x' satisfies PlatformId })
    const caption = wrapper.get('[data-testid="char-counter-limited-by"]')

    expect(caption.text()).toBe('Limited by X')

    const linkedin = mountCounter({ limitedBy: 'linkedin' })
    expect(linkedin.get('[data-testid="char-counter-limited-by"]').text()).toBe('Limited by LinkedIn')
  })

  it('announces the used and limit pair in a polite status', () => {
    const wrapper = mountCounter({ used: 238, limit: 280, name: 'Post content' })
    const status = wrapper.get(TESTID)

    expect(status.attributes('role')).toBe('status')
    expect(status.attributes('aria-label')).toBe(
      'Post content: 238 of 280 characters used. 42 left.',
    )
  })
})
