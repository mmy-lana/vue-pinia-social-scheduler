import { usePostsStore } from '@/stores/usePostsStore'
import { useUiStore } from '@/stores/useUiStore'
import { useSchedulerStore } from '@/stores/useSchedulerStore'
import { useMediaStore } from '@/stores/useMediaStore'
import { nowIso } from '@/lib/datetime'
import type { PostActionId } from '@/types'

/** How long a destructive action offers "Undo" in its toast. */
export const POST_UNDO_MS = 8_000

export interface PostActionController {
  /**
   * Runs one entry of the post action matrix. Components own no business rules:
   * they emit an id and this decides what it means, so the timeline, the
   * library, the queue and the calendar behave identically.
   */
  run: (postId: string, action: PostActionId) => Promise<void>
  /** Clears media no post references any more, after a deletion. */
  collectMedia: () => void
}

export function usePostActions(): PostActionController {
  const posts = usePostsStore()
  const ui = useUiStore()
  const scheduler = useSchedulerStore()
  const media = useMediaStore()

  function collectMedia(): void {
    media.gc(posts.referencedMediaIds())
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
        collectMedia()
        ui.toast({
          tone: 'neutral',
          message:
            snapshot.posts.length > 1
              ? `Deleted ${snapshot.posts.length} posts`
              : 'Post deleted',
          durationMs: POST_UNDO_MS,
          actionLabel: 'Undo',
          onAction: () => {
            posts.restore(snapshot)
            ui.toast({ tone: 'ok', message: 'Post restored' })
          },
        })
        return
      }

      default: {
        ui.toast({ tone: 'warn', message: `Unsupported action: ${action}` })
      }
    }
  }

  return { run, collectMedia }
}