<script setup lang="ts">
/**
 * First-run card for an empty workspace.
 *
 * It reads the stores rather than taking props, and it renders nothing at all
 * once there is anything to do: the moment a channel or a post exists — or the
 * user dismisses the card — the card takes its own space out of the dashboard.
 *
 * "Load demo data" is not a mock: it runs the real `buildDemoData()` seed and
 * installs the result into the accounts, slots, posts and activity stores, so
 * every other screen has something genuine to render.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { PlugZap, Rocket, Sparkles, X } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import { buildDemoData } from '@/lib/seed'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { useActivityStore } from '@/stores/useActivityStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useSlotsStore } from '@/stores/useSlotsStore'
import { useUiStore } from '@/stores/useUiStore'

const router = useRouter()

const accounts = useAccountsStore()
const activity = useActivityStore()
const posts = usePostsStore()
const settings = useSettingsStore()
const slots = useSlotsStore()
const ui = useUiStore()

const visible = computed(
  () => !ui.onboardingDismissed && posts.posts.length === 0 && accounts.accounts.length === 0,
)

function goToChannels(): void {
  void router.push('/channels')
}

function loadDemoData(): void {
  const demo = buildDemoData(new Date(), settings.tz)

  accounts.replaceAll(demo.accounts)
  slots.replaceAll(demo.slots)
  posts.replaceAll(demo.posts)
  activity.prepend(demo.activity)

  ui.toast({ tone: 'ok', message: 'Demo data loaded' })
}
</script>

<template>
  <BaseCard
    v-if="visible"
    padding="lg"
    class="flex flex-col gap-4"
    data-testid="onboarding-card"
  >
    <div class="flex items-start gap-3">
      <span
        class="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
        aria-hidden="true"
      >
        <Rocket class="size-5" />
      </span>
      <div class="min-w-0">
        <h2 class="text-lg font-semibold text-balance-pretty text-ink">Start scheduling</h2>
        <p class="text-sm text-balance-pretty text-ink-muted">
          Connect a channel to plan posts, or load demo data to look around first.
        </p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span class="inline-flex" data-testid="onboarding-connect">
        <BaseButton :icon-left="PlugZap" @click="goToChannels">Connect channel</BaseButton>
      </span>
      <span class="inline-flex" data-testid="onboarding-demo">
        <BaseButton variant="secondary" :icon-left="Sparkles" @click="loadDemoData">
          Load demo data
        </BaseButton>
      </span>
      <span class="inline-flex" data-testid="onboarding-dismiss">
        <BaseButton variant="ghost" :icon-left="X" @click="ui.dismissOnboarding()">
          Dismiss
        </BaseButton>
      </span>
    </div>
  </BaseCard>
</template>