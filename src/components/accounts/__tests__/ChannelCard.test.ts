import { beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ChannelCard from '@/components/accounts/ChannelCard.vue'
import { makeAccount } from '@/lib/__tests__/fixtures'
import type { SocialAccount } from '@/types'

type CardWrapper = VueWrapper<InstanceType<typeof ChannelCard>>

interface CardProps {
  account?: Partial<SocialAccount>
  scheduledCount?: number
  slotCount?: number
}

function mountCard({ account, scheduledCount, slotCount }: CardProps = {}): CardWrapper {
  return mount(ChannelCard, {
    props: { account: makeAccount(account), scheduledCount, slotCount } as never,
  })
}

async function clickButton(wrapper: CardWrapper, testId: string): Promise<void> {
  await wrapper.get(`[data-testid="${testId}"] button`).trigger('click')
}

/**
 * happy-dom only runs a submit button's activation behaviour for a real `.click()`,
 * so the form's own `submit` event is the reliable path here — and it is the
 * same event a browser fires.
 */
async function submitRenameForm(wrapper: CardWrapper): Promise<void> {
  await wrapper.get('[data-testid="channel-card-rename"]').trigger('submit')
}

beforeEach(() => {
  window.localStorage.clear()
  setActivePinia(createPinia())
})

describe('ChannelCard', () => {
  it('renders the avatar, name, handle, platform glyph and status badge', () => {
    const wrapper = mountCard()

    const card = wrapper.get('[data-testid="channel-card"]')
    expect(card.attributes('data-connected')).toBe('true')
    expect(card.attributes('data-platform')).toBe('x')

    expect(wrapper.get('[data-testid="channel-card-name"]').text()).toBe('Lana Builds')
    expect(wrapper.get('[data-testid="channel-card-handle"]').text()).toBe('@lanabuilds')
    expect(wrapper.get('[data-testid="channel-card-platform"]').text()).toBe('X')
    expect(wrapper.get('[data-testid="channel-card-status"]').text()).toBe('Connected')

    const avatar = wrapper.get('[data-testid="base-avatar"]')
    expect(avatar.attributes('aria-label')).toBe('Lana Builds')
    expect(wrapper.get('[data-testid="base-avatar-disc"]').attributes('style')).toContain('hsl(210')

    expect(wrapper.get('[data-testid="platform-icon"]').attributes('data-platform')).toBe('x')
  })

  it('shows the scheduled-post and weekly-slot counts', () => {
    const wrapper = mountCard({ scheduledCount: 3, slotCount: 10 })

    expect(wrapper.get('[data-testid="channel-card-scheduled-count"]').text()).toBe('3 posts')
    expect(wrapper.get('[data-testid="channel-card-slot-count"]').text()).toBe('10 slots / week')
  })

  it('falls back to zero counts when the page passes none', () => {
    const wrapper = mountCard()

    expect(wrapper.get('[data-testid="channel-card-scheduled-count"]').text()).toBe('0 posts')
    expect(wrapper.get('[data-testid="channel-card-slot-count"]').text()).toBe('0 slots / week')
  })

  it('renames through the inline editor and emits the trimmed name', async () => {
    const wrapper = mountCard()
    expect(wrapper.find('[data-testid="channel-card-rename"]').exists()).toBe(false)

    await clickButton(wrapper, 'channel-card-rename-button')

    const input = wrapper.get('[data-field="displayName"] input')
    expect((input.element as HTMLInputElement).value).toBe('Lana Builds')

    await input.setValue('  Lana Studio  ')
    await submitRenameForm(wrapper)

    expect(wrapper.emitted('rename')).toEqual([['Lana Studio']])
    expect(wrapper.find('[data-testid="channel-card-rename"]').exists()).toBe(false)
  })

  it('refuses an empty display name and shows the validation message', async () => {
    const wrapper = mountCard()
    await clickButton(wrapper, 'channel-card-rename-button')
    await wrapper.get('[data-field="displayName"] input').setValue('   ')
    await submitRenameForm(wrapper)

    expect(wrapper.emitted('rename')).toBeUndefined()
    expect(wrapper.get('[data-testid="base-input-error"]').text()).toBe('Enter a display name.')
    expect(wrapper.find('[data-testid="channel-card-rename"]').exists()).toBe(true)
  })

  it('closes the rename editor without emitting when cancelled', async () => {
    const wrapper = mountCard()
    await clickButton(wrapper, 'channel-card-rename-button')
    await wrapper.get('[data-field="displayName"] input').setValue('Lana Studio')
    await clickButton(wrapper, 'channel-card-rename-cancel')

    expect(wrapper.emitted('rename')).toBeUndefined()
    expect(wrapper.find('[data-testid="channel-card-rename"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="channel-card-rename-button"]').exists()).toBe(true)
  })

  it('emits disconnect for a connected channel and connect for a disconnected one', async () => {
    const connected = mountCard()
    expect(connected.get('[data-testid="channel-card-connect"]').text()).toContain('Disconnect')
    await clickButton(connected, 'channel-card-connect')
    expect(connected.emitted('disconnect')).toHaveLength(1)
    expect(connected.emitted('connect')).toBeUndefined()

    const disconnected = mountCard({ account: { connected: false } })
    expect(disconnected.get('[data-testid="channel-card-connect"]').text()).toContain('Reconnect')
    await clickButton(disconnected, 'channel-card-connect')
    expect(disconnected.emitted('connect')).toHaveLength(1)
    expect(disconnected.emitted('disconnect')).toBeUndefined()
  })

  it('emits remove from a visible danger button', async () => {
    const wrapper = mountCard()

    const remove = wrapper.get('[data-testid="channel-card-remove"]')
    expect(remove.text()).toContain('Remove')
    expect(remove.get('button').classes()).toContain('bg-danger')

    await clickButton(wrapper, 'channel-card-remove')
    expect(wrapper.emitted('remove')).toHaveLength(1)
  })

  it('dims a disconnected channel without hiding its actions', () => {
    const wrapper = mountCard({ account: { connected: false } })

    expect(wrapper.get('[data-testid="channel-card"]').attributes('data-connected')).toBe('false')
    expect(wrapper.get('[data-testid="channel-card-status"]').text()).toBe('Disconnected')
    expect(wrapper.get('[data-testid="channel-card-identity"]').classes()).toContain('opacity-70')
    expect(wrapper.get('[data-testid="channel-card-metrics"]').classes()).toContain('opacity-70')
    expect(wrapper.get('[data-testid="platform-icon"]').classes()).toContain('opacity-50')

    expect(wrapper.find('[data-testid="channel-card-remove"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="channel-card-connect"]').exists()).toBe(true)
  })

  it('keeps every action a 44px control', () => {
    const wrapper = mountCard()

    for (const testId of ['channel-card-connect', 'channel-card-remove']) {
      expect(wrapper.get(`[data-testid="${testId}"] button`).classes()).toContain('min-h-11')
    }
  })
})