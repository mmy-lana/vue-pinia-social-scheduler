import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import { persistencePlugin } from '@/stores/persistencePlugin'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useSchedulerStore } from '@/stores/useSchedulerStore'
import { useUiStore } from '@/stores/useUiStore'
import { primeThemeClass, useTheme } from '@/composables/useTheme'
import { storageAvailable } from '@/lib/storage'

const app = createApp(App)

const pinia = createPinia()
pinia.use(persistencePlugin)
app.use(pinia)

// Hydration happens inside the persistence plugin, so the theme is already
// known here — apply it before the first paint to avoid a flash of the wrong
// palette, then keep watching the `system` preference.
const settings = useSettingsStore(pinia)
primeThemeClass(settings.settings.theme)
useTheme()

const ui = useUiStore(pinia)
if (!storageAvailable) {
  ui.toast({
    tone: 'warn',
    message: 'Storage is unavailable — your changes will be lost when you close this tab.',
    durationMs: 10_000,
  })
}

app.use(router)
app.mount('#app')

// The scheduler engine owns publishing; it takes a cross-tab lease on start.
useSchedulerStore(pinia).start()