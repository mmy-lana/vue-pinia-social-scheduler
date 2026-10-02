<script setup lang="ts">
/**
 * The timeline: the app's home screen.
 *
 * Four stat cards, the onboarding hero when the workspace is empty, then the
 * day-grouped timeline with its filters. All post actions route through
 * `usePostActions`, so a card behaves identically here, in the Library and on
 * the calendar.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CalendarClock, FileText, Inbox, TriangleAlert } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import OnboardingCard from '@/components/dashboard/OnboardingCard.vue'
import StatCard from '@/components/dashboard/StatCard.vue'
import TimelineFilters from '@/components/timeline/TimelineFilters.vue'
import TimelineList from '@/components/timeline/TimelineList.vue'
import { usePostActions } from '@/composables/usePostActions'
import { usePostGroups } from '@/composables/usePostGroups'
import { usePostsStore } from '@/stores/usePostsStore'
import { useUiStore } from '@/stores/useUiStore'
import type { TimelineFilter } from '@/types'

const posts = usePostsStore()
const ui = useUiStore()
const router = useRouter()
const actions = usePostActions()

const filter = ref<TimelineFilter>({ accountId: 'all', status: 'upcoming' })

const groups = usePostGroups(filter)

const counts = computed(() => posts.counts)

function clearFilters(): void {
  filter.value = { accountId: 'all', status: 'upcoming' }
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
    <section
      class="grid grid-cols-2 gap-3 sm:grid-cols-4"
      aria-label="Summary"
      data-testid="dashboard-stats"
    >
      <StatCard
        label="Scheduled"
        :value="counts.scheduled"
        :icon="CalendarClock"
        tone="brand"
      />
      <StatCard label="Published" :value="counts.publishedThisWeek" :icon="Inbox" tone="ok" />
      <StatCard label="Failed" :value="counts.failed" :icon="TriangleAlert" tone="danger" />
      <StatCard label="Drafts" :value="counts.drafts" :icon="FileText" />
    </section>

    <section v-if="!ui.onboardingDismissed" class="mt-5">
      <OnboardingCard />
    </section>

    <section class="mt-6 flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="text-base font-bold text-ink">Posts</h2>
        <BaseButton
          class="ms-auto"
          variant="secondary"
          size="sm"
          data-testid="dashboard-create"
          @click="ui.openComposer()"
        >
          Create post
        </BaseButton>
      </div>

      <TimelineFilters v-model="filter" />

      <TimelineList
        :groups="groups.visibleGroups.value"
        :total-groups="groups.totalGroups.value"
        :show-more="groups.showMore.value"
        :total-posts="groups.totalPosts.value"
        :empty-reason="groups.emptyReason.value"
        :filter="filter"
        @action="actions.run"
        @show-more="groups.showMoreGroups()"
        @create="ui.openComposer()"
        @connect="router.push('/channels')"
        @clear-filters="clearFilters"
      />
    </section>
  </div>
</template>