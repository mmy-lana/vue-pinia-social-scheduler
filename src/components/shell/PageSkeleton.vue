<script setup lang="ts">
/**
 * Suspense fallback for a lazily-loaded route.
 *
 * It mirrors the real layout — page heading, a stat row, then cards — so the
 * swap when the chunk arrives does not shift the page. Every block is
 * `aria-hidden`, because a screen reader should hear the page that follows, not
 * a description of a placeholder.
 */
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-6 md:px-6" data-testid="page-skeleton">
    <BaseSkeleton variant="text" class="h-7 w-48" />

    <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <BaseSkeleton v-for="index in 4" :key="index" variant="card" class="h-20" />
    </div>

    <div class="mt-5 flex flex-col gap-4">
      <BaseSkeleton v-for="index in 3" :key="index" variant="card" class="h-32" />
    </div>
  </div>
</template>