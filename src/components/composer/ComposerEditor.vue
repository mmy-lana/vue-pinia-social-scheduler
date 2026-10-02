<script setup lang="ts">
/**
 * The composer's text field: a textarea, a live budget readout and a two-button
 * shortcut bar.
 *
 * The shortcut buttons exist because typing `#` or `@` into a composer usually
 * means switching context — keyboard layout, a phone keyboard, dictation. They
 * insert at the *caret*, not at the end: a writer who has already typed the
 * first half of a sentence and then thinks of a hashtag expects the hashtag
 * where they were typing, so the selection is read, the token is spliced in,
 * and the caret is put back right after it (one `nextTick` later, once the
 * re-rendered value has landed).
 */
import { nextTick, ref } from 'vue'
import { AtSign, Hash } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import CharCounter from '@/components/composer/CharCounter.vue'
import type { PlatformId } from '@/types'

const model = defineModel<string>({ required: true })

const props = withDefaults(
  defineProps<{
    used: number
    limit: number
    limitedBy?: PlatformId
    error?: string
    disabled?: boolean
    placeholder?: string
  }>(),
  {
    disabled: false,
  },
)

const fieldRef = ref<HTMLElement | null>(null)

/** `BaseTextarea` keeps its own ref, so the control is reached from the wrapper. */
function textareaElement(): HTMLTextAreaElement | null {
  const found = fieldRef.value?.querySelector('textarea')
  return found instanceof HTMLTextAreaElement ? found : null
}

async function insertAtCaret(token: string): Promise<void> {
  if (props.disabled) return

  const element = textareaElement()
  const current = model.value
  // An unrendered field (or one that was never focused) falls back to appending.
  const start = element?.selectionStart ?? current.length
  const end = element?.selectionEnd ?? start

  model.value = `${current.slice(0, start)}${token}${current.slice(end)}`

  const caret = start + token.length
  await nextTick()

  const restored = textareaElement()
  if (!restored) return
  restored.focus()
  restored.setSelectionRange(caret, caret)
}
</script>

<template>
  <div data-testid="composer-editor" class="w-full">
    <div ref="fieldRef" data-composer-field="content">
      <BaseTextarea
        v-model="model"
        label="Post content"
        :rows="5"
        :error="props.error"
        :disabled="props.disabled"
        :placeholder="props.placeholder ?? 'What do you want to share?'"
      />
    </div>

    <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-1">
        <BaseButton
          variant="ghost"
          size="sm"
          :icon-left="Hash"
          :disabled="props.disabled"
          aria-label="Add hashtag"
          data-testid="composer-add-hashtag"
          @click="insertAtCaret('#')"
        >
          Hashtag
        </BaseButton>

        <BaseButton
          variant="ghost"
          size="sm"
          :icon-left="AtSign"
          :disabled="props.disabled"
          aria-label="Add mention"
          data-testid="composer-add-mention"
          @click="insertAtCaret('@')"
        >
          Mention
        </BaseButton>
      </div>

      <CharCounter
        :used="props.used"
        :limit="props.limit"
        :limited-by="props.limitedBy"
        name="Post content"
      />
    </div>
  </div>
</template>
