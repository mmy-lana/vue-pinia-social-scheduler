<script setup lang="ts">
/**
 * A checkable row with an optional third "partially checked" state.
 *
 * The real `<input type="checkbox">` sits invisibly on top of the painted box
 * and keeps full focus behaviour (`peer-focus-visible` puts the ring on the
 * box), while the surrounding `<label>` makes the label text part of the touch
 * target. `indeterminate` is a DOM property rather than an attribute, so it is
 * mirrored onto the element on mount and on every change.
 */
import { computed, onMounted, ref, useId, watch } from 'vue'
import { Check, Minus } from 'lucide-vue-next'
import { cx } from '@/lib/utils'

const model = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    /** Visible check name. */
    label: string
    /** Secondary line explaining what is being checked. */
    description?: string
    disabled?: boolean
    /** Renders the mixed state: neither checked nor unchecked. */
    indeterminate?: boolean
    /** Falls back to a stable per-instance id. */
    id?: string
  }>(),
  {
    disabled: false,
    indeterminate: false,
  },
)

const uid = useId()
const inputRef = ref<HTMLInputElement | null>(null)

const checkboxId = computed(() => props.id ?? `base-checkbox-${uid}`)
const labelId = computed(() => `${checkboxId.value}-label`)
const descriptionId = computed(() => `${checkboxId.value}-description`)

/** `mixed` is the ARIA spelling of the indeterminate state. */
const ariaChecked = computed(() => (props.indeterminate ? 'mixed' : model.value ? 'true' : 'false'))

const rowClasses = computed(() =>
  cx(
    'flex min-h-11 w-full items-start gap-3 rounded-control py-2 pe-2',
    props.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
  ),
)

const boxClasses = computed(() =>
  cx(
    'flex size-5 shrink-0 items-center justify-center rounded-md border',
    'motion-safe:transition-colors',
    'peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-focus-visible:ring-offset-2',
    'peer-focus-visible:ring-offset-surface',
    model.value || props.indeterminate
      ? 'border-brand-600 bg-brand-600 text-white'
      : 'border-line bg-surface text-transparent',
  ),
)

function syncIndeterminate(): void {
  if (inputRef.value) inputRef.value.indeterminate = props.indeterminate
}

watch(() => props.indeterminate, syncIndeterminate, { flush: 'post' })

onMounted(syncIndeterminate)

function onChange(event: Event): void {
  model.value = (event.target as HTMLInputElement).checked
  // Browsers clear the property on click; the prop owns it, so restore it.
  void Promise.resolve().then(syncIndeterminate)
}
</script>

<template>
  <label :for="checkboxId" :class="rowClasses">
    <span class="relative flex size-5 shrink-0 items-center justify-center">
      <input
        :id="checkboxId"
        ref="inputRef"
        type="checkbox"
        data-testid="base-checkbox"
        class="peer absolute inset-0 size-5 appearance-none rounded-md opacity-0 disabled:cursor-not-allowed"
        :checked="model"
        :disabled="disabled"
        :aria-checked="ariaChecked"
        :aria-labelledby="labelId"
        :aria-describedby="description ? descriptionId : undefined"
        @change="onChange"
      />
      <span :class="boxClasses" aria-hidden="true">
        <Minus v-if="indeterminate" class="size-3.5" />
        <Check v-else-if="model" class="size-3.5" />
      </span>
    </span>

    <span class="min-w-0 flex-1">
      <span :id="labelId" class="block text-sm font-medium text-ink">{{ label }}</span>
      <span v-if="description" :id="descriptionId" class="mt-0.5 block text-sm text-ink-muted">
        {{ description }}
      </span>
    </span>
  </label>
</template>
