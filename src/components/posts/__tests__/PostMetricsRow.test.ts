import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import PostMetricsRow from '@/components/posts/PostMetricsRow.vue'
import { formatCompactNumber } from '@/lib/utils'
import type { PostMetrics } from '@/types'

const METRICS: PostMetrics = {
  impressions: 12_340,
  likes: 428,
  comments: 37,
  shares: 12,
  clicks: 1_204,
}

const ORDER = ['impressions', 'likes', 'comments', 'shares', 'clicks'] as const

function mountRow(metrics: PostMetrics, extra: Record<string, unknown> = {}) {
  return mount(PostMetricsRow, { props: { metrics, ...extra } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  window.localStorage.clear()
})

describe('PostMetricsRow', () => {
  it('renders the five metrics in order, compactly formatted', () => {
    const wrapper = mountRow(METRICS)
    const items = wrapper.findAll('[data-testid="post-metric"]')

    expect(items).toHaveLength(5)
    expect(items.map((item) => item.attributes('data-metric'))).toEqual([...ORDER])

    const values = wrapper
      .findAll('[data-testid="post-metric-value"]')
      .map((node) => node.text())
    expect(values).toEqual([
      formatCompactNumber(METRICS.impressions),
      formatCompactNumber(METRICS.likes),
      formatCompactNumber(METRICS.comments),
      formatCompactNumber(METRICS.shares),
      formatCompactNumber(METRICS.clicks),
    ])

    // Compact formatting, not grouping: 12,340 must never appear as "12,340".
    expect(values[0]).toBe(formatCompactNumber(12_340))
    expect(values[0]).not.toBe('12,340')
    wrapper.unmount()
  })

  it('gives every value a name for screen readers and one summary for the row', () => {
    const wrapper = mountRow(METRICS)
    const row = wrapper.get('[data-testid="post-metrics-row"]')

    expect(row.attributes('role')).toBe('group')
    const summary = row.attributes('aria-label') ?? ''
    expect(summary).toContain('impressions')
    expect(summary).toContain(`${formatCompactNumber(METRICS.likes)} likes`)
    expect(summary).toContain('clicks')

    const labels = ORDER.map((id) => wrapper.get(`[data-metric="${id}"]`).text())
    expect(labels).toEqual([
      `${formatCompactNumber(METRICS.impressions)} impressions`,
      `${formatCompactNumber(METRICS.likes)} likes`,
      `${formatCompactNumber(METRICS.comments)} comments`,
      `${formatCompactNumber(METRICS.shares)} shares`,
      `${formatCompactNumber(METRICS.clicks)} clicks`,
    ])
    wrapper.unmount()
  })

  it('renders zeros as 0 rather than hiding the row', () => {
    const wrapper = mountRow({
      impressions: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      clicks: 0,
    })
    const values = wrapper.findAll('[data-testid="post-metric-value"]')
    expect(values).toHaveLength(5)
    expect(values.every((node) => node.text() === '0')).toBe(true)
    wrapper.unmount()
  })

  it('tightens the type in compact mode', () => {
    const wrapper = mountRow(METRICS, { compact: true })
    const value = wrapper.get('[data-testid="post-metric-value"]')
    expect(value.classes()).toContain('text-xs')
    expect(wrapper.findAll('[data-testid="post-metric"]')).toHaveLength(5)
    wrapper.unmount()
  })

  it('renders no markup at all when the metrics are missing', () => {
    // The prop is required, but a restored payload from an older schema can
    // still hand us nothing; the row must degrade to "not there".
    const wrapper = mount(PostMetricsRow, {
      props: { metrics: null as unknown as PostMetrics },
    })
    expect(wrapper.find('[data-testid="post-metrics-row"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="post-metric"]')).toHaveLength(0)
    wrapper.unmount()
  })

  it('survives a non-finite number instead of printing NaN', () => {
    const wrapper = mountRow({
      impressions: Number.NaN,
      likes: 10,
      comments: 0,
      shares: 0,
      clicks: 0,
    })
    expect(wrapper.get('[data-metric="impressions"]').text()).toBe('0 impressions')
    expect(wrapper.text()).not.toContain('NaN')
    wrapper.unmount()
  })
})