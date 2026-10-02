import { describe, expect, it } from 'vitest'
import {
  baseName,
  byNumber,
  clamp,
  cx,
  debounce,
  deepClone,
  fileExtension,
  formatBytes,
  formatCompactNumber,
  formatInteger,
  groupBy,
  hueFromString,
  initialsOf,
  isDefined,
  newId,
  pickRandom,
  pluralize,
  randomInt,
  titleCase,
  uniqueBy,
  assertNever,
} from '@/lib/utils'

describe('newId', () => {
  it('produces unique v4-shaped identifiers', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()))
    expect(ids.size).toBe(200)
    for (const id of ids) {
      expect(id).toMatch(/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$/)
    }
  })

  it('falls back to a manual generator without crypto.randomUUID', () => {
    const original = globalThis.crypto
    const stubbed = {
      ...original,
      randomUUID: undefined,
    } as unknown as Crypto
    Object.defineProperty(globalThis, 'crypto', { value: stubbed, configurable: true })
    try {
      const id = newId()
      expect(id).toHaveLength(36)
      expect(id[14]).toBe('4')
      expect(new Set([newId(), newId()]).size).toBe(2)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true })
    }
  })
})

describe('debounce', () => {
  it('runs once on the trailing edge', async () => {
    let calls = 0
    const fn = debounce(() => {
      calls += 1
    }, 20)
    fn()
    fn()
    fn()
    expect(calls).toBe(0)
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(calls).toBe(1)
  })

  it('can be cancelled and flushed', async () => {
    let value = ''
    const fn = debounce((next: string) => {
      value = next
    }, 50)

    fn('first')
    expect(fn.pending).toBe(true)
    fn.cancel()
    await new Promise((resolve) => setTimeout(resolve, 70))
    expect(value).toBe('')
    expect(fn.pending).toBe(false)

    fn('second')
    fn.flush()
    expect(value).toBe('second')
  })
})

describe('numbers and strings', () => {
  it('clamps values', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-2, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })

  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(900)).toBe('900 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
  })

  it('formats numbers compactly', () => {
    expect(formatCompactNumber(1200)).toMatch(/1\.2K/)
    expect(formatInteger(1234567)).toMatch(/1.234.567/)
  })

  it('pluralizes, title-cases and takes initials', () => {
    expect(pluralize(1, 'post')).toBe('post')
    expect(pluralize(2, 'post')).toBe('posts')
    expect(titleCase('hello there')).toBe('Hello There')
    expect(initialsOf('Lana Builds')).toBe('LB')
    expect(initialsOf('lana')).toBe('LA')
    expect(initialsOf('   ')).toBe('?')
  })

  it('derives a stable hue', () => {
    expect(hueFromString('x:lanabuilds')).toBe(hueFromString('x:lanabuilds'))
    expect(hueFromString('x:lanabuilds')).toBeGreaterThanOrEqual(0)
    expect(hueFromString('x:lanabuilds')).toBeLessThan(360)
    expect(hueFromString('a')).not.toBe(hueFromString('b'))
  })

  it('extracts file names and extensions', () => {
    expect(fileExtension('Photo Final.JPEG')).toBe('jpeg')
    expect(fileExtension('noext')).toBe('')
    expect(baseName('Photo Final.jpeg')).toBe('Photo Final')
    expect(baseName('.hidden')).toBe('.hidden')
  })

  it('joins class names', () => {
    expect(cx('a', false, null, undefined, 'b')).toBe('a b')
  })
})

describe('collections', () => {
  it('groups, dedupes, sorts and filters', () => {
    const rows = [
      { id: 'a', day: '2026-10-01', n: 2 },
      { id: 'b', day: '2026-10-01', n: 1 },
      { id: 'c', day: '2026-10-02', n: 3 },
      { id: 'a', day: '2026-10-03', n: 4 },
    ]
    expect([...groupBy(rows, (row) => row.day).keys()]).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ])
    expect(groupBy(rows, (row) => row.day).get('2026-10-01')).toHaveLength(2)
    expect(uniqueBy(rows, (row) => row.id).map((row) => row.day)).toEqual([
      '2026-10-01',
      '2026-10-01',
      '2026-10-02',
    ])
    expect([...rows].sort(byNumber((row) => row.n)).map((row) => row.id)).toEqual([
      'b',
      'a',
      'c',
      'a',
    ])
    expect(rows.filter(isDefined)).toHaveLength(4)
  })

  it('deep clones nested state for undo snapshots', () => {
    const original = { posts: [{ id: 'a', tags: ['x'] }] }
    const clone = deepClone(original)
    clone.posts[0]?.tags.push('y')
    expect(original.posts[0]?.tags).toEqual(['x'])
  })

  it('throws a descriptive error for unhandled variants', () => {
    expect(() => assertNever('nope' as never, 'action')).toThrow(/action: unhandled variant/)
  })
})

describe('randomness', () => {
  it('respects the injected generator', () => {
    expect(randomInt(1, 3, () => 0)).toBe(1)
    expect(randomInt(1, 3, () => 0.999)).toBe(3)
    expect(pickRandom(['a', 'b', 'c'], () => 0)).toBe('a')
    expect(pickRandom([], () => 0)).toBeUndefined()
  })
})
