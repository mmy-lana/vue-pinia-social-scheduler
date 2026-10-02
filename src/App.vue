<script setup lang="ts">
/**
 * Application root: the storage warning, the app shell that owns the routed
 * view, and the two global hosts — confirmations and toasts — that must live
 * above every route so a dialog can interrupt one.
 */
import { computed } from 'vue'
import AppShell from '@/components/shell/AppShell.vue'
import BaseBanner from '@/components/ui/BaseBanner.vue'
import BaseToastHost from '@/components/ui/BaseToastHost.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { useUiStore } from '@/stores/useUiStore'

const ui = useUiStore()

const showStorageBanner = computed(() => ui.storageBlocked)
</script>

<template>
  <div class="min-h-dvh bg-canvas text-ink" data-testid="app-root">
    <BaseBanner
      v-if="showStorageBanner"
      tone="warn"
      title="Storage is unavailable"
      description="Your changes will be lost when you close this tab. Private browsing or blocked site data usually causes this."
      data-testid="storage-banner"
      @dismiss="ui.dismissStorageBanner()"
    />

    <AppShell />

    <ConfirmDialog />
    <BaseToastHost />
  </div>
</template>