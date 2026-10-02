import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMediaUpload } from '@/composables/useMediaUpload'
import { useMediaStore } from '@/stores/useMediaStore'
import { useUiStore } from '@/stores/useUiStore'
import { MEDIA_BUDGET } from '@/lib/media'
import type { MediaAsset } from '@/types'

beforeEach(() => {
  window.localStorage.clear()
  setActivePinia(createPinia())
})

/** A GIF short-circuits the compression ladder, so no canvas is needed. */
function makeGif(name: string): File {
  return new File([new Uint8Array(64)], name, { type: 'image/gif' })
}

function makeTextFile(name: string): File {
  return new File([new Uint8Array(16)], name, { type: 'text/plain' })
}

function makeAsset(index: number): MediaAsset {
  const now = '2026-10-01T00:00:00.000Z'
  return {
    id: `asset-${index}`,
    name: `photo-${index}.jpg`,
    mime: 'image/jpeg',
    width: 400,
    height: 400,
    bytes: 1_024,
    dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    createdAt: now,
    updatedAt: now,
  }
}

describe('useMediaUpload', () => {
  it('stores accepted files and reports them as finished', async () => {
    const media = useMediaStore()
    const upload = useMediaUpload()

    const result = await upload.upload([makeGif('one.gif'), makeGif('two.gif')])

    expect(result.added).toHaveLength(2)
    expect(result.errors).toEqual([])
    expect(media.assets).toHaveLength(2)
    expect(upload.completed.value).toBe(2)
    expect(upload.uploading.value).toBe(false)
    expect(upload.errors.value).toEqual([])
    expect(useUiStore().toasts).toHaveLength(0)
  })

  it('collects the per-file errors and toasts one summary for many', async () => {
    const upload = useMediaUpload()

    const result = await upload.upload([
      makeTextFile('notes.txt'),
      makeTextFile('sheet.csv'),
      makeTextFile('deck.pdf'),
      makeTextFile('notes2.txt'),
    ])

    expect(result.added).toEqual([])
    expect(result.errors).toHaveLength(4)
    expect(upload.errors.value).toHaveLength(4)
    expect(upload.completed.value).toBe(4)

    const toasts = useUiStore().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toContain('notes.txt: unsupported file type.')
    expect(toasts[0].message).toContain('+3 more')

    upload.clearErrors()
    expect(upload.errors.value).toEqual([])
  })

  it('toasts one message per failure while the list stays short', async () => {
    const upload = useMediaUpload()

    await upload.upload([makeTextFile('notes.txt'), makeTextFile('sheet.csv')])

    const toasts = useUiStore().toasts
    expect(toasts).toHaveLength(2)
    expect(toasts.map((toast) => toast.message)).toEqual([
      'notes.txt: unsupported file type.',
      'sheet.csv: unsupported file type.',
    ])
  })

  it('ignores a second upload while the pipeline is still running', async () => {
    const media = useMediaStore()
    const upload = useMediaUpload()

    const first = upload.upload([makeGif('one.gif')])
    expect(upload.uploading.value).toBe(true)
    const second = await upload.upload([makeGif('two.gif')])
    expect(second).toEqual({ added: [], errors: [] })

    const firstResult = await first
    expect(firstResult.added).toHaveLength(1)
    expect(media.assets).toHaveLength(1)
    expect(upload.uploading.value).toBe(false)
  })

  it('reports capacity and refuses to store past the library ceiling', async () => {
    const media = useMediaStore()
    const upload = useMediaUpload()

    expect(upload.maxAssets.value).toBe(MEDIA_BUDGET.maxAssets)
    expect(upload.atCapacity.value).toBe(false)

    media.replaceAll(
      Array.from({ length: MEDIA_BUDGET.maxAssets }, (_unused, i) => makeAsset(i + 1)),
    )

    expect(upload.atCapacity.value).toBe(true)

    const result = await upload.upload([makeGif('one.gif')])

    expect(result.added).toEqual([])
    expect(result.errors[0]).toContain('Media library is full')
    expect(media.assets).toHaveLength(MEDIA_BUDGET.maxAssets)
    expect(useUiStore().toasts.at(-1)?.tone).toBe('warn')
  })
})
