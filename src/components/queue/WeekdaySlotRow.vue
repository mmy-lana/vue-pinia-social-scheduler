<script setup lang="ts">
/**
 * One weekday's posting times.
 *
 * The chips carry their own 44 px remove button, so editing a slot never depends
 * on a hover state or a long-press. Adding is an inline form — a time input and
 * an "Add" button — with the validation message from the store shown here rather
 * than in a toast, because the row is where the mistake was made.
 *
 * The row stacks below 640 px (heading and add-form on top, chips wrapping
 * beneath) so seven days of times can never blow out the layout horizontally.
 */
import { ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { cx } from '@/lib/utils'
import { formatSlotTime, WEEKDAY_LABELS, WEEKDAY_SHORT } from '@/lib/datetime'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { QueueSlot, Weekday } from '@/types'

const props = defineProps<{
  weekday: Weekday
  slots: QueueSlot[]
  error?: string
}>()

const emit = defineEmits<{
  add: [weekday: Weekday, time: string]
  remove: [slotId: string]
}>()

const settings = useSettingsStore()
const draft = ref('')

function submit(): void {
  const value = draft.value.trim()
  if (value.length === 0) return
  emit('add', props.weekday, value)
  draft.value = ''
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return
  event.preventDefault()
  submit()
}
</script>

<template>
  <div
    class="flex flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
    data-testid="weekday-slot-row"
    :data-weekday="weekday"
  >
    <div class="flex shrink-0 items-center justify-between gap-2 sm:w-32 sm:flex-col sm:items-start sm:justify-center">
      <p class="text-sm font-semibold text-ink" data-testid="weekday-slot-label">
        <span class="sm:hidden">{{ WEEKDAY_LABELS[weekday] }}</span>
        <span class="hidden sm:inline">{{ WEEKDAY_SHORT[weekday] }}</span>
      </p>
      <p class="text-xs text-ink-muted tabular-nums" data-testid="weekday-slot-count">
        {{ slots.length }}
      </p>
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
      <ul v-if="slots.length > 0" class="flex flex-wrap gap-2" data-testid="weekday-slot-chips">
        <li v-for="slot in slots" :key="slot.id" class="flex items-center gap-1">
          <span
            class="rounded-control bg-surface-muted px-2 py-1 text-sm font-medium text-ink tabular-nums"
            data-testid="weekday-slot-chip"
            :data-slot-id="slot.id"
          >
            {{ formatSlotTime(slot.time, settings.is24h) }}
          </span>
          <button
            type="button"
            class="tap-target flex size-11 items-center justify-center rounded-full text-ink-muted motion-safe:hover:bg-danger/10 motion-safe:hover:text-danger"
            :aria-label="`Remove ${formatSlotTime(slot.time, settings.is24h)} on ${WEEKDAY_LABELS[weekday]}`"
            data-testid="weekday-slot-remove"
            @click="emit('remove', slot.id)"
          >
            &times;
          </button>
        </li>
      </ul>

      <p v-else class="text-sm text-ink-muted" data-testid="weekday-slot-empty">
        No posting times
      </p>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <label :for="`slot-time-${weekday}`" class="sr-only">
        New posting time for {{ WEEKDAY_LABELS[weekday] }}
      </label>
      <input
        :id="`slot-time-${weekday}`"
        v-model="draft"
        type="time"
        :class="
          cx(
            'h-11 rounded-control border bg-surface px-2 text-sm text-ink',
            'focus-visible:ring-2 focus-visible:ring-brand-500/30',
            props.error ? 'border-danger' : 'border-line',
          )
        "
        data-testid="weekday-slot-input"
        @keydown="onKeydown"
      />
      <BaseButton
        variant="secondary"
        size="sm"
        :disabled="draft.trim().length === 0"
        data-testid="weekday-slot-add"
        @click="submit"
      >
        Add
      </BaseButton>
    </div>

    <p
      v-if="props.error"
      role="alert"
      class="text-sm text-danger sm:col-start-2"
      data-testid="weekday-slot-error"
    >
      {{ props.error }}
    </p>
  </div>
</template>