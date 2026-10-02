<script setup lang="ts">
/**
 * Channel multi-select for the composer.
 *
 * A horizontally scrollable chip row beats a multi-select box here: a post goes
 * to one to four channels, they are always visible side by side, and the whole
 * chip is the target rather than a small checkbox. The row scrolls instead of
 * wrapping so the composer never jumps while channels are being added.
 *
 * Disconnected accounts stay in the row — hiding a channel the user can see is
 * worse than showing why it cannot be picked — but they are dimmed, captioned
 * and not selectable, so a tap is never a silent no-op.
 */
import { computed } from 'vue'
import { Check, PlugZap } from 'lucide-vue-next'
import BaseAvatar from '@/components/ui/BaseAvatar.vue'
import { platformLabel } from '@/lib/platforms'
import { cx } from '@/lib/utils'
import type { SocialAccount } from '@/types'

const model = defineModel<string[]>({ required: true })

const props = withDefaults(
  defineProps<{
    accounts: SocialAccount[]
    disabled?: boolean
    error?: string
  }>(),
  {
    disabled: false,
  },
)

const selected = computed(() => new Set(model.value))

const selectionSummary = computed(() => {
  const count = model.value.length
  if (count === 0) return 'No channels selected'
  return `${count} of ${props.accounts.length} channels selected`
})

function isSelected(id: string): boolean {
  return selected.value.has(id)
}

function toggle(account: SocialAccount): void {
  if (props.disabled || !account.connected) return
  const next = model.value.slice()
  const index = next.indexOf(account.id)
  if (index === -1) next.push(account.id)
  else next.splice(index, 1)
  model.value = next
}
</script>

<template>
  <div data-testid="account-picker" data-composer-field="accounts">
    <div class="mb-1.5 flex items-baseline justify-between gap-2">
      <span class="text-sm font-medium text-ink">Channels</span>
      <span class="text-xs text-ink-muted" data-testid="account-picker-summary">
        {{ selectionSummary }}
      </span>
    </div>

    <div
      class="-mx-1 flex snap-x gap-2 overflow-x-auto scrollbar-none px-1 pb-1"
      role="group"
      aria-label="Channels"
    >
      <button
        v-for="account in props.accounts"
        :key="account.id"
        type="button"
        :aria-pressed="isSelected(account.id) ? 'true' : 'false'"
        :disabled="props.disabled || !account.connected"
        :class="
          cx(
            'flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-control border px-3 py-2 text-left',
            'motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-snap',
            'focus-visible:ring-brand-500 focus-visible:ring-2',
            isSelected(account.id) ? 'border-brand-500 bg-brand-50 text-ink' : 'border-line bg-surface text-ink',
            account.connected
              ? 'motion-safe:hover:bg-surface-muted motion-safe:active:bg-surface-muted'
              : 'cursor-not-allowed opacity-60',
            props.disabled && 'cursor-not-allowed opacity-60',
          )
        "
        data-testid="account-chip"
        :data-account-id="account.id"
        @click="toggle(account)"
      >
        <span aria-hidden="true" class="shrink-0">
          <BaseAvatar :name="account.displayName" :hue="account.avatarHue" size="sm" />
        </span>

        <span class="flex min-w-0 flex-col">
          <span class="flex items-center gap-1.5 text-sm font-medium">
            <span class="max-w-36 truncate">{{ account.displayName }}</span>
            <span class="text-xs font-normal text-ink-muted">
              {{ platformLabel(account.platform) }}
            </span>
          </span>

          <span
            v-if="!account.connected"
            class="flex items-center gap-1 text-xs font-medium text-warn"
            data-testid="account-chip-disconnected"
          >
            <PlugZap class="size-3.5 shrink-0" aria-hidden="true" />
            Disconnected
          </span>
        </span>

        <Check
          v-if="isSelected(account.id)"
          class="size-4 shrink-0 text-brand-600"
          aria-hidden="true"
          data-testid="account-chip-check"
        />
      </button>
    </div>

    <p
      v-if="props.error"
      role="alert"
      data-testid="account-picker-error"
      class="mt-1.5 text-sm text-danger"
    >
      {{ props.error }}
    </p>
  </div>
</template>
