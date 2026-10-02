<script setup lang="ts">
/**
 * A native `<select>` dressed to match the other controls: no platform
 * appearance, a painted chevron, and a 44px control height.
 *
 * Keeping the native element buys the platform picker on mobile for free, which
 * no custom listbox can offer.
 */
import { computed, useId } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { cx } from '@/lib/utils'

interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    /** Visible field name. Always rendered above the control. */
    label: string
    options: SelectOption[]
    error?: string
    hint?: string
    /** Rendered as a leading, non-selectable empty option. */
    placeholder?: string
    disabled?: boolean
    /** Falls back to a stable per-instance id. */
    id?: string
  }>(),
  {
    disabled: false,
  },
)

const uid = useId()

const selectId = computed(() => props.id ?? `base-select-${uid}`)
const errorId = computed(() => `${selectId.value}-error`)
const hintId = computed(() => `${selectId.value}-hint`)

const describedBy = computed(() => {
  if (props.error) return errorId.value
  if (props.hint) return hintId.value
  return undefined
})

/** The placeholder is a real option so the native control can select it. */
const renderedOptions = computed<SelectOption[]>(() => {
  if (props.placeholder === undefined) return props.options
  return [{ value: '', label: props.placeholder, disabled: true }, ...props.options]
})

const controlClasses = computed(() =>
  cx(
    'h-11 w-full appearance-none rounded-control border bg-surface pl-3 pr-10 text-base text-ink',
    'motion-safe:transition-colors',
    'focus:border-brand-500',
    'focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-offset-2',
    'focus-visible:ring-offset-surface',
    props.error ? 'border-danger' : 'border-line',
    props.disabled ? 'cursor-not-allowed opacity-60' : '',
  ),
)

function onChange(event: Event): void {
  model.value = (event.target as HTMLSelectElement).value
}
</script>

<template>
  <div class="w-full">
    <label :for="selectId" class="mb-1.5 block text-sm font-medium text-ink">
      {{ label }}
    </label>

    <div class="relative">
      <select
        :id="selectId"
        data-testid="base-select"
        :value="model"
        :class="controlClasses"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @change="onChange"
      >
        <option
          v-for="option in renderedOptions"
          :key="option.value"
          :value="option.value"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </option>
      </select>

      <ChevronDown
        class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
        aria-hidden="true"
      />
    </div>

    <p
      v-if="error"
      :id="errorId"
      role="alert"
      data-testid="base-select-error"
      class="mt-1.5 text-sm text-danger"
    >
      {{ error }}
    </p>
    <p
      v-else-if="hint"
      :id="hintId"
      data-testid="base-select-hint"
      class="mt-1.5 text-sm text-ink-muted"
    >
      {{ hint }}
    </p>
  </div>
</template>
