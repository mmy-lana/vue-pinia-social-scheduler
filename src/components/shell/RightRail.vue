<script setup lang="ts">
/**
 * The ≥ 1280 px aside: what publishes next, the week's shape, and the recent
 * activity log. It is a summary, never the only place something is available —
 * every fact here also exists on a page.
 */
import { computed } from 'vue'
import { Activity, BarChart2, CalendarClock, Inbox } from 'lucide-vue-next'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import NextUpCard from '@/components/dashboard/NextUpCard.vue'
import StatCard from '@/components/dashboard/StatCard.vue'
import { useActivityStore } from '@/stores/useActivityStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { relativeTime } from '@/lib/datetime'
import { useNow } from '@/composables/useNow'

const posts = usePostsStore()
const activity = useActivityStore()
const { now } = useNow(60_000)

const counts = computed(() => posts.counts)

const recent = computed(() =>
  activity.recent.map((entry) => ({
    ...entry,
    when: relativeTime(entry.at, now.value),
  })),
)
</script>

<template>
  <aside
    class="flex w-80 shrink-0 flex-col gap-6 border-s border-line bg-surface p-4"
    aria-label="Summary"
    data-testid="right-rail"
  >
    <section>
      <h2 class="mb-2.5 flex items-center gap-2 text-xs font-semibold tracking-wider text-ink-muted uppercase">
        <CalendarClock class="size-4 text-ink-muted" aria-hidden="true" />
        Next up
      </h2>
      <NextUpCard :post="posts.nextUp" />
    </section>

    <section>
      <h2 class="mb-2.5 flex items-center gap-2 text-xs font-semibold tracking-wider text-ink-muted uppercase">
        <BarChart2 class="size-4 text-ink-muted" aria-hidden="true" />
        Overview
      </h2>
      <div class="grid grid-cols-2 gap-3">
        <StatCard
          label="Scheduled"
          :value="counts.scheduled"
          :icon="CalendarClock"
          tone="brand"
          compact
        />
        <StatCard
          label="This week"
          :value="counts.publishedThisWeek"
          :icon="Inbox"
          tone="ok"
          compact
        />
      </div>
    </section>

    <section>
      <h2 class="mb-2.5 flex items-center gap-2 text-xs font-semibold tracking-wider text-ink-muted uppercase">
        <Activity class="size-4 text-ink-muted" aria-hidden="true" />
        Recent activity
      </h2>
      <BaseCard padding="sm">
        <ul v-if="recent.length > 0" class="flex flex-col gap-2.5" data-testid="right-rail-activity">
          <li v-for="entry in recent" :key="entry.id" class="flex items-start gap-2 text-sm">
            <span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
            <span class="min-w-0 flex-1 text-ink">{{ entry.message }}</span>
            <span class="shrink-0 text-xs text-ink-muted">{{ entry.when }}</span>
          </li>
        </ul>
        <BaseEmptyState
          v-else
          compact
          :icon="Inbox"
          title="Nothing yet"
          description="Actions you take will show up here."
        />
      </BaseCard>
    </section>

    <section v-if="counts.failed > 0" data-testid="right-rail-failures">
      <BaseCard padding="sm">
        <BaseBadge tone="danger">{{ counts.failed }} failed</BaseBadge>
        <p class="mt-2 text-sm text-ink-muted">
          Failed posts keep their reason and can be retried from the Library.
        </p>
      </BaseCard>
    </section>
  </aside>
</template>