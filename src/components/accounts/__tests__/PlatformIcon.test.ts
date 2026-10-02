import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlatformIcon from '@/components/accounts/PlatformIcon.vue'
import { PLATFORM_IDS, PLATFORMS } from '@/lib/platforms'
import type { PlatformId } from '@/types'

const TESTID = 'platform-icon'

function mountIcon(props: Record<string, unknown> = {}) {
  return mount(PlatformIcon, { props: props as never })
}

describe('PlatformIcon', () => {
  it('draws a distinct glyph for every platform on the shared 24 grid', () => {
    const markupByPlatform = new Map<PlatformId, string>()

    for (const platform of PLATFORM_IDS) {
      const icon = mountIcon({ platform })
      const root = icon.get(`[data-testid="${TESTID}"]`)
      const svg = icon.get('[data-testid="platform-icon-glyph"]')

      expect(root.attributes('data-platform')).toBe(platform)
      expect(svg.attributes('viewBox')).toBe('0 0 24 24')
      expect(svg.attributes('aria-hidden')).toBe('true')
      expect(svg.attributes('fill')).toBe('currentColor')

      const markup = svg.element.innerHTML
      expect(markup.length).toBeGreaterThan(0)
      expect(markupByPlatform.has(platform)).toBe(false)
      markupByPlatform.set(platform, markup)
    }

    expect(markupByPlatform.size).toBe(PLATFORM_IDS.length)
  })

  it('paints every shape with currentColor so the glyph inherits its container', () => {
    for (const platform of PLATFORM_IDS) {
      const svg = mountIcon({ platform }).get('[data-testid="platform-icon-glyph"]')
      const shapes = Array.from(svg.element.querySelectorAll('path, rect, circle'))

      expect(shapes.length).toBeGreaterThan(0)
      for (const shape of shapes) {
        const fill = shape.getAttribute('fill') ?? 'currentColor'
        const stroke = shape.getAttribute('stroke')
        expect([fill, stroke]).not.toContain('#000')
        if (stroke !== null) expect(stroke).toBe('currentColor')
      }
    }
  })

  it('takes its accent colour from the platform data, not from a hardcoded hex', () => {
    for (const platform of PLATFORM_IDS) {
      const icon = mountIcon({ platform })
      expect(icon.get(`[data-testid="${TESTID}"]`).attributes('style')).toContain(
        PLATFORMS[platform].color,
      )
    }
  })

  it('applies the size classes', () => {
    const cases: Array<[string, string]> = [
      ['xs', 'size-3.5'],
      ['sm', 'size-4'],
      ['md', 'size-5'],
      ['lg', 'size-7'],
    ]

    for (const [size, expected] of cases) {
      const icon = mountIcon({ platform: 'x', size })
      expect(icon.get(`[data-testid="${TESTID}"]`).classes()).toContain(expected)
      expect(icon.attributes('data-size')).toBe(size)
      expect(icon.get('svg').classes()).toContain('size-full')
    }
  })

  it('defaults to md and dims itself when muted', () => {
    const plain = mountIcon({ platform: 'instagram' })
    expect(plain.attributes('data-size')).toBe('md')
    expect(plain.get(`[data-testid="${TESTID}"]`).classes()).not.toContain('opacity-50')

    const muted = mountIcon({ platform: 'instagram', muted: true })
    expect(muted.get(`[data-testid="${TESTID}"]`).classes()).toContain('opacity-50')
  })

  it('stays decorative — no role and no invented accessible name', () => {
    const icon = mountIcon({ platform: 'linkedin' })

    expect(icon.get(`[data-testid="${TESTID}"]`).attributes('role')).toBeUndefined()
    expect(icon.get(`[data-testid="${TESTID}"]`).attributes('aria-label')).toBeUndefined()
    expect(icon.get('svg').attributes('focusable')).toBe('false')
    expect(icon.get('svg').attributes('aria-hidden')).toBe('true')
  })
})