import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { SocialAccountSchema, parseArray } from '@/lib/schemas'
import { hueFromString, newId } from '@/lib/utils'
import { isPlatformId } from '@/lib/platforms'
import {
  isHandleTaken,
  validateDisplayName,
  validateHandle,
} from '@/lib/validation'
import { useSlotsStore } from '@/stores/useSlotsStore'
import { useMediaStore } from '@/stores/useMediaStore'
import { useActivityStore } from '@/stores/useActivityStore'
import { useUiStore } from '@/stores/useUiStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { STORE_KEYS, type PersistApi } from '@/stores/persistencePlugin'
import type {
  AccountRemovalSnapshot,
  FieldErrors,
  PlatformId,
  Result,
  SocialAccount,
} from '@/types'

export interface AccountInput {
  platform: PlatformId
  handle: string
  displayName: string
  connected?: boolean
}

const PLATFORM_ERROR = 'Pick a platform.' as const

/** Connected channels. Removing one cascades to its slots, posts and media. */
export const useAccountsStore = defineStore('accounts', () => {
  const accounts = ref<SocialAccount[]>([])
  const droppedCount = ref(0)

  const byId = computed(() => new Map(accounts.value.map((account) => [account.id, account])))
  const connected = computed(() => accounts.value.filter((account) => account.connected))
  const count = computed(() => accounts.value.length)
  const hasAny = computed(() => accounts.value.length > 0)

  function forPlatform(platform: PlatformId): SocialAccount[] {
    return accounts.value.filter((account) => account.platform === platform)
  }

  function forIds(ids: readonly string[]): SocialAccount[] {
    const map = byId.value
    const out: SocialAccount[] = []
    for (const id of ids) {
      const account = map.get(id)
      if (account) out.push(account)
    }
    return out
  }

  function get(id: string): SocialAccount | null {
    return byId.value.get(id) ?? null
  }

  function validate(input: AccountInput, ignoreAccountId: string | null = null): FieldErrors {
    const errors: FieldErrors = {}
    if (!isPlatformId(input.platform)) errors.platform = PLATFORM_ERROR
    const handleError = validateHandle(input.handle)
    if (handleError) errors.handle = handleError
    else if (isHandleTaken(accounts.value, input.platform, input.handle, ignoreAccountId)) {
      errors.handle = 'That handle is already connected for this platform.'
    }
    const nameError = validateDisplayName(input.displayName)
    if (nameError) errors.displayName = nameError
    return errors
  }

  function add(input: AccountInput): Result<SocialAccount, FieldErrors> {
    const errors = validate(input)
    if (Object.keys(errors).length > 0) return { ok: false, error: errors }

    const now = new Date().toISOString()
    const handle = input.handle.trim().replace(/^@+/, '')
    const account: SocialAccount = {
      id: newId(),
      platform: input.platform,
      handle,
      displayName: input.displayName.trim(),
      avatarHue: hueFromString(`${input.platform}:${handle}`),
      connected: input.connected ?? true,
      createdAt: now,
      updatedAt: now,
    }
    accounts.value = [...accounts.value, account]
    return { ok: true, value: account }
  }

  function rename(id: string, displayName: string): Result<SocialAccount, string> {
    const account = get(id)
    if (!account) return { ok: false, error: 'That channel no longer exists.' }
    const error = validateDisplayName(displayName)
    if (error) return { ok: false, error }
    const next: SocialAccount = {
      ...account,
      displayName: displayName.trim(),
      updatedAt: new Date().toISOString(),
    }
    accounts.value = accounts.value.map((item) => (item.id === id ? next : item))
    return { ok: true, value: next }
  }

  function setConnected(id: string, isConnected: boolean): Result<SocialAccount, string> {
    const account = get(id)
    if (!account) return { ok: false, error: 'That channel no longer exists.' }
    const next: SocialAccount = { ...account, connected: isConnected, updatedAt: new Date().toISOString() }
    accounts.value = accounts.value.map((item) => (item.id === id ? next : item))
    return { ok: true, value: next }
  }

  /**
   * Cascading delete: the account, its slots, its posts and any media left
   * unreferenced. The returned snapshot powers the 8-second Undo toast.
   */
  function remove(id: string): AccountRemovalSnapshot | null {
    const account = get(id)
    if (!account) return null

    const slotsStore = useSlotsStore()
    const postsStore = usePostsStore()
    const mediaStore = useMediaStore()
    const activityStore = useActivityStore()

    const slots = slotsStore.removeForAccount(id)
    const posts = postsStore.removeForAccount(id)
    const media = mediaStore.gc(postsStore.referencedMediaIds())
    const removedActivity = activityStore.entries.filter(
      (entry) => entry.postId !== null && posts.some((post) => post.id === entry.postId),
    )

    accounts.value = accounts.value.filter((item) => item.id !== id)
    activityStore.removeManyForPosts(new Set(posts.map((post) => post.id)))
    activityStore.log('deleted', `Removed @${account.handle}`, null)

    const snapshot: AccountRemovalSnapshot = { account, posts, slots, media, activity: removedActivity }
    useUiStore().rememberAccountRemoval(snapshot, posts.length, account.handle)
    return snapshot
  }

  /** Undo for `remove`: re-inserts everything, media last. */
  function restore(snapshot: AccountRemovalSnapshot): void {
    const ui = useUiStore()
    ui.clearAccountSnapshot()
    accounts.value = [...accounts.value, snapshot.account]
    useSlotsStore().restore(snapshot.slots)
    usePostsStore().restoreList(snapshot.posts)
    useMediaStore().restore(snapshot.media)
    useActivityStore().prepend(snapshot.activity)
    useActivityStore().log('created', `Restored @${snapshot.account.handle}`, null)
  }

  function replaceAll(list: readonly SocialAccount[]): void {
    accounts.value = [...list]
  }

  const persistApi: PersistApi<SocialAccount[]> = {
    key: STORE_KEYS.accounts,
    version: 1,
    read: () => accounts.value,
    apply: (data) => {
      accounts.value = data
    },
    parse: (raw) => parseArray(SocialAccountSchema, raw),
    fallback: [],
  }

  return {
    accounts,
    byId,
    connected,
    count,
    hasAny,
    droppedCount,
    forPlatform,
    forIds,
    get,
    validate,
    add,
    rename,
    setConnected,
    remove,
    restore,
    replaceAll,
    persistApi,
  }
})
