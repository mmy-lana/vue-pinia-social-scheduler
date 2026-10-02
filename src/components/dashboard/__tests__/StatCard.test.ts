import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { CalendarCheck } from 'lucide-vue-next'
import StatCard from '@/components/dashboard/StatCard.vue'
import type { Component } from 'vue'

function mountCard(props: Record<string, unknown> = {}) {
  return mount(StatCard, { props: props as never })
}

describe('StatCard', () => {
  it('renders a card surface with the label and value', () => {
    const wrapper = mountCard({ label: 'Scheduled', value: 12 })

    expect(wrapper.get('[data-testid="stat-card"]').classes()).toContain('card-surface')
    expect(wrapper.get('[data-testid="stat-card-label"]').text()).toBe('Scheduled')
    expect(wrapper.get('[data-testid="stat-card-label"]').classes()).toContain('uppercase')
    expect(wrapper.get('[data-testid="stat-card-value"]').text()).toBe('12')
  })

  it('accepts a string value verbatim', () => {
    expect(mountCard({ label: 'Engagement', value: '1.2K' }).get('[data-testid="stat-card-value"]').text()).toBe(
      '1.2K',
    )
  })

  it('omits the caption, delta and icon when they are not provided', () => {
    const wrapper = mountCard({ label: 'Drafts', value: 0 })

    expect(wrapper.find('[data-testid="stat-card-caption"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="stat-card-delta"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="stat-card-icon"]').exists()).toBe(false)
  })

  it('shows the caption when one is given', () => {
    const wrapper = mountCard({ label: 'Published', value: 8, caption: 'in the last 7 days' })

    expect(wrapper.get('[data-testid="stat-card-caption"]').text()).toBe('in the last 7 days')
  })

  it('renders the delta with an up arrow', () => {
    const wrapper = mountCard({ label: 'Published', value: 8, delta: '+3 this week' })

    const delta = wrapper.get('[data-testid="stat-card-delta"]')
    expect(delta.text()).toContain('+3 this week')
    expect(delta.classes()).toContain('text-ok')
    expect(delta.find('svg').exists()).toBe(true)
    expect(delta.find('svg').attributes('aria-hidden')).toBe('true')
  })

  it('paints the icon circle from the tone and keeps it decorative', () => {
    const icon = CalendarCheck as Component
    const cases: Array<[string, string]> = [
      ['neutral', 'bg-surface-muted'],
      ['brand', 'bg-brand-50'],
      ['ok', 'bg-ok/10'],
      ['warn', 'bg-warn/15'],
      ['danger', 'bg-danger/10'],
    ]

    for (const [tone, background] of cases) {
      const wrapper = mountCard({ label: 'Failed', value: 2, icon, tone })
      const circle = wrapper.get('[data-testid="stat-card-icon"]')

      expect(wrapper.get('[data-testid="stat-card"]').attributes('data-tone')).toBe(tone)
      expect(circle.classes()).toContain(background)
      expect(circle.attributes('aria-hidden')).toBe('true')
      expect(circle.findComponent(CalendarCheck).exists()).toBe(true)
    }
  })

  it('defaults to the neutral tone', () => {
    expect(mountCard({ label: 'Channels', value: 3 }).attributes('data-tone')).toBe('neutral')
  })
})