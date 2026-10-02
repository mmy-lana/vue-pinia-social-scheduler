<script setup lang="ts">
/**
 * The single-line text primitive.
 *
 * The label is a real, permanently visible `<label for>`: the placeholder is a
 * hint about the format, never the field's name. An error replaces the hint
 * while it is set, and `aria-describedby` always points at whichever of the two
 * is currently on screen.
 */
import { computed, useId, useSlots } from 'vue'
import type { Component } from 'vue'
import { cx } from '@/lib/utils'

const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    /** Visible field name. Always rendered above the control. */
    label: string
    type?: 'text' | 'email' | 'url' | 'search' | 'tel' | 'number' | 'password' | 'date' | 'time'
    /** Validation message. Replaces the hint and marks the field invalid. */
    error?: string
    /** Persistent help text, shown only while there is no error. */
    hint?: string
    placeholder?: string
    maxlength?: number
    disabled?: boolean
    required?: boolean
    autocomplete?: string
    /** Falls back to a stable per-instance id. */
    id?: string
    inputmode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search'
    /** Only meaningful for `type="number"`. */
    min?: number
    /** Only meaningful for `type="number"`. */
    max?: number
    /** Decorative glyph pinned inside the control, before the text. */
    prefixIcon?: Component
  }>(),
  {
    type: 'text',
    disabled: false,
    required: false,
  },
)

const slots = useSlots()
const uid = useId()

const inputId = computed(() => props.id ?? `base-input-${uid}`)
const errorId = computed(() => `${inputId.value}-error`)
const hintId = computed(() => `${inputId.value}-hint`)

const describedBy = computed(() => {
  if (props.error) return errorId.value
  if (props.hint) return hintId.value
  return undefined
})

const hasPrefix = computed(() => Boolean(props.prefixIcon) || Boolean(slots.prefix))
const hasSuffix = computed(() => Boolean(slots.suffix))

const controlClasses = computed(() =>
  cx(
    'h-11 w-full rounded-control border bg-surface px-3 text-base text-ink',
    'placeholder:text-ink-muted',
    'motion-safe:transition-colors',
    'focus:border-brand-500',
    'focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-offset-2',
    'focus-visible:ring-offset-surface',
    props.error ? 'border-danger' : 'border-line',
    props.disabled ? 'cursor-not-allowed opacity-60' : '',
    hasPrefix.value ? 'pl-9' : '',
    hasSuffix.value ? 'pr-10' : '',
  ),
)

function onInput(event: Event): void {
  model.value = (event.target as HTMLInputElement).value
}
</script>

<template>
  <div class="w-full">
    <label :for="inputId" class="mb-1.5 block text-sm font-medium text-ink">
      {{ label }}<span v-if="required" class="text-danger" aria-hidden="true"> *</span>
    </label>

    <div class="relative flex items-center">
      <span
        v-if="hasPrefix"
        class="pointer-events-none absolute left-3 flex items-center text-ink-muted"
        aria-hidden="true"
      >
        <component :is="prefixIcon" v-if="prefixIcon" class="size-4" />
        <slot v-else name="prefix" />
      </span>

      <input
        :id="inputId"
        data-testid="base-input"
        :type="type"
        :value="model"
        :class="controlClasses"
        :placeholder="placeholder"
        :maxlength="maxlength"
        :disabled="disabled"
        :required="required"
        :autocomplete="autocomplete"
        :inputmode="inputmode"
        :min="min"
        :max="max"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="onInput"
      />

      <span v-if="hasSuffix" class="absolute right-3 flex items-center text-ink-muted">
        <slot name="suffix" />
      </span>
    </div>

    <p
      v-if="error"
      :id="errorId"
      role="alert"
      data-testid="base-input-error"
      class="mt-1.5 text-sm text-danger"
    >
      {{ error }}
    </p>
    <p
      v-else-if="hint"
      :id="hintId"
      data-testid="base-input-hint"
      class="mt-1.5 text-sm text-ink-muted"
    >
      {{ hint }}
    </p>
  </div>
</template>
