import { computed, type ComputedRef, type ShallowRef } from 'vue'
import { useBreakpoints, useWindowSize } from '@vueuse/core'

/** Tailwind-aligned breakpoints: 360/390/430 phones, 768 tablet, 1024 desktop, 1280 wide. */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const

export interface Breakpoint {
  width: ShallowRef<number>
  height: ShallowRef<number>
  /** `< 768` — bottom nav, full-screen composer, agenda calendar. */
  isMobile: ComputedRef<boolean>
  /** `768 – 1023` — icon rail, centered composer modal. */
  isTablet: ComputedRef<boolean>
  /** `>= 1024` — sidebar navigation, month/week calendar. */
  isDesktop: ComputedRef<boolean>
  isWide: ComputedRef<boolean>
}

export function useBreakpoint(): Breakpoint {
  const breakpoints = useBreakpoints(BREAKPOINTS)
  const { width, height } = useWindowSize()

  const isMobile = computed(() => width.value < BREAKPOINTS.md)
  const isTablet = computed(() => width.value >= BREAKPOINTS.md && width.value < BREAKPOINTS.lg)
  const isDesktop = computed(() => width.value >= BREAKPOINTS.lg)
  const isWide = computed(() => breakpoints.greaterOrEqual('xl').value)

  return {
    width,
    height,
    isMobile,
    isTablet,
    isDesktop,
    isWide,
  }
}
