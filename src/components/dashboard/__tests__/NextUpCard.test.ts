import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import NextUpCard from '@/components/dashboard/NextUpCard.vue'
import { makeAccount, makePost } from '@/lib/__tests__/fixtures'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { Post } from '@/types'

const NOW = new Date('2026-10-02T10:00:00.000Z')

let wrapper: VueWrapper | null = null

function mountCard(props: { post: Post | null; accountName?: string }): VueWrapper {
  wrapper = mount(NextUpCard, { props })
  return wrapper
}

/** An instant `ms` from the frozen clock, as a UTC ISO string. */
function at(ms: number): string {
  return new Date(NOW.getTime() + ms).toISOString()
}

beforeEach(() => {
  window.localStorage.clear()
  setActivePinia(createPinia())
  useSettingsStore().update({ timezone: 'UTC', timeFormat: '24h' })
  useAccountsStore().replaceAll([makeAccount({ id: 'acc-1' })])
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
})

describe('NextUpCard', () => {
  it('counts down in hours and minutes while the seconds are still zero', () => {
    const card = mountCard({ post: makePost({ scheduledAt: at(2 * 3_600_000 + 14 * 60_000) }) })

    expect(card.get('[data-testid="next-up-countdown"]').text()).toBe('in 2h 14m')
    expect(card.get('[data-testid="next-up-card"]').attributes('data-empty')).toBe('false')
  })

  it('ticks the seconds into the countdown', async () => {
    const card = mountCard({ post: makePost({ scheduledAt: at(2 * 3_600_000 + 14 * 60_000 + 3_000) }) })

    expect(card.get('[data-testid="next-up-countdown"]').text()).toBe('in 2h 14m 03s')

    vi.advanceTimersByTime(1_000)
    await nextTick()
    expect(card.get('[data-testid="next-up-countdown"]').text()).toBe('in 2h 14m 02s')

    vi.advanceTimersByTime(60_000)
    await nextTick()
    expect(card.get('[data-testid="next-up-countdown"]').text()).toBe('in 2h 13m 02s')
  })

  it('switches to minutes and seconds, then to plain seconds', () => {
    const minutes = mountCard({ post: makePost({ scheduledAt: at(14 * 60_000 + 3_000) }) })
    expect(minutes.get('[data-testid="next-up-countdown"]').text()).toBe('in 14m 03s')
    minutes.unmount()

    const seconds = mountCard({ post: makePost({ scheduledAt: at(45_000) }) })
    expect(seconds.get('[data-testid="next-up-countdown"]').text()).toBe('in 45s')
  })

  it('falls back to days for anything more than a day away', () => {
    const card = mountCard({ post: makePost({ scheduledAt: at(3 * 86_400_000 + 4 * 3_600_000) }) })

    expect(card.get('[data-testid="next-up-countdown"]').text()).toBe('in 3d 4h 0m')
  })

  it('reports a past instant as elapsed instead of counting up', () => {
    const card = mountCard({ post: makePost({ scheduledAt: at(-12 * 60_000) }) })

    expect(card.get('[data-testid="next-up-countdown"]').text()).toBe('12m ago')
  })

  it('shows the account name, platform and a two-line content preview', () => {
    const card = mountCard({
      post: makePost({
        accountId: 'acc-1',
        content: 'Shipped the new scheduler.',
        scheduledAt: at(2 * 3_600_000),
      }),
    })

    expect(card.get('[data-testid="next-up-account"]').text()).toBe('Lana Builds')
    expect(card.get('[data-testid="next-up-platform"]').text()).toBe('X')
    expect(card.get('[data-testid="platform-icon"]').attributes('data-platform')).toBe('x')

    const content = card.get('[data-testid="next-up-content"]')
    expect(content.text()).toBe('Shipped the new scheduler.')
    expect(content.classes()).toContain('clamp-2')
  })

  it('prefers the accountName prop over the stored account', () => {
    const card = mountCard({
      post: makePost({ accountId: 'acc-1', scheduledAt: at(3_600_000) }),
      accountName: 'Lana Studio',
    })

    expect(card.get('[data-testid="next-up-account"]').text()).toBe('Lana Studio')
  })

  it('formats the instant with the settings timezone and clock format', async () => {
    const card = mountCard({ post: makePost({ accountId: 'acc-1', scheduledAt: at(2 * 3_600_000) }) })

    const time = card.get('[data-testid="next-up-time"]')
    expect(time.text()).toBe('12:00')
    expect(time.attributes('datetime')).toBe('2026-10-02T12:00:00.000Z')

    useSettingsStore().update({ timeFormat: '12h' })
    await nextTick()
    expect(card.get('[data-testid="next-up-time"]').text()).toBe('12:00 PM')
  })

  it('renders an empty variant — not a blank card — without a post', () => {
    const card = mountCard({ post: null })

    expect(card.get('[data-testid="next-up-card"]').attributes('data-empty')).toBe('true')
    expect(card.get('[data-testid="next-up-empty"]').text()).toContain('Nothing scheduled next')
    expect(card.find('[data-testid="next-up-countdown"]').exists()).toBe(false)
    expect(card.find('[data-testid="next-up-content"]').exists()).toBe(false)
  })

  it('treats a draft as empty, because it has no instant to count down to', () => {
    const card = mountCard({ post: makePost({ status: 'draft', scheduledAt: null }) })

    expect(card.get('[data-testid="next-up-card"]').attributes('data-empty')).toBe('true')
    expect(card.find('[data-testid="next-up-empty"]').exists()).toBe(true)
  })

  it('keeps the ticking text out of the live region and describes the instant instead', () => {
    const card = mountCard({ post: makePost({ accountId: 'acc-1', scheduledAt: at(3_600_000) }) })

    const countdown = card.get('[data-testid="next-up-countdown"]')
    expect(countdown.attributes('role')).toBe('timer')
    expect(countdown.attributes('aria-live')).toBe('off')
  })
})