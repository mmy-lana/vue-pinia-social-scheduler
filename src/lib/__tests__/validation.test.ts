import { describe, expect, it } from 'vitest'
import {
  canTransition,
  effectiveMediaCap,
  firstErrorField,
  hasErrors,
  isHandleTaken,
  strictestLimit,
  validateComposer,
  validateDisplayName,
  validateHandle,
  validateSlotAddition,
  validateSlotTime,
  type ComposerValidationInput,
} from '@/lib/validation'
import { makeAccount, makeSlot } from '@/lib/__tests__/fixtures'
import type { SocialAccount } from '@/types'

const NOW = new Date('2026-10-01T02:00:00.000Z')
const SOON = '2026-10-01T02:30:00.000Z'

function composerInput(
  overrides: Partial<ComposerValidationInput> = {},
): ComposerValidationInput {
  return {
    content: 'Ship the queue.',
    accounts: [makeAccount()],
    mediaCount: 0,
    mode: 'schedule',
    scheduledAtIso: SOON,
    now: NOW,
    hasSlotsFor: () => true,
    mediaExists: () => true,
    mediaIds: [],
    ...overrides,
  }
}

describe('limits', () => {
  it('finds the strictest channel and names it', () => {
    expect(strictestLimit(['x', 'linkedin'])).toEqual({ limit: 280, by: 'x' })
    expect(strictestLimit(['linkedin', 'facebook'])).toEqual({ limit: 3000, by: 'linkedin' })
    expect(strictestLimit([])).toBeNull()
  })

  it('clamps media by the app cap and the smallest channel', () => {
    expect(effectiveMediaCap(['x'])).toBe(4)
    expect(effectiveMediaCap(['x', 'instagram', 'linkedin'])).toBe(4)
    expect(effectiveMediaCap([])).toBe(4)
  })
})

describe('composer validation', () => {
  it('accepts a complete post', () => {
    expect(validateComposer(composerInput())).toEqual({})
  })

  it('requires a channel for everything but a draft', () => {
    expect(validateComposer(composerInput({ accounts: [] })).accounts).toBe(
      'Select at least one channel.',
    )
    expect(validateComposer(composerInput({ accounts: [], mode: 'draft' })).accounts).toBeUndefined()
  })

  it('rejects a disconnected channel', () => {
    const accounts = [makeAccount({ connected: false })]
    expect(validateComposer(composerInput({ accounts })).accounts).toBe(
      'A selected channel is disconnected.',
    )
  })

  it('requires text or media', () => {
    expect(validateComposer(composerInput({ content: '   ' })).content).toBe(
      'Write something or add media.',
    )
    expect(
      validateComposer(composerInput({ content: '', mediaCount: 1, mediaIds: ['media-1'] })).content,
    ).toBeUndefined()
  })

  it('names the strictest channel when the text is too long', () => {
    const errors = validateComposer(composerInput({ content: 'x'.repeat(281) }))
    expect(errors.content).toBe('Too long for X (281/280).')
  })

  it('counts against the smallest selected channel, not the largest', () => {
    const accounts = [makeAccount({ platform: 'linkedin' }), makeAccount({ platform: 'threads' })]
    expect(validateComposer(composerInput({ accounts, content: 'y'.repeat(501) })).content).toBe(
      'Too long for Threads (501/500).',
    )
  })

  it('caps media across channels', () => {
    const errors = validateComposer(composerInput({ mediaCount: 5, mediaIds: ['a', 'b', 'c', 'd', 'e'] }))
    expect(errors.media).toBe('Too many media for the selected channels (max 4).')
  })

  it('requires media for Instagram', () => {
    const accounts = [makeAccount({ platform: 'instagram' })]
    expect(validateComposer(composerInput({ accounts })).media).toBe(
      'Instagram posts need at least one image.',
    )
  })

  it('lets Instagram through with one image', () => {
    const accounts = [makeAccount({ platform: 'instagram' })]
    const errors = validateComposer(
      composerInput({ accounts, mediaCount: 1, mediaIds: ['media-1'] }),
    )
    expect(errors.media).toBeUndefined()
  })

  it('detects media that vanished from the library', () => {
    const errors = validateComposer(
      composerInput({ mediaCount: 1, mediaIds: ['gone'], mediaExists: () => false }),
    )
    expect(errors.media).toBe('One of the selected media files is no longer available.')
  })

  it('enforces the scheduling window', () => {
    expect(
      validateComposer(composerInput({ scheduledAtIso: '2026-10-01T02:00:30.000Z' })).schedule,
    ).toBe('Pick a time at least 1 minute from now.')
    expect(validateComposer(composerInput({ scheduledAtIso: null })).schedule).toBe(
      'Pick a date and time.',
    )
    expect(
      validateComposer(composerInput({ scheduledAtIso: 'not-a-date' })).schedule,
    ).toBe('Invalid date or time.')
    expect(
      validateComposer(composerInput({ scheduledAtIso: '2028-10-01T02:00:00.000Z' })).schedule,
    ).toBe('Scheduling is limited to 1 year ahead.')
  })

  it('skips the schedule rules for draft, queue and publish-now modes', () => {
    expect(validateComposer(composerInput({ mode: 'draft', scheduledAtIso: null })).schedule).toBe(
      undefined,
    )
    expect(validateComposer(composerInput({ mode: 'now', scheduledAtIso: null })).schedule).toBe(
      undefined,
    )
  })

  it('blocks queue mode when a selected channel has no posting times', () => {
    const accounts = [makeAccount({ id: 'a1', handle: 'alpha' }), makeAccount({ id: 'a2', platform: 'linkedin', handle: 'beta' })]
    const errors = validateComposer(
      composerInput({ mode: 'queue', accounts, hasSlotsFor: (id) => id === 'a1' }),
    )
    expect(errors.schedule).toBe('Add posting times first for: @beta.')
  })

  it('reports the first invalid field', () => {
    const errors = validateComposer(composerInput({ accounts: [], content: '' }))
    expect(hasErrors(errors)).toBe(true)
    expect(firstErrorField(errors)).toBe('accounts')
    expect(firstErrorField({})).toBeNull()
    expect(hasErrors({})).toBe(false)
  })
})

describe('field validators', () => {
  it('validates handles', () => {
    expect(validateHandle('lana')).toBeNull()
    expect(validateHandle('@lana')).toBeNull()
    expect(validateHandle('a')).toBe('Use 2–30 letters, numbers, dots or underscores.')
    expect(validateHandle('has space')).toBe('Use 2–30 letters, numbers, dots or underscores.')
    expect(validateHandle('')).toBe('Enter a handle.')
    expect(validateHandle('a'.repeat(31))).toBe('Use 2–30 letters, numbers, dots or underscores.')
  })

  it('validates display names', () => {
    expect(validateDisplayName('Lana')).toBeNull()
    expect(validateDisplayName('  ')).toBe('Enter a display name.')
    expect(validateDisplayName('n'.repeat(41))).toBe(
      'Keep the display name under 40 characters.',
    )
  })

  it('enforces handle uniqueness per platform, case-insensitively', () => {
    const accounts: SocialAccount[] = [makeAccount({ id: 'a1', handle: 'Lana' })]
    expect(isHandleTaken(accounts, 'x', 'lana')).toBe(true)
    expect(isHandleTaken(accounts, 'linkedin', 'lana')).toBe(false)
    expect(isHandleTaken(accounts, 'x', 'lana', 'a1')).toBe(false)
  })

  it('validates slot times and additions', () => {
    const slots = [makeSlot({ id: 's1', weekday: 1, time: '09:00' })]
    expect(validateSlotTime('09:00')).toBeNull()
    expect(validateSlotTime('9:00')).toBe('Pick a time between 00:00 and 23:59.')
    expect(validateSlotAddition(slots, 'acc-1', 1, '09:00')).toBe(
      'That posting time already exists.',
    )
    expect(validateSlotAddition(slots, 'acc-1', 2, '09:00')).toBeNull()
    expect(validateSlotAddition(slots, 'acc-1', 2, '25:00')).toBe(
      'Pick a time between 00:00 and 23:59.',
    )
  })

  it('caps a channel at 14 weekly posting times', () => {
    const many = Array.from({ length: 14 }, (_, index) =>
      makeSlot({ id: `s${index}`, weekday: 1, time: `0${index}:00` }),
    )
    expect(validateSlotAddition(many, 'acc-1', 2, '09:00')).toBe(
      'You can keep up to 14 posting times per channel.',
    )
  })
})

describe('status transitions', () => {
  it('follows the lifecycle rules', () => {
    expect(canTransition('draft', 'scheduled')).toBe(true)
    expect(canTransition('scheduled', 'draft')).toBe(true)
    expect(canTransition('scheduled', 'publishing')).toBe(true)
    expect(canTransition('publishing', 'published')).toBe(true)
    expect(canTransition('publishing', 'failed')).toBe(true)
    expect(canTransition('failed', 'scheduled')).toBe(true)
  })

  it('treats published as terminal', () => {
    expect(canTransition('published', 'scheduled')).toBe(false)
    expect(canTransition('published', 'draft')).toBe(false)
    expect(canTransition('draft', 'published')).toBe(false)
    expect(canTransition('scheduled', 'failed')).toBe(false)
  })
})
