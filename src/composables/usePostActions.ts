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

  let collectionTimer: ReturnType<typeof setTimeout> | null = null

  function collectMedia(): void {
    media.gc(posts.referencedMediaIds())
  }

  /**
   * Sweeps media left unreferenced by a deletion, once the undo window closes.
   *
   * Collecting immediately would destroy the very assets an undo needs: the
   * restored post would carry `mediaIds` that no longer resolve and its photos
   * would silently disappear. The sweep is deferred to the end of the window
   * instead, and decides what to do by asking whether *this* snapshot is still
   * the open one:
   *
   *  - still open  — the window closed with no undo, so retire it and collect;
   *  - superseded  — a newer deletion owns the window; its timer will collect;
   *  - cleared     — the user undid, and the restored post references its media
   *                  again, so collecting is naturally a no-op.
   */
  function scheduleMediaCollection(snapshot: PostRemovalSnapshot): void {
    if (collectionTimer !== null) clearTimeout(collectionTimer)
    collectionTimer = setTimeout(() => {
      collectionTimer = null
      // Compared by id rather than by reference: Pinia hands back a reactive
      // proxy of the snapshot, so `===` against the raw object never matches.
      const ownId = snapshot.posts[0]?.id ?? null
      const openId = ui.postSnapshot?.posts[0]?.id ?? null
      if (ownId !== null && openId === ownId) {
        ui.clearPostSnapshot()
        collectMedia()
      }
    }, POST_UNDO_MS)
  }

  /** Cancels a pending sweep, for callers that tear down mid-window. */
  function cancelMediaCollection(): void {
    if (collectionTimer === null) return
    clearTimeout(collectionTimer)
    collectionTimer = null
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