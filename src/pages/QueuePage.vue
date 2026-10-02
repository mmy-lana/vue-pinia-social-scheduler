<script setup lang="ts">
/**
 * The posting queue: weekly times per channel, and what those times have filled.
 *
 * One tab per channel, because posting times are a per-channel idea. The editor
 * on the left owns the pattern; the list on the right shows the next posts that
 * pattern has already claimed, which is how a user verifies the pattern before
 * trusting it with a month of posts.
 */
import { computed, ref, watch } from 'vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import BaseTabs from '@/components/ui/BaseTabs.vue'
import SlotEditor from '@/components/queue/SlotEditor.vue'
import UpcomingQueueList from '@/components/queue/UpcomingQueueList.vue'
import { Link2 } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { usePostActions } from '@/composables/usePostActions'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { useSlotsStore } from '@/stores/useSlotsStore'
import type { PostActionId } from '@/types'

const accounts = useAccountsStore()
const posts = usePostsStore()
const slots = useSlotsStore()
const router = useRouter()
const actions = usePostActions()

const activeId = ref<string>(accounts.accounts[0]?.id ?? '')

watch(
  () => accounts.accounts.map((account) => account.id).join(','),
  () => {
    const stillThere = accounts.accounts.some((account) => account.id === activeId.value)
    if (!stillThere) activeId.value = accounts.accounts[0]?.id ?? ''
  },
)

const active = computed(() => accounts.get(activeId.value))

const tabs = computed(() =>
  accounts.accounts.map((account) => ({
    id: account.id,
    label: `@${account.handle}`,
    count: slots.forAccount(account.id).length,
  })),
)

const accountPosts = computed(() =>
  active.value === null ? [] : posts.forAccount(active.value.id),
)

function onAction(postId: string, action: PostActionId): void {
  void actions.run(postId, action)
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
    <BaseEmptyState
      v-if="accounts.accounts.length === 0"
      :icon="Link2"
      title="No channels yet"
      description="Connect a channel first — posting times belong to a channel."
      data-testid="queue-empty"
    >
      <template #action>
        <button
          type="button"
          class="tap-target rounded-control bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
          data-testid="queue-empty-connect"
          @click="router.push('/channels')"
        >
          Connect channel
        </button>
      </template>
    </BaseEmptyState>

    <template v-else>
      <BaseTabs
        v-if="active !== null"
        v-model="activeId"
        :tabs="tabs"
        ariaLabel="Choose a channel"
        class="mb-4"
        data-testid="queue-channel-tabs"
      />

      <div v-if="active !== null" class="grid gap-4 lg:grid-cols-2">
        <section aria-label="Posting times">
          <h2 class="mb-2 text-sm font-semibold text-ink">Posting times</h2>
          <SlotEditor :account="active" />
        </section>

        <section aria-label="Upcoming posts">
          <h2 class="mb-2 text-sm font-semibold text-ink">Upcoming</h2>
          <UpcomingQueueList :posts="accountPosts" @action="onAction" />
        </section>
      </div>
    </template>
  </div>
</template>