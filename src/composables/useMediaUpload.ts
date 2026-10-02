import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useMediaStore } from '@/stores/useMediaStore'
import { useUiStore } from '@/stores/useUiStore'
import { MEDIA_BUDGET } from '@/lib/media'
import type { MediaAsset } from '@/types'

/**
 * Drives the media picker's upload flow.
 *
 * The heavy lifting (validation, downscaling, JPEG re-encode) happens inside the
 * media store, so this composable only owns the transient UI state: the busy
 * flag, how many files finished, and the per-file errors — which are reported in
 * as few toasts as possible instead of one toast per rejected file.
 */

/** Above this many failures a single summary toast is clearer than a stack. */
export const MAX_ERROR_TOASTS = 3

export interface MediaUploadResult {
  added: MediaAsset[]
  errors: string[]
}

export interface MediaUploadController {
  uploading: Ref<boolean>
  /** Files that finished (stored or rejected) during the last `upload`. */
  completed: Ref<number>
  errors: Ref<string[]>
  upload: (files: FileList | readonly File[]) => Promise<MediaUploadResult>
  clearErrors: () => void
  /** Library-wide ceiling on stored assets. */
  maxAssets: ComputedRef<number>
  atCapacity: ComputedRef<boolean>
}

function toArray(files: FileList | readonly File[]): File[] {
  return Array.from(files as ArrayLike<File>)
}

export function useMediaUpload(): MediaUploadController {
  const media = useMediaStore()
  const ui = useUiStore()

  const uploading = ref(false)
  const completed = ref(0)
  const errors = ref<string[]>([])

  const maxAssets = computed(() => MEDIA_BUDGET.maxAssets)
  const atCapacity = computed(() => media.isFull || media.assets.length >= MEDIA_BUDGET.maxAssets)

  function reportErrors(found: readonly string[]): void {
    if (found.length === 0) return
    if (found.length > MAX_ERROR_TOASTS) {
      ui.toast({
        tone: 'warn',
        message: `${found[0]} (+${found.length - 1} more files could not be added)`,
      })
      return
    }
    for (const message of found) {
      ui.toast({ tone: 'warn', message })
    }
  }

  async function upload(files: FileList | readonly File[]): Promise<MediaUploadResult> {
    // A second drop while the pipeline runs is ignored rather than interleaved.
    if (uploading.value) return { added: [], errors: [] }

    const list = toArray(files)
    uploading.value = true
    completed.value = 0
    errors.value = []

    try {
      const outcome = await media.addFiles(list)
      completed.value = outcome.added.length + outcome.errors.length
      errors.value = [...outcome.errors]
      reportErrors(outcome.errors)
      return { added: outcome.added, errors: [...outcome.errors] }
    } finally {
      uploading.value = false
    }
  }

  function clearErrors(): void {
    errors.value = []
  }

  return { uploading, completed, errors, upload, clearErrors, maxAssets, atCapacity }
}
