import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { AppSettingsSchema, parseOne } from '@/lib/schemas'
import { isValidTimeZone, systemTimeZone } from '@/lib/datetime'
import { STORE_KEYS, type PersistApi } from '@/stores/persistencePlugin'
import type { AppSettings, Result } from '@/types'

export function defaultSettings(): AppSettings {
  return {
    timezone: systemTimeZone(),
    timeFormat: '12h',
    weekStartsOn: 1,
    theme: 'system',
    simulateFailures: false,
    calendarView: 'month',
  }
}

/** Timezone, clock format, week start, theme and the failure simulation switch. */
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>(defaultSettings())
  const droppedCount = ref(0)

  const tz = computed(() => settings.value.timezone)
  const is24h = computed(() => settings.value.timeFormat === '24h')
  const weekStartsOn = computed(() => settings.value.weekStartsOn)

  /**
   * Applies a patch. An unknown timezone is rejected and nothing is written, so
   * the rest of the app can never hold a zone `Intl` cannot format.
   */
  function update(patch: Partial<AppSettings>): Result<AppSettings, string> {
    if (patch.timezone !== undefined && !isValidTimeZone(patch.timezone)) {
      return { ok: false, error: `Unknown timezone: ${patch.timezone}` }
    }
    settings.value = { ...settings.value, ...patch }
    return { ok: true, value: settings.value }
  }

  function resetToDefaults(): void {
    settings.value = defaultSettings()
  }

  const persistApi: PersistApi<AppSettings> = {
    key: STORE_KEYS.settings,
    version: 1,
    read: () => settings.value,
    apply: (data) => {
      settings.value = data
    },
    parse: (raw) => parseOne(AppSettingsSchema, raw, defaultSettings()),
    fallback: defaultSettings(),
    onDropped: (count) => {
      droppedCount.value = count
    },
  }

  return { settings, tz, is24h, weekStartsOn, droppedCount, update, resetToDefaults, persistApi }
})
