import { watch, type Ref } from 'vue'

/**
 * Scroll lock for modals and sheets. Nested locks are reference counted so
 * closing an inner dialog does not unlock the page behind it, and the scrollbar
 * width is compensated to stop the layout shifting.
 */

interface LockState {
  count: number
  previousOverflow: string
  previousPaddingRight: string
  scrollbarWidth: number
}

const state: LockState = {
  count: 0,
  previousOverflow: '',
  previousPaddingRight: '',
  scrollbarWidth: 0,
}

function measureScrollbar(): number {
  if (typeof window === 'undefined') return 0
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth)
}

function lock(): void {
  if (typeof document === 'undefined') return
  state.count += 1
  if (state.count > 1) return
  state.scrollbarWidth = measureScrollbar()
  state.previousOverflow = document.body.style.overflow
  state.previousPaddingRight = document.body.style.paddingRight
  document.body.style.overflow = 'hidden'
  if (state.scrollbarWidth > 0) {
    const current = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0
    document.body.style.paddingRight = `${current + state.scrollbarWidth}px`
  }
}

function unlock(): void {
  if (typeof document === 'undefined') return
  state.count = Math.max(0, state.count - 1)
  if (state.count > 0) return
  document.body.style.overflow = state.previousOverflow
  document.body.style.paddingRight = state.previousPaddingRight
}

/** Locks the page while `locked` is true. */
export function useBodyScrollLock(locked: Ref<boolean>): void {
  watch(
    locked,
    (isLocked, wasLocked) => {
      if (isLocked && !wasLocked) lock()
      else if (!isLocked && wasLocked) unlock()
    },
    { immediate: true },
  )
}

/** Returns the page to its unlocked state. Used by tests. */
export function resetBodyScrollLock(): void {
  state.count = 0
  if (typeof document !== 'undefined') {
    document.body.style.overflow = state.previousOverflow
    document.body.style.paddingRight = state.previousPaddingRight
  }
}
