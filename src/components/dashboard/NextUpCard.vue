<script setup lang="ts">
/**
 * Dashboard "what happens next" card with a live countdown.
 *
 * The countdown reads the shared clock from `useNow()`, so this card, the
 * timeline and the scheduler can never drift apart inside one render pass. The
 * ticking text is `role="timer"` with `aria-live="off"`: a screen reader should
 * hear the time once, not every second, so the absolute time stays the
 * accessible description of the same instant.
 *
 * An empty timeline is a first-class state, not a blank tile: the card renders
 * an empty variant explaining what will appear here.
 */
import { computed } from 'vue'
import { CalendarClock } from 'lucide-vue-next'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import PlatformIcon from '@/components/accounts/PlatformIcon.vue'
import { useNow } from '@/composables/useNow'
import { formatDuration, formatTime } from '@/lib/datetime'
import { platformLabel } from '@/lib/platforms'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { Post } from '@/types'

const props = defineProps<{
  post: Post | null
  /** Overrides the name looked up from the account record. */
  accountName?: string
}>()

const accounts = useAccountsStore()
const settings = useSettingsStore()
const { msUntil } = useNow(1_000)

/** A draft has no instant to count down to, so it takes the empty route too. */
const scheduledPost = computed(() =>
  props.post && props.post.scheduledAt ? props.post : null,
)

const account = computed(() => {
  const post = scheduledPost.value
  if (!post) return null
  return accounts.get(post.accountId)
})

const resolvedName = computed(() => props.accountName ?? account.value?.displayName ?? '')

const timeText = computed(() => {
  const post = scheduledPost.value
  if (!post || !post.scheduledAt) return ''
  return formatTime(post.scheduledAt, settings.tz, settings.is24h)
})

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function secondsPart(seconds: number): string {
  // A zero second is dropped, so a distant post reads "in 2h 14m" and picks up
  // "03s" as soon as the clock starts moving.
  return seconds === 0 ? '' : ` ${pad(seconds)}s`
}

/** `in 2d 4h`, `in 2h 14m`, `in 14m 03s`, `in 42s`, `12m ago`. */
function formatCountdown(ms: number): string {
  if (ms <= 0) return `${formatDuration(ms)} ago`

  const totalSeconds = Math.floor(ms / 1_000)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3_600) % 24
  const days = Math.floor(totalSeconds / 86_400)

  if (days >= 1) return `in ${days}d ${hours}h ${minutes}m`
  if (hours >= 1) return `in ${hours}h ${minutes}m${secondsPart(seconds)}`
  if (minutes >= 1) return `in ${minutes}m${secondsPart(seconds)}`
  return `in ${seconds}s`
}

const countdownText = computed(() => {
  const post = scheduledPost.value
  if (!post || !post.scheduledAt) return ''
  return formatCountdown(msUntil(post.scheduledAt))
})
</script>

<template>
  <BaseCard
    padding="md"
    class="flex h-full flex-col gap-4"
    data-testid="next-up-card"
    :data-empty="String(scheduledPost === null)"
  >
    <template v-if="scheduledPost">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs font-semibold tracking-wide text-ink-muted uppercase">Next up</p>
          <p
            class="text-2xl font-semibold tracking-tight text-ink tabular-nums"
            role="timer"
            aria-live="off"
            data-testid="next-up-countdown"
          >
            {{ countdownText }}
          </p>
        </div>

        <div v-if="account" class="flex shrink-0 items-center gap-2">
          <PlatformIcon :platform="account.platform" size="md" />
          <span class="max-w-40 truncate text-sm font-semibold text-ink" data-testid="next-up-account">
            {{ resolvedName }}
          </span>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
        <time :datetime="scheduledPost.scheduledAt ?? undefined" data-testid="next-up-time">
          {{ timeText }}
        </time>
        <span v-if="account" aria-hidden="true">·</span>
        <span v-if="account" data-testid="next-up-platform">{{ platformLabel(account.platform) }}</span>
      </div>

      <p class="clamp-2 text-sm text-balance-pretty text-ink" data-testid="next-up-content">
        {{ scheduledPost.content }}
      </p>
    </template>

    <div v-else data-testid="next-up-empty">
      <BaseEmptyState
        compact
        :icon="CalendarClock"
        title="Nothing scheduled next"
        description="Schedule a post and its live countdown shows up here."
      />
    </div>
  </BaseCard>
</template>