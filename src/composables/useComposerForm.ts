import {
  computed,
  getCurrentScope,
  nextTick,
  onScopeDispose,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { useMediaStore } from '@/stores/useMediaStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useSlotsStore } from '@/stores/useSlotsStore'
import { useUiStore } from '@/stores/useUiStore'
import { STORAGE_KEYS, readEnvelope, removeKey, writeEnvelope } from '@/lib/storage'
import { ComposerDraftSchema, parseOne } from '@/lib/schemas'
import { computeNextSlot } from '@/lib/queue'
import { debounce } from '@/lib/utils'
import {
  defaultScheduleParts,
  formatDateTime,
  isValidDateKey,
  isValidTimeString,
  utcIsoToZonedParts,
  zonedToUtcIso,
} from '@/lib/datetime'
import {
  effectiveMediaCap,
  firstErrorField,
  hasErrors,
  strictestLimit,
  validateComposer,
} from '@/lib/validation'
import type { StrictestLimit } from '@/lib/validation'
import type {
  ComposerDraft,
  FieldErrors,
  ISODateString,
  Post,
  ScheduleMode,
  SocialAccount,
} from '@/types'

/**
 * Owns the composer: its form state, the live validation, the queue preview and
 * the submit flow (create or update, toast with Undo, draft cleanup).
 *
 * Every instant that leaves this composable is UTC ISO; every instant that enters
 * it is the pair `date` + `time` in the user's zone.
 */

/** A persisted draft older than a week is ignored rather than restored. */
export const COMPOSER_DRAFT_MAX_AGE_MS = 7 * 86_400_000

/** Debounce for the transient draft kept in LocalStorage. */
export const COMPOSER_AUTOSAVE_MS = 400

/** How long the "Undo" toast after a successful submit stays actionable. */
export const COMPOSER_UNDO_MS = 8_000

export interface ComposerSubmitResult {
  ok: boolean
  postIds: string[]
  groupId: string | null
  error: FieldErrors | null
  message: string
}

export interface ComposerFormOptions {
  /** Called once per submit attempt, for both outcomes. */
  onDone?: (result: ComposerSubmitResult) => void
}

export interface ComposerOpenOptions {
  editingPostId?: string | null
}

export interface ComposerFormController {
  /* State */
  content: Ref<string>
  accountIds: Ref<string[]>
  mediaIds: Ref<string[]>
  mode: Ref<ScheduleMode>
  date: Ref<string>
  time: Ref<string>
  submitting: Ref<boolean>
  showErrors: Ref<boolean>
  editingPostId: Ref<string | null>
  /** A selected channel vanished (cross-tab removal) and was dropped. */
  channelRemoved: Ref<boolean>
  /** The form was hydrated from the persisted draft. */
  restoredDraft: Ref<boolean>

  /* Derived */
  selectedAccounts: ComputedRef<SocialAccount[]>
  limit: ComputedRef<StrictestLimit | null>
  used: ComputedRef<number>
  remaining: ComputedRef<number>
  mediaCap: ComputedRef<number>
  scheduledAtIso: ComputedRef<ISODateString | null>
  resolvedLabel: ComputedRef<string>
  errors: ComputedRef<FieldErrors>
  /** `errors`, but empty until the first submit attempt or field blur. */
  visibleErrors: ComputedRef<FieldErrors>
  isDirty: ComputedRef<boolean>
  canSubmit: ComputedRef<boolean>
  queuePreview: ComputedRef<Map<string, ISODateString>>
  submitLabel: ComputedRef<string>

  /* Actions */
  open: (options?: ComposerOpenOptions) => void
  reset: () => void
  discardDraft: () => void
  submit: () => Promise<ComposerSubmitResult>
  setContent: (value: string) => void
  setMode: (next: ScheduleMode) => void
  toggleAccount: (id: string) => void
  addMedia: (id: string) => void
  removeMedia: (id: string) => void
  setDate: (value: string) => void
  setTime: (value: string) => void
  /** Reveals the live errors, e.g. from a field's blur handler. */
  touch: () => void
}

const EMPTY_DRAFT: ComposerDraft = {
  content: '',
  accountIds: [],
  mediaIds: [],
  mode: 'schedule',
  date: '',
  time: '',
  editingPostId: null,
  savedAt: '',
}

const SUBMIT_LABELS: Record<ScheduleMode, string> = {
  now: 'Publish now',
  schedule: 'Schedule post',
  queue: 'Add to queue',
  draft: 'Save draft',
}

/** Shape compared by `isDirty`; the form is clean right after `open()`. */
interface Baseline {
  content: string
  accountIds: string[]
  mediaIds: string[]
  mode: ScheduleMode
  date: string
  time: string
  editingPostId: string | null
}

export function useComposerForm(options: ComposerFormOptions = {}): ComposerFormController {
  const posts = usePostsStore()
  const accounts = useAccountsStore()
  const slots = useSlotsStore()
  const media = useMediaStore()
  const settings = useSettingsStore()
  const ui = useUiStore()

  const content = ref('')
  const accountIds = ref<string[]>([])
  const mediaIds = ref<string[]>([])
  const mode = ref<ScheduleMode>('schedule')
  const date = ref('')
  const time = ref('')
  const submitting = ref(false)
  const showErrors = ref(false)
  const editingPostId = ref<string | null>(null)
  const channelRemoved = ref(false)
  const restoredDraft = ref(false)

  function snapshot(): Baseline {
    return {
      content: content.value,
      accountIds: [...accountIds.value],
      mediaIds: [...mediaIds.value],
      mode: mode.value,
      date: date.value,
      time: time.value,
      editingPostId: editingPostId.value,
    }
  }

  const baseline = ref<Baseline>(snapshot())

  /* ------------------------------------------------------------------ *
   * Derived state
   * ------------------------------------------------------------------ */

  const selectedAccounts = computed<SocialAccount[]>(() => accounts.forIds(accountIds.value))

  const platforms = computed(() => selectedAccounts.value.map((account) => account.platform))

  const limit = computed<StrictestLimit | null>(() => strictestLimit(platforms.value))

  const used = computed(() => content.value.trim().length)

  const remaining = computed(() => (limit.value === null ? 0 : limit.value.limit - used.value))

  const mediaCap = computed(() => effectiveMediaCap(platforms.value))

  const scheduledAtIso = computed<ISODateString | null>(() => {
    if (!isValidDateKey(date.value) || !isValidTimeString(time.value)) return null
    return zonedToUtcIso(date.value, time.value, settings.tz)
  })

  const resolvedLabel = computed(() => {
    const iso = scheduledAtIso.value
    return iso === null ? '' : formatDateTime(iso, settings.tz, settings.is24h)
  })

  const errors = computed<FieldErrors>(() =>
    validateComposer({
      content: content.value,
      accounts: selectedAccounts.value,
      mediaCount: mediaIds.value.length,
      mode: mode.value,
      scheduledAtIso: scheduledAtIso.value,
      now: new Date(),
      hasSlotsFor: (accountId) => slots.hasSlotsFor(accountId),
      mediaExists: (mediaId) => media.exists(mediaId),
      mediaIds: mediaIds.value,
    }),
  )

  const visibleErrors = computed<FieldErrors>(() => (showErrors.value ? errors.value : {}))

  const isDirty = computed(() => JSON.stringify(snapshot()) !== JSON.stringify(baseline.value))

  const canSubmit = computed(() => !submitting.value && !hasErrors(errors.value))

  /**
   * Next free slot per selected channel. Every pick is fed back into the post
   * list handed to `computeNextSlot`, so two channels sharing a posting time
   * never receive the same instant and a previewed group matches what the
   * store will really create.
   */
  const queuePreview = computed<Map<string, ISODateString>>(() => {
    const now = new Date()
    // `computeNextSlot` only reads accountId/status/scheduledAt.
    const shadow = [...posts.posts] as Post[]
    const preview = new Map<string, ISODateString>()
    for (const account of selectedAccounts.value) {
      const iso = computeNextSlot(account.id, slots.slots, shadow, now, settings.tz)
      if (iso === null) continue
      preview.set(account.id, iso)
      shadow.push({ accountId: account.id, scheduledAt: iso, status: 'scheduled' } as Post)
    }
    return preview
  })

  const submitLabel = computed(() => {
    const base = SUBMIT_LABELS[mode.value]
    const count = selectedAccounts.value.length
    return count > 1 ? `${base} to ${count} channels` : base
  })

  /* ------------------------------------------------------------------ *
   * Persistence and housekeeping
   * ------------------------------------------------------------------ */

  /** A channel can disappear under us; drop it and tell the UI about it. */
  function pruneAccounts(): void {
    if (accountIds.value.length === 0) return
    const kept = accountIds.value.filter((id) => accounts.get(id) !== null)
    if (kept.length === accountIds.value.length) return
    accountIds.value = kept
    channelRemoved.value = true
  }

  function readPersistedDraft(): ComposerDraft | null {
    const raw = readEnvelope<unknown>(STORAGE_KEYS.composerDraft, 1, null)
    if (raw === null) return null
    const parsed = parseOne(ComposerDraftSchema, raw, EMPTY_DRAFT)
    if (parsed.dropped > 0) return null
    const savedAt = new Date(parsed.data.savedAt).getTime()
    if (Number.isNaN(savedAt)) return null
    if (Date.now() - savedAt > COMPOSER_DRAFT_MAX_AGE_MS) return null
    return parsed.data
  }

  function persistDraft(): void {
    if (submitting.value) return
    const draft: ComposerDraft = {
      content: content.value,
      accountIds: [...accountIds.value],
      mediaIds: [...mediaIds.value],
      mode: mode.value,
      date: date.value,
      time: time.value,
      editingPostId: editingPostId.value,
      savedAt: new Date().toISOString(),
    }
    writeEnvelope(STORAGE_KEYS.composerDraft, 1, draft)
  }

  const autosave = debounce(persistDraft, COMPOSER_AUTOSAVE_MS)

  const stopAutosave = watch(
    () => [
      content.value,
      accountIds.value,
      mediaIds.value,
      mode.value,
      date.value,
      time.value,
      editingPostId.value,
    ],
    () => {
      autosave()
    },
    { deep: true, flush: 'sync' },
  )

  const stopPruning = watch(
    () => [accountIds.value, accounts.accounts] as const,
    () => {
      pruneAccounts()
    },
    { deep: true, immediate: true },
  )

  if (getCurrentScope()) {
    onScopeDispose(() => {
      autosave.cancel()
      stopAutosave()
      stopPruning()
    })
  }

  /* ------------------------------------------------------------------ *
   * Opening, resetting, discarding
   * ------------------------------------------------------------------ */

  function defaultSchedule(): { date: string; time: string } {
    const parts = defaultScheduleParts(new Date(), settings.tz)
    const preset = ui.composer.presetDate
    return preset !== null && isValidDateKey(preset) ? { date: preset, time: parts.time } : parts
  }

  function defaultAccountIds(): string[] {
    const presets = ui.composer.presetAccountIds.filter((id) => accounts.get(id) !== null)
    if (presets.length > 0) return presets
    const connected = accounts.accounts.filter((account) => account.connected)
    return connected.length === 1 ? [connected[0].id] : []
  }

  function hydrateEdit(post: Post): void {
    editingPostId.value = post.id
    accountIds.value = [post.accountId]
    content.value = post.content
    mediaIds.value = [...post.mediaIds]
    mode.value = post.status === 'draft' ? 'draft' : 'schedule'
    const parts =
      post.scheduledAt === null
        ? defaultSchedule()
        : utcIsoToZonedParts(post.scheduledAt, settings.tz)
    date.value = parts.date
    time.value = parts.time
  }

  function hydrateNew(): void {
    editingPostId.value = null
    const draft = readPersistedDraft()
    if (draft !== null) {
      content.value = draft.content
      const keptAccounts = draft.accountIds.filter((id) => accounts.get(id) !== null)
      accountIds.value = keptAccounts
      channelRemoved.value = keptAccounts.length !== draft.accountIds.length
      mediaIds.value = draft.mediaIds.filter((id) => media.exists(id))
      mode.value = draft.mode
      // An explicit "add post on this day" wins over the restored date.
      const preset = ui.composer.presetDate
      date.value = preset !== null && isValidDateKey(preset) ? preset : draft.date
      time.value = draft.time
      restoredDraft.value = true
      return
    }

    const parts = defaultSchedule()
    content.value = ''
    mediaIds.value = []
    accountIds.value = defaultAccountIds()
    mode.value = 'schedule'
    date.value = parts.date
    time.value = parts.time
  }

  function open(openOptions: ComposerOpenOptions = {}): void {
    showErrors.value = false
    restoredDraft.value = false
    channelRemoved.value = false
    const requested =
      openOptions.editingPostId === undefined
        ? ui.composer.editingPostId
        : openOptions.editingPostId
    const post = requested === null ? null : posts.get(requested)
    if (post) hydrateEdit(post)
    else hydrateNew()
    // `open` establishes the clean baseline; hydration must not autosave.
    autosave.cancel()
    baseline.value = snapshot()
  }

  /** Empties the form but keeps the current mode (and a locked edit target). */
  function reset(): void {
    const parts = defaultSchedule()
    content.value = ''
    mediaIds.value = []
    accountIds.value =
      editingPostId.value === null ? defaultAccountIds() : accountIds.value.slice(0, 1)
    date.value = parts.date
    time.value = parts.time
    showErrors.value = false
    restoredDraft.value = false
    autosave.cancel()
    baseline.value = snapshot()
  }

  function discardDraft(): void {
    autosave.cancel()
    removeKey(STORAGE_KEYS.composerDraft)
    restoredDraft.value = false
  }

  /* ------------------------------------------------------------------ *
   * Field helpers used by the form components
   * ------------------------------------------------------------------ */

  function setContent(value: string): void {
    content.value = value
  }

  function setMode(next: ScheduleMode): void {
    mode.value = next
  }

  /** Editing locks the channel: an existing post always keeps its own account. */
  function toggleAccount(id: string): void {
    if (editingPostId.value !== null) return
    accountIds.value = accountIds.value.includes(id)
      ? accountIds.value.filter((value) => value !== id)
      : [...accountIds.value, id]
  }

  function addMedia(id: string): void {
    if (mediaIds.value.includes(id)) return
    mediaIds.value = [...mediaIds.value, id]
  }

  function removeMedia(id: string): void {
    mediaIds.value = mediaIds.value.filter((value) => value !== id)
  }

  function setDate(value: string): void {
    date.value = value
  }

  function setTime(value: string): void {
    time.value = value
  }

  function touch(): void {
    showErrors.value = true
  }

  /* ------------------------------------------------------------------ *
   * Submit
   * ------------------------------------------------------------------ */

  function focusFirstError(fieldErrors: FieldErrors): void {
    const field = firstErrorField(fieldErrors)
    if (field === null) return
    const element = document.querySelector(`[data-composer-field="${field}"]`)
    if (!(element instanceof HTMLElement)) return
    element.scrollIntoView({ block: 'center' })
    element.focus()
  }

  function failure(fieldErrors: FieldErrors): ComposerSubmitResult {
    focusFirstError(fieldErrors)
    const first = firstErrorField(fieldErrors)
    return {
      ok: false,
      postIds: [],
      groupId: null,
      error: fieldErrors,
      message: first === null ? 'Check the highlighted fields.' : (fieldErrors[first] as string),
    }
  }

  function channelList(): string {
    const list = selectedAccounts.value
    if (list.length === 0) return 'no channels'
    if (list.length === 1) return list[0].displayName
    return `${list.length} channels`
  }

  function detailMessage(): string {
    switch (mode.value) {
      case 'now':
        return `Published to ${channelList()}`
      case 'schedule':
        return `Scheduled for ${resolvedLabel.value === '' ? 'later' : resolvedLabel.value}`
      case 'queue':
        return `Added to the queue for ${channelList()}`
      case 'draft':
        return 'Draft saved'
    }
  }

  function successMessage(editing: boolean): string {
    const detail = detailMessage()
    if (!editing) return detail
    return mode.value === 'draft' ? `Draft updated · ${detail}` : `Post updated · ${detail}`
  }

  function finish(result: ComposerSubmitResult): ComposerSubmitResult {
    options.onDone?.(result)
    return result
  }

  function createNew(): ComposerSubmitResult {
    const outcome = posts.createGroup({
      content: content.value,
      accountIds: [...accountIds.value],
      mediaIds: [...mediaIds.value],
      mode: mode.value,
      scheduledAtIso: scheduledAtIso.value,
    })
    if (!outcome.ok) return failure(outcome.error)

    const groupId = outcome.value.groupId
    const postIds = outcome.value.posts.map((post) => post.id)
    const message = successMessage(false)

    discardDraft()
    ui.closeComposer()
    ui.toast({
      tone: 'ok',
      message,
      actionLabel: 'Undo',
      onAction: () => {
        posts.removeGroup(groupId)
      },
      durationMs: COMPOSER_UNDO_MS,
    })

    return { ok: true, postIds, groupId, error: null, message }
  }

  /** Drafts and failed posts still need promoting before they can be scheduled. */
  function promote(post: Post): { status?: 'scheduled' } {
    return post.status === 'draft' || post.status === 'failed' ? { status: 'scheduled' } : {}
  }

  /** A draft is already a draft; only a scheduled post needs demoting. */
  function demote(post: Post): { status?: 'draft' } {
    return post.status === 'draft' ? {} : { status: 'draft' }
  }

  function saveEdit(): ComposerSubmitResult {
    const id = editingPostId.value
    if (id === null) return failure({ form: 'This post is not open for editing.' })
    const post = posts.get(id)
    if (!post) return failure({ form: 'That post no longer exists.' })

    let result
    switch (mode.value) {
      case 'draft':
        result = posts.update(id, {
          content: content.value,
          mediaIds: [...mediaIds.value],
          ...demote(post),
          scheduledAt: null,
        })
        break
      case 'schedule':
        result = posts.update(id, {
          content: content.value,
          mediaIds: [...mediaIds.value],
          ...promote(post),
          scheduledAt: scheduledAtIso.value,
        })
        break
      case 'queue': {
        const patched = posts.update(id, { content: content.value, mediaIds: [...mediaIds.value] })
        if (!patched.ok) {
          result = patched
          break
        }
        const iso = queuePreview.value.get(post.accountId) ?? null
        result =
          iso === null
            ? { ok: false, error: 'No free queue slot in the next 60 days.' }
            : posts.reschedule(id, iso)
        break
      }
      case 'now':
        result = posts.update(id, {
          content: content.value,
          mediaIds: [...mediaIds.value],
          ...promote(post),
          scheduledAt: new Date().toISOString(),
        })
        break
    }

    if (!result.ok) return failure({ form: result.error })

    const message = successMessage(true)
    discardDraft()
    ui.closeComposer()
    ui.toast({ tone: 'ok', message })

    return { ok: true, postIds: [id], groupId: null, error: null, message }
  }

  async function submit(): Promise<ComposerSubmitResult> {
    if (submitting.value) {
      const busy: ComposerSubmitResult = {
        ok: false,
        postIds: [],
        groupId: null,
        error: { form: 'The previous post is still saving.' },
        message: 'The previous post is still saving.',
      }
      return finish(busy)
    }

    showErrors.value = true
    const found = errors.value
    if (hasErrors(found)) return finish(failure(found))

    submitting.value = true
    try {
      // One tick, so the button renders its busy state and a second click is
      // swallowed by the `submitting` guard.
      await nextTick()
      return finish(editingPostId.value === null ? createNew() : saveEdit())
    } finally {
      submitting.value = false
    }
  }

  return {
    content,
    accountIds,
    mediaIds,
    mode,
    date,
    time,
    submitting,
    showErrors,
    editingPostId,
    channelRemoved,
    restoredDraft,
    selectedAccounts,
    limit,
    used,
    remaining,
    mediaCap,
    scheduledAtIso,
    resolvedLabel,
    errors,
    visibleErrors,
    isDirty,
    canSubmit,
    queuePreview,
    submitLabel,
    open,
    reset,
    discardDraft,
    submit,
    setContent,
    setMode,
    toggleAccount,
    addMedia,
    removeMedia,
    setDate,
    setTime,
    touch,
  }
}
