import { getCurrentScope, onScopeDispose } from 'vue'
import type { PiniaPluginContext, StoreGeneric } from 'pinia'
import { STORAGE_KEYS, readEnvelope, writeEnvelope } from '@/lib/storage'
import { debounce } from '@/lib/utils'

/**
 * Pinia persistence.
 *
 * A store opts in by returning a `persistApi` from its setup function. The plugin
 * hydrates the slice before the app renders, re-validates it with the store's own
 * zod parser (dropping only the corrupt records), then writes changes back with
 * a debounce. Cross-tab updates arrive through the `storage` event and are
 * applied without echoing a write back to the other tab.
 */

export interface PersistApi<T> {
  /** Namespaced LocalStorage key. */
  key: string
  /** Envelope version written by this build. */
  version: number
  /** Milliseconds to coalesce writes. Default 150. */
  debounceMs?: number
  /** Extracts the slice to persist. */
  read: () => T
  /** Applies an already-validated slice into the store. */
  apply: (data: T) => void
  /** Validates persisted data, counting the records that had to be dropped. */
  parse: (raw: unknown) => { data: T; dropped: number }
  /** Value used when nothing usable is stored. */
  fallback: T
  /** `migrations[fromVersion]` upgrades older payloads step by step. */
  migrations?: Record<number, (data: unknown) => unknown>
  /** Called when a write fails, e.g. to surface a quota toast. */
  onWriteError?: (reason: 'quota' | 'unavailable' | 'unknown') => void
  /** Called with the number of records dropped while hydrating. */
  onDropped?: (count: number) => void
}

export type PersistWriteError = 'quota' | 'unavailable' | 'unknown'

declare module 'pinia' {
  export interface PiniaCustomProperties {
    /** Present on stores that opted into persistence. */
    persistApi?: PersistApi<unknown>
  }
}

/** Storage keys in one place, so no store invents its own. */
export const STORE_KEYS = {
  settings: STORAGE_KEYS.settings,
  accounts: STORAGE_KEYS.accounts,
  slots: STORAGE_KEYS.slots,
  posts: STORAGE_KEYS.posts,
  media: STORAGE_KEYS.media,
  activity: STORAGE_KEYS.activity,
  composerDraft: STORAGE_KEYS.composerDraft,
  schedulerLease: STORAGE_KEYS.schedulerLease,
  onboarding: STORAGE_KEYS.onboarding,
} as const

interface PersistableStore {
  persistApi?: PersistApi<unknown>
}

function persistable(store: StoreGeneric): PersistableStore {
  return store as unknown as PersistableStore
}

/**
 * Write-now functions, keyed by the persistence key they belong to.
 *
 * Keyed rather than collected: every store registers one, and a test or a hot
 * reload can build store instances repeatedly. A plain `Set` accumulated one
 * closure per instance forever, each still holding its store alive, so the
 * registry grew without bound and `flushPersistence` kept writing to abandoned
 * stores. Keying also means re-registering a key replaces the previous closure
 * instead of adding a second one.
 */
const forceFlushers = new Map<string, () => void>()

/**
 * Removes a store's writer from the registry.
 *
 * Called when a store is disposed so a torn-down instance is neither written to
 * nor kept alive by the registry.
 */
export function unregisterStorePersistence(key: string): void {
  forceFlushers.delete(key)
}

/**
 * While true, no store writes to LocalStorage.
 *
 * Wiping storage is not enough on its own: the page is still alive, every store
 * still holds its old state in memory, and the `pagehide` handler writes that
 * state straight back the moment navigation tears the page down — resurrecting
 * exactly what was just cleared. Suppression is a one-way latch, set before the
 * wipe and kept for the remainder of the page's life.
 */
let isPersistenceSuppressed = false

/** Stops every store from writing. Intended for destructive whole-app resets. */
export function suppressPersistence(): void {
  isPersistenceSuppressed = true
}

/** True while writes are suppressed. Exposed for assertions and diagnostics. */
export function isPersistenceSuppressedNow(): boolean {
  return isPersistenceSuppressed
}

/**
 * Writes every store's *current* state to LocalStorage immediately.
 *
 * Two things depend on this. The scheduler re-reads posts from storage before
 * each pass, so it must push its in-memory state first — otherwise it restores
 * a stale snapshot. And because `$subscribe` runs on Vue's `post` flush, a
 * change made synchronously earlier in the same tick has not even been
 * *scheduled* yet: flushing the pending timer is not enough, the current value
 * has to be written outright. `flush` is a no-op when the payload is unchanged,
 * so forcing it is safe and cheap.
 */
export function flushPersistence(): void {
  for (const force of forceFlushers.values()) force()
}

export function persistencePlugin({ store }: PiniaPluginContext): void {
  const api = persistable(store).persistApi
  if (!api) return

  const raw = readEnvelope<unknown>(api.key, api.version, api.fallback, api.migrations)
  const { data, dropped } = api.parse(raw)
  api.apply(data)

  if (dropped > 0) api.onDropped?.(dropped)

  /** Serialized payload of the last write; used to skip redundant echoes. */
  let lastWritten: string | null = null
  /** True while another tab's payload is being applied. */
  let applyingExternal = false

  const flush = (): void => {
    if (isPersistenceSuppressed) return
    if (applyingExternal) return
    const slice = api.read()
    let payload: string
    try {
      payload = JSON.stringify(slice)
    } catch {
      // A slice that cannot be serialized must not break the rest of the app.
      return
    }
    if (payload === lastWritten) return
    const result = writeEnvelope(api.key, api.version, slice)
    if (!result.ok) {
      api.onWriteError?.(result.error)
      return
    }
    lastWritten = payload
  }

  const debouncedFlush = debounce(flush, api.debounceMs ?? 150)
  // Cancel the timer, then write whatever the store holds right now — including
  // changes made so recently that `$subscribe` has not scheduled a write yet.
  forceFlushers.set(api.key, () => {
    debouncedFlush.cancel()
    flush()
  })

  const onPageHide = (): void => {
    if (isPersistenceSuppressed) return
    debouncedFlush.flush()
  }

  const onStorage = (event: StorageEvent): void => {
    if (event.key !== api.key || event.newValue === null) return
    const fresh = readEnvelope<unknown>(api.key, api.version, api.fallback, api.migrations)
    const parsed = api.parse(fresh)
    applyingExternal = true
    api.apply(parsed.data)
    lastWritten = JSON.stringify(api.read())
    if (parsed.dropped > 0) api.onDropped?.(parsed.dropped)
    // Release the guard on the next macrotask, after the store's own watchers
    // (including this subscription) have flushed.
    setTimeout(() => {
      applyingExternal = false
    }, 0)
  }

  // A disposed store must stop writing, and must not be retained by the
  // registry. Both listeners go with it.
  if (getCurrentScope()) {
    onScopeDispose(() => {
      unregisterStorePersistence(api.key)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('storage', onStorage)
    })
  }

  store.$subscribe(
    () => {
      if (isPersistenceSuppressed) return
      if (applyingExternal) return
      debouncedFlush()
    },
    { detached: true, flush: 'post' },
  )

  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('storage', onStorage)
}
