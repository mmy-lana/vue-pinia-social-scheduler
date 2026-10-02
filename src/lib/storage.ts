import type { Result } from '@/types'

export interface Envelope<T> {
  v: number
  data: T
}

export type Migration = (data: unknown) => unknown

export const NS = 'vpss:'

/** Every persisted slice, in the order the Settings data panel lists them. */
export const STORAGE_KEYS = {
  accounts: `${NS}accounts`,
  slots: `${NS}slots`,
  posts: `${NS}posts`,
  media: `${NS}media`,
  settings: `${NS}settings`,
  activity: `${NS}activity`,
  composerDraft: `${NS}composer-draft`,
  schedulerLease: `${NS}scheduler-lease`,
  onboarding: `${NS}onboarding`,
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

export const SCHEMA_VERSION = 1

const BACKUP_PREFIX = `${NS}backup:`
const MAX_BACKUPS = 3

function hasStorage(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false
  try {
    const probe = `${NS}__probe`
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/** `false` in private mode or when storage is blocked; the app then runs in memory. */
export const storageAvailable = hasStorage()

function backupKeys(): string[] {
  if (!storageAvailable) return []
  const keys: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key !== null && key.startsWith(BACKUP_PREFIX)) keys.push(key)
  }
  return keys
}

function backupRaw(key: string, raw: string): void {
  if (!storageAvailable) return
  try {
    window.localStorage.setItem(`${BACKUP_PREFIX}${key.replace(NS, '')}:${Date.now()}`, raw)
    const backups = backupKeys().sort()
    while (backups.length > MAX_BACKUPS) {
      const oldest = backups.shift()
      if (oldest) window.localStorage.removeItem(oldest)
    }
  } catch {
    // Backing up is best effort: a failed backup must never break boot.
  }
}

/**
 * Reads a versioned slice, running the migration chain when the stored version
 * is older. An unreadable, future-versioned or unmigratable payload is backed up
 * and replaced by `fallback`.
 */
export function readEnvelope<T>(
  key: string,
  version: number,
  fallback: T,
  migrations: Record<number, Migration> = {},
): T {
  if (!storageAvailable) return fallback
  const raw = window.localStorage.getItem(key)
  if (raw === null) return fallback
  try {
    const parsed = JSON.parse(raw) as Envelope<unknown>
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.v !== 'number') {
      throw new Error('bad envelope')
    }
    let data = parsed.data
    let versionSeen = parsed.v
    if (versionSeen > version) throw new Error('future version')
    while (versionSeen < version) {
      const step = migrations[versionSeen]
      if (!step) throw new Error(`no migration from ${versionSeen}`)
      data = step(data)
      versionSeen += 1
    }
    return data as T
  } catch {
    backupRaw(key, raw)
    return fallback
  }
}

export function writeEnvelope<T>(
  key: string,
  version: number,
  data: T,
): Result<true, 'quota' | 'unavailable' | 'unknown'> {
  if (!storageAvailable) return { ok: false, error: 'unavailable' }
  try {
    const payload: Envelope<T> = { v: version, data }
    window.localStorage.setItem(key, JSON.stringify(payload))
    return { ok: true, value: true }
  } catch (error) {
    return { ok: false, error: isQuotaError(error) ? 'quota' : 'unknown' }
  }
}

function isQuotaError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014
    )
  }
  return error instanceof Error && /quota/i.test(error.message)
}

export function removeKey(key: string): void {
  if (!storageAvailable) return
  window.localStorage.removeItem(key)
}

export function readRaw(key: string): string | null {
  if (!storageAvailable) return null
  return window.localStorage.getItem(key)
}

export function writeRaw(key: string, raw: string): void {
  if (!storageAvailable) return
  window.localStorage.setItem(key, raw)
}

/** Namespaced keys currently in use, excluding migration backups. */
export function listNamespaceKeys(): string[] {
  if (!storageAvailable) return []
  const keys: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key !== null && key.startsWith(NS) && !key.startsWith(BACKUP_PREFIX)) keys.push(key)
  }
  return keys
}

/** Byte size of the whole namespace, used by the Settings storage meter. */
export function namespaceBytes(): number {
  if (!storageAvailable) return 0
  let total = 0
  for (const key of listNamespaceKeys()) {
    total += key.length + (window.localStorage.getItem(key)?.length ?? 0)
  }
  return total * 2
}

/** Removes every namespaced key except backups, used by "Reset everything". */
export function clearNamespace(): void {
  if (!storageAvailable) return
  for (const key of listNamespaceKeys()) {
    window.localStorage.removeItem(key)
  }
}
