<script setup lang="ts">
/**
 * "Connect a channel" form: platform, handle and display name.
 *
 * The component owns its own field state and validation, but never writes to a
 * store: a valid submit emits the trimmed payload and lets the page decide what
 * to do with it (and how to show a busy state while it does).
 *
 * Uniqueness is a *live* check rather than a submit-time surprise: the note
 * under the handle re-evaluates on every keystroke and again whenever the
 * platform changes, because the same handle is perfectly fine on another
 * network.
 */
import { computed, ref, watch } from 'vue'
import { AtSign } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import PlatformIcon from '@/components/accounts/PlatformIcon.vue'
import { PLATFORM_IDS, platformLabel } from '@/lib/platforms'
import { isHandleTaken, validateDisplayName, validateHandle } from '@/lib/validation'
import { useAccountsStore } from '@/stores/useAccountsStore'
import type { FieldErrors, PlatformId } from '@/types'

/** Exported through the hint text so the format rule lives in one place. */
const HANDLE_HINT = '2–30 letters, numbers, dots or underscores'

const props = withDefaults(
  defineProps<{
    /** Hidden while `false` — the page owns the dialog around it. */
    open?: boolean
    initialPlatform?: PlatformId
    /** Set by the page while it is writing the new channel to the store. */
    submitting?: boolean
  }>(),
  {
    open: true,
    initialPlatform: PLATFORM_IDS[0],
    submitting: false,
  },
)

const emit = defineEmits<{
  submit: [input: { platform: PlatformId; handle: string; displayName: string }]
  cancel: []
}>()

const accounts = useAccountsStore()

const platform = ref<PlatformId>(props.initialPlatform)
const handle = ref('')
const displayName = ref('')
const errors = ref<FieldErrors>({})
const showErrors = ref(false)

const platformOptions = computed(() =>
  PLATFORM_IDS.map((id) => ({ value: id, label: platformLabel(id) })),
)

const normalizedHandle = computed(() => handle.value.trim().replace(/^@+/, ''))

/** True only for a well-formed handle that already exists on this platform. */
const handleTaken = computed(
  () =>
    validateHandle(handle.value) === null &&
    isHandleTaken(accounts.accounts, platform.value, handle.value),
)

const handleError = computed(() => (showErrors.value ? errors.value.handle : undefined))
const displayNameError = computed(() => (showErrors.value ? errors.value.displayName : undefined))

function reset(): void {
  platform.value = props.initialPlatform
  handle.value = ''
  displayName.value = ''
  errors.value = {}
  showErrors.value = false
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) reset()
  },
  { immediate: true },
)

watch(
  () => props.initialPlatform,
  (value) => {
    platform.value = value
  },
)

/** Editing a field clears its error instead of leaving it stale behind. */
watch([handle, displayName], () => {
  if (!showErrors.value) return
  const next = validate()
  errors.value = next
  if (Object.keys(next).length === 0) showErrors.value = false
})

function validate(): FieldErrors {
  const next: FieldErrors = {}

  const handleMessage = validateHandle(handle.value)
  if (handleMessage) {
    next.handle = handleMessage
  } else if (isHandleTaken(accounts.accounts, platform.value, handle.value)) {
    next.handle = 'That handle is already connected for this platform.'
  }

  const nameMessage = validateDisplayName(displayName.value)
  if (nameMessage) next.displayName = nameMessage

  return next
}

function onSubmit(): void {
  const next = validate()
  errors.value = next
  showErrors.value = true
  if (Object.keys(next).length > 0) return

  emit('submit', {
    platform: platform.value,
    handle: normalizedHandle.value,
    displayName: displayName.value.trim(),
  })
}
</script>

<template>
  <form
    v-if="props.open"
    novalidate
    class="flex flex-col gap-4"
    data-testid="connect-channel-form"
    @submit.prevent="onSubmit"
  >
    <p class="text-sm text-ink-muted">
      Channels stay in this browser. Nothing is sent to a network until you schedule a post.
    </p>

    <div data-field="platform">
      <BaseSelect
        v-model="platform"
        label="Platform"
        :options="platformOptions"
        hint="Every platform keeps its own handle."
      />
      <p class="mt-1.5 flex items-center gap-1.5 text-sm text-ink-muted">
        <PlatformIcon :platform="platform" size="xs" />
        <span>Connected as {{ platformLabel(platform) }}.</span>
      </p>
    </div>

    <div data-field="handle">
      <BaseInput
        v-model="handle"
        label="Handle"
        required
        :maxlength="31"
        autocomplete="off"
        placeholder="lanabuilds"
        :hint="HANDLE_HINT"
        :error="handleError"
      >
        <template #prefix>
          <AtSign class="size-4" />
        </template>
      </BaseInput>
      <p
        v-if="handleTaken"
        class="mt-1.5 text-sm text-warn"
        role="status"
        data-testid="connect-channel-handle-taken"
      >
        That handle is already connected for {{ platformLabel(platform) }}.
      </p>
    </div>

    <div data-field="displayName">
      <BaseInput
        v-model="displayName"
        label="Display name"
        required
        :maxlength="40"
        autocomplete="off"
        placeholder="Lana Builds"
        hint="Shown on your channel cards."
        :error="displayNameError"
      />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span class="inline-flex" data-testid="connect-channel-cancel">
        <BaseButton variant="ghost" :disabled="props.submitting" @click="emit('cancel')">
          Cancel
        </BaseButton>
      </span>
      <span class="inline-flex" data-testid="connect-channel-submit">
        <BaseButton type="submit" block :loading="props.submitting">
          Connect channel
        </BaseButton>
      </span>
    </div>
  </form>
</template>