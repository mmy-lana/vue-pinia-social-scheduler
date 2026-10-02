import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { QueueSlotSchema, parseArray } from '@/lib/schemas'
import { newId } from '@/lib/utils'
import {
  DEFAULT_SLOT_PATTERN,
  countSlotsFor,
  slotsForAccount,
} from '@/lib/queue'
import { validateSlotAddition } from '@/lib/validation'
import { STORE_KEYS, type PersistApi } from '@/stores/persistencePlugin'
import type { QueueSlot, Result, Weekday } from '@/types'

/** Weekly posting times per channel, the Buffer-style "queue slots". */
export const useSlotsStore = defineStore('slots', () => {
  const slots = ref<QueueSlot[]>([])
  const droppedCount = ref(0)

  const count = computed(() => slots.value.length)
  const accountsWithSlots = computed(() => new Set(slots.value.map((slot) => slot.accountId)))

  function forAccount(accountId: string): QueueSlot[] {
    return slotsForAccount(slots.value, accountId)
  }

  function hasSlotsFor(accountId: string): boolean {
    return countSlotsFor(slots.value, accountId) > 0
  }

  function forWeekday(accountId: string, weekday: Weekday): QueueSlot[] {
    return forAccount(accountId).filter((slot) => slot.weekday === weekday)
  }

  function add(accountId: string, weekday: Weekday, time: string): Result<QueueSlot, string> {
    const error = validateSlotAddition(slots.value, accountId, weekday, time)
    if (error) return { ok: false, error }

    const now = new Date().toISOString()
    const slot: QueueSlot = {
      id: newId(),
      accountId,
      weekday,
      time,
      createdAt: now,
      updatedAt: now,
    }
    slots.value = [...slots.value, slot]
    return { ok: true, value: slot }
  }

  function remove(id: string): boolean {
    const before = slots.value.length
    slots.value = slots.value.filter((slot) => slot.id !== id)
    return slots.value.length < before
  }

  function removeForAccount(accountId: string): QueueSlot[] {
    const removed = slotsForAccount(slots.value, accountId)
    if (removed.length > 0) {
      slots.value = slots.value.filter((slot) => slot.accountId !== accountId)
    }
    return removed
  }

  function clearForAccount(accountId: string): QueueSlot[] {
    return removeForAccount(accountId)
  }

  /** Mon–Fri at 09:00 and 17:00, replacing whatever the channel had. */
  function seedDefault(accountId: string): QueueSlot[] {
    const now = new Date().toISOString()
    const created = DEFAULT_SLOT_PATTERN.map((entry) => ({
      id: newId(),
      accountId,
      weekday: entry.weekday,
      time: entry.time,
      createdAt: now,
      updatedAt: now,
    }))
    slots.value = [...slots.value.filter((slot) => slot.accountId !== accountId), ...created]
    return created
  }

  /** Replaces every other channel's pattern with `accountId`'s. */
  function copyToAll(sourceAccountId: string, targetAccountIds: readonly string[]): QueueSlot[] {
    const source = forAccount(sourceAccountId)
    const now = new Date().toISOString()
    const created: QueueSlot[] = []
    for (const accountId of targetAccountIds) {
      if (accountId === sourceAccountId) continue
      for (const slot of source) {
        created.push({
          id: newId(),
          accountId,
          weekday: slot.weekday,
          time: slot.time,
          createdAt: now,
          updatedAt: now,
        })
      }
    }
    const targets = new Set(targetAccountIds)
    slots.value = [
      ...slots.value.filter((slot) => !targets.has(slot.accountId)),
      ...created,
    ]
    return created
  }

  function restore(list: readonly QueueSlot[]): void {
    const known = new Set(slots.value.map((slot) => slot.id))
    const additions = list.filter((slot) => !known.has(slot.id))
    slots.value = [...additions, ...slots.value]
  }

  function replaceAll(list: readonly QueueSlot[]): void {
    slots.value = [...list]
  }

  const persistApi: PersistApi<QueueSlot[]> = {
    key: STORE_KEYS.slots,
    version: 1,
    read: () => slots.value,
    apply: (data) => {
      slots.value = data
    },
    parse: (raw) => parseArray(QueueSlotSchema, raw),
    fallback: [],
  }

  return {
    slots,
    count,
    accountsWithSlots,
    droppedCount,
    forAccount,
    forWeekday,
    hasSlotsFor,
    add,
    remove,
    removeForAccount,
    clearForAccount,
    seedDefault,
    copyToAll,
    restore,
    replaceAll,
    persistApi,
  }
})
