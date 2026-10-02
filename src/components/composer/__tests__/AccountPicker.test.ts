import { beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AccountPicker from '@/components/composer/AccountPicker.vue'
import type { SocialAccount } from '@/types'

const NOW = '2026-10-01T00:00:00.000Z'
const CHIPS = '[data-testid="account-chip"]'

type PickerProps = InstanceType<typeof AccountPicker>['$props']

function account(overrides: Partial<SocialAccount> & { id: string }): SocialAccount {
  return {
    platform: 'x',
    handle: 'ada',
    displayName: 'Ada Lovelace',
    avatarHue: 210,
    connected: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

const ACCOUNTS: SocialAccount[] = [
  account({ id: 'acc-x', displayName: 'Ada Lovelace', handle: 'ada', platform: 'x', avatarHue: 210 }),
  account({
    id: 'acc-linkedin',
    displayName: 'Grace Hopper',
    handle: 'grace',
    platform: 'linkedin',
    avatarHue: 20,
  }),
  account({
    id: 'acc-threads',
    displayName: 'Alan Turing',
    handle: 'alan',
    platform: 'threads',
    avatarHue: 90,
    connected: false,
  }),
]

function mountPicker(modelValue: string[], props: Partial<PickerProps> = {}): VueWrapper {
  return mount(AccountPicker, { props: { modelValue, accounts: ACCOUNTS, ...props } })
}

function lastModel(wrapper: VueWrapper): string[] | undefined {
  return wrapper.emitted<[string[]]>('update:modelValue')?.at(-1)?.[0]
}

/** Clicks a chip and feeds the new model back, as a real parent would. */
async function tapChip(wrapper: VueWrapper, index: number): Promise<void> {
  await wrapper.findAll(CHIPS)[index]?.trigger('click')
  const next = lastModel(wrapper)
  if (next) await wrapper.setProps({ modelValue: next })
}

beforeEach(() => {
  window.localStorage.clear()
  setActivePinia(createPinia())
})

describe('AccountPicker', () => {
  it('groups the chips under a labelled Channels region', () => {
    const wrapper = mountPicker([])

    const group = wrapper.get('[role="group"]')
    expect(group.attributes('aria-label')).toBe('Channels')
    expect(group.classes()).toContain('overflow-x-auto')
    expect(group.classes()).toContain('scrollbar-none')
    expect(wrapper.find('[data-testid="account-picker"]').exists()).toBe(true)
    expect(wrapper.findAll(CHIPS)).toHaveLength(ACCOUNTS.length)
    expect(wrapper.get('[data-testid="account-picker-summary"]').text()).toBe(
      'No channels selected',
    )
  })

  it('shows the avatar, the name and the platform of every account', () => {
    const chips = mountPicker([]).findAll(CHIPS)

    expect(chips[0]?.find('[data-testid="base-avatar"]').attributes('aria-label')).toBe(
      'Ada Lovelace',
    )
    expect(chips[0]?.text()).toContain('Ada Lovelace')
    expect(chips[0]?.text()).toContain('X')
    expect(chips[1]?.text()).toContain('LinkedIn')
  })

  it('adds an id on the first tap and a second id on the next', async () => {
    const wrapper = mountPicker([])

    await tapChip(wrapper, 0)
    expect(lastModel(wrapper)).toEqual(['acc-x'])

    await tapChip(wrapper, 1)
    expect(lastModel(wrapper)).toEqual(['acc-x', 'acc-linkedin'])
  })

  it('removes an id when a selected chip is tapped again', async () => {
    const wrapper = mountPicker(['acc-x', 'acc-linkedin'])

    await tapChip(wrapper, 0)

    expect(lastModel(wrapper)).toEqual(['acc-linkedin'])
  })

  it('tracks the selection through aria-pressed and a check mark', async () => {
    const wrapper = mountPicker(['acc-linkedin'])
    const chips = wrapper.findAll(CHIPS)

    expect(chips[0]?.attributes('aria-pressed')).toBe('false')
    expect(chips[1]?.attributes('aria-pressed')).toBe('true')
    expect(chips[2]?.attributes('aria-pressed')).toBe('false')
    expect(wrapper.findAll('[data-testid="account-chip-check"]')).toHaveLength(1)

    await tapChip(wrapper, 0)

    expect(wrapper.findAll(CHIPS)[0]?.attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('[data-testid="account-chip-check"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="account-picker-summary"]').text()).toBe(
      '2 of 3 channels selected',
    )
  })

  it('never lets the original model array be mutated in place', async () => {
    const original = ['acc-x']
    const wrapper = mountPicker(original)

    await wrapper.findAll(CHIPS)[1]?.trigger('click')

    expect(original).toEqual(['acc-x'])
    expect(lastModel(wrapper)).toEqual(['acc-x', 'acc-linkedin'])
  })

  it('dims a disconnected account, captions it and refuses to select it', async () => {
    const wrapper = mountPicker([])
    const disconnected = wrapper.findAll(CHIPS)[2]

    expect(disconnected?.attributes('disabled')).toBeDefined()
    expect(disconnected?.classes()).toContain('opacity-60')
    expect(disconnected?.text()).toContain('Disconnected')
    expect(wrapper.findAll('[data-testid="account-chip-disconnected"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="account-chip-check"]')).toHaveLength(0)

    await disconnected?.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(lastModel(wrapper)).toBeUndefined()
  })

  it('disables every chip when the whole picker is disabled', async () => {
    const wrapper = mountPicker([], { disabled: true })

    for (const chip of wrapper.findAll(CHIPS)) {
      expect(chip.attributes('disabled')).toBeDefined()
    }

    await wrapper.findAll(CHIPS)[0]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('renders the error as an alert only when there is one', () => {
    expect(mountPicker([]).find('[role="alert"]').exists()).toBe(false)

    const wrapper = mountPicker([], { error: 'Pick at least one channel.' })
    const alert = wrapper.get('[role="alert"]')

    expect(alert.text()).toBe('Pick at least one channel.')
    expect(alert.classes()).toContain('text-danger')
  })
})
