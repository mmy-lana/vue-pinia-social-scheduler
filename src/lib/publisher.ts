import { PLATFORMS } from '@/lib/platforms'
import { randomInt, sleep } from '@/lib/utils'
import type { FailureCode, ISODateString, PlatformId, PostMetrics, SocialAccount } from '@/types'

/**
 * The "network" layer of the scheduler. There is no backend, so publishing is a
 * simulated round trip: a latency window, an account check and an optional
 * injected failure. Randomness is always injected so behavior stays testable.
 */

export const LATENCY_MIN_MS = 800
export const LATENCY_MAX_MS = 1_500

/** Probability of a `RATE_LIMITED` failure while "Simulate failures" is on. */
export const FAILURE_RATE = 0.25

export type PublishDecision =
  | { ok: true }
  | { ok: false; code: FailureCode; message: string }

export interface PublishInput {
  /** `null` when the account was removed while the post was queued. */
  account: SocialAccount | null
  content: string
  mediaCount: number
  simulateFailures: boolean
  random: () => number
}

export function simulateLatencyMs(random: () => number = Math.random): number {
  return randomInt(LATENCY_MIN_MS, LATENCY_MAX_MS, random)
}

/** Deterministic ordering of failure reasons: connection, content, media, rate limit. */
export function decidePublish(input: PublishInput): PublishDecision {
  if (!input.account || !input.account.connected) {
    return {
      ok: false,
      code: 'ACCOUNT_DISCONNECTED',
      message: 'The channel was disconnected before this post could go out.',
    }
  }

  if (input.content.trim().length === 0 && input.mediaCount === 0) {
    return {
      ok: false,
      code: 'CONTENT_INVALID',
      message: 'Nothing left to publish — both the text and the media were removed.',
    }
  }

  const platform = input.account.platform
  if (PLATFORMS[platform].requiresMedia && input.mediaCount === 0) {
    return {
      ok: false,
      code: 'MEDIA_MISSING',
      message: `${PLATFORMS[platform].label} needs at least one image.`,
    }
  }

  if (input.simulateFailures && input.random() < FAILURE_RATE) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'The network rate-limited this publish. Retry when you are ready.',
    }
  }

  return { ok: true }
}

const PLATFORM_REACH: Record<PlatformId, number> = {
  x: 1,
  threads: 0.8,
  instagram: 1.6,
  linkedin: 0.9,
  facebook: 1.2,
}

export function generateMetrics(
  platform: PlatformId,
  random: () => number = Math.random,
): PostMetrics {
  const reach = PLATFORM_REACH[platform]
  const impressions = Math.round((1_200 + random() * 24_000) * reach)
  const likeRate = 0.02 + random() * 0.05
  const commentRate = 0.002 + random() * 0.008
  const shareRate = 0.001 + random() * 0.006
  const clickRate = 0.003 + random() * 0.02
  return {
    impressions,
    likes: Math.round(impressions * likeRate),
    comments: Math.round(impressions * commentRate),
    shares: Math.round(impressions * shareRate),
    clicks: Math.round(impressions * clickRate),
  }
}

export interface PublishSuccess {
  ok: true
  publishedAt: ISODateString
  metrics: PostMetrics
}

export interface PublishFailure {
  ok: false
  code: FailureCode
  message: string
}

export type PublishOutcome = PublishSuccess | PublishFailure

export interface RunPublishInput extends PublishInput {
  now?: () => Date
  signal?: AbortSignal
}

/**
 * Full simulated publish: decide, wait out the latency, then report. The caller
 * (the scheduler store) applies the outcome to the post.
 */
export async function runPublish(input: RunPublishInput): Promise<PublishOutcome> {
  const decision = decidePublish(input)
  const latency = simulateLatencyMs(input.random)
  await sleep(latency, input.signal)

  if (!decision.ok) {
    return { ok: false, code: decision.code, message: decision.message }
  }

  const platform = input.account?.platform ?? 'x'
  return {
    ok: true,
    publishedAt: (input.now?.() ?? new Date()).toISOString(),
    metrics: generateMetrics(platform, input.random),
  }
}

export function describeFailure(code: FailureCode): string {
  switch (code) {
    case 'ACCOUNT_DISCONNECTED':
      return 'Channel disconnected'
    case 'CONTENT_INVALID':
      return 'Nothing to publish'
    case 'RATE_LIMITED':
      return 'Rate limited'
    case 'MISSED':
      return 'Missed its window'
    case 'MEDIA_MISSING':
      return 'Media required'
  }
}
