<script setup lang="ts">
/**
 * The multi-line counterpart to `BaseInput`.
 *
 * When `autoGrow` is on, the control tracks its content: the height is reset to
 * `auto`, measured with `scrollHeight` and then clamped to `maxHeight`, past
 * which the textarea scrolls instead of growing further.
 */
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
import { cx } from '@/lib/utils'

const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    /** Visible field name. Always rendered above the control. */
    label: string
    error?: string
    hint?: string
    placeholder?: string
    /** Initial visible line count, also the minimum while auto-growing. */
    rows?: number
    /** Grow with the content instead of scrolling at `maxHeight`. */
    autoGrow?: boolean
    /** Hard ceiling for auto-grow; also the threshold where scrolling starts. */
    maxHeight?: string
    disabled?: boolean
    required?: boolean
    /** Falls back to a stable per-instance id. */
    id?: string
  }>(),
  {
    rows: 4,
    autoGrow: true,
    maxHeight: '420px',
    disabled: false,
    required: false,
  },
)

const uid = useId()
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const textareaId = computed(() => props.id ?? `base-textarea-${uid}`)
const errorId = computed(() => `${textareaId.value}-error`)
const hintId = computed(() => `${textareaId.value}-hint`)

const describedBy = computed(() => {
  if (props.error) return errorId.value
  if (props.hint) return hintId.value
  return undefined
})

/** `maxHeight` is authored in CSS; only the numeric part is needed here. */
const maxHeightPx = computed(() => {
  const parsed = Number.parseFloat(props.maxHeight)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.POSITIVE_INFINITY
})

const controlClasses = computed(() =>
  cx(
    'block w-full scrollbar-none rounded-control border bg-surface px-3 py-2.5 text-base text-ink',
    'placeholder:text-ink-muted',
    'motion-safe:transition-colors',
    'focus:border-brand-500',
    'focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-offset-2',
    'focus-visible:ring-offset-surface',
    props.error ? 'border-danger' : 'border-line',
    props.disabled ? 'cursor-not-allowed opacity-60' : '',
  ),
)

function resize(): void {
  const element = textareaRef.value
  if (!element) return

  if (!props.autoGrow) {
    element.style.height = ''
    element.style.overflowY = ''
    return
  }

  element.style.height = 'auto'
  const contentHeight = element.scrollHeight
  const clamped = Math.min(contentHeight, maxHeightPx.value)

  element.style.height = clamped > 0 ? `${clamped}px` : ''
  element.style.overflowY = contentHeight > maxHeightPx.value ? 'auto' : 'hidden'
}

watch(
  () => [model.value, props.autoGrow, props.rows, props.maxHeight] as const,
  () => nextTick(resize),
)

onMounted(resize)

function onInput(event: Event): void {
  model.value = (event.target as HTMLTextAreaElement).value
}
</script>

<template>
  <div class="w-full">
    <label :for="textareaId" class="mb-1.5 block text-sm font-medium text-ink">
      {{ label }}<span v-if="required" class="text-danger" aria-hidden="true"> *</span>
    </label>

    <textarea
      :id="textareaId"
      ref="textareaRef"
      data-testid="base-textarea"
      :value="model"
      :rows="rows"
      :class="controlClasses"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      @input="onInput"
    />

    <p
      v-if="error"
      :id="errorId"
      role="alert"
      data-testid="base-textarea-error"
      class="mt-1.5 text-sm text-danger"
    >
      {{ error }}
    </p>
    <p
      v-else-if="hint"
      :id="hintId"
      data-testid="base-textarea-hint"
      class="mt-1.5 text-sm text-ink-muted"
    >
      {{ hint }}
    </p>
  </div>
</template>
