<script setup lang="ts">
/**
 * Connected channels: connect, disconnect, rename and remove.
 *
 * Removing is a cascade — the channel takes its posting times and its posts with
 * it — so it confirms first, says exactly what will go, and offers Undo for the
 * next 8 seconds. Disconnecting is deliberately softer: the channel stays, and
 * the warning explains that its scheduled posts will fail until it is back,
 * which is a different and recoverable problem from deleting it.
 */
import { computed, ref } from 'vue'
import { Link2, Plus } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import ChannelCard from '@/components/accounts/ChannelCard.vue'
import ConnectChannelForm from '@/components/accounts/ConnectChannelForm.vue'
import { pluralize } from '@/lib/utils'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { useSlotsStore } from '@/stores/useSlotsStore'
import { useUiStore } from '@/stores/useUiStore'
import { useConfirm } from '@/composables/useConfirm'
import type { PlatformId, SocialAccount } from '@/types'

const accounts = useAccountsStore()
const posts = usePostsStore()
const slots = useSlotsStore()
const ui = useUiStore()
const { confirm } = useConfirm()

const formOpen = ref(false)
const submitting = ref(false)

const connected = computed(() => accounts.connected.length)
const disconnected = computed(() => accounts.accounts.length - connected.value)

function scheduledCountFor(account: SocialAccount): number {
  return posts.posts.filter(
    (post) =>
      post.accountId === account.id && (post.status === 'scheduled' || post.status === 'publishing'),
  ).length
}

function openForm(): void {
  formOpen.value = true
}

function onSubmit(input: { platform: PlatformId; handle: string; displayName: string }): void {
  submitting.value = true
  const result = accounts.add(input)
  submitting.value = false
  if (!result.ok) return

  formOpen.value = false
  ui.toast({ tone: 'ok', message: `Connected @${result.value.handle}` })
}

async function onDisconnect(account: SocialAccount): Promise<void> {
  const scheduled = scheduledCountFor(account)
  if (scheduled === 0) {
    accounts.setConnected(account.id, false)
    ui.toast({ tone: 'warn', message: `@${account.handle} disconnected` })
    return
  }

  const ok = await confirm({
    title: `Disconnect @${account.handle}?`,
    message: `${pluralize(scheduled, 'scheduled post')} for this channel will fail until you reconnect it.`,
    confirmLabel: 'Disconnect',
    cancelLabel: 'Cancel',
    tone: 'warn',
  })
  if (!ok) return

  accounts.setConnected(account.id, false)
  ui.toast({
    tone: 'warn',
    message: `@${account.handle} disconnected — ${pluralize(scheduled, 'post')} will fail until you reconnect`,
  })
}

function onConnect(account: SocialAccount): void {
  const result = accounts.setConnected(account.id, true)
  if (!result.ok) {
    ui.toast({ tone: 'danger', message: result.error })
    return
  }
  ui.toast({ tone: 'ok', message: `@${account.handle} reconnected` })
}

async function onRemove(account: SocialAccount): Promise<void> {
  const scheduled = scheduledCountFor(account)
  const slotCount = slots.forAccount(account.id).length
  const postCount = posts.forAccount(account.id).length

  const details: string[] = []
  if (postCount > 0) details.push(pluralize(postCount, 'post'))
  if (slotCount > 0) details.push(pluralize(slotCount, 'posting time'))
  if (scheduled > 0) details.push(`${scheduled} of them scheduled`)

  const ok = await confirm({
    title: `Remove @${account.handle}?`,
    message:
      details.length > 0
        ? `This also deletes ${details.join(', ')}. You can undo for a few seconds afterwards.`
        : 'This channel has no posts yet. You can undo for a few seconds afterwards.',
    confirmLabel: 'Remove channel',
    cancelLabel: 'Cancel',
    tone: 'danger',
  })
  if (!ok) return

  const snapshot = accounts.remove(account.id)
  if (snapshot === null) return

  ui.toast({
    tone: 'neutral',
    message: `Removed @${account.handle}${
      postCount > 0 ? ` and ${pluralize(postCount, 'post')}` : ''
    }`,
    durationMs: 8_000,
    actionLabel: 'Undo',
    onAction: () => accounts.restore(snapshot),
  })
}

function onRename(account: SocialAccount, displayName: string): void {
  const result = accounts.rename(account.id, displayName)
  if (!result.ok) {
    ui.toast({ tone: 'danger', message: result.error })
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h2 class="text-base font-bold text-ink">Channels</h2>
        <p class="text-sm text-ink-muted" data-testid="channels-summary">
          {{ connected }} connected<span v-if="disconnected > 0"> · {{ disconnected }} disconnected</span>
        </p>
      </div>
      <BaseButton
        class="ms-auto"
        variant="primary"
        :icon-left="Plus"
        data-testid="channels-connect"
        @click="openForm"
      >
        Connect channel
      </BaseButton>
    </div>

    <ul
      v-if="accounts.accounts.length > 0"
      class="mt-4 grid gap-3 sm:grid-cols-2"
      data-testid="channels-list"
    >
      <li v-for="account in accounts.accounts" :key="account.id">
        <ChannelCard
          :account="account"
          :scheduled-count="scheduledCountFor(account)"
          :slot-count="slots.forAccount(account.id).length"
          @disconnect="onDisconnect(account)"
          @connect="onConnect(account)"
          @remove="onRemove(account)"
          @rename="onRename(account, $event)"
        />
      </li>
    </ul>

    <BaseEmptyState
      v-else
      :icon="Link2"
      title="No channels connected"
      description="Connect the accounts you post from. Each one gets its own posting times and its own calendar."
      data-testid="channels-empty"
    >
      <template #action>
        <BaseButton variant="primary" data-testid="channels-empty-connect" @click="openForm">
          Connect channel
        </BaseButton>
      </template>
    </BaseEmptyState>

    <ConnectChannelForm
      :open="formOpen"
      :submitting="submitting"
      @submit="onSubmit"
      @cancel="formOpen = false"
    />
  </div>
</template>