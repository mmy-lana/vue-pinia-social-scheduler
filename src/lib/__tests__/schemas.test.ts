import { describe, expect, it } from 'vitest'
import {
  AppSettingsSchema,
  ComposerDraftSchema,
  MediaAssetSchema,
  PostSchema,
  QueueSlotSchema,
  SCHEMA_SYNC_CHECKS,
  SocialAccountSchema,
  ActivityEntrySchema,
  parseArray,
  parseObject,
} from '@/lib/schemas'
import { makeAccount, makeMedia, makePost, makeSettings, makeSlot } from '@/lib/__tests__/fixtures'
import type { Post } from '@/types'

describe('schema sync', () => {
  it('keeps the schemas and the domain interfaces in sync', () => {
    expect(SCHEMA_SYNC_CHECKS.every((check) => check === true)).toBe(true)
  })
})

describe('record validation', () => {
  it('accepts well-formed entities', () => {
    expect(SocialAccountSchema.safeParse(makeAccount()).success).toBe(true)
    expect(QueueSlotSchema.safeParse(makeSlot()).success).toBe(true)
    expect(MediaAssetSchema.safeParse(makeMedia()).success).toBe(true)
    expect(PostSchema.safeParse(makePost()).success).toBe(true)
    expect(AppSettingsSchema.safeParse(makeSettings()).success).toBe(true)
  })

  it('rejects unknown platforms, handles and statuses', () => {
    expect(SocialAccountSchema.safeParse(makeAccount({ platform: 'myspace' as never })).success).toBe(false)
    expect(SocialAccountSchema.safeParse(makeAccount({ handle: 'a' })).success).toBe(false)
    expect(SocialAccountSchema.safeParse(makeAccount({ handle: 'has space' })).success).toBe(false)
    expect(PostSchema.safeParse(makePost({ status: 'pending' as never })).success).toBe(false)
  })

  it('rejects an avatar hue outside 0–359', () => {
    expect(SocialAccountSchema.safeParse(makeAccount({ avatarHue: 400 })).success).toBe(false)
    expect(SocialAccountSchema.safeParse(makeAccount({ avatarHue: -1 })).success).toBe(false)
  })

  it('rejects updatedAt before createdAt', () => {
    expect(
      SocialAccountSchema.safeParse(
        makeAccount({ createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }),
      ).success,
    ).toBe(false)
  })

  it('rejects a draft carrying a scheduled instant', () => {
    expect(
      PostSchema.safeParse(makePost({ status: 'draft', scheduledAt: '2026-10-02T09:30:00.000Z' }))
        .success,
    ).toBe(false)
    expect(PostSchema.safeParse(makePost({ status: 'draft', scheduledAt: null })).success).toBe(true)
  })

  it('rejects a published post without publishedAt', () => {
    expect(
      PostSchema.safeParse(
        makePost({ status: 'published', publishedAt: null, metrics: null }),
      ).success,
    ).toBe(false)
  })

  it('rejects a bad slot time and an unknown timezone', () => {
    expect(QueueSlotSchema.safeParse(makeSlot({ time: '9:00' })).success).toBe(false)
    expect(QueueSlotSchema.safeParse(makeSlot({ time: '25:00' })).success).toBe(false)
    expect(AppSettingsSchema.safeParse(makeSettings({ timezone: 'Mars/Base' })).success).toBe(false)
  })

  it('rejects a non-integer week start', () => {
    expect(AppSettingsSchema.safeParse(makeSettings({ weekStartsOn: 2 as never })).success).toBe(false)
    expect(AppSettingsSchema.safeParse(makeSettings({ weekStartsOn: 0 })).success).toBe(true)
  })

  it('strips unknown keys instead of persisting them', () => {
    const parsed = SocialAccountSchema.parse({ ...makeAccount(), sneaky: true })
    expect(parsed).not.toHaveProperty('sneaky')
  })

  it('drops trailing garbage from arrays of ids', () => {
    const post = makePost({ mediaIds: ['a', '', 'c'] })
    expect(PostSchema.safeParse(post).success).toBe(false)
  })
})

describe('parseArray', () => {
  it('keeps valid records and counts the dropped ones', () => {
    const raw = [makePost({ id: 'a' }), { id: 'broken' }, makePost({ id: 'b' })]
    const result = parseArray<Post>(PostSchema, raw)
    expect(result.data.map((post) => post.id)).toEqual(['a', 'b'])
    expect(result.dropped).toBe(1)
  })

  it('returns an empty list for a non-array payload', () => {
    expect(parseArray(PostSchema, { nope: true })).toEqual({ data: [], dropped: 0 })
    expect(parseArray(PostSchema, null)).toEqual({ data: [], dropped: 0 })
    expect(parseArray(PostSchema, undefined)).toEqual({ data: [], dropped: 0 })
  })

  it('drops every record when all of them are corrupt', () => {
    const result = parseArray(PostSchema, [1, 'two', null])
    expect(result.data).toEqual([])
    expect(result.dropped).toBe(3)
  })

  it('falls back for a single unusable object', () => {
    const fallback = makePost({ id: 'fallback' })
    expect(parseObject(PostSchema, makePost(), fallback).dropped).toBe(0)
    expect(parseObject(PostSchema, { bad: true }, fallback).dropped).toBe(1)
    expect(parseObject(PostSchema, undefined, fallback).data[0]?.id).toBe('fallback')
    expect(parseObject(PostSchema, undefined, fallback).dropped).toBe(0)
  })
})

describe('composer draft', () => {
  it('accepts an empty autosave and rejects a broken mode', () => {
    expect(
      ComposerDraftSchema.safeParse({
        content: '',
        accountIds: [],
        mediaIds: [],
        mode: 'schedule',
        date: '2026-10-02',
        time: '09:30',
        editingPostId: null,
        savedAt: '2026-10-01T02:00:00.000Z',
      }).success,
    ).toBe(true)
    expect(
      ComposerDraftSchema.safeParse({
        content: '',
        accountIds: [],
        mediaIds: [],
        mode: 'teleport',
        date: '',
        time: '',
        editingPostId: null,
        savedAt: '2026-10-01T02:00:00.000Z',
      }).success,
    ).toBe(false)
  })
})

describe('activity entries', () => {
  it('accepts a null postId and rejects an unknown type', () => {
    const entry = { id: 'a1', postId: null, type: 'published', message: 'ok', at: '2026-10-01T02:00:00.000Z' }
    expect(ActivityEntrySchema.safeParse(entry).success).toBe(true)
    expect(ActivityEntrySchema.safeParse({ ...entry, type: 'exploded' }).success).toBe(false)
  })
})
