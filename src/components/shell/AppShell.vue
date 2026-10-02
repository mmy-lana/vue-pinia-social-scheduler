<script setup lang="ts">
/**
 * The persistent layout every route renders into.
 *
 * Three shapes, from the responsive contract:
 *   • < 768 px   — single column, bottom nav, composer as a full-screen sheet.
 *   • ≥ 768 px   — 72 px icon rail, composer as a centred modal.
 *   • ≥ 1024 px  — 264 px sidebar.
 *   • ≥ 1280 px  — plus the 320 px "Next up" rail.
 *
 * The routed view sits in a `<Suspense>` so a lazy chunk shows the page-shaped
 * skeleton instead of a blank screen, and the layout never reflows when it
 * arrives. `ComposerSheet` and `MoreSheet` live here rather than on a page,
 * because both are reachable from anywhere.
 *
 * The shell is also the app's error boundary. A dropped connection during a
 * lazy chunk fetch leaves `<Suspense>` pending forever: the skeleton spins and
 * nothing ever says why. `onErrorCaptured` turns that into an explicit message
 * with a retry, instead of a page that silently never finishes loading.
 */
import { computed, onErrorCaptured, ref } from 'vue'
import { RouterView } from 'vue-router'
import BaseBanner from '@/components/ui/BaseBanner.vue'
import BottomNav from '@/components/shell/BottomNav.vue'
import ComposerSheet from '@/components/composer/ComposerSheet.vue'
import MoreSheet from '@/components/shell/MoreSheet.vue'
import PageSkeleton from '@/components/shell/PageSkeleton.vue'
import RightRail from '@/components/shell/RightRail.vue'
import SidebarNav from '@/components/shell/SidebarNav.vue'
import TopBar from '@/components/shell/TopBar.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'

const { isMobile, isDesktop, isWide } = useBreakpoint()

/** 768–1023 px: keep navigation present but give the content the width. */
const isTablet = computed<boolean>(() => !isMobile.value && !isDesktop.value)

/** Set when a route or its lazy chunk failed to load. */
const routeError = ref<string | null>(null)

/**
 * Chunk-load failures are the common case here and are usually transient: a
 * dropped connection or a deploy that invalidated a cached chunk. Anything else
 * is reported without guessing at its cause.
 */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message)) {
    return 'A page could not be downloaded. Check your connection and try again.'
  }
  return 'This page failed to load.'
}

onErrorCaptured((error) => {
  routeError.value = describe(error)
  // Handled here; without this Vue logs it and the boundary re-throws.
  return false
})

function retryRoute(): void {
  routeError.value = null
  window.location.reload()
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-canvas" data-testid="app-shell">
    <div class="flex min-h-dvh flex-1">
      <aside
        v-if="isDesktop"
        class="w-64 shrink-0 border-e border-line bg-surface"
        data-testid="app-shell-sidebar"
      >
        <SidebarNav />
      </aside>

      <aside
        v-else-if="isTablet"
        class="w-[72px] shrink-0 border-e border-line bg-surface"
        data-testid="app-shell-rail"
      >
        <SidebarNav compact />
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <TopBar />

        <main class="flex-1 overflow-x-hidden" data-testid="app-shell-main">
          <BaseBanner
            v-if="routeError !== null"
            tone="danger"
            title="This page could not be loaded"
            :description="routeError"
            :action="'Retry Loading'"
            data-testid="route-error-banner"
            @action="retryRoute"
          />

          <Suspense>
            <RouterView v-slot="{ Component }">
              <component :is="Component" />
            </RouterView>
            <template #fallback>
              <PageSkeleton />
            </template>
          </Suspense>
        </main>

        <BottomNav v-if="isMobile" />
      </div>

      <RightRail v-if="isWide" />
    </div>

    <MoreSheet />
    <ComposerSheet />
  </div>
</template>