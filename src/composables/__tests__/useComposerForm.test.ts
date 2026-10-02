import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useComposerForm, COMPOSER_UNDO_MS } from '@/composables/useComposerForm'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { useMediaStore } from '@/stores/useMediaStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useSlotsStore } from '@/stores/useSlotsStore'
import { useUiStore } from '@/stores/useUiStore'
import { STORAGE_KEYS, writeEnvelope } from '@/lib/storage'
import { dayKeyOf, weekdayOfKey, zonedToUtcIso } from '@/lib/datetime'
import type { ComposerDraft, MediaAsset, PlatformId } from '@/types'

const TZ = 'Asia/Jakarta'
const DRAFT_KEY = STORAGE_KEYS.composerDraft

/**
 * Timers are faked so the 400 ms autosave debounce can be driven explicitly and
 * never leaks a write into the next test. `Date` stays real, so the timezone
 * math in the app is exercised for real.
 */
function useFakeTimers(): void {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
    ],
  })
}

beforeEach(() => {
  useFakeTimers()
  window.localStorage.clear()
  setActivePinia(createPinia())
  useSettingsStore().update({ timezone: TZ, timeFormat: '24h' })
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

function addAccount(platform: PlatformId, handle: string) {
  const result = useAccountsStore().add({ platform, handle, displayName: `@${handle}` })
  if (!result.ok) throw new Error(`fixture failed: ${JSON.stringify(result.error)}`)
  return result.value
}

function addMediaAssets(count: number): MediaAsset[] {
  const now = '2026-10-01T00:00:00.000Z'
  const assets: MediaAsset[] = Array.from({ length: count }, (_unused, index) => ({
    id: `media-${index + 1}`,
    name: `photo-${index + 1}.jpg`,
    mime: 'image/jpeg',
    width: 400,
    height: 400,
    bytes: 2_048,
    dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    createdAt: now,
    updatedAt: now,
  }))
  useMediaStore().replaceAll(assets)
  return assets
}

function writeDraft(draft: Partial<ComposerDraft> = {}): void {
  writeEnvelope(DRAFT_KEY, 1, {
    content: '',
    accountIds: [],
    mediaIds: [],
    mode: 'schedule',
    date: '2026-12-01',
    time: '08:00',
    editingPostId: null,
    savedAt: new Date().toISOString(),
    ...draft,
  })
}

function storedDraft(): ComposerDraft | null {
  const raw = window.localStorage.getItem(DRAFT_KEY)
  return raw === null ? null : (JSON.parse(raw).data as ComposerDraft)
}

/** A day comfortably in the future, plus its weekday for queue slots. */
function futureDay(): { key: string; weekday: number } {
  const key = dayKeyOf(new Date(Date.now() + 3 * 86_400_000), TZ)
  return { key, weekday: weekdayOfKey(key) }
}

describe('useComposerForm — opening', () => {
  it('starts from the defaults and preselects the only connected channel', () => {
    const account = addAccount('x', 'lana')
    const form = useComposerForm()
    form.open()

    expect(form.mode.value).toBe('schedule')
    expect(form.accountIds.value).toEqual([account.id])
    expect(form.date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(form.time.value).toMatch(/^\d{2}:\d{2}$/)
    expect(form.scheduledAtIso.value).not.toBeNull()
    expect(form.restoredDraft.value).toBe(false)
    expect(form.isDirty.value).toBe(false)
    expect(form.editingPostId.value).toBeNull()
  })

  it('restores a persisted draft younger than a week and flags the restore', () => {
    const account = addAccount('x', 'lana')
    writeDraft({ content: 'half written', accountIds: [account.id], mode: 'queue' })

    const form = useComposerForm()
    form.open()

    expect(form.restoredDraft.value).toBe(true)
    expect(form.content.value).toBe('half written')
    expect(form.mode.value).toBe('queue')
    expect(form.accountIds.value).toEqual([account.id])
    expect(form.date.value).toBe('2026-12-01')
    // Restoring is not an edit: the form starts clean.
    expect(form.isDirty.value).toBe(false)
  })

  it('ignores a draft older than seven days', () => {
    writeDraft({ content: 'stale', savedAt: new Date(Date.now() - 8 * 86_400_000).toISOString() })
    const form = useComposerForm()
    form.open()

    expect(form.restoredDraft.value).toBe(false)
    expect(form.content.value).toBe('')
  })

  it('honors the calendar preset date', () => {
    addAccount('x', 'lana')
    useUiStore().openComposer({ presetDate: '2026-12-24' })

    const form = useComposerForm()
    form.open()

    expect(form.date.value).toBe('2026-12-24')
    expect(form.time.value).toMatch(/^\d{2}:\d{2}$/)
  })

  it('hydrates from the post being edited and locks its channel', () => {
    const owner = addAccount('x', 'owner')
    const other = addAccount('linkedin', 'other')
    const posts = usePostsStore()
    const created = posts.createGroup({
      content: 'original text',
      accountIds: [owner.id],
      mediaIds: [],
      mode: 'draft',
      scheduledAtIso: null,
    })
    if (!created.ok) throw new Error('fixture failed')
    const post = created.value.posts[0]

    const form = useComposerForm()
    form.open({ editingPostId: post.id })

    expect(form.editingPostId.value).toBe(post.id)
    expect(form.content.value).toBe('original text')
    expect(form.accountIds.value).toEqual([owner.id])
    expect(form.mode.value).toBe('draft')
    form.toggleAccount(other.id)
    expect(form.accountIds.value).toEqual([owner.id])
  })
})

describe('useComposerForm — derived state', () => {
  it('tracks the dirty state against the open baseline', () => {
    addAccount('x', 'lana')
    const form = useComposerForm()
    form.open()
    expect(form.isDirty.value).toBe(false)

    form.setContent('hello')
    expect(form.isDirty.value).toBe(true)

    form.reset()
    expect(form.isDirty.value).toBe(false)
    expect(form.content.value).toBe('')
  })

  it('measures the strictest character limit across the selected platforms', () => {
    const x = addAccount('x', 'xhandle')
    const threads = addAccount('threads', 'thandle')
    const form = useComposerForm()
    form.open()

    form.toggleAccount(x.id)
    expect(form.limit.value).toEqual({ limit: 280, by: 'x' })
    form.setContent('a'.repeat(300))
    expect(form.used.value).toBe(300)
    expect(form.remaining.value).toBe(-20)

    form.toggleAccount(threads.id)
    expect(form.limit.value).toEqual({ limit: 280, by: 'x' })
  })

  it('labels the submit button per mode and channel count', () => {
    const first = addAccount('x', 'one')
    const second = addAccount('linkedin', 'two')
    const form = useComposerForm()
    form.open()

    expect(form.submitLabel.value).toBe('Schedule post')
    form.setMode('now')
    expect(form.submitLabel.value).toBe('Publish now')
    form.setMode('queue')
    expect(form.submitLabel.value).toBe('Add to queue')
    form.setMode('draft')
    expect(form.submitLabel.value).toBe('Save draft')

    form.toggleAccount(first.id)
    form.toggleAccount(second.id)
    expect(form.submitLabel.value).toBe('Save draft to 2 channels')
    form.toggleAccount(second.id)
    expect(form.submitLabel.value).toBe('Save draft')
  })

  it('caps media at the strictest channel and requires an image for Instagram', () => {
    const x = addAccount('x', 'xhandle')
    const instagram = addAccount('instagram', 'instahandle')
    const assets = addMediaAssets(5)
    const form = useComposerForm()
    form.open()
    form.setContent('launch day')
    form.toggleAccount(x.id)
    form.toggleAccount(instagram.id)

    expect(form.mediaCap.value).toBe(4)

    for (const asset of assets.slice(0, 4)) form.addMedia(asset.id)
    expect(form.errors.value.media).toBeUndefined()

    form.addMedia(assets[4].id)
    expect(form.errors.value.media).toContain('max 4')

    for (const asset of assets) form.removeMedia(asset.id)
    expect(form.errors.value.media).toBe('Instagram posts need at least one image.')

    form.toggleAccount(instagram.id)
    expect(form.errors.value.media).toBeUndefined()
  })

  it('drops a channel that disappeared in another tab', async () => {
    const kept = addAccount('x', 'kept')
    const gone = addAccount('linkedin', 'gone')
    const form = useComposerForm()
    form.open()
    form.toggleAccount(kept.id)
    form.toggleAccount(gone.id)
    expect(form.channelRemoved.value).toBe(false)

    useAccountsStore().replaceAll([kept])
    await Promise.resolve()

    expect(form.accountIds.value).toEqual([kept.id])
    expect(form.channelRemoved.value).toBe(true)
  })
})

describe('useComposerForm — submit', () => {
  it('blocks submit on validation errors and focuses the first invalid field', async () => {
    const posts = usePostsStore()
    const form = useComposerForm()
    form.open()

    const field = document.createElement('textarea')
    field.setAttribute('data-composer-field', 'accounts')
    const scrollIntoView = vi.spyOn(field, 'scrollIntoView')
    document.body.append(field)

    const result = await form.submit()

    expect(result.ok).toBe(false)
    expect(result.error?.accounts).toBe('Select at least one channel.')
    expect(result.postIds).toEqual([])
    expect(posts.posts).toHaveLength(0)
    expect(form.showErrors.value).toBe(true)
    expect(form.visibleErrors.value.accounts).toBeDefined()
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
    expect(document.activeElement).toBe(field)
  })

  it('creates a group, closes the composer and clears the persisted draft', async () => {
    const account = addAccount('x', 'lana')
    const posts = usePostsStore()
    const ui = useUiStore()
    ui.openComposer()
    writeDraft({ content: 'previous attempt', accountIds: [account.id] })

    const form = useComposerForm()
    form.open()
    form.setContent('scheduling the launch')
    vi.advanceTimersByTime(400)
    expect(storedDraft()?.content).toBe('scheduling the launch')

    const result = await form.submit()

    expect(result.ok).toBe(true)
    expect(result.groupId).not.toBeNull()
    expect(result.postIds).toHaveLength(1)
    expect(result.message).toContain('Scheduled for')
    expect(posts.posts).toHaveLength(1)
    expect(posts.posts[0].content).toBe('scheduling the launch')
    expect(posts.posts[0].status).toBe('scheduled')
    expect(ui.composer.open).toBe(false)
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()

    const toast = ui.toasts.at(-1)
    expect(toast?.action?.label).toBe('Undo')
    expect(toast?.durationMs).toBe(COMPOSER_UNDO_MS)
    toast?.action?.run()
    expect(posts.posts).toHaveLength(0)
  })

  it('assigns a distinct queue slot to each channel', async () => {
    const first = addAccount('x', 'xhandle')
    const second = addAccount('linkedin', 'other')
    const posts = usePostsStore()
    const slots = useSlotsStore()
    const day = futureDay()

    slots.add(first.id, day.weekday as 0, '12:00')
    slots.add(second.id, day.weekday as 0, '12:00')
    slots.add(second.id, day.weekday as 0, '12:30')

    // The second channel already owns 12:00, so its preview must step to 12:30.
    const existing = posts.createGroup({
      content: 'earlier post',
      accountIds: [second.id],
      mediaIds: [],
      mode: 'schedule',
      scheduledAtIso: zonedToUtcIso(day.key, '12:00', TZ),
    })
    expect(existing.ok).toBe(true)

    const form = useComposerForm()
    form.open()
    form.toggleAccount(first.id)
    form.toggleAccount(second.id)
    form.setMode('queue')
    form.setContent('queued launch')

    const preview = form.queuePreview.value
    expect(preview.get(first.id)).toBe(zonedToUtcIso(day.key, '12:00', TZ))
    expect(preview.get(second.id)).toBe(zonedToUtcIso(day.key, '12:30', TZ))

    const result = await form.submit()

    expect(result.ok).toBe(true)
    const created = posts.posts.filter((post) => post.content === 'queued launch')
    expect(created).toHaveLength(2)
    expect(new Set(created.map((post) => post.scheduledAt)).size).toBe(2)
    expect(created.every((post) => post.source === 'queue')).toBe(true)
  })

  it('updates the edited post without offering an undo', async () => {
    const account = addAccount('x', 'lana')
    const posts = usePostsStore()
    const created = posts.createGroup({
      content: 'original',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'draft',
      scheduledAtIso: null,
    })
    if (!created.ok) throw new Error('fixture failed')
    const post = created.value.posts[0]

    const form = useComposerForm()
    form.open({ editingPostId: post.id })
    form.setContent('revised')
    const result = await form.submit()

    expect(result.ok).toBe(true)
    expect(result.groupId).toBeNull()
    expect(posts.get(post.id)?.content).toBe('revised')
    expect(posts.posts).toHaveLength(1)
    expect(useUiStore().toasts.at(-1)?.action).toBeNull()
  })

  it('autosaves a transient draft after 400 ms and drops it on discard', () => {
    addAccount('x', 'lana')
    const form = useComposerForm()
    form.open()
    form.setContent('typing…')

    vi.advanceTimersByTime(200)
    expect(storedDraft()).toBeNull()
    vi.advanceTimersByTime(250)
    expect(storedDraft()?.content).toBe('typing…')

    form.discardDraft()
    expect(storedDraft()).toBeNull()
  })
})
