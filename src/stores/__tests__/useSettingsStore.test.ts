import { beforeEach, describe, expect, it } from 'vitest'
import { defaultSettings, useSettingsStore } from '@/stores/useSettingsStore'
import { readEnvelope, writeEnvelope, STORAGE_KEYS } from '@/lib/storage'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { createTestPinia, setViewportWidth } from '@/stores/__tests__/testPinia'

function freshPinia(withPlugin = false) {
  return createTestPinia({ persist: withPlugin })
}

describe('useSettingsStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    freshPinia()
  })

  it('starts from the runtime defaults', () => {
    const store = useSettingsStore()
    expect(store.settings).toEqual(defaultSettings())
    expect(store.settings.weekStartsOn).toBe(1)
    expect(store.settings.timeFormat).toBe('12h')
  })

  it('exposes derived timezone and clock format', () => {
    const store = useSettingsStore()
    store.update({ timezone: 'Asia/Jakarta', timeFormat: '24h' })
    expect(store.tz).toBe('Asia/Jakarta')
    expect(store.is24h).toBe(true)
  })

  it('rejects an unknown timezone and changes nothing', () => {
    const store = useSettingsStore()
    const before = { ...store.settings }
    const result = store.update({ timezone: 'Mars/Olympus', theme: 'dark' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Mars/Olympus')
    expect(store.settings).toEqual(before)
  })

  it('applies a valid patch and can reset', () => {
    const store = useSettingsStore()
    store.update({ theme: 'dark', simulateFailures: true, calendarView: 'week', weekStartsOn: 0 })
    expect(store.settings.theme).toBe('dark')
    expect(store.settings.simulateFailures).toBe(true)
    expect(store.weekStartsOn).toBe(0)

    store.resetToDefaults()
    expect(store.settings).toEqual(defaultSettings())
  })
})

describe('settings persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('writes changes to the namespaced envelope', async () => {
    freshPinia(true)
    const store = useSettingsStore()
    store.update({ timezone: 'Europe/Paris', timeFormat: '24h' })
    await new Promise((resolve) => setTimeout(resolve, 260))

    const stored = readEnvelope<{ timezone: string; timeFormat: string }>(
      STORAGE_KEYS.settings,
      1,
      { timezone: 'UTC', timeFormat: '12h' },
    )
    expect(stored.timezone).toBe('Europe/Paris')
    expect(stored.timeFormat).toBe('24h')
  })

  it('hydrates a stored payload into a new session', () => {
    writeEnvelope(STORAGE_KEYS.settings, 1, {
      timezone: 'America/New_York',
      timeFormat: '24h',
      weekStartsOn: 0,
      theme: 'dark',
      simulateFailures: true,
      calendarView: 'agenda',
    })
    freshPinia(true)
    const store = useSettingsStore()
    expect(store.settings.timezone).toBe('America/New_York')
    expect(store.settings.calendarView).toBe('agenda')
    expect(store.settings.theme).toBe('dark')
  })

  it('falls back to defaults and counts a dropped record', () => {
    writeEnvelope(STORAGE_KEYS.settings, 1, { timezone: 'Nowhere/Special', nonsense: true })
    freshPinia(true)
    const store = useSettingsStore()
    expect(store.settings).toEqual(defaultSettings())
    expect(store.droppedCount).toBe(1)
  })

  it('ignores an unparsable payload', () => {
    window.localStorage.setItem(STORAGE_KEYS.settings, '{oops')
    freshPinia(true)
    expect(useSettingsStore().settings).toEqual(defaultSettings())
  })
})

describe('useBreakpoint', () => {
  it('classifies phone, tablet and desktop widths', () => {
    freshPinia()

    setViewportWidth(390)
    const phone = useBreakpoint()
    expect(phone.isMobile.value).toBe(true)
    expect(phone.isTablet.value).toBe(false)
    expect(phone.isDesktop.value).toBe(false)

    setViewportWidth(800)
    const tablet = useBreakpoint()
    expect(tablet.isMobile.value).toBe(false)
    expect(tablet.isTablet.value).toBe(true)
    expect(tablet.isDesktop.value).toBe(false)

    setViewportWidth(1440)
    const desktop = useBreakpoint()
    expect(desktop.isMobile.value).toBe(false)
    expect(desktop.isDesktop.value).toBe(true)
    expect(desktop.isWide.value).toBe(true)
  })
})
