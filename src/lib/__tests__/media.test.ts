import { describe, expect, it, vi } from 'vitest'
import {
  COMPRESSION_QUALITIES,
  MAX_DIMENSION,
  MAX_DIMENSION_PASSES,
  MEDIA_BUDGET,
  dataUrlBytes,
  fitWithin,
  isAllowedMediaMime,
  mediaAcceptAttribute,
  processImage,
  processImageBatch,
  validateLibraryCapacity,
  validateMediaSize,
  type DecodeSource,
  type EncodedImage,
  type EncodeOptions,
} from '@/lib/media'
import { MAX_MEDIA_ASSETS_TOTAL, MAX_MEDIA_COMPRESSED_BYTES } from '@/lib/platforms'

function makeFile(name: string, type: string, size: number): File {
  const bytes = new Uint8Array(Math.min(size, 64))
  return new File([bytes], name, { type })
}

interface FakeEncoder {
  (source: { width: number; height: number }, drawable: CanvasImageSource, options?: EncodeOptions): Promise<EncodedImage>
  /** Every invocation, in order, so the quality/dimension ladder can be asserted. */
  calls: EncodeOptions[]
}

/**
 * Deterministic stand-in for the canvas encoder: the produced size is a pure
 * function of the fitted dimensions and the quality, which lets the real
 * compression ladder run without a browser canvas.
 */
function fakeEncode(
  sizeFor: (width: number, height: number, quality: number) => number,
): FakeEncoder {
  const calls: EncodeOptions[] = []
  const encode = async (
    source: { width: number; height: number },
    _drawable: CanvasImageSource,
    options?: EncodeOptions,
  ): Promise<EncodedImage> => {
    calls.push(options ?? {})
    const size = fitWithin(source.width, source.height, options?.maxDimension ?? MAX_DIMENSION)
    return {
      blob: new Blob([new Uint8Array(sizeFor(size.width, size.height, options?.quality ?? 0.82))]),
      width: size.width,
      height: size.height,
    }
  }
  return Object.assign(encode, { calls })
}

const decoder: DecodeSource = vi.fn(async (file: File) => ({
  width: 2000,
  height: 1000,
  drawable: {} as unknown as CanvasImageSource,
  close: () => {
    void file
  },
}))

describe('file guards', () => {
  it('accepts only the supported image types', () => {
    expect(isAllowedMediaMime('image/jpeg')).toBe(true)
    expect(isAllowedMediaMime('image/png')).toBe(true)
    expect(isAllowedMediaMime('image/webp')).toBe(true)
    expect(isAllowedMediaMime('image/gif')).toBe(true)
    expect(isAllowedMediaMime('image/svg+xml')).toBe(false)
    expect(isAllowedMediaMime('video/mp4')).toBe(false)
    expect(mediaAcceptAttribute()).toContain('image/jpeg')
  })

  it('rejects empty and oversized files', () => {
    expect(validateMediaSize(0)).toBe('File is empty.')
    expect(validateMediaSize(10 * 1024 * 1024 + 1)).toBe('File is larger than 10 MB.')
    expect(validateMediaSize(1024)).toBeNull()
  })

  it('caps the library size', () => {
    expect(validateLibraryCapacity(0)).toBeNull()
    expect(validateLibraryCapacity(MAX_MEDIA_ASSETS_TOTAL)).toBe(
      `Media library is full (${MAX_MEDIA_ASSETS_TOTAL} items).`,
    )
  })
})

describe('dimension fitting', () => {
  it('scales the longest edge down without distorting', () => {
    expect(fitWithin(2000, 1000, 1600)).toEqual({ width: 1600, height: 800 })
    expect(fitWithin(1000, 2000, 1600)).toEqual({ width: 800, height: 1600 })
  })

  it('never upscales', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })

  it('never collapses to zero', () => {
    expect(fitWithin(4000, 40, 100)).toEqual({ width: 100, height: 1 })
  })
})

describe('data url sizing', () => {
  it('decodes base64 payloads to bytes', () => {
    expect(dataUrlBytes('data:image/jpeg;base64,AAAA')).toBe(3)
    expect(dataUrlBytes('data:image/jpeg;base64,AAA=')).toBe(2)
    expect(dataUrlBytes('data:image/jpeg;base64,AA==')).toBe(1)
    expect(dataUrlBytes('no-comma')).toBe(8)
  })
})

describe('processImage', () => {
  it('rejects an unsupported type', async () => {
    const result = await processImage(makeFile('clip.mp4', 'video/mp4', 100), { decode: decoder })
    expect(result).toEqual({ ok: false, error: 'clip.mp4: unsupported file type.' })
  })

  it('rejects a file over 10 MB', async () => {
    const big = makeFile('big.png', 'image/png', 1)
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 })
    const result = await processImage(big, { decode: decoder })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('big.png: File is larger than 10 MB.')
  })

  it('keeps a small GIF byte-for-byte', async () => {
    const gif = makeFile('loop.gif', 'image/gif', 1024)
    const result = await processImage(gif, { decode: decoder })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.mime).toBe('image/gif')
      expect(result.value.dataUrl).toMatch(/^data:image\/gif/)
    }
  })

  it('rejects an oversized GIF', async () => {
    const gif = makeFile('loop.gif', 'image/gif', 1024)
    Object.defineProperty(gif, 'size', { value: MAX_MEDIA_COMPRESSED_BYTES + 1 })
    const result = await processImage(gif, { decode: decoder })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('GIF is too large')
  })

  it('reports an undecodable image', async () => {
    const failing: DecodeSource = async () => {
      throw new Error('decode failed')
    }
    const result = await processImage(makeFile('x.png', 'image/png', 500), { decode: failing })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('x.png: this image could not be decoded.')
  })

  it('stops at the first quality that fits the target size', async () => {
    const encode = fakeEncode((_w, _h, quality) => Math.round(600_000 * quality))
    const result = await processImage(makeFile('p.png', 'image/png', 900), {
      decode: decoder,
      encode,
    })
    expect(result.ok).toBe(true)
    // 600_000 * 0.7 = 420_000 ≤ 450_000 target, so the ladder stops at the second step.
    expect(encode.calls).toHaveLength(2)
    expect(encode.calls[1]?.quality).toBe(0.7)
  })

  it('shrinks the canvas when no quality is small enough', async () => {
    const encode = fakeEncode((width) => width * 400)
    const result = await processImage(makeFile('p.png', 'image/png', 900), {
      decode: decoder,
      encode,
    })
    expect(result.ok).toBe(true)
    // 4 quality steps per dimension pass, and it stops as soon as one fits.
    expect(encode.calls.length).toBeGreaterThan(COMPRESSION_QUALITIES.length)
    expect(encode.calls.length).toBeLessThanOrEqual(
      COMPRESSION_QUALITIES.length * MAX_DIMENSION_PASSES,
    )
    const lastCall = encode.calls.at(-1)
    expect(lastCall?.maxDimension).toBeLessThan(MAX_DIMENSION)
  })

  it('gives up when even the smallest canvas is too large', async () => {
    const encode = fakeEncode(() => MEDIA_BUDGET.hardCeilingBytes + 1)
    const result = await processImage(makeFile('p.png', 'image/png', 900), {
      decode: decoder,
      encode,
    })
    expect(result).toEqual({ ok: false, error: 'p.png: image could not be compressed enough.' })
  })

  it('releases the decoded source even when encoding fails', async () => {
    const close = vi.fn()
    const decode: DecodeSource = async () => ({
      width: 10,
      height: 10,
      drawable: {} as unknown as CanvasImageSource,
      close,
    })
    const encode = fakeEncode(() => MEDIA_BUDGET.hardCeilingBytes + 1)
    await processImage(makeFile('p.png', 'image/png', 100), { decode, encode })
    expect(close).toHaveBeenCalledOnce()
  })
})

describe('processImageBatch', () => {
  it('collects per-file errors and keeps the good ones', async () => {
    const encode = fakeEncode(() => 1000)
    const result = await processImageBatch(
      [makeFile('a.png', 'image/png', 100), makeFile('b.txt', 'text/plain', 100)],
      { decode: decoder, encode },
    )
    expect(result.assets).toHaveLength(1)
    expect(result.errors).toEqual(['b.txt: unsupported file type.'])
    expect(result.skipped).toBe(0)
  })

  it('skips files once the library is full', async () => {
    const encode = fakeEncode(() => 1000)
    const result = await processImageBatch(
      [
        makeFile('a.png', 'image/png', 100),
        makeFile('b.png', 'image/png', 100),
        makeFile('c.png', 'image/png', 100),
      ],
      { decode: decoder, encode, currentCount: MAX_MEDIA_ASSETS_TOTAL - 1 },
    )
    expect(result.assets).toHaveLength(1)
    expect(result.skipped).toBe(2)
    expect(result.errors).toHaveLength(2)
  })

  it('reports progress per file', async () => {
    const onProgress = vi.fn()
    await processImageBatch([makeFile('a.png', 'image/png', 100)], {
      decode: decoder,
      encode: fakeEncode(() => 100),
      onProgress,
    })
    expect(onProgress).toHaveBeenCalledWith(1, 1)
  })
})
