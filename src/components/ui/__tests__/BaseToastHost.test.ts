import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseToastHost from '@/components/ui/BaseToastHost.vue'
import { useUiStore } from '@/stores/useUiStore'
import { createTestPinia } from '@/stores/__tests__/testPinia'

type Wrapper = ReturnType<typeof mount>

let wrapper: Wrapper

beforeEach(() => {
  vi.useFakeTimers()
  createTestPinia({ persist: false })
  wrapper = mount(BaseToastHost, { attachTo: document.body })
})

afterEach(() => {
  wrapper.unmount()
  vi.useRealTimers()
})

async function flush(): Promise<void> {
  await nextTick()
  await nextTick()
}

describe('BaseToastHost', () => {
  it('renders the host region with an accessible label', () => {
    const host = wrapper.find('[data-testid="toast-host"]')
    expect(host.exists()).toBe(true)
    expect(host.attributes('aria-label')).toBe('Notifications')
  })

  it('renders nothing until a toast is raised', async () => {
    await flush()
    expect(wrapper.findAll('[data-testid="toast"]')).toHaveLength(0)
  })

  it('shows the message with a polite live region', async () => {
    useUiStore().toast({ tone: 'ok', message: 'Published to X' })
    await flush()

    const toast = wrapper.find('[data-testid="toast"]')
    expect(toast.exists()).toBe(true)
    expect(toast.attributes('role')).toBe('status')
    expect(toast.attributes('aria-live')).toBe('polite')
    expect(wrapper.find('[data-testid="toast-message"]').text()).toBe('Published to X')
  })

  it('uses an assertive live region for failures', async () => {
    useUiStore().toast({ tone: 'danger', message: 'Publish failed' })
    await flush()
    const toast = wrapper.find('[data-testid="toast"]')
    expect(toast.attributes('role')).toBe('alert')
    expect(toast.attributes('aria-live')).toBe('assertive')
  })

  it('auto-dismisses after its duration', async () => {
    useUiStore().toast({ message: 'Temporary', durationMs: 4_000 })
    await flush()
    expect(wrapper.findAll('[data-testid="toast"]')).toHaveLength(1)

    vi.advanceTimersByTime(4_100)
    await flush()
    expect(wrapper.findAll('[data-testid="toast"]')).toHaveLength(0)
  })

  it('keeps a toast with duration 0 on screen until it is dismissed', async () => {
    useUiStore().toast({ message: 'Sticky', durationMs: 0 })
    await flush()
    vi.advanceTimersByTime(60_000)
    await flush()
    expect(wrapper.findAll('[data-testid="toast"]')).toHaveLength(1)

    await wrapper.find('[data-testid="toast-dismiss"]').trigger('click')
    expect(wrapper.findAll('[data-testid="toast"]')).toHaveLength(0)
  })

  it('runs an action and removes the toast', async () => {
    const undo = vi.fn()

    useUiStore().toast({
      message: 'Removed @lana',
      actionLabel: 'Undo',
      onAction: undo,
      durationMs: 8_000,
    })
    await flush()

    const action = wrapper.find('[data-testid="toast-action"]')
    expect(action.exists()).toBe(true)
    expect(action.text()).toContain('Undo')

    await action.trigger('click')
    expect(undo).toHaveBeenCalledOnce()
    await flush()
    expect(wrapper.findAll('[data-testid="toast"]')).toHaveLength(0)
  })

  it('does not stack duplicate messages', async () => {
    const ui = useUiStore()
    ui.toast({ message: 'Same thing' })
    ui.toast({ message: 'Same thing' })
    await flush()
    expect(wrapper.findAll('[data-testid="toast"]')).toHaveLength(1)
  })

  it('stacks several different toasts', async () => {
    const ui = useUiStore()
    ui.toast({ message: 'First' })
    ui.toast({ message: 'Second' })
    await flush()
    expect(wrapper.findAll('[data-testid="toast"]')).toHaveLength(2)
  })
})