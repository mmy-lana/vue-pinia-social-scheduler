<script setup lang="ts">
/**
 * The weekly posting-time grid for one channel: seven weekday rows, plus the
 * three actions that operate on all of them.
 *
 * "Use default times", "Copy to all channels" and "Clear all" are destructive
 * enough to be worth confirming, so they go through `useConfirm` — except
 * "Use default times", which only ever adds the standard Mon–Fri pattern the
 * user has not defined, and can be undone by removing the chips.
 *
 * Validation comes back from the slots store as a `Result`, so an inline message
 * sits beside the row that caused it.
 */
import { ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import WeekdaySlotRow from '@/components/queue/WeekdaySlotRow.vue'
import { CalendarPlus } from 'lucide-vue-next'
import { pluralize } from '@/lib/utils'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { useSlotsStore } from '@/stores/useSlotsStore'
import { useConfirm } from '@/composables/useConfirm'
import { useUiStore } from '@/stores/useUiStore'
import type { SocialAccount, Weekday } from '@/types'

const props = defineProps<{
  account: SocialAccount
}>()

const slots = useSlotsStore()
const accounts = useAccountsStore()
const ui = useUiStore()
const { confirm } = useConfirm()

/** `weekday → message`, shown next to the row that produced it. */
const errors = ref<Partial<Record<Weekday, string>>>({})

const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

const rows = WEEKDAYS.map((weekday) => ({
  weekday,
  slots: slots.forAccount(props.account.id).filter((slot) => slot.weekday === weekday),
}))

const total = slots.forAccount(props.account.id).length

function onAdd(weekday: Weekday, time: string): void {
  const result = slots.add(props.account.id, weekday, time)
  if (result.ok) {
    errors.value = { ...errors.value, [weekday]: undefined }
    return
  }
  errors.value = { ...errors.value, [weekday]: result.error }
}

function onRemove(slotId: string): void {
  slots.remove(slotId)
}

function useDefaults(): void {
  const added = slots.seedDefault(props.account.id)
  errors.value = {}
  ui.toast({
    tone: 'ok',
    message: `Added ${pluralize(added.length, 'posting time')} for @${props.account.handle}`,
  })
}

async function copyToAll(): Promise<void> {
  const others = accounts.accounts.filter((account) => account.id !== props.account.id)
  if (others.length === 0) {
    ui.toast({ tone: 'warn', message: 'Connect another channel to copy these times to.' })
    return
  }

  const ok = await confirm({
    title: 'Copy to all channels?',
    message: `This replaces the posting times of ${pluralize(others.length, 'other channel')} with @${props.account.handle}'s pattern.`,
    confirmLabel: 'Copy times',
    cancelLabel: 'Cancel',
    tone: 'warn',
  })
  if (!ok) return

  const copied = slots.copyToAll(
    props.account.id,
    others.map((account) => account.id),
  )
  ui.toast({
    tone: 'ok',
    message: `Updated ${pluralize(copied.length, 'posting time')} across ${pluralize(others.length, 'channel')}`,
  })
}

async function clearAll(): Promise<void> {
  const ok = await confirm({
    title: 'Clear all posting times?',
    message: `This removes every posting time for @${props.account.handle}. Posts already in the queue keep their times.`,
    confirmLabel: 'Clear times',
    cancelLabel: 'Cancel',
    tone: 'danger',
  })
  if (!ok) return

  const removed = slots.clearForAccount(props.account.id)
  errors.value = {}
  ui.toast({ tone: 'neutral', message: `Removed ${pluralize(removed.length, 'posting time')}` })
}
</script>

<template>
  <BaseCard padding="sm" data-testid="slot-editor">
    <template v-if="total === 0">
      <BaseEmptyState
        compact
        :icon="CalendarPlus"
        title="Set your posting times"
        description="Add the days and hours you normally post. 'Add to queue' will then fill the next free one automatically."
        data-testid="slot-editor-empty"
      >
        <template #action>
          <BaseButton variant="primary" data-testid="slot-editor-defaults" @click="useDefaults">
            Use default times
          </BaseButton>
        </template>
      </BaseEmptyState>
    </template>

    <template v-else>
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <p class="text-sm text-ink-muted" data-testid="slot-editor-total">
          {{ pluralize(total, 'posting time') }} each week
        </p>
        <div class="ms-auto flex flex-wrap gap-2">
          <BaseButton
            variant="ghost"
            size="sm"
            data-testid="slot-editor-defaults"
            @click="useDefaults"
          >
            Use defaults
          </BaseButton>
          <BaseButton variant="ghost" size="sm" data-testid="slot-editor-copy" @click="copyToAll">
            Copy to all
          </BaseButton>
          <BaseButton
            variant="ghost"
            size="sm"
            data-testid="slot-editor-clear"
            @click="clearAll"
          >
            Clear all
          </BaseButton>
        </div>
      </div>

      <div>
        <WeekdaySlotRow
          v-for="row in rows"
          :key="row.weekday"
          :weekday="row.weekday"
          :slots="row.slots"
          :error="errors[row.weekday]"
          @add="onAdd"
          @remove="onRemove"
        />
      </div>
    </template>
  </BaseCard>
</template>