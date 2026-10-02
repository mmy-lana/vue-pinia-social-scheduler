import {
  ALLOWED_MEDIA_MIMES,
  MAX_MEDIA_ASSETS_TOTAL,
  MAX_MEDIA_COMPRESSED_BYTES,
  MAX_MEDIA_RAW_BYTES,
  MAX_STORED_MEDIA_BYTES,
} from '@/lib/platforms'
import { baseName, blobToDataUrl, readAsDataUrl, sleep } from '@/lib/utils'
import type { MediaAsset, MediaMime, Result } from '@/types'

/**
 * Client-side image pipeline. Files are validated, downscaled and re-encoded in
 * the browser so a post never stores a 10 MB original in LocalStorage.
 *
 * The quality ladder aims at `MAX_STORED_MEDIA_BYTES` (the size that keeps the
 * library inside the storage budget) and only gives up above
 * `MAX_MEDIA_COMPRESSED_BYTES`.
 */

export type ProcessedMedia = Omit<MediaAsset, 'id' | 'createdAt' | 'updatedAt'>

export interface MediaBudget {
  maxRawBytes: number
  targetBytes: number
  hardCeilingBytes: number
  maxAssets: number
}

export const MEDIA_BUDGET: MediaBudget = {
  maxRawBytes: MAX_MEDIA_RAW_BYTES,
  targetBytes: MAX_STORED_MEDIA_BYTES,
  hardCeilingBytes: MAX_MEDIA_COMPRESSED_BYTES,
  maxAssets: MAX_MEDIA_ASSETS_TOTAL,
}

export const COMPRESSION_QUALITIES: readonly number[] = [0.82, 0.7, 0.6, 0.5]

export const MAX_DIMENSION = 1600

export const MAX_DIMENSION_PASSES = 4

export const MIN_DIMENSION = 320

/** JPEG encoders ignore alpha, so transparent sources are flattened onto white. */
export const FLATTEN_BACKGROUND = '#ffffff'

export const ALLOWED_MIME_LIST: readonly string[] = ALLOWED_MEDIA_MIMES

export function isAllowedMediaMime(mime: string): mime is MediaMime {
  return (ALLOWED_MEDIA_MIMES as readonly string[]).includes(mime)
}

export function mediaAcceptAttribute(): string {
  return ALLOWED_MEDIA_MIMES.join(',')
}

export function validateMediaSize(bytes: number): string | null {
  if (bytes === 0) return 'File is empty.'
  if (bytes > MAX_MEDIA_RAW_BYTES) return 'File is larger than 10 MB.'
  return null
}

export function validateLibraryCapacity(currentCount: number): string | null {
  if (currentCount >= MAX_MEDIA_ASSETS_TOTAL) {
    return `Media library is full (${MAX_MEDIA_ASSETS_TOTAL} items).`
  }
  return null
}

/** Aspect-preserving fit inside `maxDimension`; never upscales. */
export function fitWithin(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxDimension) return { width, height }
  const ratio = maxDimension / longest
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

/** Decoded byte size of a base64 data URL payload. */
export function dataUrlBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex === -1) return dataUrl.length
  const payload = dataUrl.slice(commaIndex + 1)
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding)
}

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas

export type CanvasFactory = (width: number, height: number) => AnyCanvas

export function createCanvasFactory(): CanvasFactory {
  if (typeof OffscreenCanvas !== 'undefined') {
    return (width, height) => new OffscreenCanvas(width, height)
  }
  return (width, height) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
}

type AnyContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function context2d(canvas: AnyCanvas): AnyContext {
  const context = canvas.getContext('2d') as AnyContext | null
  if (!context) throw new Error('This browser could not provide a 2D canvas context.')
  return context
}

async function canvasToBlob(canvas: AnyCanvas, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/jpeg', quality })
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Image encoding failed.'))
      },
      'image/jpeg',
      quality,
    )
  })
}

interface DecodedSource {
  width: number
  height: number
  drawable: CanvasImageSource
  close: () => void
}

export type DecodeSource = (file: File) => Promise<DecodedSource>

async function decodeSource(file: File): Promise<DecodedSource> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return {
      width: bitmap.width,
      height: bitmap.height,
      drawable: bitmap as unknown as CanvasImageSource,
      close: () => bitmap.close(),
    }
  }
  const dataUrl = await readAsDataUrl(file)
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    drawable: image,
    close: () => {
      image.src = ''
    },
  }
}

export interface EncodeOptions {
  maxDimension?: number
  quality?: number
  createCanvas?: CanvasFactory
}

export interface EncodedImage {
  blob: Blob
  width: number
  height: number
}

/** Draws the source onto a white-backed canvas and encodes it as JPEG. */
export async function encodeAsJpeg(
  source: { width: number; height: number },
  drawable: CanvasImageSource,
  options: EncodeOptions = {},
): Promise<EncodedImage> {
  const factory = options.createCanvas ?? createCanvasFactory()
  const size = fitWithin(source.width, source.height, options.maxDimension ?? MAX_DIMENSION)
  const canvas = factory(size.width, size.height)
  const context = context2d(canvas)
  context.fillStyle = FLATTEN_BACKGROUND
  context.fillRect(0, 0, size.width, size.height)
  context.drawImage(drawable, 0, 0, size.width, size.height)
  const blob = await canvasToBlob(canvas, options.quality ?? 0.82)
  return { blob, width: size.width, height: size.height }
}

export interface ProcessOptions {
  createCanvas?: CanvasFactory
  /** Injectable encoder; defaults to the real canvas pipeline. */
  encode?: typeof encodeAsJpeg
  /** Injectable decoder; defaults to `createImageBitmap` with an `<img>` fallback. */
  decode?: DecodeSource
}

/**
 * Validates and compresses one image file. GIFs under the ceiling are kept
 * byte-for-byte so animations survive; everything else becomes a JPEG.
 */
export async function processImage(
  file: File,
  options: ProcessOptions = {},
): Promise<Result<ProcessedMedia>> {
  if (!isAllowedMediaMime(file.type)) {
    return { ok: false, error: `${file.name}: unsupported file type.` }
  }
  const sizeError = validateMediaSize(file.size)
  if (sizeError) return { ok: false, error: `${file.name}: ${sizeError}` }

  if (file.type === 'image/gif') {
    if (file.size > MAX_MEDIA_COMPRESSED_BYTES) {
      return { ok: false, error: `${file.name}: GIF is too large (max 700 KB).` }
    }
    const dataUrl = await readAsDataUrl(file)
    return {
      ok: true,
      value: {
        name: file.name,
        mime: 'image/gif',
        width: 0,
        height: 0,
        bytes: file.size,
        dataUrl,
      },
    }
  }

  const encode = options.encode ?? encodeAsJpeg
  const decode = options.decode ?? decodeSource

  let source: DecodedSource
  try {
    source = await decode(file)
  } catch {
    return { ok: false, error: `${file.name}: this image could not be decoded.` }
  }

  const original = { width: source.width, height: source.height }
  let maxDimension = MAX_DIMENSION
  let best: EncodedImage | null = null

  try {
    for (let pass = 0; pass < MAX_DIMENSION_PASSES; pass += 1) {
      for (const quality of COMPRESSION_QUALITIES) {
        const attempt = await encode(original, source.drawable, {
          maxDimension,
          quality,
          createCanvas: options.createCanvas,
        })
        if (!best || attempt.blob.size < best.blob.size) best = attempt
        if (attempt.blob.size <= MEDIA_BUDGET.targetBytes) {
          return toAsset(file, attempt.blob, attempt.width, attempt.height, 'image/jpeg')
        }
      }
      maxDimension = Math.max(MIN_DIMENSION, Math.round(maxDimension * 0.75))
    }
  } finally {
    source.close()
  }

  if (best && best.blob.size <= MEDIA_BUDGET.hardCeilingBytes) {
    return toAsset(file, best.blob, best.width, best.height, 'image/jpeg')
  }
  return { ok: false, error: `${file.name}: image could not be compressed enough.` }
}

async function toAsset(
  file: File,
  blob: Blob,
  width: number,
  height: number,
  mime: MediaMime,
): Promise<Result<ProcessedMedia>> {
  const dataUrl = await blobToDataUrl(blob)
  return {
    ok: true,
    value: {
      name: file.name || `${baseName('upload')}.jpg`,
      mime,
      width,
      height,
      bytes: dataUrlBytes(dataUrl),
      dataUrl,
    },
  }
}

export interface ProcessBatchOptions extends ProcessOptions {
  currentCount?: number
  onProgress?: (done: number, total: number) => void
}

export interface ProcessBatchResult {
  assets: ProcessedMedia[]
  errors: string[]
  /** Files skipped because the library had no room left. */
  skipped: number
}

/**
 * Sequential by design: one decode/compress at a time keeps peak memory low on
 * phones and makes the per-file error list deterministic.
 */
export async function processImageBatch(
  files: readonly File[],
  options: ProcessBatchOptions = {},
): Promise<ProcessBatchResult> {
  const existing = options.currentCount ?? 0
  const capacityError = validateLibraryCapacity(existing)
  const assets: ProcessedMedia[] = []
  const errors: string[] = []
  let skipped = 0

  for (const [index, file] of files.entries()) {
    if (assets.length >= MAX_MEDIA_ASSETS_TOTAL - existing) {
      skipped += 1
      errors.push(capacityError ?? 'Media library is full.')
      continue
    }
    const result = await processImage(file, options)
    if (result.ok) assets.push(result.value)
    else errors.push(result.error)
    options.onProgress?.(index + 1, files.length)
    await sleep(0)
  }

  return { assets, errors, skipped }
}
