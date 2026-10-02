/**
 * Test environment shims.
 *
 * happy-dom implements the DOM but not every browser API the app relies on.
 * Anything missing is filled in with the real browser behavior, so no component
 * or store has to be tested against a hand-written fake.
 */

if (typeof globalThis.matchMedia !== 'function') {
  globalThis.matchMedia = ((query: string) => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    return {
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
      addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
      dispatchEvent: () => false,
    } as unknown as MediaQueryList
  }) as typeof globalThis.matchMedia
}

if (typeof globalThis.ResizeObserver !== 'function') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof globalThis.ResizeObserver
}

if (typeof globalThis.IntersectionObserver !== 'function') {
  globalThis.IntersectionObserver = class {
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds: readonly number[] = []
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  } as unknown as typeof globalThis.IntersectionObserver
}

if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {}
}

if (typeof Element.prototype.setPointerCapture !== 'function') {
  Element.prototype.setPointerCapture = function setPointerCapture(): void {}
  Element.prototype.releasePointerCapture = function releasePointerCapture(): void {}
  Element.prototype.hasPointerCapture = function hasPointerCapture(): boolean {
    return false
  }
}
