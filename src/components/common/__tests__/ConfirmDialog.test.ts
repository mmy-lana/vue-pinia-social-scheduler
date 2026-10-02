import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { useConfirm } from '@/composables/useConfirm'
import { resetBodyScrollLock } from '@/composables/useBodyScrollLock'

function mountDialog() {
  return mount(ConfirmDialog, {
    attachTo: document.body,
    global: { stubs: { teleport: true } },
  })
}

afterEach(() => {
  useConfirm().reset()
  resetBodyScrollLock()
})

describe('useConfirm', () => {
  it('resolves true, false and null for the three outcomes', async () => {
    const { ask, respond } = useConfirm()

    const three = ask({ title: 'Discard?', message: 'Unsaved changes.', tertiaryLabel: 'Save' })
    await nextTick()
    respond(null)
    expect(await three).toBeNull()

    const accepted = ask({ title: 'Publish?', message: 'Now.' })
    await nextTick()
    respond(true)
    expect(await accepted).toBe(true)

    const dismissed = ask({ title: 'Delete?', message: 'Gone forever.' })
    await nextTick()
    respond(false)
    expect(await dismissed).toBe(false)
  })

  it('turns confirm() into a boolean', async () => {
    const promise = useConfirm().confirm({ title: 'Go?', message: 'Sure?' })
    await nextTick()
    useConfirm().respond(true)
    expect(await promise).toBe(true)
  })

  it('serves queued requests one at a time', async () => {
    const first = useConfirm().ask({ title: 'First', message: '1' })
    const second = useConfirm().ask({ title: 'Second', message: '2' })
    await nextTick()

    const { request, respond } = useConfirm()
    expect(request.value?.title).toBe('First')
    respond(true)
    await nextTick()
    expect(request.value?.title).toBe('Second')
    respond(false)
    await nextTick()
    expect(request.value).toBeNull()

    expect(await first).toBe(true)
    expect(await second).toBe(false)
  })

  it('resolves everything as false when reset', async () => {
    const { ask, reset } = useConfirm()
    const promise = ask({ title: 'Abandoned?', message: 'Gone.' })
    await nextTick()
    reset()
    expect(await promise).toBe(false)
    expect(useConfirm().request.value).toBeNull()
  })
})

describe('ConfirmDialog', () => {
  it('renders nothing until a request arrives', () => {
    const wrapper = mountDialog()
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders an accessible dialog with the default two actions', async () => {
    const wrapper = mountDialog()
    useConfirm().ask({ title: 'Delete post?', message: 'This cannot be undone.' })
    await nextTick()
    await nextTick()

    const dialog = wrapper.find('[role="alertdialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-labelledby')).toBe('confirm-dialog-title')
    expect(wrapper.text()).toContain('Delete post?')
    expect(wrapper.text()).toContain('This cannot be undone.')
    expect(wrapper.find('[data-testid="confirm-tertiary"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="confirm-cancel"]').text()).toBe('Cancel')
    wrapper.unmount()
  })

  it('shows a third action when the request defines one', async () => {
    const wrapper = mountDialog()
    useConfirm().ask({ title: 'Discard?', message: 'Changes lost.', tertiaryLabel: 'Save draft' })
    await nextTick()
    await nextTick()
    expect(wrapper.find('[data-testid="confirm-tertiary"]').text()).toBe('Save draft')
    wrapper.unmount()
  })

  it('resolves the promise when the confirm button is pressed', async () => {
    const wrapper = mountDialog()
    const promise = useConfirm().confirm({ title: 'Go?', message: 'Sure?' })
    await nextTick()
    await nextTick()

    await wrapper.find('[data-testid="confirm-accept"]').trigger('click')
    expect(await promise).toBe(true)
    wrapper.unmount()
  })

  it('resolves false on backdrop click', async () => {
    const wrapper = mountDialog()
    const promise = useConfirm().confirm({ title: 'Go?', message: 'Sure?' })
    await nextTick()
    await nextTick()

    await wrapper.find('[data-testid="confirm-backdrop"]').trigger('click')
    expect(await promise).toBe(false)
    wrapper.unmount()
  })

  it('locks the page while open and releases it afterwards', async () => {
    const wrapper = mountDialog()
    useConfirm().ask({ title: 'Locked?', message: 'Scroll is trapped.' })
    await nextTick()
    await nextTick()
    expect(document.body.style.overflow).toBe('hidden')

    useConfirm().respond(false)
    await nextTick()
    await nextTick()
    expect(document.body.style.overflow).not.toBe('hidden')
    wrapper.unmount()
  })

  it('cancels on Escape', async () => {
    const wrapper = mountDialog()
    const promise = useConfirm().confirm({ title: 'Go?', message: 'Sure?' })
    await nextTick()
    await nextTick()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(await promise).toBe(false)
    wrapper.unmount()
  })

  it('moves focus into the dialog and returns it on close', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open'
    document.body.appendChild(trigger)
    trigger.focus()

    const wrapper = mountDialog()
    useConfirm().ask({ title: 'Focused?', message: 'Focus moves here.' })
    await nextTick()
    await nextTick()
    expect(document.activeElement).not.toBe(trigger)

    useConfirm().respond(false)
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(trigger)

    wrapper.unmount()
    trigger.remove()
  })
})
