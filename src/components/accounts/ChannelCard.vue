<script setup lang="ts">
/**
 * One channel in the Channels grid.
 *
 * The card is presentational: it owns the rename editor's open/closed state and
 * nothing else — connecting, disconnecting and removing all leave through
 * emits, because each of them needs a confirm dialog and an undo toast that
 * belong to the page, not to the row.
 *
 * A disconnected channel dims its identity block and the platform glyph so the
 * reason it cannot post is visible at a glance, while its actions stay at full
 * contrast and remain reachable.
 */
import { computed, nextTick, ref } from 'vue'
import { Check, Pencil, PlugZap, Trash2, Unplug } from 'lucide-vue-next'
import BaseAvatar from '@/components/ui/BaseAvatar.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import PlatformIcon from '@/components/accounts/PlatformIcon.vue'
import { PLATFORMS, platformLabel } from '@/lib/platforms'
import { validateDisplayName } from '@/lib/validation'
import { cx, formatInteger, pluralize } from '@/lib/utils'
import type { SocialAccount } from '@/types'

const props = withDefaults(
  defineProps<{
    account: SocialAccount
    /** Posts of this channel that are scheduled or publishing. */
    scheduledCount?: number
    /** Weekly posting times configured for this channel. */
    slotCount?: number
  }>(),
  {
    scheduledCount: 0,
    slotCount: 0,
  },
)

const emit = defineEmits<{
  disconnect: []
  connect: []
  remove: []
  rename: [displayName: string]
}>()

const renaming = ref(false)
const draftName = ref('')
const renameError = ref<string | null>(null)
const renameForm = ref<HTMLFormElement | null>(null)

const isConnected = computed(() => props.account.connected)
/** The glyph's halo, mixed from the platform accent — data, not a token. */
const accentColor = computed(
  () => `color-mix(in oklab, ${PLATFORMS[props.account.platform].color} 14%, transparent)`,
)

const scheduledText = computed(
  () => `${formatInteger(props.scheduledCount)} ${pluralize(props.scheduledCount, 'post')}`,
)
const slotText = computed(
  () => `${formatInteger(props.slotCount)} ${pluralize(props.slotCount, 'slot')} / week`,
)

function startRename(): void {
  draftName.value = props.account.displayName
  renameError.value = null
  renaming.value = true
  void nextTick(() => renameForm.value?.querySelector('input')?.focus())
}

function cancelRename(): void {
  renaming.value = false
  renameError.value = null
}

function saveRename(): void {
  const error = validateDisplayName(draftName.value)
  if (error) {
    renameError.value = error
    return
  }
  const next = draftName.value.trim()
  renaming.value = false
  renameError.value = null
  emit('rename', next)
}

function onRenameKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') cancelRename()
}

function onToggleConnection(): void {
  if (isConnected.value) emit('disconnect')
  else emit('connect')
}
</script>

<template>
  <BaseCard
    padding="md"
    class="flex h-full flex-col gap-4"
    data-testid="channel-card"
    :data-connected="String(isConnected)"
    :data-platform="props.account.platform"
  >
    <div
      :class="cx('flex items-start gap-3', !isConnected && 'opacity-70')"
      data-testid="channel-card-identity"
    >
      <BaseAvatar
        :name="props.account.displayName"
        :hue="props.account.avatarHue"
        size="lg"
        :status="isConnected ? 'online' : 'offline'"
      />

      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h3 class="truncate font-semibold text-ink" data-testid="channel-card-name">
            {{ props.account.displayName }}
          </h3>
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-full"
            :style="{ backgroundColor: accentColor }"
            aria-hidden="true"
          >
            <PlatformIcon :platform="props.account.platform" size="xs" :muted="!isConnected" />
          </span>
        </div>
        <p class="truncate text-sm text-ink-muted">
          <span data-testid="channel-card-handle">@{{ props.account.handle }}</span>
          <span aria-hidden="true"> · </span>
          <span data-testid="channel-card-platform">{{ platformLabel(props.account.platform) }}</span>
        </p>
      </div>

      <span class="shrink-0" data-testid="channel-card-status">
        <BaseBadge :tone="isConnected ? 'ok' : 'warn'">
          {{ isConnected ? 'Connected' : 'Disconnected' }}
        </BaseBadge>
      </span>
    </div>

    <div
      :class="cx('flex flex-wrap gap-x-6 gap-y-2', !isConnected && 'opacity-70')"
      data-testid="channel-card-metrics"
    >
      <div>
        <p class="text-xs font-medium tracking-wide text-ink-muted uppercase">Scheduled</p>
        <p class="text-sm font-semibold text-ink" data-testid="channel-card-scheduled-count">
          {{ scheduledText }}
        </p>
      </div>
      <div>
        <p class="text-xs font-medium tracking-wide text-ink-muted uppercase">Posting times</p>
        <p class="text-sm font-semibold text-ink" data-testid="channel-card-slot-count">
          {{ slotText }}
        </p>
      </div>
    </div>

    <form
      v-if="renaming"
      ref="renameForm"
      class="flex flex-col gap-2 rounded-control border border-line bg-surface-muted p-3"
      data-testid="channel-card-rename"
      @submit.prevent="saveRename"
      @keydown="onRenameKeydown"
    >
      <BaseInput
        v-model="draftName"
        label="Display name"
        :maxlength="40"
        autocomplete="off"
        data-field="displayName"
        :error="renameError ?? undefined"
      />
      <div class="flex flex-wrap items-center gap-2">
        <span class="inline-flex" data-testid="channel-card-rename-save">
          <BaseButton type="submit" size="sm" :icon-left="Check">Save</BaseButton>
        </span>
        <span class="inline-flex" data-testid="channel-card-rename-cancel">
          <BaseButton variant="ghost" size="sm" @click="cancelRename">Cancel</BaseButton>
        </span>
      </div>
    </form>

    <div class="mt-auto flex flex-wrap items-center gap-2">
      <span v-if="!renaming" class="inline-flex" data-testid="channel-card-rename-button">
        <BaseButton variant="ghost" size="sm" :icon-left="Pencil" @click="startRename">
          Rename
        </BaseButton>
      </span>

      <span class="inline-flex" data-testid="channel-card-connect">
        <BaseButton
          :variant="isConnected ? 'secondary' : 'primary'"
          size="sm"
          :icon-left="isConnected ? Unplug : PlugZap"
          @click="onToggleConnection"
        >
          {{ isConnected ? 'Disconnect' : 'Reconnect' }}
        </BaseButton>
      </span>

      <span class="inline-flex" data-testid="channel-card-remove">
        <BaseButton variant="danger" size="sm" :icon-left="Trash2" @click="emit('remove')">
          Remove
        </BaseButton>
      </span>
    </div>
  </BaseCard>
</template>