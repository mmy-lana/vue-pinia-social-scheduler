<script setup lang="ts">
/**
 * Everything that exists, sorted by lifecycle stage: drafts, scheduled,
 * published, failed.
 *
 * This is the same `usePostGroups` model the timeline uses, with a different
 * default filter, so the two screens can never disagree about what "published"
 * or "failed" means. Failed posts lead with their reason on the card itself.
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseButton from '@/components/ui/BaseButton.vue'
import TimelineFilters from '@/components/timeline/TimelineFilters.vue'
import TimelineList from '@/components/timeline/TimelineList.vue'
import { usePostActions } from '@/composables/usePostActions'
import { usePostGroups } from '@/composables/usePostGroups'
import { useUiStore } from '@/stores/useUiStore'
import type { TimelineFilter } from '@/types'

const ui = useUiStore()
const router = useRouter()
const actions = usePostActions()

/** The library opens on drafts: that is the bucket people come here to clear. */
const filter = ref<TimelineFilter>({ accountId: 'all', status: 'drafts' })
const groups = usePostGroups(filter)

function clearFilters(): void {
  filter.value = { accountId: 'all', status: 'drafts' }
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
    <div class="flex flex-wrap items-center gap-3">
      <h2 class="text-base font-bold text-ink">Library</h2>
      <span class="text-sm text-ink-muted" data-testid="library-count">
        {{ groups.totalPosts.value }} posts
      </span>
      <BaseButton
        class="ms-auto"
        variant="secondary"
        size="sm"
        data-testid="library-create"
        @click="ui.openComposer()"
      >
        Create post
      </BaseButton>
    </div>

    <div class="mt-4 flex flex-col gap-4">
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
    </div>
  </div>
</template>