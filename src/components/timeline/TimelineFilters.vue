<script setup lang="ts">
/**
 * Timeline filter bar: which channel, and which lifecycle stage.
 *
 * The channel chips scroll horizontally on a phone rather than wrapping, so the
 * status control below always stays at a predictable place. "All channels" is
 * always present, so the bar is never empty and the filter is always reversible.
 */
import { computed } from 'vue'
import BaseAvatar from '@/components/ui/BaseAvatar.vue'
import BaseSegmented from '@/components/ui/BaseSegmented.vue'
import PlatformIcon from '@/components/accounts/PlatformIcon.vue'
import { cx } from '@/lib/utils'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { TIMELINE_FILTERS } from '@/composables/usePostGroups'
import type { TimelineFilter, TimelineStatusFilter } from '@/types'

const model = defineModel<TimelineFilter>({ required: true })

const accounts = useAccountsStore()

const statusOptions = computed(() =>
  TIMELINE_FILTERS.map((entry) => ({ value: entry.value, label: entry.label })),
)

const status = computed<TimelineStatusFilter>({
  get: () => model.value.status,
  set: (value) => {
    model.value = { ...model.value, status: value as TimelineStatusFilter }
  },
})

/** Draft posts have no channel of their own once a channel filter is active. */
const showChannelRow = computed(() => accounts.accounts.length > 0)
</script>

<template>
  <div class="flex flex-col gap-3" data-testid="timeline-filters">
    <div v-if="showChannelRow" class="-mx-1 overflow-x-auto px-1 pb-1">
      <div
        class="flex w-max items-center gap-2"
        role="group"
        aria-label="Filter by channel"
        data-testid="timeline-channel-filters"
      >
        <button
          type="button"
          :aria-pressed="model.accountId === 'all'"
          :class="
            cx(
              'tap-target flex items-center gap-2 rounded-full border px-3 text-sm font-medium',
              'motion-safe:transition-colors motion-safe:duration-150',
              model.accountId === 'all'
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                : 'border-line bg-surface text-ink-muted motion-safe:hover:bg-surface-muted',
            )
          "
          data-testid="timeline-channel-all"
          @click="model = { ...model, accountId: 'all' }"
        >
          All channels
        </button>

        <button
          v-for="account in accounts.accounts"
          :key="account.id"
          type="button"
          :aria-pressed="model.accountId === account.id"
          :class="
            cx(
              'tap-target flex items-center gap-2 rounded-full border px-2 text-sm font-medium',
              'motion-safe:transition-colors motion-safe:duration-150',
              model.accountId === account.id
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                : 'border-line bg-surface text-ink-muted motion-safe:hover:bg-surface-muted',
            )
          "
          :data-testid="`timeline-channel-${account.id}`"
          @click="model = { ...model, accountId: account.id }"
        >
          <BaseAvatar :name="account.displayName" :hue="account.avatarHue" size="xs" />
          <span class="max-w-28 truncate">@{{ account.handle }}</span>
          <PlatformIcon :platform="account.platform" size="xs" />
        </button>
      </div>
    </div>

    <BaseSegmented
      v-model="status"
      :options="statusOptions"
      ariaLabel="Filter by status"
      size="sm"
      block
      data-testid="timeline-status-filter"
    />
  </div>
</template>