import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { CircleCheck, TriangleAlert } from 'lucide-vue-next'
import BaseBadge from '@/components/ui/BaseBadge.vue'

const TESTID = 'base-badge'

function mountBadge(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(BaseBadge, { props: props as never, slots })
}

describe('BaseBadge', () => {
  it('renders a neutral sm pill with the slot as its label', () => {
    const badge = mountBadge({}, { default: 'Draft' })

    expect(badge.element.tagName).toBe('SPAN')
    expect(badge.attributes('data-testid')).toBe(TESTID)
    expect(badge.classes()).toContain('inline-flex')
    expect(badge.classes()).toContain('rounded-full')
    expect(badge.classes()).toContain('font-medium')
    expect(badge.classes()).toContain('bg-surface-muted')
    expect(badge.classes()).toContain('text-ink-muted')
    expect(badge.find('.truncate').text()).toBe('Draft')
  })

  it('maps every tone to a soft background and a strong text color', () => {
    const cases: Array<[string, string, string]> = [
      ['info', 'bg-info/10', 'text-info'],
      ['ok', 'bg-ok/10', 'text-ok'],
      ['warn', 'bg-warn/15', 'text-warn'],
      ['danger', 'bg-danger/10', 'text-danger'],
      ['brand', 'bg-brand-50', 'text-brand-700'],
    ]

    for (const [tone, background, text] of cases) {
      const badge = mountBadge({ tone })
      expect(badge.classes(), tone).toContain(background)
      expect(badge.classes(), tone).toContain(text)
    }
  })

  it('applies the size classes', () => {
    expect(mountBadge().classes()).toContain('text-xs')
    expect(mountBadge({ size: 'md' }).classes()).toContain('text-sm')
    expect(mountBadge({ size: 'md' }).classes()).toContain('px-2.5')
  })

  it('renders an optional decorative icon', () => {
    const withIcon = mountBadge({ icon: CircleCheck, tone: 'ok' })
    expect(withIcon.findComponent(CircleCheck).exists()).toBe(true)
    expect(withIcon.find('[data-testid="base-badge-icon"]').attributes('aria-hidden')).toBe('true')
    expect(withIcon.find('[data-testid="base-badge-icon"]').classes()).toContain('size-3')

    const withoutIcon = mountBadge({ icon: undefined })
    expect(withoutIcon.find('[data-testid="base-badge-icon"]').exists()).toBe(false)
  })

  it('stays a presentational span — no role, no invented aria-label', () => {
    const badge = mountBadge({ tone: 'danger', icon: TriangleAlert })

    expect(badge.element.tagName).toBe('SPAN')
    expect(badge.attributes('role')).toBeUndefined()
    expect(badge.attributes('aria-label')).toBeUndefined()
    expect(badge.attributes('tabindex')).toBeUndefined()
  })
})
