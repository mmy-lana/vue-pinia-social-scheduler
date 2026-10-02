<script setup lang="ts">
/**
 * The destinations that do not fit the phone's bottom bar, plus the two
 * account-level facts a phone user still needs at a glance.
 *
 * It is a `BaseSheet`, so it inherits the focus trap, the scroll lock, the
 * Escape/outside-tap dismissal and the drag handle. Open state lives in the UI
 * store, which is also what `BottomNav` reads, so the two can never disagree.
 */
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { BookOpen, Radio, TriangleAlert, Users } from 'lucide-vue-next'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import { SECONDARY_NAV } from '@/components/shell/SidebarNav.vue'
import { cx, pluralize } from '@/lib/utils'
import { useUiStore } from '@/stores/useUiStore'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { usePostsStore } from '@/stores/usePostsStore'

const ui = useUiStore()
const accounts = useAccountsStore()
const posts = usePostsStore()
const route = useRoute()
const router = useRouter()

const open = computed({
  get: () => ui.moreSheetOpen,
  set: (value: boolean) => ui.setMoreSheetOpen(value),
})

const activeName = computed<string | null>(() => {
  const name = route.name
  return typeof name === 'string' ? name : null
})

const disconnected = computed(() => accounts.accounts.filter((account) => !account.connected).length)
const failedCount = computed(() => posts.failed.length)

async function go(to: string): Promise<void> {
  open.value = false
  await router.push(to)
}

function openGuide(): void {
  open.value = false
  ui.openGuide()
}
</script>

<template>
  <BaseSheet v-model:open="open" title="More" side="bottom">
    <div data-testid="more-sheet">
      <div class="flex flex-col gap-1">
        <RouterLink
          v-for="entry in SECONDARY_NAV"
          :key="entry.name"
          :to="entry.to"
          :aria-current="activeName === entry.name ? 'page' : undefined"
          :class="
            cx(
              'tap-target flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium',
              activeName === entry.name
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                : 'text-ink motion-safe:hover:bg-surface-muted',
            )
          "
          :data-testid="`more-sheet-${entry.name}`"
          @click="open = false"
        >
          <component :is="entry.icon" class="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
          <span>{{ entry.label }}</span>
        </RouterLink>

        <RouterLink
          to="/dashboard"
          :class="
            cx(
              'tap-target flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium',
              activeName === 'dashboard'
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                : 'text-ink motion-safe:hover:bg-surface-muted',
            )
          "
          data-testid="more-sheet-timeline"
          @click="open = false"
        >
          <Radio class="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
          <span>Timeline</span>
        </RouterLink>

        <button
          type="button"
          class="tap-target flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm font-medium text-ink motion-safe:hover:bg-surface-muted"
          data-testid="more-sheet-guide"
          @click="openGuide"
        >
          <BookOpen class="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
          <span>Guide &amp; Manual</span>
        </button>
      </div>

      <div class="mt-4 flex flex-col gap-2 border-t border-line pt-4">
        <button
          v-if="disconnected > 0"
          type="button"
          class="tap-target flex items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm text-warn motion-safe:hover:bg-warn/10"
          data-testid="more-sheet-disconnected"
          @click="go('/channels')"
        >
          <TriangleAlert class="size-5 shrink-0" aria-hidden="true" />
          <span>
            {{ disconnected }} {{ pluralize(disconnected, 'channel') }} disconnected
          </span>
        </button>

        <button
          v-if="failedCount > 0"
          type="button"
          class="tap-target flex items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm text-danger motion-safe:hover:bg-danger/10"
          data-testid="more-sheet-failed"
          @click="go('/library')"
        >
          <Users class="size-5 shrink-0" aria-hidden="true" />
          <span>{{ failedCount }} failed {{ pluralize(failedCount, 'post') }}</span>
        </button>

        <p
          v-if="accounts.accounts.length === 0"
          class="px-3 py-2 text-sm text-ink-muted"
          data-testid="more-sheet-no-channels"
        >
          No channels connected yet.
        </p>
      </div>

      <div v-if="accounts.accounts.length > 0" class="mt-4 flex flex-wrap items-center gap-2 px-3">
        <span class="text-xs font-medium text-ink-muted">Connected</span>
        <BaseBadge
          v-for="account in accounts.connected"
          :key="account.id"
          :tone="account.connected ? 'ok' : 'danger'"
        >
          @{{ account.handle }}
        </BaseBadge>
      </div>
    </div>
  </BaseSheet>
</template>