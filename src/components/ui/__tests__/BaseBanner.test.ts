import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseBanner from '@/components/ui/BaseBanner.vue'

type BannerTone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger'

interface BannerProps {
  tone?: BannerTone
  title?: string
  description?: string
  dismissible?: boolean
  action?: string
}

function mountBanner(props: BannerProps = {}, slots: Record<string, string> = {}) {
  return mount(BaseBanner, { props, slots })
}

describe('BaseBanner', () => {
  it('announces polite tones as a status and urgent tones as an alert', () => {
    const polite: BannerTone[] = ['neutral', 'info', 'ok']
    const urgent: BannerTone[] = ['warn', 'danger']

    for (const tone of polite) {
      const wrapper = mountBanner({ tone, title: 'Heads up' })
      expect(wrapper.find('[data-testid="base-banner"]').attributes('role')).toBe('status')
      wrapper.unmount()
    }

    for (const tone of urgent) {
      const wrapper = mountBanner({ tone, title: 'Heads up' })
      expect(wrapper.find('[data-testid="base-banner"]').attributes('role')).toBe('alert')
      wrapper.unmount()
    }
  })

  it('defaults to the info tone', () => {
    const wrapper = mountBanner({ title: 'Saved as draft' })
    const banner = wrapper.find('[data-testid="base-banner"]')

    expect(banner.attributes('role')).toBe('status')
    expect(banner.classes()).toContain('bg-info/10')
    wrapper.unmount()
  })

  it('paints a soft tinted surface per tone', () => {
    const surfaces: Record<BannerTone, string> = {
      neutral: 'bg-surface-muted',
      info: 'bg-info/10',
      ok: 'bg-ok/10',
      warn: 'bg-warn/15',
      danger: 'bg-danger/10',
    }

    for (const [tone, surface] of Object.entries(surfaces) as [BannerTone, string][]) {
      const wrapper = mountBanner({ tone, title: 'Tone' })
      expect(wrapper.find('[data-testid="base-banner"]').classes()).toContain(surface)
      wrapper.unmount()
    }
  })

  it('renders one icon per tone, hidden from assistive technology', () => {
    const glyphs: Record<BannerTone, string> = {
      neutral: 'lucide-info',
      info: 'lucide-info',
      ok: 'lucide-circle-check',
      warn: 'lucide-triangle-alert',
      danger: 'lucide-octagon-alert',
    }

    for (const [tone, glyph] of Object.entries(glyphs) as [BannerTone, string][]) {
      const wrapper = mountBanner({ tone, title: 'Tone' })
      const icon = wrapper.find('svg')

      expect(icon.classes()).toContain(glyph)
      expect(icon.attributes('aria-hidden')).toBe('true')
      wrapper.unmount()
    }
  })

  it('renders the title and the description', () => {
    const wrapper = mountBanner({
      title: 'Publishing failed',
      description: 'Instagram rejected the media. Retry to send it again.',
    })

    expect(wrapper.find('[data-testid="base-banner-title"]').text()).toBe('Publishing failed')
    expect(wrapper.find('[data-testid="base-banner-description"]').text()).toBe(
      'Instagram rejected the media. Retry to send it again.',
    )
    wrapper.unmount()
  })

  it('renders no description paragraph when none is passed', () => {
    const wrapper = mountBanner({ title: 'Queue is empty' })

    expect(wrapper.find('[data-testid="base-banner-description"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('undefined')
    wrapper.unmount()
  })

  it('lets the default slot replace the title and description', () => {
    const wrapper = mountBanner(
      { title: 'Ignored', description: 'Ignored too' },
      { default: '<strong>Custom banner body</strong>' },
    )

    expect(wrapper.find('[data-testid="base-banner-title"]').exists()).toBe(false)
    expect(wrapper.find('strong').text()).toBe('Custom banner body')
    wrapper.unmount()
  })

  it('emits dismiss and leaves the decision to the parent', async () => {
    const wrapper = mountBanner({ title: 'Draft restored', dismissible: true })
    const dismiss = wrapper.find('[data-testid="base-banner-dismiss"]')

    await dismiss.trigger('click')

    expect(wrapper.emitted('dismiss')).toHaveLength(1)
    expect(wrapper.find('[data-testid="base-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="base-banner-title"]').text()).toBe('Draft restored')
    wrapper.unmount()
  })

  it('labels the close control and gives it a 44px touch target', () => {
    const wrapper = mountBanner({ title: 'Dismissable', dismissible: true })
    const dismiss = wrapper.find('[data-testid="base-banner-dismiss"]')

    expect(dismiss.attributes('aria-label')).toBe('Dismiss')
    expect(dismiss.attributes('type')).toBe('button')
    expect(dismiss.classes()).toContain('tap-target')
    expect(wrapper.find('svg.lucide-x').exists()).toBe(true)
    wrapper.unmount()
  })

  it('hides the close control when the banner is not dismissible', () => {
    const wrapper = mountBanner({ title: 'Permanent' })

    expect(wrapper.find('[data-testid="base-banner-dismiss"]').exists()).toBe(false)
    expect(wrapper.emitted('dismiss')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits action from the text button', async () => {
    const wrapper = mountBanner({ title: 'Two accounts disconnected', action: 'Reconnect' })
    const action = wrapper.find('[data-testid="base-banner-action"]')

    expect(action.text()).toBe('Reconnect')
    expect(action.attributes('type')).toBe('button')
    expect(action.classes()).toContain('tap-target')

    await action.trigger('click')

    expect(wrapper.emitted('action')).toHaveLength(1)
    wrapper.unmount()
  })

  it('renders no action button without the action prop', () => {
    const wrapper = mountBanner({ title: 'Nothing to do here' })

    expect(wrapper.find('[data-testid="base-banner-action"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the action and the close control side by side', () => {
    const wrapper = mountBanner({
      tone: 'danger',
      title: 'Sync failed',
      description: 'Three posts are stuck.',
      action: 'Retry all',
      dismissible: true,
    })

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]?.attributes('data-testid')).toBe('base-banner-action')
    expect(buttons[1]?.attributes('data-testid')).toBe('base-banner-dismiss')
    expect(wrapper.find('[data-testid="base-banner"]').classes()).toContain('flex-wrap')
    wrapper.unmount()
  })
})
