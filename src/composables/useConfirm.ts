import { readonly, ref, type DeepReadonly, type Ref } from 'vue'
import { newId } from '@/lib/utils'
import type { ConfirmDialogRequest, ConfirmRequest, ConfirmResponse, ToastTone } from '@/types'

/**
 * Promise-based confirmations. Any component can `await confirm({...})` and the
 * single `<ConfirmDialog>` host renders the pending request. A third action
 * (for example "Save as draft") resolves the promise with `null`.
 *
 * The queue is module state so every call site observes the same request.
 */

const queue = ref<ConfirmDialogRequest[]>([])
/** Shared across all `useConfirm()` callers so the host always sees the top item. */
const activeRequest = ref<ConfirmDialogRequest | null>(null)

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ToastTone
  /** When set, a third button resolves the promise with `null`. */
  tertiaryLabel?: string | null
}

function sync(): void {
  activeRequest.value = queue.value[0] ?? null
}

function settle(response: ConfirmResponse): void {
  const current = activeRequest.value
  if (!current) return
  queue.value = queue.value.slice(1)
  sync()
  current.resolve(response)
}

export interface UseConfirm {
  /** The request currently on screen, or `null`. */
  request: DeepReadonly<Ref<ConfirmDialogRequest | null>>
  /** Every queued request, oldest first. */
  pending: DeepReadonly<Ref<ConfirmDialogRequest[]>>
  confirm: (options: ConfirmOptions) => Promise<boolean>
  ask: (options: ConfirmOptions) => Promise<ConfirmResponse>
  respond: (response: ConfirmResponse) => void
  reset: () => void
}

export function useConfirm(): UseConfirm {
  const ask = (options: ConfirmOptions): Promise<ConfirmResponse> => {
    let resolve!: (value: ConfirmResponse) => void
    const promise = new Promise<ConfirmResponse>((inner) => {
      resolve = inner
    })
    queue.value = [
      ...queue.value,
      {
        id: newId(),
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Confirm',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        tone: options.tone ?? 'brand',
        tertiaryLabel: options.tertiaryLabel ?? null,
        resolve,
      },
    ]
    sync()
    return promise
  }

  return {
    request: readonly(activeRequest) as DeepReadonly<Ref<ConfirmDialogRequest | null>>,
    pending: readonly(queue) as DeepReadonly<Ref<ConfirmDialogRequest[]>>,
    confirm: async (options) => (await ask(options)) === true,
    ask,
    respond: settle,
    reset: () => {
      const abandoned = queue.value
      queue.value = []
      sync()
      for (const item of abandoned) item.resolve(false)
    },
  }
}

/** One-line helper for the common "are you sure?" case. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return useConfirm().confirm(options)
}

/** Builds a request from a title/message pair with optional overrides. */
export function confirmRequestOptions(
  title: string,
  message: string,
  extra: Partial<ConfirmRequest> = {},
): ConfirmOptions {
  return { title, message, ...extra }
}
