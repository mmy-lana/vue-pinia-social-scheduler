import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { newId, pluralize } from '@/lib/utils'
import { storageAvailable } from '@/lib/storage'
import type {
  AccountRemovalSnapshot,
  ComposerTarget,
  PostRemovalSnapshot,
  Toast,
  ToastAction,
  ToastTone,
} from '@/types'

/** Everything `toast()` accepts; `actionLabel` and `onAction` must come together. */
export interface ToastInput {
  tone?: ToastTone
  message: string
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
}

/** Ephemeral UI state: composer target, toasts, banners and undo snapshots. */
export const useUiStore = defineStore('ui', () => {
  const composer = ref<ComposerTarget>({
    open: false,
    editingPostId: null,
    presetDate: null,
    presetAccountIds: [],
  })
  const toasts = ref<Toast[]>([])
  const moreSheetOpen = ref(false)
  const storageBannerDismissed = ref(false)
  const onboardingDismissed = ref(false)
  /** 8-second undo windows for the two destructive flows. */
  const accountSnapshot = ref<AccountRemovalSnapshot | null>(null)
  const postSnapshot = ref<PostRemovalSnapshot | null>(null)

  const storageBlocked = computed(() => !storageAvailable && !storageBannerDismissed.value)
  const canUndoAccount = computed(() => accountSnapshot.value !== null)
  const canUndoPost = computed(() => postSnapshot.value !== null)

  function openComposer(options: Partial<Omit<ComposerTarget, 'open'>> = {}): void {
    composer.value = {
      open: true,
      editingPostId: options.editingPostId ?? null,
      presetDate: options.presetDate ?? null,
      presetAccountIds: options.presetAccountIds ?? [],
    }
  }

  function closeComposer(): void {
    composer.value = {
      open: false,
      editingPostId: null,
      presetDate: null,
      presetAccountIds: [],
    }
  }

  function setMoreSheetOpen(open: boolean): void {
    moreSheetOpen.value = open
  }

  function toast(input: ToastInput): string {
    const action: ToastAction | null =
      input.actionLabel && input.onAction
        ? { label: input.actionLabel, run: input.onAction }
        : null
    const entry: Toast = {
      id: newId(),
      tone: input.tone ?? 'neutral',
      message: input.message,
      action,
      durationMs: input.durationMs ?? 5_000,
      createdAt: Date.now(),
    }
    // One toast per message keeps rapid actions from stacking duplicates.
    toasts.value = [...toasts.value.filter((item) => item.message !== entry.message), entry]
    return entry.id
  }

  function dismissToast(id: string): void {
    toasts.value = toasts.value.filter((item) => item.id !== id)
  }

  function runToastAction(id: string): void {
    const entry = toasts.value.find((item) => item.id === id)
    if (!entry) return
    const run = entry.action?.run
    dismissToast(id)
    run?.()
  }

  function rememberAccountRemoval(snapshot: AccountRemovalSnapshot, postCount: number, handle: string): void {
    accountSnapshot.value = snapshot
    toast({
      tone: 'neutral',
      message: `Removed @${handle} and ${postCount} ${pluralize(postCount, 'post')}.`,
      actionLabel: 'Undo',
      onAction: () => {
        accountSnapshot.value = null
      },
      durationMs: 8_000,
    })
  }

  function clearAccountSnapshot(): void {
    accountSnapshot.value = null
  }

  function rememberPostRemoval(snapshot: PostRemovalSnapshot, count: number): void {
    postSnapshot.value = snapshot
    toast({
      tone: 'neutral',
      message: `Deleted ${count} ${pluralize(count, 'post')}.`,
      actionLabel: 'Undo',
      onAction: () => {
        postSnapshot.value = null
      },
      durationMs: 8_000,
    })
  }

  function clearPostSnapshot(): void {
    postSnapshot.value = null
  }

  function dismissStorageBanner(): void {
    storageBannerDismissed.value = true
  }

  function dismissOnboarding(): void {
    onboardingDismissed.value = true
  }

  return {
    composer,
    toasts,
    moreSheetOpen,
    storageBannerDismissed,
    onboardingDismissed,
    accountSnapshot,
    postSnapshot,
    storageBlocked,
    canUndoAccount,
    canUndoPost,
    openComposer,
    closeComposer,
    setMoreSheetOpen,
    toast,
    dismissToast,
    runToastAction,
    rememberAccountRemoval,
    clearAccountSnapshot,
    rememberPostRemoval,
    clearPostSnapshot,
    dismissStorageBanner,
    dismissOnboarding,
  }
})
