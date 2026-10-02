import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NS,
  SCHEMA_VERSION,
  clearNamespace,
  listNamespaceKeys,
  namespaceBytes,
  readEnvelope,
  readRaw,
  removeKey,
  storageAvailable,
  writeEnvelope,
  writeRaw,
} from '@/lib/storage'

const KEY = `${NS}posts`

describe('storage envelopes', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('reports localStorage as available under happy-dom', () => {
    expect(storageAvailable).toBe(true)
  })

  it('returns the fallback when the key is missing', () => {
    expect(readEnvelope(KEY, 1, [])).toEqual([])
  })

  it('round-trips a versioned payload', () => {
    const data = { posts: ['a', 'b'], version: SCHEMA_VERSION }
    const written = writeEnvelope(KEY, SCHEMA_VERSION, data)
    expect(written).toEqual({ ok: true, value: true })
    expect(readEnvelope(KEY, SCHEMA_VERSION, null)).toEqual(data)
  })

  it('strips the envelope before handing data back', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, data: [1, 2] }))
    expect(readEnvelope<number[]>(KEY, 1, [])).toEqual([1, 2])
  })

  it('runs the migration chain up to the current version', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, data: { count: 1 } }))
    const migrations = {
      1: (data: unknown) => {
        const value = data as { count: number }
        return { count: value.count + 41 }
      },
    }
    expect(readEnvelope<{ count: number }>(KEY, 2, { count: 0 }, migrations)).toEqual({ count: 42 })
  })

  it('falls back and backs up when no migration exists', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, data: { count: 1 } }))
    expect(readEnvelope(KEY, 3, 'fallback')).toBe('fallback')
    expect(
      Object.keys(window.localStorage).filter((name) => name.startsWith(`${NS}backup:`)),
    ).toHaveLength(1)
  })

  it('falls back and backs up a future version', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 99, data: 'from the future' }))
    expect(readEnvelope(KEY, 1, 'fallback')).toBe('fallback')
    expect(Object.keys(window.localStorage).filter((n) => n.startsWith(`${NS}backup:`))).toHaveLength(1)
  })

  it('falls back on unparsable JSON without throwing', () => {
    window.localStorage.setItem(KEY, '{not json')
    expect(readEnvelope(KEY, 1, [])).toEqual([])
  })

  it('rejects an envelope without a numeric version', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ data: [] }))
    expect(readEnvelope(KEY, 1, 'fallback')).toBe('fallback')
  })

  it('keeps at most three backups, dropping the oldest', () => {
    for (let i = 0; i < 5; i += 1) {
      window.localStorage.setItem(`${NS}backup:posts:${1000 + i}`, `payload-${i}`)
    }
    writeRaw(KEY, '{broken')
    readEnvelope(KEY, 1, [])

    const namespace = listNamespaceKeys()
    expect(namespace).toEqual([`${NS}posts`])

    const remaining: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key?.startsWith(`${NS}backup:`)) remaining.push(key)
    }
    expect(remaining).toHaveLength(3)
    expect(remaining.some((key) => key.startsWith(`${NS}backup:posts:1000`))).toBe(false)
    expect(remaining.filter((key) => key.startsWith(`${NS}backup:posts:1004`))).toHaveLength(1)
    expect(remaining.some((key) => /:\d{13}$/.test(key))).toBe(true)
  })

  it('reports quota errors distinctly from other write failures', () => {
    const spy = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('exceeded', 'QuotaExceededError')
      })
    expect(writeEnvelope(KEY, 1, ['x'])).toEqual({ ok: false, error: 'quota' })

    spy.mockImplementation(() => {
      throw new Error('something else')
    })
    expect(writeEnvelope(KEY, 1, ['x'])).toEqual({ ok: false, error: 'unknown' })
    spy.mockRestore()
    expect(writeEnvelope(KEY, 1, ['x'])).toEqual({ ok: true, value: true })
  })

  it('removes keys and reports namespace usage', () => {
    writeEnvelope(`${NS}accounts`, 1, ['a'])
    writeEnvelope(`${NS}slots`, 1, ['b'])
    expect(listNamespaceKeys().sort()).toEqual([`${NS}accounts`, `${NS}slots`])
    expect(namespaceBytes()).toBeGreaterThan(0)

    removeKey(`${NS}accounts`)
    expect(listNamespaceKeys()).toEqual([`${NS}slots`])
    expect(readRaw(`${NS}slots`)).not.toBeNull()

    clearNamespace()
    expect(listNamespaceKeys()).toEqual([])
  })
})
