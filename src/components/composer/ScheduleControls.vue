<script setup lang="ts">
/**
 * When a post goes out: pick the mode, then the moment.
 *
 * The mode control is a radiogroup because the four modes are genuinely
 * exclusive, not four buttons that happen to toggle. Date and time inputs only
 * exist for `schedule`; the other three modes say what they will do instead of
 * showing controls that would do nothing.
 *
 * The resolved line is the important one. A chosen local time can be a DST gap,
 * where `02:30` does not exist and the zone shifts it forward — so the exact
 * instant, in the user's zone, is always spelled out *before* submitting.
 * Queue mode previews the slot each selected channel would actually claim.
 */
import { computed } from 'vue'
import { CalendarClock, Clock } from 'lucide-vue-next'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSegmented from '@/components/ui/BaseSegmented.vue'
import { pluralize } from '@/lib/utils'
import { formatDateTimeWithZone, timeZoneLabel } from '@/lib/datetime'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { ISODateString, ScheduleMode, SocialAccount } from '@/types'

const props = defineProps<{
  mode: ScheduleMode
  date: string
  time: string
  accounts: SocialAccount[]
  /** `accountId → next free slot ISO`, empty unless the mode is `queue`. */
  queuePreview: Map<string, ISODateString>
  resolvedLabel: string
  errors: Record<string, string | undefined>
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:mode': [mode: ScheduleMode]
  'update:date': [date: string]
  'update:time': [time: string]
  touch: []
}>()

const settings = useSettingsStore()

const MODE_OPTIONS = [
  { value: 'now', label: 'Now' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'queue', label: 'Queue' },
  { value: 'draft', label: 'Draft' },
] as const

const modeHelp: Record<ScheduleMode, string> = {
  now: 'Publishes on the next scheduler tick — usually within a few seconds.',
  schedule: 'Publishes at exactly the time you pick below.',
  queue: 'Each channel takes its next free weekly posting slot.',
  draft: 'Saves without a time. Nothing will be published until you schedule it.',
}

const showPicker = computed<boolean>(() => props.mode === 'schedule')
const scheduleError = computed<string | undefined>(() => props.errors.schedule)

const queueRows = computed(() =>
  props.accounts.map((account) => {
    const iso = props.queuePreview.get(account.id) ?? null
    return {
      id: account.id,
      handle: account.handle,
      displayName: account.displayName,
      when: iso === null ? 'No free slot in the next 60 days' : formatDateTimeWithZone(iso, settings.tz, settings.is24h),
      missing: iso === null,
    }
  }),
)

const zoneLabel = computed<string>(() => timeZoneLabel(settings.tz))
</script>

<template>
  <div class="flex flex-col gap-4" data-testid="schedule-controls">
    <BaseSegmented
      :model-value="mode"
      :options="MODE_OPTIONS.map((option) => ({ ...option }))"
      ariaLabel="When should this post go out?"
      block
      data-testid="schedule-mode"
      @update:model-value="emit('update:mode', $event as ScheduleMode)"
    />

    <p class="text-sm text-ink-muted" data-testid="schedule-mode-help">
      {{ modeHelp[mode] }}
    </p>

    <div v-if="showPicker" class="flex flex-col gap-3" data-testid="schedule-picker">
      <div class="grid gap-3 sm:grid-cols-2">
        <BaseInput
          :model-value="date"
          label="Date"
          type="date"
          :error="scheduleError"
          :disabled="disabled"
          data-field="schedule-date"
          data-testid="schedule-date"
          @update:model-value="emit('update:date', $event)"
          @blur="emit('touch')"
        />
        <BaseInput
          :model-value="time"
          label="Time"
          type="time"
          :disabled="disabled"
          data-field="schedule-time"
          data-testid="schedule-time"
          @update:model-value="emit('update:time', $event)"
          @blur="emit('touch')"
        />
      </div>
    </div>

    <p
      v-if="showPicker && resolvedLabel"
      class="flex items-start gap-2 rounded-control bg-surface-muted px-3 py-2 text-sm text-ink"
      data-testid="schedule-resolved"
    >
      <Clock class="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <span>
        <span class="font-medium">Goes out</span>
        {{ resolvedLabel }}
        <span class="text-ink-muted">({{ zoneLabel }})</span>
      </span>
    </p>

    <div v-if="mode === 'queue'" class="flex flex-col gap-2" data-testid="queue-preview">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-ink">
        <CalendarClock class="size-4 text-ink-muted" aria-hidden="true" />
        Next free {{ pluralize(accounts.length, 'slot') }}
      </h3>

      <p v-if="queueRows.length === 0" class="text-sm text-ink-muted">
        Select at least one channel to see the slots it would claim.
      </p>

      <ul v-else class="flex flex-col gap-1.5">
        <li
          v-for="row in queueRows"
          :key="row.id"
          class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-control bg-surface-muted px-3 py-2 text-sm"
        >
          <span class="font-medium text-ink">@{{ row.handle }}</span>
          <span :class="row.missing ? 'text-danger' : 'text-ink-muted'" data-testid="queue-preview-when">
            {{ row.when }}
          </span>
        </li>
      </ul>
    </div>

    <p
      v-if="scheduleError && !showPicker"
      role="alert"
      class="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger"
      data-testid="schedule-error"
    >
      {{ scheduleError }}
    </p>

    <span class="sr-only" aria-live="polite">
      {{ showPicker ? resolvedLabel : '' }}
    </span>
  </div>
</template>