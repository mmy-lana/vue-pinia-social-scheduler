<script setup lang="ts">
/**
 * An on/off toggle for a single boolean setting.
 *
 * The whole row — label, description and track — is one native `<button>`, so
 * Space and Enter activate it without a single line of key handling, and the
 * touch target is the full width of the row rather than the pill.
 */
import { computed, useId } from 'vue'
import { cx } from '@/lib/utils'

const model = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    /** Visible setting name. */
    label: string
    /** Secondary line explaining what the toggle does. */
    description?: string
    disabled?: boolean
    /** Falls back to a stable per-instance id. */
    id?: string
  }>(),
  {
    disabled: false,
  },
)

const uid = useId()

const switchId = computed(() => props.id ?? `base-switch-${uid}`)
const labelId = computed(() => `${switchId.value}-label`)
const descriptionId = computed(() => `${switchId.value}-description`)

const rootClasses = computed(() =>
  cx(
    'flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-1 py-2 text-left',
    'motion-safe:transition-colors',
    'focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2',
    'focus-visible:ring-offset-surface',
    props.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
  ),
)

const trackClasses = computed(() =>
  cx(
    'inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5',
    'motion-safe:transition-colors',
    model.value ? 'border-brand-600 bg-brand-600' : 'border-line bg-line',
  ),
)

const thumbClasses = computed(() =>
  cx(
    'block size-5 rounded-full bg-surface shadow-card',
    'motion-safe:transition-transform ease-snap',
    model.value ? 'translate-x-5' : 'translate-x-0',
  ),
)

function toggle(): void {
  if (props.disabled) return
  model.value = !model.value
}
</script>

<template>
  <button
    :id="switchId"
    type="button"
    role="switch"
    data-testid="base-switch"
    :class="rootClasses"
    :aria-checked="model"
    :aria-labelledby="labelId"
    :aria-describedby="description ? descriptionId : undefined"
    :disabled="disabled"
    @click="toggle"
  >
    <span class="min-w-0 flex-1">
      <span :id="labelId" class="block text-sm font-medium text-ink">{{ label }}</span>
      <span v-if="description" :id="descriptionId" class="mt-0.5 block text-sm text-ink-muted">
        {{ description }}
      </span>
    </span>

    <span :class="trackClasses" data-testid="base-switch-track" aria-hidden="true">
      <span :class="thumbClasses" />
    </span>
  </button>
</template>
