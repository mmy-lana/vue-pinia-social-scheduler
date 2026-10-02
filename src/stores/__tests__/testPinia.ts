import { createApp, h } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { persistencePlugin } from '@/stores/persistencePlugin'

/**
 * Pinia 4 only activates `pinia.use(...)` plugins once the instance is installed
 * into an app, so tests install a throwaway app to exercise the persistence
 * plugin exactly like the real entry point does.
 */
export function createTestPinia(options: { persist?: boolean } = {}): Pinia {
  const pinia = createPinia()
  if (options.persist !== false) pinia.use(persistencePlugin)
  const app = createApp({ render: () => h('div') })
  app.use(pinia)
  setActivePinia(pinia)
  return pinia
}

/** Installs a fake viewport width for the responsive composables. */
export function setViewportWidth(width: number, height = 900): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true })
}
