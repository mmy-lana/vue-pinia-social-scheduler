import { computed, watchEffect } from 'vue'
import { usePreferredDark } from '@vueuse/core'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { ThemePreference } from '@/types'

/** Dark mode is a `.dark` class on <html>; Tailwind's `dark` variant keys off it. */

function applyThemeClass(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
}

function applyThemeColor(dark: boolean): void {
  const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))
  const target = metas.find((meta) => !meta.media) ?? metas[0]
  if (!target) return
  target.content = dark ? '#1a1a1c' : '#ffffff'
}

export interface ThemeController {
  /** The resolved theme, after applying the `system` preference. */
  readonly isDark: boolean
  readonly preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
  /** Applies the class synchronously; call before the first paint. */
  apply: () => void
}

/**
 * Resolves the `system` preference with `matchMedia` and keeps the `.dark` class
 * in sync while the user or the OS changes it.
 */
export function useTheme(): ThemeController {
  const settings = useSettingsStore()
  const prefersDark = usePreferredDark()

  const resolve = (preference: ThemePreference): boolean =>
    preference === 'dark' || (preference === 'system' && prefersDark.value)

  const isDark = computed(() => resolve(settings.settings.theme))

  const apply = (): void => {
    applyThemeClass(isDark.value)
    applyThemeColor(isDark.value)
  }

  watchEffect(apply)

  return {
    get isDark(): boolean {
      return isDark.value
    },
    get preference(): ThemePreference {
      return settings.settings.theme
    },
    setPreference: (preference: ThemePreference) => {
      settings.update({ theme: preference })
    },
    apply,
  }
}

/** Called from `main.ts` so the very first paint already has the right theme. */
export function primeThemeClass(preference: ThemePreference): void {
  const dark =
    preference === 'dark' ||
    (preference === 'system' &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  applyThemeClass(dark)
  applyThemeColor(dark)
}
