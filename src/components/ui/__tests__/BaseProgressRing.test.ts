import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseProgressRing from '@/components/ui/BaseProgressRing.vue'

const TESTID = 'base-progress-ring'
const RADIUS = (40 - 4) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function mountRing(props: Record<string, unknown> = {}) {
  return mount(BaseProgressRing, { props: { value: 0, ...props } as never })
}

function dashOffsetOf(wrapper: ReturnType<typeof mountRing>): number {
  return Number(
    wrapper.find('[data-testid="base-progress-ring-value"]').attributes('stroke-dashoffset'),
  )
}

describe('BaseProgressRing', () => {
  it('renders a progressbar named Progress with 0–100 bounds by default', () => {
    const ring = mountRing({ value: 40 })

    expect(ring.attributes('role')).toBe('progressbar')
    expect(ring.attributes('data-testid')).toBe(TESTID)
    expect(ring.attributes('aria-label')).toBe('Progress')
    expect(ring.attributes('aria-valuemin')).toBe('0')
    expect(ring.attributes('aria-valuemax')).toBe('100')
    expect(ring.attributes('aria-valuenow')).toBe('40')
  })

  it('takes a custom accessible name', () => {
    expect(mountRing({ label: 'Publishing progress' }).attributes('aria-label')).toBe(
      'Publishing progress',
    )
  })

  it('sizes the svg and the circles from the size and thickness props', () => {
    const ring = mountRing({ value: 10, size: 64, thickness: 8 })
    const svg = ring.find('svg')

    expect(svg.attributes('width')).toBe('64')
    expect(svg.attributes('height')).toBe('64')
    expect(svg.attributes('viewBox')).toBe('0 0 64 64')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(ring.find('[data-testid="base-progress-ring-track"]').attributes('r')).toBe('28')
    expect(ring.find('[data-testid="base-progress-ring-value"]').attributes('stroke-width')).toBe(
      '8',
    )
  })

  it('draws a quarter circle at 25%', () => {
    const ring = mountRing({ value: 25 })
    const arc = ring.find('[data-testid="base-progress-ring-value"]')

    expect(Number(arc.attributes('stroke-dasharray'))).toBeCloseTo(CIRCUMFERENCE, 6)
    expect(dashOffsetOf(ring)).toBeCloseTo(CIRCUMFERENCE * 0.75, 6)
    expect(arc.attributes('stroke-linecap')).toBe('round')
    expect(arc.attributes('transform')).toBe('rotate(-90 20 20)')
  })

  it('reads as full at 100% and empty at 0%', () => {
    expect(dashOffsetOf(mountRing({ value: 0 }))).toBeCloseTo(CIRCUMFERENCE, 6)
    expect(dashOffsetOf(mountRing({ value: 100 }))).toBeCloseTo(0, 6)
  })

  it('clamps an over-full value to 100 without breaking aria-valuenow', () => {
    const ring = mountRing({ value: 150 })

    expect(ring.attributes('aria-valuenow')).toBe('100')
    expect(dashOffsetOf(ring)).toBeCloseTo(0, 6)
  })

  it('clamps a negative value to 0', () => {
    const ring = mountRing({ value: -20 })

    expect(ring.attributes('aria-valuenow')).toBe('0')
    expect(dashOffsetOf(ring)).toBeCloseTo(CIRCUMFERENCE, 6)
  })

  it('supports a custom max, including non-finite and zero max guards', () => {
    expect(mountRing({ value: 1, max: 4 }).attributes('aria-valuemax')).toBe('4')
    expect(mountRing({ value: 1, max: 4 }).attributes('aria-valuenow')).toBe('25')

    expect(mountRing({ value: 5, max: 0 }).attributes('aria-valuenow')).toBe('0')
    expect(mountRing({ value: Number.NaN, max: 100 }).attributes('aria-valuenow')).toBe('0')
    expect(Number.isNaN(dashOffsetOf(mountRing({ value: Number.NaN, max: 100 })))).toBe(false)
  })

  it('colors the arc per tone and leaves the track on the line color', () => {
    expect(
      mountRing({ tone: 'ok' }).find('[data-testid="base-progress-ring-value"]').classes(),
    ).toContain('stroke-ok')
    expect(mountRing({ tone: 'warn' }).classes()).toContain('stroke-warn')
    expect(mountRing({ tone: 'danger' }).classes()).toContain('stroke-danger')
    expect(mountRing({ tone: 'neutral' }).classes()).toContain('stroke-ink-muted')
    expect(mountRing().classes()).toContain('stroke-brand-500')
    expect(mountRing().find('[data-testid="base-progress-ring-track"]').classes()).toContain(
      'stroke-line',
    )
  })
})
