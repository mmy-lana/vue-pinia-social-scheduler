/** Framework-agnostic helpers shared by stores, composables and components. */

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

const HEX = '0123456789abcdef'

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length)
  const cryptoRef: Crypto | undefined =
    typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto

  if (cryptoRef?.getRandomValues) {
    cryptoRef.getRandomValues(out)
    return out
  }

  for (let i = 0; i < length; i += 1) {
    out[i] = Math.floor(Math.random() * 256)
  }
  return out
}

function randomHex(length: number): string {
  const bytes = randomBytes(Math.ceil(length / 2))
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += HEX[(bytes[i % bytes.length] as number) & 0x0f]
  }
  return out
}

/**
 * UUID v4. Uses `crypto.randomUUID` when present and falls back to a manual
 * RFC 4122 v4 generator, because the API is missing in non-secure contexts
 * (plain `http://` origins) and in some test environments.
 */
export function newId(): string {
  const cryptoRef: Crypto | undefined =
    typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto

  if (typeof cryptoRef?.randomUUID === 'function') {
    return cryptoRef.randomUUID()
  }

  return (
    randomHex(8) +
    '-' +
    randomHex(4) +
    '-4' +
    randomHex(3) +
    '-' +
    ((8 + Math.floor(Math.random() * 4)) as number).toString(16) +
    randomHex(3) +
    '-' +
    randomHex(12)
  ).toUpperCase()
}

/* ------------------------------------------------------------------ *
 * Timing
 * ------------------------------------------------------------------ */

export interface Debounced<A extends unknown[]> {
  (...args: A): void
  cancel: () => void
  flush: () => void
  readonly pending: boolean
}

/** Trailing-edge debounce with `cancel`/`flush`, used by the persistence plugin. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastArgs: A | null = null

  const invoke = (): void => {
    timer = null
    const args = lastArgs
    lastArgs = null
    if (args) fn(...args)
  }

  const debounced = ((...args: A): void => {
    lastArgs = args
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(invoke, ms)
  }) as Debounced<A>

  debounced.cancel = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    lastArgs = null
  }

  debounced.flush = (): void => {
    if (timer === null) return
    clearTimeout(timer)
    invoke()
  }

  Object.defineProperty(debounced, 'pending', {
    get: () => timer !== null,
  })

  return debounced
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort(): void {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/* ------------------------------------------------------------------ *
 * Numbers & strings
 * ------------------------------------------------------------------ */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

const compactFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const integerFormatter = new Intl.NumberFormat()

export function formatCompactNumber(value: number): string {
  return compactFormatter.format(value)
}

export function formatInteger(value: number): string {
  return integerFormatter.format(value)
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const rounded = value >= 100 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded} ${BYTE_UNITS[unit]}`
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural
}

export function titleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase())
}

export function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) {
    const only = parts[0] as string
    return only.slice(0, 2).toUpperCase()
  }
  const first = (parts[0] as string).charAt(0)
  const last = (parts[parts.length - 1] as string).charAt(0)
  return `${first}${last}`.toUpperCase()
}

/** Stable 0–359 hue so an account keeps the same avatar color across sessions. */
export function hueFromString(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % 360
}

/* ------------------------------------------------------------------ *
 * Collections
 * ------------------------------------------------------------------ */

export function groupBy<T, K extends string | number>(
  items: readonly T[],
  key: (item: T) => K,
): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const item of items) {
    const bucket = key(item)
    const existing = out.get(bucket)
    if (existing) existing.push(item)
    else out.set(bucket, [item])
  }
  return out
}

export function uniqueBy<T, K>(items: readonly T[], key: (item: T) => K): T[] {
  const seen = new Set<K>()
  const out: T[] = []
  for (const item of items) {
    const id = key(item)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(item)
  }
  return out
}

export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

/** Ascending comparator by a numeric or string accessor. */
export function byNumber<T>(selector: (item: T) => number) {
  return (a: T, b: T): number => selector(a) - selector(b)
}

export function byString<T>(selector: (item: T) => string) {
  return (a: T, b: T): number => selector(a).localeCompare(selector(b))
}

export function assertNever(value: never, context: string): never {
  throw new Error(`${context}: unhandled variant ${JSON.stringify(value)}`)
}

/** Structured deep copy used by the 8-second undo snapshots. */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      // Falls through to the JSON path for values structuredClone rejects.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T
}

/* ------------------------------------------------------------------ *
 * Randomness (injectable everywhere it drives behavior)
 * ------------------------------------------------------------------ */

export function randomInt(minInclusive: number, maxInclusive: number, random = Math.random): number {
  const span = maxInclusive - minInclusive + 1
  return minInclusive + Math.floor(random() * span)
}

export function pickRandom<T>(items: readonly T[], random = Math.random): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))] as T
}

/* ------------------------------------------------------------------ *
 * Files
 * ------------------------------------------------------------------ */

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

export function baseName(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? name : name.slice(0, dot)
}

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') resolve(result)
      else reject(new Error('Could not read file as a data URL.'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'))
    reader.readAsDataURL(file)
  })
}

export function readAsText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') resolve(result)
      else reject(new Error('Could not read file as text.'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'))
    reader.readAsText(file)
  })
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return readAsDataUrl(blob)
}

export function downloadTextFile(fileName: string, contents: string, mime = 'application/json'): void {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/* ------------------------------------------------------------------ *
 * Class names
 * ------------------------------------------------------------------ */

export type ClassValue = string | number | false | null | undefined

/** Minimal class-name joiner; no dependency needed. */
export function cx(...values: ClassValue[]): string {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0).join(' ')
}
