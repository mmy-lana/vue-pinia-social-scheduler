import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { MediaAssetSchema, parseArray } from '@/lib/schemas'
import { newId } from '@/lib/utils'
import { MAX_MEDIA_ASSETS_TOTAL } from '@/lib/platforms'
import { validateLibraryCapacity, type ProcessOptions, type ProcessedMedia } from '@/lib/media'
import { processImageBatch } from '@/lib/media'
import { useUiStore } from '@/stores/useUiStore'
import { STORE_KEYS, type PersistApi, type PersistWriteError } from '@/stores/persistencePlugin'
import type { MediaAsset, Result } from '@/types'

export interface AddFilesOutcome {
  added: MediaAsset[]
  errors: string[]
  skipped: number
}

/** Compressed media library, capped so LocalStorage can never overflow. */
export const useMediaStore = defineStore('media', () => {
  const assets = ref<MediaAsset[]>([])
  const droppedCount = ref(0)
  /** Ids of the most recent add, kept so a quota error can roll it back. */
  const lastAddedIds = ref<string[]>([])

  const byId = computed(() => new Map(assets.value.map((asset) => [asset.id, asset])))
  const totalBytes = computed(() => assets.value.reduce((sum, asset) => sum + asset.bytes, 0))
  const count = computed(() => assets.value.length)
  const isFull = computed(() => assets.value.length >= MAX_MEDIA_ASSETS_TOTAL)

  function resolveMany(ids: readonly string[]): MediaAsset[] {
    const map = byId.value
    const out: MediaAsset[] = []
    for (const id of ids) {
      const asset = map.get(id)
      if (asset) out.push(asset)
    }
    return out
  }

  function exists(id: string): boolean {
    return byId.value.has(id)
  }

  /**
   * Runs the real compression pipeline. Files are processed sequentially; the
   * per-file errors are collected so the UI can report them in one toast.
   */
  async function addFiles(
    files: readonly File[],
    options: Omit<ProcessOptions, 'currentCount'> = {},
  ): Promise<AddFilesOutcome> {
    const capacityError = validateLibraryCapacity(assets.value.length)
    if (capacityError) {
      return { added: [], errors: [capacityError], skipped: files.length }
    }

    const batch = await processImageBatch(files, { ...options, currentCount: assets.value.length })
    if (batch.assets.length === 0) {
      return { added: [], errors: batch.errors, skipped: batch.skipped }
    }

    const now = new Date().toISOString()
    const created = batch.assets.map((processed: ProcessedMedia) => ({
      ...processed,
      id: newId(),
      createdAt: now,
      updatedAt: now,
    }))
    assets.value = [...assets.value, ...created]
    lastAddedIds.value = created.map((asset) => asset.id)
    return { added: created, errors: batch.errors, skipped: batch.skipped }
  }

  function remove(id: string): boolean {
    const before = assets.value.length
    assets.value = assets.value.filter((asset) => asset.id !== id)
    return assets.value.length < before
  }

  function removeMany(ids: readonly string[]): MediaAsset[] {
    const targets = new Set(ids)
    const removed = assets.value.filter((asset) => targets.has(asset.id))
    if (removed.length > 0) {
      assets.value = assets.value.filter((asset) => !targets.has(asset.id))
    }
    return removed
  }

  /** Drops assets no post references any more. */
  function gc(referencedIds: ReadonlySet<string>): MediaAsset[] {
    return removeMany(assets.value.filter((asset) => !referencedIds.has(asset.id)).map((a) => a.id))
  }

  function rollBackLastAdd(): MediaAsset[] {
    if (lastAddedIds.value.length === 0) return []
    const removed = removeMany(lastAddedIds.value)
    lastAddedIds.value = []
    return removed
  }

  function clearLastAdd(): void {
    lastAddedIds.value = []
  }

  function replaceAll(list: readonly MediaAsset[]): void {
    assets.value = [...list]
  }

  function restore(list: readonly MediaAsset[]): void {
    const known = new Set(assets.value.map((asset) => asset.id))
    assets.value = [...list.filter((asset) => !known.has(asset.id)), ...assets.value]
  }

  const persistApi: PersistApi<MediaAsset[]> = {
    key: STORE_KEYS.media,
    version: 1,
    read: () => assets.value,
    apply: (data) => {
      assets.value = data
    },
    parse: (raw) => parseArray(MediaAssetSchema, raw),
    fallback: [],
    onWriteError: (reason: PersistWriteError) => {
      const ui = useUiStore()
      if (reason === 'quota') {
        const removed = rollBackLastAdd()
        if (removed.length > 0) {
          ui.toast({
            tone: 'danger',
            message: 'Storage is full — the last upload was removed. Delete media or old posts.',
          })
        }
        return
      }
      if (reason === 'unavailable') return
      ui.toast({ tone: 'warn', message: 'Could not save to this browser. Your changes may be lost.' })
    },
  }

  function checkQuota(result: Result<true, PersistWriteError>): boolean {
    if (result.ok) return true
    persistApi.onWriteError?.(result.error)
    return false
  }

  return {
    assets,
    byId,
    totalBytes,
    count,
    isFull,
    droppedCount,
    lastAddedIds,
    resolveMany,
    exists,
    addFiles,
    remove,
    removeMany,
    gc,
    rollBackLastAdd,
    clearLastAdd,
    replaceAll,
    restore,
    checkQuota,
    persistApi,
  }
})
