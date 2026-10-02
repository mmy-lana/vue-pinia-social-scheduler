<script setup lang="ts">
/**
 * Settings: appearance, time, the failure simulator, and the data controls.
 *
 * The data section is deliberately the most cautious part of the app. Import
 * validates the file with zod and shows what it found *before* replacing
 * anything; reset requires typing RESET, because it is the one action here that
 * cannot be undone. Export is a plain download, so a user can always get their
 * data out before doing anything else.
 */
import { computed, ref, watch } from 'vue'
import { Database, Download, RotateCcw, Sparkles, Trash2, Upload } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseSegmented from '@/components/ui/BaseSegmented.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import BaseProgressRing from '@/components/ui/BaseProgressRing.vue'
import { parseBundle } from '@/lib/schemas'
import { clearNamespace, namespaceBytes } from '@/lib/storage'
import { suppressPersistence } from '@/stores/persistencePlugin'
import { buildDemoData } from '@/lib/seed'
import { downloadTextFile, formatBytes, pluralize, readAsText } from '@/lib/utils'
import { supportedTimeZones, timeZoneLabel } from '@/lib/datetime'
import { useTheme } from '@/composables/useTheme'
import { useConfirm } from '@/composables/useConfirm'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { useActivityStore } from '@/stores/useActivityStore'
import { useMediaStore } from '@/stores/useMediaStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useSlotsStore } from '@/stores/useSlotsStore'
import { useUiStore } from '@/stores/useUiStore'
import type { CalendarView, DataBundle, ThemePreference, TimeFormat } from '@/types'

const settings = useSettingsStore()
const accounts = useAccountsStore()
const posts = usePostsStore()
const slots = useSlotsStore()
const media = useMediaStore()
const activity = useActivityStore()
const ui = useUiStore()
const theme = useTheme()
const { confirm } = useConfirm()

const fileInput = ref<HTMLInputElement | null>(null)
const importPreview = ref<DataBundle | null>(null)
const resetText = ref('')

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const TIME_OPTIONS: { value: TimeFormat; label: string }[] = [
  { value: '12h', label: '12-hour' },
  { value: '24h', label: '24-hour' },
]

const WEEK_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: 'Monday' },
  { value: '0', label: 'Sunday' },
]

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'agenda', label: 'Agenda' },
]

const themeValue = computed<ThemePreference>({
  get: () => theme.preference,
  set: (value) => {
    theme.setPreference(value)
  },
})

const timeValue = computed<TimeFormat>({
  get: () => settings.settings.timeFormat,
  set: (value) => settings.update({ timeFormat: value }),
})

const weekValue = computed<string>({
  get: () => String(settings.settings.weekStartsOn),
  set: (value) => settings.update({ weekStartsOn: value === '0' ? 0 : 1 }),
})

const viewValue = computed<CalendarView>({
  get: () => settings.settings.calendarView,
  set: (value) => settings.update({ calendarView: value }),
})

/** `Intl.supportedValuesOf` where available, with a short fallback list. */
const timeZoneOptions = computed<{ value: string; label: string }[]>(() => {
  const zones = supportedTimeZones()
  return zones.map((zone) => ({ value: zone, label: timeZoneLabel(zone) }))
})

const usageBytes = ref(0)

watch(
  () => [accounts.accounts.length, posts.posts.length, media.assets.length],
  () => {
    usageBytes.value = namespaceBytes()
  },
  { immediate: true },
)

const USAGE_BUDGET = 5 * 1024 * 1024

function onTimeZoneChange(value: string): void {
  const result = settings.update({ timezone: value })
  if (!result.ok) ui.toast({ tone: 'danger', message: result.error })
}

function onSimulateFailures(value: boolean): void {
  settings.update({ simulateFailures: value })
  ui.toast({
    tone: value ? 'warn' : 'ok',
    message: value
      ? 'Publishing will fail about a quarter of the time.'
      : 'Publishing will succeed every time.',
  })
}

function exportData(): void {
  const bundle: DataBundle = {
    accounts: accounts.accounts,
    slots: slots.slots,
    posts: posts.posts,
    media: media.assets,
    settings: settings.settings,
    activity: activity.entries,
  }
  downloadTextFile(`scheduler-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(bundle, null, 2))
  ui.toast({ tone: 'ok', message: 'Export downloaded' })
}

async function onImportFile(event: Event): Promise<void> {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  // A user can pick anything, including a binary file renamed to `.json`.
  // `JSON.parse` throws on malformed input, and an unhandled rejection here
  // would surface as a blank screen instead of a usable message.
  let raw: string
  try {
    raw = await readAsText(file)
  } catch {
    ui.toast({ tone: 'danger', message: 'That file could not be read.' })
    return
  }

  let decoded: unknown
  try {
    decoded = JSON.parse(raw)
  } catch {
    ui.toast({ tone: 'danger', message: 'Invalid JSON file format' })
    return
  }

  const parsed = parseBundle(decoded)
  const bundle = parsed.data[0]
  if (bundle === undefined) {
    ui.toast({ tone: 'danger', message: 'That file does not look like a scheduler export.' })
    return
  }
  importPreview.value = bundle
}

const previewSummary = computed<string>(() => {
  const bundle = importPreview.value
  if (bundle === null) return ''
  return [
    pluralize(bundle.accounts.length, 'channel'),
    pluralize(bundle.posts.length, 'post'),
    pluralize(bundle.slots.length, 'posting time'),
    pluralize(bundle.media.length, 'image'),
  ].join(', ')
})

async function applyImport(): Promise<void> {
  const bundle = importPreview.value
  if (bundle === null) return

  const ok = await confirm({
    title: 'Replace everything?',
    message: `This replaces your current data with ${previewSummary.value}. It cannot be undone.`,
    confirmLabel: 'Replace all',
    cancelLabel: 'Cancel',
    tone: 'danger',
  })
  if (!ok) return

  accounts.replaceAll(bundle.accounts)
  slots.replaceAll(bundle.slots)
  media.replaceAll(bundle.media)
  posts.replaceAll(bundle.posts)
  activity.prepend(bundle.activity)
  settings.update(bundle.settings)

  importPreview.value = null
  usageBytes.value = namespaceBytes()
  ui.toast({ tone: 'ok', message: 'Data imported' })
}

function cancelImport(): void {
  importPreview.value = null
}

async function loadDemo(): Promise<void> {
  const hasData = posts.posts.length > 0 || accounts.accounts.length > 0
  if (hasData) {
    const ok = await confirm({
      title: 'Replace your data with demo content?',
      message: 'Your current channels, posts and posting times will be replaced.',
      confirmLabel: 'Load demo data',
      cancelLabel: 'Cancel',
      tone: 'warn',
    })
    if (!ok) return
  }

  const demo = buildDemoData(new Date(), settings.tz)
  accounts.replaceAll(demo.accounts)
  slots.replaceAll(demo.slots)
  posts.replaceAll(demo.posts)
  importPreview.value = null
  usageBytes.value = namespaceBytes()
  ui.toast({ tone: 'ok', message: 'Demo data loaded' })
}

async function resetEverything(): Promise<void> {
  if (resetText.value !== 'RESET') return

  const ok = await confirm({
    title: 'Reset everything?',
    message: 'Every channel, post, posting time and setting goes back to defaults.',
    confirmLabel: 'Reset everything',
    cancelLabel: 'Cancel',
    tone: 'danger',
  })
  if (!ok) return

  // Latch persistence off *first*. Every store still holds the old data in
  // memory, and the `pagehide` flush would otherwise write all of it back into
  // the namespace we are about to empty — silently undoing the reset.
  suppressPersistence()
  accounts.replaceAll([])
  slots.replaceAll([])
  media.replaceAll([])
  posts.replaceAll([])
  activity.clear()
  clearNamespace()
  window.location.reload()
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
    <h2 class="text-base font-bold text-ink">Settings</h2>

    <div class="mt-4 flex flex-col gap-4">
      <BaseCard padding="md" data-testid="settings-appearance">
        <h3 class="text-sm font-semibold text-ink">Appearance</h3>
        <div class="mt-3">
          <BaseSegmented
            v-model="themeValue"
            :options="THEME_OPTIONS"
            ariaLabel="Theme"
            block
            data-testid="settings-theme"
          />
        </div>
      </BaseCard>

      <BaseCard padding="md" data-testid="settings-time">
        <h3 class="text-sm font-semibold text-ink">Time</h3>
        <div class="mt-3 flex flex-col gap-4">
          <BaseSelect
            :model-value="settings.settings.timezone"
            label="Timezone"
            :options="timeZoneOptions"
            hint="Every stored time is UTC; this decides how it is displayed."
            data-testid="settings-timezone"
            @update:model-value="onTimeZoneChange"
          />

          <div>
            <p class="mb-1.5 text-sm font-medium text-ink">Clock</p>
            <BaseSegmented
              v-model="timeValue"
              :options="TIME_OPTIONS"
              ariaLabel="Clock format"
              block
              data-testid="settings-time-format"
            />
          </div>

          <div>
            <p class="mb-1.5 text-sm font-medium text-ink">Week starts on</p>
            <BaseSegmented
              v-model="weekValue"
              :options="WEEK_OPTIONS"
              ariaLabel="First day of the week"
              block
              data-testid="settings-week-start"
            />
          </div>

          <div>
            <p class="mb-1.5 text-sm font-medium text-ink">Default calendar view</p>
            <BaseSegmented
              v-model="viewValue"
              :options="VIEW_OPTIONS"
              ariaLabel="Default calendar view"
              block
              data-testid="settings-calendar-view"
            />
          </div>
        </div>
      </BaseCard>

      <BaseCard padding="md" data-testid="settings-simulation">
        <h3 class="text-sm font-semibold text-ink">Simulation</h3>
        <div class="mt-2">
          <BaseSwitch
            :model-value="settings.settings.simulateFailures"
            label="Simulate publishing failures"
            description="Roughly one post in four fails with a rate-limit error, so the failure and retry paths can be exercised."
            data-testid="settings-simulate-failures"
            @update:model-value="onSimulateFailures"
          />
        </div>
      </BaseCard>

      <BaseCard padding="md" data-testid="settings-storage">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-ink">
          <Database class="size-4 text-ink-muted" aria-hidden="true" />
          Storage
        </h3>
        <div class="mt-3 flex items-center gap-4">
          <BaseProgressRing
            :value="usageBytes"
            :max="USAGE_BUDGET"
            :size="48"
            :thickness="4"
            tone="brand"
            :label="`${formatBytes(usageBytes)} used`"
          />
          <p class="text-sm text-ink-muted" data-testid="settings-storage-usage">
            {{ formatBytes(usageBytes) }} of about {{ formatBytes(USAGE_BUDGET) }} used by this
            app in LocalStorage.
          </p>
        </div>
      </BaseCard>

      <BaseCard padding="md" data-testid="settings-data">
        <h3 class="text-sm font-semibold text-ink">Data</h3>

        <div class="mt-3 flex flex-wrap gap-2">
          <BaseButton
            variant="secondary"
            :icon-left="Download"
            data-testid="settings-export"
            @click="exportData"
          >
            Export JSON
          </BaseButton>

          <BaseButton
            variant="secondary"
            :icon-left="Upload"
            data-testid="settings-import"
            @click="fileInput?.click()"
          >
            Import JSON
          </BaseButton>

          <input
            ref="fileInput"
            type="file"
            accept="application/json,.json"
            class="sr-only"
            data-testid="settings-import-input"
            @change="onImportFile"
          />

          <BaseButton
            variant="secondary"
            :icon-left="Sparkles"
            data-testid="settings-demo"
            @click="loadDemo"
          >
            Load demo data
          </BaseButton>
        </div>

        <div
          v-if="importPreview !== null"
          class="mt-4 rounded-control border border-brand-300 bg-brand-50 p-3 dark:bg-brand-500/10"
          data-testid="settings-import-preview"
        >
          <p class="text-sm text-ink">
            Found <span class="font-semibold">{{ previewSummary }}</span>. Importing replaces
            everything currently in the app.
          </p>
          <div class="mt-2 flex gap-2">
            <BaseButton variant="primary" size="sm" data-testid="settings-import-confirm" @click="applyImport">
              Replace all
            </BaseButton>
            <BaseButton variant="ghost" size="sm" data-testid="settings-import-cancel" @click="cancelImport">
              Cancel
            </BaseButton>
          </div>
        </div>

        <div class="mt-5 border-t border-line pt-4">
          <h4 class="text-sm font-semibold text-danger">Reset everything</h4>
          <p class="mt-1 text-sm text-ink-muted">
            Deletes every channel, post, posting time and setting stored by this app.
          </p>
          <label for="reset-confirm" class="mt-2 block text-sm font-medium text-ink">
            Type <span class="font-mono">RESET</span> to confirm
          </label>
          <input
            id="reset-confirm"
            v-model="resetText"
            type="text"
            autocomplete="off"
            class="mt-1 h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-ink focus-visible:ring-2 focus-visible:ring-brand-500/30"
            data-testid="settings-reset-input"
          />
          <BaseButton
            class="mt-2"
            variant="danger"
            :icon-left="Trash2"
            :disabled="resetText !== 'RESET'"
            data-testid="settings-reset"
            @click="resetEverything"
          >
            Reset everything
          </BaseButton>
        </div>

        <p class="mt-4 flex items-center gap-2 text-xs text-ink-muted">
          <RotateCcw class="size-3.5" aria-hidden="true" />
          Reset cannot be undone. Export first if you might want the data back.
        </p>
      </BaseCard>
    </div>
  </div>
</template>