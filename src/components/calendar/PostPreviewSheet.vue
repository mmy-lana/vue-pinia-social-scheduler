<script setup lang="ts">
/**
 * What tapping a calendar chip opens: the full card plus its actions.
 *
 * A sheet below 768 px and a centred modal above it, so the content gets the
 * whole screen on a phone without duplicating the card. `PostCard` already
 * carries the whole action matrix, so this only has to present it and forward
 * the chosen action upward.
 */
import { computed } from 'vue'
import PostCard from '@/components/posts/PostCard.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { formatDateTimeWithZone } from '@/lib/datetime'
import type { Post, PostActionId } from '@/types'

const props = defineProps<{
  post: Post | null
}>()

const emit = defineEmits<{
  close: []
  action: [postId: string, action: PostActionId]
}>()

const { isMobile } = useBreakpoint()
const settings = useSettingsStore()

const open = computed(() => props.post !== null)

const title = computed<string>(() =>
  props.post === null
    ? ''
    : props.post.scheduledAt === null
      ? 'Draft'
      : formatDateTimeWithZone(props.post.scheduledAt, settings.tz, settings.is24h),
)

function onAction(postId: string, action: PostActionId): void {
  emit('action', postId, action)
  emit('close')
}
</script>

<template>
  <BaseSheet
    v-if="isMobile"
    :open="open"
    :title="title"
    side="bottom"
    data-testid="post-preview-sheet"
    @update:open="(value) => { if (!value) emit('close') }"
  >
    <div v-if="post" data-testid="post-preview-sheet">
      <PostCard :post="post" @action="onAction" />
    </div>
  </BaseSheet>

  <BaseModal
    v-else
    :open="open"
    :title="title"
    size="lg"
    @update:open="(value) => { if (!value) emit('close') }"
  >
    <div v-if="post" data-testid="post-preview-sheet">
      <PostCard :post="post" @action="onAction" />
    </div>
  </BaseModal>
</template>