# plan.md — `vue-pinia-social-scheduler`

**Project:** Social Media Dashboard with Scheduled Posting
**Stack:** Vue 3 (`<script setup lang="ts">`) + Pinia + Tailwind CSS · **Aesthetic:** Buffer/Hootsuite modern card timeline
**Storage:** Offline/Local (`localStorage`, versioned envelopes). No backend. Publishing is **simulated** by an in-browser scheduler engine.
**Versioning rule:** every dependency is installed at `latest`. This document contains **no version numbers**; agents must use each library's current stable API (Tailwind CSS-first `@theme` config, Vue `defineModel`/`useTemplateRef`, Pinia setup stores, Vue Router typed routes optional).

---

## 0. Execution Rules for the Code-Generating Agent

1. Generate phases strictly in order (1 → 5). Do not start a phase until the previous phase's **Definition of Done** passes (`vue-tsc --noEmit`, lint, unit tests for that phase).
2. No `// TODO`, no `// ...rest`, no stub functions, no `any`, no `@ts-ignore`. Every file is complete.
3. Idiomatic Vue 3 only: Composition API, `<script setup lang="ts">`, `defineProps`/`defineEmits` with type-only generics, `defineModel` for v-model, `useTemplateRef` for refs, `computed` for derived state, no Options API, no mixins, no Vuex.
4. Pinia **setup stores** only. Stores never import components. Components never write to `localStorage` directly.
5. All persistence goes through `src/lib/storage.ts` and the `persistencePlugin`.
6. Every interactive element ≥ 44×44 px hit area on touch; **no essential action is hover-only** (hover may only add polish). Every icon-only button has `aria-label`.
7. Respect `prefers-reduced-motion` (all transitions wrapped in `motion-safe:`).
8. All dates stored as UTC ISO strings; all display/entry goes through `src/lib/datetime.ts` using the user's selected IANA timezone.
9. IDs: wrapped in `newId()` using `crypto.randomUUID()` with fallback to RFC4122 v4 generator when `crypto.randomUUID` is unavailable (e.g. non-HTTPS test contexts).
10. Dependencies (names only): `vue`, `pinia`, `vue-router`, `@vueuse/core`, `zod`, `date-fns`, `@date-fns/tz`, `lucide-vue-next`, `@fontsource-variable/inter`, `tailwindcss`, `@tailwindcss/vite`, `vite`, `@vitejs/plugin-vue`, `typescript`, `vue-tsc`, `vitest`, `@vue/test-utils`, `happy-dom`, `eslint` + `eslint-plugin-vue` + `typescript-eslint`, `prettier`.

---

## 1. Product Scope

A single-user, offline-first social media planner:

| Capability | Behavior |
|---|---|
| Channels | Connect (simulated) / disconnect / remove accounts on 5 platforms |
| Composer | Write once, target many channels, per-platform live preview, media, char limits |
| Scheduling | Publish now · Schedule at date/time · **Add to Queue** (next free weekly slot) · Save draft |
| Queue | Weekly posting-time slots per channel (Buffer-style), auto-assign next free slot |
| Timeline | Card timeline grouped by day, status chips, filters |
| Calendar | Month / Week / Agenda; drag-to-reschedule (pointer) **and** a non-drag "Reschedule" action |
| Scheduler engine | Tick loop publishes due posts, catch-up policy, retries, cross-tab safety |
| Library | Drafts, Published, Failed with bulk-free simple actions |
| Settings | Timezone, 12/24h, week start, theme, simulate failures, data export/import/reset, demo data |

Non-goals: real OAuth, real network publishing, multi-user, push notifications.

---

## 2. Platform Constants (`src/lib/platforms.ts`)

```ts
import type { PlatformId, PlatformMeta } from '@/types'

export const PLATFORMS: Record<PlatformId, PlatformMeta> = {
  x:         { id: 'x',         label: 'X',         color: '#0F1419', maxChars: 280,   maxMedia: 4,  requiresMedia: false },
  linkedin:  { id: 'linkedin',  label: 'LinkedIn',  color: '#0A66C2', maxChars: 3000,  maxMedia: 9,  requiresMedia: false },
  instagram: { id: 'instagram', label: 'Instagram', color: '#E1306C', maxChars: 2200,  maxMedia: 10, requiresMedia: true  },
  facebook:  { id: 'facebook',  label: 'Facebook',  color: '#1877F2', maxChars: 63206, maxMedia: 10, requiresMedia: false },
  threads:   { id: 'threads',   label: 'Threads',   color: '#101010', maxChars: 500,   maxMedia: 10, requiresMedia: false },
}

export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[]
export const APP_MAX_MEDIA_PER_POST = 4
export const MAX_SCHEDULE_AHEAD_DAYS = 365
export const MIN_SCHEDULE_LEAD_MS = 60_000
export const MAX_STORED_MEDIA_BYTES = 450_000 // 450 KB payload max for LocalStorage safety
export const MAX_MEDIA_ASSETS_TOTAL = 8        // Prevents LocalStorage QuotaExceeded crash
```

Effective media cap in the composer = `min(APP_MAX_MEDIA_PER_POST, min(maxMedia of selected platforms))`.
Effective char cap = **the minimum `maxChars` among selected channels** (counter shows the strictest channel and names it).

---

## 3. Data Schema & Pure TypeScript Interfaces (`src/types/index.ts`)

```ts
export type ISODateString = string // always UTC, e.g. 2026-10-02T08:30:00.000Z
export type PlatformId = 'x' | 'linkedin' | 'instagram' | 'facebook' | 'threads'
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed'
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = Sunday
export type ThemePreference = 'system' | 'light' | 'dark'
export type TimeFormat = '12h' | '24h'
export type ScheduleMode = 'now' | 'schedule' | 'queue' | 'draft'
export type FailureCode =
  | 'ACCOUNT_DISCONNECTED' | 'CONTENT_INVALID' | 'RATE_LIMITED' | 'MISSED' | 'MEDIA_MISSING'

export interface PlatformMeta {
  id: PlatformId
  label: string
  color: string
  maxChars: number
  maxMedia: number
  requiresMedia: boolean
}

export interface BaseEntity {
  id: string
  createdAt: ISODateString
  updatedAt: ISODateString
}

export interface SocialAccount extends BaseEntity {
  platform: PlatformId
  handle: string          // without leading @, 2–30 chars [A-Za-z0-9._]
  displayName: string     // 1–40 chars
  avatarHue: number       // 0–359, generated avatar color
  connected: boolean
}

export interface QueueSlot extends BaseEntity {
  accountId: string
  weekday: Weekday
  time: string            // 'HH:mm' 24h, in the user's timezone
}

export interface MediaAsset extends BaseEntity {
  name: string
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  width: number
  height: number
  bytes: number           // size of stored (compressed) payload
  dataUrl: string         // compressed data URL
}

export interface PostMetrics {
  impressions: number
  likes: number
  comments: number
  shares: number
  clicks: number
}

export interface PostFailure {
  code: FailureCode
  message: string
  at: ISODateString
}

export interface Post extends BaseEntity {
  groupId: string                 // posts created together share a groupId
  accountId: string
  content: string
  mediaIds: string[]
  status: PostStatus
  scheduledAt: ISODateString | null   // null only for drafts
  publishedAt: ISODateString | null
  source: 'manual' | 'queue'
  attempts: number                // publish attempts so far
  nextRetryAt: ISODateString | null
  failure: PostFailure | null
  metrics: PostMetrics | null     // only when published
}

export interface AppSettings {
  timezone: string                // IANA, default Intl.DateTimeFormat().resolvedOptions().timeZone
  timeFormat: TimeFormat          // default '12h'
  weekStartsOn: 0 | 1             // default 1
  theme: ThemePreference          // default 'system'
  simulateFailures: boolean       // default false
  calendarView: 'month' | 'week' | 'agenda' // default 'month' (mobile forces 'agenda' unless user chose otherwise)
}

export type ActivityType =
  | 'created' | 'scheduled' | 'rescheduled' | 'published' | 'failed' | 'retried' | 'deleted' | 'duplicated'

export interface ActivityEntry {
  id: string
  postId: string | null
  type: ActivityType
  message: string
  at: ISODateString
}

export interface ComposerDraft {      // transient autosave, not an entity
  content: string
  accountIds: string[]
  mediaIds: string[]
  mode: ScheduleMode
  date: string                       // 'yyyy-MM-dd' in user tz or ''
  time: string                       // 'HH:mm' or ''
  editingPostId: string | null
  savedAt: ISODateString
}

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E }
export interface FieldErrors { [field: string]: string | undefined }
```

### 3.1 Validation Rules (enforced by `src/lib/validation.ts`, used by composer + store actions + hydration)

| Field | Rule |
|---|---|
| `id` | non-empty string |
| `createdAt/updatedAt/scheduledAt/publishedAt/nextRetryAt` | parseable ISO; `updatedAt >= createdAt` |
| `Account.handle` | `/^[A-Za-z0-9._]{2,30}$/`; unique per platform (case-insensitive) |
| `Account.displayName` | trimmed, 1–40 chars |
| `Post.content` | trimmed length ≤ strictest platform limit; if no media, length ≥ 1 |
| `Post.mediaIds` | ≤ effective media cap; every id must exist in media store at schedule time |
| Instagram | requires ≥ 1 media |
| `Post.scheduledAt` | for `scheduled`: ≥ now + 60 s and ≤ now + 365 days (checked at create/reschedule only, not on hydrate) |
| `Post.status` transitions | `draft→scheduled`, `scheduled→draft`, `scheduled→publishing`, `publishing→published|failed`, `failed→scheduled` (retry), `published` is terminal (editable? **no**; only duplicate/delete) |
| `QueueSlot.time` | `/^([01]\d|2[0-3]):[0-5]\d$/`; unique (accountId, weekday, time); max 14 slots per account |
| Media file | mime in allowed list; raw ≤ 10 MB; stored payload ≤ 700 KB after compression; ≤ 200 assets total |
| `Settings.timezone` | must be accepted by `Intl.DateTimeFormat(undefined,{timeZone})` |

Hydration rule: each persisted array is parsed with zod; **invalid records are dropped individually** (not the whole array) and counted; if any dropped, a one-time toast "N corrupted items were removed".

### 3.2 Storage Keys (`src/lib/storage.ts`)

| Key | Content | Version const |
|---|---|---|
| `vpss:accounts` | `SocialAccount[]` | `1` |
| `vpss:slots` | `QueueSlot[]` | `1` |
| `vpss:posts` | `Post[]` | `1` |
| `vpss:media` | `MediaAsset[]` | `1` |
| `vpss:settings` | `AppSettings` | `1` |
| `vpss:activity` | `ActivityEntry[]` (cap 200, newest first) | `1` |
| `vpss:composer-draft` | `ComposerDraft` | `1` |
| `vpss:scheduler-lease` | `{ tabId, expiresAt }` fallback lease | `1` |
| `vpss:onboarding` | `{ dismissed: boolean }` | `1` |

Envelope: `{ v: number, data: T }`. On version mismatch, run `migrations[key][fromVersion]` chain; if no migration exists, back up raw string to `vpss:backup:<key>:<timestamp>` (max 3 backups kept) and fall back to defaults.

```ts
// src/lib/storage.ts
import type { Result } from '@/types'

export interface Envelope<T> { v: number; data: T }
export type Migration = (data: unknown) => unknown
export const NS = 'vpss:'

function hasStorage(): boolean {
  try {
    const k = `${NS}__probe`
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}
export const storageAvailable = hasStorage()

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
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.v !== 'number') throw new Error('bad envelope')
    let data = parsed.data
    let v = parsed.v
    if (v > version) throw new Error('future version')
    while (v < version) {
      const step = migrations[v]
      if (!step) throw new Error(`no migration from ${v}`)
      data = step(data)
      v += 1
    }
    return data as T
  } catch {
    backupRaw(key, raw)
    return fallback
  }
}

export function writeEnvelope<T>(key: string, version: number, data: T): Result<true, 'quota' | 'unavailable' | 'unknown'> {
  if (!storageAvailable) return { ok: false, error: 'unavailable' }
  try {
    window.localStorage.setItem(key, JSON.stringify({ v: version, data } satisfies Envelope<T>))
    return { ok: true, value: true }
  } catch (e) {
    const isQuota =
      e instanceof DOMException &&
      (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014)
    return { ok: false, error: isQuota ? 'quota' : 'unknown' }
  }
}

export function removeKey(key: string): void {
  if (storageAvailable) window.localStorage.removeItem(key)
}

function backupRaw(key: string, raw: string): void {
  try {
    window.localStorage.setItem(`${NS}backup:${key.replace(NS, '')}:${Date.now()}`, raw)
    const backups = Object.keys(window.localStorage)
      .filter((k) => k.startsWith(`${NS}backup:`))
      .sort()
    while (backups.length > 3) {
      const oldest = backups.shift()
      if (oldest) window.localStorage.removeItem(oldest)
    }
  } catch {
    /* backup is best-effort; failing to back up must never break boot */
  }
}
```

If `storageAvailable === false` (private mode/blocked), the app runs fully in memory and shows a persistent, dismissible banner: "Storage is unavailable — your changes will be lost when you close this tab."

### 3.3 Pinia Persistence Plugin (`src/stores/persistencePlugin.ts`)

Custom store option: `persist: { key, version, debounceMs?, onQuotaError? }` and a store-defined `hydrate(raw)` / `serialize()` pair, declared via `defineStore` options returning `persistApi`.

```ts
import type { PiniaPluginContext } from 'pinia'
import { readEnvelope, writeEnvelope } from '@/lib/storage'
import { debounce } from '@/lib/utils'

export interface PersistApi<T> {
  key: string
  version: number
  debounceMs?: number
  read: () => T                    // returns the store slice to persist
  apply: (data: T) => void         // applies an already-validated slice into the store
  parse: (raw: unknown) => { data: T; dropped: number }  // zod-validated parse
  fallback: T
  migrations?: Record<number, (d: unknown) => unknown>
  onWriteError?: (reason: 'quota' | 'unavailable' | 'unknown') => void
}

import type { Ref } from 'vue'

declare module 'pinia' {
  export interface PiniaCustomProperties {
    persistApi?: PersistApi<unknown>
    droppedCount?: Ref<number>
  }
}

export function persistencePlugin({ store }: PiniaPluginContext): void {
  const api = (store as unknown as { persistApi?: PersistApi<unknown> }).persistApi
  if (!api) return

  let applyingExternal = false
  const raw = readEnvelope<unknown>(api.key, api.version, api.fallback, api.migrations)
  const { data, dropped } = api.parse(raw)
  api.apply(data)
  if (dropped > 0) store.$state // no-op access to keep the store active; the UI store listens to `droppedCount`
  ;(store as unknown as { droppedCount?: { value: number } }).droppedCount && ((store as unknown as { droppedCount: { value: number } }).droppedCount.value = dropped)

  const flush = () => {
    if (applyingExternal) return
    const res = writeEnvelope(api.key, api.version, api.read())
    if (!res.ok) api.onWriteError?.(res.error)
  }
  const debounced = debounce(flush, api.debounceMs ?? 150)
  store.$subscribe(() => debounced(), { detached: true, flush: 'post' })
  window.addEventListener('pagehide', flush)

  // cross-tab sync
  window.addEventListener('storage', (e) => {
    if (e.key !== api.key || e.newValue === null) return
    const fresh = readEnvelope<unknown>(api.key, api.version, api.fallback, api.migrations)
    applyingExternal = true
    api.apply(api.parse(fresh).data)
    setTimeout(() => { applyingExternal = false }, 200)
  })
}
```

> Agent note: stores expose `persistApi` and optional `droppedCount` by returning them from the setup function. Keep the plugin typed without `any`; the module augmentation above is a sentinel that the agent must replace with a properly typed `PiniaCustomProperties` augmentation (`persistApi?: PersistApi<unknown>`, `droppedCount?: Ref<number>`) so the casts disappear.

---

## 4. Folder Architecture

```
src/
├─ main.ts
├─ App.vue
├─ router/index.ts
├─ assets/main.css                     # Tailwind import + @theme tokens + base layer
├─ types/index.ts
├─ lib/
│  ├─ storage.ts  platforms.ts  datetime.ts  validation.ts  schemas.ts
│  ├─ queue.ts    scheduler.ts  publisher.ts  media.ts  seed.ts  utils.ts
│  └─ __tests__/
├─ stores/
│  ├─ persistencePlugin.ts
│  ├─ useSettingsStore.ts  useAccountsStore.ts  useSlotsStore.ts
│  ├─ useMediaStore.ts     usePostsStore.ts     useActivityStore.ts
│  ├─ useSchedulerStore.ts useUiStore.ts
├─ composables/
│  ├─ useBreakpoint.ts  useNow.ts  useTheme.ts  useComposerForm.ts
│  ├─ useMediaUpload.ts useDragReschedule.ts  useFocusTrap.ts  useBodyScrollLock.ts
│  ├─ usePostGroups.ts  useCalendarGrid.ts    useConfirm.ts
├─ components/
│  ├─ ui/            # Phase 2 primitives (Base*)
│  ├─ shell/         # AppShell, SidebarNav, BottomNav, TopBar, RightRail, MoreSheet
│  ├─ posts/         # PostCard, PostStatusBadge, PostActionsMenu, PostMetricsRow, MediaGrid
│  ├─ composer/      # ComposerSheet, AccountPicker, ComposerEditor, MediaUploader, PlatformPreview, ScheduleControls, CharCounter
│  ├─ timeline/      # TimelineDayGroup, TimelineFilters, TimelineList
│  ├─ calendar/      # CalendarToolbar, MonthGrid, WeekGrid, AgendaList, CalendarPostChip, DayCell
│  ├─ queue/         # SlotEditor, WeekdaySlotRow, UpcomingQueueList
│  ├─ accounts/      # ChannelCard, ConnectChannelForm, PlatformIcon
│  └─ dashboard/     # StatCard, NextUpCard, OnboardingCard
├─ pages/
│  ├─ DashboardPage.vue  CalendarPage.vue  QueuePage.vue
│  ├─ LibraryPage.vue    ChannelsPage.vue  SettingsPage.vue  NotFoundPage.vue
```

Path alias `@` → `src`. Routes are lazy-loaded (`() => import(...)`), each wrapped in `<Suspense>` with `PageSkeleton` fallback.

---

## 5. Design Foundation — Buffer/Hootsuite Card Timeline

### 5.1 Tokens (`src/assets/main.css`, Tailwind CSS-first `@theme`)

```css
@import "tailwindcss";
@import "@fontsource-variable/inter";

@variant dark (&:where(.dark, :is(.dark *)));

@theme {
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;

  --color-brand-50:  oklch(0.97 0.02 265);
  --color-brand-100: oklch(0.93 0.04 265);
  --color-brand-500: oklch(0.58 0.19 265);
  --color-brand-600: oklch(0.52 0.20 265);
  --color-brand-700: oklch(0.46 0.19 265);

  --color-canvas:        oklch(0.97 0.005 260);   /* app background */
  --color-surface:       oklch(1 0 0);            /* cards */
  --color-surface-muted: oklch(0.96 0.006 260);
  --color-line:          oklch(0.91 0.008 260);
  --color-ink:           oklch(0.22 0.02 260);
  --color-ink-muted:     oklch(0.50 0.02 260);

  --color-ok:      oklch(0.62 0.15 150);
  --color-warn:    oklch(0.76 0.15 75);
  --color-danger:  oklch(0.58 0.21 25);
  --color-info:    oklch(0.62 0.14 235);

  --radius-card: 1rem;
  --shadow-card: 0 1px 2px oklch(0.2 0.02 260 / 0.06), 0 4px 16px oklch(0.2 0.02 260 / 0.05);
  --shadow-pop:  0 10px 40px oklch(0.2 0.02 260 / 0.18);

  --ease-snap: cubic-bezier(0.2, 0.8, 0.2, 1);
}

:root.dark {
  --color-canvas: oklch(0.17 0.01 260);
  --color-surface: oklch(0.21 0.012 260);
  --color-surface-muted: oklch(0.25 0.012 260);
  --color-line: oklch(0.31 0.012 260);
  --color-ink: oklch(0.96 0.005 260);
  --color-ink-muted: oklch(0.72 0.01 260);
}

@layer base {
  html { color-scheme: light; -webkit-tap-highlight-color: transparent; }
  html.dark { color-scheme: dark; }
  body { @apply bg-canvas text-ink font-sans antialiased; min-height: 100dvh; }
  :focus-visible { outline: 2px solid var(--color-brand-500); outline-offset: 2px; }
}
```

### 5.2 Visual Language

* App background `canvas`; **cards** `bg-surface rounded-[--radius-card] shadow-card border border-line`.
* Post card anatomy (Buffer-like): left avatar + platform glyph badge; header (display name, `@handle`, relative time chip); body (content, 6-line clamp with explicit **"Show more"** button); media grid (1–4 images, 16:9 / 1:1 / 2×2 layouts); footer (status badge, metrics row if published, action buttons — always visible, kebab for secondary).
* Timeline: sticky day headers (`Today`, `Tomorrow`, `Fri, Oct 9`) with a vertical rail dot + 1 px line on ≥ 768 px; plain stacked cards on mobile.
* Status colors: draft = `ink-muted`, scheduled = `info`, publishing = `warn` (animated spinner, `motion-safe:`), published = `ok`, failed = `danger`.
* Platform accent: 3 px left border on `PostCard` using `PLATFORMS[platform].color`.
* Dark mode via `.dark` class on `<html>` (`useTheme` resolves `system` with `matchMedia`).

### 5.3 Responsive Contract (mandatory validation matrix)

| Viewport | Layout | Must verify |
|---|---|---|
| **360 px** | Single column, bottom nav (5 slots), composer = full-screen sheet, calendar = Agenda w/ week strip | No horizontal scroll; account chips scroll horizontally; 44 px targets; text not truncated in nav (labels ≤ 9 chars) |
| **390 px** | Same as 360 | Safe-area insets (`env(safe-area-inset-bottom)`) on bottom nav + composer footer |
| **430 px** | Same, wider cards, 2-col stat grid | Stat cards 2×2; post media grid keeps aspect ratio |
| **768 px** | Collapsed icon rail (72 px) + content; composer = centered modal (max-w-2xl); calendar Month available | Composer preview next to editor in 2 columns; month cells show ≤ 2 chips + "+N more" **button** |
| **1024 px+** | Sidebar 264 px + content; ≥ 1280 px adds right rail "Next up" | Month/Week views; drag-reschedule enabled alongside menu action |

Breakpoints via `useBreakpoint()` (VueUse `useBreakpoints` with `sm=640, md=768, lg=1024, xl=1280`) exposing `isMobile (<768)`, `isTablet (768–1023)`, `isDesktop (≥1024)`.
Hover rule: any hover-revealed UI must have an always-visible equivalent (kebab, button, or tap target).

---

## 6. Component Architecture

### 6.1 UI Primitives (`components/ui`, Phase 2) — stateless, props/emits only

| Component | Props (key) | Emits / Model | Notes |
|---|---|---|---|
| `BaseButton` | `variant: 'primary'\|'secondary'\|'ghost'\|'danger'`, `size: 'sm'\|'md'\|'lg'`, `loading`, `block`, `type` | `click` | `min-h-11`; spinner replaces label width-stably |
| `BaseIconButton` | `label` (required, aria), `icon`, `variant`, `size` | `click` | 44×44 |
| `BaseInput` | `label`, `error`, `hint`, `type`, `maxlength` | `v-model` | label always visible (no placeholder-as-label) |
| `BaseTextarea` | `label`, `error`, `rows`, `autoGrow` | `v-model` | autosize via `scrollHeight` |
| `BaseSelect` | `label`, `options: {value,label}[]`, `error` | `v-model` | native `<select>` styled |
| `BaseSwitch` | `label`, `description` | `v-model` | `role="switch"` |
| `BaseCheckbox` | `label` | `v-model` | |
| `BaseSegmented` | `options`, `ariaLabel` | `v-model` | radiogroup semantics, arrow keys |
| `BaseBadge` | `tone: 'neutral'\|'info'\|'ok'\|'warn'\|'danger'\|'brand'` | – | |
| `BaseAvatar` | `name`, `hue`, `size` | – | initials on `hsl(hue 70% 45%)` |
| `BaseCard` | `as`, `padding`, `interactive` | – | |
| `BaseModal` | `open`, `title`, `size` | `update:open`, `closed` | Teleport, focus trap, ESC, scroll lock, `aria-modal` |
| `BaseSheet` | `open`, `title`, `side: 'bottom'\|'full'` | `update:open` | mobile bottom/full-screen sheet; swipe-down-to-close is **additive**, close button always present |
| `BaseMenu` | `items: {id,label,icon?,tone?,disabled?}[]`, `label` | `select(id)` | click/tap to open, keyboard nav, closes on outside tap |
| `BaseToastHost` | – (reads `useUiStore`) | – | stack bottom-center mobile / bottom-right desktop; action button support (Undo) |
| `BaseTabs` | `tabs`, `ariaLabel` | `v-model` | scrollable on mobile |
| `BaseSkeleton` | `variant: 'text'\|'card'\|'circle'` | – | |
| `BaseEmptyState` | `icon`, `title`, `description` | slot `action` | |
| `BaseSpinner` | `size` | – | |
| `BaseProgressRing` | `value`, `max`, `tone` | – | used by `CharCounter` |
| `BaseBanner` | `tone`, `dismissible` | `dismiss` | |

### 6.2 Compound Components & Features (Phase 3)

| Component | Responsibility | Inputs → Outputs |
|---|---|---|
| `PlatformIcon` | SVG glyph per platform (inline, no remote assets) | `platform`, `size` |
| `PostStatusBadge` | status → tone + icon + label | `status` |
| `MediaGrid` | 1–4 image layout with aspect handling, tap opens `MediaLightbox` modal | `mediaIds` |
| `PostMetricsRow` | impressions/likes/comments/shares formatted (`Intl.NumberFormat` compact) | `metrics` |
| `PostActionsMenu` | actions per status (see matrix below) | `post` → emits action id |
| `PostCard` | full card anatomy | `post`, `compact?` → `action(postId, actionId)` |
| `AccountPicker` | horizontally scrollable avatar chips, multi-select, disabled state for disconnected | `v-model: string[]` |
| `CharCounter` | ring + remaining count, danger when negative | `used`, `limit`, `limitedBy` |
| `ComposerEditor` | textarea + counter + emoji-free toolbar (hashtag insert `#`, mention `@` buttons) + media uploader | `v-model` |
| `MediaUploader` | file input (`accept`, `multiple`), drag-drop zone on desktop, **"Add photos" button always**, thumbnails with remove button | `v-model: string[]` |
| `PlatformPreview` | tabbed per selected channel mock (avatar, name, content with truncation rule, media) | `content`, `mediaIds`, `accounts` |
| `ScheduleControls` | `BaseSegmented` for mode + date/time inputs (`type="date"`, `type="time"`) + resolved-time summary ("Fri, Oct 9 · 9:30 AM (Asia/Jakarta)") + next-queue-slot preview | `v-model` form |
| `ComposerSheet` | orchestrates the form; modal ≥ 768, full sheet < 768; autosave; confirm-discard | store-driven |
| `TimelineFilters` | account chip filter + status segmented | `v-model` |
| `TimelineDayGroup` | sticky header + cards | `dayKey`, `posts` |
| `StatCard` | label, value, delta caption, icon | |
| `NextUpCard` | next scheduled post countdown (`useNow`) | |
| `OnboardingCard` | first-run: "Connect channel / Load demo data / Dismiss" | |
| `ChannelCard` | account row with status badge, connect/disconnect, edit name, remove | |
| `ConnectChannelForm` | platform select + handle + display name | |
| `SlotEditor` | per-account weekly grid: 7 `WeekdaySlotRow`s; stacked flex layout for <640px (header with add-input on top, chips wrapping below) to prevent horizontal blowouts | |
| `UpcomingQueueList` | next 10 scheduled `source:'queue'` posts per account | |
| `CalendarToolbar` | prev/next/today buttons, view segmented, title | |
| `MonthGrid` / `WeekGrid` / `AgendaList` | views; `DayCell` is tap target opening a day sheet ("N posts" + "Add post on this day") | |
| `CalendarPostChip` | compact post chip: time, platform dot, 1-line text; draggable (pointer) | |
| `ConfirmDialog` | promise-based via `useConfirm()` | |

#### Post Action Matrix

| Status | Actions (always reachable via visible button or kebab) |
|---|---|
| `draft` | Edit · Schedule… · Add to queue · Duplicate · Delete |
| `scheduled` | Edit · Reschedule… · Publish now · Move to drafts · Duplicate · Delete |
| `publishing` | (none; spinner, disabled kebab) |
| `published` | Duplicate · Delete |
| `failed` | Retry · Edit · Reschedule… · Duplicate · Delete (failure message shown inline on card) |

---

## 7. Pinia Stores (Phase 4) — setup stores, single responsibility

### 7.1 `useSettingsStore`
State: `settings: AppSettings`. Getters: `tz`, `is24h`. Actions: `update(patch)` (validates timezone; invalid → ignored + returns error), `resetToDefaults()`. Side-effect watchers live in `useTheme` (adds/removes `dark` class).

### 7.2 `useAccountsStore`
State: `accounts: SocialAccount[]`. Getters: `byId: Map`, `connected`, `forPlatform(p)`. Actions:
* `add(input)` → validates (handle unique per platform) → `Result<SocialAccount>`.
* `rename(id, displayName)`, `setConnected(id, boolean)`.
* `remove(id)` → cascades: delete account's `slots` (slots store), delete account's posts (posts store, excluding nothing), run media GC; returns counts so the UI can toast "Removed @handle and 3 posts" with **Undo** (snapshot held in UI store for 8 s).

### 7.3 `useSlotsStore`
State: `slots: QueueSlot[]`. Actions: `add(accountId, weekday, time)` (validates uniqueness + max 14), `remove(id)`, `forAccount(accountId)` (sorted weekday asc, time asc), `copyToAll(accountId)` (replace other accounts' slots with this account's pattern — confirmation required), `seedDefault(accountId)` (Mon–Fri 09:00 & 17:00).

### 7.4 `useMediaStore`
State: `assets: MediaAsset[]`. Actions: `addFiles(files: File[])` → uses `lib/media.ts` → `Result<MediaAsset>[]`; `remove(id)`; `gc(referencedIds: Set<string>)`. Getter: `byId`, `totalBytes`. Writes can hit quota → `onWriteError('quota')` → toast "Storage is full. Remove media or old posts." and the **last add is rolled back** (store keeps `lastAddedIds` for rollback).

### 7.5 `usePostsStore`
State: `posts: Post[]`. Getters (all `computed`, memoized):
* `byId: Map<string, Post>`
* `byDay: Map<'yyyy-MM-dd' (user tz), Post[]>` sorted by `scheduledAt`
* `scheduled`, `drafts`, `published`, `failed`
* `nextUp: Post | null`
* `counts: { scheduled, publishedThisWeek, failed, drafts }`

Actions (each appends an `ActivityEntry` and returns `Result`):
* `createGroup(form: ComposerFormValue)` → creates one `Post` per account (same `groupId`); mode handling:
  * `draft` → `status:'draft', scheduledAt: null`
  * `schedule` → `status:'scheduled'`, `scheduledAt = zonedToUtc(date,time,tz)`
  * `queue` → per account `computeNextSlot(...)` (accounts without slots → error "No posting times for @handle" and that account is skipped; others proceed; result lists skipped accounts); successive queue picks for multiple posts must consider already-assigned minutes (uses live store state, so sequential inserts are safe)
  * `now` → `status:'scheduled', scheduledAt = now` then calls `schedulerStore.tick()` immediately
* `update(id, patch)` (only for `draft|scheduled|failed`), `reschedule(id, isoUtc)` (validates lead time; resets `failure`, `attempts` stays, `status:'scheduled'`), `moveToDraft(id)`, `duplicate(id)` (→ draft copy, `source:'manual'`, same media), `remove(id)` (with 8 s undo snapshot), `retry(id)` (→ `scheduled` at now + 5 s, `failure:null`, `nextRetryAt:null`), `markPublishing/markPublished/markFailed` (used only by scheduler).
* `replaceFromStorage()` (re-hydrate from `localStorage` right before the engine mutates — see §9).

### 7.6 `useActivityStore`
`entries` capped at 200 (`unshift` + `slice`). `log(type, message, postId?)`. Used for the "Recent activity" list on Dashboard (last 8).

### 7.7 `useSchedulerStore`
State: `running`, `lastTickAt`, `tabId` (`newId()`), `isPublishingIds: Set<string>`. Actions: `start()`, `stop()`, `tick()`. Detailed in §9.

### 7.8 `useUiStore` (not persisted)
State: `composer: { open: boolean; editingPostId: string | null; presetDate?: string; presetAccountIds?: string[] }`, `toasts: Toast[]`, `moreSheetOpen`, `storageBannerDismissed`. Actions: `openComposer(opts?)`, `closeComposer()`, `toast({tone,message,actionLabel?,onAction?,durationMs?=5000})`, `dismissToast(id)`.

---

## 8. Core Feature Logic

### 8.1 Date/Time Utilities (`src/lib/datetime.ts`)

```ts
import { TZDate } from '@date-fns/tz'
import { addDays, format, isSameDay, startOfDay } from 'date-fns'

export function zonedToUtcIso(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const z = new TZDate(y, m - 1, d, hh, mm, 0, tz)
  return new Date(z.getTime()).toISOString()
}

export function utcIsoToZonedParts(iso: string, tz: string): { date: string; time: string } {
  const z = new TZDate(new Date(iso), tz)
  return { date: format(z, 'yyyy-MM-dd'), time: format(z, 'HH:mm') }
}

export function dayKey(iso: string, tz: string): string {
  return format(new TZDate(new Date(iso), tz), 'yyyy-MM-dd')
}

export function formatTime(iso: string, tz: string, is24h: boolean): string {
  return format(new TZDate(new Date(iso), tz), is24h ? 'HH:mm' : 'h:mm a')
}

export function formatDayLabel(key: string, tz: string, now: Date): string {
  const [y, m, d] = key.split('-').map(Number)
  const day = new TZDate(y, m - 1, d, 0, 0, 0, tz)
  const today = startOfDay(new TZDate(now, tz))
  if (isSameDay(day, today)) return 'Today'
  if (isSameDay(day, addDays(today, 1))) return 'Tomorrow'
  if (isSameDay(day, addDays(today, -1))) return 'Yesterday'
  return format(day, 'EEE, MMM d')
}

export function relativeTime(iso: string, now: Date): string {
  const diffMs = new Date(iso).getTime() - now.getTime()
  const abs = Math.abs(diffMs)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const mins = Math.round(diffMs / 60_000)
  if (abs < 3_600_000) return rtf.format(mins, 'minute')
  const hours = Math.round(diffMs / 3_600_000)
  if (abs < 86_400_000) return rtf.format(hours, 'hour')
  return rtf.format(Math.round(diffMs / 86_400_000), 'day')
}

export function isValidTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat(undefined, { timeZone: tz }); return true } catch { return false }
}
```

DST rule: if a chosen local time does not exist (spring-forward gap) `TZDate` normalizes forward; the composer shows the **resolved** time in `ScheduleControls` before submit so the user sees the result.

### 8.2 Validation (`src/lib/validation.ts`)

```ts
import { APP_MAX_MEDIA_PER_POST, MAX_SCHEDULE_AHEAD_DAYS, MIN_SCHEDULE_LEAD_MS, PLATFORMS } from '@/lib/platforms'
import type { FieldErrors, PlatformId, ScheduleMode, SocialAccount } from '@/types'

export interface ComposerValidationInput {
  content: string
  accounts: SocialAccount[]        // selected accounts
  mediaCount: number
  mode: ScheduleMode
  scheduledAtIso: string | null    // resolved UTC for 'schedule'
  now: Date
  hasSlotsFor: (accountId: string) => boolean
}

export function strictestLimit(platforms: PlatformId[]): { limit: number; by: PlatformId } | null {
  if (platforms.length === 0) return null
  return platforms.reduce<{ limit: number; by: PlatformId }>(
    (acc, p) => (PLATFORMS[p].maxChars < acc.limit ? { limit: PLATFORMS[p].maxChars, by: p } : acc),
    { limit: PLATFORMS[platforms[0]].maxChars, by: platforms[0] },
  )
}

export function effectiveMediaCap(platforms: PlatformId[]): number {
  return platforms.reduce((cap, p) => Math.min(cap, PLATFORMS[p].maxMedia), APP_MAX_MEDIA_PER_POST)
}

export function validateComposer(i: ComposerValidationInput): FieldErrors {
  const errors: FieldErrors = {}
  const text = i.content.trim()
  const platforms = i.accounts.map((a) => a.platform)
  const lim = strictestLimit(platforms)

  if (i.mode !== 'draft' && i.accounts.length === 0) errors.accounts = 'Select at least one channel.'
  if (i.mode !== 'draft' && i.accounts.some((a) => !a.connected)) errors.accounts = 'A selected channel is disconnected.'
  if (text.length === 0 && i.mediaCount === 0) errors.content = 'Write something or add media.'
  if (lim && text.length > lim.limit) errors.content = `Too long for ${PLATFORMS[lim.by].label} (${text.length}/${lim.limit}).`
  if (i.mediaCount > effectiveMediaCap(platforms)) errors.media = `Too many media for the selected channels (max ${effectiveMediaCap(platforms)}).`
  if (i.mode !== 'draft' && platforms.includes('instagram') && i.mediaCount === 0) errors.media = 'Instagram posts need at least one image.'

  if (i.mode === 'schedule') {
    if (!i.scheduledAtIso) errors.schedule = 'Pick a date and time.'
    else {
      const t = new Date(i.scheduledAtIso).getTime()
      if (Number.isNaN(t)) errors.schedule = 'Invalid date or time.'
      else if (t < i.now.getTime() + MIN_SCHEDULE_LEAD_MS) errors.schedule = 'Pick a time at least 1 minute from now.'
      else if (t > i.now.getTime() + MAX_SCHEDULE_AHEAD_DAYS * 86_400_000) errors.schedule = 'Scheduling is limited to 1 year ahead.'
    }
  }
  if (i.mode === 'queue') {
    const missing = i.accounts.filter((a) => !i.hasSlotsFor(a.id))
    if (missing.length > 0) errors.schedule = `Add posting times first for: ${missing.map((m) => '@' + m.handle).join(', ')}.`
  }
  return errors
}
```

Zod schemas in `src/lib/schemas.ts` mirror §3 interfaces 1:1 (`PostSchema`, `SocialAccountSchema`, `QueueSlotSchema`, `MediaAssetSchema`, `AppSettingsSchema`, `ActivityEntrySchema`, `ComposerDraftSchema`) and expose `parseArray(schema, raw): { data: T[]; dropped: number }` using `safeParse` per element, plus compile-time assertions (`satisfies z.ZodType<Post>`) that the schema and interface stay in sync.

### 8.3 Queue Slot Algorithm (`src/lib/queue.ts`)

```ts
import { TZDate } from '@date-fns/tz'
import { addDays } from 'date-fns'
import type { Post, QueueSlot } from '@/types'

const LEAD_MS = 60_000
const HORIZON_DAYS = 60

const minuteKey = (iso: string) => iso.slice(0, 16)

/** Returns the next free UTC ISO instant for an account's weekly slots, or null if the account has no slots. */
export function computeNextSlot(
  accountId: string,
  slots: QueueSlot[],
  posts: Post[],
  now: Date,
  tz: string,
): string | null {
  const mine = slots.filter((s) => s.accountId === accountId)
  if (mine.length === 0) return null

  const taken = new Set(
    posts
      .filter((p) => p.accountId === accountId && p.scheduledAt && (p.status === 'scheduled' || p.status === 'publishing'))
      .map((p) => minuteKey(p.scheduledAt as string)),
  )
  const earliest = now.getTime() + LEAD_MS
  const base = new TZDate(now, tz)

  for (let offset = 0; offset <= HORIZON_DAYS; offset += 1) {
    const day = addDays(base, offset)
    const todays = mine
      .filter((s) => s.weekday === day.getDay())
      .sort((a, b) => a.time.localeCompare(b.time))
    for (const s of todays) {
      const [hh, mm] = s.time.split(':').map(Number)
      const at = new TZDate(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm, 0, tz)
      const ms = at.getTime()
      if (ms < earliest) continue
      const iso = new Date(ms).toISOString()
      if (taken.has(minuteKey(iso))) continue
      return iso
    }
  }
  return null
}
```

Edge cases: all slots taken for 60 days → `null` → treated as "No free queue slot in the next 60 days." error.

### 8.4 Media Pipeline (`src/lib/media.ts`)

Algorithm `processImage(file): Promise<Result<Omit<MediaAsset,'id'|'createdAt'|'updatedAt'>>>`:
1. Reject if mime ∉ allowed list → `"Unsupported file type"`; reject if `file.size > 10 MB` → `"File is larger than 10 MB"`.
2. GIF: if `file.size ≤ 700 KB` keep as-is (read via `FileReader.readAsDataURL`), else reject `"GIF is too large (max 700 KB)"`.
3. Others: `createImageBitmap(file)` → scale so `max(width,height) ≤ 1600` → draw onto `OffscreenCanvas` (fallback `document.createElement('canvas')`) → `toBlob('image/jpeg', q)` for `q` in `[0.82, 0.7, 0.6, 0.5]` until blob ≤ 700 KB; if still too large reduce max dimension by 0.75 and repeat (max 3 loops) else reject `"Image could not be compressed enough"`. (PNG with transparency is flattened onto white.)
4. Convert blob → data URL, return `{ name, mime:'image/jpeg', width, height, bytes: blob.size, dataUrl }`.
5. Check store total: if `assets.length ≥ 200` reject `"Media library is full (200 items)"`.

`useMediaUpload()` exposes `uploading: Ref<number>`, `errors: Ref<string[]>`, `upload(files: FileList | File[])`; processes sequentially to bound memory; per-file errors collected and toasted once.

### 8.5 Composer Form (`useComposerForm`)

State: `content`, `accountIds`, `mediaIds`, `mode`, `date`, `time`, `editingPostId`. Derived: `selectedAccounts`, `limit` (strictest), `used`, `mediaCap`, `scheduledAtIso`, `errors` (live via `validateComposer`, but **displayed** only after first submit attempt or field blur), `isDirty`, `canSubmit`, `queuePreview` (Map accountId → next slot ISO).

Flow:
1. **Open (new):** restore `vpss:composer-draft` if present and `savedAt` < 7 days (show banner "Restored your unsaved draft · Discard"); else defaults: mode `schedule`, date = today (user tz), time = next full hour + 1 h, `accountIds` = presets or the single connected account if exactly one.
2. **Open (edit):** hydrate from post (single account locked; mode `schedule` if scheduled, `draft` if draft; failed → `schedule`).
3. **Autosave:** watch (debounce 400 ms) → `writeEnvelope('vpss:composer-draft')`; cleared on successful submit or explicit discard.
4. **Submit:** run `validateComposer`; on error focus first invalid field (`scrollIntoView({block:'center'})`) and show errors; else call `postsStore.createGroup` (or `update` when editing); on success toast with action (`Undo` for create within 8 s → `removeGroup(groupId)`), close composer, clear draft.
5. **Close with dirty state:** `ConfirmDialog` "Discard changes?" with **Save as draft** / **Discard** / **Keep editing**.

Submit button label per mode: `Publish now` · `Schedule post` · `Add to queue` · `Save draft`; with N channels append `to N channels`. Disabled while `submitting`; shows spinner.

Edge cases: switching mode to `draft` clears schedule errors; deselecting all accounts in draft mode is allowed; removing an account that disappears mid-edit (cross-tab delete) → picker drops it and shows banner "A channel was removed."

### 8.6 Timeline (Dashboard) Logic

* Inputs: `postsStore.posts`, filter `{ accountId: string | 'all', status: 'upcoming' | 'published' | 'failed' | 'drafts' }`.
* `upcoming` = `scheduled|publishing` ordered asc; `published` = desc; `failed` = desc; `drafts` = by `updatedAt` desc (grouped under "Drafts" single group).
* Group by `dayKey(scheduledAt)`; render first **7 day-groups**, then a "Show next 7 days" button (explicit button, no scroll-hijack).
* Empty states: no accounts → "Connect your first channel" CTA; accounts but no posts → "Nothing scheduled yet" + **Create post**; filtered-empty → "No posts match" + **Clear filters**.
* Loading: `isHydrated` false → 3 `BaseSkeleton card`s; (hydration is synchronous but the skeleton shows for route-level lazy chunk loading).

### 8.7 Calendar Logic (`useCalendarGrid`)

* `anchor: Ref<Date>` in user tz; `view: 'month'|'week'|'agenda'` (mobile < 768 defaults/forces `agenda` for month data density: the month view is allowed on mobile only as a compact dot-grid (7 cols, dots per day colored by platform, max 3 dots) that **selects a day** which then lists that day's posts below — fully tap-based).
* Month grid = 6 rows × 7 columns starting at `weekStartsOn`; each cell: `{ key, inMonth, isToday, posts }` from `postsStore.byDay`.
* Week grid = 7 columns × hour rows 00–23 (scrollable body, scroll to current hour or first post on mount); posts positioned by time (chips stack when same hour).
* Agenda = sorted list for the visible range (week on mobile) grouped by day with empty-day rows "No posts · Add".
* Chips show `HH:mm`, platform dot, 1-line content, status ring. Tapping a chip opens a `PostPreviewSheet` (card + actions) — never relies on hover tooltips.
* **Drag-reschedule (`useDragReschedule`)** — desktop/tablet Month + Week:
  1. `pointerdown` on chip (only `scheduled|draft` with `scheduledAt`) → start timer 250 ms for touch / begin on 4 px move for mouse.
  2. On start: `setPointerCapture`, create floating ghost (Teleport to body, `pointer-events:none`), set `touch-action:none` on chip during drag only.
  3. `pointermove`: `document.elementFromPoint(x,y)?.closest('[data-drop-day]')` → highlight target day cell.
  4. `pointerup` over valid target: compute new ISO = target day + original local time (Week view: snapped to 15-min from Y position) → validate lead time (≥ now + 1 min) → `postsStore.reschedule`; toast "Moved to Oct 9, 9:30 AM" with **Undo**. Invalid/Esc/cancel → ghost animates back.
  5. Always provide the non-drag path: `PostActionsMenu → Reschedule…` opens `RescheduleDialog` (date + time inputs). On mobile this is the **only** reschedule path (drag disabled < 768).
* Day tap on empty area/`+` button → `uiStore.openComposer({ presetDate })`.

### 8.8 Queue Page Logic

* Per-account tab/selector (horizontal `BaseTabs` of account avatars).
* `SlotEditor`: 7 weekday rows; each shows slot chips (time + remove `×` button, 44 px); an **Add time** inline form (time input + "Add"); rules enforced via `slotsStore.add` Result → inline error.
* Actions: **Use default times**, **Copy to all channels** (confirm), **Clear all** (confirm).
* `UpcomingQueueList` shows next 10 posts where `source === 'queue'` for the account, each with PostCard `compact` and reschedule/delete.
* Empty: account has no slots → hero "Set your posting times" with **Use default times** button.

### 8.9 Channels & Settings

* Channels: grid of `ChannelCard`; **Connect channel** opens form (platform, handle, display name; uniqueness error inline). `Disconnect` sets `connected:false` and warns "N scheduled posts for this channel will fail until you reconnect." (confirm). `Remove` cascades with Undo.
* Settings sections: *Appearance* (theme segmented), *Time* (timezone select populated by `Intl.supportedValuesOf('timeZone')` with fallback list when unsupported; 12/24h; week start), *Simulation* (`simulateFailures` switch with explanation), *Data* (Export JSON — builds Blob → `<a download>`; Import JSON — file input, zod-validated, preview counts, **Replace all** confirm; Reset everything — type-to-confirm "RESET"; **Load demo data** — only enabled when there are no posts or after confirm), *Storage usage* meter (`navigator.storage.estimate()` when available else computed bytes of all `vpss:*` keys).

---

## 9. Scheduler Engine Specification (`src/lib/scheduler.ts` & `src/stores/useSchedulerStore.ts`)

### 9.1 Constants & Cross-Tab Leadership
* `LEASE_KEY = 'vpss:scheduler-lease'`, `LEASE_MS = 10_000`, `TICK_MS = 5_000`.
* Primary leader lease: `{ tabId: string, expiresAt: number }` stored in `localStorage`.
* A tab only ticks publishing if it acquires/renews the lease (`expiresAt < now` or `tabId === self`). Releases lease on `beforeunload`.

### 9.2 Execution Loop & Simulation
1. **Tick (`useSchedulerStore.tick`):**
   - Check leader lease; if not leader, exit.
   - Read fresh posts via `postsStore.replaceFromStorage()`.
   - Identify due posts: `status === 'scheduled'` and `scheduledAt <= nowIso`.
   - For each due post (up to 3 concurrent): mark `status: 'publishing'`.
2. **Publish Simulation (`src/lib/publisher.ts`):**
   - Simulate network latency: delay 800ms - 1500ms.
   - Check account connectivity: if account disconnected -> fail with `ACCOUNT_DISCONNECTED`.
   - Failure simulation: if `settings.simulateFailures` is true, 25% random fail with `RATE_LIMITED`.
   - On success: set `status: 'published'`, `publishedAt: nowIso`, populate mock `metrics`.
   - On failure: set `status: 'failed'`, record `failure: { code, message, at: nowIso }`.

---