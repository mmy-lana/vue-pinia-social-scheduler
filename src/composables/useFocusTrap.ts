import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'

/**
 * Keyboard focus containment for dialogs, sheets and menus.
 *
 * While active: Tab and Shift+Tab cycle inside the container, Escape is routed
 * to `onEscape`, and focus returns to the element that opened the trap.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

export interface FocusTrapOptions {
  /** The trap only listens while this ref is true. */
  active: Ref<boolean>
  container: Ref<HTMLElement | null>
  /** Called on Escape. The trap never closes anything by itself. */
  onEscape?: () => void
  /** Move focus to the first tabbable element on activation. Default `true`. */
  autofocus?: boolean
}

export interface FocusTrap {
  activate: () => void
  deactivate: (options?: { restoreFocus?: boolean }) => void
  focusFirst: () => void
  active: Ref<boolean>
}

function isVisible(element: HTMLElement): boolean {
  if (element === document.activeElement) return true
  if (element.closest('[aria-hidden="true"]')) return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 || rect.height > 0
}

export function tabbableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute('disabled') && isVisible(element),
  )
}

export function useFocusTrap(options: FocusTrapOptions): FocusTrap {
  const active = ref(false)
  let previouslyFocused: HTMLElement | null = null

  function focusFirst(): void {
    const container = options.container.value
    if (!container) return
    const focusable = tabbableElements(container)
    const target = focusable[0] ?? container
    if (target === container && !container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '-1')
    }
    target.focus({ preventScroll: true })
  }

  function onKeydown(event: KeyboardEvent): void {
    if (!active.value) return
    if (event.key === 'Escape') {
      event.stopPropagation()
      options.onEscape?.()
      return
    }
    if (event.key !== 'Tab') return

    const container = options.container.value
    if (!container) return
    const focusable = tabbableElements(container)
    if (focusable.length === 0) {
      event.preventDefault()
      container.focus({ preventScroll: true })
      return
    }
    const first = focusable[0] as HTMLElement
    const last = focusable[focusable.length - 1] as HTMLElement
    const current = document.activeElement

    if (event.shiftKey && (current === first || !container.contains(current))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && current === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function attach(): void {
    document.addEventListener('keydown', onKeydown, true)
    void nextTick(() => {
      if (active.value && options.autofocus !== false) focusFirst()
    })
  }

  function detach(): void {
    document.removeEventListener('keydown', onKeydown, true)
  }

  function activate(): void {
    if (active.value) return
    previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    active.value = true
    attach()
    void nextTick(() => {
      if (active.value && options.autofocus !== false) focusFirst()
    })
  }

  function deactivate(deactivateOptions: { restoreFocus?: boolean } = {}): void {
    if (!active.value) return
    active.value = false
    detach()
    if (deactivateOptions.restoreFocus !== false && previouslyFocused?.isConnected) {
      previouslyFocused.focus({ preventScroll: true })
    }
    previouslyFocused = null
  }

  watch(active, (isActive) => {
    if (isActive) attach()
    else detach()
  })

  onBeforeUnmount(() => {
    active.value = false
    detach()
  })

  return { activate, deactivate, focusFirst, active }
}
