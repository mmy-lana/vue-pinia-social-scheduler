import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDragReschedule, TOUCH_HOLD_MS } from '@/composables/useDragReschedule'
import { makePost } from '@/lib/__tests__/fixtures'
import type { ISODateString, Post } from '@/types'

const DAY_KEY = '2026-10-09'
const MOVED_ISO: ISODateString = '2026-10-09T02:00:00.000Z'

beforeEach(() => {
  window.localStorage.clear()
  setActivePinia(createPinia())
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

/** A chip inside a droppable day cell, the shape the calendar renders. */
function mountCalendar(): { chip: HTMLElement; cell: HTMLElement } {
  const cell = document.createElement('div')
  cell.setAttribute('data-drop-day', DAY_KEY)
  const chip = document.createElement('div')
  chip.textContent = 'Launch post'
  cell.append(chip)
  document.body.append(cell)
  return { chip, cell }
}

function down(chip: HTMLElement, type: string, x: number, y: number): PointerEvent {
  const event = new PointerEvent('pointerdown', {
    pointerType: type,
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
    cancelable: true,
  })
  chip.dispatchEvent(event)
  return event
}

function move(x: number, y: number): PointerEvent {
  return new PointerEvent('pointermove', { pointerType: 'mouse', clientX: x, clientY: y })
}

function up(x: number, y: number): PointerEvent {
  return new PointerEvent('pointerup', { pointerType: 'mouse', clientX: x, clientY: y })
}

function longContentPost(): Post {
  return makePost({ content: 'A'.repeat(60) })
}

describe('useDragReschedule', () => {
  it('does not start a drag below the movement threshold', async () => {
    const { chip, cell } = mountCalendar()
    document.elementFromPoint = vi.fn(() => cell)
    const applyIso = vi.fn()
    const drag = useDragReschedule({ resolveIso: () => MOVED_ISO, applyIso })
    const post = makePost()

    drag.start(down(chip, 'mouse', 10, 10), post)
    drag.move(move(12, 11))

    expect(drag.dragging.value).toBe(false)
    expect(drag.ghost.value).toBeNull()

    await drag.end(up(12, 11))
    expect(applyIso).not.toHaveBeenCalled()
    expect(chip.style.touchAction).toBe('')
  })

  it('starts a drag once the pointer travels past the threshold', () => {
    const { chip, cell } = mountCalendar()
    document.elementFromPoint = vi.fn(() => cell)
    const drag = useDragReschedule({ resolveIso: () => MOVED_ISO })
    const post = longContentPost()

    drag.start(down(chip, 'mouse', 10, 10), post)
    drag.move(move(40, 25))

    expect(drag.dragging.value).toBe(true)
    expect(drag.postId.value).toBe(post.id)
    expect(drag.ghost.value).toEqual({
      postId: post.id,
      x: 40,
      y: 25,
      width: chip.getBoundingClientRect().width,
      label: 'A'.repeat(40),
    })
    expect(chip.style.touchAction).toBe('none')
  })

  it('resolves the day under the pointer and hands the drop to the host', async () => {
    const { chip, cell } = mountCalendar()
    document.elementFromPoint = vi.fn(() => cell)
    const applyIso = vi.fn()
    const resolveIso = vi.fn(() => MOVED_ISO)
    const drag = useDragReschedule({ resolveIso, applyIso })
    const post = makePost()

    drag.start(down(chip, 'mouse', 10, 10), post)
    drag.move(move(40, 25))
    expect(drag.targetKey.value).toBe(DAY_KEY)

    await drag.end(up(40, 25))

    expect(resolveIso).toHaveBeenCalledWith(post, DAY_KEY)
    expect(applyIso).toHaveBeenCalledWith(post, MOVED_ISO)
    expect(drag.dragging.value).toBe(false)
    expect(drag.ghost.value).toBeNull()
    expect(drag.targetKey.value).toBeNull()
    expect(chip.style.touchAction).toBe('')
  })

  it('leaves the post alone when the pointer is released outside a day cell', async () => {
    const { chip, cell } = mountCalendar()
    document.elementFromPoint = vi.fn(() => cell)
    const applyIso = vi.fn()
    const drag = useDragReschedule({ resolveIso: () => MOVED_ISO, applyIso })

    drag.start(down(chip, 'mouse', 10, 10), makePost())
    drag.move(move(40, 25))
    document.elementFromPoint = vi.fn(() => document.body)
    await drag.end(up(80, 80))

    expect(applyIso).not.toHaveBeenCalled()
    expect(drag.dragging.value).toBe(false)
  })

  it('uses a replaced onDrop handler when the host supplies one', async () => {
    const { chip, cell } = mountCalendar()
    document.elementFromPoint = vi.fn(() => cell)
    const applyIso = vi.fn()
    const drag = useDragReschedule({ resolveIso: () => MOVED_ISO, applyIso })
    const host = vi.fn()
    drag.onDrop = host

    drag.start(down(chip, 'mouse', 10, 10), makePost())
    drag.move(move(40, 25))
    await drag.end(up(40, 25))

    expect(host).toHaveBeenCalledWith('post-1', DAY_KEY)
    expect(applyIso).not.toHaveBeenCalled()
  })

  it('cancels on Escape without dropping', () => {
    const { chip, cell } = mountCalendar()
    document.elementFromPoint = vi.fn(() => cell)
    const applyIso = vi.fn()
    const drag = useDragReschedule({ resolveIso: () => MOVED_ISO, applyIso })

    drag.start(down(chip, 'mouse', 10, 10), makePost())
    drag.move(move(40, 25))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(drag.dragging.value).toBe(false)
    expect(drag.ghost.value).toBeNull()
    expect(drag.targetKey.value).toBeNull()
    expect(chip.style.touchAction).toBe('')
    expect(applyIso).not.toHaveBeenCalled()
  })

  it('cancels on pointercancel', () => {
    const { chip, cell } = mountCalendar()
    document.elementFromPoint = vi.fn(() => cell)
    const drag = useDragReschedule({ resolveIso: () => MOVED_ISO })

    drag.start(down(chip, 'mouse', 10, 10), makePost())
    drag.move(move(40, 25))
    document.dispatchEvent(new PointerEvent('pointercancel', { pointerType: 'mouse' }))

    expect(drag.dragging.value).toBe(false)
    expect(drag.ghost.value).toBeNull()
  })

  it('waits for a 250 ms hold before a touch drag begins', () => {
    vi.useFakeTimers()
    const { chip, cell } = mountCalendar()
    document.elementFromPoint = vi.fn(() => cell)
    const drag = useDragReschedule({ resolveIso: () => MOVED_ISO })
    const post = makePost()

    drag.start(down(chip, 'touch', 10, 10), post)
    drag.move(move(80, 80))
    expect(drag.dragging.value).toBe(false)

    vi.advanceTimersByTime(TOUCH_HOLD_MS - 1)
    expect(drag.dragging.value).toBe(false)

    vi.advanceTimersByTime(1)
    expect(drag.dragging.value).toBe(true)
    expect(drag.ghost.value?.postId).toBe(post.id)
  })

  it('ignores a press that is not cancelable as a drag', () => {
    const { chip, cell } = mountCalendar()
    document.elementFromPoint = vi.fn(() => cell)
    const drag = useDragReschedule({ resolveIso: () => MOVED_ISO })

    drag.start(down(chip, 'mouse', 10, 10), makePost({ status: 'published' }))
    drag.move(move(40, 25))
    expect(drag.dragging.value).toBe(false)

    drag.start(down(chip, 'mouse', 10, 10), makePost({ scheduledAt: null }))
    drag.move(move(40, 25))
    expect(drag.dragging.value).toBe(false)
  })

  it('stays inert when the host disables dragging (mobile path)', () => {
    const { chip, cell } = mountCalendar()
    document.elementFromPoint = vi.fn(() => cell)
    const isEnabled = vi.fn(() => false)
    const drag = useDragReschedule({ resolveIso: () => MOVED_ISO, isEnabled })

    expect(drag.enabled.value).toBe(false)
    drag.start(down(chip, 'mouse', 10, 10), makePost())
    drag.move(move(40, 25))
    expect(drag.dragging.value).toBe(false)
    expect(isEnabled).toHaveBeenCalled()
  })
})
