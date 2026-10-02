import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import { countdownParts, type CountdownParts } from '@/lib/datetime'
import type { ISODateString } from '@/types'

export interface NowClock {
  now: Ref<Date>
  nowIso: ComputedRef<ISODateString>
  nowMs: ComputedRef<number>
  /** Milliseconds until `iso`; negative once the instant has passed. */
  msUntil: (iso: ISODateString) => number
  countdown: (iso: ISODateString) => ComputedRef<CountdownParts>
  stop: () => void
}

/**
 * Shared ticking clock. Countdowns, relative timestamps and the scheduler all
 * read the same ref, so they can never drift apart inside a render pass.
 */
export function useNow(intervalMs = 1_000): NowClock {
  const now = ref(new Date())

  const { pause } = useIntervalFn(
    () => {
      now.value = new Date()
    },
    intervalMs,
    { immediate: true },
  )

  const nowIso = computed<ISODateString>(() => now.value.toISOString())
  const nowMs = computed(() => now.value.getTime())

  const msUntil = (iso: ISODateString): number => new Date(iso).getTime() - now.value.getTime()

  const countdownCache = new Map<ISODateString, ComputedRef<CountdownParts>>()

  const countdown = (iso: ISODateString): ComputedRef<CountdownParts> => {
    let cached = countdownCache.get(iso)
    if (!cached) {
      cached = computed(() => countdownParts(iso, now.value))
      countdownCache.set(iso, cached)
    }
    return cached
  }

  return { now, nowIso, nowMs, msUntil, countdown, stop: pause }
}
