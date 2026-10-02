import { describe, expect, it } from 'vitest'
import {
  FAILURE_RATE,
  LATENCY_MAX_MS,
  LATENCY_MIN_MS,
  decidePublish,
  describeFailure,
  generateMetrics,
  runPublish,
  simulateLatencyMs,
} from '@/lib/publisher'
import { makeAccount } from '@/lib/__tests__/fixtures'

const never = (): number => 0.99
const always = (): number => 0

describe('decidePublish', () => {
  it('succeeds for a connected account with content', () => {
    expect(
      decidePublish({
        account: makeAccount(),
        content: 'hello',
        mediaCount: 0,
        simulateFailures: false,
        random: never,
      }),
    ).toEqual({ ok: true })
  })

  it('fails when the account is gone or disconnected', () => {
    const disconnected = decidePublish({
      account: makeAccount({ connected: false }),
      content: 'hello',
      mediaCount: 0,
      simulateFailures: false,
      random: never,
    })
    expect(disconnected).toMatchObject({ ok: false, code: 'ACCOUNT_DISCONNECTED' })

    const missing = decidePublish({
      account: null,
      content: 'hello',
      mediaCount: 0,
      simulateFailures: false,
      random: never,
    })
    expect(missing).toMatchObject({ ok: false, code: 'ACCOUNT_DISCONNECTED' })
  })

  it('fails when there is nothing left to publish', () => {
    expect(
      decidePublish({
        account: makeAccount(),
        content: '   ',
        mediaCount: 0,
        simulateFailures: false,
        random: never,
      }),
    ).toMatchObject({ ok: false, code: 'CONTENT_INVALID' })
  })

  it('requires media for Instagram', () => {
    expect(
      decidePublish({
        account: makeAccount({ platform: 'instagram' }),
        content: 'caption',
        mediaCount: 0,
        simulateFailures: false,
        random: never,
      }),
    ).toMatchObject({ ok: false, code: 'MEDIA_MISSING' })

    expect(
      decidePublish({
        account: makeAccount({ platform: 'instagram' }),
        content: 'caption',
        mediaCount: 1,
        simulateFailures: false,
        random: never,
      }),
    ).toEqual({ ok: true })
  })

  it('fails at the configured rate only when simulation is on', () => {
    const base = {
      account: makeAccount(),
      content: 'hello',
      mediaCount: 0,
      random: always,
    }
    expect(decidePublish({ ...base, simulateFailures: false })).toEqual({ ok: true })
    expect(decidePublish({ ...base, simulateFailures: true })).toMatchObject({
      ok: false,
      code: 'RATE_LIMITED',
    })
    expect(FAILURE_RATE).toBe(0.25)
  })

  it('does not fail at the boundary of the rate', () => {
    expect(
      decidePublish({
        account: makeAccount(),
        content: 'hello',
        mediaCount: 0,
        simulateFailures: true,
        random: () => FAILURE_RATE,
      }),
    ).toEqual({ ok: true })
  })
})

describe('latency and metrics', () => {
  it('stays inside the latency window', () => {
    expect(simulateLatencyMs(always)).toBe(LATENCY_MIN_MS)
    expect(simulateLatencyMs(() => 0.999999)).toBe(LATENCY_MAX_MS)
  })

  it('produces plausible, platform-aware metrics', () => {
    const x = generateMetrics('x', always)
    const instagram = generateMetrics('instagram', always)
    expect(x.impressions).toBeGreaterThan(0)
    expect(x.likes).toBeLessThan(x.impressions)
    expect(x.comments).toBeLessThan(x.likes)
    expect(instagram.impressions).toBeGreaterThan(x.impressions)
    expect(generateMetrics('threads', () => 0.5).impressions).toBeGreaterThan(0)
  })

  it('labels every failure code', () => {
    expect(describeFailure('RATE_LIMITED')).toBe('Rate limited')
    expect(describeFailure('MISSED')).toBe('Missed its window')
    expect(describeFailure('ACCOUNT_DISCONNECTED')).toBe('Channel disconnected')
    expect(describeFailure('CONTENT_INVALID')).toBe('Nothing to publish')
    expect(describeFailure('MEDIA_MISSING')).toBe('Media required')
  })
})

describe('runPublish', () => {
  it('resolves a successful publish with metrics and a timestamp', async () => {
    const outcome = await runPublish({
      account: makeAccount(),
      content: 'hello',
      mediaCount: 0,
      simulateFailures: false,
      random: always,
      now: () => new Date('2026-10-07T01:00:00.000Z'),
    })
    expect(outcome).toMatchObject({ ok: true, publishedAt: '2026-10-07T01:00:00.000Z' })
    if (outcome.ok) expect(outcome.metrics.impressions).toBeGreaterThan(0)
  }, 10_000)

  it('resolves a failure outcome after the simulated latency', async () => {
    const outcome = await runPublish({
      account: null,
      content: 'hello',
      mediaCount: 0,
      simulateFailures: false,
      random: always,
    })
    expect(outcome).toMatchObject({ ok: false, code: 'ACCOUNT_DISCONNECTED' })
  }, 10_000)
})
