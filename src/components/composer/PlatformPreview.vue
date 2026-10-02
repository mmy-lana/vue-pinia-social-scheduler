<script setup lang="ts">
/**
 * Live per-channel preview of the post being composed.
 *
 * One tab per selected channel, because the same text reads differently on each
 * platform: the truncation rule is the strictest channel's, and Instagram's
 * requirement for a photo is visible before submission rather than as an error
 * afterwards. No remote assets and no platform SDK — these are honest local
 * mockups built from `PLATFORMS` metadata, and they say so.
 */
import { computed, ref, watch } from 'vue'
import { ImageOff } from 'lucide-vue-next'
import BaseAvatar from '@/components/ui/BaseAvatar.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import PlatformIcon from '@/components/accounts/PlatformIcon.vue'
import { cx, pluralize } from '@/lib/utils'
import { PLATFORMS, platformLabel } from '@/lib/platforms'
import { useMediaStore } from '@/stores/useMediaStore'
import type { MediaAsset, PlatformId, SocialAccount } from '@/types'

const props = defineProps<{
  content: string
  mediaIds: string[]
  accounts: SocialAccount[]
}>()

const media = useMediaStore()

const activeId = ref<string | null>(null)

watch(
  () => props.accounts.map((account) => account.id).join(','),
  () => {
    const stillThere = props.accounts.some((account) => account.id === activeId.value)
    if (!stillThere) activeId.value = props.accounts[0]?.id ?? null
  },
  { immediate: true },
)

const active = computed<SocialAccount | null>(
  () => props.accounts.find((account) => account.id === activeId.value) ?? props.accounts[0] ?? null,
)

const meta = computed(() => (active.value ? PLATFORMS[active.value.platform] : null))

/** The strictest selected channel decides where the preview has to cut off. */
const strictest = computed<{ limit: number; by: PlatformId } | null>(() => {
  if (props.accounts.length === 0) return null
  let best = props.accounts[0].platform
  for (const account of props.accounts) {
    if (PLATFORMS[account.platform].maxChars < PLATFORMS[best].maxChars) best = account.platform
  }
  return { limit: PLATFORMS[best].maxChars, by: best }
})

const overflow = computed<boolean>(() => {
  if (!strictest.value) return false
  return props.content.trim().length > strictest.value.limit
})

const visibleContent = computed<string>(() => {
  if (!strictest.value || !overflow.value) return props.content
  return props.content.trim().slice(0, strictest.value.limit)
})

const assets = computed<MediaAsset[]>(() => media.resolveMany(props.mediaIds))

const needsMedia = computed<boolean>(
  () => meta.value?.requiresMedia === true && assets.value.length === 0,
)

const overMediaCap = computed<boolean>(() => {
  if (!meta.value) return false
  return props.mediaIds.length > meta.value.maxMedia
})

function select(id: string): void {
  activeId.value = id
}
</script>

<template>
  <div class="flex flex-col gap-3" data-testid="platform-preview">
    <div
      v-if="accounts.length > 0"
      class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
      role="tablist"
      aria-label="Preview per channel"
      data-testid="platform-preview-tabs"
    >
      <button
        v-for="account in accounts"
        :id="`platform-preview-tab-${account.id}`"
        :key="account.id"
        type="button"
        role="tab"
        :aria-selected="active?.id === account.id"
        :aria-controls="`platform-preview-panel-${account.id}`"
        :class="
          cx(
            'tap-target flex items-center gap-2 rounded-full border px-3 text-sm font-medium',
            'motion-safe:transition-colors motion-safe:duration-150',
            active?.id === account.id
              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
              : 'border-line bg-surface text-ink-muted motion-safe:hover:bg-surface-muted',
          )
        "
        :data-testid="`platform-preview-tab-${account.id}`"
        @click="select(account.id)"
      >
        <PlatformIcon :platform="account.platform" size="xs" />
        <span class="max-w-24 truncate">@{{ account.handle }}</span>
      </button>
    </div>

    <div
      v-if="active && meta"
      :id="`platform-preview-panel-${active.id}`"
      role="tabpanel"
      :aria-labelledby="`platform-preview-tab-${active.id}`"
      class="card-surface overflow-hidden rounded-card p-4"
      data-testid="platform-preview-panel"
      :data-platform="active.platform"
    >
      <div class="flex items-center gap-3">
        <BaseAvatar :name="active.displayName" :hue="active.avatarHue" size="sm" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-ink">{{ active.displayName }}</p>
          <p class="truncate text-xs text-ink-muted">@{{ active.handle }}</p>
        </div>
        <BaseBadge tone="neutral" :data-platform="active.platform">
          <PlatformIcon :platform="active.platform" size="xs" />
          {{ platformLabel(active.platform) }}
        </BaseBadge>
      </div>

      <p
        v-if="content.trim().length > 0"
        class="mt-3 text-sm whitespace-pre-line text-ink"
        data-testid="platform-preview-content"
      >
        {{ visibleContent }}
      </p>
      <p v-else class="mt-3 text-sm text-ink-muted italic" data-testid="platform-preview-empty">
        Nothing written yet.
      </p>

      <p
        v-if="overflow && strictest"
        class="mt-2 text-sm text-danger"
        data-testid="platform-preview-truncated"
      >
        Truncated — {{ platformLabel(strictest.by) }} stops at {{ strictest.limit }} characters.
      </p>

      <div
        v-if="assets.length > 0"
        class="mt-3 grid gap-2"
        :class="assets.length === 1 ? 'grid-cols-1' : 'grid-cols-2'"
        data-testid="platform-preview-media"
      >
        <img
          v-for="asset in assets"
          :key="asset.id"
          :src="asset.dataUrl"
          :alt="asset.name"
          class="aspect-video w-full rounded-control object-cover"
        />
      </div>

      <p
        v-if="needsMedia"
        class="mt-3 flex items-center gap-2 rounded-control bg-warn/15 px-3 py-2 text-sm text-warn"
        data-testid="platform-preview-needs-media"
      >
        <ImageOff class="size-4 shrink-0" aria-hidden="true" />
        {{ platformLabel(active.platform) }} posts need at least one image.
      </p>

      <p
        v-else-if="overMediaCap && meta"
        class="mt-3 rounded-control bg-danger/10 px-3 py-2 text-sm text-danger"
        data-testid="platform-preview-media-over"
      >
        {{ platformLabel(active.platform) }} allows at most
        {{ pluralize(meta.maxMedia, 'image') }}.
      </p>
    </div>

    <BaseEmptyState
      v-else
      compact
      title="No channel selected"
      description="Pick a channel above to see how this will look there."
      data-testid="platform-preview-no-account"
    />
  </div>
</template>