<script setup lang="ts">
/**
 * Photo attachments for the composer.
 *
 * Three ways in, one way out: a real `<input type="file">` behind an
 * always-visible button (the only one that works on a phone), drag and drop on
 * desktop, and per-thumbnail removal. Whichever route the files arrive by they
 * go through the same `useMediaUpload` pipeline, so validation, compression and
 * the library cap are enforced once, in the store — this component only owns the
 * transient busy state, the drop-target highlight and the model updates.
 *
 * The drop zone counts enter/leave pairs rather than toggling on each event:
 * dragging across child elements fires `dragleave` for every one of them, and a
 * naive flag makes the highlight strobe across the whole panel.
 */
import { computed, ref } from 'vue'
import { ImagePlus, TriangleAlert, X } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'
import { useMediaUpload } from '@/composables/useMediaUpload'
import { useMediaStore } from '@/stores/useMediaStore'
import { mediaAcceptAttribute } from '@/lib/media'
import { APP_MAX_MEDIA_PER_POST } from '@/lib/platforms'
import { cx, formatBytes, pluralize } from '@/lib/utils'

const model = defineModel<string[]>({ required: true })

const props = withDefaults(
  defineProps<{
    /** Per-post ceiling; the library-wide cap is enforced by the store. */
    max?: number
    disabled?: boolean
    error?: string
  }>(),
  {
    max: APP_MAX_MEDIA_PER_POST,
    disabled: false,
  },
)

const media = useMediaStore()
const { uploading, completed, errors, upload, clearErrors, maxAssets, atCapacity } = useMediaUpload()

const inputRef = ref<HTMLInputElement | null>(null)
const dragDepth = ref(0)

const accept = mediaAcceptAttribute()
const assets = computed(() => media.resolveMany(model.value))
const dragActive = computed(() => dragDepth.value > 0)
const atPostCap = computed(() => model.value.length >= props.max)
const pickerDisabled = computed(() => props.disabled || atPostCap.value)

const dropZoneClass = computed(() =>
  cx(
    'rounded-card border-2 border-dashed p-3 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-snap',
    dragActive.value ? 'border-brand-500 bg-brand-50' : 'border-line bg-surface',
    props.disabled ? 'cursor-not-allowed opacity-60' : 'bg-surface',
  ),
)

const busySummary = computed(() => {
  if (completed.value === 0) return 'Compressing…'
  return `Compressing… ${completed.value} of ${completed.value} done`
})

function openPicker(): void {
  if (pickerDisabled.value) return
  inputRef.value?.click()
}

async function handleFiles(files: FileList | readonly File[]): Promise<void> {
  if (props.disabled) return
  const outcome = await upload(files)
  if (outcome.added.length === 0) return
  // Order follows the pick order: the newest photos land at the end, and the
  // composer shows them in the order they were added.
  model.value = [...model.value, ...outcome.added.map((asset) => asset.id)]
  resetInput()
}

function resetInput(): void {
  const element = inputRef.value
  // Without this, re-picking the same file fires no `change` event.
  if (element) element.value = ''
}

async function onChange(event: Event): Promise<void> {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const files = input.files
  if (!files || files.length === 0) return
  await handleFiles(files)
}

function onDragEnter(event: DragEvent): void {
  if (props.disabled) return
  event.preventDefault()
  dragDepth.value += 1
}

function onDragOver(event: DragEvent): void {
  if (props.disabled) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onDragLeave(event: DragEvent): void {
  if (props.disabled) return
  event.preventDefault()
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  dragDepth.value = 0
  if (props.disabled) return
  const files = event.dataTransfer?.files
  if (files && files.length > 0) void handleFiles(files)
}

function removeAt(index: number): void {
  const id = model.value[index]
  if (id === undefined) return
  model.value = model.value.filter((existing) => existing !== id)
}
</script>

<template>
  <div data-testid="media-uploader" data-composer-field="media" class="w-full">
    <input
      ref="inputRef"
      type="file"
      multiple
      :accept="accept"
      class="sr-only"
      data-testid="media-uploader-input"
      @change="onChange"
    />

    <div
      :class="dropZoneClass"
      data-testid="media-uploader-dropzone"
      :data-drag-active="dragActive ? 'true' : 'false'"
      @dragenter="onDragEnter"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <div class="flex flex-wrap items-center gap-3">
        <BaseButton
          variant="secondary"
          :icon-left="ImagePlus"
          :disabled="pickerDisabled"
          :loading="uploading"
          data-testid="media-uploader-picker"
          @click="openPicker"
        >
          Add photos
        </BaseButton>

        <p class="flex-1 text-xs text-ink-muted" data-testid="media-uploader-hint">
          JPEG, PNG, WebP or GIF — up to {{ props.max }} {{ pluralize(props.max, 'photo') }} per
          post. You can also drop them here.
        </p>
      </div>

      <p
        v-if="uploading"
        class="mt-3 flex items-center gap-2 text-sm text-ink-muted"
        data-testid="media-uploader-busy"
      >
        <BaseSpinner size="sm" label="Compressing photos" />
        {{ busySummary }}
      </p>

      <ul
        v-if="assets.length > 0"
        class="mt-3 flex flex-wrap gap-2"
        data-testid="media-uploader-thumbs"
      >
        <li
          v-for="(asset, index) in assets"
          :key="asset.id"
          class="relative h-20 w-20 overflow-hidden rounded-control border border-line bg-surface-muted"
        >
          <img
            :src="asset.dataUrl"
            :alt="asset.name"
            class="size-full object-cover"
            data-testid="media-uploader-thumb"
          />
          <button
            type="button"
            :aria-label="`Remove photo ${index + 1}`"
            class="absolute top-0 right-0 grid size-11 place-items-center bg-danger/10 text-danger"
            data-testid="media-uploader-remove"
            @click="removeAt(index)"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
          <span class="sr-only">{{ asset.name }} — {{ formatBytes(asset.bytes) }}</span>
        </li>
      </ul>
    </div>

    <p
      v-if="atCapacity"
      class="mt-1.5 flex items-center gap-1.5 text-sm text-warn"
      data-testid="media-uploader-capacity"
    >
      <TriangleAlert class="size-4 shrink-0" aria-hidden="true" />
      Media library is full ({{ maxAssets }} items).
    </p>

    <p
      v-else-if="atPostCap"
      class="mt-1.5 flex items-center gap-1.5 text-sm text-ink-muted"
      data-testid="media-uploader-post-cap"
    >
      <TriangleAlert class="size-4 shrink-0" aria-hidden="true" />
      Up to {{ props.max }} {{ pluralize(props.max, 'photo') }} per post.
    </p>

    <div
      v-if="errors.length > 0"
      role="alert"
      class="mt-1.5 flex items-start gap-2 text-sm text-danger"
      data-testid="media-uploader-errors"
    >
      <TriangleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <ul class="flex-1 space-y-0.5">
        <li v-for="message in errors" :key="message">{{ message }}</li>
      </ul>
      <BaseButton
        variant="ghost"
        size="sm"
        aria-label="Dismiss upload errors"
        data-testid="media-uploader-errors-dismiss"
        @click="clearErrors"
      >
        Dismiss
      </BaseButton>
    </div>

    <p
      v-if="props.error"
      role="alert"
      data-testid="media-uploader-error"
      class="mt-1.5 text-sm text-danger"
    >
      {{ props.error }}
    </p>
  </div>
</template>
