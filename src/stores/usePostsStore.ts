import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { PostSchema, parseArray } from '@/lib/schemas'
import { newId } from '@/lib/utils'
import { byScheduledAt, dayKey, startOfWeekKey, dayKeyOf } from '@/lib/datetime'
import { computeNextSlot } from '@/lib/queue'
import {
  canTransition,
  strictestLimit,
  validateComposer,
  validateScheduleWindow,
} from '@/lib/validation'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { useSlotsStore } from '@/stores/useSlotsStore'
import { useMediaStore } from '@/stores/useMediaStore'
import { useActivityStore } from '@/stores/useActivityStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useUiStore } from '@/stores/useUiStore'
import { useSchedulerStore } from '@/stores/useSchedulerStore'
import { readEnvelope } from '@/lib/storage'
import { STORE_KEYS, type PersistApi } from '@/stores/persistencePlugin'
import type {
  ComposerFormValue,
  FieldErrors,
  ISODateString,
  Post,
  PostCounts,
  PostFailure,
  PostMetrics,
  PostRemovalSnapshot,
  PostStatus,
  Result,
  SocialAccount,
} from '@/types'

export interface CreateGroupSuccess {
  groupId: string
  posts: Post[]
  /** Channels skipped in queue mode because they have no posting times. */
  skipped: SocialAccount[]
}

export type CreateGroupOutcome = Result<CreateGroupSuccess, FieldErrors>

export type PostPatch = Partial<
  Pick<
    Post,
    | 'content'
    | 'mediaIds'
    | 'status'
    | 'scheduledAt'
    | 'publishedAt'
    | 'source'
    | 'failure'
    | 'metrics'
    | 'nextRetryAt'
    | 'attempts'
  >
>

/** Every post, plus the derived views the timeline, calendar and library need. */
export const usePostsStore = defineStore('posts', () => {
  const posts = ref<Post[]>([])
  const droppedCount = ref(0)

  const settings = useSettingsStore()
  const accounts = useAccountsStore()
  const slots = useSlotsStore()
  const media = useMediaStore()
  const activity = useActivityStore()
  const ui = useUiStore()

  const byId = computed(() => new Map(posts.value.map((post) => [post.id, post])))
  const scheduled = computed(() =>
    posts.value.filter((post) => post.status === 'scheduled' || post.status === 'publishing'),
  )
  const drafts = computed(() => posts.value.filter((post) => post.status === 'draft'))
  const published = computed(() => posts.value.filter((post) => post.status === 'published'))
  const failed = computed(() => posts.value.filter((post) => post.status === 'failed'))
  const publishing = computed(() => posts.value.filter((post) => post.status === 'publishing'))

  const upcoming = computed(() => [...scheduled.value].sort(byScheduledAt))

  const nextUp = computed<Post | null>(() => {
    const nowIso = new Date().toISOString()
    return (
      upcoming.value.find(
        (post) => post.status === 'scheduled' && (post.scheduledAt as string) > nowIso,
      ) ?? null
    )
  })

  /** Posts grouped by the user's local day key, each day sorted by time. */
  const byDay = computed(() => {
    const groups = new Map<string, Post[]>()
    for (const post of posts.value) {
      if (post.scheduledAt === null) continue
      const key = dayKey(post.scheduledAt, settings.tz)
      const bucket = groups.get(key)
      if (bucket) bucket.push(post)
      else groups.set(key, [post])
    }
    for (const bucket of groups.values()) bucket.sort(byScheduledAt)
    return groups
  })

  const counts = computed<PostCounts>(() => {
    const now = new Date()
    const weekStart = new Date(`${startOfWeekKey(dayKeyOf(now, settings.tz), settings.weekStartsOn)}T00:00:00.000Z`)
    const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000)
    return {
      scheduled: scheduled.value.length,
      publishedThisWeek: published.value.filter((post) => {
        if (post.publishedAt === null) return false
        const at = new Date(post.publishedAt).getTime()
        return at >= weekStart.getTime() && at < weekEnd.getTime()
      }).length,
      failed: failed.value.length,
      drafts: drafts.value.length,
    }
  })

  function get(id: string): Post | null {
    return byId.value.get(id) ?? null
  }

  function forAccount(accountId: string): Post[] {
    return posts.value.filter((post) => post.accountId === accountId)
  }

  function forGroup(groupId: string): Post[] {
    return posts.value.filter((post) => post.groupId === groupId)
  }

  function referencedMediaIds(): Set<string> {
    const ids = new Set<string>()
    for (const post of posts.value) {
      for (const id of post.mediaIds) ids.add(id)
    }
    return ids
  }

  function touch(post: Post, patch: PostPatch): Post {
    return { ...post, ...patch, updatedAt: new Date().toISOString() }
  }

  function replace(post: Post): void {
    posts.value = posts.value.map((item) => (item.id === post.id ? post : item))
  }

  /* ---------------------------------------------------------------- *
   * Create
   * ---------------------------------------------------------------- */

  /**
   * Creates one post per selected channel. In `queue` mode each channel takes
   * the next free slot; the already-assigned posts are part of the live store
   * state, so two channels never collide and the same channel never double-books
   * the same minute.
   */
  function createGroup(form: ComposerFormValue): CreateGroupOutcome {
    const allSelected = accounts.forIds(form.accountIds)
    const missing = form.accountIds.filter((id) => accounts.get(id) === null)
    const now = new Date()

    // In queue mode a channel without posting times is skipped, not a hard
    // error: the rest of the selection still goes into the queue and the UI is
    // told which channel was left out.
    const skipped: SocialAccount[] =
      form.mode === 'queue'
        ? allSelected.filter((account) => !slots.hasSlotsFor(account.id))
        : []
    const selected = skipped.length > 0 ? allSelected.filter((a) => !skipped.includes(a)) : allSelected

    const errors: FieldErrors = validateComposer({
      content: form.content,
      accounts: selected,
      mediaCount: form.mediaIds.length,
      mode: form.mode,
      scheduledAtIso: form.scheduledAtIso,
      now,
      hasSlotsFor: (accountId) => slots.hasSlotsFor(accountId),
      mediaExists: (id) => media.exists(id),
      mediaIds: form.mediaIds,
    })
    if (missing.length > 0) errors.accounts = 'A selected channel was removed in another tab.'
    if (Object.keys(errors).length > 0) return { ok: false, error: errors }
    if (selected.length === 0) {
      return {
        ok: false,
        error: { schedule: 'Add posting times before queueing a post.' },
      }
    }

    const groupId = newId()
    const nowIso = now.toISOString()
    const created: Post[] = []

    for (const account of selected) {
      let status: PostStatus
      let scheduledAt: ISODateString | null
      let source: Post['source'] = 'manual'

      switch (form.mode) {
        case 'draft': {
          status = 'draft'
          scheduledAt = null
          break
        }
        case 'schedule': {
          status = 'scheduled'
          scheduledAt = form.scheduledAtIso
          break
        }
        case 'queue': {
          source = 'queue'
          status = 'scheduled'
          const next = computeNextSlot(
            account.id,
            slots.slots,
            [...posts.value, ...created],
            now,
            settings.tz,
          )
          if (next === null) {
            skipped.push(account)
            continue
          }
          scheduledAt = next
          break
        }
        case 'now': {
          status = 'scheduled'
          scheduledAt = nowIso
          break
        }
      }

      created.push({
        id: newId(),
        groupId,
        accountId: account.id,
        content: form.content.trim(),
        mediaIds: [...form.mediaIds],
        status,
        scheduledAt,
        publishedAt: null,
        source,
        attempts: 0,
        nextRetryAt: null,
        failure: null,
        metrics: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
    }

    if (created.length === 0) {
      return {
        ok: false,
        error: { schedule: 'No free queue slot in the next 60 days for the selected channels.' },
      }
    }

    posts.value = [...posts.value, ...created]

    if (form.mode === 'draft') {
      activity.log('created', `Draft saved for ${describeTargets(selected)}`, created[0]?.id ?? null)
    } else if (form.mode === 'queue') {
      activity.log(
        'scheduled',
        `Queued for ${describeTargets(selected.filter((a) => !skipped.some((s) => s.id === a.id)))}`,
        created[0]?.id ?? null,
      )
    } else {
      activity.log('scheduled', `Scheduled for ${describeTargets(selected)}`, created[0]?.id ?? null)
    }

    for (const account of skipped) {
      ui.toast({ tone: 'warn', message: `No posting times for @${account.handle} — skipped.` })
    }

    if (form.mode === 'now') {
      void useSchedulerStore().tick()
    }

    return { ok: true, value: { groupId, posts: created, skipped } }
  }

  function describeTargets(list: readonly SocialAccount[]): string {
    if (list.length === 0) return 'no channels'
    if (list.length === 1) return (list[0] as SocialAccount).displayName
    return `${list.length} channels`
  }

  /* ---------------------------------------------------------------- *
   * Mutate
   * ---------------------------------------------------------------- */

  function update(id: string, patch: PostPatch): Result<Post, string> {
    const post = get(id)
    if (!post) return { ok: false, error: 'That post no longer exists.' }
    if (post.status === 'published' || post.status === 'publishing') {
      return { ok: false, error: 'A published post can only be duplicated or deleted.' }
    }

    const accountsForPost = [accounts.get(post.accountId)].filter(
      (account): account is SocialAccount => account !== null,
    )
    if (patch.content !== undefined) {
      const limit = strictestLimit(accountsForPost.map((account) => account.platform))
      if (limit && patch.content.trim().length > limit.limit) {
        return { ok: false, error: `Too long for this channel (max ${limit.limit}).` }
      }
    }
    if (patch.mediaIds !== undefined && patch.mediaIds.some((mediaId) => !media.exists(mediaId))) {
      return { ok: false, error: 'One of the selected media files is no longer available.' }
    }
    if (patch.status !== undefined && patch.status !== post.status && !canTransition(post.status, patch.status)) {
      return { ok: false, error: `A ${post.status} post cannot become ${patch.status}.` }
    }
    if (patch.status === 'draft' && patch.scheduledAt !== undefined && patch.scheduledAt !== null) {
      return { ok: false, error: 'A draft cannot keep a scheduled time.' }
    }

    const next = touch(post, patch)
    replace(next)
    activity.log('created', 'Draft updated', next.id)
    return { ok: true, value: next }
  }

  /** Moves a post to a new instant, enforcing the lead-time window. */
  function reschedule(id: string, isoUtc: ISODateString): Result<Post, string> {
    const post = get(id)
    if (!post) return { ok: false, error: 'That post no longer exists.' }
    if (post.status === 'published' || post.status === 'publishing') {
      return { ok: false, error: 'This post is already on its way.' }
    }
    const error = validateScheduleWindow({ iso: isoUtc, now: new Date() })
    if (error) return { ok: false, error }

    const previous = post.scheduledAt
    const next = touch(post, {
      scheduledAt: isoUtc,
      status: 'scheduled',
      failure: null,
      nextRetryAt: null,
    })
    replace(next)
    activity.log('rescheduled', 'Rescheduled post', next.id)
    void previous
    return { ok: true, value: next }
  }

  function moveToDraft(id: string): Result<Post, string> {
    const post = get(id)
    if (!post) return { ok: false, error: 'That post no longer exists.' }
    if (!canTransition(post.status, 'draft')) {
      return { ok: false, error: 'Only a scheduled post can move back to drafts.' }
    }
    const next = touch(post, { status: 'draft', scheduledAt: null, failure: null, nextRetryAt: null })
    replace(next)
    activity.log('created', 'Moved post to drafts', next.id)
    return { ok: true, value: next }
  }

  function duplicate(id: string): Result<Post, string> {
    const post = get(id)
    if (!post) return { ok: false, error: 'That post no longer exists.' }
    const now = new Date().toISOString()
    const copy: Post = {
      ...post,
      id: newId(),
      groupId: newId(),
      status: 'draft',
      scheduledAt: null,
      publishedAt: null,
      source: 'manual',
      attempts: 0,
      nextRetryAt: null,
      failure: null,
      metrics: null,
      createdAt: now,
      updatedAt: now,
    }
    posts.value = [copy, ...posts.value]
    activity.log('duplicated', 'Duplicated post', copy.id)
    return { ok: true, value: copy }
  }

  /** Deletes a post together with every sibling in its group. */
  function remove(id: string): PostRemovalSnapshot | null {
    const post = get(id)
    if (!post) return null
    const group = forGroup(post.groupId)
    const groupIds = new Set(group.map((item) => item.id))
    const removedActivity = activity.entries.filter(
      (entry) => entry.postId !== null && groupIds.has(entry.postId),
    )
    posts.value = posts.value.filter((item) => item.groupId !== post.groupId)
    activity.removeManyForPosts(groupIds)
    activity.log('deleted', `Deleted ${group.length > 1 ? `${group.length} posts` : 'post'}`, null)

    const snapshot: PostRemovalSnapshot = { posts: group, groupIds: [...groupIds], activity: removedActivity }
    ui.rememberPostRemoval(snapshot, group.length)
    return snapshot
  }

  function restore(snapshot: PostRemovalSnapshot): void {
    ui.clearPostSnapshot()
    const known = new Set(posts.value.map((post) => post.id))
    posts.value = [...snapshot.posts.filter((post) => !known.has(post.id)), ...posts.value]
    activity.prepend(snapshot.activity)
    activity.log('created', 'Restored post', snapshot.posts[0]?.id ?? null)
  }

  /** Manual retry: schedules the post a few seconds out so the engine picks it up. */
  function retry(id: string): Result<Post, string> {
    const post = get(id)
    if (!post) return { ok: false, error: 'That post no longer exists.' }
    const at = new Date(Date.now() + 5_000).toISOString()
    const next = touch(post, {
      status: 'scheduled',
      scheduledAt: at,
      failure: null,
      nextRetryAt: null,
      attempts: post.attempts + 1,
    })
    replace(next)
    activity.log('retried', 'Retrying publish', next.id)
    return { ok: true, value: next }
  }

  function removeForAccount(accountId: string): Post[] {
    const removed = posts.value.filter((post) => post.accountId === accountId)
    if (removed.length > 0) {
      posts.value = posts.value.filter((post) => post.accountId !== accountId)
    }
    return removed
  }

  function removeGroup(groupId: string): Post[] {
    const removed = forGroup(groupId)
    if (removed.length > 0) {
      posts.value = posts.value.filter((post) => post.groupId !== groupId)
      activity.removeManyForPosts(new Set(removed.map((post) => post.id)))
    }
    return removed
  }

  function restoreList(list: readonly Post[]): void {
    const known = new Set(posts.value.map((post) => post.id))
    posts.value = [...list.filter((post) => !known.has(post.id)), ...posts.value]
  }

  /* ---------------------------------------------------------------- *
   * Engine transitions (scheduler only)
   * ---------------------------------------------------------------- */

  function markPublishing(id: string): Result<Post, string> {
    const post = get(id)
    if (!post) return { ok: false, error: 'That post no longer exists.' }
    if (!canTransition(post.status, 'publishing')) {
      return { ok: false, error: `A ${post.status} post cannot start publishing.` }
    }
    const next = touch(post, { status: 'publishing', attempts: post.attempts + 1 })
    replace(next)
    return { ok: true, value: next }
  }

  function markPublished(id: string, publishedAt: ISODateString, metrics: PostMetrics): Result<Post, string> {
    const post = get(id)
    if (!post) return { ok: false, error: 'That post no longer exists.' }
    const next = touch(post, {
      status: 'published',
      publishedAt,
      metrics,
      failure: null,
      nextRetryAt: null,
    })
    replace(next)
    const account = accounts.get(post.accountId)
    activity.log(
      'published',
      `Published to ${account?.displayName ?? 'a channel'}`,
      next.id,
    )
    return { ok: true, value: next }
  }

  function markFailed(id: string, failure: PostFailure): Result<Post, string> {
    const post = get(id)
    if (!post) return { ok: false, error: 'That post no longer exists.' }
    const next = touch(post, { status: 'failed', failure, nextRetryAt: null })
    replace(next)
    const account = accounts.get(post.accountId)
    activity.log('failed', `Failed on ${account?.displayName ?? 'a channel'}`, next.id)
    ui.toast({ tone: 'danger', message: failure.message })
    return { ok: true, value: next }
  }

  function markMissed(id: string, at: ISODateString): Result<Post, string> {
    return markFailed(id, {
      code: 'MISSED',
      message: 'This post missed its publishing window and needs a retry.',
      at,
    })
  }

  /**
   * Arms an automatic retry for a rate-limited post. The post stays `failed` so
   * the UI can show the countdown; the engine promotes it to `scheduled` once
   * `at` passes.
   */
  function scheduleRetry(id: string, at: ISODateString): Result<Post, string> {
    const post = get(id)
    if (!post) return { ok: false, error: 'That post no longer exists.' }
    const next: Post = { ...post, nextRetryAt: at, updatedAt: new Date().toISOString() }
    replace(next)
    return { ok: true, value: next }
  }

  /**
   * Re-reads the persisted slice before the engine mutates it, so a publish
   * never overwrites a change another tab made while this one was idle.
   */
  function replaceFromStorage(): number {
    const raw = readEnvelope<unknown>(STORE_KEYS.posts, 1, [])
    const parsed = parseArray(PostSchema, raw)
    posts.value = parsed.data
    if (parsed.dropped > 0) droppedCount.value = parsed.dropped
    return parsed.dropped
  }

  function replaceAll(list: readonly Post[]): void {
    posts.value = [...list]
  }

  const persistApi: PersistApi<Post[]> = {
    key: STORE_KEYS.posts,
    version: 1,
    debounceMs: 120,
    read: () => posts.value,
    apply: (data) => {
      posts.value = data
    },
    parse: (raw) => parseArray(PostSchema, raw),
    fallback: [],
  }

  return {
    posts,
    byId,
    scheduled,
    drafts,
    published,
    failed,
    publishing,
    upcoming,
    nextUp,
    byDay,
    counts,
    droppedCount,
    get,
    forAccount,
    forGroup,
    referencedMediaIds,
    createGroup,
    update,
    reschedule,
    moveToDraft,
    duplicate,
    remove,
    restore,
    retry,
    removeForAccount,
    removeGroup,
    restoreList,
    markPublishing,
    markPublished,
    markFailed,
    markMissed,
    scheduleRetry,
    replaceFromStorage,
    replaceAll,
    persistApi,
  }
})
