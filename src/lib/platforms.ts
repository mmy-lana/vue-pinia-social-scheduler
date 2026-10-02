import type { PlatformId, PlatformMeta, SocialAccount } from '@/types'

/** Supported networks, their limits and their accent colors. */
export const PLATFORMS: Record<PlatformId, PlatformMeta> = {
  x: {
    id: 'x',
    label: 'X',
    color: '#0F1419',
    maxChars: 280,
    maxMedia: 4,
    requiresMedia: false,
  },
  linkedin: {
    id: 'linkedin',
    label: 'LinkedIn',
    color: '#0A66C2',
    maxChars: 3000,
    maxMedia: 9,
    requiresMedia: false,
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    color: '#E1306C',
    maxChars: 2200,
    maxMedia: 10,
    requiresMedia: true,
  },
  facebook: {
    id: 'facebook',
    label: 'Facebook',
    color: '#1877F2',
    maxChars: 63206,
    maxMedia: 10,
    requiresMedia: false,
  },
  threads: {
    id: 'threads',
    label: 'Threads',
    color: '#101010',
    maxChars: 500,
    maxMedia: 10,
    requiresMedia: false,
  },
}

export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[]

/** Hard app-level cap so a multi-platform post never exceeds the smallest channel. */
export const APP_MAX_MEDIA_PER_POST = 4

export const MAX_SCHEDULE_AHEAD_DAYS = 365

/** A scheduled post must land at least this far in the future. */
export const MIN_SCHEDULE_LEAD_MS = 60_000

/** Payload ceiling for one stored media asset (LocalStorage safety). */
export const MAX_STORED_MEDIA_BYTES = 450_000

/** Library-wide asset ceiling that keeps `QuotaExceededError` out of reach. */
export const MAX_MEDIA_ASSETS_TOTAL = 8

/** Rejected before any compression is attempted. */
export const MAX_MEDIA_RAW_BYTES = 10 * 1024 * 1024

/** Ceiling for one compressed asset produced by the media pipeline. */
export const MAX_MEDIA_COMPRESSED_BYTES = 700 * 1024

export const ALLOWED_MEDIA_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === 'string' && (PLATFORM_IDS as string[]).includes(value)
}

export function platformLabel(id: PlatformId): string {
  return PLATFORMS[id].label
}

/** Distinct platforms covered by a set of accounts, in canonical order. */
export function platformsOf(accounts: readonly SocialAccount[]): PlatformId[] {
  const seen = new Set(accounts.map((account) => account.platform))
  return PLATFORM_IDS.filter((id) => seen.has(id))
}

export function formatCharLimit(limit: number): string {
  return new Intl.NumberFormat().format(limit)
}
