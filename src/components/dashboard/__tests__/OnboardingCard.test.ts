import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { makePost } from '@/lib/__tests__/fixtures'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useSlotsStore } from '@/stores/useSlotsStore'
import { useUiStore } from '@/stores/useUiStore'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

// Imported after the mock so the component picks up the mocked router.
const { default: OnboardingCard } = await import('@/components/dashboard/OnboardingCard.vue')

let wrapper: VueWrapper | null = null

function mountCard(): VueWrapper {
  wrapper = mount(OnboardingCard)
  return wrapper
}

beforeEach(() => {
  window.localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('OnboardingCard', () => {
  it('shows the three first-run actions on an empty workspace', () => {
    const card = mountCard()

    expect(card.find('[data-testid="onboarding-card"]').exists()).toBe(true)
    expect(card.get('[data-testid="onboarding-connect"]').text()).toContain('Connect channel')
    expect(card.get('[data-testid="onboarding-demo"]').text()).toContain('Load demo data')
    expect(card.get('[data-testid="onboarding-dismiss"]').text()).toContain('Dismiss')
  })

  it('hides itself once a channel exists', () => {
    useAccountsStore().add({ platform: 'x', handle: 'lanabuilds', displayName: 'Lana Builds' })

    expect(mountCard().find('[data-testid="onboarding-card"]').exists()).toBe(false)
  })

  it('hides itself once a post exists', () => {
    usePostsStore().replaceAll([makePost({ id: 'post-1', accountId: 'acc-1' })])

    expect(mountCard().find('[data-testid="onboarding-card"]').exists()).toBe(false)
  })

  it('stays hidden after it has been dismissed', async () => {
    const card = mountCard()

    await card.get('[data-testid="onboarding-dismiss"] button').trigger('click')

    expect(useUiStore().onboardingDismissed).toBe(true)
    expect(card.find('[data-testid="onboarding-card"]').exists()).toBe(false)
  })

  it('sends the user to the channels page from "Connect channel"', async () => {
    const card = mountCard()

    await card.get('[data-testid="onboarding-connect"] button').trigger('click')

    expect(pushMock).toHaveBeenCalledWith('/channels')
    expect(useAccountsStore().accounts).toHaveLength(0)
  })

  it('installs real demo data into the accounts, slots and posts stores', async () => {
    const accounts = useAccountsStore()
    const posts = usePostsStore()

    const card = mountCard()
    await card.get('[data-testid="onboarding-demo"] button').trigger('click')

    expect(accounts.accounts.length).toBeGreaterThan(0)
    expect(accounts.accounts[0]?.platform).toBe('x')
    expect(posts.posts.length).toBeGreaterThan(0)
    expect(posts.scheduled.length).toBeGreaterThan(0)

    // Every seeded slot belongs to a seeded channel, and every seeded post does too.
    const accountIds = new Set(accounts.accounts.map((account) => account.id))
    const slotList = useSlotsStore().slots
    expect(slotList.length).toBeGreaterThan(0)
    expect(slotList.every((slot) => accountIds.has(slot.accountId))).toBe(true)
    expect(posts.posts.every((post) => accountIds.has(post.accountId))).toBe(true)

    expect(useUiStore().toasts.map((toast) => toast.message)).toContain('Demo data loaded')
    expect(card.find('[data-testid="onboarding-card"]').exists()).toBe(false)
  })

  it('hands the demo load to the real seed, not to a hand-written fixture', async () => {
    const { buildDemoData } = await import('@/lib/seed')
    const seeded = buildDemoData(new Date(), useSettingsTimezone())

    await mountCard().get('[data-testid="onboarding-demo"] button').trigger('click')

    const accounts = useAccountsStore()
    expect(accounts.accounts.map((account) => account.handle).sort()).toEqual(
      seeded.accounts.map((account) => account.handle).sort(),
    )
  })
})

/** The timezone the store is configured with, which is what seeds are built in. */
function useSettingsTimezone(): string {
  return useSettingsStore().tz
}