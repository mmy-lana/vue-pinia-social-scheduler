<script setup lang="ts">
/**
 * The composer host: one form, two presentations.
 *
 * Below 768 px it is a full-screen sheet, from 768 px a centred modal — the
 * split from the responsive contract. Whichever container is used, the body is
 * `ComposerForm` and the controller behind it is created exactly once here, so
 * the two presentations can never drift apart in behaviour.
 *
 * Open state belongs to the UI store, which is what every "New post" button in
 * the app writes to. Closing with unsaved work asks first and offers three
 * answers — keep editing, discard, or save as a draft — so no stray tap is
 * destructive.
 */
import { computed, watch } from 'vue'
import ComposerForm from '@/components/composer/ComposerForm.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useComposerForm } from '@/composables/useComposerForm'
import { useConfirm } from '@/composables/useConfirm'
import { useUiStore } from '@/stores/useUiStore'

const ui = useUiStore()
const { isMobile } = useBreakpoint()
const { ask } = useConfirm()

const form = useComposerForm()

const open = computed(() => ui.composer.open)

const title = computed<string>(() =>
  form.editingPostId.value === null ? 'New post' : 'Edit post',
)

watch(
  () => [ui.composer.open, ui.composer.editingPostId] as const,
  ([isOpen]) => {
    if (isOpen) form.open()
  },
  { immediate: true },
)

/**
 * Escape, the backdrop, the close button and Cancel all arrive here. A clean
 * form just closes; a dirty one asks first, and "Save as draft" goes through the
 * same validated submit as any other draft.
 */
async function requestClose(): Promise<void> {
  if (!form.isDirty.value) {
    form.discardDraft()
    ui.closeComposer()
    return
  }

  const answer = await ask({
    title: 'Discard changes?',
    message: 'This post has unsaved changes. Save it as a draft, discard it, or keep editing.',
    confirmLabel: 'Discard',
    cancelLabel: 'Keep editing',
    tertiaryLabel: 'Save as draft',
    tone: 'warn',
  })

  if (answer === true) {
    form.discardDraft()
    ui.closeComposer()
    return
  }

  if (answer === null) {
    form.setMode('draft')
    const result = await form.submit()
    if (!result.ok) ui.closeComposer()
  }
}

/** The container closed itself (Escape, backdrop); run it through the guard. */
function onOpenChange(value: boolean): void {
  if (value) return
  void requestClose()
}
</script>

<template>
  <BaseSheet
    v-if="isMobile"
    :open="open"
    :title="title"
    side="full"
    @update:open="onOpenChange"
  >
    <div data-testid="composer-sheet">
      <ComposerForm :form="form" @cancel="requestClose" />
    </div>
  </BaseSheet>

  <BaseModal
    v-else
    :open="open"
    :title="title"
    size="xl"
    @update:open="onOpenChange"
  >
    <div data-testid="composer-sheet">
      <ComposerForm :form="form" @cancel="requestClose" />
    </div>
  </BaseModal>
</template>