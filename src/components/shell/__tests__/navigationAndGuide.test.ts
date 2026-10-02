import { beforeEach, describe, expect, it, vi } from 'vitest'
import { h, type VNode } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { PRIMARY_NAV, SECONDARY_NAV } from '@/components/shell/SidebarNav.vue'
import SidebarNav from '@/components/shell/SidebarNav.vue'
import MoreSheet from '@/components/shell/MoreSheet.vue'
import AppGuideModal from '@/components/common/AppGuideModal.vue'
import { useUiStore } from '@/stores/useUiStore'
import { PLATFORM_IDS, PLATFORMS } from '@/lib/platforms'

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'dashboard' }),
  // Attributes are forwarded so data-testid, class and aria-current land on the
  // anchor exactly as they would against the real router.
  RouterLink: (
    props: { to: string },
    {
      slots = {},
      attrs,
    }: {
      slots?: { default?: () => VNode[] }
      attrs: Record<string, unknown>
    },
  ) => h('a', { ...attrs, href: props.to }, slots.default?.()),
}))

function mountNav(props: Record<string, unknown> = {}) {
  return mount(SidebarNav, { props })
}

describe('SidebarNav', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the branding block above the navigation', () => {
    const nav = mountNav()
    const brand = nav.get('[data-testid="sidebar-brand"]')

    expect(brand.text()).toContain('Social Scheduler')
    expect(brand.text()).toContain('Local-First')
  })

  it('places every destination below the header so Timeline is never clipped', () => {
    const nav = mountNav()

    const order = [...nav.element.querySelectorAll('[data-testid]')]
      .map((node) => node.getAttribute('data-testid') ?? '')
      .filter((id) => id.startsWith('sidebar-nav-') || id === 'sidebar-brand')

    expect(order[0]).toBe('sidebar-brand')
    expect(order).toContain('sidebar-nav-dashboard')
    // Timeline comes from the shared table, so its position cannot drift.
    expect(order[1]).toBe('sidebar-nav-dashboard')
  })

  it('lists every destination from the shared nav table', () => {
    const nav = mountNav()
    const ids = [...nav.element.querySelectorAll('[data-testid^="sidebar-nav-"]')].map((node) =>
      node.getAttribute('data-testid'),
    )

    for (const entry of [...PRIMARY_NAV, ...SECONDARY_NAV]) {
      expect(ids).toContain(`sidebar-nav-${entry.name}`)
    }
    expect(ids).toContain('sidebar-nav-guide')
  })

  it('keeps the compact rail navigable without visible labels', () => {
    const nav = mountNav({ compact: true })

    const timeline = nav.get('[data-testid="sidebar-nav-dashboard"]')
    expect(timeline.attributes('aria-label')).toBe('Timeline')
    expect(timeline.attributes('title')).toBe('Timeline')

    // The guide link is hidden here; the header and More sheet reach it.
    expect(nav.find('[data-testid="sidebar-nav-guide"]').exists()).toBe(false)
  })

  it('emits guide when the manual link is used', async () => {
    const nav = mountNav()

    await nav.get('[data-testid="sidebar-nav-guide"]').trigger('click')

    expect(nav.emitted('guide')).toHaveLength(1)
  })

  it('keeps a visible focus ring on every navigation link', () => {
    const nav = mountNav()

    for (const node of nav.element.querySelectorAll('[data-testid^="sidebar-nav-"]')) {
      expect(node.getAttribute('class') ?? '').toContain('focus-visible:ring-2')
    }
  })

  it('marks the current destination with aria-current', () => {
    const nav = mountNav()

    expect(nav.get('[data-testid="sidebar-nav-dashboard"]').attributes('aria-current')).toBe(
      'page',
    )
    expect(nav.get('[data-testid="sidebar-nav-calendar"]').attributes('aria-current')).toBeUndefined()
  })
})

describe('AppGuideModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  function mountGuide(open = true) {
    const wrapper = mount(AppGuideModal, {
      props: { open },
      attachTo: document.body,
    })
    // The modal teleports to the body, so assertions read the document.
    return { wrapper, scope: document.body }
  }

  it('renders all four sections behind a tablist', () => {
    const { scope, wrapper } = mountGuide()
    expect(scope.querySelector('[data-testid="app-guide"]')).not.toBeNull()
    for (const panel of ['start', 'privacy', 'platforms', 'matrix']) {
      expect(scope.querySelector(`[data-testid="app-guide-panel-${panel}"]`)).not.toBeNull()
    }
    expect(scope.querySelector('[data-testid="app-guide-tabs"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('walks through every core view in the quick start section', () => {
    const { scope, wrapper } = mountGuide()
    const start = scope.querySelector('[data-testid="app-guide-panel-start"]')?.textContent ?? ''

    for (const name of ['Timeline', 'Composer', 'Queue', 'Calendar', 'Library', 'Channels', 'Settings']) {
      expect(start).toContain(name)
    }
    wrapper.unmount()
  })

  it('states the local-first guarantees without overclaiming', () => {
    const { scope, wrapper } = mountGuide()
    const privacy = scope.querySelector('[data-testid="app-guide-panel-privacy"]')?.textContent ?? ''

    expect(privacy).toContain('localStorage')
    expect(privacy).toContain('never leaves the device')
    expect(privacy).toContain('cannot be hacked')
    expect(privacy).toContain('cannot get an account banned')
    wrapper.unmount()
  })

  it('explains the server requirement for every supported platform', () => {
    const { scope, wrapper } = mountGuide()
    const text = scope.querySelector('[data-testid="app-guide-panel-platforms"]')?.textContent ?? ''

    expect(text).toContain('OAuth 2.0')
    expect(text).toContain('client secret')
    for (const platform of ['X', 'LinkedIn', 'Instagram', 'Facebook', 'Threads']) {
      expect(text).toContain(platform)
    }
    wrapper.unmount()
  })

  it('lists each supported platform with its real limits', () => {
    const { scope, wrapper } = mountGuide()

    for (const id of PLATFORM_IDS) {
      const row = scope.querySelector(`[data-testid="app-guide-matrix-${id}"]`)
      expect(row?.textContent).toContain(PLATFORMS[id].label)
      expect(row?.textContent).toContain(PLATFORMS[id].maxChars.toLocaleString())
    }
    wrapper.unmount()
  })

  it('marks unsupported platforms as not included', () => {
    const { scope, wrapper } = mountGuide()

    for (const platform of ['youtube', 'tiktok', 'pinterest']) {
      const row = scope.querySelector(`[data-testid="app-guide-matrix-${platform}"]`)
      expect(row?.textContent).toContain('Not included')
      expect(row?.textContent).not.toContain('Included')
    }
    wrapper.unmount()
  })

  it('reports dismissal through update:open and close', async () => {
    const { wrapper, scope } = mountGuide()

    // The panel is teleported, so the click is dispatched on the real node.
    const closeButton = scope.querySelector('[data-testid="base-modal-close"]')
    expect(closeButton).not.toBeNull()
    closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
    wrapper.unmount()
  })

  it('triggers the guide modal from the mobile more sheet', async () => {
    const ui = useUiStore()
    ui.setMoreSheetOpen(true)

    const wrapper = mount(MoreSheet, { attachTo: document.body })
    const guideButton = document.body.querySelector('[data-testid="more-sheet-guide"]')
    expect(guideButton).not.toBeNull()

    guideButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(ui.guideOpen).toBe(true)
    expect(ui.moreSheetOpen).toBe(false)
    wrapper.unmount()
  })
})
