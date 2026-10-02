import { usePostsStore } from '@/stores/usePostsStore'
import { useUiStore } from '@/stores/useUiStore'
import { useSchedulerStore } from '@/stores/useSchedulerStore'
import { useMediaStore } from '@/stores/useMediaStore'
import { nowIso } from '@/lib/datetime'
import type { PostActionId, PostRemovalSnapshot } from '@/types'

/** How long a destructive action offers "Undo" in its toast. */
export const POST_UNDO_MS = 8_000

export interface PostActionController {
  /**
   * Runs one entry of the post action matrix. Components own no business rules:
   * they emit an id and this decides what it means, so the timeline, the
   * library, the queue and the calendar behave identically.
   */
  run: (postId: string, action: PostActionId) => Promise<void>
  /** Clears media no post references any more. */
  collectMedia: () => void
  /** Drops a pending deferred sweep, for callers tearing down mid-window. */
  cancelMediaCollection: () => void
}

export function usePostActions(): PostActionController {
  const posts = usePostsStore()
  const ui = useUiStore()
  const scheduler = useSchedulerStore()
  const media = useMediaStore()

  const pendingCollectionTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function collectMedia(): void {
    const protectedIds = new Set<string>()
    if (ui.postSnapshot) {
      for (const asset of ui.postSnapshot.media) protectedIds.add(asset.id)
    }
    const referenced = posts.referencedMediaIds()
    media.gc(new Set([...referenced, ...protectedIds]))
  }

  /**
   * Sweeps media left unreferenced by a deletion, once the undo window closes.
   *
   * Active undo snapshot assets are shielded from collection, and each deleted
   * post group is tracked by an independent timer to prevent chained deletions
   * from dropping garbage collection callbacks.
   */
  function scheduleMediaCollection(snapshot: PostRemovalSnapshot): void {
    const groupId = snapshot.posts[0]?.groupId ?? snapshot.posts[0]?.id ?? null
    if (groupId === null) return

    const existingTimer = pendingCollectionTimers.get(groupId)
    if (existingTimer !== undefined) clearTimeout(existingTimer)

    const timer = setTimeout(() => {
      pendingCollectionTimers.delete(groupId)
      const openGroupId = ui.postSnapshot?.posts[0]?.groupId ?? ui.postSnapshot?.posts[0]?.id ?? null
      if (openGroupId === groupId) {
        ui.clearPostSnapshot()
      }
      collectMedia()
    }, POST_UNDO_MS)

    pendingCollectionTimers.set(groupId, timer)
  }

  /** Cancels all pending sweeps, for callers that tear down mid-window. */
  function cancelMediaCollection(): void {
    for (const timer of pendingCollectionTimers.values()) {
      clearTimeout(timer)
    }
    pendingCollectionTimers.clear()
  }

  async function run(postId: string, action: PostActionId): Promise<void> {
    const post = posts.get(postId)
    if (!post) {
      ui.toast({ tone: 'warn', message: 'That post no longer exists.' })
      return
    }

    switch (action) {
      case 'edit':
      case 'schedule':
      case 'reschedule': {
        ui.openComposer({ editingPostId: post.id })
        return
      }

      case 'publish-now': {
        // Publishing now bypasses the lead-time window on purpose, so it goes
        // through `update` rather than `reschedule`, and then nudges the engine.
        const result = posts.update(post.id, {
          status: 'scheduled',
          scheduledAt: nowIso(),
          failure: null,
          nextRetryAt: null,
        })
        if (!result.ok) {
          ui.toast({ tone: 'danger', message: result.error })
          return
        }
        ui.toast({ tone: 'info', message: 'Publishing now…' })
        await scheduler.tick()
        return
      }

      case 'move-to-drafts': {
        const result = posts.moveToDraft(post.id)
        if (!result.ok) {
          ui.toast({ tone: 'danger', message: result.error })
          return
        }
        ui.toast({ tone: 'neutral', message: 'Moved to drafts' })
        return
      }

      case 'duplicate': {
        const result = posts.duplicate(post.id)
        if (!result.ok) {
          ui.toast({ tone: 'danger', message: result.error })
          return
        }
        ui.toast({
          tone: 'ok',
          message: 'Duplicated as a draft',
          actionLabel: 'Edit copy',
          onAction: () => ui.openComposer({ editingPostId: result.value.id }),
        })
        return
      }

      case 'retry': {
        const result = posts.retry(post.id)
        if (!result.ok) {
          ui.toast({ tone: 'danger', message: result.error })
          return
        }
        ui.toast({ tone: 'info', message: 'Retrying in a few seconds…' })
        await scheduler.tick()
        return
      }

      case 'delete': {
        const snapshot = posts.remove(post.id)
        if (!snapshot) {
          ui.toast({ tone: 'warn', message: 'That post no longer exists.' })
          return
        }
        // The store raises the single "Deleted ... Undo" toast, which restores
        // the posts *and* their media. Collection waits for that window to end.
        scheduleMediaCollection(snapshot)
        return
      }

      default: {
        ui.toast({ tone: 'warn', message: `Unsupported action: ${action}` })
      }
    }
  }

  return { run, collectMedia, cancelMediaCollection }
}