<script setup lang="ts">
/**
 * The composer form body: presentational only.
 *
 * Every field and action belongs to the `useComposerForm` controller, which is
 * created once by `ComposerSheet` and handed in as a prop. That is what lets the
 * modal (≥ 768 px) and the full-screen sheet (< 768 px) share one form instance
 * and one set of rules instead of each holding their own.
 */
import AccountPicker from '@/components/composer/AccountPicker.vue'
import ComposerEditor from '@/components/composer/ComposerEditor.vue'
import MediaUploader from '@/components/composer/MediaUploader.vue'
import PlatformPreview from '@/components/composer/PlatformPreview.vue'
import ScheduleControls from '@/components/composer/ScheduleControls.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { computed } from 'vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import type { ComposerFormController } from '@/composables/useComposerForm'
import { useAccountsStore } from '@/stores/useAccountsStore'
import type { ScheduleMode, SocialAccount } from '@/types'

const props = defineProps<{
  form: ComposerFormController
}>()

const emit = defineEmits<{
  cancel: []
  submitted: []
}>()

const { isDesktop } = useBreakpoint()
const accounts = useAccountsStore()

/**
 * The picker lists *every* channel, not just the selected ones — it is how a
 * channel gets selected in the first place. Passing the selection here would
 * render an empty picker on a fresh composer.
 */
const allAccounts = computed<SocialAccount[]>(() => accounts.accounts)

function setAccounts(next: string[]): void {
  const current = new Set(props.form.accountIds.value)
  const target = new Set(next)
  for (const id of target) if (!current.has(id)) props.form.toggleAccount(id)
  for (const id of current) if (!target.has(id)) props.form.toggleAccount(id)
}

function setMedia(next: string[]): void {
  const current = new Set(props.form.mediaIds.value)
  const target = new Set(next)
  for (const id of target) if (!current.has(id)) props.form.addMedia(id)
  for (const id of current) if (!target.has(id)) props.form.removeMedia(id)
}

function onMode(next: ScheduleMode): void {
  props.form.setMode(next)
}

async function submit(): Promise<void> {
  const result = await props.form.submit()
  if (result.ok) emit('submitted')
}
</script>

<template>
  <div class="flex flex-col gap-5" data-testid="composer-form">
    <div
      v-if="props.form.restoredDraft.value"
      class="flex flex-wrap items-center justify-between gap-2 rounded-control bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
      data-testid="composer-restored-banner"
    >
      <span>Restored your unsaved draft</span>
      <BaseButton
        variant="ghost"
        size="sm"
        data-testid="composer-discard-draft"
        @click="props.form.discardDraft()"
      >
        Discard
      </BaseButton>
    </div>

    <p
      v-if="props.form.channelRemoved.value"
      class="rounded-control bg-warn/15 px-3 py-2 text-sm text-warn"
      data-testid="composer-channel-removed"
    >
      A channel was removed while you were writing.
    </p>

    <div data-composer-field="accounts" class="flex flex-col gap-1.5">
      <AccountPicker
        :model-value="props.form.accountIds.value"
        :accounts="allAccounts"
        :error="props.form.visibleErrors.value.accounts"
        @update:model-value="setAccounts"
      />
    </div>

    <div data-composer-field="content">
      <ComposerEditor
        :model-value="props.form.content.value"
        :used="props.form.used.value"
        :limit="props.form.limit.value?.limit ?? 0"
        :limited-by="props.form.limit.value?.by"
        :error="props.form.visibleErrors.value.content"
        @update:model-value="props.form.setContent"
        @blur="props.form.touch"
      />
    </div>

    <div data-composer-field="media">
      <MediaUploader
        :model-value="props.form.mediaIds.value"
        :max="props.form.mediaCap.value"
        :error="props.form.visibleErrors.value.media"
        @update:model-value="setMedia"
      />
    </div>

    <div data-composer-field="schedule">
      <ScheduleControls
        :mode="props.form.mode.value"
        :date="props.form.date.value"
        :time="props.form.time.value"
        :accounts="props.form.selectedAccounts.value"
        :queue-preview="props.form.queuePreview.value"
        :resolved-label="props.form.resolvedLabel.value"
        :errors="props.form.visibleErrors.value"
        @update:mode="onMode"
        @update:date="props.form.setDate"
        @update:time="props.form.setTime"
        @touch="props.form.touch"
      />
    </div>

    <p
      v-if="props.form.visibleErrors.value.form"
      role="alert"
      class="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger"
      data-testid="composer-form-error"
    >
      {{ props.form.visibleErrors.value.form }}
    </p>

    <div v-if="isDesktop" class="border-t border-line pt-4">
      <PlatformPreview
        :content="props.form.content.value"
        :media-ids="props.form.mediaIds.value"
        :accounts="props.form.selectedAccounts.value"
      />
    </div>

    <div class="flex items-center justify-end gap-2 border-t border-line pt-4">
      <BaseButton variant="ghost" data-testid="composer-cancel" @click="emit('cancel')">
        Cancel
      </BaseButton>
      <!--
        Deliberately not disabled while the form is invalid: a disabled button
        gives a keyboard or screen-reader user no way to find out what is wrong.
        Submitting runs validation, which reveals every field's message.
      -->
      <BaseButton
        variant="primary"
        :loading="props.form.submitting.value"
        data-testid="composer-submit"
        @click="submit"
      >
        {{ props.form.submitLabel.value }}
      </BaseButton>
    </div>
  </div>
</template>