<script setup lang="ts">
/**
 * The 1–4 image block inside a post card.
 *
 * Ids are resolved through the media store, so a file deleted from the library
 * simply drops out of the block: nothing resolves means no grid at all, never an
 * empty bordered box. Layout follows the familiar card pattern — one wide 16:9
 * frame, two side by side, one large plus two small, or a 2×2 square — and every
 * frame is a real button (44 px minimum, named "View photo 2 of 3: file.png")
 * that opens the lightbox on the tapped image.
 */
import { computed, ref } from 'vue'
import MediaLightbox from '@/components/posts/MediaLightbox.vue'
import { useMediaStore } from '@/stores/useMediaStore'
import { cx } from '@/lib/utils'
import type { MediaAsset } from '@/types'

const props = defineProps<{
  mediaIds: string[]
}>()

const media = useMediaStore()

/** Missing ids are filtered out here rather than rendering a broken frame. */
const assets = computed<MediaAsset[]>(() => media.resolveMany(props.mediaIds))

const open = ref(false)
const index = ref(0)

const gridClass = computed<string>(() =>
  cx(
    'grid w-full overflow-hidden rounded-control bg-surface-muted',
    assets.value.length === 1 && 'aspect-video',
    assets.value.length === 2 && 'grid-cols-2 gap-1.5',
    assets.value.length >= 3 && 'aspect-square grid-cols-2 grid-rows-2 gap-1.5',
  ),
)

function itemClass(position: number): string {
  const total = assets.value.length
  return cx(
    'relative block w-full overflow-hidden bg-surface-muted',
    'motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-snap motion-safe:hover:opacity-90',
    'focus-visible:ring-brand-500 focus-visible:ring-2 focus-visible:ring-inset',
    total === 1 && 'aspect-video',
    total === 2 && 'aspect-square',
    total >= 3 && 'h-full',
    total === 3 && position === 0 && 'row-span-2',
  )
}

function label(asset: MediaAsset, position: number): string {
  return `View photo ${position + 1} of ${assets.value.length}: ${asset.name}`
}

function openAt(position: number): void {
  index.value = position
  open.value = true
}
</script>

<template>
  <template v-if="assets.length > 0">
    <div :class="gridClass" data-testid="media-grid" :data-count="assets.length">
      <button
        v-for="(asset, position) in assets"
        :key="asset.id"
        type="button"
        :class="itemClass(position)"
        :aria-label="label(asset, position)"
        data-testid="media-item"
        :data-media-id="asset.id"
        :data-position="position"
        @click="openAt(position)"
      >
        <img
          :src="asset.dataUrl"
          alt=""
          class="size-full object-cover"
          loading="lazy"
          decoding="async"
          data-testid="media-item-image"
        />
      </button>
    </div>

    <MediaLightbox v-model:open="open" v-model:index="index" :assets="assets" />
  </template>
</template>