import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import MediaGrid from '@/components/posts/MediaGrid.vue'
import { resetBodyScrollLock } from '@/composables/useBodyScrollLock'
import { useMediaStore } from '@/stores/useMediaStore'
import type { MediaAsset } from '@/types'

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function asset(id: string, name: string): MediaAsset {
  return {
    id,
    name,
    mime: 'image/png',
    width: 1200,
    height: 675,
    bytes: 2048,
    dataUrl: PIXEL,
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
  }
}

const ASSETS = [
  asset('m1', 'Sunset.png'),
  asset('m2', 'Harbour.png'),
  asset('m3', 'Orchid.png'),
  asset('m4', 'Dunes.png'),
]

function mountGrid(mediaIds: string[]) {
  return mount(MediaGrid, {
    props: { mediaIds },
    // The lightbox teleports to <body>; stubbing keeps its DOM inside the wrapper.
    global: { stubs: { teleport: true } },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  window.localStorage.clear()
  useMediaStore().replaceAll(ASSETS)
})

afterEach(() => {
  resetBodyScrollLock()
})

describe('MediaGrid', () => {
  it('renders nothing at all without media', () => {
    const wrapper = mountGrid([])
    expect(wrapper.find('[data-testid="media-grid"]').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('media-grid')
    wrapper.unmount()
  })

  it('renders one 16:9 frame for a single image', () => {
    const wrapper = mountGrid(['m1'])
    const grid = wrapper.get('[data-testid="media-grid"]')

    expect(grid.classes()).toContain('aspect-video')
    expect(grid.classes()).not.toContain('grid-cols-2')
    expect(grid.findAll('[data-testid="media-item"]')).toHaveLength(1)
    expect(grid.get('[data-testid="media-item"]').classes()).toContain('aspect-video')
    expect(grid.get('img').attributes('src')).toBe(PIXEL)
    wrapper.unmount()
  })

  it('lays two images out side by side', () => {
    const wrapper = mountGrid(['m1', 'm2'])
    const grid = wrapper.get('[data-testid="media-grid"]')

    expect(grid.classes()).toContain('grid-cols-2')
    expect(grid.attributes('data-count')).toBe('2')
    const items = grid.findAll('[data-testid="media-item"]')
    expect(items).toHaveLength(2)
    expect(items.every((item) => item.classes().includes('aspect-square'))).toBe(true)
    wrapper.unmount()
  })

  it('gives three images one large frame and two small ones', () => {
    const wrapper = mountGrid(['m1', 'm2', 'm3'])
    const grid = wrapper.get('[data-testid="media-grid"]')

    expect(grid.classes()).toContain('grid-cols-2')
    expect(grid.classes()).toContain('grid-rows-2')
    const items = grid.findAll('[data-testid="media-item"]')
    expect(items).toHaveLength(3)
    expect(items[0]?.classes()).toContain('row-span-2')
    expect(items[1]?.classes()).not.toContain('row-span-2')
    expect(items[2]?.classes()).not.toContain('row-span-2')
    wrapper.unmount()
  })

  it('lays four images out as a 2x2 square', () => {
    const wrapper = mountGrid(['m1', 'm2', 'm3', 'm4'])
    const grid = wrapper.get('[data-testid="media-grid"]')

    expect(grid.classes()).toContain('aspect-square')
    expect(grid.classes()).toContain('grid-cols-2')
    expect(grid.findAll('[data-testid="media-item"]')).toHaveLength(4)
    expect(grid.findAll('[data-testid="media-item"]')[0]?.classes()).not.toContain('row-span-2')
    wrapper.unmount()
  })

  it('names every frame and drops ids the library no longer has', () => {
    const wrapper = mountGrid(['m2', 'gone', 'm3'])
    const items = wrapper.findAll('[data-testid="media-item"]')

    // The missing asset renders nothing at all, and the numbering stays honest.
    expect(items).toHaveLength(2)
    expect(items[0]?.attributes('aria-label')).toBe('View photo 1 of 2: Harbour.png')
    expect(items[1]?.attributes('aria-label')).toBe('View photo 2 of 2: Orchid.png')
    expect(wrapper.html()).not.toContain('gone')
    wrapper.unmount()
  })

  it('renders no grid when none of the ids resolve', () => {
    const wrapper = mountGrid(['gone-1', 'gone-2'])
    expect(wrapper.find('[data-testid="media-grid"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('opens the lightbox on the tapped photo and counts it', async () => {
    const wrapper = mountGrid(['m1', 'm2', 'm3'])
    const items = wrapper.findAll('[data-testid="media-item"]')

    expect(wrapper.find('[data-testid="media-lightbox"]').exists()).toBe(false)

    await items[1]?.trigger('click')

    const lightbox = wrapper.get('[data-testid="media-lightbox"]')
    expect(lightbox.get('[data-testid="media-lightbox-counter"]').text()).toBe('2 of 3')
    expect(lightbox.get('[data-testid="media-lightbox-caption"]').text()).toBe('Harbour.png')
    expect(lightbox.get('[data-testid="media-lightbox-image"]').attributes('src')).toBe(PIXEL)

    const panel = lightbox.get('[data-testid="media-lightbox-panel"]')
    expect(panel.attributes('role')).toBe('dialog')
    expect(panel.attributes('aria-modal')).toBe('true')
    expect(document.body.style.overflow).toBe('hidden')

    wrapper.unmount()
  })

  it('moves between photos with the arrow keys and wraps around', async () => {
    const wrapper = mountGrid(['m1', 'm2', 'm3'])
    await wrapper.findAll('[data-testid="media-item"]')[0]?.trigger('click')

    const counter = (): string =>
      wrapper.get('[data-testid="media-lightbox-counter"]').text()

    expect(counter()).toBe('1 of 3')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()
    expect(counter()).toBe('2 of 3')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()
    expect(counter()).toBe('3 of 3')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()
    expect(counter()).toBe('1 of 3')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await nextTick()
    expect(counter()).toBe('3 of 3')

    wrapper.unmount()
  })

  it('closes on the close button, the backdrop and Escape', async () => {
    const wrapper = mountGrid(['m1', 'm2'])
    const items = wrapper.findAll('[data-testid="media-item"]')

    await items[0]?.trigger('click')
    expect(wrapper.find('[data-testid="media-lightbox"]').exists()).toBe(true)

    await wrapper.get('[data-testid="media-lightbox-close"]').trigger('click')
    expect(wrapper.find('[data-testid="media-lightbox"]').exists()).toBe(false)

    await items[0]?.trigger('click')
    expect(wrapper.find('[data-testid="media-lightbox"]').exists()).toBe(true)
    await wrapper.get('[data-testid="media-lightbox-backdrop"]').trigger('click')
    expect(wrapper.find('[data-testid="media-lightbox"]').exists()).toBe(false)

    await items[0]?.trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(wrapper.find('[data-testid="media-lightbox"]').exists()).toBe(false)
    expect(document.body.style.overflow).not.toBe('hidden')

    wrapper.unmount()
  })

  it('reopens on the photo it was left on', async () => {
    const wrapper = mountGrid(['m1', 'm2', 'm3'])
    const items = wrapper.findAll('[data-testid="media-item"]')

    await items[1]?.trigger('click')
    await wrapper.get('[data-testid="media-lightbox-close"]').trigger('click')
    await items[1]?.trigger('click')

    expect(wrapper.get('[data-testid="media-lightbox-counter"]').text()).toBe('2 of 3')
    wrapper.unmount()
  })
})