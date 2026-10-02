import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { usePostsStore } from '@/stores/usePostsStore'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { dayKey, formatDayLabel, relativeTime } from '@/lib/datetime'
import { useNow } from '@/composables/useNow'
import type { Post, TimelineFilter, TimelineStatusFilter } from '@/types'

export interface PostGroup {
  /** `yyyy-MM-dd` for real days, `drafts` for the draft bucket. */
  key: string
  label: string
  /** Local day the group belongs to; `null` for drafts. */
  dateKey: string | null
  posts: Post[]
  isDrafts: boolean
}

export type EmptyReason = 'no-accounts' | 'no-posts' | 'filtered' | null

export interface PostGroupsView {
  groups: ComputedRef<PostGroup[]>
  /** The first `initialDays` groups, extended by `showMoreGroups()`. */
  visibleGroups: ComputedRef<PostGroup[]>
  totalGroups: ComputedRef<number>
  showMore: ComputedRef<boolean>
  showMoreGroups: () => void
  resetWindow: () => void
  totalPosts: ComputedRef<number>
  emptyReason: ComputedRef<EmptyReason>
}

export const TIMELINE_FILTERS: ReadonlyArray<{ value: TimelineStatusFilter; label: string }> = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'published', label: 'Published' },
  { value: 'failed', label: 'Failed' },
  { value: 'drafts', label: 'Drafts' },
]

const VALID_STATUSES: readonly TimelineStatusFilter[] = [
  'upcoming',
  'published',
  'failed',
  'drafts',
]

function groupByDay(
  posts: readonly Post[],
  tz: string,
  now: Date,
  newestFirst: boolean,
): PostGroup[] {
  const buckets = new Map<string, Post[]>()
  for (const post of posts) {
    const stamp = newestFirst
      ? (post.publishedAt ?? post.scheduledAt ?? post.createdAt)
      : post.scheduledAt
    if (stamp === null) continue
    const key = dayKey(stamp, tz)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(post)
    else buckets.set(key, [post])
  }

  const groups: PostGroup[] = []
  for (const [key, list] of buckets) {
    list.sort((a, b) => {
      const left = (newestFirst ? a.publishedAt : a.scheduledAt) ?? a.createdAt
      const right = (newestFirst ? b.publishedAt : b.scheduledAt) ?? b.createdAt
      return newestFirst ? right.localeCompare(left) : left.localeCompare(right)
    })
    groups.push({
      key,
      label: formatDayLabel(key, tz, now),
      dateKey: key,
      posts: list,
      isDrafts: false,
    })
  }

  groups.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  if (newestFirst) groups.reverse()
  return groups
}

/**
 * Dashboard timeline model: filter by channel and status, then group the result
 * by local day. Drafts collapse into one bucket because they carry no time.
 */
export function usePostGroups(
  filter: Ref<TimelineFilter>,
  options: { initialDays?: number } = {},
): PostGroupsView {
  const posts = usePostsStore()
  const accounts = useAccountsStore()
  const settings = useSettingsStore()
  const { now } = useNow(30_000)

  const initialDays = options.initialDays ?? 7
  const windowSize = ref(initialDays)

  const selected = computed(() =>
    filter.value.accountId === 'all'
      ? posts.posts
      : posts.posts.filter((post) => post.accountId === filter.value.accountId),
  )

  const status = computed<TimelineStatusFilter>(() =>
    VALID_STATUSES.includes(filter.value.status) ? filter.value.status : 'upcoming',
  )

  const filtered = computed<Post[]>(() => {
    switch (status.value) {
      case 'upcoming':
        return selected.value
          .filter((post) => post.status === 'scheduled' || post.status === 'publishing')
          .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))
      case 'published':
        return selected.value
          .filter((post) => post.status === 'published')
          .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
      case 'failed':
        return selected.value
          .filter((post) => post.status === 'failed')
          .sort((a, b) => (b.scheduledAt ?? '').localeCompare(a.scheduledAt ?? ''))
      case 'drafts':
      default:
        return selected.value
          .filter((post) => post.status === 'draft')
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }
  })

  const groups = computed<PostGroup[]>(() => {
    const list = filtered.value
    if (status.value === 'drafts') {
      if (list.length === 0) return []
      return [{ key: 'drafts', label: 'Drafts', dateKey: null, posts: list, isDrafts: true }]
    }
    const newestFirst = status.value === 'published' || status.value === 'failed'
    return groupByDay(list, settings.tz, now.value, newestFirst)
  })

  const totalGroups = computed(() => groups.value.length)
  const visibleGroups = computed(() => groups.value.slice(0, windowSize.value))
  const showMore = computed(() => groups.value.length > windowSize.value)
  const totalPosts = computed(() => filtered.value.length)

  const emptyReason = computed<EmptyReason>(() => {
    if (accounts.accounts.length === 0) return 'no-accounts'
    if (posts.posts.length === 0) return 'no-posts'
    if (totalPosts.value === 0) return 'filtered'
    return null
  })

  return {
    groups,
    visibleGroups,
    totalGroups,
    showMore,
    showMoreGroups: () => {
      windowSize.value += initialDays
    },
    resetWindow: () => {
      windowSize.value = initialDays
    },
    totalPosts,
    emptyReason,
  }
}

/** The most meaningful timestamp for a post, with its relative label. */
export function postTimestamp(post: Post, now: Date = new Date()): { at: string; label: string } {
  if (post.status === 'published' && post.publishedAt) {
    return { at: post.publishedAt, label: relativeTime(post.publishedAt, now) }
  }
  if (post.scheduledAt) {
    return { at: post.scheduledAt, label: relativeTime(post.scheduledAt, now) }
  }
  return { at: post.updatedAt, label: relativeTime(post.updatedAt, now) }
}
