import { beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ConnectChannelForm from '@/components/accounts/ConnectChannelForm.vue'
import { PLATFORM_IDS, platformLabel } from '@/lib/platforms'
import { useAccountsStore } from '@/stores/useAccountsStore'
import type { PlatformId } from '@/types'

type FormWrapper = VueWrapper<InstanceType<typeof ConnectChannelForm>>

function mountForm(props: Record<string, unknown> = {}): FormWrapper {
  return mount(ConnectChannelForm, {
    props: props as never,
    global: { plugins: [] },
  })
}

async function fill(
  wrapper: FormWrapper,
  values: { platform?: PlatformId; handle?: string; displayName?: string },
): Promise<void> {
  if (values.platform) {
    await wrapper.get('[data-field="platform"] select').setValue(values.platform)
  }
  if (values.handle !== undefined) {
    await wrapper.get('[data-field="handle"] input').setValue(values.handle)
  }
  if (values.displayName !== undefined) {
    await wrapper.get('[data-field="displayName"] input').setValue(values.displayName)
  }
}

async function submit(wrapper: FormWrapper): Promise<void> {
  await wrapper.get('[data-testid="connect-channel-form"]').trigger('submit')
}

beforeEach(() => {
  window.localStorage.clear()
  setActivePinia(createPinia())
})

describe('ConnectChannelForm', () => {
  it('offers every platform and starts on the initial one', () => {
    const wrapper = mountForm({ initialPlatform: 'linkedin' })

    const select = wrapper.get<HTMLSelectElement>('[data-field="platform"] select')
    const values = Array.from(select.element.options).map((option) => option.value)
    expect(values).toEqual(PLATFORM_IDS)
    expect(select.element.options[select.element.selectedIndex]?.textContent?.trim()).toBe(
      platformLabel('linkedin'),
    )
    expect(wrapper.get('[data-field="platform"] [data-testid="platform-icon"]').attributes('data-platform')).toBe(
      'linkedin',
    )
  })

  it('renders nothing while closed and resets when it reopens', async () => {
    const closed = mountForm({ open: false })
    expect(closed.find('[data-testid="connect-channel-form"]').exists()).toBe(false)

    await closed.setProps({ open: true })
    await fill(closed, { handle: '@lanabuilds', displayName: 'Lana Builds' })
    expect((closed.get('[data-field="handle"] input').element as HTMLInputElement).value).toBe(
      '@lanabuilds',
    )

    await closed.setProps({ open: false })
    await closed.setProps({ open: true })
    expect((closed.get('[data-field="handle"] input').element as HTMLInputElement).value).toBe('')
    expect((closed.get('[data-field="displayName"] input').element as HTMLInputElement).value).toBe('')
  })

  it('shows the handle format hint and the @ prefix', () => {
    const wrapper = mountForm()

    expect(wrapper.get('[data-field="handle"] [data-testid="base-input-hint"]').text()).toBe(
      '2–30 letters, numbers, dots or underscores',
    )
    expect(wrapper.get('[data-field="handle"] [data-testid="base-input"]').attributes('placeholder')).toBe(
      'lanabuilds',
    )
    expect(wrapper.find('[data-field="handle"] svg').exists()).toBe(true)
  })

  it('rejects an invalid handle with the validation message and emits nothing', async () => {
    const wrapper = mountForm()

    await fill(wrapper, { handle: 'no spaces allowed', displayName: 'Lana Builds' })
    await submit(wrapper)

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.get('[data-field="handle"] [data-testid="base-input-error"]').text()).toBe(
      'Use 2–30 letters, numbers, dots or underscores.',
    )
  })

  it('requires a display name', async () => {
    const wrapper = mountForm()

    await fill(wrapper, { handle: 'lanabuilds', displayName: '   ' })
    await submit(wrapper)

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(
      wrapper.get('[data-field="displayName"] [data-testid="base-input-error"]').text(),
    ).toBe('Enter a display name.')
  })

  it('warns live about a handle that is already connected and blocks the submit', async () => {
    const accounts = useAccountsStore()
    const added = accounts.add({ platform: 'x', handle: 'lanabuilds', displayName: 'Lana Builds' })
    expect(added.ok).toBe(true)

    const wrapper = mountForm()
    await fill(wrapper, { handle: '@LanaBuilds', displayName: 'Lana Builds' })

    expect(wrapper.get('[data-testid="connect-channel-handle-taken"]').text()).toBe(
      'That handle is already connected for X.',
    )

    await submit(wrapper)
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.get('[data-field="handle"] [data-testid="base-input-error"]').text()).toBe(
      'That handle is already connected for this platform.',
    )
  })

  it('re-checks uniqueness when the platform changes', async () => {
    const accounts = useAccountsStore()
    accounts.add({ platform: 'x', handle: 'lanabuilds', displayName: 'Lana Builds' })

    const wrapper = mountForm({ initialPlatform: 'x' })
    await fill(wrapper, { handle: 'lanabuilds', displayName: 'Lana Studio' })
    expect(wrapper.find('[data-testid="connect-channel-handle-taken"]').exists()).toBe(true)

    await wrapper.get('[data-field="platform"] select').setValue('instagram')
    expect(wrapper.find('[data-testid="connect-channel-handle-taken"]').exists()).toBe(false)

    await submit(wrapper)
    expect(wrapper.emitted('submit')).toEqual([
      [{ platform: 'instagram', handle: 'lanabuilds', displayName: 'Lana Studio' }],
    ])
  })

  it('emits a trimmed payload for a valid submission', async () => {
    const wrapper = mountForm({ initialPlatform: 'threads' })

    await fill(wrapper, { handle: '  @lana.studio  ', displayName: '  Lana Studio  ' })
    await submit(wrapper)

    expect(wrapper.emitted('submit')).toEqual([
      [{ platform: 'threads', handle: 'lana.studio', displayName: 'Lana Studio' }],
    ])
    expect(wrapper.find('[data-testid="base-input-error"]').exists()).toBe(false)
  })

  it('emits cancel without touching the stores', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="connect-channel-cancel"] button').trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(useAccountsStore().accounts).toHaveLength(0)
  })

  it('shows a busy state on the submit button while the parent works', async () => {
    const wrapper = mountForm()

    expect(wrapper.find('[data-testid="base-button-spinner"]').exists()).toBe(false)

    await wrapper.setProps({ submitting: true })

    const submitButton = wrapper.get('[data-testid="connect-channel-submit"] button')
    expect(submitButton.attributes('aria-busy')).toBe('true')
    expect(submitButton.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="base-button-spinner"]').exists()).toBe(true)
    expect(
      wrapper.get('[data-testid="connect-channel-submit"] [data-testid="base-button-label"]').text(),
    ).toBe('Connect channel')
  })
})