import { computed, getCurrentScope, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue'
import type { ISODateString, Post } from '@/types'

/**
 * Pointer-based drag-to-reschedule for the calendar (Month + Week, ≥ 768px).
 *
 * The composable never touches a store: it turns pointer events into a drop
 * target and hands `postId` + `targetKey` to the injected `onDrop`, so the
 * calendar decides what a target key means and how the move is persisted.
 *
 * A drag only starts once the gesture is unambiguous — a 250 ms hold on touch,
 * 4 px of travel on mouse — so a plain tap still opens the post sheet.
 */

/** Hold duration before a touch drag begins. */
export const TOUCH_HOLD_MS = 250

/** Pointer travel that promotes a mouse press into a drag. */
export const DRAG_THRESHOLD_PX = 4

/** Ghost label length; the chip itself only ever shows a single line. */
export const GHOST_LABEL_MAX = 40

export interface DragGhost {
  postId: string
  x: number
  y: number
  width: number
  label: string
}

export interface DragRescheduleOptions {
  /** `targetKey` → the UTC instant the post should land on, or `null` if illegal. */
  resolveIso: (post: Post, targetKey: string) => ISODateString | null
  /** Viewport gate; `false` on the mobile reschedule-dialog path. */
  isEnabled?: () => boolean
  /**
   * Optional mutation hook. The composable stays store-agnostic: it resolves the
   * instant and, when a host supplies this, applies it.
   */
  applyIso?: (post: Post, iso: ISODateString) => void | Promise<void>
}

export interface DragReschedule {
  dragging: Ref<boolean>
  postId: Ref<string | null>
  ghost: Ref<DragGhost | null>
  /** `data-drop-day` of the day cell under the pointer, or `null`. */
  targetKey: Ref<string | null>
  enabled: ComputedRef<boolean>
  start: (event: PointerEvent, post: Post) => void
  move: (event: PointerEvent) => void
  end: (event: PointerEvent) => Promise<void>
  cancel: () => void
  /**
   * Replaceable drop handler. The default resolves the instant through
   * `options.resolveIso` and forwards it to `options.applyIso`.
   */
  onDrop: (postId: string, targetKey: string) => Promise<void>
}

interface Pending {
  post: Post
  source: HTMLElement | null
  startX: number
  startY: number
  x: number
  y: number
  touch: boolean
  timer: ReturnType<typeof setTimeout> | null
  pointerId: number | null
}

function labelFor(post: Post): string {
  const text = post.content.trim()
  if (text.length === 0) return 'Post'
  return text.length > GHOST_LABEL_MAX ? text.slice(0, GHOST_LABEL_MAX) : text
}

function canDrag(post: Post): boolean {
  return (post.status === 'scheduled' || post.status === 'draft') && post.scheduledAt !== null
}

function capture(element: HTMLElement | null, pointerId: number | null): void {
  if (!element || pointerId === null) return
  if (typeof element.setPointerCapture !== 'function') return
  try {
    element.setPointerCapture(pointerId)
  } catch {
    // Capture is an optimization; the drag still works without it.
  }
}

function release(element: HTMLElement | null, pointerId: number | null): void {
  if (!element || pointerId === null) return
  if (typeof element.releasePointerCapture !== 'function') return
  try {
    element.releasePointerCapture(pointerId)
  } catch {
    // Already released.
  }
}

export function useDragReschedule(options: DragRescheduleOptions): DragReschedule {
  const dragging = ref(false)
  const postId = ref<string | null>(null)
  const ghost = ref<DragGhost | null>(null)
  const targetKey = ref<string | null>(null)
  const enabled = computed(() => options.isEnabled?.() ?? true)

  let pending: Pending | null = null
  /** The post the current gesture started from; survives `cancel` so a drop can resolve. */
  let trackedPost: Post | null = null
  let captured: HTMLElement | null = null
  let capturedId: number | null = null
  let previousTouchAction: string | null = null

  function clearPending(): void {
    if (pending === null) return
    if (pending.timer !== null) clearTimeout(pending.timer)
    pending = null
  }

  function releaseSource(): void {
    if (captured !== null) release(captured, capturedId)
    if (captured !== null && previousTouchAction !== null) {
      captured.style.touchAction = previousTouchAction
    }
    captured = null
    capturedId = null
    previousTouchAction = null
  }

  function detach(): void {
    document.removeEventListener('keydown', onKeydown, true)
    document.removeEventListener('pointercancel', onPointerCancel, true)
  }

  function attach(): void {
    document.addEventListener('keydown', onKeydown, true)
    document.addEventListener('pointercancel', onPointerCancel, true)
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    if (pending === null && !dragging.value) return
    event.preventDefault()
    cancel()
  }

  function onPointerCancel(): void {
    if (pending === null && !dragging.value) return
    cancel()
  }

  /** The gesture is now unambiguous: capture the pointer and raise the ghost. */
  function begin(): void {
    if (pending === null || dragging.value) return
    const state = pending
    const source = state.source
    dragging.value = true
    postId.value = state.post.id
    targetKey.value = null
    if (source !== null) {
      previousTouchAction = source.style.touchAction
      source.style.touchAction = 'none'
      captured = source
      capturedId = state.pointerId
    }
    capture(source, state.pointerId)
    ghost.value = {
      postId: state.post.id,
      x: state.x,
      y: state.y,
      width: source === null ? 0 : source.getBoundingClientRect().width,
      label: labelFor(state.post),
    }
    if (state.timer !== null) {
      clearTimeout(state.timer)
      state.timer = null
    }
  }

  function resolveTarget(x: number, y: number): void {
    const element = document.elementFromPoint(x, y)
    const cell = element?.closest('[data-drop-day]') ?? null
    targetKey.value = cell?.getAttribute('data-drop-day') ?? null
  }

  function start(event: PointerEvent, post: Post): void {
    if (!enabled.value) return
    if (dragging.value || pending !== null) return
    if (!canDrag(post)) return
    if (event.button !== undefined && event.button > 0) return

    const target = event.target
    const state: Pending = {
      post,
      source: target instanceof HTMLElement ? target : null,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      touch: event.pointerType === 'touch',
      timer: null,
      pointerId: typeof event.pointerId === 'number' ? event.pointerId : null,
    }
    pending = state
    trackedPost = post

    if (state.touch) {
      state.timer = setTimeout(() => {
        state.timer = null
        begin()
      }, TOUCH_HOLD_MS)
    }
    attach()
  }

  function move(event: PointerEvent): void {
    if (pending === null) return
    pending.x = event.clientX
    pending.y = event.clientY

    if (!dragging.value) {
      if (pending.touch) return
      const dx = event.clientX - pending.startX
      const dy = event.clientY - pending.startY
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      begin()
    }
    if (!dragging.value || ghost.value === null) return

    ghost.value = { ...ghost.value, x: event.clientX, y: event.clientY }
    resolveTarget(event.clientX, event.clientY)
  }

  function cancel(): void {
    clearPending()
    releaseSource()
    detach()
    dragging.value = false
    postId.value = null
    targetKey.value = null
    // Read `ghost` before cancelling if the caller wants to animate it home.
    ghost.value = null
  }

  async function onDrop(id: string, key: string): Promise<void> {
    const post = trackedPost
    if (post === null || post.id !== id) return
    const iso = options.resolveIso(post, key)
    if (iso === null) return
    await options.applyIso?.(post, iso)
  }

  /** Follows the pointer to its final resting place before the drop is decided. */
  function trackPointer(event: PointerEvent): void {
    if (pending === null || !dragging.value) return
    pending.x = event.clientX
    pending.y = event.clientY
    ghost.value =
      ghost.value === null ? null : { ...ghost.value, x: event.clientX, y: event.clientY }
    resolveTarget(event.clientX, event.clientY)
  }

  async function end(event: PointerEvent): Promise<void> {
    if (pending === null && !dragging.value) return
    trackPointer(event)

    const id = postId.value
    const key = targetKey.value
    cancel()

    if (id === null || key === null || key.length === 0) return
    // Via the controller so a host that replaced `onDrop` wins.
    await api.onDrop(id, key)
  }

  const api: DragReschedule = {
    dragging,
    postId,
    ghost,
    targetKey,
    enabled,
    start,
    move,
    end,
    cancel,
    onDrop,
  }

  if (getCurrentScope()) {
    onScopeDispose(cancel)
  }

  return api
}
